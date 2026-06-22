import { NextResponse } from 'next/server';
import { verifyAuth } from '@/lib/auth';
import { ensureCollectionsTables } from '@/lib/collections';
import { ensureCallVerificationTable } from '@/lib/callVerification';
import { logActivity, withOpsDbTransaction } from '@/lib/opsDb';

const CATEGORIES = new Set([
  'report_not_uploaded',
  'extension_mapping_issue',
  'called_number_differs',
  'outside_matching_window',
  'call_missing_from_report',
  'status_mismatch',
  'import_system_issue',
  'other',
]);
const EXPLAINABLE_STATES = new Set(['pending', 'mapping_required', 'unverified', 'outcome_mismatch']);

function wordCount(value: string) {
  return value.trim().split(/\s+/).filter(Boolean).length;
}

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const session = await verifyAuth();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  try {
    await ensureCollectionsTables();
    await ensureCallVerificationTable();
    const verificationId = Number((await context.params).id);
    if (!Number.isInteger(verificationId)) {
      return NextResponse.json({ error: 'Invalid verification ID.' }, { status: 400 });
    }
    const body = await request.json();
    const category = String(body.category || '');
    const notes = String(body.notes || '').trim();
    if (!CATEGORIES.has(category)) {
      return NextResponse.json({ error: 'Select a valid explanation category.' }, { status: 400 });
    }
    if (wordCount(notes) < 15) {
      return NextResponse.json({ error: 'Explanation notes must contain at least 15 words.' }, { status: 400 });
    }

    const explanation = await withOpsDbTransaction(async client => {
      const verification = await client.query(
        `SELECT v.*,a.case_id,a.agent_email
         FROM ops_call_verifications v
         JOIN ops_collection_attempts a ON a.id=v.collection_attempt_id
         WHERE v.id=$1 AND v.work_type='collection'
         FOR UPDATE`,
        [verificationId]
      );
      const row = verification.rows[0];
      if (!row) throw Object.assign(new Error('Collection verification was not found.'), { status: 404 });
      if (String(row.agent_email).toLowerCase() !== session.email.toLowerCase()) {
        throw Object.assign(new Error('Only the agent who made this attempt can explain it.'), { status: 403 });
      }
      if (!EXPLAINABLE_STATES.has(row.state)) {
        throw Object.assign(new Error('This call is already verified and does not require an explanation.'), { status: 409 });
      }
      const inserted = await client.query(
        `INSERT INTO ops_call_verification_explanations
         (verification_id,collection_attempt_id,author_email,verification_state,category,notes)
         VALUES ($1,$2,$3,$4,$5,$6)
         RETURNING *`,
        [verificationId, row.collection_attempt_id, session.email, row.state, category, notes]
      );
      await client.query(
        `INSERT INTO ops_collection_events (case_id,actor_email,event_type,details)
         VALUES ($1,$2,'call_verification_explained',$3::jsonb)`,
        [row.case_id, session.email, JSON.stringify({
          verificationId,
          collectionAttemptId: Number(row.collection_attempt_id),
          verificationState: row.state,
          category,
          explanationId: Number(inserted.rows[0].id),
        })]
      );
      return inserted.rows[0];
    });
    await logActivity(session.email, 'explain_call_verification', String(verificationId), request);
    return NextResponse.json({ success: true, explanation });
  } catch (error: any) {
    return NextResponse.json(
      { error: error.message || 'The verification explanation could not be saved.' },
      { status: Number(error.status) || 500 }
    );
  }
}
