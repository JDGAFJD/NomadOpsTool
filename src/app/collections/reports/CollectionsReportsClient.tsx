"use client";

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  Area, AreaChart, Bar, BarChart, CartesianGrid, Cell, Pie, PieChart,
  ResponsiveContainer, Tooltip, XAxis, YAxis,
} from 'recharts';
import {
  AlertTriangle, ArrowLeft, Bot, CalendarClock, CheckCircle2, CircleDollarSign,
  Clock3, FileText, Inbox, Loader2, Moon, RefreshCw, Sparkles, Sun, UserCheck, Users,
} from 'lucide-react';
import { useTheme } from '@/components/ThemeProvider';

type Filters = {
  from: string; to: string; agent: string; attempt: string;
  outcome: string; status: string; reason: string; feedbackPage: number;
};
type Report = {
  filters: Filters;
  workload: {
    open: number; assigned: number; unassigned: number; due: number;
    oldestCreatedAt: string | null; oldestAgeSeconds: number;
    byAttempt: { attempt: number; value: number }[];
    byAgent: { agentEmail: string; assigned: number; due: number }[];
  };
  totals: {
    attempts: number; completed: number; leftVoicemail: number; noAnswer: number;
    attributedAmount: number; attributedInvoices: number; unattributedAmount: number; unattributedInvoices: number;
  };
  agents: {
    agentEmail: string; assigned: number; due: number; attempts: number;
    completed: number; leftVoicemail: number; noAnswer: number; paidInvoices: number;
    creditedAmount: number; avgSecondsToPayment: number | null;
  }[];
  charts: {
    outcomes: { name: string; value: number }[];
    attempts: { attempt: number; value: number }[];
    reasons: { name: string; value: number }[];
    collectionsTimeline: { day: string; creditedAmount: number }[];
    creditByAgent: { agentEmail: string; creditedAmount: number; paidInvoices: number }[];
  };
  feedback: {
    records: {
      id: number; case_id: number; agent_email: string; attempt_number: number; outcome: string;
      notes: string; reason_category: string | null; collected: boolean | null; created_at: string; case_status: string;
    }[];
    pagination: { page: number; pageSize: number; totalRecords: number; totalPages: number };
  };
  options: { agents: string[]; statuses: string[]; reasons: string[] };
};
type SavedSummary = {
  id: number; generated_by: string; filters: Filters; summary: string; model: string; created_at: string;
};

const OUTCOME_COLORS: Record<string, string> = {
  completed: '#10b981',
  left_voicemail: '#3b82f6',
  no_answer: '#f59e0b',
};

function humanize(value: string) {
  return value.replace(/_/g, ' ').replace(/\b\w/g, letter => letter.toUpperCase());
}

function money(value: number) {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(Number(value || 0) / 100);
}

function duration(seconds: number | null) {
  if (seconds === null) return 'N/A';
  const hours = Math.floor(seconds / 3600);
  if (hours < 24) return `${hours}h`;
  return `${Math.floor(hours / 24)}d ${hours % 24}h`;
}

function shortAgent(email: string) {
  return email.split('@')[0].replace(/[._]/g, ' ');
}

function markdownBlocks(value: string) {
  return value.split('\n').filter(Boolean).map((line, index) => {
    if (line.startsWith('### ')) return <h4 key={index}>{line.slice(4)}</h4>;
    if (line.startsWith('## ')) return <h3 key={index}>{line.slice(3)}</h3>;
    if (line.startsWith('# ')) return <h3 key={index}>{line.slice(2)}</h3>;
    if (/^[-*]\s/.test(line)) return <li key={index}>{line.slice(2)}</li>;
    return <p key={index}>{line.replace(/\*\*/g, '')}</p>;
  });
}

export default function CollectionsReportsClient({
  agentEmail,
  defaultFrom,
  defaultTo,
}: {
  agentEmail: string;
  defaultFrom: string;
  defaultTo: string;
}) {
  const router = useRouter();
  const { theme, toggle } = useTheme();
  const dates = useMemo(() => ({ from: defaultFrom, to: defaultTo }), [defaultFrom, defaultTo]);
  const [filters, setFilters] = useState<Filters>({
    ...dates, agent: 'all', attempt: 'all', outcome: 'all', status: 'all', reason: 'all', feedbackPage: 1,
  });
  const [report, setReport] = useState<Report | null>(null);
  const [summaries, setSummaries] = useState<SavedSummary[]>([]);
  const [selectedSummary, setSelectedSummary] = useState<SavedSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [summarizing, setSummarizing] = useState(false);
  const [error, setError] = useState('');

  const loadReport = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const params = new URLSearchParams(Object.entries(filters).map(([key, value]) => [key, String(value)]));
      const response = await fetch(`/api/ops/admin/collections/reports?${params}`, { cache: 'no-store' });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Could not load Collections reports.');
      setReport(data);
    } catch (err: any) {
      setError(err.message || 'Could not load Collections reports.');
    } finally {
      setLoading(false);
    }
  }, [filters]);

  const loadSummaries = useCallback(async () => {
    try {
      const response = await fetch('/api/ops/admin/collections/reports/summaries', { cache: 'no-store' });
      const data = await response.json();
      if (response.ok) setSummaries(data.summaries || []);
    } catch {}
  }, []);

  useEffect(() => { void loadReport(); }, [loadReport]);
  useEffect(() => { void loadSummaries(); }, [loadSummaries]);

  const updateFilter = (key: keyof Filters, value: string | number) => {
    setFilters(current => ({ ...current, [key]: value, feedbackPage: key === 'feedbackPage' ? Number(value) : 1 }));
  };

  const resetFilters = () => {
    setFilters({ ...dates, agent: 'all', attempt: 'all', outcome: 'all', status: 'all', reason: 'all', feedbackPage: 1 });
  };

  const generateSummary = async () => {
    setSummarizing(true);
    setError('');
    try {
      const response = await fetch('/api/ops/admin/collections/reports/summary', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(filters),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Could not generate the AI summary.');
      setSelectedSummary(data.summary);
      await loadSummaries();
    } catch (err: any) {
      setError(err.message || 'Could not generate the AI summary.');
    } finally {
      setSummarizing(false);
    }
  };

  const outcomeTotal = report?.charts.outcomes.reduce((sum, item) => sum + item.value, 0) || 0;
  const metricCards = report ? [
    ['Open cases', report.workload.open, Users, 'neutral'],
    ['Unassigned', report.workload.unassigned, Inbox, 'neutral'],
    ['Assigned', report.workload.assigned, UserCheck, 'neutral'],
    ['Due now', report.workload.due, CalendarClock, 'warning'],
    ['Oldest active', duration(report.workload.oldestAgeSeconds), Clock3, 'neutral'],
    ['Credited collections', money(report.totals.attributedAmount), CircleDollarSign, 'success'],
    ['Attempts', report.totals.attempts, CheckCircle2, 'neutral'],
  ] as const : [];

  return (
    <div className="ops-app-shell collection-reports-shell">
      <header className="ops-topbar collection-reports-topbar">
        <div className="collection-reports-title">
          <button title="Back to Collections" onClick={() => router.push('/collections')} className="ops-icon-button"><ArrowLeft size={18}/></button>
          <div className="brand-mark"><FileText size={19}/></div>
          <div><small>NomadOps</small><h1>Collections Reports</h1></div>
        </div>
        <div className="collection-reports-header-actions">
          <span>{agentEmail}</span>
          <button title="Refresh reports" onClick={() => void loadReport()} className="ops-icon-button"><RefreshCw size={17}/></button>
          <button title="Toggle theme" onClick={toggle} className="ops-icon-button">{theme === 'dark' ? <Sun size={17}/> : <Moon size={17}/>}</button>
        </div>
      </header>

      <main className="collection-reports-main">
        <section className="collection-report-toolbar">
          <label><span>From</span><input type="date" value={filters.from} onChange={event => updateFilter('from', event.target.value)}/></label>
          <label><span>Through</span><input type="date" value={filters.to} onChange={event => updateFilter('to', event.target.value)}/></label>
          <label><span>Agent</span><select value={filters.agent} onChange={event => updateFilter('agent', event.target.value)}><option value="all">All agents</option>{report?.options.agents.map(value => <option key={value} value={value}>{value}</option>)}</select></label>
          <label><span>Attempt</span><select value={filters.attempt} onChange={event => updateFilter('attempt', event.target.value)}><option value="all">All attempts</option><option value="1">Attempt 1</option><option value="2">Attempt 2</option><option value="3">Attempt 3</option></select></label>
          <label><span>Outcome</span><select value={filters.outcome} onChange={event => updateFilter('outcome', event.target.value)}><option value="all">All outcomes</option><option value="completed">Completed</option><option value="left_voicemail">Voicemail</option><option value="no_answer">No answer</option></select></label>
          <label><span>Status</span><select value={filters.status} onChange={event => updateFilter('status', event.target.value)}><option value="all">All statuses</option>{report?.options.statuses.map(value => <option key={value} value={value}>{humanize(value)}</option>)}</select></label>
          <label><span>Reason</span><select value={filters.reason} onChange={event => updateFilter('reason', event.target.value)}><option value="all">All reasons</option>{report?.options.reasons.map(value => <option key={value} value={value}>{humanize(value)}</option>)}</select></label>
          <button className="ops-secondary-button" onClick={resetFilters}>Reset</button>
        </section>

        {error && <div className="collections-error">{error}</div>}
        {loading && !report ? <div className="collection-report-loading"><Loader2 className="animate-spin"/> Loading reports...</div> : report && <>
          <section className="collection-report-metrics">
            {metricCards.map(([label, value, Icon, tone]) => <article key={label} data-tone={tone}><div><span>{label}</span><strong>{value}</strong></div><Icon size={20}/></article>)}
          </section>

          <section className="collection-report-section">
            <div className="collection-report-section-head"><div><small>Live workload</small><h2>Queue position now</h2></div><span>Date filters do not change these live figures.</span></div>
            <div className="collection-report-live-grid">
              <div className="collection-report-chart">
                <h3>Cases by next attempt</h3>
                <ResponsiveContainer width="100%" height={230}>
                  <BarChart data={report.workload.byAttempt}><CartesianGrid strokeDasharray="3 3" vertical={false}/><XAxis dataKey="attempt" tickFormatter={value => `Attempt ${value}`}/><YAxis allowDecimals={false}/><Tooltip/><Bar dataKey="value" fill="#14b8a6" radius={[4,4,0,0]}/></BarChart>
                </ResponsiveContainer>
              </div>
              <div className="collection-report-table-wrap">
                <h3>Current assignment by agent</h3>
                <table><thead><tr><th>Agent</th><th>Assigned</th><th>Due</th></tr></thead><tbody>{report.workload.byAgent.map(row => <tr key={row.agentEmail}><td>{row.agentEmail}</td><td>{row.assigned}</td><td>{row.due}</td></tr>)}</tbody></table>
              </div>
            </div>
          </section>

          <section className="collection-report-section">
            <div className="collection-report-section-head"><div><small>Selected period</small><h2>Call outcomes and collections</h2></div><span>{filters.from} through {filters.to}</span></div>
            <div className="collection-report-chart-grid">
              <div className="collection-report-chart"><h3>Call outcomes</h3><ResponsiveContainer width="100%" height={250}><PieChart><Pie data={report.charts.outcomes} dataKey="value" nameKey="name" innerRadius={55} outerRadius={90} paddingAngle={3}>{report.charts.outcomes.map(item => <Cell key={item.name} fill={OUTCOME_COLORS[item.name] || '#94a3b8'}/>)}</Pie><Tooltip formatter={(value, name) => [value, humanize(String(name))]}/></PieChart></ResponsiveContainer><div className="collection-report-legend">{report.charts.outcomes.map(item => <span key={item.name}><i style={{background:OUTCOME_COLORS[item.name] || '#94a3b8'}}/>{humanize(item.name)} {outcomeTotal ? Math.round(item.value / outcomeTotal * 100) : 0}%</span>)}</div></div>
              <div className="collection-report-chart"><h3>Attempts by stage</h3><ResponsiveContainer width="100%" height={250}><BarChart data={report.charts.attempts}><CartesianGrid strokeDasharray="3 3" vertical={false}/><XAxis dataKey="attempt" tickFormatter={value => `#${value}`}/><YAxis allowDecimals={false}/><Tooltip/><Bar dataKey="value" fill="#3b82f6" radius={[4,4,0,0]}/></BarChart></ResponsiveContainer></div>
              <div className="collection-report-chart"><h3>Credited dollars over time</h3><ResponsiveContainer width="100%" height={250}><AreaChart data={report.charts.collectionsTimeline}><CartesianGrid strokeDasharray="3 3" vertical={false}/><XAxis dataKey="day"/><YAxis tickFormatter={value => `$${Math.round(value/100)}`}/><Tooltip formatter={value => money(Number(value))}/><Area type="monotone" dataKey="creditedAmount" stroke="#10b981" fill="rgba(16,185,129,.18)"/></AreaChart></ResponsiveContainer></div>
              <div className="collection-report-chart"><h3>Collection credit by agent</h3><ResponsiveContainer width="100%" height={250}><BarChart data={report.charts.creditByAgent} layout="vertical"><CartesianGrid strokeDasharray="3 3" horizontal={false}/><XAxis type="number" tickFormatter={value => `$${Math.round(value/100)}`}/><YAxis type="category" dataKey="agentEmail" width={110} tickFormatter={shortAgent}/><Tooltip formatter={value => money(Number(value))}/><Bar dataKey="creditedAmount" fill="#8b5cf6" radius={[0,4,4,0]}/></BarChart></ResponsiveContainer></div>
              <div className="collection-report-chart collection-report-chart-wide"><h3>Payment and non-collection reasons</h3><ResponsiveContainer width="100%" height={260}><BarChart data={report.charts.reasons}><CartesianGrid strokeDasharray="3 3" vertical={false}/><XAxis dataKey="name" tickFormatter={humanize} interval={0} angle={-20} textAnchor="end" height={72}/><YAxis allowDecimals={false}/><Tooltip labelFormatter={label => humanize(String(label || ''))}/><Bar dataKey="value" fill="#f59e0b" radius={[4,4,0,0]}/></BarChart></ResponsiveContainer></div>
            </div>
            {filters.agent === 'all' && report.totals.unattributedInvoices > 0 && <div className="collection-report-unattributed"><AlertTriangle size={16}/><span><strong>{money(report.totals.unattributedAmount)}</strong> across {report.totals.unattributedInvoices} paid invoice(s) had no eligible call attempt and received no agent credit.</span></div>}
          </section>

          <section className="collection-report-section">
            <div className="collection-report-section-head"><div><small>Performance</small><h2>Agent scorecard</h2></div></div>
            <div className="collection-report-table-wrap is-scrollable">
              <table><thead><tr><th>Agent</th><th>Assigned now</th><th>Due</th><th>Attempts</th><th>Completed</th><th>Voicemail</th><th>No answer</th><th>Paid invoices</th><th>Credited</th><th>Avg. to payment</th></tr></thead><tbody>{report.agents.map(row => <tr key={row.agentEmail}><td><strong>{row.agentEmail}</strong></td><td>{row.assigned}</td><td>{row.due}</td><td>{row.attempts}</td><td>{row.completed}{row.attempts ? ` (${Math.round(row.completed/row.attempts*100)}%)` : ''}</td><td>{row.leftVoicemail}</td><td>{row.noAnswer}</td><td>{row.paidInvoices}</td><td className="is-money">{money(row.creditedAmount)}</td><td>{duration(row.avgSecondsToPayment)}</td></tr>)}</tbody></table>
            </div>
          </section>

          <section className="collection-report-section">
            <div className="collection-report-section-head"><div><small>Agent feedback</small><h2>Attempt notes and reasons</h2></div><span>{report.feedback.pagination.totalRecords} records</span></div>
            <div className="collection-feedback-list">{report.feedback.records.map(item => <article key={item.id}><div><strong>Case #{item.case_id} · Attempt {item.attempt_number}</strong><span>{item.agent_email} · {new Date(item.created_at).toLocaleString()}</span></div><div className="collection-feedback-tags"><span>{humanize(item.outcome)}</span><span>{humanize(item.reason_category || 'not_recorded')}</span><span>{humanize(item.case_status)}</span></div><p>{item.notes}</p></article>)}</div>
            <nav className="collections-pagination"><div><strong>Page {report.feedback.pagination.page} of {report.feedback.pagination.totalPages}</strong><span>Showing up to {report.feedback.pagination.pageSize} feedback records</span></div><div><button className="ops-secondary-button" disabled={filters.feedbackPage <= 1} onClick={() => updateFilter('feedbackPage', filters.feedbackPage - 1)}>Previous</button><button className="ops-secondary-button" disabled={filters.feedbackPage >= report.feedback.pagination.totalPages} onClick={() => updateFilter('feedbackPage', filters.feedbackPage + 1)}>Next</button></div></nav>
          </section>

          <section className="collection-report-section collection-ai-report">
            <div className="collection-report-section-head"><div><small>AI analysis</small><h2>Management summary</h2></div><button className="ops-primary-button" disabled={summarizing} onClick={() => void generateSummary()}>{summarizing ? <Loader2 className="animate-spin" size={15}/> : <Sparkles size={15}/>} {summarizing ? 'Analyzing...' : 'Generate summary'}</button></div>
            <div className="collection-ai-grid">
              <div className="collection-ai-output">
                {selectedSummary ? <><div className="collection-ai-meta"><Bot size={16}/><span>{selectedSummary.generated_by} · {new Date(selectedSummary.created_at).toLocaleString()} · {selectedSummary.model}</span></div><div className="collection-ai-copy">{markdownBlocks(selectedSummary.summary)}</div></> : <div className="collection-ai-empty"><Bot size={28}/><strong>No summary selected</strong><span>Generate a report from the current filters or open a saved report.</span></div>}
              </div>
              <aside className="collection-ai-history"><h3>Saved summaries</h3>{summaries.length ? summaries.map(item => <button key={item.id} onClick={() => setSelectedSummary(item)} data-active={selectedSummary?.id === item.id}><strong>{new Date(item.created_at).toLocaleDateString()}</strong><span>{item.generated_by}</span><small>{item.filters.from} to {item.filters.to}{item.filters.agent !== 'all' ? ` · ${shortAgent(item.filters.agent)}` : ''}</small></button>) : <p>No saved summaries yet.</p>}</aside>
            </div>
          </section>
        </>}
      </main>
    </div>
  );
}
