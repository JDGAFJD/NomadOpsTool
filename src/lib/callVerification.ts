import type { PoolClient } from 'pg';
import { queryOpsDb } from '@/lib/opsDb';
import { TwilioService, type TwilioCall } from '@/lib/services/TwilioService';

export type VerificationState = 'pending' | 'verified' | 'outcome_mismatch' | 'unverified';
export type VerificationWorkType = 'callback' | 'collection';

export function phoneMatchKey(value: string | null | undefined) {
  const digits = String(value || '').replace(/\D/g, '');
  return digits.length >= 7 ? digits.slice(-7) : '';
}

export function callMatchesPhone(call: Pick<TwilioCall, 'to' | 'direction'>, phone: string) {
  return call.direction === 'trunking-terminating'
    && Boolean(phoneMatchKey(phone))
    && phoneMatchKey(call.to) === phoneMatchKey(phone);
}

export async function ensureCallVerificationTable() {
  await queryOpsDb(`
    CREATE TABLE IF NOT EXISTS ops_call_verifications (
      id BIGSERIAL PRIMARY KEY,
      work_type TEXT NOT NULL,
      callback_id INTEGER,
      collection_attempt_id BIGINT,
      agent_email TEXT NOT NULL,
      reported_outcome TEXT NOT NULL,
      selected_phone TEXT NOT NULL,
      phone_source TEXT NOT NULL,
      submitted_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      window_start TIMESTAMPTZ NOT NULL,
      window_end TIMESTAMPTZ NOT NULL,
      verification_deadline TIMESTAMPTZ NOT NULL,
      state TEXT NOT NULL DEFAULT 'pending',
      twilio_call_sid TEXT,
      twilio_status TEXT,
      twilio_direction TEXT,
      twilio_from TEXT,
      twilio_to TEXT,
      twilio_start_time TIMESTAMPTZ,
      twilio_end_time TIMESTAMPTZ,
      twilio_duration INTEGER,
      check_count INTEGER NOT NULL DEFAULT 0,
      last_checked_at TIMESTAMPTZ,
      matched_at TIMESTAMPTZ,
      integration_error TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      CHECK (
        (work_type='callback' AND callback_id IS NOT NULL AND collection_attempt_id IS NULL)
        OR
        (work_type='collection' AND callback_id IS NULL AND collection_attempt_id IS NOT NULL)
      )
    )
  `);
  await queryOpsDb(`CREATE UNIQUE INDEX IF NOT EXISTS idx_call_verification_callback ON ops_call_verifications(callback_id) WHERE callback_id IS NOT NULL`);
  await queryOpsDb(`CREATE UNIQUE INDEX IF NOT EXISTS idx_call_verification_collection_attempt ON ops_call_verifications(collection_attempt_id) WHERE collection_attempt_id IS NOT NULL`);
  await queryOpsDb(`CREATE UNIQUE INDEX IF NOT EXISTS idx_call_verification_twilio_sid ON ops_call_verifications(twilio_call_sid) WHERE twilio_call_sid IS NOT NULL`);
  await queryOpsDb(`CREATE INDEX IF NOT EXISTS idx_call_verification_pending ON ops_call_verifications(state, verification_deadline)`);
}

type CreateVerificationInput = {
  workType: VerificationWorkType;
  callbackId?: number;
  collectionAttemptId?: number;
  agentEmail: string;
  reportedOutcome: string;
  selectedPhone: string;
  phoneSource: string;
  submittedAt?: Date;
};

export async function createCallVerification(client: PoolClient, input: CreateVerificationInput) {
  const submittedAt = input.submittedAt || new Date();
  const windowStart = new Date(submittedAt.getTime() - 60 * 60 * 1000);
  const windowEnd = new Date(submittedAt.getTime() + 5 * 60 * 1000);
  const deadline = new Date(submittedAt.getTime() + 30 * 60 * 1000);
  const result = await client.query(
    `INSERT INTO ops_call_verifications (
       work_type,callback_id,collection_attempt_id,agent_email,reported_outcome,
       selected_phone,phone_source,submitted_at,window_start,window_end,verification_deadline
     ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
     ON CONFLICT DO NOTHING
     RETURNING *`,
    [
      input.workType,
      input.callbackId || null,
      input.collectionAttemptId || null,
      input.agentEmail,
      input.reportedOutcome,
      input.selectedPhone,
      input.phoneSource,
      submittedAt,
      windowStart,
      windowEnd,
      deadline,
    ]
  );
  return result.rows[0] || null;
}

function closestCall(calls: TwilioCall[], phone: string, submittedAt: Date) {
  const finalStatuses = new Set(['completed', 'busy', 'failed', 'no-answer', 'canceled']);
  return calls
    .filter(call => callMatchesPhone(call, phone) && finalStatuses.has(call.status))
    .sort((a, b) => {
      const aTime = new Date(a.startTime || 0).getTime();
      const bTime = new Date(b.startTime || 0).getTime();
      return Math.abs(aTime - submittedAt.getTime()) - Math.abs(bTime - submittedAt.getTime());
    })[0] || null;
}

async function recordVerificationEvent(row: any, state: VerificationState, details: Record<string, unknown>) {
  if (row.work_type === 'callback' && row.callback_id) {
    await queryOpsDb(
      `INSERT INTO ops_callback_events (callback_id,actor_email,event_type,details)
       VALUES ($1,'twilio',$2,$3::jsonb)`,
      [row.callback_id, `call_verification_${state}`, JSON.stringify(details)]
    );
    return;
  }
  if (row.work_type === 'collection' && row.collection_attempt_id) {
    await queryOpsDb(
      `INSERT INTO ops_collection_events (case_id,actor_email,event_type,details)
       SELECT a.case_id,'twilio',$2,$3::jsonb
       FROM ops_collection_attempts a WHERE a.id=$1`,
      [row.collection_attempt_id, `call_verification_${state}`, JSON.stringify({
        ...details,
        collectionAttemptId: Number(row.collection_attempt_id),
      })]
    );
  }
}

export async function processCallVerification(id: number, prefetchedCalls?: TwilioCall[]) {
  await ensureCallVerificationTable();
  const claimed = await queryOpsDb(
    `UPDATE ops_call_verifications
     SET last_checked_at=NOW(),check_count=check_count+1,updated_at=NOW()
     WHERE id=$1 AND state='pending'
     RETURNING *`,
    [id]
  );
  const row = claimed.rows[0];
  if (!row) return { id, state: 'skipped' as const };

  try {
    const calls = prefetchedCalls || await new TwilioService().listCalls(new Date(row.window_start), new Date(row.window_end));
    const used = await queryOpsDb(
      `SELECT twilio_call_sid FROM ops_call_verifications
       WHERE id<>$1 AND twilio_call_sid IS NOT NULL`,
      [id]
    );
    const usedSids = new Set(used.rows.map(item => item.twilio_call_sid));
    const match = closestCall(calls.filter(call => !usedSids.has(call.sid)), row.selected_phone, new Date(row.submitted_at));
    if (match) {
      const state: VerificationState = row.reported_outcome === 'completed' && match.status !== 'completed'
        ? 'outcome_mismatch'
        : 'verified';
      await queryOpsDb(
        `UPDATE ops_call_verifications SET
           state=$2,twilio_call_sid=$3,twilio_status=$4,twilio_direction=$5,
           twilio_from=$6,twilio_to=$7,twilio_start_time=$8,twilio_end_time=$9,
           twilio_duration=$10,matched_at=NOW(),integration_error=NULL,updated_at=NOW()
         WHERE id=$1`,
        [id, state, match.sid, match.status, match.direction, match.from, match.to,
         match.startTime, match.endTime, match.duration]
      );
      await recordVerificationEvent(row, state, {
        verificationId: id,
        callSid: match.sid,
        twilioStatus: match.status,
        selectedPhone: row.selected_phone,
        duration: match.duration,
      });
      return { id, state, callSid: match.sid };
    }

    const expired = new Date() >= new Date(row.verification_deadline);
    const state: VerificationState = expired ? 'unverified' : 'pending';
    await queryOpsDb(
      `UPDATE ops_call_verifications SET state=$2,integration_error=NULL,updated_at=NOW() WHERE id=$1`,
      [id, state]
    );
    if (state === 'unverified') {
      await recordVerificationEvent(row, state, {
        verificationId: id,
        selectedPhone: row.selected_phone,
        checks: Number(row.check_count),
      });
    }
    return { id, state };
  } catch (error: any) {
    await queryOpsDb(
      `UPDATE ops_call_verifications SET integration_error=$2,updated_at=NOW() WHERE id=$1`,
      [id, error?.message || 'Twilio verification failed.']
    );
    return { id, state: 'pending' as const, error: error?.message };
  }
}

export async function processPendingCallVerifications(limit = 50) {
  await ensureCallVerificationTable();
  const result = await queryOpsDb(
    `SELECT id,window_start,window_end FROM ops_call_verifications
     WHERE state='pending'
       AND (last_checked_at IS NULL OR last_checked_at <= NOW() - INTERVAL '10 minutes')
     ORDER BY submitted_at ASC LIMIT $1`,
    [limit]
  );
  if (!result.rows.length) return { callVerificationsChecked: 0, callVerificationsResolved: 0 };
  let calls: TwilioCall[];
  try {
    const start = new Date(Math.min(...result.rows.map(row => new Date(row.window_start).getTime())));
    const end = new Date(Math.max(...result.rows.map(row => new Date(row.window_end).getTime())));
    calls = await new TwilioService().listCalls(start, end);
  } catch (error: any) {
    await queryOpsDb(
      `UPDATE ops_call_verifications SET
         check_count=check_count+1,last_checked_at=NOW(),integration_error=$2,updated_at=NOW()
       WHERE id = ANY($1::bigint[]) AND state='pending'`,
      [result.rows.map(row => Number(row.id)), error?.message || 'Twilio verification failed.']
    );
    return { callVerificationsChecked: result.rows.length, callVerificationsResolved: 0 };
  }
  const outcomes = [];
  for (const row of result.rows) {
    outcomes.push(await processCallVerification(Number(row.id), calls));
  }
  return {
    callVerificationsChecked: outcomes.length,
    callVerificationsResolved: outcomes.filter(item => ['verified','outcome_mismatch','unverified'].includes(item.state)).length,
  };
}
