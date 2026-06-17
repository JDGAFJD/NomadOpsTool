import { queryOpsDb } from '@/lib/opsDb';

export const CALLBACK_DEPARTMENTS = {
  sales: ['product_inquiry', 'recommendation', 'pricing_promotion', 'upgrade_additional_line', 'order_assistance', 'other'],
  internet: ['no_connectivity', 'slow_intermittent', 'activation_setup', 'coverage_signal', 'device_troubleshooting', 'outage_follow_up', 'other'],
  shipment: ['order_status', 'tracking', 'delayed_lost', 'address_correction', 'damaged_missing_item', 'replacement_return_shipment', 'other'],
  billing: ['payment_failure', 'invoice_question', 'incorrect_duplicate_charge', 'refund_credit', 'pricing_change', 'cancellation_billing', 'other'],
  general_support: ['account_profile', 'login', 'device_help', 'documentation', 'complaint_escalation', 'other'],
  cancellation: ['cancel_service', 'retention_request', 'equipment_return', 'final_bill_refund', 'pause_suspend', 'other'],
} as const;

export const CALLBACK_TIME_PREFERENCES = ['morning', 'afternoon', 'working_hours'] as const;
export const CALLBACK_ACTIVE_STATUSES = ['unassigned', 'assigned'] as const;
export const CALLBACK_TERMINAL_STATUSES = ['completed', 'left_voicemail', 'no_answer'] as const;

export function countWords(value: string) {
  return value.trim().split(/\s+/).filter(Boolean).length;
}

export function isCallbackDepartment(value: unknown): value is keyof typeof CALLBACK_DEPARTMENTS {
  return typeof value === 'string' && value in CALLBACK_DEPARTMENTS;
}

export function isCallbackCategory(department: keyof typeof CALLBACK_DEPARTMENTS, value: unknown) {
  return typeof value === 'string' && (CALLBACK_DEPARTMENTS[department] as readonly string[]).includes(value);
}

export async function ensureCallbackTables() {
  await queryOpsDb(`
    CREATE TABLE IF NOT EXISTS ops_callbacks (
      id SERIAL PRIMARY KEY,
      customer_email TEXT NOT NULL,
      customer_id TEXT,
      customer_name TEXT,
      primary_phone TEXT NOT NULL,
      secondary_phone TEXT,
      phone_source TEXT NOT NULL,
      department TEXT NOT NULL,
      category TEXT NOT NULL,
      reason TEXT NOT NULL,
      preferred_time TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'unassigned',
      requested_by TEXT NOT NULL,
      assigned_to TEXT,
      account_snapshot JSONB NOT NULL DEFAULT '{}'::jsonb,
      freescout_conversation_id BIGINT,
      slack_channel TEXT,
      slack_ts TEXT,
      slack_error TEXT,
      due_at TIMESTAMPTZ NOT NULL DEFAULT (NOW() + INTERVAL '24 hours'),
      assigned_at TIMESTAMPTZ,
      completed_at TIMESTAMPTZ,
      outcome_notes TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
  await queryOpsDb(`
    CREATE TABLE IF NOT EXISTS ops_callback_events (
      id SERIAL PRIMARY KEY,
      callback_id INTEGER NOT NULL REFERENCES ops_callbacks(id) ON DELETE CASCADE,
      actor_email TEXT NOT NULL,
      event_type TEXT NOT NULL,
      details JSONB NOT NULL DEFAULT '{}'::jsonb,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
  await queryOpsDb(`CREATE INDEX IF NOT EXISTS idx_callbacks_status_created ON ops_callbacks(status, created_at)`);
  await queryOpsDb(`ALTER TABLE ops_callbacks ADD COLUMN IF NOT EXISTS slack_channel TEXT`);
  await queryOpsDb(`ALTER TABLE ops_callbacks ADD COLUMN IF NOT EXISTS slack_ts TEXT`);
  await queryOpsDb(`ALTER TABLE ops_callbacks ADD COLUMN IF NOT EXISTS slack_error TEXT`);
  await queryOpsDb(`CREATE INDEX IF NOT EXISTS idx_callbacks_assignee_status ON ops_callbacks(assigned_to, status)`);
  await queryOpsDb(`CREATE INDEX IF NOT EXISTS idx_callbacks_customer_status ON ops_callbacks(customer_email, status)`);
  await queryOpsDb(`CREATE INDEX IF NOT EXISTS idx_callbacks_due_at ON ops_callbacks(due_at)`);
  await queryOpsDb(`
    CREATE UNIQUE INDEX IF NOT EXISTS idx_callbacks_one_active_customer
    ON ops_callbacks(LOWER(customer_email))
    WHERE status IN ('unassigned', 'assigned')
  `);
  await queryOpsDb(`CREATE INDEX IF NOT EXISTS idx_callback_events_callback ON ops_callback_events(callback_id, created_at)`);
}

export async function addCallbackEvent(callbackId: number, actorEmail: string, eventType: string, details: Record<string, unknown> = {}) {
  await queryOpsDb(
    `INSERT INTO ops_callback_events (callback_id, actor_email, event_type, details)
     VALUES ($1, $2, $3, $4::jsonb)`,
    [callbackId, actorEmail, eventType, JSON.stringify(details)]
  );
}
