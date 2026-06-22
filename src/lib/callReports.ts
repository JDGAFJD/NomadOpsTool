import 'server-only';

import { createHash } from 'node:crypto';
import { ensureCallVerificationTable, phoneMatchKey, recordVerificationEvent, type VerificationState } from '@/lib/callVerification';
import { queryOpsDb, withOpsDbTransaction } from '@/lib/opsDb';

const CENTRAL_ZONE = 'America/Chicago';
const REQUIRED_HEADERS = [
  'call time',
  'caller id',
  'caller display name',
  'trunk',
  'trunk number',
  'status',
  'ringing',
  'talking',
  'total duration',
  'destination callee id',
] as const;

export type ParsedCallReportRow = {
  rowNumber: number;
  reportDate: string;
  callTime: Date;
  evidenceReference: string;
  agentDisplayName: string;
  agentExtension: string;
  destinationPhone: string;
  status: string;
  ringingSeconds: number;
  talkingSeconds: number;
  cost: string;
  activityDetails: string;
  raw: Record<string, string>;
  fingerprint: string;
};

export type ParsedCallReport = {
  reportStartDate: string;
  reportEndDate: string;
  reportDates: string[];
  totalRows: number;
  ignoredRows: number;
  rows: ParsedCallReportRow[];
  rejected: { row: number; reason: string }[];
};

function parseCsvRecords(input: string) {
  const text = input.replace(/^\uFEFF/, '');
  const records: string[][] = [];
  let row: string[] = [];
  let cell = '';
  let quoted = false;

  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    if (quoted) {
      if (char === '"' && text[index + 1] === '"') {
        cell += '"';
        index += 1;
      } else if (char === '"') {
        quoted = false;
      } else {
        cell += char;
      }
      continue;
    }
    if (char === '"') {
      quoted = true;
    } else if (char === ',') {
      row.push(cell);
      cell = '';
    } else if (char === '\n') {
      row.push(cell);
      if (row.some(value => value.trim())) records.push(row);
      row = [];
      cell = '';
    } else if (char !== '\r') {
      cell += char;
    }
  }
  row.push(cell);
  if (row.some(value => value.trim())) records.push(row);
  if (quoted) throw new Error('CSV contains an unterminated quoted field.');
  return records;
}

function localTimeToUtc(value: string) {
  const match = value.trim().match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})$/);
  if (!match) return null;
  const desired = {
    year: Number(match[1]),
    month: Number(match[2]),
    day: Number(match[3]),
    hour: Number(match[4]),
    minute: Number(match[5]),
    second: Number(match[6]),
  };
  let timestamp = Date.UTC(desired.year, desired.month - 1, desired.day, desired.hour, desired.minute, desired.second);
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone: CENTRAL_ZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23',
  });
  for (let iteration = 0; iteration < 3; iteration += 1) {
    const parts = Object.fromEntries(formatter.formatToParts(new Date(timestamp)).map(part => [part.type, part.value]));
    const observed = Date.UTC(
      Number(parts.year),
      Number(parts.month) - 1,
      Number(parts.day),
      Number(parts.hour),
      Number(parts.minute),
      Number(parts.second)
    );
    const target = Date.UTC(desired.year, desired.month - 1, desired.day, desired.hour, desired.minute, desired.second);
    timestamp += target - observed;
  }
  return new Date(timestamp);
}

function durationSeconds(value: string) {
  const match = value.trim().match(/^(\d{1,3}):(\d{2}):(\d{2})$/);
  if (!match) return 0;
  return Number(match[1]) * 3600 + Number(match[2]) * 60 + Number(match[3]);
}

function fingerprint(parts: string[]) {
  return createHash('sha256').update(parts.join('|')).digest('hex');
}

function normalizedPhone(value: string) {
  return value.replace(/\D/g, '');
}

export function parseCallReportCsv(csv: string): ParsedCallReport {
  const records = parseCsvRecords(csv);
  if (records.length < 2) throw new Error('The call report CSV is empty.');
  const headers = records[0].map(value => value.trim().toLowerCase());
  const missing = REQUIRED_HEADERS.filter(header => !headers.includes(header));
  if (missing.length) throw new Error(`Missing required column(s): ${missing.join(', ')}.`);
  const indexes = Object.fromEntries(headers.map((header, index) => [header, index]));
  const rows: ParsedCallReportRow[] = [];
  const rejected: { row: number; reason: string }[] = [];
  const reportDates = new Set<string>();
  let ignoredRows = 0;

  records.slice(1).forEach((cells, offset) => {
    const rowNumber = offset + 2;
    const value = (header: string) => String(cells[indexes[header]] || '').trim();
    const callTimeText = value('call time');
    if (!callTimeText || callTimeText.toLowerCase() === 'totals') {
      ignoredRows += 1;
      return;
    }
    const reportDate = callTimeText.slice(0, 10);
    const callTime = localTimeToUtc(callTimeText);
    if (!callTime || !/^\d{4}-\d{2}-\d{2}$/.test(reportDate)) {
      rejected.push({ row: rowNumber, reason: 'Invalid Call Time.' });
      return;
    }
    const agentExtension = value('caller id').replace(/\D/g, '');
    const agentDisplayName = value('caller display name').replace(/\s*\(\d+\)\s*$/, '').trim();
    const destinationPhone = value('destination callee id');
    const destinationDigits = normalizedPhone(destinationPhone);
    const status = value('status').toLowerCase();
    if (!destinationPhone || !phoneMatchKey(destinationPhone) || !agentExtension) {
      rejected.push({ row: rowNumber, reason: 'Outbound row is missing the destination phone or caller extension.' });
      return;
    }
    if (!['answered', 'unanswered'].includes(status)) {
      rejected.push({ row: rowNumber, reason: 'Status must be Answered or Unanswered.' });
      return;
    }
    reportDates.add(reportDate);
    const evidenceReference = fingerprint([
      callTime.toISOString(),
      agentExtension,
      destinationDigits,
      value('trunk'),
      value('trunk number'),
    ]);
    const raw = Object.fromEntries(headers.map((header, index) => [header, String(cells[index] || '')]));
    rows.push({
      rowNumber,
      reportDate,
      callTime,
      evidenceReference,
      agentDisplayName: agentDisplayName || agentExtension,
      agentExtension,
      destinationPhone,
      status,
      ringingSeconds: durationSeconds(value('ringing')),
      talkingSeconds: durationSeconds(value('talking')),
      cost: value('cost'),
      activityDetails: '',
      raw,
      fingerprint: evidenceReference,
    });
  });

  if (!reportDates.size) throw new Error('The CSV does not contain any valid outbound call rows.');
  const sortedDates = [...reportDates].sort();
  return {
    reportStartDate: sortedDates[0],
    reportEndDate: sortedDates[sortedDates.length - 1],
    reportDates: sortedDates,
    totalRows: Math.max(0, records.length - 1),
    ignoredRows,
    rows,
    rejected,
  };
}

export async function ensureCallReportTables() {
  await ensureCallVerificationTable();
  await queryOpsDb(`
    CREATE TABLE IF NOT EXISTS ops_call_report_batches (
      id BIGSERIAL PRIMARY KEY,
      file_hash TEXT NOT NULL UNIQUE,
      report_date DATE NOT NULL,
      file_name TEXT NOT NULL,
      uploaded_by TEXT NOT NULL,
      total_rows INTEGER NOT NULL DEFAULT 0,
      imported_rows INTEGER NOT NULL DEFAULT 0,
      ignored_rows INTEGER NOT NULL DEFAULT 0,
      rejected_rows INTEGER NOT NULL DEFAULT 0,
      matched_rows INTEGER NOT NULL DEFAULT 0,
      mismatch_rows INTEGER NOT NULL DEFAULT 0,
      unverified_rows INTEGER NOT NULL DEFAULT 0,
      mapping_required_rows INTEGER NOT NULL DEFAULT 0,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      processed_at TIMESTAMPTZ
    )
  `);
  await queryOpsDb(`ALTER TABLE ops_call_report_batches ADD COLUMN IF NOT EXISTS report_start_date DATE`);
  await queryOpsDb(`ALTER TABLE ops_call_report_batches ADD COLUMN IF NOT EXISTS report_end_date DATE`);
  await queryOpsDb(`
    UPDATE ops_call_report_batches
    SET report_start_date=COALESCE(report_start_date,report_date),
        report_end_date=COALESCE(report_end_date,report_date)
    WHERE report_start_date IS NULL OR report_end_date IS NULL
  `);
  await queryOpsDb(`
    CREATE TABLE IF NOT EXISTS ops_call_report_rows (
      id BIGSERIAL PRIMARY KEY,
      batch_id BIGINT NOT NULL REFERENCES ops_call_report_batches(id) ON DELETE CASCADE,
      fingerprint TEXT NOT NULL UNIQUE,
      report_date DATE NOT NULL,
      call_time TIMESTAMPTZ NOT NULL,
      call_id TEXT NOT NULL,
      agent_display_name TEXT NOT NULL,
      agent_extension TEXT NOT NULL,
      destination_phone TEXT NOT NULL,
      destination_match_key TEXT NOT NULL,
      status TEXT NOT NULL,
      ringing_seconds INTEGER NOT NULL DEFAULT 0,
      talking_seconds INTEGER NOT NULL DEFAULT 0,
      cost TEXT,
      activity_details TEXT,
      raw_row JSONB NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
  await queryOpsDb(`
    CREATE TABLE IF NOT EXISTS ops_3cx_agent_mappings (
      id BIGSERIAL PRIMARY KEY,
      extension TEXT NOT NULL UNIQUE,
      display_name TEXT,
      ops_email TEXT NOT NULL,
      created_by TEXT NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
  await queryOpsDb(`CREATE INDEX IF NOT EXISTS idx_call_report_rows_date ON ops_call_report_rows(report_date,call_time)`);
  await queryOpsDb(`CREATE INDEX IF NOT EXISTS idx_call_report_rows_phone ON ops_call_report_rows(destination_match_key,call_time)`);
  await queryOpsDb(`CREATE INDEX IF NOT EXISTS idx_call_report_rows_extension ON ops_call_report_rows(agent_extension,report_date)`);
}

export function callReportOutcomeState(outcome: string, status: string): VerificationState {
  if (outcome === 'completed') return status === 'answered' ? 'verified' : 'outcome_mismatch';
  if (outcome === 'no_answer') return status === 'unanswered' ? 'verified' : 'outcome_mismatch';
  if (outcome === 'left_voicemail') return ['answered', 'unanswered'].includes(status) ? 'verified' : 'outcome_mismatch';
  return 'outcome_mismatch';
}

export async function processCallReportDate(reportDate: string, batchId?: number) {
  await ensureCallReportTables();
  const [reportResult, callsResult, verificationsResult, usedResult] = await Promise.all([
    queryOpsDb('SELECT id FROM ops_call_report_rows WHERE report_date=$1::date LIMIT 1', [reportDate]),
    queryOpsDb(`
      SELECT r.*,m.ops_email
      FROM ops_call_report_rows r
      LEFT JOIN ops_3cx_agent_mappings m ON m.extension=r.agent_extension
      WHERE r.report_date=$1::date
      ORDER BY r.call_time ASC,r.id ASC
    `, [reportDate]),
    queryOpsDb(`
      SELECT *
      FROM ops_call_verifications
      WHERE evidence_source='csv'
        AND (submitted_at AT TIME ZONE 'America/Chicago')::date=$1::date
      ORDER BY submitted_at ASC,id ASC
    `, [reportDate]),
    queryOpsDb(`
      SELECT id,call_report_row_id
      FROM ops_call_verifications
      WHERE call_report_row_id IS NOT NULL
    `),
  ]);
  if (!reportResult.rows[0]) throw new Error(`No completed 3CX report has been uploaded for ${reportDate}.`);
  const calls = callsResult.rows;
  const verifications = verificationsResult.rows;
  const ownerByRow = new Map<number, number>(usedResult.rows.map(row => [Number(row.call_report_row_id), Number(row.id)]));
  const counts = { verified: 0, outcomeMismatch: 0, unverified: 0, mappingRequired: 0, processed: 0 };

  for (const verification of verifications) {
    const submittedAt = new Date(verification.submitted_at).getTime();
    const windowStart = new Date(verification.window_start).getTime();
    const windowEnd = new Date(verification.window_end).getTime();
    const phone = phoneMatchKey(verification.selected_phone);
    const phoneTimeCandidates = calls.filter(call =>
      call.destination_match_key === phone
      && new Date(call.call_time).getTime() >= windowStart
      && new Date(call.call_time).getTime() <= windowEnd
      && (!ownerByRow.has(Number(call.id)) || ownerByRow.get(Number(call.id)) === Number(verification.id))
    );
    const agentCandidates = phoneTimeCandidates.filter(call =>
      call.ops_email && String(call.ops_email).toLowerCase() === String(verification.agent_email).toLowerCase()
    );
    const best = agentCandidates.sort((a, b) =>
      Math.abs(new Date(a.call_time).getTime() - submittedAt)
      - Math.abs(new Date(b.call_time).getTime() - submittedAt)
    )[0] || null;

    const mappingCandidate = phoneTimeCandidates
      .filter(call => !call.ops_email)
      .sort((a, b) =>
        Math.abs(new Date(a.call_time).getTime() - submittedAt)
        - Math.abs(new Date(b.call_time).getTime() - submittedAt)
      )[0] || null;
    const evidence = best || mappingCandidate;
    let state: VerificationState;
    let error: string | null = null;
    if (best) {
      state = callReportOutcomeState(verification.reported_outcome, best.status);
    } else if (mappingCandidate) {
      state = 'mapping_required';
      error = 'Agent mapping required for a matching 3CX extension.';
    } else {
      state = 'unverified';
    }

    const previousState = verification.state;
    const previousRowId = verification.call_report_row_id ? Number(verification.call_report_row_id) : null;
    if (previousRowId && previousRowId !== Number(best?.id || 0)) ownerByRow.delete(previousRowId);
    if (best) ownerByRow.set(Number(best.id), Number(verification.id));
    await queryOpsDb(
      `UPDATE ops_call_verifications SET
         state=$2,evidence_source='csv',call_report_batch_id=COALESCE($3,call_report_batch_id),
         call_report_row_id=$4,external_call_id=$5,agent_extension=$6,agent_display_name=$7,
         evidence_status=$8,evidence_call_time=$9,ringing_seconds=$10,talking_seconds=$11,report_date=$12::date,
         twilio_status=NULL,twilio_direction=NULL,twilio_from=NULL,twilio_to=NULL,
         twilio_start_time=NULL,twilio_end_time=NULL,twilio_duration=NULL,twilio_call_sid=NULL,
         matched_at=CASE WHEN $4::bigint IS NOT NULL THEN NOW() ELSE NULL END,
         integration_error=$13,last_checked_at=NOW(),check_count=check_count+1,updated_at=NOW()
       WHERE id=$1`,
      [
        verification.id,
        state,
        evidence?.batch_id || batchId || null,
        best?.id || null,
        evidence?.call_id || null,
        evidence?.agent_extension || null,
        evidence?.agent_display_name || null,
        evidence?.status || null,
        evidence?.call_time || null,
        evidence?.ringing_seconds ?? null,
        evidence?.talking_seconds ?? null,
        reportDate,
        error,
      ]
    );
    counts.processed += 1;
    if (state === 'verified') counts.verified += 1;
    if (state === 'outcome_mismatch') counts.outcomeMismatch += 1;
    if (state === 'unverified') counts.unverified += 1;
    if (state === 'mapping_required') counts.mappingRequired += 1;

    if (previousState !== state || previousRowId !== Number(best?.id || 0)) {
      await recordVerificationEvent(verification, state, {
        verificationId: Number(verification.id),
        reportDate,
        callReportRowId: best ? Number(best.id) : null,
        evidenceReference: evidence?.call_id || null,
        agentExtension: evidence?.agent_extension || null,
        agentDisplayName: evidence?.agent_display_name || null,
        status: evidence?.status || null,
        selectedPhone: verification.selected_phone,
        ringingSeconds: evidence?.ringing_seconds ?? null,
        talkingSeconds: evidence?.talking_seconds ?? null,
        previousState,
      }, '3cx_csv');
    }
  }

  return counts;
}

export async function importCallReportCsv(input: {
  csv: string;
  fileName: string;
  uploadedBy: string;
}) {
  const parsed = parseCallReportCsv(input.csv);
  const fileHash = createHash('sha256').update(input.csv).digest('hex');
  await ensureCallReportTables();
  const existing = await queryOpsDb('SELECT * FROM ops_call_report_batches WHERE file_hash=$1 LIMIT 1', [fileHash]);
  if (existing.rows[0]) {
    return { duplicate: true, batch: existing.rows[0], parsed, processing: null };
  }

  const batch = await withOpsDbTransaction(async client => {
    const inserted = await client.query(
      `INSERT INTO ops_call_report_batches
       (file_hash,report_date,report_start_date,report_end_date,file_name,uploaded_by,total_rows,imported_rows,ignored_rows,rejected_rows)
       VALUES ($1,$2::date,$2::date,$3::date,$4,$5,$6,0,$7,$8)
       RETURNING *`,
      [
        fileHash,
        parsed.reportStartDate,
        parsed.reportEndDate,
        input.fileName,
        input.uploadedBy,
        parsed.totalRows,
        parsed.ignoredRows,
        parsed.rejected.length,
      ]
    );
    let imported = 0;
    for (const row of parsed.rows) {
      const result = await client.query(
        `INSERT INTO ops_call_report_rows
         (batch_id,fingerprint,report_date,call_time,call_id,agent_display_name,agent_extension,
          destination_phone,destination_match_key,status,ringing_seconds,talking_seconds,cost,activity_details,raw_row)
         VALUES ($1,$2,$3::date,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15::jsonb)
         ON CONFLICT (fingerprint) DO UPDATE SET
           batch_id=EXCLUDED.batch_id,status=EXCLUDED.status,
           ringing_seconds=EXCLUDED.ringing_seconds,talking_seconds=EXCLUDED.talking_seconds,
           cost=EXCLUDED.cost,activity_details=EXCLUDED.activity_details,raw_row=EXCLUDED.raw_row
         RETURNING id`,
        [
          inserted.rows[0].id, row.fingerprint, row.reportDate, row.callTime, row.evidenceReference,
          row.agentDisplayName, row.agentExtension, row.destinationPhone, phoneMatchKey(row.destinationPhone),
          row.status, row.ringingSeconds, row.talkingSeconds, row.cost || null,
          row.activityDetails || null, JSON.stringify(row.raw),
        ]
      );
      if (result.rows[0]) imported += 1;
    }
    const updated = await client.query(
      `UPDATE ops_call_report_batches SET imported_rows=$2 WHERE id=$1 RETURNING *`,
      [inserted.rows[0].id, imported]
    );
    return updated.rows[0];
  });
  const processingByDate = [];
  const processing = { verified: 0, outcomeMismatch: 0, unverified: 0, mappingRequired: 0, processed: 0 };
  for (const reportDate of parsed.reportDates) {
    const dateProcessing = await processCallReportDate(reportDate, Number(batch.id));
    processingByDate.push({ reportDate, ...dateProcessing });
    processing.verified += dateProcessing.verified;
    processing.outcomeMismatch += dateProcessing.outcomeMismatch;
    processing.unverified += dateProcessing.unverified;
    processing.mappingRequired += dateProcessing.mappingRequired;
    processing.processed += dateProcessing.processed;
  }
  const updatedBatch = await queryOpsDb(
    `UPDATE ops_call_report_batches SET matched_rows=$2,mismatch_rows=$3,unverified_rows=$4,
       mapping_required_rows=$5,processed_at=NOW()
     WHERE id=$1 RETURNING *`,
    [batch.id, processing.verified, processing.outcomeMismatch, processing.unverified, processing.mappingRequired]
  );
  return { duplicate: false, batch: updatedBatch.rows[0], parsed, processing, processingByDate };
}

export async function reprocessVerification(id: number) {
  await ensureCallReportTables();
  const result = await queryOpsDb('SELECT report_date::text AS report_date,submitted_at FROM ops_call_verifications WHERE id=$1', [id]);
  if (!result.rows[0]) throw new Error('Verification not found.');
  const reportDate = result.rows[0].report_date
    || new Intl.DateTimeFormat('en-CA', { timeZone: CENTRAL_ZONE, year: 'numeric', month: '2-digit', day: '2-digit' })
      .format(new Date(result.rows[0].submitted_at));
  return processCallReportDate(String(reportDate));
}
