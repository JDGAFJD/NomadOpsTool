import { NextResponse } from 'next/server';
import { verifyAuth } from '@/lib/auth';
import { ensureCallVerificationTable } from '@/lib/callVerification';
import { ensureCollectionsTables } from '@/lib/collections';
import { isCallVerificationEnabled } from '@/lib/features';
import { logActivity, queryOpsDb, withOpsDbTransaction } from '@/lib/opsDb';

export const dynamic = 'force-dynamic';

const OUTCOMES = new Set(['completed', 'left_voicemail', 'no_answer']);

function wordCount(value: string) {
  return value.trim().split(/\s+/).filter(Boolean).length;
}

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const session = await verifyAuth();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  try {
    await ensureCollectionsTables();
    if (isCallVerificationEnabled()) await ensureCallVerificationTable();

    const id = Number((await context.params).id);
    if (!Number.isInteger(id)) return NextResponse.json({ error: 'Invalid case ID.' }, { status: 400 });

    const body = await request.json();
    const requestedAttemptAt = new Date(String(body.requestedAttemptAt || ''));
    const outcome = String(body.outcome || '').trim();
    const calledPhone = String(body.calledPhone || '').trim();
    const notes = String(body.notes || '').trim();
    const lateEntryReason = String(body.lateEntryReason || '').trim();
    const invoiceId = String(body.invoiceId || '').trim() || null;

    if (Number.isNaN(requestedAttemptAt.getTime())) {
      return NextResponse.json({ error: 'Enter the actual call date and time.' }, { status: 400 });
    }
    if (requestedAttemptAt.getTime() > Date.now() + 5 * 60 * 1000) {
      return NextResponse.json({ error: 'The missed call time cannot be in the future.' }, { status: 400 });
    }
    if (!OUTCOMES.has(outcome)) {
      return NextResponse.json({ error: 'Select a valid call outcome.' }, { status: 400 });
    }
    if (calledPhone.replace(/\D/g, '').length < 7) {
      return NextResponse.json({ error: 'Enter the number that was called.' }, { status: 400 });
    }
    if (!notes) return NextResponse.json({ error: 'Attempt notes are required.' }, { status: 400 });
    if (wordCount(lateEntryReason) < 15) {
      return NextResponse.json({ error: 'The late-entry reason must be at least 15 words.' }, { status: 400 });
    }

    const missedAttempt = await withOpsDbTransaction(async client => {
      const caseResult = await client.query(
        `SELECT c.*,
          COALESCE((
            SELECT json_agg(i ORDER BY i.paid_at DESC NULLS LAST)
            FROM ops_collection_invoices i WHERE i.case_id=c.id
          ), '[]'::json) AS invoices
         FROM ops_collection_cases c WHERE c.id=$1 FOR UPDATE`,
        [id]
      );
      const collectionCase = caseResult.rows[0];
      if (!collectionCase) throw new Error('Case not found.');
      const paidInvoices = (collectionCase.invoices || []).filter((invoice: any) =>
        invoice.paid_at && Number(invoice.amount_due || 0) === 0 && Number(invoice.amount_paid || 0) > 0
      );
      if (!paidInvoices.length) {
        const error = new Error('This case does not have a Chargebee-confirmed paid invoice yet.');
        (error as any).status = 400;
        throw error;
      }
      if (invoiceId && !paidInvoices.some((invoice: any) => String(invoice.invoice_id) === invoiceId)) {
        const error = new Error('The selected invoice is not a paid invoice on this collection case.');
        (error as any).status = 400;
        throw error;
      }

      const insert = await client.query(
        `INSERT INTO ops_collection_missed_attempt_requests (
           case_id,invoice_id,submitting_agent_email,requested_attempt_at,outcome,
           called_phone,notes,late_entry_reason
         ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
         RETURNING *`,
        [id, invoiceId, session.email, requestedAttemptAt, outcome, calledPhone, notes, lateEntryReason]
      );
      await client.query(
        `INSERT INTO ops_collection_events (case_id,actor_email,event_type,details)
         VALUES ($1,$2,'missed_attempt_submitted',$3::jsonb)`,
        [id, session.email, JSON.stringify({
          requestId: Number(insert.rows[0].id),
          invoiceId,
          requestedAttemptAt: requestedAttemptAt.toISOString(),
          outcome,
          calledPhone,
        })]
      );
      return insert.rows[0];
    });

    await logActivity(session.email, 'collection_missed_attempt_submitted', String(id), request);
    return NextResponse.json({ success: true, request: missedAttempt }, { status: 201 });
  } catch (error: any) {
    console.error('Missed collection attempt submission failed:', error);
    return NextResponse.json(
      { error: error?.message || 'The missed attempt request could not be submitted.' },
      { status: Number(error?.status) || (error?.message === 'Case not found.' ? 404 : 500) }
    );
  }
}
