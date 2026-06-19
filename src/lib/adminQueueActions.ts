import type { PoolClient } from 'pg';
import { withOpsDbTransaction } from '@/lib/opsDb';

export type AdminQueueAction = 'assign' | 'unassign' | 'complete' | 'close';

type QueueKind = 'callback' | 'collection';

type AdminQueueActionInput = {
  kind: QueueKind;
  ids: number[];
  action: AdminQueueAction;
  note: string;
  assignee?: string;
  actor: string;
};

type AdminQueueActionResult = {
  id: number;
  status: 'updated' | 'skipped';
  reason?: string;
  newStatus?: string;
};

const CALLBACK_ACTIVE = ['unassigned', 'assigned'];
const COLLECTION_ACTIVE = ['unassigned', 'assigned', 'follow_up_pending', 'awaiting_payment_confirmation', 'paused'];

export function parseAdminQueueAction(body: any) {
  const ids: number[] = Array.from(new Set<number>(
    (Array.isArray(body?.ids) ? body.ids : [])
      .map(Number)
      .filter((id: number) => Number.isInteger(id) && id > 0)
  )).slice(0, 200);
  const action = String(body?.action || '') as AdminQueueAction;
  const note = String(body?.note || '').trim();
  const assignee = String(body?.assignee || '').trim().toLowerCase();

  if (!ids.length) return { error: 'Select at least one record.' } as const;
  if (!['assign', 'unassign', 'complete', 'close'].includes(action)) {
    return { error: 'Select a valid administrative action.' } as const;
  }
  if (!note) return { error: 'An administrative note is required.' } as const;
  if (action === 'assign' && !assignee) return { error: 'Select an assignee.' } as const;
  return { ids, action, note, assignee } as const;
}

async function validateAssignee(client: PoolClient, assignee?: string) {
  if (!assignee) return true;
  const result = await client.query('SELECT 1 FROM ops_users WHERE LOWER(email) = $1 LIMIT 1', [assignee]);
  return Boolean(result.rows[0]);
}

async function mutateCallback(
  client: PoolClient,
  id: number,
  action: AdminQueueAction,
  note: string,
  assignee: string | undefined,
  actor: string
): Promise<AdminQueueActionResult> {
  const currentResult = await client.query('SELECT * FROM ops_callbacks WHERE id = $1 FOR UPDATE', [id]);
  const current = currentResult.rows[0];
  if (!current) return { id, status: 'skipped', reason: 'Callback not found.' };
  if (!CALLBACK_ACTIVE.includes(current.status)) {
    return { id, status: 'skipped', reason: `Callback is already ${current.status}.` };
  }

  const newStatus = action === 'assign' ? 'assigned'
    : action === 'unassign' ? 'unassigned'
      : action === 'complete' ? 'completed'
        : 'closed_by_admin';
  const result = await client.query(
    `UPDATE ops_callbacks SET
       status = $1,
       assigned_to = CASE WHEN $2 = 'assign' THEN $3 WHEN $2 = 'unassign' THEN NULL ELSE assigned_to END,
       assigned_at = CASE WHEN $2 = 'assign' THEN NOW() WHEN $2 = 'unassign' THEN NULL ELSE assigned_at END,
       completed_at = CASE WHEN $2 IN ('complete','close') THEN NOW() ELSE completed_at END,
       outcome_notes = CASE WHEN $2 IN ('complete','close') THEN $4 ELSE outcome_notes END,
       admin_disposition = $2, admin_actor = $5, admin_note = $4, admin_action_at = NOW(), updated_at = NOW()
     WHERE id = $6 AND status = $7
     RETURNING *`,
    [newStatus, action, assignee || null, note, actor, id, current.status]
  );
  if (!result.rows[0]) return { id, status: 'skipped', reason: 'Callback changed before the update completed.' };
  await client.query(
    `INSERT INTO ops_callback_events (callback_id, actor_email, event_type, details)
     VALUES ($1,$2,$3,$4::jsonb)`,
    [id, actor, `admin_${action}`, JSON.stringify({
      note,
      assignee: assignee || null,
      previousStatus: current.status,
      previousAssignee: current.assigned_to,
      newStatus,
    })]
  );
  return { id, status: 'updated', newStatus };
}

async function mutateCollection(
  client: PoolClient,
  id: number,
  action: AdminQueueAction,
  note: string,
  assignee: string | undefined,
  actor: string
): Promise<AdminQueueActionResult> {
  const currentResult = await client.query('SELECT * FROM ops_collection_cases WHERE id = $1 FOR UPDATE', [id]);
  const current = currentResult.rows[0];
  if (!current) return { id, status: 'skipped', reason: 'Collection case not found.' };
  if (!COLLECTION_ACTIVE.includes(current.status)) {
    return { id, status: 'skipped', reason: `Collection case is already ${current.status}.` };
  }

  const newStatus = action === 'assign'
    ? (current.status === 'unassigned' ? 'assigned' : current.status)
    : action === 'unassign'
      ? (current.status === 'paused' ? 'paused' : 'unassigned')
      : action === 'complete' ? 'completed_by_admin' : 'closed_by_admin';
  const result = await client.query(
    `UPDATE ops_collection_cases SET
       status = $1,
       assigned_to = CASE WHEN $2 = 'assign' THEN $3 WHEN $2 = 'unassign' THEN NULL ELSE assigned_to END,
       assigned_at = CASE WHEN $2 = 'assign' THEN NOW() WHEN $2 = 'unassign' THEN NULL ELSE assigned_at END,
       next_attempt_at = CASE
         WHEN $2 = 'assign' AND status = 'unassigned' THEN NOW()
         WHEN $2 = 'unassign' THEN NULL
         WHEN $2 IN ('complete','close') THEN NULL
         ELSE next_attempt_at
       END,
       close_reason = CASE WHEN $2 IN ('complete','close') THEN $4 ELSE close_reason END,
       admin_disposition = $2, admin_actor = $5, admin_note = $4, admin_action_at = NOW(), updated_at = NOW()
     WHERE id = $6 AND status = $7
     RETURNING *`,
    [newStatus, action, assignee || null, note, actor, id, current.status]
  );
  if (!result.rows[0]) return { id, status: 'skipped', reason: 'Collection case changed before the update completed.' };
  await client.query(
    `INSERT INTO ops_collection_events (case_id, actor_email, event_type, details)
     VALUES ($1,$2,$3,$4::jsonb)`,
    [id, actor, `admin_${action}`, JSON.stringify({
      note,
      assignee: assignee || null,
      previousStatus: current.status,
      previousAssignee: current.assigned_to,
      newStatus,
    })]
  );
  return { id, status: 'updated', newStatus };
}

export async function performAdminQueueAction(input: AdminQueueActionInput) {
  return withOpsDbTransaction(async client => {
    if (input.action === 'assign' && !await validateAssignee(client, input.assignee)) {
      throw new Error('The selected assignee is not an OPS user.');
    }
    const results: AdminQueueActionResult[] = [];
    for (const id of input.ids) {
      results.push(input.kind === 'callback'
        ? await mutateCallback(client, id, input.action, input.note, input.assignee, input.actor)
        : await mutateCollection(client, id, input.action, input.note, input.assignee, input.actor));
    }
    return results;
  });
}
