import { NextResponse } from 'next/server';
import { verifyAuth } from '@/lib/auth';
import { getSetting } from '@/lib/db';

const SLACK_NAME_MAP: Record<string, string> = {
  'jessica.garza':    'U03V2LF24H0',
  'jessica':          'U03V2LF24H0',
  'jaden.garza':      'U03VCD68PL0',
  'jaden':            'U03VCD68PL0',
  'olayinka':         'U041A1GMFSA',
  'joshua':           'U04FRC9EUE7',
  'bryan':            'U05HMJ0JG79',
  'bryan.fury':       'U05HMJ0JG79',
  'bryan@nomadinternet.com': 'U05HMJ0JG79',
  'sam':              'U05J4HE19N0',
  'sam.fash':         'U05J4HE19N0',
  'sam@nomadinternet.com': 'U05J4HE19N0',
  'wisdom':           'U09C5DABNJF',
  'tiffany':          'U09C7V8Q2UA',
  'donald':           'U09CJN82597',
  'amaara':           'U09CJN8GLJV',
  'jeremiah':         'U09CN4Z5UMP',
  'jeremiah@nomadinternet.com': 'U09CN4Z5UMP',
  'danial':           'U09CNBK3NQH',
  'justin':           'U09CNBLKGL9',
  'bella':            'U09E8KUGSTF',
  'beatriz':          'U09GLBSJN11',
  'jonathon':         'U09HLQ6229K',
  'rudy':             'U09J3KB0HFB',
  'precious':         'U09K2UXQWG5',
  'joel':             'U0A5C62CRV3',
};

function resolveSlackId(agentEmail: string): string | null {
  const email = agentEmail.toLowerCase();
  if (SLACK_NAME_MAP[email]) return SLACK_NAME_MAP[email];
  const localPart = email.split('@')[0];
  if (SLACK_NAME_MAP[localPart]) return SLACK_NAME_MAP[localPart];
  const firstName = localPart.split('.')[0];
  if (SLACK_NAME_MAP[firstName]) return SLACK_NAME_MAP[firstName];
  return null;
}

async function postToSlack(token: string, channel: string, blocks: object[], text: string) {
  const res = await fetch('https://slack.com/api/chat.postMessage', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json; charset=utf-8',
    },
    body: JSON.stringify({ channel, blocks, text }),
  });
  return res.json();
}

export async function POST(request: Request) {
  try {
    const session = await verifyAuth();
    if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const token = getSetting('slack_bot_token');
    if (!token) return NextResponse.json({ error: 'Slack not configured' }, { status: 500 });

    const body = await request.json();
    // agentNote = free-text from agent describing the meta issue
    // knownIssue = pre-detected issue string (e.g. bad ICCID description, bad plan name)
    const { type, channel, customer, subscription, network, agentNote, knownIssue } = body;

    if (!type || !channel || !customer) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
    }

    const agentEmail: string = session.email;
    const agentSlackId = resolveSlackId(agentEmail);
    const agentMention = agentSlackId ? `<@${agentSlackId}>` : `*${agentEmail}*`;

    const typeConfig: Record<string, { emoji: string; label: string }> = {
      line_issue: { emoji: '🔴', label: 'Line Issue Escalation' },
      plan_issue: { emoji: '🟡', label: 'Plan Issue Escalation' },
      meta_issue: { emoji: '🔵', label: 'Meta / Account Issue Escalation' },
    };
    const cfg = typeConfig[type] || typeConfig.line_issue;

    // ── Extract billing ──────────────────────────────────────────────────────
    const hasBalance = (subscription?.total_dues ?? 0) > 0;
    const billingText = hasBalance
      ? `⚠️ *Balance Due:* $${((subscription.total_dues ?? 0) / 100).toFixed(2)}`
      : `✅ *Billing:* Account in good standing`;

    // ── Chargebee fields ─────────────────────────────────────────────────────
    const subStatus = (subscription?.status ?? 'unknown').toUpperCase();
    const subId     = subscription?.id ?? 'N/A';
    const cbIccid   = subscription?.cf_SIM_ID_ICCID || subscription?.cf_iccid || 'N/A';
    // Chargebee stores IMEI in various custom field names; fall back to ThingSpace if missing
    const cbImei    = subscription?.cf_IMEI || subscription?.cf_imei || subscription?.cf_Device_IMEI
                      || subscription?.cf_device_imei
                      // ThingSpace fallback (same extraction logic as dashboard)
                      || network?.deviceIds?.find((d: any) => d.kind === 'imei')?.id
                      || network?.extendedAttributes?.find((d: any) => d.key === 'PreIMEI')?.value
                      || network?.deviceIdentifier
                      || 'N/A';
    const planId    = subscription?.subscription_items?.find((i: any) => i.item_type === 'plan')?.item_price_id
                      || subscription?.plan_id || 'N/A';
    const customerEmail = customer?.email ?? 'N/A';
    const customerId    = customer?.id ?? 'N/A';

    // ── ThingSpace IMEI (proper extraction matching dashboard display logic) ─
    const tsImei =
      network?.deviceIds?.find((d: any) => d.kind === 'imei')?.id
      || network?.extendedAttributes?.find((d: any) => d.key === 'PreIMEI')?.value
      || network?.deviceIdentifier
      || 'Not provisioned / N/A';

    // ── ThingSpace network fields ─────────────────────────────────────────────
    const tsState   = network?.carrierInformations?.[0]?.state || network?.state || 'N/A';
    const tsPlan    = network?.carrierInformations?.[0]?.servicePlan || 'N/A';
    const tsIccid   = network?.iccid || cbIccid;
    const tsLastConn = network?.lastConnectionDate
      ? new Date(network.lastConnectionDate).toLocaleString('en-US', { timeZone: 'America/Chicago' })
      : 'N/A';

    const chargebeeUrl = `https://nomad-internet.chargebee.com/subscriptions/${subId}`;

    // ── Build Slack blocks ────────────────────────────────────────────────────
    const blocks: object[] = [];

    // Header
    blocks.push({
      type: 'header',
      text: { type: 'plain_text', text: `${cfg.emoji} ${cfg.label}`, emoji: true },
    });

    // Agent intro
    blocks.push({
      type: 'section',
      text: {
        type: 'mrkdwn',
        text: `${agentMention} escalated a *${type.replace(/_/g, ' ')}* for customer *${customerEmail}*.\n${billingText}`,
      },
    });

    // ── Highlighted issue context block (plan_issue or meta_issue) ───────────
    if (type === 'plan_issue' && tsPlan !== 'N/A') {
      blocks.push({ type: 'divider' });
      blocks.push({
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: `🟡 *Plan Issue Detected*\nThe active service plan on this line is flagged as a *known problem SKU*:\n\`\`\`${tsPlan}\`\`\`\nThis plan may be causing limited throughput, incorrect throttling, or provisioning failures. The line needs to be re-provisioned on a correct plan.`,
        },
      });
    }

    if (type === 'meta_issue' && knownIssue) {
      blocks.push({ type: 'divider' });
      blocks.push({
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: `🔵 *Meta Issue Detected*\n${knownIssue}`,
        },
      });
    }

    if ((type === 'meta_issue' || type === 'line_issue') && agentNote) {
      blocks.push({ type: 'divider' });
      blocks.push({
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: `💬 *Agent Note:*\n> ${agentNote}`,
        },
      });
    }

    // ── Account details ───────────────────────────────────────────────────────
    blocks.push({ type: 'divider' });
    blocks.push({
      type: 'section',
      text: { type: 'mrkdwn', text: '*📋 Account & Subscription Details*' },
    });
    blocks.push({
      type: 'section',
      fields: [
        { type: 'mrkdwn', text: `*Customer Email*\n${customerEmail}` },
        { type: 'mrkdwn', text: `*Customer ID*\n\`${customerId}\`` },
        { type: 'mrkdwn', text: `*Subscription Status*\n\`${subStatus}\`` },
        { type: 'mrkdwn', text: `*Subscription ID*\n\`${subId}\`` },
        { type: 'mrkdwn', text: `*Plan (Chargebee)*\n\`${planId}\`` },
        { type: 'mrkdwn', text: `*CB ICCID*\n\`${cbIccid}\`` },
        { type: 'mrkdwn', text: `*CB IMEI*\n\`${cbImei}\`` },
      ],
    });

    // ── ThingSpace network data ───────────────────────────────────────────────
    blocks.push({ type: 'divider' });
    blocks.push({
      type: 'section',
      text: { type: 'mrkdwn', text: '*📡 Verizon ThingSpace Network Data*' },
    });
    blocks.push({
      type: 'section',
      fields: [
        { type: 'mrkdwn', text: `*Network Status*\n\`${tsState}\`` },
        { type: 'mrkdwn', text: `*Active Plan SKU*\n\`${tsPlan}\`` },
        { type: 'mrkdwn', text: `*TS ICCID*\n\`${tsIccid}\`` },
        { type: 'mrkdwn', text: `*TS IMEI*\n\`${tsImei}\`` },
        { type: 'mrkdwn', text: `*Last Connection*\n${tsLastConn}` },
      ],
    });

    // ── Action button ─────────────────────────────────────────────────────────
    blocks.push({ type: 'divider' });
    blocks.push({
      type: 'actions',
      elements: [
        {
          type: 'button',
          text: { type: 'plain_text', text: '📋 View Subscription in Chargebee', emoji: true },
          url: chargebeeUrl,
          style: 'primary',
        },
      ],
    });
    blocks.push({
      type: 'context',
      elements: [
        {
          type: 'mrkdwn',
          text: `Escalated at ${new Date().toLocaleString('en-US', { timeZone: 'America/Chicago' })} CT · Nomad NOC Dashboard`,
        },
      ],
    });

    const fallbackText = `${cfg.emoji} ${cfg.label} — ${agentEmail} escalated a ${type.replace(/_/g, ' ')} for ${customerEmail}`;
    const result = await postToSlack(token, channel, blocks, fallbackText);

    if (!result.ok) {
      console.error('Slack error:', result);
      return NextResponse.json({ error: result.error || 'Slack post failed' }, { status: 500 });
    }

    return NextResponse.json({ success: true, ts: result.ts });
  } catch (err: any) {
    console.error('Escalation route error:', err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
