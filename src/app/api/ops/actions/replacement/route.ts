import { NextResponse } from 'next/server';
import { verifyAuth } from '@/lib/auth';
import { queryOpsDb, logActivity } from '@/lib/opsDb';
import { postToSlack, resolveSlackId } from '@/lib/slack';

const JUSTIN_LANDERS_ID = 'U09CNBLKGL9';
const REPLACEMENT_CHANNEL = '0-urgent-live-calls';

const ISSUE_BRANCHES = ['power', 'internet'] as const;
const POWER_DECISIONS = ['full_unit', 'power_cord'] as const;
const INTERNET_DECISIONS = ['stopped_working', 'never_worked'] as const;
const REPLACEMENT_TYPES = ['Air', 'Dragon/Raptor', 'Omega/Cube', 'Replacement power cord', 'Other'] as const;
const CHECKLIST_KEYS = ['checkedOtherSockets', 'customerMoved', 'coverageChecked', 'outageChecked', 'lineRefreshTried', 'hardResetTried', 'deviceMoved'] as const;
const POWER_CHECKLIST_KEYS = ['checkedOtherSockets'] as const;
const INTERNET_CHECKLIST_KEYS = ['customerMoved', 'coverageChecked', 'outageChecked', 'lineRefreshTried', 'hardResetTried', 'deviceMoved'] as const;

type ReplacementBody = {
  customer?: Record<string, any>;
  subscription?: Record<string, any>;
  network?: Record<string, any> | null;
  troubleshootingSteps?: string;
  issueBranch?: typeof ISSUE_BRANCHES[number];
  powerDecision?: typeof POWER_DECISIONS[number];
  internetDecision?: typeof INTERNET_DECISIONS[number];
  checklist?: Record<typeof CHECKLIST_KEYS[number], boolean>;
  replacementType?: typeof REPLACEMENT_TYPES[number];
  customReplacementItem?: string;
  replacementReason?: string;
  interactionId?: string;
  addressChoice?: 'confirmed' | 'new';
  originalShopifyAddress?: string;
  shippingAddress?: string;
  disclaimerAccepted?: boolean;
};

function isOneOf<T extends readonly string[]>(value: unknown, allowed: T): value is T[number] {
  return typeof value === 'string' && allowed.includes(value);
}

function clean(value: unknown, fallback = 'N/A') {
  if (value === null || value === undefined || value === '') return fallback;
  return String(value);
}

function escapeMrkdwn(value: unknown) {
  return clean(value, '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function ensureChecklist(checklist: ReplacementBody['checklist']) {
  return CHECKLIST_KEYS.reduce((acc, key) => {
    acc[key] = Boolean(checklist?.[key]);
    return acc;
  }, {} as Record<typeof CHECKLIST_KEYS[number], boolean>);
}

function checklistSummary(checklist: Record<typeof CHECKLIST_KEYS[number], boolean>, issueBranch: ReplacementBody['issueBranch']) {
  const labels: Record<typeof CHECKLIST_KEYS[number], string> = {
    checkedOtherSockets: 'Checked other sockets',
    customerMoved: 'Customer moved',
    coverageChecked: 'Coverage checked',
    outageChecked: 'Outage checked',
    lineRefreshTried: 'Line refresh tried',
    hardResetTried: 'Hard reset tried',
    deviceMoved: 'Device moved/repositioned',
  };
  const keys = issueBranch === 'power' ? POWER_CHECKLIST_KEYS : INTERNET_CHECKLIST_KEYS;
  return keys.map(key => `${checklist[key] ? '✅' : '⬜'} ${labels[key]}`).join('\n');
}

async function ensureReplacementTable() {
  await queryOpsDb(`
    CREATE TABLE IF NOT EXISTS ops_replacement_requests (
      id SERIAL PRIMARY KEY,
      agent_email TEXT NOT NULL,
      customer_email TEXT,
      customer_id TEXT,
      customer_name TEXT,
      subscription_id TEXT,
      subscription_status TEXT,
      plan_id TEXT,
      iccid TEXT,
      imei TEXT,
      issue_branch TEXT NOT NULL,
      branch_decision TEXT NOT NULL,
      troubleshooting_steps TEXT,
      checklist JSONB,
      replacement_type TEXT NOT NULL,
      custom_replacement_item TEXT,
      replacement_reason TEXT NOT NULL,
      interaction_id TEXT,
      address_source TEXT,
      original_shopify_address TEXT,
      shipping_address TEXT,
      slack_ts TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
  await queryOpsDb(`ALTER TABLE ops_replacement_requests ADD COLUMN IF NOT EXISTS address_source TEXT`);
  await queryOpsDb(`ALTER TABLE ops_replacement_requests ADD COLUMN IF NOT EXISTS original_shopify_address TEXT`);
  await queryOpsDb(`ALTER TABLE ops_replacement_requests ADD COLUMN IF NOT EXISTS shipping_address TEXT`);
}

export async function GET() {
  const session = await verifyAuth();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  return NextResponse.json({ agentEmail: session.email });
}

export async function POST(request: Request) {
  try {
    const session = await verifyAuth();
    if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const body = (await request.json()) as ReplacementBody;
    const checklist = ensureChecklist(body.checklist);

    if (!body.customer || !body.subscription) {
      return NextResponse.json({ error: 'Customer and subscription context are required.' }, { status: 400 });
    }
    if (!isOneOf(body.issueBranch, ISSUE_BRANCHES)) {
      return NextResponse.json({ error: 'Select a replacement issue branch.' }, { status: 400 });
    }
    if (body.issueBranch === 'power' && !isOneOf(body.powerDecision, POWER_DECISIONS)) {
      return NextResponse.json({ error: 'Select whether this is a full unit or power cord replacement.' }, { status: 400 });
    }
    if (body.issueBranch === 'internet' && !isOneOf(body.internetDecision, INTERNET_DECISIONS)) {
      return NextResponse.json({ error: 'Select whether the internet issue is new or started after working before.' }, { status: 400 });
    }
    if (body.issueBranch === 'power' && !checklist.checkedOtherSockets) {
      return NextResponse.json({ error: 'Confirm that other sockets were checked before proceeding.' }, { status: 400 });
    }
    if (body.issueBranch === 'internet' && !INTERNET_CHECKLIST_KEYS.every(key => checklist[key])) {
      return NextResponse.json({ error: 'Complete every troubleshooting checkbox before proceeding.' }, { status: 400 });
    }
    if (!isOneOf(body.replacementType, REPLACEMENT_TYPES)) {
      return NextResponse.json({ error: 'Select what replacement is being sent.' }, { status: 400 });
    }
    if (body.replacementType === 'Other' && !body.customReplacementItem?.trim()) {
      return NextResponse.json({ error: 'Type the replacement item when Other is selected.' }, { status: 400 });
    }
    if (!body.replacementReason?.trim()) {
      return NextResponse.json({ error: 'Replacement reason is required.' }, { status: 400 });
    }
    if (body.addressChoice !== 'confirmed' && body.addressChoice !== 'new') {
      return NextResponse.json({ error: 'Confirm the Shopify address or enter a new replacement address.' }, { status: 400 });
    }
    if (body.addressChoice === 'confirmed' && !body.originalShopifyAddress?.trim()) {
      return NextResponse.json({ error: 'No Shopify address was provided to confirm.' }, { status: 400 });
    }
    if (!body.shippingAddress?.trim()) {
      return NextResponse.json({ error: 'Replacement shipping address is required.' }, { status: 400 });
    }
    if (!body.disclaimerAccepted) {
      return NextResponse.json({ error: 'The replacement cost disclaimer must be accepted.' }, { status: 400 });
    }

    const customer = body.customer;
    const subscription = body.subscription;
    const primaryPlan = subscription?.subscription_items?.find((i: any) => i.item_type === 'plan');
    const customerEmail = clean(customer.email);
    const customerId = clean(customer.id);
    const customerName = `${clean(customer.firstName, '').trim()} ${clean(customer.lastName, '').trim()}`.trim() || customerEmail;
    const subscriptionId = clean(subscription.id);
    const subscriptionStatus = clean(subscription.status);
    const planId = clean(primaryPlan?.item_price_id || subscription.plan_id);
    const iccid = clean(subscription.cf_SIM_ID_ICCID || subscription.cf_iccid);
    const imei = clean(
      subscription.cf_IMEI ||
      subscription.cf_imei ||
      subscription.cf_Device_IMEI ||
      subscription.cf_device_imei ||
      body.network?.deviceIds?.find((d: any) => d.kind === 'imei')?.id ||
      body.network?.extendedAttributes?.find((d: any) => d.key === 'PreIMEI')?.value ||
      body.network?.deviceIdentifier
    );
    const branchDecision = body.issueBranch === 'power' ? body.powerDecision! : body.internetDecision!;
    const replacementItem = body.replacementType === 'Other'
      ? body.customReplacementItem!.trim()
      : body.replacementType!;
    const agentEmail = session.email as string;
    const agentSlackId = resolveSlackId(agentEmail);
    const agentMention = agentSlackId ? `<@${agentSlackId}>` : `*${escapeMrkdwn(agentEmail)}*`;
    const issueLabel = body.issueBranch === 'power' ? 'Device not turning on' : 'Internet not working after troubleshooting';
    const decisionLabel = body.issueBranch === 'power'
      ? (body.powerDecision === 'full_unit' ? 'Full unit replacement' : 'Replacement power cord')
      : (body.internetDecision === 'stopped_working' ? 'Stopped working after previously working' : 'New device, never worked from start');
    const addressSourceLabel = body.addressChoice === 'confirmed' ? 'Confirmed Shopify address' : 'Agent entered corrected address';
    const shippingAddress = body.shippingAddress.trim();

    const blocks = [
      { type: 'header', text: { type: 'plain_text', text: '📦 Replacement Request', emoji: true } },
      {
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: `<@${JUSTIN_LANDERS_ID}> ${agentMention} submitted a replacement request for *${escapeMrkdwn(customerEmail)}*.`,
        },
      },
      { type: 'divider' },
      {
        type: 'section',
        fields: [
          { type: 'mrkdwn', text: `*Replacement Item*\n${escapeMrkdwn(replacementItem)}` },
          { type: 'mrkdwn', text: `*Issue Path*\n${escapeMrkdwn(issueLabel)}` },
          { type: 'mrkdwn', text: `*Decision*\n${escapeMrkdwn(decisionLabel)}` },
          { type: 'mrkdwn', text: `*Interaction ID*\n${escapeMrkdwn(body.interactionId || 'Not provided')}` },
        ],
      },
      {
        type: 'section',
        text: { type: 'mrkdwn', text: `*Troubleshooting Already Performed*\n>${escapeMrkdwn(body.troubleshootingSteps || 'Not provided')}` },
      },
      {
        type: 'section',
        text: { type: 'mrkdwn', text: `*Troubleshooting Checklist*\n${checklistSummary(checklist, body.issueBranch)}` },
      },
      {
        type: 'section',
        text: { type: 'mrkdwn', text: `*Replacement Reason*\n>${escapeMrkdwn(body.replacementReason)}` },
      },
      {
        type: 'section',
        text: { type: 'mrkdwn', text: `*Replacement Shipping Address* (${escapeMrkdwn(addressSourceLabel)})\n\`\`\`${escapeMrkdwn(shippingAddress)}\`\`\`` },
      },
      { type: 'divider' },
      {
        type: 'section',
        fields: [
          { type: 'mrkdwn', text: `*Customer*\n${escapeMrkdwn(customerName)}` },
          { type: 'mrkdwn', text: `*Customer ID*\n\`${escapeMrkdwn(customerId)}\`` },
          { type: 'mrkdwn', text: `*Subscription ID*\n\`${escapeMrkdwn(subscriptionId)}\`` },
          { type: 'mrkdwn', text: `*Status*\n\`${escapeMrkdwn(subscriptionStatus)}\`` },
          { type: 'mrkdwn', text: `*Plan*\n\`${escapeMrkdwn(planId)}\`` },
          { type: 'mrkdwn', text: `*ICCID / IMEI*\n\`${escapeMrkdwn(iccid)}\` / \`${escapeMrkdwn(imei)}\`` },
        ],
      },
      {
        type: 'context',
        elements: [
          { type: 'mrkdwn', text: `Disclaimer accepted by ${escapeMrkdwn(agentEmail)}: replacement costs extra money and may take 2-3 months of revenue to cover.` },
        ],
      },
    ];

    const fallbackText = `Replacement request: ${agentEmail} requested ${replacementItem} for ${customerEmail}`;
    const slackResult = await postToSlack(blocks, fallbackText, REPLACEMENT_CHANNEL);
    if (!slackResult.ok) {
      console.error('Replacement Slack error:', slackResult);
      return NextResponse.json({ error: slackResult.error || 'Slack post failed' }, { status: 500 });
    }

    await ensureReplacementTable();
    const insert = await queryOpsDb(
      `INSERT INTO ops_replacement_requests
        (agent_email, customer_email, customer_id, customer_name, subscription_id, subscription_status,
         plan_id, iccid, imei, issue_branch, branch_decision, troubleshooting_steps, checklist,
         replacement_type, custom_replacement_item, replacement_reason, interaction_id,
         address_source, original_shopify_address, shipping_address, slack_ts)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13::jsonb,$14,$15,$16,$17,$18,$19,$20,$21)
       RETURNING id`,
      [
        agentEmail,
        customerEmail,
        customerId,
        customerName,
        subscriptionId,
        subscriptionStatus,
        planId,
        iccid,
        imei,
        body.issueBranch,
        branchDecision,
        body.troubleshootingSteps?.trim() || null,
        JSON.stringify(checklist),
        body.replacementType,
        body.replacementType === 'Other' ? body.customReplacementItem!.trim() : null,
        body.replacementReason.trim(),
        body.interactionId?.trim() || null,
        body.addressChoice,
        body.originalShopifyAddress?.trim() || null,
        shippingAddress,
        slackResult.ts || null,
      ]
    );

    await logActivity(agentEmail, 'request_replacement', customerEmail, request);

    return NextResponse.json({ success: true, id: insert.rows[0]?.id, ts: slackResult.ts });
  } catch (err: any) {
    console.error('Replacement request error:', err);
    return NextResponse.json({ error: err.message || 'Replacement request failed' }, { status: 500 });
  }
}
