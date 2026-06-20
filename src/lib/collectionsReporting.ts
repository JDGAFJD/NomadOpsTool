import 'server-only';

import { getSetting } from '@/lib/db';
import { ensureCollectionsTables } from '@/lib/collections';
import { queryOpsDb } from '@/lib/opsDb';

export const COLLECTION_REPORT_MODEL = 'gpt-4o';
export const COLLECTION_REPORT_PAGE_SIZE = 50;

export type CollectionReportFilters = {
  from: string;
  to: string;
  agent: string;
  attempt: string;
  outcome: string;
  status: string;
  reason: string;
  feedbackPage: number;
};

type QueryFilter = {
  clause: string;
  params: unknown[];
};

function isoDate(value: string | null, fallback: Date) {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return fallback.toISOString().slice(0, 10);
  const parsed = new Date(`${value}T00:00:00Z`);
  return Number.isNaN(parsed.getTime()) ? fallback.toISOString().slice(0, 10) : value;
}

export function parseCollectionReportFilters(searchParams: URLSearchParams): CollectionReportFilters {
  const today = new Date();
  const start = new Date(today);
  start.setUTCDate(start.getUTCDate() - 29);
  const feedbackPageValue = Number(searchParams.get('feedbackPage'));
  const requestedFrom = isoDate(searchParams.get('from'), start);
  const requestedTo = isoDate(searchParams.get('to'), today);
  const from = requestedFrom <= requestedTo ? requestedFrom : requestedTo;
  const to = requestedFrom <= requestedTo ? requestedTo : requestedFrom;
  return {
    from,
    to,
    agent: searchParams.get('agent')?.trim() || 'all',
    attempt: searchParams.get('attempt')?.trim() || 'all',
    outcome: searchParams.get('outcome')?.trim() || 'all',
    status: searchParams.get('status')?.trim() || 'all',
    reason: searchParams.get('reason')?.trim() || 'all',
    feedbackPage: Number.isInteger(feedbackPageValue) && feedbackPageValue > 0 ? feedbackPageValue : 1,
  };
}

function attemptFilter(filters: CollectionReportFilters, alias = 'a', caseAlias = 'c'): QueryFilter {
  const params: unknown[] = [filters.from, filters.to];
  const clauses = [
    `${alias}.created_at >= $1::date`,
    `${alias}.created_at < $2::date + INTERVAL '1 day'`,
  ];
  if (filters.agent !== 'all') {
    params.push(filters.agent);
    clauses.push(`${alias}.agent_email = $${params.length}`);
  }
  if (filters.attempt !== 'all' && ['1', '2', '3'].includes(filters.attempt)) {
    params.push(Number(filters.attempt));
    clauses.push(`${alias}.attempt_number = $${params.length}`);
  }
  if (filters.outcome !== 'all') {
    params.push(filters.outcome);
    clauses.push(`${alias}.outcome = $${params.length}`);
  }
  if (filters.status !== 'all') {
    params.push(filters.status);
    clauses.push(`${caseAlias}.status = $${params.length}`);
  }
  if (filters.reason !== 'all') {
    params.push(filters.reason);
    clauses.push(`${alias}.reason_category = $${params.length}`);
  }
  return { clause: clauses.join(' AND '), params };
}

function attributionCte(filters: CollectionReportFilters) {
  const params: unknown[] = [filters.from, filters.to];
  const filteredClauses: string[] = [];
  if (filters.agent !== 'all') {
    params.push(filters.agent);
    filteredClauses.push(`at.agent_email = $${params.length}`);
  }
  if (filters.status !== 'all') {
    params.push(filters.status);
    filteredClauses.push(`at.case_status = $${params.length}`);
  }
  const matchingAttemptClauses = [
    'fa.case_id = at.case_id',
    'fa.agent_email = at.agent_email',
    'fa.created_at >= at.failure_at',
    'fa.created_at <= at.paid_at',
  ];
  if (filters.attempt !== 'all' && ['1', '2', '3'].includes(filters.attempt)) {
    params.push(Number(filters.attempt));
    matchingAttemptClauses.push(`fa.attempt_number = $${params.length}`);
  }
  if (filters.outcome !== 'all') {
    params.push(filters.outcome);
    matchingAttemptClauses.push(`fa.outcome = $${params.length}`);
  }
  if (filters.reason !== 'all') {
    params.push(filters.reason);
    matchingAttemptClauses.push(`fa.reason_category = $${params.length}`);
  }
  if (matchingAttemptClauses.length > 4) {
    filteredClauses.push(`EXISTS (
      SELECT 1 FROM ops_collection_attempts fa
      WHERE ${matchingAttemptClauses.join(' AND ')}
    )`);
  }
  return {
    params,
    filteredClause: filteredClauses.length ? `WHERE ${filteredClauses.join(' AND ')}` : '',
    sql: `
      WITH paid_invoices AS (
        SELECT i.id, i.case_id, i.invoice_id, i.amount_paid, i.currency_code, c.status AS case_status,
          COALESCE(i.failure_date, i.created_at) AS failure_at, i.paid_at
        FROM ops_collection_invoices i
        JOIN ops_collection_cases c ON c.id=i.case_id
        WHERE i.paid_at >= $1::date
          AND i.paid_at < $2::date + INTERVAL '1 day'
          AND i.paid_at IS NOT NULL
          AND i.amount_due = 0
          AND i.amount_paid > 0
      ),
      participants AS (
        SELECT DISTINCT p.id AS invoice_row_id, p.case_id, p.invoice_id, p.amount_paid,
          p.currency_code, p.case_status, p.failure_at, p.paid_at, a.agent_email
        FROM paid_invoices p
        JOIN ops_collection_attempts a ON a.case_id = p.case_id
          AND a.created_at >= p.failure_at
          AND a.created_at <= p.paid_at
      ),
      participant_counts AS (
        SELECT invoice_row_id, COUNT(*)::numeric AS agent_count
        FROM participants GROUP BY invoice_row_id
      ),
      attributed AS (
        SELECT p.*, (p.amount_paid::numeric / pc.agent_count) AS credited_amount
        FROM participants p
        JOIN participant_counts pc ON pc.invoice_row_id = p.invoice_row_id
      ),
      filtered_attributed AS (
        SELECT * FROM attributed at ${filteredClauses.length ? `WHERE ${filteredClauses.join(' AND ')}` : ''}
      ),
      unattributed AS (
        SELECT p.*
        FROM paid_invoices p
        WHERE NOT EXISTS (
          SELECT 1 FROM participants x WHERE x.invoice_row_id = p.id
        )
      )
    `,
  };
}

export async function ensureCollectionReportTables() {
  await ensureCollectionsTables();
  await queryOpsDb(`
    CREATE TABLE IF NOT EXISTS ops_collection_report_summaries (
      id BIGSERIAL PRIMARY KEY,
      generated_by TEXT NOT NULL,
      filters JSONB NOT NULL,
      metric_snapshot JSONB NOT NULL,
      summary TEXT NOT NULL,
      model TEXT NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
  await queryOpsDb(`
    CREATE INDEX IF NOT EXISTS idx_collection_report_summaries_created
    ON ops_collection_report_summaries(created_at DESC)
  `);
}

export async function getCollectionReport(filters: CollectionReportFilters) {
  await ensureCollectionReportTables();
  const attempt = attemptFilter(filters);
  const attribution = attributionCte(filters);
  const feedbackOffset = (filters.feedbackPage - 1) * COLLECTION_REPORT_PAGE_SIZE;

  const [
    workload,
    workloadByAgent,
    attemptSummary,
    outcomeRows,
    attemptStageRows,
    reasonRows,
    feedbackCount,
    feedbackRows,
    attributionTotals,
    attributionByAgent,
    attributionTimeline,
    agentLive,
    agentAttempts,
    agentAttribution,
    options,
  ] = await Promise.all([
    queryOpsDb(`
      SELECT
        COUNT(*) FILTER (WHERE status IN ('unassigned','assigned','follow_up_pending','awaiting_payment_confirmation','paused'))::int AS open,
        COUNT(*) FILTER (WHERE status='unassigned')::int AS unassigned,
        COUNT(*) FILTER (WHERE status IN ('assigned','follow_up_pending','awaiting_payment_confirmation','paused') AND assigned_to IS NOT NULL)::int AS assigned,
        COUNT(*) FILTER (WHERE status IN ('assigned','follow_up_pending','awaiting_payment_confirmation')
          AND next_attempt_at IS NOT NULL AND next_attempt_at <= NOW())::int AS due,
        COUNT(*) FILTER (WHERE status IN ('unassigned','assigned','follow_up_pending','awaiting_payment_confirmation','paused')
          AND created_at < NOW() - INTERVAL '48 hours')::int AS sla_breached,
        COUNT(*) FILTER (WHERE status IN ('unassigned','assigned','follow_up_pending','awaiting_payment_confirmation') AND current_attempt=0)::int AS attempt_1,
        COUNT(*) FILTER (WHERE status IN ('unassigned','assigned','follow_up_pending','awaiting_payment_confirmation') AND current_attempt=1)::int AS attempt_2,
        COUNT(*) FILTER (WHERE status IN ('unassigned','assigned','follow_up_pending','awaiting_payment_confirmation') AND current_attempt=2)::int AS attempt_3,
        MIN(created_at) FILTER (WHERE status IN ('unassigned','assigned','follow_up_pending','awaiting_payment_confirmation','paused')) AS oldest_created_at
      FROM ops_collection_cases
    `),
    queryOpsDb(`
      SELECT assigned_to AS agent_email, COUNT(*)::int AS assigned,
        COUNT(*) FILTER (WHERE status IN ('assigned','follow_up_pending','awaiting_payment_confirmation')
          AND next_attempt_at IS NOT NULL AND next_attempt_at <= NOW())::int AS due,
        COUNT(*) FILTER (WHERE created_at < NOW() - INTERVAL '48 hours')::int AS sla_breached
      FROM ops_collection_cases
      WHERE assigned_to IS NOT NULL
        AND status IN ('assigned','follow_up_pending','awaiting_payment_confirmation','paused')
      GROUP BY assigned_to ORDER BY assigned DESC, assigned_to
    `),
    queryOpsDb(`
      SELECT COUNT(*)::int AS attempts,
        COUNT(*) FILTER (WHERE a.outcome='completed')::int AS completed,
        COUNT(*) FILTER (WHERE a.outcome='left_voicemail')::int AS left_voicemail,
        COUNT(*) FILTER (WHERE a.outcome='no_answer')::int AS no_answer
      FROM ops_collection_attempts a
      JOIN ops_collection_cases c ON c.id=a.case_id
      WHERE ${attempt.clause}
    `, attempt.params),
    queryOpsDb(`
      SELECT a.outcome AS name, COUNT(*)::int AS value
      FROM ops_collection_attempts a
      JOIN ops_collection_cases c ON c.id=a.case_id
      WHERE ${attempt.clause}
      GROUP BY a.outcome ORDER BY value DESC
    `, attempt.params),
    queryOpsDb(`
      SELECT a.attempt_number AS attempt, COUNT(*)::int AS value
      FROM ops_collection_attempts a
      JOIN ops_collection_cases c ON c.id=a.case_id
      WHERE ${attempt.clause}
      GROUP BY a.attempt_number ORDER BY a.attempt_number
    `, attempt.params),
    queryOpsDb(`
      SELECT COALESCE(a.reason_category,'not_recorded') AS name, COUNT(*)::int AS value
      FROM ops_collection_attempts a
      JOIN ops_collection_cases c ON c.id=a.case_id
      WHERE ${attempt.clause}
      GROUP BY COALESCE(a.reason_category,'not_recorded')
      ORDER BY value DESC
    `, attempt.params),
    queryOpsDb(`
      SELECT COUNT(*)::int AS total
      FROM ops_collection_attempts a
      JOIN ops_collection_cases c ON c.id=a.case_id
      WHERE ${attempt.clause}
    `, attempt.params),
    queryOpsDb(`
      SELECT a.id, a.case_id, a.agent_email, a.attempt_number, a.outcome,
        a.notes, a.reason_category, a.collected, a.created_at, c.status AS case_status
      FROM ops_collection_attempts a
      JOIN ops_collection_cases c ON c.id=a.case_id
      WHERE ${attempt.clause}
      ORDER BY a.created_at DESC, a.id DESC
      LIMIT $${attempt.params.length + 1} OFFSET $${attempt.params.length + 2}
    `, [...attempt.params, COLLECTION_REPORT_PAGE_SIZE, feedbackOffset]),
    queryOpsDb(`
      ${attribution.sql}
      SELECT
        COALESCE((SELECT SUM(credited_amount) FROM filtered_attributed),0)::numeric AS attributed_amount,
        COALESCE((SELECT COUNT(DISTINCT invoice_row_id) FROM filtered_attributed),0)::int AS attributed_invoices,
        COALESCE((SELECT SUM(amount_paid) FROM unattributed),0)::numeric AS unattributed_amount,
        COALESCE((SELECT COUNT(*) FROM unattributed),0)::int AS unattributed_invoices
    `, attribution.params),
    queryOpsDb(`
      ${attribution.sql}
      SELECT agent_email, ROUND(SUM(credited_amount))::bigint AS credited_amount,
        COUNT(DISTINCT invoice_row_id)::int AS paid_invoices,
        AVG(EXTRACT(EPOCH FROM (paid_at - failure_at)))::bigint AS avg_seconds_to_payment
      FROM filtered_attributed
      GROUP BY agent_email
      ORDER BY credited_amount DESC, agent_email
    `, attribution.params),
    queryOpsDb(`
      ${attribution.sql}
      SELECT paid_at::date AS day, ROUND(SUM(credited_amount))::bigint AS credited_amount
      FROM filtered_attributed
      GROUP BY paid_at::date ORDER BY day
    `, attribution.params),
    queryOpsDb(`
      SELECT assigned_to AS agent_email, COUNT(*)::int AS assigned,
        COUNT(*) FILTER (WHERE status IN ('assigned','follow_up_pending','awaiting_payment_confirmation')
          AND next_attempt_at IS NOT NULL AND next_attempt_at <= NOW())::int AS due,
        COUNT(*) FILTER (WHERE created_at < NOW() - INTERVAL '48 hours')::int AS sla_breached
      FROM ops_collection_cases
      WHERE assigned_to IS NOT NULL
        AND status IN ('assigned','follow_up_pending','awaiting_payment_confirmation','paused')
      GROUP BY assigned_to
    `),
    queryOpsDb(`
      SELECT a.agent_email, COUNT(*)::int AS attempts,
        COUNT(*) FILTER (WHERE a.outcome='completed')::int AS completed,
        COUNT(*) FILTER (WHERE a.outcome='left_voicemail')::int AS left_voicemail,
        COUNT(*) FILTER (WHERE a.outcome='no_answer')::int AS no_answer
      FROM ops_collection_attempts a
      JOIN ops_collection_cases c ON c.id=a.case_id
      WHERE ${attempt.clause}
      GROUP BY a.agent_email
    `, attempt.params),
    queryOpsDb(`
      ${attribution.sql}
      SELECT agent_email, ROUND(SUM(credited_amount))::bigint AS credited_amount,
        COUNT(DISTINCT invoice_row_id)::int AS paid_invoices,
        AVG(EXTRACT(EPOCH FROM (paid_at - failure_at)))::bigint AS avg_seconds_to_payment
      FROM filtered_attributed GROUP BY agent_email
    `, attribution.params),
    Promise.all([
      queryOpsDb(`
        SELECT agent_email FROM (
          SELECT email AS agent_email FROM ops_users
          UNION
          SELECT agent_email FROM ops_collection_attempts
        ) agents ORDER BY agent_email
      `),
      queryOpsDb(`SELECT DISTINCT status FROM ops_collection_cases ORDER BY status`),
      queryOpsDb(`SELECT DISTINCT reason_category FROM ops_collection_attempts WHERE reason_category IS NOT NULL ORDER BY reason_category`),
    ]),
  ]);

  const agentMap = new Map<string, Record<string, unknown>>();
  for (const row of options[0].rows) agentMap.set(row.agent_email, { agentEmail: row.agent_email });
  for (const row of agentLive.rows) agentMap.set(row.agent_email, { agentEmail: row.agent_email, ...row });
  for (const row of agentAttempts.rows) agentMap.set(row.agent_email, { ...(agentMap.get(row.agent_email) || { agentEmail: row.agent_email }), ...row });
  for (const row of agentAttribution.rows) agentMap.set(row.agent_email, { ...(agentMap.get(row.agent_email) || { agentEmail: row.agent_email }), ...row });
  const agents = [...agentMap.values()]
    .map(row => ({
      agentEmail: String(row.agent_email || row.agentEmail),
      assigned: Number(row.assigned || 0),
      due: Number(row.due || 0),
      slaBreached: Number(row.sla_breached || 0),
      attempts: Number(row.attempts || 0),
      completed: Number(row.completed || 0),
      leftVoicemail: Number(row.left_voicemail || 0),
      noAnswer: Number(row.no_answer || 0),
      paidInvoices: Number(row.paid_invoices || 0),
      creditedAmount: Number(row.credited_amount || 0),
      avgSecondsToPayment: row.avg_seconds_to_payment === null || row.avg_seconds_to_payment === undefined
        ? null
        : Number(row.avg_seconds_to_payment),
    }))
    .filter(row => filters.agent === 'all' || row.agentEmail === filters.agent)
    .sort((a, b) => b.creditedAmount - a.creditedAmount || b.attempts - a.attempts || a.agentEmail.localeCompare(b.agentEmail));

  const live = workload.rows[0];
  const oldestCreatedAt = live.oldest_created_at ? new Date(live.oldest_created_at) : null;
  const totalFeedback = Number(feedbackCount.rows[0]?.total || 0);
  return {
    filters,
    workload: {
      open: Number(live.open || 0),
      assigned: Number(live.assigned || 0),
      unassigned: Number(live.unassigned || 0),
      due: Number(live.due || 0),
      slaBreached: Number(live.sla_breached || 0),
      oldestCreatedAt: oldestCreatedAt?.toISOString() || null,
      oldestAgeSeconds: oldestCreatedAt ? Math.max(0, Math.floor((Date.now() - oldestCreatedAt.getTime()) / 1000)) : 0,
      byAttempt: [
        { attempt: 1, value: Number(live.attempt_1 || 0) },
        { attempt: 2, value: Number(live.attempt_2 || 0) },
        { attempt: 3, value: Number(live.attempt_3 || 0) },
      ],
      byAgent: workloadByAgent.rows.map(row => ({
        agentEmail: row.agent_email,
        assigned: Number(row.assigned),
        due: Number(row.due),
        slaBreached: Number(row.sla_breached),
      })),
    },
    totals: {
      attempts: Number(attemptSummary.rows[0]?.attempts || 0),
      completed: Number(attemptSummary.rows[0]?.completed || 0),
      leftVoicemail: Number(attemptSummary.rows[0]?.left_voicemail || 0),
      noAnswer: Number(attemptSummary.rows[0]?.no_answer || 0),
      attributedAmount: Number(attributionTotals.rows[0]?.attributed_amount || 0),
      attributedInvoices: Number(attributionTotals.rows[0]?.attributed_invoices || 0),
      unattributedAmount: filters.agent === 'all' ? Number(attributionTotals.rows[0]?.unattributed_amount || 0) : 0,
      unattributedInvoices: filters.agent === 'all' ? Number(attributionTotals.rows[0]?.unattributed_invoices || 0) : 0,
    },
    agents,
    charts: {
      outcomes: outcomeRows.rows.map(row => ({ name: row.name, value: Number(row.value) })),
      attempts: attemptStageRows.rows.map(row => ({ attempt: Number(row.attempt), value: Number(row.value) })),
      reasons: reasonRows.rows.map(row => ({ name: row.name, value: Number(row.value) })),
      collectionsTimeline: attributionTimeline.rows.map(row => ({ day: row.day, creditedAmount: Number(row.credited_amount) })),
      creditByAgent: attributionByAgent.rows.map(row => ({
        agentEmail: row.agent_email,
        creditedAmount: Number(row.credited_amount),
        paidInvoices: Number(row.paid_invoices),
      })),
    },
    feedback: {
      records: feedbackRows.rows,
      pagination: {
        page: filters.feedbackPage,
        pageSize: COLLECTION_REPORT_PAGE_SIZE,
        totalRecords: totalFeedback,
        totalPages: Math.max(1, Math.ceil(totalFeedback / COLLECTION_REPORT_PAGE_SIZE)),
      },
    },
    options: {
      agents: options[0].rows.map(row => row.agent_email),
      statuses: options[1].rows.map(row => row.status),
      reasons: options[2].rows.map(row => row.reason_category),
    },
  };
}

export function sanitizeCollectionFeedback(value: string) {
  return value
    .replace(/\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi, '[email removed]')
    .replace(/(?:\+?1[\s.-]?)?\(?\d{3}\)?[\s.-]?\d{3}[\s.-]?\d{4}/g, '[phone removed]')
    .replace(/\b(?:invoice|subscription|customer|case|ticket)\s*#?:?\s*[A-Z0-9_-]{4,}\b/gi, '[identifier removed]')
    .replace(/\b[A-Z]{2,5}[A-Z0-9_-]{8,}\b/g, '[identifier removed]')
    .slice(0, 1200);
}

export function collectionReportAiSnapshot(report: Awaited<ReturnType<typeof getCollectionReport>>) {
  return {
    period: { from: report.filters.from, to: report.filters.to },
    filters: {
      agent: report.filters.agent,
      attempt: report.filters.attempt,
      outcome: report.filters.outcome,
      status: report.filters.status,
      reason: report.filters.reason,
    },
    workload: report.workload,
    totals: report.totals,
    agents: report.agents,
    outcomes: report.charts.outcomes,
    attempts: report.charts.attempts,
    reasons: report.charts.reasons,
    creditByAgent: report.charts.creditByAgent,
    feedback: report.feedback.records.slice(0, 40).map(row => ({
      agent: row.agent_email,
      attempt: row.attempt_number,
      outcome: row.outcome,
      reason: row.reason_category,
      notes: sanitizeCollectionFeedback(row.notes || ''),
    })),
  };
}

export async function generateCollectionReportSummary(snapshot: ReturnType<typeof collectionReportAiSnapshot>) {
  const apiKey = getSetting('openai_api_key');
  if (!apiKey) throw new Error('OpenAI integration is not configured.');
  const response = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: COLLECTION_REPORT_MODEL,
      temperature: 0.2,
      max_tokens: 900,
      messages: [
        {
          role: 'system',
          content: `You are an operations analyst for a collections team. Write a concise management report using only the supplied aggregate data and sanitized notes. Cover workload and SLA risks, agent activity and attributed collections, outcome patterns, payment barriers, feedback themes, and concrete operational actions. Do not identify customers or invent causes. Use short headings and bullet points.`,
        },
        {
          role: 'user',
          content: JSON.stringify(snapshot),
        },
      ],
    }),
    signal: AbortSignal.timeout(60_000),
  });
  if (!response.ok) throw new Error(`AI summary failed with status ${response.status}.`);
  const data = await response.json();
  const summary = String(data.choices?.[0]?.message?.content || '').trim();
  if (!summary) throw new Error('AI returned an empty summary.');
  return summary;
}
