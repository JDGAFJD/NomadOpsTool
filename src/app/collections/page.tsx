"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  AlertCircle, BarChart3,
  ArrowLeft, BadgeDollarSign, CalendarClock, CheckCircle2, ChevronDown, ChevronLeft, ChevronRight, ChevronUp,
  CircleDollarSign, Clock3, ExternalLink, FileText, Inbox, Loader2, LogOut, Moon,
  Mail, PhoneCall, RefreshCw, RotateCcw, Search, Sun, UserCheck, Voicemail, X,
} from 'lucide-react';
import { useTheme } from '@/components/ThemeProvider';
import {
  AdminQueueActionButtons,
  AdminQueueDialog,
  AdminQueueToolbar,
  type OpsUserOption,
} from '@/components/AdminQueueControls';
import type { AdminQueueAction } from '@/lib/adminQueueActions';
import { CallVerificationDetails, VerificationBadge, type CallVerificationRecord } from '@/components/CallVerificationStatus';

type View = 'unassigned' | 'mine' | 'all' | 'due' | 'closed' | 'collected';
type Pagination = { page: number; pageSize: number; totalRecords: number; totalPages: number };
type EmailJob = {
  id: number; case_id: number; attempt_id: number; status: 'queued'|'sending'|'failed';
  retry_count: number; max_retries: number; next_retry_at: string; last_error: string | null;
  created_at: string; customer_name: string | null; customer_email: string | null;
  outcome: string; attempt_number: number;
};
type CollectionCase = {
  id: number; customer_id: string | null; customer_name: string | null; customer_email: string | null;
  customer_phone: string | null; subscription_id: string | null; subscription_status: string | null;
  plan_id: string | null; billing_period_start: string | null; billing_period_end: string | null;
  status: string; assigned_to: string | null; current_attempt: number; next_attempt_at: string | null;
  total_amount_due: number; currency_code: string; close_reason: string | null; collected_by: string | null;
  collected_at: string | null; reopened_count: number; created_at: string; updated_at: string;
  chargebeeUrl: string | null; freeScoutUrl: string | null; latest_freescout_conversation_id?: number | null;
  due_now: boolean; age_seconds: number | string; sla_breached: boolean;
  invoices: any[]; attempts: any[]; events: any[];
  admin_disposition?: string | null; admin_actor?: string | null; admin_note?: string | null; admin_action_at?: string | null;
  verification?: CallVerificationRecord | null;
};

const STATUS_OPTIONS = ['all','unassigned','assigned','follow_up_pending','awaiting_payment_confirmation','paused','collected','exhausted','canceled','completed_by_admin','closed_by_admin'];
const ACTIVE_STATUSES = ['unassigned','assigned','follow_up_pending','awaiting_payment_confirmation','paused'];
const REASONS = [
  ['insufficient_funds','Insufficient funds'], ['expired_replaced_card','Expired or replaced card'],
  ['bank_decline','Bank decline'], ['payday_timing','Payday timing'], ['forgot','Forgot to pay'],
  ['billing_dispute','Billing dispute'], ['financial_hardship','Financial hardship'],
  ['technical_issue','Technical issue'], ['refused_payment','Refused payment'],
  ['promised_later','Promised to pay later'], ['other','Other'],
];

function humanize(value: string) {
  return value.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
}
function money(value: number, currency = 'USD') {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency }).format(Number(value || 0) / 100);
}
function when(value: string | null) {
  return value ? new Date(value).toLocaleString([], { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }) : 'Not scheduled';
}
function ageLabel(value: number | string) {
  const seconds = Math.max(0, Number(value) || 0);
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ${minutes % 60}m`;
  const days = Math.floor(hours / 24);
  return `${days}d ${hours % 24}h`;
}

export default function CollectionsPage() {
  const router = useRouter();
  const { theme, toggle } = useTheme();
  const [view, setView] = useState<View>('unassigned');
  const [agentEmail, setAgentEmail] = useState('');
  const [viewerRole, setViewerRole] = useState('');
  const [users, setUsers] = useState<OpsUserOption[]>([]);
  const [records, setRecords] = useState<CollectionCase[]>([]);
  const [page, setPage] = useState(1);
  const [pagination, setPagination] = useState<Pagination>({ page: 1, pageSize: 50, totalRecords: 0, totalPages: 1 });
  const [counts, setCounts] = useState<any>({});
  const [owners, setOwners] = useState<string[]>([]);
  const [selected, setSelected] = useState<CollectionCase | null>(null);
  const [loading, setLoading] = useState(true);
  const [working, setWorking] = useState(false);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('all');
  const [owner, setOwner] = useState('all');
  const [sort, setSort] = useState<'oldest'|'newest'>('oldest');
  const [attempt, setAttempt] = useState('all');
  const [minAmount, setMinAmount] = useState('');
  const [maxAmount, setMaxAmount] = useState('');
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');
  const [expandedInvoice, setExpandedInvoice] = useState(false);
  const [liveInvoices, setLiveInvoices] = useState<any[] | null>(null);
  const [outcome, setOutcome] = useState<'completed'|'left_voicemail'|'no_answer'|null>(null);
  const [notes, setNotes] = useState('');
  const [outcomeError, setOutcomeError] = useState('');
  const [collected, setCollected] = useState(false);
  const [claimedAmount, setClaimedAmount] = useState('');
  const [reasonCategory, setReasonCategory] = useState('');
  const [emailJobs, setEmailJobs] = useState<EmailJob[]>([]);
  const [jobsCollapsed, setJobsCollapsed] = useState(false);
  const [jobWorking, setJobWorking] = useState<number | null>(null);
  const [requestKey, setRequestKey] = useState('');
  const [verificationFilter, setVerificationFilter] = useState('all');
  const [callVerificationEnabled, setCallVerificationEnabled] = useState(false);
  const [phoneSource, setPhoneSource] = useState('on_file');
  const [calledPhone, setCalledPhone] = useState('');
  const [verificationWorking, setVerificationWorking] = useState<number | null>(null);
  const [selectedIds, setSelectedIds] = useState<number[]>([]);
  const [adminAction, setAdminAction] = useState<AdminQueueAction | null>(null);
  const [adminTargetIds, setAdminTargetIds] = useState<number[]>([]);
  const [adminWorking, setAdminWorking] = useState(false);
  const [adminNotice, setAdminNotice] = useState('');
  const selectedIdRef = useRef<number | null>(null);
  const requestIdRef = useRef(0);
  const requestControllerRef = useRef<AbortController | null>(null);
  const seenSentCaseIdsRef = useRef<Set<number>>(new Set());

  const selectCase = useCallback((record: CollectionCase | null) => {
    selectedIdRef.current = record?.id ?? null;
    setSelected(record);
    setLiveInvoices(null);
    setExpandedInvoice(false);
  }, []);

  const load = useCallback(async (): Promise<CollectionCase[]> => {
    const requestId = requestIdRef.current + 1;
    requestIdRef.current = requestId;
    requestControllerRef.current?.abort();
    const controller = new AbortController();
    requestControllerRef.current = controller;
    setLoading(true); setError('');
    try {
      const params = new URLSearchParams({ view, page: String(page), sort });
      if (search.trim()) params.set('search', search.trim());
      if (status !== 'all') params.set('status', status);
      if (owner !== 'all') params.set('owner', owner);
      if (attempt !== 'all') params.set('attempt', attempt);
      if (minAmount) params.set('minAmount', minAmount);
      if (maxAmount) params.set('maxAmount', maxAmount);
      if (fromDate) params.set('from', fromDate);
      if (toDate) params.set('to', toDate);
      if (callVerificationEnabled && verificationFilter !== 'all') params.set('verification', verificationFilter);
      const res = await fetch(`/api/ops/collections/queue?${params}`, { cache: 'no-store', signal: controller.signal });
      const data = await res.json();
      if (requestId !== requestIdRef.current) return [];
      if (!res.ok) throw new Error(data.error || 'Could not load collections.');
      setAgentEmail(data.agentEmail); setViewerRole(data.viewerRole || ''); setUsers(data.users || []);
      setCallVerificationEnabled(Boolean(data.callVerificationEnabled));
      setCounts(data.counts || {}); setOwners(data.owners || []);
      const nextRecords = data.records || [];
      const nextPagination = data.pagination || { page: 1, pageSize: 50, totalRecords: 0, totalPages: 1 };
      setRecords(nextRecords);
      setPagination(nextPagination);
      if (nextPagination.page !== page) setPage(nextPagination.page);
      const selectedId = selectedIdRef.current;
      if (selectedId !== null) {
        const updatedSelection = nextRecords.find((item: CollectionCase) => item.id === selectedId) || null;
        selectedIdRef.current = updatedSelection?.id ?? null;
        setSelected(updatedSelection);
      }
      return nextRecords;
    } catch (e: any) {
      if (e?.name !== 'AbortError' && requestId === requestIdRef.current) setError(e.message);
      return [];
    } finally {
      if (requestId === requestIdRef.current) setLoading(false);
    }
  }, [view, page, sort, search, status, owner, attempt, minAmount, maxAmount, fromDate, toDate, verificationFilter, callVerificationEnabled]);

  const loadEmailJobs = useCallback(async () => {
    try {
      const res = await fetch('/api/ops/collections/email-jobs', { cache: 'no-store' });
      const data = await res.json();
      if (res.ok) {
        setEmailJobs(data.jobs || []);
        const sentCaseIds = (data.recentlySentCaseIds || []).map(Number);
        const newlySent = sentCaseIds.filter((id: number) => !seenSentCaseIdsRef.current.has(id));
        sentCaseIds.forEach((id: number) => seenSentCaseIdsRef.current.add(id));
        if (newlySent.length > 0) void load();
      }
    } catch {}
  }, [load]);

  useEffect(() => {
    void load();
    const timer = window.setInterval(() => void load(), 60_000);
    return () => {
      window.clearInterval(timer);
      requestControllerRef.current?.abort();
    };
  }, [load]);

  useEffect(() => {
    void loadEmailJobs();
    const timer = window.setInterval(() => void loadEmailJobs(), 10_000);
    return () => window.clearInterval(timer);
  }, [loadEmailJobs]);

  const isAdmin = viewerRole === 'admin';
  const tabs = [
    ['unassigned','Unassigned',Inbox,counts.unassigned || 0],
    ['mine','My Cases',UserCheck,counts.mine || 0],
    ...(isAdmin ? [['all','All Active',UserCheck,counts.active || 0] as const] : []),
    ['due','Due Follow-ups',CalendarClock,counts.due || 0],
    ['closed','Closed',FileText,''],
    ['collected','Successful Collections',CircleDollarSign,counts.collected || 0],
  ] as const;
  const claimableRecords = view === 'unassigned' ? records.filter(item => item.status === 'unassigned') : [];
  const selectableRecords = isAdmin && ['unassigned','mine','all','due'].includes(view)
    ? records.filter(item => ACTIVE_STATUSES.includes(item.status))
    : claimableRecords;
  const allVisibleSelected = selectableRecords.length > 0 && selectableRecords.every(item => selectedIds.includes(item.id));

  useEffect(() => {
    setSelectedIds([]);
  }, [view, page, sort, search, status, owner, attempt, minAmount, maxAmount, fromDate, toDate, verificationFilter]);

  async function mutate(action: string, body: any = {}, target: CollectionCase | null = selected) {
    if (!target) return;
    setWorking(true); setError(''); setOutcomeError('');
    try {
      const res = await fetch(`/api/ops/collections/${target.id}`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action, ...body }),
      });
      const responseText = await res.text();
      let data: any = {};
      try {
        data = responseText ? JSON.parse(responseText) : {};
      } catch {
        throw new Error(res.ok ? 'The server returned an invalid response.' : `The attempt could not be saved (${res.status}).`);
      }
      if (!res.ok) throw new Error(data.error || 'Update failed.');
      setOutcome(null); setNotes(''); setCollected(false); setClaimedAmount(''); setReasonCategory('');
      setRequestKey('');
      setCalledPhone('');
      if (data.verification) setAdminNotice('Attempt saved. Twilio call verification is pending.');
      if (action === 'claim') {
        selectCase(null);
        setPage(1);
        setView('mine');
      } else if (action === 'left_voicemail' || action === 'no_answer') {
        selectCase(null);
        const nextRecords = await load();
        selectCase(nextRecords.find(item => item.id !== target.id) || null);
        await loadEmailJobs();
      } else {
        await load();
      }
    } catch (e: any) {
      const message = e.message || 'The attempt could not be saved.';
      if (action === 'left_voicemail' || action === 'no_answer' || action === 'completed') setOutcomeError(message);
      else setError(message);
    }
    finally { setWorking(false); }
  }

  const openOutcome = (nextOutcome: 'completed'|'left_voicemail'|'no_answer') => {
    setOutcomeError('');
    setRequestKey(nextOutcome === 'completed' ? '' : crypto.randomUUID());
    setPhoneSource('on_file');
    setCalledPhone('');
    setOutcome(nextOutcome);
  };

  async function recheckVerification(id: number) {
    setVerificationWorking(id);
    try {
      const res = await fetch(`/api/ops/call-verifications/${id}`, { method: 'PATCH' });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Could not recheck Twilio.');
      setAdminNotice('Twilio verification was queued for another check.');
      await load();
    } catch (e: any) {
      setError(e.message || 'Could not recheck Twilio.');
    } finally {
      setVerificationWorking(null);
    }
  }

  async function updateEmailJob(id: number, action: 'retry'|'dismiss') {
    setJobWorking(id);
    try {
      const res = await fetch(`/api/ops/collections/email-jobs/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Could not update the email task.');
      await loadEmailJobs();
    } catch (e: any) {
      setError(e.message || 'Could not update the email task.');
    } finally {
      setJobWorking(null);
    }
  }

  async function loadInvoices() {
    if (!selected) return;
    setWorking(true); setError('');
    try {
      const res = await fetch(`/api/ops/collections/${selected.id}/invoices`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Could not load invoices.');
      setLiveInvoices(data.invoices || []); setExpandedInvoice(true);
    } catch (e: any) { setError(e.message); }
    finally { setWorking(false); }
  }

  const toggleSelected = (id: number) => {
    setSelectedIds(current => current.includes(id) ? current.filter(item => item !== id) : [...current, id]);
  };

  const openAdminAction = (action: AdminQueueAction, ids: number[]) => {
    setAdminTargetIds(ids);
    setAdminAction(action);
    setAdminNotice('');
  };

  async function submitAdminAction(action: AdminQueueAction, note: string, assignee?: string) {
    setAdminWorking(true); setError('');
    try {
      const res = await fetch('/api/ops/collections/bulk', {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ids: adminTargetIds, action, note, assignee }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Administrative action failed.');
      setAdminNotice(`${data.updated} collection case${data.updated === 1 ? '' : 's'} updated${data.skipped ? `; ${data.skipped} skipped because they changed or were no longer active` : ''}.`);
      setAdminAction(null); setAdminTargetIds([]); setSelectedIds([]);
      await load();
    } catch (e: any) {
      setError(e.message || 'Administrative action failed.');
    } finally {
      setAdminWorking(false);
    }
  }

  async function claimSelectedCases() {
    if (!selectedIds.length) return;
    setWorking(true); setError(''); setAdminNotice('');
    try {
      const res = await fetch('/api/ops/collections/bulk', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ids: selectedIds, action: 'claim_self' }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'The selected cases could not be claimed.');
      setAdminNotice(`${data.updated} collection case${data.updated === 1 ? '' : 's'} assigned to you${data.skipped ? `; ${data.skipped} skipped because another agent claimed them first` : ''}.`);
      setSelectedIds([]);
      selectCase(null);
      await load();
    } catch (e: any) {
      setError(e.message || 'The selected cases could not be claimed.');
    } finally {
      setWorking(false);
    }
  }

  return (
    <div className="ops-app-shell collections-shell">
      <header className="ops-topbar collections-topbar">
        <div className="collections-title">
          <button title="Back to OPS" onClick={() => router.push('/ops/dashboard')} className="ops-icon-button"><ArrowLeft size={18}/></button>
          <div className="brand-mark"><BadgeDollarSign size={19}/></div>
          <div><div className="collections-kicker">NomadOps</div><h1>Collections</h1></div>
        </div>
        <div className="collections-header-actions">
          <span className="callback-agent-label">{agentEmail}</span>
          {isAdmin&&<button title="Collections reports" onClick={()=>router.push('/collections/reports')} className="ops-secondary-button collections-report-link"><BarChart3 size={15}/><span>Reports</span></button>}
          <button title="Refresh" onClick={() => void load()} className="ops-icon-button"><RefreshCw size={17}/></button>
          <button title="Toggle theme" onClick={toggle} className="ops-icon-button">{theme === 'dark' ? <Sun size={17}/> : <Moon size={17}/>}</button>
          <button title="Sign out" onClick={async () => { await fetch('/api/ops/logout',{method:'POST'}); router.push('/ops/login'); }} className="ops-icon-button"><LogOut size={17}/></button>
        </div>
      </header>

      <main className="collections-main">
        <div className="collections-tabs">
          {tabs.map(([id,label,Icon,count]) => <button key={id} onClick={() => { setView(id); setPage(1); selectCase(null); }} className="ops-tab" data-active={view===id}><Icon size={15}/>{label}{count !== '' && <span>{count}</span>}</button>)}
        </div>

        <section className="collections-filters">
          <label className="collections-search"><Search size={16}/><input value={search} onChange={e=>{setSearch(e.target.value);setPage(1);}} placeholder="Search customer, case, invoice, or subscription"/></label>
          <select value={status} onChange={e=>{setStatus(e.target.value);setPage(1);}}>{STATUS_OPTIONS.map(v=><option key={v} value={v}>{v==='all'?'All statuses':humanize(v)}</option>)}</select>
          <select value={owner} onChange={e=>{setOwner(e.target.value);setPage(1);}}><option value="all">All owners</option>{owners.map(v=><option key={v} value={v}>{v}</option>)}</select>
          <select aria-label="Sort collection cases" value={sort} onChange={e=>{setSort(e.target.value as 'oldest'|'newest');setPage(1);}}>
            <option value="oldest">Oldest first</option>
            <option value="newest">Newest first</option>
          </select>
          <select value={attempt} onChange={e=>{setAttempt(e.target.value);setPage(1);}}><option value="all">Any attempt</option><option value="0">Not attempted</option><option value="1">Attempt 1</option><option value="2">Attempt 2</option><option value="3">Attempt 3</option></select>
          {callVerificationEnabled&&<select value={verificationFilter} onChange={e=>{setVerificationFilter(e.target.value);setPage(1);}}>
            <option value="all">All verification</option>
            <option value="pending">Pending verification</option>
            <option value="verified">Verified</option>
            <option value="unverified">Unable to verify</option>
            <option value="outcome_mismatch">Outcome mismatch</option>
            {isAdmin&&<option value="needs_review">Needs review</option>}
            <option value="not_tracked">Not tracked</option>
          </select>}
          <input type="number" min="0" value={minAmount} onChange={e=>{setMinAmount(e.target.value);setPage(1);}} placeholder="Min $"/>
          <input type="number" min="0" value={maxAmount} onChange={e=>{setMaxAmount(e.target.value);setPage(1);}} placeholder="Max $"/>
          <input aria-label="Created from" type="date" value={fromDate} onChange={e=>{setFromDate(e.target.value);setPage(1);}}/>
          <input aria-label="Created through" type="date" value={toDate} onChange={e=>{setToDate(e.target.value);setPage(1);}}/>
          <button onClick={()=>{setSearch('');setStatus('all');setOwner('all');setAttempt('all');setVerificationFilter('all');setMinAmount('');setMaxAmount('');setFromDate('');setToDate('');setPage(1);}} className="ops-secondary-button">Reset</button>
        </section>

        {error && <div className="collections-error">{error}</div>}
        {adminNotice && <div className="admin-queue-notice">{adminNotice}</div>}
        {isAdmin && <AdminQueueToolbar count={selectedIds.length} onClear={() => setSelectedIds([])} onAction={action => openAdminAction(action, selectedIds)} />}
        {!isAdmin && selectedIds.length>0&&<section className="admin-queue-toolbar collections-claim-toolbar" aria-label="Bulk claim collection cases">
          <div><strong>{selectedIds.length} selected</strong><span>Assign these unassigned cases to yourself.</span></div>
          <button type="button" className="ops-primary-button" disabled={working} onClick={()=>void claimSelectedCases()}><UserCheck size={15}/>{working?'Claiming...':'Claim selected'}</button>
          <button type="button" className="ops-secondary-button" disabled={working} onClick={()=>setSelectedIds([])}>Clear</button>
        </section>}
        <div className={`collections-workspace ${selected ? 'is-open' : ''}`}>
          <section className="collections-list">
            {selectableRecords.length > 0 && <label className="admin-select-all"><input type="checkbox" checked={allVisibleSelected} onChange={()=>setSelectedIds(allVisibleSelected ? [] : selectableRecords.map(item=>item.id))}/>Select all {selectableRecords.length} visible collection cases</label>}
            {loading && records.length===0 ? <div className="collections-empty"><Loader2 className="animate-spin"/></div> :
             records.length===0 ? <div className="collections-empty">No collection cases in this view.</div> :
             records.map(item => <article key={item.id} className={`collection-row ${item.due_now?'is-due':''} ${item.sla_breached?'is-sla-breached':''} ${selected?.id===item.id?'is-selected':''} ${selectableRecords.some(record=>record.id===item.id)?'has-admin-select':''}`} onClick={()=>selectCase(item)}>
               {selectableRecords.some(record=>record.id===item.id)&&<input className="admin-row-checkbox" type="checkbox" checked={selectedIds.includes(item.id)} onClick={e=>e.stopPropagation()} onChange={()=>toggleSelected(item.id)} aria-label={`Select collection case ${item.id}`}/>}
               <div className="collection-row-main">
                 <div className="collection-row-heading"><strong>{item.customer_name || item.customer_email || item.customer_id || 'Unknown customer'}</strong><span>{humanize(item.status)}</span>{item.sla_breached&&<b className="collection-sla-badge">48h SLA breached</b>}{item.reopened_count>0&&<em>Reopened {item.reopened_count}x</em>}</div>
                 <div className="collection-row-meta"><span>{item.subscription_id || 'Invoice-only case'}</span><span>Attempt {Number(item.current_attempt)+1} of 3</span><span><Clock3 size={12}/>{when(item.next_attempt_at)}</span><span className={item.sla_breached?'collection-age is-breached':'collection-age'}>Age: {ageLabel(item.age_seconds)}</span>{callVerificationEnabled&&(item.attempts?.length>0||item.verification)&&<VerificationBadge verification={item.verification}/>}</div>
               </div>
               <div className="collection-row-amount"><strong>{money(item.total_amount_due,item.currency_code)}</strong><small>#{item.id}</small>{view==='unassigned'&&<button onClick={e=>{e.stopPropagation();selectCase(item);void mutate('claim',{},item);}} className="ops-primary-button">Claim</button>}</div>
             </article>)}
            <nav className="collections-pagination" aria-label="Collections pagination">
              <div>
                <strong>Page {pagination.page} of {pagination.totalPages}</strong>
                <span>{pagination.totalRecords === 0 ? 'Showing 0 records' : `Showing ${(pagination.page - 1) * pagination.pageSize + 1}-${Math.min(pagination.page * pagination.pageSize, pagination.totalRecords)} of ${pagination.totalRecords}`}</span>
              </div>
              <div>
                <button type="button" className="ops-secondary-button" disabled={pagination.page <= 1 || loading} onClick={()=>{selectCase(null);setPage(current=>Math.max(1,current-1));}}><ChevronLeft size={15}/>Previous</button>
                <button type="button" className="ops-secondary-button" disabled={pagination.page >= pagination.totalPages || loading} onClick={()=>{selectCase(null);setPage(current=>Math.min(pagination.totalPages,current+1));}}>Next<ChevronRight size={15}/></button>
              </div>
            </nav>
          </section>

          {selected && <aside className="collections-detail">
            <div className="collections-detail-head"><div><small>Collections Case #{selected.id}</small><h2>{selected.customer_name || selected.customer_email || 'Customer'}</h2></div><button onClick={()=>selectCase(null)} className="ops-icon-button"><X size={17}/></button></div>
            <div className="collections-detail-body">
              <div className="collections-balance"><span>Total outstanding</span><strong>{money(selected.total_amount_due,selected.currency_code)}</strong><em>{humanize(selected.status)}</em></div>
              <div className="collections-grid">
                <div><small>Phone</small><strong>{selected.customer_phone || 'Not available'}</strong></div>
                <div><small>Owner</small><strong>{selected.assigned_to || 'Unassigned'}</strong></div>
                <div><small>Subscription</small><strong>{selected.subscription_id || 'Invoice only'}</strong></div>
                <div><small>Status</small><strong>{selected.subscription_status || 'Unknown'}</strong></div>
                <div><small>Plan</small><strong>{selected.plan_id || 'Unknown'}</strong></div>
                <div><small>Next attempt</small><strong>{when(selected.next_attempt_at)}</strong></div>
                <div className={selected.sla_breached?'collection-detail-age is-breached':'collection-detail-age'}><small>Case age</small><strong>{ageLabel(selected.age_seconds)}</strong>{selected.sla_breached&&<span>48h SLA breached</span>}</div>
              </div>
              <div className="collections-actions">
                {selected.chargebeeUrl&&<a href={selected.chargebeeUrl} target="_blank" rel="noreferrer" className="ops-secondary-button">Chargebee Profile <ExternalLink size={14}/></a>}
                {selected.freeScoutUrl&&<a href={selected.freeScoutUrl} target="_blank" rel="noreferrer" className="ops-secondary-button">FreeScout Ticket #{selected.latest_freescout_conversation_id} <ExternalLink size={14}/></a>}
                <button onClick={()=>void loadInvoices()} disabled={working} className="ops-secondary-button">Load Invoices <RefreshCw size={14}/></button>
              </div>
              <section><button className="collections-section-toggle" onClick={()=>setExpandedInvoice(!expandedInvoice)}><span>Invoices ({(liveInvoices||selected.invoices||[]).length})</span>{expandedInvoice?<ChevronUp size={16}/>:<ChevronDown size={16}/>}</button>
                {expandedInvoice&&<div className="collections-invoices">{(liveInvoices||selected.invoices||[]).map((invoice:any)=><div key={invoice.id||invoice.invoice_id}><strong>{invoice.id||invoice.invoice_id}</strong><span>{invoice.status||invoice.invoice_status||'Unknown'}</span><span>{money(invoice.amount_due??0,invoice.currency_code||selected.currency_code)}</span></div>)}</div>}
              </section>
              <section><h3>Attempt history</h3>{selected.attempts?.length?<div className="collections-timeline">{selected.attempts.map((a:any)=><div key={a.id}><strong>Attempt {a.attempt_number}: {humanize(a.outcome)}</strong><span>{a.agent_email} · {when(a.created_at)}{a.email_delivery_status?` · Email ${humanize(a.email_delivery_status)}`:''}</span><p>{a.notes}</p>{a.freeScoutUrl&&<a className="collection-attempt-ticket" href={a.freeScoutUrl} target="_blank" rel="noreferrer">FreeScout Ticket #{a.freescout_conversation_id} <ExternalLink size={12}/></a>}{a.email_delivery_error&&<small className="collection-email-error">{a.email_delivery_error}</small>}{callVerificationEnabled&&<CallVerificationDetails verification={a.verification} isAdmin={isAdmin} working={verificationWorking===a.verification?.id} onRecheck={recheckVerification}/>}</div>)}</div>:<p className="collections-muted">No attempts recorded.</p>}</section>
              {selected.status==='unassigned'&&<button onClick={()=>void mutate('claim')} disabled={working} className="ops-primary-button collections-full">Claim Collection Case</button>}
              {selected.assigned_to===agentEmail&&['assigned','follow_up_pending','awaiting_payment_confirmation'].includes(selected.status)&&<div className="collections-outcomes">
                <button onClick={()=>openOutcome('completed')}><CheckCircle2 size={15}/>Completed</button>
                <button onClick={()=>openOutcome('left_voicemail')}><Voicemail size={15}/>Voicemail</button>
                <button onClick={()=>openOutcome('no_answer')}><PhoneCall size={15}/>No Answer</button>
              </div>}
              {isAdmin&&ACTIVE_STATUSES.includes(selected.status)&&<section className="admin-record-controls"><div><strong>Administrator controls</strong><span>Administrative completion never marks an invoice paid.</span></div><AdminQueueActionButtons onAction={action=>openAdminAction(action,[selected.id])}/></section>}
              {selected.close_reason&&<div className="collections-note"><strong>Closed:</strong> {selected.close_reason}</div>}
              {selected.admin_note&&<div className="admin-record-note"><strong>Administrative note:</strong> {selected.admin_note}<span>{selected.admin_actor} · {selected.admin_action_at?when(selected.admin_action_at):''}</span></div>}
            </div>
          </aside>}
        </div>
      </main>

      {outcome&&selected&&<div className="collections-modal-backdrop"><div className="collections-modal">
        <div className="collections-modal-head"><div><small>Attempt {Number(selected.current_attempt)+1} of 3</small><h2>{humanize(outcome)}</h2></div><button disabled={working} onClick={()=>{setOutcome(null);setOutcomeError('');}} className="ops-icon-button"><X size={17}/></button></div>
        {outcome!=='completed'&&<div className="collections-info">The call attempt will save immediately. The Compliance email will continue in the background, so you can move directly to the next case.</div>}
        {outcomeError&&<div className="collections-modal-error" role="alert">{outcomeError}</div>}
        {outcome==='completed'&&<label className="collections-check"><input type="checkbox" checked={collected} onChange={e=>setCollected(e.target.checked)}/> Were you able to collect payment?</label>}
        {outcome==='completed'&&collected&&<label><span>Amount collected</span><input type="number" min="0.01" step="0.01" value={claimedAmount} onChange={e=>setClaimedAmount(e.target.value)} placeholder="0.00"/></label>}
        {outcome==='completed'&&<label><span>{collected?'Why was payment late?':'Why were you unable to collect?'}</span><select value={reasonCategory} onChange={e=>setReasonCategory(e.target.value)}><option value="">Select a reason</option>{REASONS.map(([v,l])=><option key={v} value={v}>{l}</option>)}</select></label>}
        {callVerificationEnabled&&<label><span>Which number did you call?</span><select value={phoneSource} onChange={e=>setPhoneSource(e.target.value)}><option value="on_file">Number on file: {selected.customer_phone||'Unavailable'}</option><option value="different">Different number</option></select></label>}
        {callVerificationEnabled&&phoneSource==='different'&&<label><span>Called number</span><input value={calledPhone} onChange={e=>setCalledPhone(e.target.value)} placeholder="Enter the number dialed"/></label>}
        <label><span>Required notes</span><textarea value={notes} onChange={e=>setNotes(e.target.value)} placeholder="Document what happened, customer commitments, and next steps."/></label>
        <div className="collections-modal-actions"><button disabled={working} onClick={()=>{setOutcome(null);setOutcomeError('');setRequestKey('');}} className="ops-secondary-button">Cancel</button><button disabled={working||!notes.trim()||(outcome==='completed'&&!reasonCategory)||(collected&&!claimedAmount)||(callVerificationEnabled&&phoneSource==='on_file'&&!selected.customer_phone)||(callVerificationEnabled&&phoneSource==='different'&&calledPhone.replace(/\D/g,'').length<7)} onClick={()=>void mutate(outcome,{notes,collected,claimedAmount,reasonCategory,requestKey,...(callVerificationEnabled?{phoneSource,calledPhone}:{})})} className="ops-primary-button">{working?(outcome==='completed'?'Saving...':'Queuing...'):(outcome==='completed'?'Save Attempt':'Save and continue')}</button></div>
      </div></div>}
      {emailJobs.length>0&&<aside className={`collection-email-tray ${jobsCollapsed?'is-collapsed':''}`}>
        <button className="collection-email-tray-head" onClick={()=>setJobsCollapsed(value=>!value)} aria-expanded={!jobsCollapsed}>
          <span><Mail size={16}/><strong>Background emails</strong><b>{emailJobs.length}</b></span>
          {jobsCollapsed?<ChevronUp size={16}/>:<ChevronDown size={16}/>}
        </button>
        {!jobsCollapsed&&<div className="collection-email-tray-list">
          {emailJobs.map(job=><div key={job.id} className={`collection-email-job is-${job.status}`}>
            <div className="collection-email-job-icon">{job.status==='failed'?<AlertCircle size={16}/>:job.status==='sending'?<Loader2 className="animate-spin" size={16}/>:<Clock3 size={16}/>}</div>
            <div><strong>{job.customer_name||job.customer_email||`Case #${job.case_id}`}</strong><span>Attempt {job.attempt_number} · {job.status==='queued'?'Queued':job.status==='sending'?'Sending':'Delivery failed'}</span>{job.last_error&&<p>{job.last_error}</p>}</div>
            {job.status==='failed'&&<div className="collection-email-job-actions"><button title="Retry email" disabled={jobWorking===job.id} onClick={()=>void updateEmailJob(job.id,'retry')}><RotateCcw size={14}/></button><button title="Dismiss task" disabled={jobWorking===job.id} onClick={()=>void updateEmailJob(job.id,'dismiss')}><X size={14}/></button></div>}
          </div>)}
        </div>}
      </aside>}
      <AdminQueueDialog action={adminAction} count={adminTargetIds.length} users={users} working={adminWorking} onClose={()=>setAdminAction(null)} onSubmit={submitAdminAction}/>
    </div>
  );
}
