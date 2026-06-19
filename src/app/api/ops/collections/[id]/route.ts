import { NextResponse } from 'next/server';
import { verifyAuth } from '@/lib/auth';
import { getSetting } from '@/lib/db';
import { ChargebeeService } from '@/lib/services/ChargebeeService';
import { FreeScoutService } from '@/lib/services/FreeScoutService';
import { addCollectionEvent, ensureCollectionsTables, followUpWindow, nextCollectionWindow } from '@/lib/collections';
import { logActivity, queryOpsDb } from '@/lib/opsDb';

const REASONS = ['insufficient_funds','expired_replaced_card','bank_decline','payday_timing','forgot','billing_dispute','financial_hardship','technical_issue','refused_payment','promised_later','other'];

function missedEmail(row: any, paymentUrl: string | null) {
  const amount = new Intl.NumberFormat('en-US', { style: 'currency', currency: row.currency_code || 'USD' }).format(Number(row.total_amount_due) / 100);
  return `Hello ${row.customer_name || 'there'},\n\nOur Collections team attempted to reach you regarding ${amount} currently due on your Nomad Internet account.\n\nInvoice reference: ${row.invoices?.[0]?.invoice_id || 'See your account'}${paymentUrl ? `\nSecure payment link: ${paymentUrl}` : ''}\n\nPlease complete payment or reply to this email if you need assistance.\n\nThank you,\nNomad Internet Collections`;
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
    await addCollectionEvent(id, session.email, 'claimed', { attemptDue: new Date().toISOString() });
    await logActivity(session.email, 'claim_collection_case', String(id), request);
    return NextResponse.json({ success: true, case: result.rows[0] });
  }

  const result = await queryOpsDb(
    `SELECT c.*, COALESCE((SELECT json_agg(i ORDER BY i.failure_date DESC) FROM ops_collection_invoices i WHERE i.case_id=c.id),'[]'::json) invoices
     FROM ops_collection_cases c WHERE c.id=$1`,
    [id]
  );
  const row = result.rows[0];
  if (!row) return NextResponse.json({ error: 'Case not found.' }, { status: 404 });
  if (row.assigned_to !== session.email) return NextResponse.json({ error: 'Only the case owner can update it.' }, { status: 403 });
  if (!['completed','left_voicemail','no_answer'].includes(action)) return NextResponse.json({ error: 'Invalid action.' }, { status: 400 });
  if (Number(row.current_attempt) >= 3) return NextResponse.json({ error: 'This case has exhausted all attempts.' }, { status: 409 });

  const notes = String(body.notes || '').trim();
  if (!notes) return NextResponse.json({ error: 'Attempt notes are required.' }, { status: 400 });
  const attemptNumber = Number(row.current_attempt) + 1;
  const scheduledFor = row.next_attempt_at;
  let conversationId = row.latest_freescout_conversation_id ? Number(row.latest_freescout_conversation_id) : null;

  if (action !== 'completed') {
    const chargebee = new ChargebeeService();
    const link = row.customer_id ? await chargebee.generatePaymentLink(row.customer_id) : { url: null };
    const message = missedEmail(row, link.url);
    const freescout = new FreeScoutService();
    if (conversationId) await freescout.addReply(conversationId, message, 'active');
    else {
      const mailboxId = Number(getSetting('callback_freescout_mailbox_id'));
      if (!mailboxId) return NextResponse.json({ error: 'CALLBACK_FREESCOUT_MAILBOX_ID is not configured.' }, { status: 503 });
      if (!row.customer_email) return NextResponse.json({ error: 'Customer email is unavailable.' }, { status: 400 });
      conversationId = await freescout.createConversation(mailboxId, row.customer_email, 'Nomad Internet payment follow-up', message);
    }
  }

  const collected = action === 'completed' ? Boolean(body.collected) : false;
  const claimedAmount = collected ? Math.round(Number(body.claimedAmount) * 100) : null;
  const reasonCategory = String(body.reasonCategory || '');
  if (action === 'completed') {
    if (!REASONS.includes(reasonCategory)) return NextResponse.json({ error: 'Select a valid payment reason.' }, { status: 400 });
    if (collected && (!Number.isFinite(claimedAmount) || Number(claimedAmount) <= 0)) return NextResponse.json({ error: 'Enter the amount collected.' }, { status: 400 });
  }

  await queryOpsDb(
    `INSERT INTO ops_collection_attempts (case_id,attempt_number,agent_email,outcome,notes,collected,claimed_amount,reason_category,freescout_conversation_id,scheduled_for)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
    [id, attemptNumber, session.email, action, notes, collected, claimedAmount, reasonCategory || null, conversationId, scheduledFor]
  );

  let status: string;
  let nextAttempt: Date | null = null;
  let closeReason: string | null = null;
  if (collected) {
    status = 'awaiting_payment_confirmation';
    nextAttempt = nextCollectionWindow(new Date());
  } else if (attemptNumber >= 3) {
    status = 'exhausted';
    closeReason = 'Attempts exhausted';
  } else {
    status = 'follow_up_pending';
    nextAttempt = followUpWindow(new Date(), attemptNumber + 1);
  }
  const updated = await queryOpsDb(
    `UPDATE ops_collection_cases SET status=$1,current_attempt=$2,next_attempt_at=$3,awaiting_amount=$4,
     close_reason=$5,latest_freescout_conversation_id=COALESCE($6,latest_freescout_conversation_id),updated_at=NOW()
     WHERE id=$7 RETURNING *`,
    [status, attemptNumber, nextAttempt, claimedAmount, closeReason, conversationId, id]
  );
  await addCollectionEvent(id, session.email, `attempt_${action}`, {
    attemptNumber, notes, collected, claimedAmount, reasonCategory, nextAttemptAt: nextAttempt?.toISOString() || null,
  });
  await logActivity(session.email, `collection_${action}`, String(id), request);
    return NextResponse.json({ success: true, case: updated.rows[0] });
  } catch (error: any) {
    console.error('Collection attempt update failed:', error);
    const timedOut = error?.name === 'TimeoutError' || error?.name === 'AbortError';
    return NextResponse.json(
      {
        error: timedOut
          ? 'The customer email service timed out. Please try saving the attempt again.'
          : error?.message || 'The collection attempt could not be saved.',
      },
      { status: timedOut ? 504 : 502 }
    );
  }
}
