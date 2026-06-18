import { queryOpsDb } from '@/lib/opsDb';

export type ChargebeeWebhookPayload = {
  id: string;
  event_type: string;
  api_version?: string;
  source?: string;
  occurred_at?: number;
  content: Record<string, unknown>;
};

export async function ensureChargebeeWebhookTable() {
  await queryOpsDb(`
    CREATE TABLE IF NOT EXISTS ops_chargebee_webhook_events (
      id BIGSERIAL PRIMARY KEY,
      chargebee_event_id TEXT NOT NULL UNIQUE,
      event_type TEXT NOT NULL,
      api_version TEXT,
      source TEXT,
      occurred_at TIMESTAMPTZ,
      customer_id TEXT,
      subscription_id TEXT,
      invoice_id TEXT,
      payload JSONB NOT NULL,
      processing_status TEXT NOT NULL DEFAULT 'received',
      processing_attempts INTEGER NOT NULL DEFAULT 0,
      processing_error TEXT,
      processed_at TIMESTAMPTZ,
      duplicate_count INTEGER NOT NULL DEFAULT 0,
      received_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      last_received_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
  await queryOpsDb(`
    CREATE INDEX IF NOT EXISTS idx_chargebee_webhooks_received
    ON ops_chargebee_webhook_events(received_at DESC)
  `);
  await queryOpsDb(`
    CREATE INDEX IF NOT EXISTS idx_chargebee_webhooks_type
    ON ops_chargebee_webhook_events(event_type, received_at DESC)
  `);
  await queryOpsDb(`
    CREATE INDEX IF NOT EXISTS idx_chargebee_webhooks_customer
    ON ops_chargebee_webhook_events(customer_id)
  `);
  await queryOpsDb(`
    CREATE INDEX IF NOT EXISTS idx_chargebee_webhooks_subscription
    ON ops_chargebee_webhook_events(subscription_id)
  `);
  await queryOpsDb(`ALTER TABLE ops_chargebee_webhook_events ADD COLUMN IF NOT EXISTS processing_attempts INTEGER NOT NULL DEFAULT 0`);
  await queryOpsDb(`ALTER TABLE ops_chargebee_webhook_events ADD COLUMN IF NOT EXISTS processing_error TEXT`);
  await queryOpsDb(`ALTER TABLE ops_chargebee_webhook_events ADD COLUMN IF NOT EXISTS processed_at TIMESTAMPTZ`);
}

function nestedRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function stringValue(value: unknown) {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

export function extractChargebeeReferences(content: Record<string, unknown>) {
  const customer = nestedRecord(content.customer);
  const subscription = nestedRecord(content.subscription);
  const invoice = nestedRecord(content.invoice);

  return {
    customerId:
      stringValue(customer?.id) ||
      stringValue(subscription?.customer_id) ||
      stringValue(invoice?.customer_id),
    subscriptionId:
      stringValue(subscription?.id) ||
      stringValue(invoice?.subscription_id),
    invoiceId: stringValue(invoice?.id),
  };
}

export function isChargebeeWebhookPayload(value: unknown): value is ChargebeeWebhookPayload {
  const payload = nestedRecord(value);
  return Boolean(
    payload &&
    stringValue(payload.id) &&
    stringValue(payload.event_type) &&
    nestedRecord(payload.content)
  );
}

export async function recordChargebeeWebhook(payload: ChargebeeWebhookPayload) {
  await ensureChargebeeWebhookTable();

  const references = extractChargebeeReferences(payload.content);
  const occurredAt = typeof payload.occurred_at === 'number'
    ? new Date(payload.occurred_at * 1000)
    : null;

  const result = await queryOpsDb(
    `INSERT INTO ops_chargebee_webhook_events (
       chargebee_event_id, event_type, api_version, source, occurred_at,
       customer_id, subscription_id, invoice_id, payload
     ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9::jsonb)
     ON CONFLICT (chargebee_event_id) DO UPDATE SET
       duplicate_count = ops_chargebee_webhook_events.duplicate_count + 1,
       last_received_at = NOW()
     RETURNING id, duplicate_count, received_at, last_received_at`,
    [
      payload.id,
      payload.event_type,
      stringValue(payload.api_version),
      stringValue(payload.source),
      occurredAt,
      references.customerId,
      references.subscriptionId,
      references.invoiceId,
      JSON.stringify(payload),
    ]
  );

  const row = result.rows[0];
  return {
    databaseId: Number(row.id),
    id: row.id,
    duplicate: Number(row.duplicate_count) > 0,
    duplicateCount: Number(row.duplicate_count),
    receivedAt: row.received_at,
    lastReceivedAt: row.last_received_at,
  };
}
