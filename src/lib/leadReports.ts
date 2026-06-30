import 'server-only';

import { createHash } from 'node:crypto';
import { parseCallReportCsv, type ParsedCallReportRow } from '@/lib/callReports';
import { phoneMatchKey } from '@/lib/callVerification';
import { logActivity, queryOpsDb, withOpsDbTransaction } from '@/lib/opsDb';
import { ChargebeeService } from '@/lib/services/ChargebeeService';
import { CommerceService } from '@/lib/services/CommerceService';

const CENTRAL_ZONE = 'America/Chicago';
const PAGE_SIZE = 100;
const DYNAMIC_PENDING_ID_OFFSET = 9_000_000_000;
const INLINE_CONVERSION_LEAD_LIMIT = 100;

type LeadRow = {
  id: number;
  name: string | null;
  email: string | null;
  mobile_number: string | null;
  zip_code: string | null;
  use_location: string | null;
  uses: string | null;
  created_at: Date;
  freescout_ticket_id: string | null;
  freescout_ticket_url: string | null;
};

type ConversionSnapshot = {
  shopify: ConversionState;
  chargebee: ConversionState;
  converted: boolean;
  unavailable: boolean;
};

type ConversionState = {
  state: 'converted_after_lead' | 'existing_before_lead' | 'not_found' | 'unavailable';
  label: string;
  count: number;
  firstDate: string | null;
  latestDate: string | null;
  references: string[];
  error?: string;
};

function sha256(value: string) {
  return createHash('sha256').update(value).digest('hex');
}

function normalizeFullPhone(value: string | null | undefined) {
  return String(value || '').replace(/\D/g, '');
}

function normalizeSearch(value: string | null | undefined) {
  return String(value || '').trim().toLowerCase();
}

function phoneMatchKeySql(expression: string) {
  const digits = `REGEXP_REPLACE(COALESCE(${expression},''),'\\D','','g')`;
  return `(CASE WHEN LENGTH(${digits}) >= 7 THEN RIGHT(${digits},7) ELSE '' END)`;
}

function duplicateKey(lead: LeadRow) {
  const phone = normalizeFullPhone(lead.mobile_number);
  if (phone) return `phone:${phone}`;
  const email = normalizeSearch(lead.email);
  if (email) return `email:${email}`;
  return `namezip:${normalizeSearch(lead.name)}:${normalizeSearch(lead.zip_code)}`;
}

function durationSeconds(value: unknown) {
  const match = String(value || '').trim().match(/^(\d{1,3}):(\d{2}):(\d{2})$/);
  if (!match) return 0;
  return Number(match[1]) * 3600 + Number(match[2]) * 60 + Number(match[3]);
}

function centralDate(value: Date) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: CENTRAL_ZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(value);
  const map = Object.fromEntries(parts.map(part => [part.type, part.value]));
  return `${map.year}-${map.month}-${map.day}`;
}

function callMatchesByPhone(rows: ParsedCallReportRow[]) {
  const byPhone = new Map<string, ParsedCallReportRow[]>();
  for (const row of rows) {
    const key = phoneMatchKey(row.destinationPhone);
    if (!key) continue;
    const bucket = byPhone.get(key) || [];
    bucket.push(row);
    byPhone.set(key, bucket);
  }
  for (const rowsForPhone of byPhone.values()) {
    rowsForPhone.sort((a, b) => a.callTime.getTime() - b.callTime.getTime());
  }
  return byPhone;
}

function summarizeCalls(calls: ParsedCallReportRow[], leadCreatedAt: Date) {
  const answered = calls.filter(call => call.status === 'answered').length;
  const unanswered = calls.filter(call => call.status === 'unanswered').length;
  const talkingSeconds = calls.reduce((sum, call) => sum + call.talkingSeconds, 0);
  const ringingSeconds = calls.reduce((sum, call) => sum + call.ringingSeconds, 0);
  const totalSeconds = calls.reduce((sum, call) => sum + durationSeconds(call.raw['total duration']), 0);
  const firstCall = calls[0] || null;
  const agents = [...new Map(calls.map(call => [call.agentExtension, {
    extension: call.agentExtension,
    name: call.agentDisplayName,
    attempts: calls.filter(item => item.agentExtension === call.agentExtension).length,
  }])).values()];
  const outcomes = {
    answered,
    unanswered,
    connected: answered > 0,
    labels: [...new Set(calls.map(call => call.status === 'answered' ? 'Answered' : 'Unanswered'))],
  };
  return {
    attempts: calls.length,
    answered,
    unanswered,
    talkingSeconds,
    ringingSeconds,
    totalSeconds,
    firstCallAt: firstCall?.callTime || null,
    delaySeconds: firstCall ? Math.round((firstCall.callTime.getTime() - leadCreatedAt.getTime()) / 1000) : null,
    agents,
    outcomes,
    calls: calls.map(call => ({
      callTime: call.callTime.toISOString(),
      agentExtension: call.agentExtension,
      agentDisplayName: call.agentDisplayName,
      destinationPhone: call.destinationPhone,
      status: call.status,
      ringingSeconds: call.ringingSeconds,
      talkingSeconds: call.talkingSeconds,
      totalSeconds: durationSeconds(call.raw['total duration']),
    })),
  };
}

function makeConversionState(
  dates: { date: string | null; reference: string }[],
  leadCreatedAt: Date,
  entity: string
): ConversionState {
  const valid = dates
    .filter(item => item.date)
    .map(item => ({ ...item, time: new Date(item.date || '').getTime() }))
    .filter(item => Number.isFinite(item.time))
    .sort((a, b) => a.time - b.time);
  if (!valid.length) return { state: 'not_found', label: `No ${entity} found`, count: 0, firstDate: null, latestDate: null, references: [] };
  const after = valid.filter(item => item.time >= leadCreatedAt.getTime());
  const selected = after.length ? after : valid;
  const state = after.length ? 'converted_after_lead' : 'existing_before_lead';
  return {
    state,
    label: after.length ? `Converted after lead in ${entity}` : `Existing ${entity} record before lead`,
    count: valid.length,
    firstDate: new Date(valid[0].time).toISOString(),
    latestDate: new Date(valid[valid.length - 1].time).toISOString(),
    references: selected.slice(0, 5).map(item => item.reference),
  };
}

async function getConversionSnapshot(email: string | null, leadCreatedAt: Date): Promise<ConversionSnapshot> {
  if (!email) {
    const missing = { state: 'not_found' as const, label: 'No email to check', count: 0, firstDate: null, latestDate: null, references: [] };
    return { shopify: missing, chargebee: missing, converted: false, unavailable: false };
  }

  const commerce = new CommerceService();
  const chargebee = new ChargebeeService();
  let shopify: ConversionState;
  let chargebeeState: ConversionState;

  try {
    const orders = await commerce.getCustomerOrders(email);
    shopify = makeConversionState(orders.map(order => ({
      date: order.orderDate,
      reference: order.orderNumber || order.orderId,
    })), leadCreatedAt, 'Shopify');
  } catch (error: any) {
    shopify = { state: 'unavailable', label: 'Shopify check unavailable', count: 0, firstDate: null, latestDate: null, references: [], error: error?.message || 'Shopify check failed' };
  }

  try {
    const customerData = await chargebee.getCustomerData(email);
    if (!customerData.configured) {
      chargebeeState = { state: 'unavailable', label: 'Chargebee check unavailable', count: 0, firstDate: null, latestDate: null, references: [], error: 'Chargebee is not configured' };
    } else {
      const dates: { date: string | null; reference: string }[] = [];
      for (const customer of customerData.customers as any[]) {
        for (const subscription of customer.subscriptions || []) {
          const created = subscription.created_at ? new Date(Number(subscription.created_at) * 1000).toISOString() : null;
          dates.push({ date: created, reference: subscription.id || customer.id });
        }
        const invoices = await chargebee.getInvoices(customer.id);
        for (const invoice of invoices as any[]) {
          const invoiceDate = invoice.date ? new Date(Number(invoice.date) * 1000).toISOString() : null;
          dates.push({ date: invoiceDate, reference: invoice.id || customer.id });
        }
      }
      chargebeeState = makeConversionState(dates, leadCreatedAt, 'Chargebee');
    }
  } catch (error: any) {
    chargebeeState = { state: 'unavailable', label: 'Chargebee check unavailable', count: 0, firstDate: null, latestDate: null, references: [], error: error?.message || 'Chargebee check failed' };
  }

  return {
    shopify,
    chargebee: chargebeeState,
    converted: shopify.state === 'converted_after_lead' || chargebeeState.state === 'converted_after_lead',
    unavailable: shopify.state === 'unavailable' || chargebeeState.state === 'unavailable',
  };
}

function skippedConversionSnapshot(email: string | null): ConversionSnapshot {
  if (!email) {
    const missing = { state: 'not_found' as const, label: 'No email to check', count: 0, firstDate: null, latestDate: null, references: [] };
    return { shopify: missing, chargebee: missing, converted: false, unavailable: false };
  }
  const skipped = {
    state: 'unavailable' as const,
    label: 'Conversion check skipped for this large upload',
    count: 0,
    firstDate: null,
    latestDate: null,
    references: [],
    error: 'Upload was processed without Shopify/Chargebee enrichment to avoid a request timeout. Re-upload a smaller date range to include conversion checks.',
  };
  return { shopify: skipped, chargebee: skipped, converted: false, unavailable: true };
}

async function mapWithConcurrency<T, R>(items: T[], limit: number, worker: (item: T) => Promise<R>) {
  const results = new Array<R>(items.length);
  let cursor = 0;
  const runners = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (cursor < items.length) {
      const index = cursor;
      cursor += 1;
      results[index] = await worker(items[index]);
    }
  });
  await Promise.all(runners);
  return results;
}

export async function ensureLeadReportTables() {
  await queryOpsDb(`
    CREATE TABLE IF NOT EXISTS ops_customer_leads (
      name TEXT,
      email TEXT,
      mobile_number TEXT,
      zip_code TEXT,
      use_location TEXT,
      uses TEXT,
      first_name TEXT,
      last_name TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
  await queryOpsDb(`ALTER TABLE ops_customer_leads ADD COLUMN IF NOT EXISTS id BIGSERIAL`);
  await queryOpsDb(`CREATE SEQUENCE IF NOT EXISTS ops_customer_leads_id_seq`);
  await queryOpsDb(`ALTER TABLE ops_customer_leads ALTER COLUMN id SET DEFAULT nextval('ops_customer_leads_id_seq')`);
  await queryOpsDb(`UPDATE ops_customer_leads SET id=nextval('ops_customer_leads_id_seq') WHERE id IS NULL`);
  await queryOpsDb(`ALTER SEQUENCE ops_customer_leads_id_seq OWNED BY ops_customer_leads.id`);
  await queryOpsDb(`ALTER TABLE ops_customer_leads ADD COLUMN IF NOT EXISTS freescout_ticket_id TEXT`);
  await queryOpsDb(`ALTER TABLE ops_customer_leads ADD COLUMN IF NOT EXISTS freescout_ticket_url TEXT`);
  await queryOpsDb(`ALTER TABLE ops_customer_leads ADD COLUMN IF NOT EXISTS slack_message_ts TEXT`);
  await queryOpsDb(`ALTER TABLE ops_customer_leads ADD COLUMN IF NOT EXISTS source TEXT`);
  await queryOpsDb(`
    DO $$
    BEGIN
      IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conrelid = 'ops_customer_leads'::regclass AND contype = 'p'
      ) THEN
        ALTER TABLE ops_customer_leads ADD CONSTRAINT ops_customer_leads_pkey PRIMARY KEY (id);
      END IF;
    END $$;
  `);
  await queryOpsDb(`
    CREATE TABLE IF NOT EXISTS ops_lead_report_batches (
      id BIGSERIAL PRIMARY KEY,
      file_hash TEXT NOT NULL UNIQUE,
      file_name TEXT NOT NULL,
      uploaded_by TEXT NOT NULL,
      report_start_date DATE NOT NULL,
      report_end_date DATE NOT NULL,
      total_call_rows INTEGER NOT NULL DEFAULT 0,
      imported_call_rows INTEGER NOT NULL DEFAULT 0,
      ignored_call_rows INTEGER NOT NULL DEFAULT 0,
      rejected_call_rows INTEGER NOT NULL DEFAULT 0,
      total_leads INTEGER NOT NULL DEFAULT 0,
      called_leads INTEGER NOT NULL DEFAULT 0,
      not_called_leads INTEGER NOT NULL DEFAULT 0,
      pending_verification_leads INTEGER NOT NULL DEFAULT 0,
      duplicate_leads INTEGER NOT NULL DEFAULT 0,
      total_attempts INTEGER NOT NULL DEFAULT 0,
      answered_attempts INTEGER NOT NULL DEFAULT 0,
      unanswered_attempts INTEGER NOT NULL DEFAULT 0,
      converted_leads INTEGER NOT NULL DEFAULT 0,
      conversion_unavailable_leads INTEGER NOT NULL DEFAULT 0,
      average_delay_seconds INTEGER,
      total_talking_seconds INTEGER NOT NULL DEFAULT 0,
      latest_call_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
  await queryOpsDb(`ALTER TABLE ops_lead_report_batches ADD COLUMN IF NOT EXISTS pending_verification_leads INTEGER NOT NULL DEFAULT 0`);
  await queryOpsDb(`ALTER TABLE ops_lead_report_batches ADD COLUMN IF NOT EXISTS latest_call_at TIMESTAMPTZ`);
  await queryOpsDb(`
    UPDATE ops_lead_report_batches b
    SET latest_call_at=latest.max_call_time
    FROM (
      SELECT batch_id,MAX(call_time) AS max_call_time
      FROM ops_lead_report_call_rows
      GROUP BY batch_id
    ) latest
    WHERE b.id=latest.batch_id AND b.latest_call_at IS NULL
  `);
  await queryOpsDb(`
    CREATE TABLE IF NOT EXISTS ops_lead_report_call_rows (
      id BIGSERIAL PRIMARY KEY,
      batch_id BIGINT NOT NULL REFERENCES ops_lead_report_batches(id) ON DELETE CASCADE,
      fingerprint TEXT NOT NULL,
      report_date DATE NOT NULL,
      call_time TIMESTAMPTZ NOT NULL,
      agent_extension TEXT NOT NULL,
      agent_display_name TEXT NOT NULL,
      destination_phone TEXT NOT NULL,
      destination_match_key TEXT NOT NULL,
      status TEXT NOT NULL,
      ringing_seconds INTEGER NOT NULL DEFAULT 0,
      talking_seconds INTEGER NOT NULL DEFAULT 0,
      total_seconds INTEGER NOT NULL DEFAULT 0,
      raw JSONB NOT NULL DEFAULT '{}'::jsonb,
      UNIQUE(batch_id,fingerprint)
    )
  `);
  await queryOpsDb(`
    CREATE TABLE IF NOT EXISTS ops_lead_report_results (
      id BIGSERIAL PRIMARY KEY,
      batch_id BIGINT NOT NULL REFERENCES ops_lead_report_batches(id) ON DELETE CASCADE,
      lead_id BIGINT,
      lead_name TEXT,
      lead_email TEXT,
      lead_phone TEXT,
      lead_zip TEXT,
      use_location TEXT,
      uses TEXT,
      lead_created_at TIMESTAMPTZ NOT NULL,
      freescout_ticket_id TEXT,
      freescout_ticket_url TEXT,
      duplicate_key TEXT,
      duplicate_count INTEGER NOT NULL DEFAULT 1,
      is_duplicate BOOLEAN NOT NULL DEFAULT FALSE,
      match_key TEXT,
      call_status TEXT NOT NULL DEFAULT 'not_called',
      attempt_count INTEGER NOT NULL DEFAULT 0,
      answered_count INTEGER NOT NULL DEFAULT 0,
      unanswered_count INTEGER NOT NULL DEFAULT 0,
      first_call_at TIMESTAMPTZ,
      delay_seconds INTEGER,
      total_ringing_seconds INTEGER NOT NULL DEFAULT 0,
      total_talking_seconds INTEGER NOT NULL DEFAULT 0,
      total_call_seconds INTEGER NOT NULL DEFAULT 0,
      agents JSONB NOT NULL DEFAULT '[]'::jsonb,
      outcomes JSONB NOT NULL DEFAULT '{}'::jsonb,
      calls JSONB NOT NULL DEFAULT '[]'::jsonb,
      conversion_status TEXT NOT NULL DEFAULT 'not_converted',
      shopify_conversion JSONB NOT NULL DEFAULT '{}'::jsonb,
      chargebee_conversion JSONB NOT NULL DEFAULT '{}'::jsonb,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
  await queryOpsDb(`CREATE INDEX IF NOT EXISTS idx_ops_lead_report_results_batch ON ops_lead_report_results(batch_id,id)`);
  await queryOpsDb(`CREATE INDEX IF NOT EXISTS idx_ops_lead_report_results_filters ON ops_lead_report_results(batch_id,call_status,conversion_status,is_duplicate)`);
  await queryOpsDb(`CREATE INDEX IF NOT EXISTS idx_ops_lead_report_call_rows_batch ON ops_lead_report_call_rows(batch_id,call_time)`);
  await queryOpsDb(`
    UPDATE ops_lead_report_results r
    SET call_status='pending_verification'
    FROM ops_lead_report_batches b
    WHERE r.batch_id=b.id
      AND r.call_status='not_called'
      AND r.attempt_count=0
      AND r.match_key IS NOT NULL
      AND b.latest_call_at IS NOT NULL
      AND r.lead_created_at > b.latest_call_at
  `);
  await queryOpsDb(`
    UPDATE ops_lead_report_batches b
    SET pending_verification_leads=counts.pending,
        not_called_leads=counts.not_called
    FROM (
      SELECT batch_id,
             COUNT(*) FILTER (WHERE call_status='pending_verification')::int AS pending,
             COUNT(*) FILTER (WHERE attempt_count=0 AND call_status<>'pending_verification')::int AS not_called
      FROM ops_lead_report_results
      GROUP BY batch_id
    ) counts
    WHERE b.id=counts.batch_id
  `);
}

async function fetchLeadsForReport(startDate: string, endDate: string) {
  const result = await queryOpsDb(`
    SELECT id,name,email,mobile_number,zip_code,use_location,uses,created_at,freescout_ticket_id,freescout_ticket_url
    FROM ops_customer_leads
    WHERE (created_at AT TIME ZONE $3)::date BETWEEN $1::date AND $2::date
    ORDER BY created_at ASC,id ASC
  `, [startDate, endDate, CENTRAL_ZONE]);
  return result.rows as LeadRow[];
}

export async function importLeadReportCsv(input: { csv: string; fileName: string; uploadedBy: string; request?: Request }) {
  await ensureLeadReportTables();
  const parsed = parseCallReportCsv(input.csv);
  const fileHash = sha256(input.csv);
  const existing = await queryOpsDb(`SELECT * FROM ops_lead_report_batches WHERE file_hash=$1`, [fileHash]);
  if (existing.rows[0]) {
    return { duplicate: true, batch: existing.rows[0], parsed };
  }

  const leads = await fetchLeadsForReport(parsed.reportStartDate, parsed.reportEndDate);
  const duplicateCounts = new Map<string, number>();
  for (const lead of leads) {
    const key = duplicateKey(lead);
    duplicateCounts.set(key, (duplicateCounts.get(key) || 0) + 1);
  }
  const callsByPhone = callMatchesByPhone(parsed.rows);
  const latestCallAt = parsed.rows.reduce<Date | null>((latest, row) => {
    if (!latest || row.callTime.getTime() > latest.getTime()) return row.callTime;
    return latest;
  }, null);
  const conversionCache = new Map<string, ConversionSnapshot>();
  const conversionInputs = [...new Map(leads.map(lead => [
    `${normalizeSearch(lead.email)}:${lead.created_at.toISOString()}`,
    lead,
  ])).values()];
  if (conversionInputs.length <= INLINE_CONVERSION_LEAD_LIMIT) {
    await mapWithConcurrency(conversionInputs, 4, async lead => {
      conversionCache.set(
        `${normalizeSearch(lead.email)}:${lead.created_at.toISOString()}`,
        await getConversionSnapshot(lead.email, lead.created_at)
      );
    });
  } else {
    for (const lead of conversionInputs) {
      conversionCache.set(
        `${normalizeSearch(lead.email)}:${lead.created_at.toISOString()}`,
        skippedConversionSnapshot(lead.email)
      );
    }
  }

  const result = await withOpsDbTransaction(async client => {
    const batchResult = await client.query(`
      INSERT INTO ops_lead_report_batches
        (file_hash,file_name,uploaded_by,report_start_date,report_end_date,total_call_rows,imported_call_rows,ignored_call_rows,rejected_call_rows,latest_call_at)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
      RETURNING *
    `, [
      fileHash,
      input.fileName,
      input.uploadedBy,
      parsed.reportStartDate,
      parsed.reportEndDate,
      parsed.totalRows,
      parsed.rows.length,
      parsed.ignoredRows,
      parsed.rejected.length,
      latestCallAt,
    ]);
    const batch = batchResult.rows[0];

    for (const row of parsed.rows) {
      await client.query(`
        INSERT INTO ops_lead_report_call_rows
          (batch_id,fingerprint,report_date,call_time,agent_extension,agent_display_name,destination_phone,destination_match_key,status,ringing_seconds,talking_seconds,total_seconds,raw)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)
        ON CONFLICT (batch_id,fingerprint) DO NOTHING
      `, [
        batch.id,
        row.fingerprint,
        row.reportDate,
        row.callTime,
        row.agentExtension,
        row.agentDisplayName,
        row.destinationPhone,
        phoneMatchKey(row.destinationPhone),
        row.status,
        row.ringingSeconds,
        row.talkingSeconds,
        durationSeconds(row.raw['total duration']),
        JSON.stringify(row.raw),
      ]);
    }

    const summaries = [];
    for (const lead of leads) {
      const matchKey = phoneMatchKey(lead.mobile_number || '');
      const calls = matchKey ? (callsByPhone.get(matchKey) || []) : [];
      const callSummary = summarizeCalls(calls, lead.created_at);
      const callStatus = !matchKey
        ? 'no_phone'
        : calls.length
          ? 'called'
          : latestCallAt && lead.created_at.getTime() > latestCallAt.getTime()
            ? 'pending_verification'
            : 'not_called';
      const dupKey = duplicateKey(lead);
      const dupCount = duplicateCounts.get(dupKey) || 1;
      const conversion = conversionCache.get(`${normalizeSearch(lead.email)}:${lead.created_at.toISOString()}`)
        || await getConversionSnapshot(lead.email, lead.created_at);
      const conversionStatus = conversion.unavailable
        ? 'unavailable'
        : conversion.converted
          ? 'converted'
          : (conversion.shopify.state === 'existing_before_lead' || conversion.chargebee.state === 'existing_before_lead')
            ? 'existing'
            : 'not_converted';

      await client.query(`
        INSERT INTO ops_lead_report_results
          (batch_id,lead_id,lead_name,lead_email,lead_phone,lead_zip,use_location,uses,lead_created_at,freescout_ticket_id,freescout_ticket_url,
           duplicate_key,duplicate_count,is_duplicate,match_key,call_status,attempt_count,answered_count,unanswered_count,first_call_at,delay_seconds,
           total_ringing_seconds,total_talking_seconds,total_call_seconds,agents,outcomes,calls,conversion_status,shopify_conversion,chargebee_conversion)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,$24,$25,$26,$27,$28,$29,$30)
      `, [
        batch.id,
        lead.id,
        lead.name,
        lead.email,
        lead.mobile_number,
        lead.zip_code,
        lead.use_location,
        lead.uses,
        lead.created_at,
        lead.freescout_ticket_id,
        lead.freescout_ticket_url,
        dupKey,
        dupCount,
        dupCount > 1,
        matchKey,
        callStatus,
        callSummary.attempts,
        callSummary.answered,
        callSummary.unanswered,
        callSummary.firstCallAt,
        callSummary.delaySeconds,
        callSummary.ringingSeconds,
        callSummary.talkingSeconds,
        callSummary.totalSeconds,
        JSON.stringify(callSummary.agents),
        JSON.stringify(callSummary.outcomes),
        JSON.stringify(callSummary.calls),
        conversionStatus,
        JSON.stringify(conversion.shopify),
        JSON.stringify(conversion.chargebee),
      ]);
      summaries.push({ ...callSummary, duplicate: dupCount > 1, conversionStatus, callStatus });
    }

    const delays = summaries.map(item => item.delaySeconds).filter((value): value is number => typeof value === 'number');
    const metrics = {
      totalLeads: leads.length,
      calledLeads: summaries.filter(item => item.attempts > 0).length,
      notCalledLeads: summaries.filter(item => item.attempts === 0 && item.callStatus !== 'pending_verification').length,
      pendingVerificationLeads: summaries.filter(item => item.callStatus === 'pending_verification').length,
      duplicateLeads: summaries.filter(item => item.duplicate).length,
      totalAttempts: summaries.reduce((sum, item) => sum + item.attempts, 0),
      answeredAttempts: summaries.reduce((sum, item) => sum + item.answered, 0),
      unansweredAttempts: summaries.reduce((sum, item) => sum + item.unanswered, 0),
      convertedLeads: summaries.filter(item => item.conversionStatus === 'converted').length,
      conversionUnavailableLeads: summaries.filter(item => item.conversionStatus === 'unavailable').length,
      averageDelaySeconds: delays.length ? Math.round(delays.reduce((sum, value) => sum + value, 0) / delays.length) : null,
      totalTalkingSeconds: summaries.reduce((sum, item) => sum + item.talkingSeconds, 0),
    };

    const updated = await client.query(`
      UPDATE ops_lead_report_batches
      SET total_leads=$2,called_leads=$3,not_called_leads=$4,pending_verification_leads=$5,duplicate_leads=$6,total_attempts=$7,
          answered_attempts=$8,unanswered_attempts=$9,converted_leads=$10,conversion_unavailable_leads=$11,
          average_delay_seconds=$12,total_talking_seconds=$13
      WHERE id=$1
      RETURNING *
    `, [
      batch.id,
      metrics.totalLeads,
      metrics.calledLeads,
      metrics.notCalledLeads,
      metrics.pendingVerificationLeads,
      metrics.duplicateLeads,
      metrics.totalAttempts,
      metrics.answeredAttempts,
      metrics.unansweredAttempts,
      metrics.convertedLeads,
      metrics.conversionUnavailableLeads,
      metrics.averageDelaySeconds,
      metrics.totalTalkingSeconds,
    ]);
    return updated.rows[0];
  });

  await logActivity(input.uploadedBy, 'upload_lead_report', `${result.report_start_date}:${result.report_end_date}:${result.id}`, input.request);
  return { duplicate: false, batch: result, parsed };
}

export async function listLeadReports() {
  await ensureLeadReportTables();
  const [batches, totals] = await Promise.all([
    queryOpsDb(`SELECT * FROM ops_lead_report_batches ORDER BY created_at DESC LIMIT 40`),
    queryOpsDb(`
      SELECT COUNT(*)::int AS reports,
             COALESCE(SUM(total_leads),0)::int AS total_leads,
             COALESCE(SUM(called_leads),0)::int AS called_leads,
             COALESCE(SUM(converted_leads),0)::int AS converted_leads
      FROM ops_lead_report_batches
    `),
  ]);
  return { batches: batches.rows, totals: totals.rows[0] };
}

export async function getLeadReportDetail(reportId: number, params: URLSearchParams) {
  await ensureLeadReportTables();
  const batch = await queryOpsDb(`SELECT * FROM ops_lead_report_batches WHERE id=$1`, [reportId]);
  if (!batch.rows[0]) return null;

  const filters: string[] = ['batch_id=$1'];
  const values: any[] = [reportId];
  const add = (sql: string, value: any) => {
    values.push(value);
    filters.push(sql.replace('?', `$${values.length}`));
  };
  const called = params.get('called') || 'all';
  if (called === 'called') filters.push(`attempt_count > 0`);
  if (called === 'not_called') filters.push(`attempt_count = 0`);
  if (called === 'pending_verification') filters.push(`call_status = 'pending_verification'`);
  if (called === 'no_phone') filters.push(`call_status = 'no_phone'`);
  const outcome = params.get('outcome') || 'all';
  if (outcome === 'answered') filters.push(`answered_count > 0`);
  if (outcome === 'unanswered') filters.push(`unanswered_count > 0 AND answered_count = 0`);
  const conversion = params.get('conversion') || 'all';
  if (['converted', 'not_converted', 'existing', 'unavailable'].includes(conversion)) add(`conversion_status = ?`, conversion);
  const duplicate = params.get('duplicate') || 'all';
  if (duplicate === 'yes') filters.push(`is_duplicate = TRUE`);
  const agent = params.get('agent') || 'all';
  if (agent !== 'all' && agent.trim()) add(`agents::text ILIKE ?`, `%${agent.trim()}%`);
  const search = (params.get('search') || '').trim();
  if (search) {
    const clauses = ['lead_name', 'lead_email', 'lead_phone', 'lead_zip', 'freescout_ticket_id', 'calls::text'].map(column => {
      values.push(`%${search}%`);
      return `${column} ILIKE $${values.length}`;
    });
    filters.push(`(${clauses.join(' OR ')})`);
  }
  const page = Math.max(1, Number(params.get('page') || 1) || 1);
  const offset = (page - 1) * PAGE_SIZE;
  const where = filters.join(' AND ');
  const includeDynamicPending = Boolean(batch.rows[0].latest_call_at)
    && ['all', 'pending_verification'].includes(called)
    && outcome === 'all'
    && agent === 'all'
    && duplicate !== 'yes'
    && conversion === 'all';
  const dynamicSearch = search ? `%${search}%` : null;

  const [summary, agents, savedRows, savedTotal, dynamicPending] = await Promise.all([
    queryOpsDb(`
      SELECT COUNT(*)::int AS total,
             COUNT(*) FILTER (WHERE attempt_count > 0)::int AS called,
             COUNT(*) FILTER (WHERE attempt_count = 0 AND call_status<>'pending_verification')::int AS not_called,
             COUNT(*) FILTER (WHERE call_status='pending_verification')::int AS pending_verification,
             COUNT(*) FILTER (WHERE is_duplicate)::int AS duplicates,
             COUNT(*) FILTER (WHERE conversion_status='converted')::int AS converted,
             COUNT(*) FILTER (WHERE conversion_status='existing')::int AS existing,
             COALESCE(SUM(attempt_count),0)::int AS attempts,
             COALESCE(SUM(answered_count),0)::int AS answered,
             COALESCE(SUM(unanswered_count),0)::int AS unanswered,
             COALESCE(SUM(total_talking_seconds),0)::int AS talking_seconds
      FROM ops_lead_report_results WHERE batch_id=$1
    `, [reportId]),
    queryOpsDb(`
      SELECT DISTINCT elem->>'extension' AS extension, elem->>'name' AS name
      FROM ops_lead_report_results r, jsonb_array_elements(r.agents) elem
      WHERE r.batch_id=$1 AND elem->>'extension' IS NOT NULL
      ORDER BY extension
    `, [reportId]),
    queryOpsDb(`
      SELECT *
      FROM ops_lead_report_results
      WHERE ${where}
      ORDER BY lead_created_at ASC,id ASC
      LIMIT ${includeDynamicPending ? 10000 : PAGE_SIZE + 1} OFFSET ${includeDynamicPending ? 0 : offset}
    `, values),
    queryOpsDb(`SELECT COUNT(*)::int AS total FROM ops_lead_report_results WHERE ${where}`, values),
    includeDynamicPending
      ? queryOpsDb(`
        SELECT
          (l.id + $2::bigint) AS id,
          l.id AS lead_id,
          l.name AS lead_name,
          l.email AS lead_email,
          l.mobile_number AS lead_phone,
          l.zip_code AS lead_zip,
          l.use_location,
          l.uses,
          l.created_at AS lead_created_at,
          l.freescout_ticket_id,
          l.freescout_ticket_url,
          NULL::text AS duplicate_key,
          1::int AS duplicate_count,
          FALSE AS is_duplicate,
          ${phoneMatchKeySql('l.mobile_number')} AS match_key,
          'pending_verification'::text AS call_status,
          0::int AS attempt_count,
          0::int AS answered_count,
          0::int AS unanswered_count,
          NULL::timestamptz AS first_call_at,
          NULL::int AS delay_seconds,
          0::int AS total_ringing_seconds,
          0::int AS total_talking_seconds,
          0::int AS total_call_seconds,
          '[]'::jsonb AS agents,
          '{}'::jsonb AS outcomes,
          '[]'::jsonb AS calls,
          'pending_verification'::text AS conversion_status,
          '{"label":"Not checked until next report upload","state":"pending_verification"}'::jsonb AS shopify_conversion,
          '{"label":"Not checked until next report upload","state":"pending_verification"}'::jsonb AS chargebee_conversion,
          l.created_at AS created_at,
          TRUE AS dynamic_pending
        FROM ops_customer_leads l
        WHERE l.created_at > $3::timestamptz
          AND ${phoneMatchKeySql('l.mobile_number')} <> ''
          AND NOT EXISTS (
            SELECT 1
            FROM ops_lead_report_results r
            WHERE r.batch_id=$1 AND r.lead_id=l.id
          )
          AND ($4::text IS NULL OR (
            l.name ILIKE $4 OR l.email ILIKE $4 OR l.mobile_number ILIKE $4 OR l.zip_code ILIKE $4 OR l.freescout_ticket_id ILIKE $4
          ))
        ORDER BY l.created_at ASC,l.id ASC
      `, [reportId, DYNAMIC_PENDING_ID_OFFSET, batch.rows[0].latest_call_at, dynamicSearch])
      : Promise.resolve({ rows: [] }),
  ]);

  const dynamicRows = dynamicPending.rows || [];
  const dynamicPendingCount = dynamicRows.length;
  const savedRowsList = savedRows.rows || [];
  const savedTotalRecords = savedTotal.rows[0]?.total || 0;
  const allRows = includeDynamicPending
    ? [...savedRowsList, ...dynamicRows]
      .sort((a, b) => new Date(a.lead_created_at).getTime() - new Date(b.lead_created_at).getTime() || Number(a.id) - Number(b.id))
      .slice(offset, offset + PAGE_SIZE)
    : savedRowsList.slice(0, PAGE_SIZE);
  const totalRecords = savedTotalRecords + (includeDynamicPending ? dynamicPendingCount : 0);
  const summaryRow = {
    ...summary.rows[0],
    total: (summary.rows[0]?.total || 0) + dynamicPendingCount,
    pending_verification: (summary.rows[0]?.pending_verification || 0) + dynamicPendingCount,
  };
  const batchRow = {
    ...batch.rows[0],
    total_leads: (batch.rows[0].total_leads || 0) + dynamicPendingCount,
    pending_verification_leads: (batch.rows[0].pending_verification_leads || 0) + dynamicPendingCount,
    dynamic_pending_leads: dynamicPendingCount,
  };
  return {
    batch: batchRow,
    summary: summaryRow,
    agents: agents.rows,
    rows: allRows,
    pagination: {
      page,
      pageSize: PAGE_SIZE,
      totalRecords,
      totalPages: Math.max(1, Math.ceil(totalRecords / PAGE_SIZE)),
    },
  };
}
