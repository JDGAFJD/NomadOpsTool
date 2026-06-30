"use client";

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  ArrowLeft, CheckCircle2, Clock3, FileSpreadsheet, FileUp, Filter, Info,
  Loader2, Moon, PhoneCall, RefreshCw, Search, ShoppingCart, Sun, UsersRound,
} from 'lucide-react';
import { useTheme } from '@/components/ThemeProvider';

type Batch = {
  id: number;
  file_name: string;
  uploaded_by: string;
  report_start_date: string;
  report_end_date: string;
  total_call_rows: number;
  imported_call_rows: number;
  rejected_call_rows: number;
  total_leads: number;
  called_leads: number;
  not_called_leads: number;
  pending_verification_leads: number;
  duplicate_leads: number;
  total_attempts: number;
  answered_attempts: number;
  unanswered_attempts: number;
  converted_leads: number;
  conversion_unavailable_leads: number;
  average_delay_seconds: number | null;
  total_talking_seconds: number;
  latest_call_at: string | null;
  created_at: string;
};

type LeadResult = {
  id: number;
  lead_name: string | null;
  lead_email: string | null;
  lead_phone: string | null;
  lead_zip: string | null;
  use_location: string | null;
  uses: string | null;
  lead_created_at: string;
  freescout_ticket_id: string | null;
  freescout_ticket_url: string | null;
  duplicate_count: number;
  is_duplicate: boolean;
  call_status: string;
  attempt_count: number;
  answered_count: number;
  unanswered_count: number;
  first_call_at: string | null;
  delay_seconds: number | null;
  total_talking_seconds: number;
  total_call_seconds: number;
  agents: Array<{ extension: string; name: string; attempts: number }>;
  outcomes: { labels?: string[]; connected?: boolean };
  calls: Array<{ callTime: string; agentExtension: string; agentDisplayName: string; destinationPhone: string; status: string; talkingSeconds: number; totalSeconds: number }>;
  conversion_status: string;
  shopify_conversion: ConversionState;
  chargebee_conversion: ConversionState;
};

type ConversionState = {
  state?: string;
  label?: string;
  count?: number;
  firstDate?: string | null;
  latestDate?: string | null;
  references?: string[];
  error?: string;
};

type Detail = {
  batch: Batch;
  summary: {
    total: number; called: number; not_called: number; pending_verification: number; duplicates: number; converted: number; existing: number;
    attempts: number; answered: number; unanswered: number; talking_seconds: number;
  };
  agents: Array<{ extension: string; name: string }>;
  rows: LeadResult[];
  pagination: { page: number; pageSize: number; totalRecords: number; totalPages: number };
};

const emptyFilters = {
  called: 'all',
  outcome: 'all',
  conversion: 'all',
  agent: 'all',
  duplicate: 'all',
  search: '',
};

function dateRange(batch: Batch) {
  const start = String(batch.report_start_date).slice(0, 10);
  const end = String(batch.report_end_date).slice(0, 10);
  return start === end ? start : `${start} to ${end}`;
}

function formatSeconds(seconds: number | null | undefined) {
  if (seconds === null || seconds === undefined) return 'N/A';
  const abs = Math.abs(seconds);
  const hours = Math.floor(abs / 3600);
  const minutes = Math.floor((abs % 3600) / 60);
  const secs = abs % 60;
  const value = hours ? `${hours}h ${minutes}m` : minutes ? `${minutes}m ${secs}s` : `${secs}s`;
  return seconds < 0 ? `${value} before lead` : value;
}

function formatDate(value: string | null | undefined) {
  if (!value) return 'N/A';
  return new Date(value).toLocaleString();
}

function conversionLabel(row: LeadResult) {
  if (row.conversion_status === 'converted') return 'Converted';
  if (row.conversion_status === 'existing') return 'Existing customer/order';
  if (row.conversion_status === 'unavailable') return 'Check unavailable';
  return 'Not converted';
}

function MetricTooltip({ text }: { text: string }) {
  return (
    <span className="lead-report-tooltip">
      <button type="button" aria-label={text}><Info size={11}/></button>
      <span role="tooltip">{text}</span>
    </span>
  );
}

function ConversionChip({ label, detail }: { label: string; detail: ConversionState }) {
  return (
    <span className="lead-report-conversion-chip" data-state={detail?.state || 'not_found'}>
      <strong>{label}</strong>
      <small>{detail?.label || 'No details'}</small>
      {Boolean(detail?.references?.length) && <em>{detail.references?.join(', ')}</em>}
    </span>
  );
}

async function readJsonResponse(response: Response, fallback: string) {
  const text = await response.text();
  if (!text) return {};
  try {
    return JSON.parse(text);
  } catch {
    throw new Error(response.ok ? fallback : `${fallback} (${response.status}): ${text.slice(0, 160)}`);
  }
}

export default function LeadReportsClient({ userEmail }: { userEmail: string }) {
  const router = useRouter();
  const { theme, toggle } = useTheme();
  const [file, setFile] = useState<File | null>(null);
  const [loadingList, setLoadingList] = useState(true);
  const [loadingDetail, setLoadingDetail] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');
  const [batches, setBatches] = useState<Batch[]>([]);
  const [totals, setTotals] = useState<Record<string, number>>({});
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [detail, setDetail] = useState<Detail | null>(null);
  const [filters, setFilters] = useState(emptyFilters);
  const [page, setPage] = useState(1);
  const [resultNotice, setResultNotice] = useState('');

  const loadList = useCallback(async (preferredId?: number, options?: { refreshing?: boolean }) => {
    setLoadingList(true);
    if (options?.refreshing) setRefreshing(true);
    setError('');
    try {
      const response = await fetch('/api/ops/lead-reports', { cache: 'no-store' });
      const data = await readJsonResponse(response, 'Could not load lead reports.');
      if (!response.ok) throw new Error(data.error || 'Could not load lead reports.');
      setBatches(data.batches || []);
      setTotals(data.totals || {});
      const nextId = preferredId || selectedId || data.batches?.[0]?.id || null;
      setSelectedId(nextId);
    } catch (err: any) {
      setError(err.message || 'Could not load lead reports.');
    } finally {
      setLoadingList(false);
      if (options?.refreshing) setRefreshing(false);
    }
  }, [selectedId]);

  const loadDetail = useCallback(async () => {
    if (!selectedId) {
      setDetail(null);
      return;
    }
    setLoadingDetail(true);
    const params = new URLSearchParams({ ...filters, page: String(page) });
    try {
      const response = await fetch(`/api/ops/lead-reports/${selectedId}?${params}`, { cache: 'no-store' });
      const data = await readJsonResponse(response, 'Could not load report detail.');
      if (!response.ok) throw new Error(data.error || 'Could not load report detail.');
      setDetail(data);
    } catch (err: any) {
      setError(err.message || 'Could not load report detail.');
    } finally {
      setLoadingDetail(false);
    }
  }, [filters, page, selectedId]);

  useEffect(() => { void loadList(); }, []);
  useEffect(() => { void loadDetail(); }, [loadDetail]);

  const metricCards = useMemo(() => {
    const batch = detail?.batch;
    return [
      ['Leads', batch?.total_leads || 0, UsersRound, 'Leads created during the uploaded CSV date range.'],
      ['Called', batch?.called_leads || 0, PhoneCall, 'Unique leads with at least one matching outbound 3CX call by final seven phone digits.'],
      ['Pending verification', batch?.pending_verification_leads || 0, Clock3, 'Leads created after the newest call in this uploaded report, so they are waiting for the next updated 3CX report before they can be judged.'],
      ['Not called', batch?.not_called_leads || 0, Clock3, 'Leads with no matching outbound call in this report after excluding pending-verification leads.'],
      ['Duplicates', batch?.duplicate_leads || 0, UsersRound, 'Lead duplicate rows only, based on full phone, then email, then name plus zip.'],
      ['Attempts', batch?.total_attempts || 0, FileSpreadsheet, 'Total matched call attempts across all leads.'],
      ['Answered', batch?.answered_attempts || 0, CheckCircle2, 'Matched calls where 3CX status is Answered.'],
      ['Unanswered', batch?.unanswered_attempts || 0, PhoneCall, 'Matched calls where 3CX status is Unanswered.'],
      ['Avg delay', formatSeconds(batch?.average_delay_seconds), Clock3, 'Average time from Slack lead creation to the first matched call.'],
      ['Talk time', formatSeconds(batch?.total_talking_seconds || 0), PhoneCall, 'Total talking duration across matched calls.'],
      ['Converted', batch?.converted_leads || 0, ShoppingCart, 'Leads with Shopify or Chargebee records created after the lead timestamp.'],
    ] as const;
  }, [detail]);

  const upload = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!file) return;
    setUploading(true);
    setError('');
    setResultNotice('');
    try {
      const form = new FormData();
      form.append('file', file);
      const response = await fetch('/api/ops/lead-reports', { method: 'POST', body: form });
      const data = await readJsonResponse(response, 'The lead report could not be uploaded.');
      if (!response.ok) throw new Error(data.error || 'The lead report could not be uploaded.');
      setFile(null);
      setFilters(emptyFilters);
      setPage(1);
      setResultNotice(data.duplicate ? 'That exact file was already processed. Opened the saved report.' : `Processed ${data.batch.imported_call_rows} call rows.`);
      await loadList(data.batch.id);
    } catch (err: any) {
      setError(err.message || 'The lead report could not be uploaded.');
    } finally {
      setUploading(false);
    }
  };

  const updateFilter = (key: keyof typeof emptyFilters, value: string) => {
    setFilters(prev => ({ ...prev, [key]: value }));
    setPage(1);
  };

  const selectedBatch = batches.find(batch => batch.id === selectedId) || null;
  const firstLoad = loadingList && !batches.length && !detail;
  const busy = uploading || refreshing || loadingList || loadingDetail;

  const refreshAll = async () => {
    setRefreshing(true);
    try {
      await loadList(undefined, { refreshing: true });
      await loadDetail();
    } finally {
      setRefreshing(false);
    }
  };

  return (
    <div className="ops-app-shell call-report-shell lead-report-shell">
      <header className="ops-topbar call-report-topbar">
        <div className="call-report-title">
          <button title="Back to OPS" className="ops-icon-button" onClick={() => router.push('/ops/dashboard')}><ArrowLeft size={18}/></button>
          <div className="brand-mark"><FileSpreadsheet size={19}/></div>
          <div><small>NomadOps</small><h1>Lead Reports</h1></div>
        </div>
        <div className="call-report-header-actions">
          <span>{userEmail}</span>
          <button title="Refresh" className="ops-icon-button" disabled={busy} onClick={() => { void refreshAll(); }}>{refreshing ? <Loader2 className="animate-spin" size={17}/> : <RefreshCw size={17}/>}</button>
          <button title="Toggle theme" className="ops-icon-button" onClick={toggle}>{theme === 'dark' ? <Sun size={17}/> : <Moon size={17}/>}</button>
        </div>
      </header>

      <main className="call-report-main">
        {firstLoad && <section className="lead-report-page-loader"><Loader2 className="animate-spin" size={24}/><strong>Loading lead reports...</strong><span>Pulling saved reports and latest metrics.</span></section>}
        {error && <div className="collections-error">{error}</div>}
        {resultNotice && <div className="collections-success">{resultNotice}</div>}

        <section className="call-report-intake-grid">
          <form className="call-report-upload" onSubmit={upload}>
            <div><FileUp size={20}/><div><small>3CX lead report</small><h2>Upload outbound CSV</h2></div></div>
            <p>Scores Slack address lookup leads against outbound calls using the last seven digits of the customer phone number.</p>
            <input type="file" accept=".csv,text/csv" onChange={event => setFile(event.target.files?.[0] || null)}/>
            <button className="ops-primary-button" disabled={!file || uploading}>{uploading ? <Loader2 className="animate-spin" size={16}/> : <FileSpreadsheet size={16}/>} {uploading ? 'Processing...' : 'Upload and analyze'}</button>
            {uploading && <div className="lead-report-inline-loader"><Loader2 className="animate-spin" size={14}/> Processing CSV and checking conversions...</div>}
          </form>

          <section className="call-report-result">
            <div className="call-report-section-head lead-report-history-head">
              <div><small>Saved reports</small><h2>{selectedBatch ? dateRange(selectedBatch) : 'No report selected'}</h2></div>
              <span>{totals.reports || 0} reports saved</span>
            </div>
            <div className="lead-report-history-list">
              {loadingList && <div className="lead-report-inline-loader"><Loader2 className="animate-spin" size={14}/> Loading saved reports...</div>}
              {batches.map(batch => (
                <button key={batch.id} type="button" data-active={selectedId === batch.id} disabled={loadingDetail || uploading} onClick={() => { setSelectedId(batch.id); setPage(1); }}>
                  <strong>{dateRange(batch)}</strong>
                  <span>{batch.file_name} · {batch.total_leads} leads · {batch.called_leads} called · {batch.converted_leads} converted</span>
                </button>
              ))}
              {!batches.length && !loadingList && <p>No lead reports uploaded yet.</p>}
            </div>
          </section>
        </section>

        <section className={`call-report-metrics lead-report-metrics ${loadingDetail ? 'lead-report-busy' : ''}`}>
          {loadingDetail && <div className="lead-report-overlay-loader"><Loader2 className="animate-spin" size={16}/> Updating metrics...</div>}
          {metricCards.map(([label, value, Icon, help]) => (
            <article key={label} data-state={label === 'Converted' ? 'verified' : label === 'Not called' ? 'pending' : undefined}>
              <div><span>{label} <MetricTooltip text={String(help)}/></span><strong>{value}</strong></div><Icon size={20}/>
            </article>
          ))}
        </section>

        <section className="lead-report-match-panel">
          <Info size={18}/>
          <div>
            <strong>How phone matching works</strong>
            <p>Both the lead phone and the 3CX destination number are normalized by removing every non-digit character, then the system compares only the final 7 digits. Dashes, spaces, parentheses, and a leading +1 do not affect matching.</p>
            <p>Pending verification means the lead was created after this report&apos;s newest call time{detail?.batch.latest_call_at ? ` (${formatDate(detail.batch.latest_call_at)})` : ''}, so upload the next updated 3CX report to verify it.</p>
            <code>(305) 341-3919 → 3413919</code>
            <code>+1-305-341-3919 → 3413919</code>
          </div>
        </section>

        <section className="call-report-section">
          <div className="call-report-section-head">
            <div><small>Lead detail</small><h2>Calls, duplicates, and conversions</h2></div>
            <span>{loadingDetail ? <><Loader2 className="animate-spin" size={13}/> Updating report...</> : detail ? `Showing ${detail.rows.length} of ${detail.pagination.totalRecords}` : 'Upload or select a report'}</span>
          </div>

          <div className="lead-report-filters">
            <label><Search size={15}/><input value={filters.search} onChange={event => updateFilter('search', event.target.value)} placeholder="Search name, email, phone, zip, ticket..." /></label>
            <select value={filters.called} onChange={event => updateFilter('called', event.target.value)}>
              <option value="all">All call states</option><option value="called">Called</option><option value="pending_verification">Pending verification</option><option value="not_called">Not called</option><option value="no_phone">No phone</option>
            </select>
            <select value={filters.outcome} onChange={event => updateFilter('outcome', event.target.value)}>
              <option value="all">All outcomes</option><option value="answered">Answered</option><option value="unanswered">Only unanswered</option>
            </select>
            <select value={filters.conversion} onChange={event => updateFilter('conversion', event.target.value)}>
              <option value="all">All conversions</option><option value="converted">Converted</option><option value="not_converted">Not converted</option><option value="existing">Existing customer/order</option><option value="unavailable">Check unavailable</option>
            </select>
            <select value={filters.agent} onChange={event => updateFilter('agent', event.target.value)}>
              <option value="all">All agents</option>
              {detail?.agents.map(agent => <option key={agent.extension} value={agent.extension}>{agent.extension} · {agent.name}</option>)}
            </select>
            <select value={filters.duplicate} onChange={event => updateFilter('duplicate', event.target.value)}>
              <option value="all">All leads</option><option value="yes">Duplicates only</option>
            </select>
            <button type="button" className="ops-secondary-button" onClick={() => { setFilters(emptyFilters); setPage(1); }}><Filter size={15}/> Reset</button>
          </div>

          <div className={`lead-report-table ${loadingDetail ? 'lead-report-busy' : ''}`}>
            {loadingDetail && <div className="lead-report-overlay-loader"><Loader2 className="animate-spin" size={16}/> Updating lead rows...</div>}
            {detail?.rows.map(row => (
              <article key={row.id} data-called={row.attempt_count > 0} data-status={row.call_status}>
                <div className="lead-report-lead">
                  <strong>{row.lead_name || row.lead_email || 'Unknown lead'}</strong>
                  <span>{row.lead_email || 'No email'} · {row.lead_phone || 'No phone'} · ZIP {row.lead_zip || 'N/A'}</span>
                  <small>Created {formatDate(row.lead_created_at)}{row.freescout_ticket_url && <> · <a href={row.freescout_ticket_url} target="_blank" rel="noreferrer">FreeScout #{row.freescout_ticket_id}</a></>}</small>
                  {row.is_duplicate && <em title="Duplicate lead rows only, not duplicate calls.">Duplicate lead group: {row.duplicate_count}</em>}
                </div>
                <div className="lead-report-call">
                  <strong>{row.attempt_count ? `${row.attempt_count} attempt${row.attempt_count === 1 ? '' : 's'}` : row.call_status === 'pending_verification' ? 'Pending verification' : row.call_status === 'no_phone' ? 'No phone to match' : 'Not called'}</strong>
                  <span>{row.first_call_at ? `First call ${formatDate(row.first_call_at)}` : 'No matched first call'}</span>
                  {row.call_status === 'pending_verification' && <small className="lead-report-warning">Waiting for the next updated call report.</small>}
                  <small className={row.delay_seconds !== null && row.delay_seconds < 0 ? 'lead-report-warning' : ''}>Delay: {formatSeconds(row.delay_seconds)}</small>
                  <small>Talk: {formatSeconds(row.total_talking_seconds)} · Total: {formatSeconds(row.total_call_seconds)}</small>
                </div>
                <div className="lead-report-agents">
                  <strong>{row.outcomes?.labels?.join(', ') || 'No outcome'}</strong>
                  <span>{row.agents?.map(agent => `${agent.name || agent.extension} (${agent.attempts})`).join(', ') || 'No agent'}</span>
                  <small>Answered {row.answered_count} · Unanswered {row.unanswered_count}</small>
                </div>
                <div className="lead-report-conversion">
                  <strong>{conversionLabel(row)}</strong>
                  <ConversionChip label="Shopify" detail={row.shopify_conversion}/>
                  <ConversionChip label="Chargebee" detail={row.chargebee_conversion}/>
                </div>
              </article>
            ))}
            {detail && detail.rows.length === 0 && <div className="collections-empty">No leads match the current filters.</div>}
            {!detail && <div className="collections-empty">Select or upload a report to view lead results.</div>}
          </div>

          {detail && <nav className="collections-pagination lead-report-pagination">
            <div><strong>Page {detail.pagination.page} of {detail.pagination.totalPages}</strong><span>Showing up to {detail.pagination.pageSize} leads per page</span></div>
            <div>
              <button className="ops-secondary-button" disabled={loadingDetail || page <= 1} onClick={() => setPage(prev => Math.max(1, prev - 1))}>Previous</button>
              <button className="ops-secondary-button" disabled={loadingDetail || page >= detail.pagination.totalPages} onClick={() => setPage(prev => prev + 1)}>Next</button>
            </div>
          </nav>}
        </section>
      </main>
    </div>
  );
}
