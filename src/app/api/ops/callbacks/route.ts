import { NextResponse } from 'next/server';
import { verifyAuth } from '@/lib/auth';
import { logActivity, queryOpsDb } from '@/lib/opsDb';
import {
  CALLBACK_TIME_PREFERENCES,
  addCallbackEvent,
  countWords,
  ensureCallbackTables,
  isCallbackCategory,
  isCallbackDepartment,
} from '@/lib/callbacks';

export async function GET(request: Request) {
  try {
    const session = await verifyAuth();
    if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    await ensureCallbackTables();
    const email = new URL(request.url).searchParams.get('email')?.trim().toLowerCase();
    if (!email) return NextResponse.json({ error: 'Customer email is required.' }, { status: 400 });

    const { rows } = await queryOpsDb(
      `SELECT id, department, category, reason, preferred_time, status, requested_by, assigned_to,
              primary_phone, secondary_phone, due_at, outcome_notes, completed_at, created_at
       FROM ops_callbacks
       WHERE LOWER(customer_email) = $1
       ORDER BY created_at DESC
       LIMIT 50`,
      [email]
    );
    return NextResponse.json({
      success: true,
      agentEmail: session.email,
      callbacks: rows,
      activeCallback: rows.find(row => ['unassigned', 'assigned'].includes(row.status)) || null,
    });
  } catch (error: any) {
    console.error('Callback history error:', error);
    return NextResponse.json({ error: error.message || 'Callback database is unavailable.' }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const session = await verifyAuth();
    if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    await ensureCallbackTables();

    const body = await request.json();
    const email = String(body.customerEmail || '').trim().toLowerCase();
    const primaryPhone = String(body.primaryPhone || '').trim();
    const secondaryPhone = String(body.secondaryPhone || '').trim();
    const reason = String(body.reason || '').trim();

    if (!email || !primaryPhone) {
      return NextResponse.json({ error: 'Customer email and callback phone are required.' }, { status: 400 });
    }
    if (!isCallbackDepartment(body.department)) {
      return NextResponse.json({ error: 'Select a valid callback department.' }, { status: 400 });
    }
    if (!isCallbackCategory(body.department, body.category)) {
      return NextResponse.json({ error: 'Select a valid category for this department.' }, { status: 400 });
    }
    if (!(CALLBACK_TIME_PREFERENCES as readonly string[]).includes(body.preferredTime)) {
      return NextResponse.json({ error: 'Select a valid callback time preference.' }, { status: 400 });
    }
    if (countWords(reason) < 25) {
      return NextResponse.json({ error: 'Callback reason must contain at least 25 words.' }, { status: 400 });
    }

    const duplicate = await queryOpsDb(
      `SELECT id, status, requested_by, created_at
       FROM ops_callbacks
       WHERE LOWER(customer_email) = $1 AND status IN ('unassigned', 'assigned')
       ORDER BY created_at DESC LIMIT 1`,
      [email]
    );
    if (duplicate.rows[0]) {
      return NextResponse.json({ error: 'This customer already has an active callback request.', activeCallback: duplicate.rows[0] }, { status: 409 });
    }

    const insert = await queryOpsDb(
      `INSERT INTO ops_callbacks
        (customer_email, customer_id, customer_name, primary_phone, secondary_phone, phone_source,
         department, category, reason, preferred_time, requested_by, account_snapshot,
         freescout_conversation_id, due_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12::jsonb,$13,NOW() + INTERVAL '24 hours')
       RETURNING *`,
      [
        email,
        body.customerId || null,
        body.customerName || email,
        primaryPhone,
        secondaryPhone || null,
        body.phoneSource === 'corrected' ? 'corrected' : 'on_file',
        body.department,
        body.category,
        reason,
        body.preferredTime,
        session.email,
        JSON.stringify(body.accountSnapshot || {}),
        body.freescoutConversationId || null,
      ]
    );
    const callback = insert.rows[0];
    await addCallbackEvent(callback.id, session.email, 'created', {
      department: body.department,
      category: body.category,
      preferredTime: body.preferredTime,
    });
    await logActivity(session.email, 'request_callback', email, request);
    return NextResponse.json({ success: true, callback }, { status: 201 });
  } catch (error: any) {
    console.error('Callback creation error:', error);
    if (error.code === '23505') {
      return NextResponse.json({ error: 'This customer already has an active callback request.' }, { status: 409 });
    }
    return NextResponse.json({ error: error.message || 'Failed to create callback request.' }, { status: 500 });
  }
}
