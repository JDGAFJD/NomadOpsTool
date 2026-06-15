import { NextResponse } from 'next/server';
import { verifyAuth } from '@/lib/auth';
import { getSetting } from '@/lib/db';
import { FreeScoutService } from '@/lib/services/FreeScoutService';
import { addCallbackEvent, ensureCallbackTables } from '@/lib/callbacks';
import { logActivity, queryOpsDb } from '@/lib/opsDb';

function noAnswerEmail(customerName: string, outcome: 'left_voicemail' | 'no_answer') {
  const attempt = outcome === 'left_voicemail'
    ? 'We attempted your requested callback and left a voicemail.'
    : 'We attempted your requested callback but were unable to reach you.';
  return `Hello ${customerName || 'there'},\n\n${attempt} Please reply to this email with a convenient time or contact our support team when you are available.\n\nThank you,\nNomad Internet Support`;
}

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const session = await verifyAuth();
    if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    await ensureCallbackTables();

    const callbackId = Number((await context.params).id);
    if (!Number.isInteger(callbackId)) return NextResponse.json({ error: 'Invalid callback ID.' }, { status: 400 });
    const body = await request.json();
    const action = String(body.action || '');

    if (action === 'claim') {
      const result = await queryOpsDb(
        `UPDATE ops_callbacks
         SET status = 'assigned', assigned_to = $1, assigned_at = NOW(), updated_at = NOW()
         WHERE id = $2 AND status = 'unassigned'
         RETURNING *`,
        [session.email, callbackId]
      );
      if (!result.rows[0]) return NextResponse.json({ error: 'This callback has already been claimed.' }, { status: 409 });
      await addCallbackEvent(callbackId, session.email, 'claimed');
      await logActivity(session.email, 'claim_callback', String(callbackId), request);
      return NextResponse.json({ success: true, callback: result.rows[0] });
    }

    const current = await queryOpsDb('SELECT * FROM ops_callbacks WHERE id = $1 LIMIT 1', [callbackId]);
    const callback = current.rows[0];
    if (!callback) return NextResponse.json({ error: 'Callback not found.' }, { status: 404 });
    if (callback.status !== 'assigned' || callback.assigned_to !== session.email) {
      return NextResponse.json({ error: 'Only the assigned agent can update this callback.' }, { status: 403 });
    }

    if (action === 'release') {
      const result = await queryOpsDb(
        `UPDATE ops_callbacks
         SET status = 'unassigned', assigned_to = NULL, assigned_at = NULL, updated_at = NOW()
         WHERE id = $1 AND status = 'assigned' AND assigned_to = $2
         RETURNING *`,
        [callbackId, session.email]
      );
      await addCallbackEvent(callbackId, session.email, 'released');
      await logActivity(session.email, 'release_callback', String(callbackId), request);
      return NextResponse.json({ success: true, callback: result.rows[0] });
    }

    if (!['completed', 'left_voicemail', 'no_answer'].includes(action)) {
      return NextResponse.json({ error: 'Invalid callback action.' }, { status: 400 });
    }
    const notes = String(body.notes || '').trim();
    if (!notes) return NextResponse.json({ error: 'Outcome notes are required.' }, { status: 400 });

    let conversationId = callback.freescout_conversation_id ? Number(callback.freescout_conversation_id) : null;
    if (action === 'left_voicemail' || action === 'no_answer') {
      const freescout = new FreeScoutService();
      const message = noAnswerEmail(callback.customer_name, action);
      if (conversationId) {
        await freescout.addReply(conversationId, message, 'active');
      } else {
        const mailboxId = Number(getSetting('callback_freescout_mailbox_id'));
        if (!mailboxId) {
          return NextResponse.json({ error: 'CALLBACK_FREESCOUT_MAILBOX_ID is not configured.' }, { status: 503 });
        }
        conversationId = await freescout.createConversation(
          mailboxId,
          callback.customer_email,
          'We attempted your requested callback',
          message
        );
      }
    }

    const result = await queryOpsDb(
      `UPDATE ops_callbacks
       SET status = $1, outcome_notes = $2, completed_at = NOW(), updated_at = NOW(),
           freescout_conversation_id = COALESCE($3, freescout_conversation_id)
       WHERE id = $4 AND status = 'assigned' AND assigned_to = $5
       RETURNING *`,
      [action, notes, conversationId, callbackId, session.email]
    );
    if (!result.rows[0]) return NextResponse.json({ error: 'Callback changed before it could be completed.' }, { status: 409 });

    await addCallbackEvent(callbackId, session.email, action, {
      notes,
      freescoutConversationId: conversationId,
      emailSent: action !== 'completed',
    });
    await logActivity(session.email, `callback_${action}`, String(callbackId), request);
    return NextResponse.json({ success: true, callback: result.rows[0] });
  } catch (error: any) {
    console.error('Callback mutation error:', error);
    return NextResponse.json({ error: error.message || 'Callback update failed.' }, { status: 500 });
  }
}
