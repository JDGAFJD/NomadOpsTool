import { NextResponse } from 'next/server';
import { verifyAuth } from '@/lib/auth';
import { logActivity, queryOpsDb } from '@/lib/opsDb';
import { postToSlack, resolveSlackId } from '@/lib/slack';
import {
  CALLBACK_TIME_PREFERENCES,
  addCallbackEvent,
  countWords,
  ensureCallbackTables,
  isCallbackCategory,
  isCallbackDepartment,
} from '@/lib/callbacks';

const CALLBACK_SLACK_CHANNEL = 'C09EZLGDMND';

function clean(value: unknown, fallback = 'N/A') {
  if (value === null || value === undefined || value === '') return fallback;
  return String(value);
}

function escapeMrkdwn(value: unknown) {
  return clean(value, '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function humanize(value: string) {
  return value.replace(/_/g, ' ').replace(/\b\w/g, char => char.toUpperCase());
}

function mentionsForDepartment(department: string) {
  const routeMap: Record<string, string[]> = {
    internet: ['beatriz', 'donald'],
    cancellation: ['amara.parker', 'daniel', 'beatriz'],
    billing: ['daniel', 'amara.parker'],
    sales: ['jonathan', 'rudy.valdez'],
    shipment: ['donald', 'daniel'],
  };
  return (routeMap[department] || [])
    .map(name => resolveSlackId(name))
    .filter(Boolean)
    .map(id => `<@${id}>`)
    .join(' ');
}

function callbackSnapshotSummary(snapshot: any) {
  const subscription = snapshot?.subscriptions?.[0];
  const order = snapshot?.latestOrder;
  const network = snapshot?.network?.[0];
  const plan = subscription?.plan_id || subscription?.subscription_items?.find((item: any) => item.item_type === 'plan')?.item_price_id || 'N/A';
  return {
    subscription: `${subscription?.id || 'N/A'} / ${subscription?.status || 'No status'} / ${plan}`,
    shipment: `${order?.orderNumber || 'N/A'} / ${order?.tracking?.[0]?.status || order?.fulfillmentStatus || 'No status'}`,
    thingspace: network?.state || network?.status || network?.deviceIdentifier || 'N/A',
  };
}

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

    const snapshot = body.accountSnapshot || {};
    const summaries = callbackSnapshotSummary(snapshot);
    const departmentMentions = mentionsForDepartment(body.department);
    const fallbackText = `New callback request #${callback.id}: ${callback.customer_email} (${humanize(body.department)})`;
    const slackBlocks = [
      { type: 'header', text: { type: 'plain_text', text: '📞 New Callback Request', emoji: true } },
      {
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: `${departmentMentions ? `${departmentMentions} ` : ''}*Callback #${callback.id}* created by *${escapeMrkdwn(session.email)}*.`,
        },
      },
      {
        type: 'section',
        fields: [
          { type: 'mrkdwn', text: `*Customer*\n${escapeMrkdwn(callback.customer_name || callback.customer_email)}` },
          { type: 'mrkdwn', text: `*Email*\n${escapeMrkdwn(callback.customer_email)}` },
          { type: 'mrkdwn', text: `*Primary Phone*\n${escapeMrkdwn(callback.primary_phone)}` },
          { type: 'mrkdwn', text: `*Secondary Phone*\n${escapeMrkdwn(callback.secondary_phone || 'Not provided')}` },
          { type: 'mrkdwn', text: `*Department*\n${escapeMrkdwn(humanize(callback.department))}` },
          { type: 'mrkdwn', text: `*Category*\n${escapeMrkdwn(humanize(callback.category))}` },
          { type: 'mrkdwn', text: `*Preferred Time*\n${escapeMrkdwn(humanize(callback.preferred_time))}` },
          { type: 'mrkdwn', text: `*SLA Due*\n${new Date(callback.due_at).toLocaleString('en-US', { timeZone: 'America/Chicago' })} CT` },
        ],
      },
      { type: 'section', text: { type: 'mrkdwn', text: `*Reason*\n>${escapeMrkdwn(callback.reason)}` } },
      {
        type: 'section',
        fields: [
          { type: 'mrkdwn', text: `*Subscription / Plan*\n${escapeMrkdwn(summaries.subscription)}` },
          { type: 'mrkdwn', text: `*Shipment*\n${escapeMrkdwn(summaries.shipment)}` },
          { type: 'mrkdwn', text: `*ThingSpace*\n${escapeMrkdwn(summaries.thingspace)}` },
          { type: 'mrkdwn', text: `*FreeScout*\n${callback.freescout_conversation_id ? `#${callback.freescout_conversation_id}` : 'Not linked yet'}` },
        ],
      },
    ];

    let slackWarning: string | null = null;
    const slackResult = await postToSlack(slackBlocks, fallbackText, CALLBACK_SLACK_CHANNEL);
    if (slackResult.ok) {
      await queryOpsDb(
        `UPDATE ops_callbacks SET slack_channel = $1, slack_ts = $2, slack_error = NULL, updated_at = NOW() WHERE id = $3`,
        [CALLBACK_SLACK_CHANNEL, slackResult.ts || null, callback.id]
      );
      callback.slack_channel = CALLBACK_SLACK_CHANNEL;
      callback.slack_ts = slackResult.ts || null;
      callback.slack_error = null;
    } else {
      slackWarning = slackResult.error || 'Slack notification failed.';
      await queryOpsDb(
        `UPDATE ops_callbacks SET slack_channel = $1, slack_ts = NULL, slack_error = $2, updated_at = NOW() WHERE id = $3`,
        [CALLBACK_SLACK_CHANNEL, slackWarning, callback.id]
      );
      callback.slack_channel = CALLBACK_SLACK_CHANNEL;
      callback.slack_ts = null;
      callback.slack_error = slackWarning;
    }

    await logActivity(session.email, 'request_callback', email, request);
    return NextResponse.json({ success: true, callback, slackWarning }, { status: 201 });
  } catch (error: any) {
    console.error('Callback creation error:', error);
    if (error.code === '23505') {
      return NextResponse.json({ error: 'This customer already has an active callback request.' }, { status: 409 });
    }
    return NextResponse.json({ error: error.message || 'Failed to create callback request.' }, { status: 500 });
  }
}
