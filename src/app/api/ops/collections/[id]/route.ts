import { after, NextResponse } from 'next/server';
import { verifyAuth } from '@/lib/auth';
import { processCollectionEmailJob } from '@/lib/collectionEmailJobs';
import { createCallVerification, ensureCallVerificationTable, processCallVerification } from '@/lib/callVerification';
import { ensureCollectionsTables, followUpWindow, nextCollectionWindow } from '@/lib/collections';
import { isCallVerificationEnabled, isTwilioCallVerificationMode } from '@/lib/features';
import { logActivity, queryOpsDb, withOpsDbTransaction } from '@/lib/opsDb';

const REASONS = ['insufficient_funds','expired_replaced_card','bank_decline','payday_timing','forgot','billing_dispute','financial_hardship','technical_issue','refused_payment','promised_later','other'];
const MISSED_ACTIONS = ['left_voicemail', 'no_answer'];

export const maxDuration = 120;

class RequestError extends Error {
  constructor(message: string, public status: number) {
    super(message);
  }
}

function nextCaseState(attemptNumber: number, collected: boolean) {
  if (collected) {
    return {
      status: 'awaiting_payment_confirmation',
      nextAttempt: nextCollectionWindow(new Date()),
      closeReason: null,
    };
  }
  if (attemptNumber >= 3) {
    return { status: 'exhausted', nextAttempt: null, closeReason: 'Attempts exhausted' };
  }
  return {
    status: 'follow_up_pending',
    nextAttempt: followUpWindow(new Date(), attemptNumber + 1),
    closeReason: null,
  };
}

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  const session = await verifyAuth();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  try {
    await ensureCollectionsTables();
    const id = Number((await context.params).id);
    if (!Number.isInteger(id)) return NextResponse.json({ error: 'Invalid case ID' }, { status: 400 });
    const body = await request.json();
    const action = String(body.action || '');

    if (action === 'claim') {
      const result = await queryOpsDb(
        `UPDATE ops_collection_cases SET status='assigned', assigned_to=$1, assigned_at=NOW(),
         next_attempt_at=NOW(), updated_at=NOW() WHERE id=$2 AND status='unassigned' RETURNING *`,
        [session.email, id]
      );
      if (!result.rows[0]) return NextResponse.json({ error: 'Case already claimed.' }, { status: 409 });
      await queryOpsDb(
        `INSERT INTO ops_collection_events (case_id,actor_email,event_type,details)
         VALUES ($1,$2,'claimed',$3::jsonb)`,
        [id, session.email, JSON.stringify({ attemptDue: new Date().toISOString() })]
      );
      await logActivity(session.email, 'claim_collection_case', String(id), request);
      return NextResponse.json({ success: true, case: result.rows[0] });
    }

    if (action === 'no_valid_contact') {
      const closed = await withOpsDbTransaction(async client => {
        const result = await client.query('SELECT * FROM ops_collection_cases WHERE id=$1 FOR UPDATE', [id]);
        const row = result.rows[0];
        if (!row) throw new RequestError('Case not found.', 404);
        if (row.assigned_to && row.assigned_to !== session.email && session.role !== 'admin') {
          throw new RequestError('Only the case owner or an administrator can close this case.', 403);
        }
        if (!['unassigned','assigned','follow_up_pending','awaiting_payment_confirmation','paused'].includes(row.status)) {
          throw new RequestError(`This case is already ${row.status}.`, 409);
        }
        if (String(row.customer_phone || '').replace(/\D/g, '').length >= 7) {
          throw new RequestError('This case has a valid phone number. Use the normal call attempt flow.', 400);
        }
        const updated = await client.query(
          `UPDATE ops_collection_cases SET
             status='no_valid_contact',
             assigned_to=COALESCE(assigned_to,$2),
             assigned_at=COALESCE(assigned_at,NOW()),
             next_attempt_at=NULL,
             close_reason='No valid contact number found in Chargebee or Shopify',
             updated_at=NOW()
           WHERE id=$1
           RETURNING *`,
          [id, session.email]
        );
        await client.query(
          `INSERT INTO ops_collection_events (case_id,actor_email,event_type,details)
           VALUES ($1,$2,'closed_no_valid_contact',$3::jsonb)`,
          [id, session.email, JSON.stringify({
            message: 'Closed because no valid customer phone number was available after Shopify lookup.',
          })]
        );
        return updated.rows[0];
      });
      await logActivity(session.email, 'collection_no_valid_contact', String(id), request);
      return NextResponse.json({ success: true, case: closed });
    }

    if (!['completed', ...MISSED_ACTIONS].includes(action)) {
      return NextResponse.json({ error: 'Invalid action.' }, { status: 400 });
    }
    const notes = String(body.notes || '').trim();
    if (!notes) return NextResponse.json({ error: 'Attempt notes are required.' }, { status: 400 });
    const verificationEnabled = isCallVerificationEnabled();
    const phoneSource = verificationEnabled ? String(body.phoneSource || '') : '';
    const manualPhone = verificationEnabled ? String(body.calledPhone || '').trim() : '';
    if (verificationEnabled) {
      if (!['on_file', 'different'].includes(phoneSource)) {
        return NextResponse.json({ error: 'Select the number that was called.' }, { status: 400 });
      }
      if (phoneSource === 'different' && manualPhone.replace(/\D/g, '').length < 7) {
        return NextResponse.json({ error: 'Enter a valid called number.' }, { status: 400 });
      }
    }
    if (verificationEnabled) await ensureCallVerificationTable();

    if (MISSED_ACTIONS.includes(action)) {
      const requestKey = String(body.requestKey || '').trim();
      if (!requestKey || requestKey.length > 100) {
        return NextResponse.json({ error: 'A valid request key is required.' }, { status: 400 });
      }

      const queued = await withOpsDbTransaction(async client => {
        await client.query('SELECT pg_advisory_xact_lock(hashtext($1))', [requestKey]);
        const duplicate = await client.query(
          `SELECT j.id AS job_id, j.status AS job_status, a.case_id
           FROM ops_collection_email_jobs j
           JOIN ops_collection_attempts a ON a.id=j.attempt_id
           WHERE j.client_request_key=$1 AND j.agent_email=$2
           LIMIT 1`,
          [requestKey, session.email]
        );
        if (duplicate.rows[0]) {
          if (Number(duplicate.rows[0].case_id) !== id) {
            throw new RequestError('This request key belongs to another collection case.', 409);
          }
          return {
            duplicate: true,
            jobId: Number(duplicate.rows[0].job_id),
            jobStatus: duplicate.rows[0].job_status,
            case: null,
          };
        }

        const result = await client.query(
          `SELECT c.*, COALESCE((
             SELECT json_agg(i ORDER BY i.failure_date DESC)
             FROM ops_collection_invoices i WHERE i.case_id=c.id
           ), '[]'::json) invoices
           FROM ops_collection_cases c
           WHERE c.id=$1
           FOR UPDATE`,
          [id]
        );
        const row = result.rows[0];
        if (!row) throw new RequestError('Case not found.', 404);
        if (row.assigned_to !== session.email) throw new RequestError('Only the case owner can update it.', 403);
        if (Number(row.current_attempt) >= 3) throw new RequestError('This case has exhausted all attempts.', 409);
        if (!row.customer_email) throw new RequestError('Customer email is unavailable.', 400);
        const selectedPhone = verificationEnabled
          ? (phoneSource === 'on_file' ? row.customer_phone : manualPhone)
          : '';
        if (verificationEnabled && !selectedPhone) throw new RequestError('A called phone number is required.', 400);

        const attemptNumber = Number(row.current_attempt) + 1;
        const state = nextCaseState(attemptNumber, false);
        const attempt = await client.query(
          `INSERT INTO ops_collection_attempts (
             case_id,attempt_number,agent_email,outcome,notes,collected,scheduled_for,
             client_request_key,email_delivery_status
           ) VALUES ($1,$2,$3,$4,$5,false,$6,$7,'queued')
           RETURNING *`,
          [id, attemptNumber, session.email, action, notes, row.next_attempt_at, requestKey]
        );
        const latestInvoice = row.invoices?.[0];
        const job = await client.query(
          `INSERT INTO ops_collection_email_jobs (
             case_id,attempt_id,client_request_key,agent_email,customer_email,subject,payload,
             freescout_conversation_id
           ) VALUES ($1,$2,$3,$4,$5,$6,$7::jsonb,$8)
           RETURNING *`,
          [
            id,
            attempt.rows[0].id,
            requestKey,
            session.email,
            row.customer_email,
            'Nomad Internet payment follow-up',
            JSON.stringify({
              customerId: row.customer_id,
              customerName: row.customer_name,
              amountDue: Number(row.total_amount_due),
              currencyCode: row.currency_code || 'USD',
              invoiceId: latestInvoice?.invoice_id || null,
            }),
            row.latest_freescout_conversation_id,
          ]
        );
        const verification = verificationEnabled
          ? await createCallVerification(client, {
              workType: 'collection',
              collectionAttemptId: Number(attempt.rows[0].id),
              agentEmail: session.email,
              reportedOutcome: action,
              selectedPhone,
              phoneSource,
            })
          : null;
        const updated = await client.query(
          `UPDATE ops_collection_cases SET
             status=$1,current_attempt=$2,next_attempt_at=$3,awaiting_amount=NULL,
             close_reason=$4,updated_at=NOW()
           WHERE id=$5 RETURNING *`,
          [state.status, attemptNumber, state.nextAttempt, state.closeReason, id]
        );
        await client.query(
          `INSERT INTO ops_collection_events (case_id,actor_email,event_type,details)
           VALUES ($1,$2,$3,$4::jsonb)`,
          [id, session.email, `attempt_${action}`, JSON.stringify({
            attemptNumber,
            notes,
            nextAttemptAt: state.nextAttempt?.toISOString() || null,
            emailJobId: Number(job.rows[0].id),
            emailDeliveryStatus: 'queued',
            calledPhone: selectedPhone || null,
            phoneSource: phoneSource || null,
            verificationId: verification?.id || null,
            verificationState: verification ? 'pending' : null,
          })]
        );
        return {
          duplicate: false,
          jobId: Number(job.rows[0].id),
          jobStatus: 'queued',
          verificationId: verification ? Number(verification.id) : null,
          case: updated.rows[0],
        };
      });

      after(async () => {
        await Promise.allSettled([
          processCollectionEmailJob(queued.jobId),
          queued.verificationId && isTwilioCallVerificationMode()
            ? processCallVerification(queued.verificationId)
            : Promise.resolve(),
          logActivity(session.email, `collection_${action}`, String(id), request),
        ]);
      });
      return NextResponse.json(
        {
          success: true,
          queued: true,
          duplicate: queued.duplicate,
          job: { id: queued.jobId, status: queued.jobStatus },
          verification: queued.verificationId ? { id: queued.verificationId, state: 'pending' } : null,
          case: queued.case,
        },
        { status: 202 }
      );
    }

    const collected = Boolean(body.collected);
    const claimedAmount = collected ? Math.round(Number(body.claimedAmount) * 100) : null;
    const reasonCategory = String(body.reasonCategory || '');
    if (!REASONS.includes(reasonCategory)) {
      return NextResponse.json({ error: 'Select a valid payment reason.' }, { status: 400 });
    }
    if (collected && (!Number.isFinite(claimedAmount) || Number(claimedAmount) <= 0)) {
      return NextResponse.json({ error: 'Enter the amount collected.' }, { status: 400 });
    }

    const completed = await withOpsDbTransaction(async client => {
      const result = await client.query('SELECT * FROM ops_collection_cases WHERE id=$1 FOR UPDATE', [id]);
      const row = result.rows[0];
      if (!row) throw new RequestError('Case not found.', 404);
      if (row.assigned_to !== session.email) throw new RequestError('Only the case owner can update it.', 403);
      if (Number(row.current_attempt) >= 3) throw new RequestError('This case has exhausted all attempts.', 409);
      const selectedPhone = verificationEnabled
        ? (phoneSource === 'on_file' ? row.customer_phone : manualPhone)
        : '';
      if (verificationEnabled && !selectedPhone) throw new RequestError('A called phone number is required.', 400);

      const attemptNumber = Number(row.current_attempt) + 1;
      const state = nextCaseState(attemptNumber, collected);
      const attempt = await client.query(
        `INSERT INTO ops_collection_attempts (
           case_id,attempt_number,agent_email,outcome,notes,collected,claimed_amount,reason_category,scheduled_for
         ) VALUES ($1,$2,$3,'completed',$4,$5,$6,$7,$8)
         RETURNING *`,
        [id, attemptNumber, session.email, notes, collected, claimedAmount, reasonCategory, row.next_attempt_at]
      );
      const verification = verificationEnabled
        ? await createCallVerification(client, {
            workType: 'collection',
            collectionAttemptId: Number(attempt.rows[0].id),
            agentEmail: session.email,
            reportedOutcome: 'completed',
            selectedPhone,
            phoneSource,
          })
        : null;
      const updated = await client.query(
        `UPDATE ops_collection_cases SET status=$1,current_attempt=$2,next_attempt_at=$3,awaiting_amount=$4,
         close_reason=$5,updated_at=NOW() WHERE id=$6 RETURNING *`,
        [state.status, attemptNumber, state.nextAttempt, claimedAmount, state.closeReason, id]
      );
      await client.query(
        `INSERT INTO ops_collection_events (case_id,actor_email,event_type,details)
         VALUES ($1,$2,'attempt_completed',$3::jsonb)`,
        [id, session.email, JSON.stringify({
          attemptNumber,
          notes,
          collected,
          claimedAmount,
          reasonCategory,
          calledPhone: selectedPhone || null,
          phoneSource: phoneSource || null,
          verificationId: verification?.id || null,
          verificationState: verification ? 'pending' : null,
          nextAttemptAt: state.nextAttempt?.toISOString() || null,
        })]
      );
      return { case: updated.rows[0], verificationId: verification ? Number(verification.id) : null };
    });
    await logActivity(session.email, 'collection_completed', String(id), request);
    const completedVerificationId = completed.verificationId;
    if (completedVerificationId && isTwilioCallVerificationMode()) {
      after(() => processCallVerification(completedVerificationId));
    }
    return NextResponse.json({
      success: true,
      case: completed.case,
      verification: completed.verificationId ? { id: completed.verificationId, state: 'pending' } : null,
    });
  } catch (error: any) {
    console.error('Collection attempt update failed:', error);
    const status = error instanceof RequestError ? error.status : 500;
    return NextResponse.json(
      { error: error?.message || 'The collection attempt could not be saved.' },
      { status }
    );
  }
}
