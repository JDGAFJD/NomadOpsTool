import { getSetting } from '@/lib/db';
import { postToSlack, resolveSlackId } from '@/lib/slack';
import { queryOpsDb } from '@/lib/opsDb';
import type { ChargebeeWebhookPayload } from '@/lib/chargebeeWebhooks';
import { ChargebeeService } from '@/lib/services/ChargebeeService';

export const COLLECTIONS_SLACK_CHANNEL = 'C09BSKCL2S3';
export const COLLECTIONS_ACTIVE_STATUSES = [
  'unassigned',
  'assigned',
  'follow_up_pending',
  'awaiting_payment_confirmation',
  'paused',
] as const;
export const COLLECTIONS_ADMIN_TERMINAL_STATUSES = ['completed_by_admin', 'closed_by_admin'] as const;

type JsonRecord = Record<string, any>;

function record(value: unknown): JsonRecord {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as JsonRecord : {};
}

function text(value: unknown) {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function cents(value: unknown) {
  const number = Number(value);
  return Number.isFinite(number) ? Math.max(0, Math.round(number)) : 0;
}

function epoch(value: unknown) {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? new Date(number * 1000) : null;
}

export async function ensureCollectionsTables() {
  await queryOpsDb(`
    CREATE TABLE IF NOT EXISTS ops_collection_cases (
      id BIGSERIAL PRIMARY KEY,
      case_key TEXT NOT NULL UNIQUE,
      customer_id TEXT,
      customer_name TEXT,
      customer_email TEXT,
      customer_phone TEXT,
      subscription_id TEXT,
      subscription_status TEXT,
      plan_id TEXT,
      billing_period_start TIMESTAMPTZ,
      billing_period_end TIMESTAMPTZ,
      status TEXT NOT NULL DEFAULT 'unassigned',
      assigned_to TEXT,
      assigned_at TIMESTAMPTZ,
      current_attempt INTEGER NOT NULL DEFAULT 0,
      next_attempt_at TIMESTAMPTZ,
      total_amount_due BIGINT NOT NULL DEFAULT 0,
      currency_code TEXT NOT NULL DEFAULT 'USD',
      awaiting_amount BIGINT,
      close_reason TEXT,
      collected_by TEXT,
      collected_at TIMESTAMPTZ,
      reopened_count INTEGER NOT NULL DEFAULT 0,
      latest_freescout_conversation_id BIGINT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
  await queryOpsDb(`
    CREATE TABLE IF NOT EXISTS ops_collection_invoices (
      id BIGSERIAL PRIMARY KEY,
      case_id BIGINT NOT NULL REFERENCES ops_collection_cases(id) ON DELETE CASCADE,
      invoice_id TEXT NOT NULL,
      failed_event_id TEXT,
      amount_failed BIGINT NOT NULL DEFAULT 0,
      amount_due BIGINT NOT NULL DEFAULT 0,
      amount_paid BIGINT NOT NULL DEFAULT 0,
      currency_code TEXT NOT NULL DEFAULT 'USD',
      invoice_status TEXT,
      failure_date TIMESTAMPTZ,
      paid_at TIMESTAMPTZ,
      payload JSONB NOT NULL DEFAULT '{}'::jsonb,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE(case_id, invoice_id)
    )
  `);
  await queryOpsDb(`
    CREATE TABLE IF NOT EXISTS ops_collection_attempts (
      id BIGSERIAL PRIMARY KEY,
      case_id BIGINT NOT NULL REFERENCES ops_collection_cases(id) ON DELETE CASCADE,
      attempt_number INTEGER NOT NULL,
      agent_email TEXT NOT NULL,
      outcome TEXT NOT NULL,
      notes TEXT NOT NULL,
      collected BOOLEAN,
      claimed_amount BIGINT,
      reason_category TEXT,
      freescout_conversation_id BIGINT,
      scheduled_for TIMESTAMPTZ,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
  await queryOpsDb(`
    CREATE TABLE IF NOT EXISTS ops_collection_events (
      id BIGSERIAL PRIMARY KEY,
      case_id BIGINT NOT NULL REFERENCES ops_collection_cases(id) ON DELETE CASCADE,
      actor_email TEXT NOT NULL,
      event_type TEXT NOT NULL,
      source_webhook_id TEXT,
      details JSONB NOT NULL DEFAULT '{}'::jsonb,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
  await queryOpsDb(`CREATE INDEX IF NOT EXISTS idx_collection_cases_status_due ON ops_collection_cases(status, next_attempt_at)`);
  await queryOpsDb(`CREATE INDEX IF NOT EXISTS idx_collection_cases_assignee ON ops_collection_cases(assigned_to, status)`);
  await queryOpsDb(`CREATE INDEX IF NOT EXISTS idx_collection_cases_customer ON ops_collection_cases(customer_email)`);
  await queryOpsDb(`CREATE INDEX IF NOT EXISTS idx_collection_invoices_invoice ON ops_collection_invoices(invoice_id)`);
  await queryOpsDb(`ALTER TABLE ops_collection_cases ADD COLUMN IF NOT EXISTS admin_disposition TEXT`);
  await queryOpsDb(`ALTER TABLE ops_collection_cases ADD COLUMN IF NOT EXISTS admin_actor TEXT`);
  await queryOpsDb(`ALTER TABLE ops_collection_cases ADD COLUMN IF NOT EXISTS admin_note TEXT`);
  await queryOpsDb(`ALTER TABLE ops_collection_cases ADD COLUMN IF NOT EXISTS admin_action_at TIMESTAMPTZ`);
  await queryOpsDb(`CREATE UNIQUE INDEX IF NOT EXISTS idx_collection_webhook_event ON ops_collection_events(source_webhook_id, event_type) WHERE source_webhook_id IS NOT NULL`);
  await queryOpsDb(`ALTER TABLE ops_chargebee_webhook_events ADD COLUMN IF NOT EXISTS processing_attempts INTEGER NOT NULL DEFAULT 0`);
  await queryOpsDb(`ALTER TABLE ops_chargebee_webhook_events ADD COLUMN IF NOT EXISTS processing_error TEXT`);
  await queryOpsDb(`ALTER TABLE ops_chargebee_webhook_events ADD COLUMN IF NOT EXISTS processed_at TIMESTAMPTZ`);
}

export async function addCollectionEvent(caseId: number, actor: string, eventType: string, details: JsonRecord = {}, webhookId?: string | null) {
  await queryOpsDb(
    `INSERT INTO ops_collection_events (case_id, actor_email, event_type, source_webhook_id, details)
     VALUES ($1,$2,$3,$4,$5::jsonb)
     ON CONFLICT DO NOTHING`,
    [caseId, actor, eventType, webhookId || null, JSON.stringify(details)]
  );
}

const CT_ZONE = 'America/Chicago';

function zonedParts(date: Date) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: CT_ZONE,
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
    hourCycle: 'h23', weekday: 'short',
  }).formatToParts(date);
  const values = Object.fromEntries(parts.map(part => [part.type, part.value]));
  return {
    year: Number(values.year), month: Number(values.month), day: Number(values.day),
    hour: Number(values.hour), minute: Number(values.minute), second: Number(values.second),
    weekday: values.weekday,
  };
}

function centralDate(year: number, month: number, day: number, hour: number) {
  let guess = new Date(Date.UTC(year, month - 1, day, hour, 0, 0));
  for (let i = 0; i < 3; i += 1) {
    const actual = zonedParts(guess);
    const desiredMs = Date.UTC(year, month - 1, day, hour, 0, 0);
    const actualMs = Date.UTC(actual.year, actual.month - 1, actual.day, actual.hour, actual.minute, actual.second);
    guess = new Date(guess.getTime() + desiredMs - actualMs);
  }
  return guess;
}

function addCalendarDays(parts: ReturnType<typeof zonedParts>, days: number) {
  const date = new Date(Date.UTC(parts.year, parts.month - 1, parts.day + days, 12));
  return { year: date.getUTCFullYear(), month: date.getUTCMonth() + 1, day: date.getUTCDate() };
}

function isWeekend(date: Date) {
  const weekday = zonedParts(date).weekday;
  return weekday === 'Sat' || weekday === 'Sun';
}

function nextWeekdayAt(parts: ReturnType<typeof zonedParts>, days: number, hour: number) {
  let candidateParts = addCalendarDays(parts, days);
  let candidate = centralDate(candidateParts.year, candidateParts.month, candidateParts.day, hour);
  while (isWeekend(candidate)) {
    candidateParts = addCalendarDays(zonedParts(candidate), 1);
    candidate = centralDate(candidateParts.year, candidateParts.month, candidateParts.day, hour);
  }
  return candidate;
}

export function nextCollectionWindow(from = new Date()) {
  const parts = zonedParts(from);
  if (parts.weekday === 'Sat' || parts.weekday === 'Sun') return nextWeekdayAt(parts, 1, 9);
  if (parts.hour < 9) return centralDate(parts.year, parts.month, parts.day, 9);
  if (parts.hour < 14) return centralDate(parts.year, parts.month, parts.day, 14);
  return nextWeekdayAt(parts, 1, 9);
}

export function followUpWindow(from = new Date(), nextAttemptNumber = 2) {
  const parts = zonedParts(from);
  if (nextAttemptNumber >= 3) return nextWeekdayAt(parts, 1, 9);
  if (parts.weekday === 'Sat' || parts.weekday === 'Sun') return nextWeekdayAt(parts, 1, 9);
  if (parts.hour < 14) return centralDate(parts.year, parts.month, parts.day, 14);
  return nextWeekdayAt(parts, 1, 9);
}

function invoiceDetails(payload: ChargebeeWebhookPayload) {
  const content = record(payload.content);
  const invoice = record(content.invoice);
  const subscription = record(content.subscription);
  const customer = record(content.customer);
  const transaction = record(content.transaction);
  const invoiceId = text(invoice.id) || text(transaction.invoice_id) || `event:${payload.id}`;
  const subscriptionId = text(subscription.id) || text(invoice.subscription_id) || text(transaction.subscription_id);
  const customerId = text(customer.id) || text(subscription.customer_id) || text(invoice.customer_id) || text(transaction.customer_id);
  const amountDue = cents(invoice.amount_due ?? invoice.total ?? transaction.amount);
  const amountPaid = cents(invoice.amount_paid);
  return {
    content, invoice, subscription, customer, transaction,
    invoiceId, subscriptionId, customerId,
    caseKey: subscriptionId ? `subscription:${subscriptionId}` : `invoice:${invoiceId}`,
    amountDue,
    amountPaid,
    currencyCode: text(invoice.currency_code) || text(transaction.currency_code) || 'USD',
  };
}

function caseSnapshot(details: ReturnType<typeof invoiceDetails>) {
  const { customer, subscription, invoice } = details;
  return {
    customerName: [customer.first_name, customer.last_name].filter(Boolean).join(' ') || text(customer.company) || text(customer.email),
    customerEmail: text(customer.email) || text(invoice.customer_email),
    customerPhone: text(customer.phone) || text(customer.billing_address?.phone),
    subscriptionStatus: text(subscription.status),
    planId: text(subscription.plan_id) || text(subscription.subscription_items?.find?.((item: any) => item.item_type === 'plan')?.item_price_id),
    billingStart: epoch(subscription.current_term_start),
    billingEnd: epoch(subscription.current_term_end),
  };
}

function money(amount: number, currency: string) {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: currency || 'USD' }).format(amount / 100);
}

async function notifyNewCase(caseRow: any, invoiceId: string) {
  const result = await postToSlack([
    { type: 'header', text: { type: 'plain_text', text: 'Collections: Failed Payment', emoji: true } },
    { type: 'section', fields: [
      { type: 'mrkdwn', text: `*Customer*\n${caseRow.customer_name || caseRow.customer_email || caseRow.customer_id || 'Unknown'}` },
      { type: 'mrkdwn', text: `*Amount Due*\n${money(Number(caseRow.total_amount_due), caseRow.currency_code)}` },
      { type: 'mrkdwn', text: `*Subscription*\n${caseRow.subscription_id || 'Invoice-only case'}` },
      { type: 'mrkdwn', text: `*Invoice*\n${invoiceId}` },
    ] },
    { type: 'section', text: { type: 'mrkdwn', text: `Case *#${caseRow.id}* is now available in the unassigned Collections queue.` } },
  ], `Collections case #${caseRow.id} created for failed payment`, COLLECTIONS_SLACK_CHANNEL);
  if (!result.ok) await addCollectionEvent(caseRow.id, 'system', 'slack_notification_failed', { error: result.error || 'Unknown Slack error' });
}

async function recalculateCaseBalance(caseId: number) {
  const result = await queryOpsDb(
    `UPDATE ops_collection_cases c SET
       total_amount_due = totals.amount_due,
       currency_code = totals.currency_code,
       updated_at = NOW()
     FROM (
       SELECT case_id, COALESCE(SUM(amount_due), 0)::bigint AS amount_due, MAX(currency_code) AS currency_code
       FROM ops_collection_invoices WHERE case_id = $1 GROUP BY case_id
     ) totals
     WHERE c.id = totals.case_id
     RETURNING c.*`,
    [caseId]
  );
  return result.rows[0];
}

async function handlePaymentFailed(payload: ChargebeeWebhookPayload) {
  const details = invoiceDetails(payload);
  const snapshot = caseSnapshot(details);
  const existingResult = await queryOpsDb('SELECT * FROM ops_collection_cases WHERE case_key = $1 LIMIT 1', [details.caseKey]);
  const existing = existingResult.rows[0];

  if (existing?.status === 'canceled' || existing?.subscription_status === 'canceled') {
    await addCollectionEvent(existing.id, 'chargebee', 'failed_payment_ignored_canceled', { invoiceId: details.invoiceId }, payload.id);
    return existing.id;
  }

  let caseRow = existing;
  let created = false;
  if (!caseRow) {
    const inserted = await queryOpsDb(
      `INSERT INTO ops_collection_cases (
        case_key, customer_id, customer_name, customer_email, customer_phone,
        subscription_id, subscription_status, plan_id, billing_period_start, billing_period_end,
        status, total_amount_due, currency_code
      ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,'unassigned',0,$11)
      RETURNING *`,
      [
        details.caseKey, details.customerId, snapshot.customerName, snapshot.customerEmail, snapshot.customerPhone,
        details.subscriptionId, snapshot.subscriptionStatus, snapshot.planId, snapshot.billingStart, snapshot.billingEnd,
        details.currencyCode,
      ]
    );
    caseRow = inserted.rows[0];
    created = true;
  } else if (['collected', 'exhausted', ...COLLECTIONS_ADMIN_TERMINAL_STATUSES].includes(caseRow.status)) {
    const reopened = await queryOpsDb(
      `UPDATE ops_collection_cases SET
        status = 'unassigned', assigned_to = NULL, assigned_at = NULL, current_attempt = 0,
        next_attempt_at = NULL, awaiting_amount = NULL, close_reason = NULL, collected_by = NULL,
        collected_at = NULL, admin_disposition = NULL, admin_actor = NULL, admin_note = NULL,
        admin_action_at = NULL, reopened_count = reopened_count + 1,
        customer_id = COALESCE($2, customer_id), customer_name = COALESCE($3, customer_name),
        customer_email = COALESCE($4, customer_email), customer_phone = COALESCE($5, customer_phone),
        subscription_status = COALESCE($6, subscription_status), plan_id = COALESCE($7, plan_id),
        billing_period_start = COALESCE($8, billing_period_start), billing_period_end = COALESCE($9, billing_period_end),
        updated_at = NOW()
       WHERE id = $1 RETURNING *`,
      [caseRow.id, details.customerId, snapshot.customerName, snapshot.customerEmail, snapshot.customerPhone,
       snapshot.subscriptionStatus, snapshot.planId, snapshot.billingStart, snapshot.billingEnd]
    );
    caseRow = reopened.rows[0];
    await addCollectionEvent(caseRow.id, 'chargebee', 'case_reopened', {
      invoiceId: details.invoiceId,
      previousStatus: existing.status,
      message: 'Reopened because another invoice failed after the previous collections case.',
    }, payload.id);
  }

  await queryOpsDb(
    `INSERT INTO ops_collection_invoices (
      case_id, invoice_id, failed_event_id, amount_failed, amount_due, amount_paid,
      currency_code, invoice_status, failure_date, payload
    ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10::jsonb)
    ON CONFLICT (case_id, invoice_id) DO UPDATE SET
      failed_event_id = EXCLUDED.failed_event_id,
      amount_failed = GREATEST(ops_collection_invoices.amount_failed, EXCLUDED.amount_failed),
      amount_due = EXCLUDED.amount_due, amount_paid = EXCLUDED.amount_paid,
      invoice_status = EXCLUDED.invoice_status, failure_date = EXCLUDED.failure_date,
      payload = EXCLUDED.payload, updated_at = NOW()`,
    [
      caseRow.id, details.invoiceId, payload.id, details.amountDue, details.amountDue, details.amountPaid,
      details.currencyCode, text(details.invoice.status) || 'payment_due',
      epoch(payload.occurred_at) || new Date(), JSON.stringify(details.invoice),
    ]
  );
  caseRow = await recalculateCaseBalance(caseRow.id);
  await addCollectionEvent(caseRow.id, 'chargebee', created ? 'case_created' : 'failed_invoice_added', {
    invoiceId: details.invoiceId,
    amountDue: details.amountDue,
    currencyCode: details.currencyCode,
  }, payload.id);
  if (created || ['collected', 'exhausted', ...COLLECTIONS_ADMIN_TERMINAL_STATUSES].includes(existing?.status)) {
    await notifyNewCase(caseRow, details.invoiceId);
  }
  return caseRow.id;
}

async function handlePaymentSucceeded(payload: ChargebeeWebhookPayload) {
  let details = invoiceDetails(payload);
  if (details.invoiceId && !details.invoiceId.startsWith('event:')) {
    const liveInvoice = await new ChargebeeService().getInvoice(details.invoiceId);
    if (liveInvoice) {
      payload = { ...payload, content: { ...payload.content, invoice: liveInvoice } };
      details = invoiceDetails(payload);
    }
  }
  const invoiceResult = await queryOpsDb(
    `SELECT i.id AS collection_invoice_row_id, i.case_id AS collection_case_id,
       i.invoice_status, c.assigned_to
     FROM ops_collection_invoices i
     JOIN ops_collection_cases c ON c.id = i.case_id
     WHERE i.invoice_id = $1 ORDER BY i.created_at DESC LIMIT 1`,
    [details.invoiceId]
  );
  const current = invoiceResult.rows[0];
  if (!current) return null;

  const remaining = details.amountDue;
  await queryOpsDb(
    `UPDATE ops_collection_invoices SET amount_due = $1, amount_paid = $2,
       invoice_status = $3, paid_at = CASE WHEN $1::bigint = 0 THEN NOW() ELSE paid_at END,
       payload = $4::jsonb, updated_at = NOW()
     WHERE id = $5`,
    [remaining, details.amountPaid, text(details.invoice.status) || (remaining === 0 ? 'paid' : current.invoice_status), JSON.stringify(details.invoice), current.collection_invoice_row_id]
  );
  const caseRow = await recalculateCaseBalance(current.collection_case_id);
  if (Number(caseRow.total_amount_due) === 0 && !COLLECTIONS_ADMIN_TERMINAL_STATUSES.includes(caseRow.status)) {
    await queryOpsDb(
      `UPDATE ops_collection_cases SET status = 'collected', close_reason = 'Chargebee confirmed invoice paid',
       collected_by = COALESCE(assigned_to, collected_by), collected_at = NOW(), next_attempt_at = NULL,
       awaiting_amount = NULL, updated_at = NOW() WHERE id = $1`,
      [current.collection_case_id]
    );
    await addCollectionEvent(current.collection_case_id, 'chargebee', 'invoice_paid_case_collected', { invoiceId: details.invoiceId }, payload.id);
  } else if (Number(caseRow.total_amount_due) === 0) {
    await addCollectionEvent(current.collection_case_id, 'chargebee', 'invoice_paid_after_admin_closure', {
      invoiceId: details.invoiceId,
      caseStatus: caseRow.status,
    }, payload.id);
  } else {
    await addCollectionEvent(current.collection_case_id, 'chargebee', 'partial_payment_received', {
      invoiceId: details.invoiceId, remainingAmount: Number(caseRow.total_amount_due),
    }, payload.id);
  }
  return current.collection_case_id;
}

async function handleSubscriptionState(payload: ChargebeeWebhookPayload, state: 'paused' | 'resumed' | 'canceled') {
  const details = invoiceDetails(payload);
  if (!details.subscriptionId) return null;
  const result = await queryOpsDb('SELECT * FROM ops_collection_cases WHERE case_key = $1 LIMIT 1', [`subscription:${details.subscriptionId}`]);
  const caseRow = result.rows[0];
  if (!caseRow) return null;

  if (COLLECTIONS_ADMIN_TERMINAL_STATUSES.includes(caseRow.status) && state !== 'canceled') {
    await queryOpsDb(
      `UPDATE ops_collection_cases SET subscription_status = $1, updated_at = NOW() WHERE id = $2`,
      [state === 'resumed' ? 'active' : state, caseRow.id]
    );
    await addCollectionEvent(caseRow.id, 'chargebee', `subscription_${state}_after_admin_closure`, {
      subscriptionId: details.subscriptionId,
      caseStatus: caseRow.status,
    }, payload.id);
    return caseRow.id;
  }

  if (state === 'paused') {
    await queryOpsDb(`UPDATE ops_collection_cases SET status = 'paused', subscription_status = 'paused', next_attempt_at = NULL, updated_at = NOW() WHERE id = $1`, [caseRow.id]);
  } else if (state === 'resumed') {
    const status = caseRow.assigned_to ? 'follow_up_pending' : 'unassigned';
    await queryOpsDb(`UPDATE ops_collection_cases SET status = $1, subscription_status = 'active', next_attempt_at = CASE WHEN assigned_to IS NOT NULL THEN NOW() ELSE NULL END, updated_at = NOW() WHERE id = $2`, [status, caseRow.id]);
  } else {
    await queryOpsDb(`UPDATE ops_collection_cases SET status = 'canceled', subscription_status = 'canceled', close_reason = 'Customer canceled', next_attempt_at = NULL, updated_at = NOW() WHERE id = $1`, [caseRow.id]);
  }
  await addCollectionEvent(caseRow.id, 'chargebee', `subscription_${state}`, { subscriptionId: details.subscriptionId }, payload.id);
  return caseRow.id;
}

export async function processChargebeeCollectionsEvent(payload: ChargebeeWebhookPayload) {
  await ensureCollectionsTables();
  const eventType = payload.event_type;
  if (eventType === 'payment_failed') return handlePaymentFailed(payload);
  if (['payment_succeeded', 'invoice_paid'].includes(eventType)) return handlePaymentSucceeded(payload);
  if (eventType === 'subscription_paused') return handleSubscriptionState(payload, 'paused');
  if (eventType === 'subscription_resumed') return handleSubscriptionState(payload, 'resumed');
  if (['subscription_cancelled', 'subscription_canceled'].includes(eventType)) return handleSubscriptionState(payload, 'canceled');
  return null;
}

export async function sendDueCollectionReminders() {
  await ensureCollectionsTables();
  const due = await queryOpsDb(
    `SELECT * FROM ops_collection_cases
     WHERE status IN ('assigned','follow_up_pending','awaiting_payment_confirmation')
       AND next_attempt_at IS NOT NULL AND next_attempt_at <= NOW()
       AND current_attempt < 3
       AND NOT EXISTS (
         SELECT 1 FROM ops_collection_events e
         WHERE e.case_id = ops_collection_cases.id
           AND e.event_type = 'due_reminder_sent'
           AND (e.details->>'attemptNumber')::int = ops_collection_cases.current_attempt + 1
           AND e.created_at >= ops_collection_cases.next_attempt_at
       )
     ORDER BY next_attempt_at ASC LIMIT 100`
  );
  let sent = 0;
  for (const row of due.rows) {
    const slackId = row.assigned_to ? resolveSlackId(row.assigned_to) : null;
    const mention = slackId ? `<@${slackId}> ` : '';
    const result = await postToSlack([
      { type: 'header', text: { type: 'plain_text', text: 'Collections Follow-up Due', emoji: true } },
      { type: 'section', text: { type: 'mrkdwn', text: `${mention}Case *#${row.id}* is due for attempt *${Number(row.current_attempt) + 1} of 3*.` } },
      { type: 'section', fields: [
        { type: 'mrkdwn', text: `*Customer*\n${row.customer_name || row.customer_email || 'Unknown'}` },
        { type: 'mrkdwn', text: `*Amount Due*\n${money(Number(row.total_amount_due), row.currency_code)}` },
      ] },
    ], `Collections follow-up due for case #${row.id}`, COLLECTIONS_SLACK_CHANNEL);
    await addCollectionEvent(row.id, 'scheduler', result.ok ? 'due_reminder_sent' : 'due_reminder_failed', {
      attemptNumber: Number(row.current_attempt) + 1,
      error: result.ok ? null : result.error,
    });
    if (result.ok) sent += 1;
  }
  return { checked: due.rows.length, sent };
}

export function chargebeeProfileUrl(subscriptionId?: string | null, customerId?: string | null) {
  const site = getSetting('chargebee_site');
  if (!site) return null;
  if (subscriptionId) return `https://${site}.chargebee.com/subscriptions/${encodeURIComponent(subscriptionId)}`;
  if (customerId) return `https://${site}.chargebee.com/customers/${encodeURIComponent(customerId)}`;
  return null;
}
