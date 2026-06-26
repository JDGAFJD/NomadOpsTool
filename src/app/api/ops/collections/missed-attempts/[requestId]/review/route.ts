import { NextResponse } from 'next/server';
import { verifyAuth } from '@/lib/auth';
import { createCallVerification, ensureCallVerificationTable } from '@/lib/callVerification';
import { ensureCollectionsTables } from '@/lib/collections';
import { isCallVerificationEnabled } from '@/lib/features';
import { logActivity, withOpsDbTransaction } from '@/lib/opsDb';

export const dynamic = 'force-dynamic';

class RequestError extends Error {
  constructor(message: string, public status: number) {
    super(message);
  }
}

export async function POST(request: Request, context: { params: Promise<{ requestId: string }> }) {
  const session = await verifyAuth();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (session.role !== 'admin') return NextResponse.json({ error: 'Administrator access is required.' }, { status: 403 });

  try {
    await ensureCollectionsTables();
    const verificationEnabled = isCallVerificationEnabled();
    if (verificationEnabled) await ensureCallVerificationTable();

    const requestId = Number((await context.params).requestId);
    if (!Number.isInteger(requestId)) return NextResponse.json({ error: 'Invalid request ID.' }, { status: 400 });

    const body = await request.json();
    const action = String(body.action || '').trim();
    const adminNote = String(body.adminNote || '').trim();
    if (!['approve', 'reject'].includes(action)) {
      return NextResponse.json({ error: 'Choose approve or reject.' }, { status: 400 });
    }
    if (!adminNote) return NextResponse.json({ error: 'An admin note is required.' }, { status: 400 });

    const reviewed = await withOpsDbTransaction(async client => {
      const requestResult = await client.query(
        `SELECT m.*,c.customer_phone
         FROM ops_collection_missed_attempt_requests m
         JOIN ops_collection_cases c ON c.id=m.case_id
         WHERE m.id=$1
         FOR UPDATE`,
        [requestId]
      );
      const missed = requestResult.rows[0];
      if (!missed) throw new RequestError('Missed attempt request not found.', 404);
      if (missed.status !== 'pending') throw new RequestError('This missed attempt request was already reviewed.', 409);

      if (action === 'reject') {
        const rejected = await client.query(
          `UPDATE ops_collection_missed_attempt_requests SET
             status='rejected',reviewed_by=$2,admin_note=$3,reviewed_at=NOW(),updated_at=NOW()
           WHERE id=$1 RETURNING *`,
          [requestId, session.email, adminNote]
        );
        await client.query(
          `INSERT INTO ops_collection_events (case_id,actor_email,event_type,details)
           VALUES ($1,$2,'missed_attempt_rejected',$3::jsonb)`,
          [missed.case_id, session.email, JSON.stringify({
            requestId,
            submittingAgentEmail: missed.submitting_agent_email,
            adminNote,
          })]
        );
        return { request: rejected.rows[0], attempt: null, verification: null };
      }

      const invoiceResult = await client.query(
        `SELECT *
         FROM ops_collection_invoices
         WHERE case_id=$1
           AND paid_at IS NOT NULL
           AND amount_due=0
           AND amount_paid>0
           AND ($2::text IS NULL OR invoice_id=$2)
           AND $3::timestamptz >= COALESCE(failure_date,created_at)
           AND $3::timestamptz <= paid_at
         ORDER BY paid_at ASC
         LIMIT 1`,
        [missed.case_id, missed.invoice_id || null, missed.requested_attempt_at]
      );
      const eligibleInvoice = invoiceResult.rows[0];
      if (!eligibleInvoice) {
        throw new RequestError('The requested call time is not before a paid invoice confirmation for this case.', 400);
      }

      const attemptNumberResult = await client.query(
        `SELECT COALESCE(MAX(attempt_number),0)+1 AS next_attempt_number
         FROM ops_collection_attempts WHERE case_id=$1`,
        [missed.case_id]
      );
      const attemptNumber = Number(attemptNumberResult.rows[0]?.next_attempt_number || 1);
      const attemptResult = await client.query(
        `INSERT INTO ops_collection_attempts (
           case_id,attempt_number,agent_email,outcome,notes,collected,claimed_amount,
           reason_category,scheduled_for,created_at
         ) VALUES ($1,$2,$3,$4,$5,$6,$7,'other',NULL,$8)
         RETURNING *`,
        [
          missed.case_id,
          attemptNumber,
          missed.submitting_agent_email,
          missed.outcome,
          `${missed.notes}\n\nLate-entry correction: ${missed.late_entry_reason}`,
          missed.outcome === 'completed',
          missed.outcome === 'completed' ? Number(eligibleInvoice.amount_paid || 0) : null,
          missed.requested_attempt_at,
        ]
      );
      const attempt = attemptResult.rows[0];
      const verification = verificationEnabled
        ? await createCallVerification(client, {
            workType: 'collection',
            collectionAttemptId: Number(attempt.id),
            agentEmail: missed.submitting_agent_email,
            reportedOutcome: missed.outcome,
            selectedPhone: missed.called_phone,
            phoneSource: missed.called_phone === missed.customer_phone ? 'on_file' : 'different',
            submittedAt: new Date(missed.requested_attempt_at),
          })
        : null;
      const approved = await client.query(
        `UPDATE ops_collection_missed_attempt_requests SET
           status='approved',approved_attempt_id=$2,reviewed_by=$3,admin_note=$4,
           reviewed_at=NOW(),updated_at=NOW()
         WHERE id=$1 RETURNING *`,
        [requestId, attempt.id, session.email, adminNote]
      );
      await client.query(
        `INSERT INTO ops_collection_events (case_id,actor_email,event_type,details)
         VALUES ($1,$2,'missed_attempt_approved',$3::jsonb)`,
        [missed.case_id, session.email, JSON.stringify({
          requestId,
          approvedAttemptId: Number(attempt.id),
          attemptNumber,
          submittingAgentEmail: missed.submitting_agent_email,
          requestedAttemptAt: new Date(missed.requested_attempt_at).toISOString(),
          invoiceId: eligibleInvoice.invoice_id,
          verificationId: verification?.id || null,
          adminNote,
        })]
      );
      return { request: approved.rows[0], attempt, verification };
    });

    await logActivity(session.email, `collection_missed_attempt_${action === 'approve' ? 'approved' : 'rejected'}`, String(reviewed.request.case_id), request);
    return NextResponse.json({ success: true, ...reviewed });
  } catch (error: any) {
    console.error('Missed attempt review failed:', error);
    const status = error instanceof RequestError ? error.status : 500;
    return NextResponse.json(
      { error: error?.message || 'The missed attempt request could not be reviewed.' },
      { status }
    );
  }
}
