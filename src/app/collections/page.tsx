"use client";

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  ArrowLeft, BadgeDollarSign, CalendarClock, CheckCircle2, ChevronDown, ChevronLeft, ChevronRight, ChevronUp,
  CircleDollarSign, Clock3, ExternalLink, FileText, Inbox, Loader2, LogOut, Moon,
  PhoneCall, RefreshCw, Search, Sun, UserCheck, Voicemail, X,
} from 'lucide-react';
import { useTheme } from '@/components/ThemeProvider';
import {
  AdminQueueActionButtons,
  AdminQueueDialog,
  AdminQueueToolbar,
  type OpsUserOption,
} from '@/components/AdminQueueControls';
import type { AdminQueueAction } from '@/lib/adminQueueActions';

type View = 'unassigned' | 'mine' | 'all' | 'due' | 'closed' | 'collected';
type Pagination = { page: number; pageSize: number; totalRecords: number; totalPages: number };
type CollectionCase = {
  id: number; customer_id: string | null; customer_name: string | null; customer_email: string | null;
  customer_phone: string | null; subscription_id: string | null; subscription_status: string | null;
  plan_id: string | null; billing_period_start: string | null; billing_period_end: string | null;
  status: string; assigned_to: string | null; current_attempt: number; next_attempt_at: string | null;
  total_amount_due: number; currency_code: string; close_reason: string | null; collected_by: string | null;
  collected_at: string | null; reopened_count: number; created_at: string; updated_at: string;
  chargebeeUrl: string | null; due_now: boolean; invoices: any[]; attempts: any[]; events: any[];
  admin_disposition?: string | null; admin_actor?: string | null; admin_note?: string | null; admin_action_at?: string | null;
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
  const [attempt, setAttempt] = useState('all');
  const [minAmount, setMinAmount] = useState('');
  const [maxAmount, setMaxAmount] = useState('');
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');
  const [expandedInvoice, setExpandedInvoice] = useState(false);
  const [liveInvoices, setLiveInvoices] = useState<any[] | null>(null);
  const [outcome, setOutcome] = useState<'completed'|'left_voicemail'|'no_answer'|null>(null);
  const [notes, setNotes] = useState('');
  const [collected, setCollected] = useState(false);
  const [claimedAmount, setClaimedAmount] = useState('');
  const [reasonCategory, setReasonCategory] = useState('');
  const [selectedIds, setSelectedIds] = useState<number[]>([]);
  const [adminAction, setAdminAction] = useState<AdminQueueAction | null>(null);
  const [adminTargetIds, setAdminTargetIds] = useState<number[]>([]);
  const [adminWorking, setAdminWorking] = useState(false);
  const [adminNotice, setAdminNotice] = useState('');

  const load = useCallback(async () => {
    setLoading(true); setError('');
    try {
      const params = new URLSearchParams({ view, page: String(page) });
      if (search.trim()) params.set('search', search.trim());
      if (status !== 'all') params.set('status', status);
      if (owner !== 'all') params.set('owner', owner);
      if (attempt !== 'all') params.set('attempt', attempt);
      if (minAmount) params.set('minAmount', minAmount);
      if (maxAmount) params.set('maxAmount', maxAmount);
      if (fromDate) params.set('from', fromDate);
      if (toDate) params.set('to', toDate);
      const res = await fetch(`/api/ops/collections/queue?${params}`, { cache: 'no-store' });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Could not load collections.');
      setAgentEmail(data.agentEmail); setViewerRole(data.viewerRole || ''); setUsers(data.users || []);
      setCounts(data.counts || {}); setOwners(data.owners || []);
      const nextRecords = data.records || [];
      const nextPagination = data.pagination || { page: 1, pageSize: 50, totalRecords: 0, totalPages: 1 };
      setRecords(nextRecords);
      setPagination(nextPagination);
      if (nextPagination.page !== page) setPage(nextPagination.page);
      if (selected) setSelected(nextRecords.find((item: CollectionCase) => item.id === selected.id) || null);
    } catch (e: any) { setError(e.message); }
    finally { setLoading(false); }
  }, [view, page, search, status, owner, attempt, minAmount, maxAmount, fromDate, toDate, selected?.id]);

  useEffect(() => {
    void load();
    const timer = window.setInterval(() => void load(), 60_000);
    return () => window.clearInterval(timer);
  }, [load]);

  const isAdmin = viewerRole === 'admin';
  const tabs = [
    ['unassigned','Unassigned',Inbox,counts.unassigned || 0],
    ['mine','My Cases',UserCheck,counts.mine || 0],
    ...(isAdmin ? [['all','All Active',UserCheck,counts.active || 0] as const] : []),
    ['due','Due Follow-ups',CalendarClock,counts.due || 0],
    ['closed','Closed',FileText,''],
    ['collected','Successful Collections',CircleDollarSign,counts.collected || 0],
  ] as const;
  const selectableRecords = ['unassigned','mine','all','due'].includes(view) ? records.filter(item => ACTIVE_STATUSES.includes(item.status)) : [];
  const allVisibleSelected = selectableRecords.length > 0 && selectableRecords.every(item => selectedIds.includes(item.id));

  useEffect(() => {
    setSelectedIds([]);
  }, [view, page, search, status, owner, attempt, minAmount, maxAmount, fromDate, toDate]);

  async function mutate(action: string, body: any = {}, target: CollectionCase | null = selected) {
    if (!target) return;
    setWorking(true); setError('');
    try {
      const res = await fetch(`/api/ops/collections/${target.id}`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action, ...body }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Update failed.');
      setOutcome(null); setNotes(''); setCollected(false); setClaimedAmount(''); setReasonCategory('');
      if (action === 'claim') {
        setSelected(null);
        setPage(1);
        setView('mine');
      } else {
        await load();
      }
    } catch (e: any) { setError(e.message); }
    finally { setWorking(false); }
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
          <button title="Refresh" onClick={() => void load()} className="ops-icon-button"><RefreshCw size={17}/></button>
          <button title="Toggle theme" onClick={toggle} className="ops-icon-button">{theme === 'dark' ? <Sun size={17}/> : <Moon size={17}/>}</button>
          <button title="Sign out" onClick={async () => { await fetch('/api/ops/logout',{method:'POST'}); router.push('/ops/login'); }} className="ops-icon-button"><LogOut size={17}/></button>
        </div>
      </header>

      <main className="collections-main">
        <div className="collections-tabs">
          {tabs.map(([id,label,Icon,count]) => <button key={id} onClick={() => { setView(id); setPage(1); setSelected(null); }} className="ops-tab" data-active={view===id}><Icon size={15}/>{label}{count !== '' && <span>{count}</span>}</button>)}
        </div>

        <section className="collections-filters">
          <label className="collections-search"><Search size={16}/><input value={search} onChange={e=>{setSearch(e.target.value);setPage(1);}} placeholder="Search customer, case, invoice, or subscription"/></label>
          <select value={status} onChange={e=>{setStatus(e.target.value);setPage(1);}}>{STATUS_OPTIONS.map(v=><option key={v} value={v}>{v==='all'?'All statuses':humanize(v)}</option>)}</select>
          <select value={owner} onChange={e=>{setOwner(e.target.value);setPage(1);}}><option value="all">All owners</option>{owners.map(v=><option key={v} value={v}>{v}</option>)}</select>
          <select value={attempt} onChange={e=>{setAttempt(e.target.value);setPage(1);}}><option value="all">Any attempt</option><option value="0">Not attempted</option><option value="1">Attempt 1</option><option value="2">Attempt 2</option><option value="3">Attempt 3</option></select>
          <input type="number" min="0" value={minAmount} onChange={e=>{setMinAmount(e.target.value);setPage(1);}} placeholder="Min $"/>
          <input type="number" min="0" value={maxAmount} onChange={e=>{setMaxAmount(e.target.value);setPage(1);}} placeholder="Max $"/>
          <input aria-label="Created from" type="date" value={fromDate} onChange={e=>{setFromDate(e.target.value);setPage(1);}}/>
          <input aria-label="Created through" type="date" value={toDate} onChange={e=>{setToDate(e.target.value);setPage(1);}}/>
          <button onClick={()=>{setSearch('');setStatus('all');setOwner('all');setAttempt('all');setMinAmount('');setMaxAmount('');setFromDate('');setToDate('');setPage(1);}} className="ops-secondary-button">Reset</button>
        </section>

        {error && <div className="collections-error">{error}</div>}
        {adminNotice && <div className="admin-queue-notice">{adminNotice}</div>}
        {isAdmin && <AdminQueueToolbar count={selectedIds.length} onClear={() => setSelectedIds([])} onAction={action => openAdminAction(action, selectedIds)} />}
        <div className={`collections-workspace ${selected ? 'is-open' : ''}`}>
          <section className="collections-list">
            {isAdmin && selectableRecords.length > 0 && <label className="admin-select-all"><input type="checkbox" checked={allVisibleSelected} onChange={()=>setSelectedIds(allVisibleSelected ? [] : selectableRecords.map(item=>item.id))}/>Select all {selectableRecords.length} visible collection cases</label>}
            {loading && records.length===0 ? <div className="collections-empty"><Loader2 className="animate-spin"/></div> :
             records.length===0 ? <div className="collections-empty">No collection cases in this view.</div> :
             records.map(item => <article key={item.id} className={`collection-row ${item.due_now?'is-due':''} ${selected?.id===item.id?'is-selected':''} ${isAdmin&&selectableRecords.some(record=>record.id===item.id)?'has-admin-select':''}`} onClick={()=>{setSelected(item);setLiveInvoices(null);setExpandedInvoice(false);}}>
               {isAdmin&&selectableRecords.some(record=>record.id===item.id)&&<input className="admin-row-checkbox" type="checkbox" checked={selectedIds.includes(item.id)} onClick={e=>e.stopPropagation()} onChange={()=>toggleSelected(item.id)} aria-label={`Select collection case ${item.id}`}/>}
               <div className="collection-row-main">
                 <div className="collection-row-heading"><strong>{item.customer_name || item.customer_email || item.customer_id || 'Unknown customer'}</strong><span>{humanize(item.status)}</span>{item.reopened_count>0&&<em>Reopened {item.reopened_count}x</em>}</div>
                 <div className="collection-row-meta"><span>{item.subscription_id || 'Invoice-only case'}</span><span>Attempt {Number(item.current_attempt)+1} of 3</span><span><Clock3 size={12}/>{when(item.next_attempt_at)}</span></div>
               </div>
               <div className="collection-row-amount"><strong>{money(item.total_amount_due,item.currency_code)}</strong><small>#{item.id}</small>{view==='unassigned'&&<button onClick={e=>{e.stopPropagation();setSelected(item);void mutate('claim',{},item);}} className="ops-primary-button">Claim</button>}</div>
             </article>)}
            <nav className="collections-pagination" aria-label="Collections pagination">
              <div>
                <strong>Page {pagination.page} of {pagination.totalPages}</strong>
                <span>{pagination.totalRecords === 0 ? 'Showing 0 records' : `Showing ${(pagination.page - 1) * pagination.pageSize + 1}-${Math.min(pagination.page * pagination.pageSize, pagination.totalRecords)} of ${pagination.totalRecords}`}</span>
              </div>
              <div>
                <button type="button" className="ops-secondary-button" disabled={pagination.page <= 1 || loading} onClick={()=>{setSelected(null);setPage(current=>Math.max(1,current-1));}}><ChevronLeft size={15}/>Previous</button>
                <button type="button" className="ops-secondary-button" disabled={pagination.page >= pagination.totalPages || loading} onClick={()=>{setSelected(null);setPage(current=>Math.min(pagination.totalPages,current+1));}}>Next<ChevronRight size={15}/></button>
              </div>
            </nav>
          </section>

          {selected && <aside className="collections-detail">
            <div className="collections-detail-head"><div><small>Collections Case #{selected.id}</small><h2>{selected.customer_name || selected.customer_email || 'Customer'}</h2></div><button onClick={()=>setSelected(null)} className="ops-icon-button"><X size={17}/></button></div>
            <div className="collections-detail-body">
              <div className="collections-balance"><span>Total outstanding</span><strong>{money(selected.total_amount_due,selected.currency_code)}</strong><em>{humanize(selected.status)}</em></div>
              <div className="collections-grid">
                <div><small>Phone</small><strong>{selected.customer_phone || 'Not available'}</strong></div>
                <div><small>Owner</small><strong>{selected.assigned_to || 'Unassigned'}</strong></div>
                <div><small>Subscription</small><strong>{selected.subscription_id || 'Invoice only'}</strong></div>
                <div><small>Status</small><strong>{selected.subscription_status || 'Unknown'}</strong></div>
                <div><small>Plan</small><strong>{selected.plan_id || 'Unknown'}</strong></div>
                <div><small>Next attempt</small><strong>{when(selected.next_attempt_at)}</strong></div>
              </div>
              <div className="collections-actions">
                {selected.chargebeeUrl&&<a href={selected.chargebeeUrl} target="_blank" rel="noreferrer" className="ops-secondary-button">Chargebee Profile <ExternalLink size={14}/></a>}
                <button onClick={()=>void loadInvoices()} disabled={working} className="ops-secondary-button">Load Invoices <RefreshCw size={14}/></button>
              </div>
              <section><button className="collections-section-toggle" onClick={()=>setExpandedInvoice(!expandedInvoice)}><span>Invoices ({(liveInvoices||selected.invoices||[]).length})</span>{expandedInvoice?<ChevronUp size={16}/>:<ChevronDown size={16}/>}</button>
                {expandedInvoice&&<div className="collections-invoices">{(liveInvoices||selected.invoices||[]).map((invoice:any)=><div key={invoice.id||invoice.invoice_id}><strong>{invoice.id||invoice.invoice_id}</strong><span>{invoice.status||invoice.invoice_status||'Unknown'}</span><span>{money(invoice.amount_due??0,invoice.currency_code||selected.currency_code)}</span></div>)}</div>}
              </section>
              <section><h3>Attempt history</h3>{selected.attempts?.length?<div className="collections-timeline">{selected.attempts.map((a:any)=><div key={a.id}><strong>Attempt {a.attempt_number}: {humanize(a.outcome)}</strong><span>{a.agent_email} · {when(a.created_at)}</span><p>{a.notes}</p></div>)}</div>:<p className="collections-muted">No attempts recorded.</p>}</section>
              {selected.status==='unassigned'&&<button onClick={()=>void mutate('claim')} disabled={working} className="ops-primary-button collections-full">Claim Collection Case</button>}
              {selected.assigned_to===agentEmail&&['assigned','follow_up_pending','awaiting_payment_confirmation'].includes(selected.status)&&<div className="collections-outcomes">
                <button onClick={()=>setOutcome('completed')}><CheckCircle2 size={15}/>Completed</button>
                <button onClick={()=>setOutcome('left_voicemail')}><Voicemail size={15}/>Voicemail</button>
                <button onClick={()=>setOutcome('no_answer')}><PhoneCall size={15}/>No Answer</button>
              </div>}
              {isAdmin&&ACTIVE_STATUSES.includes(selected.status)&&<section className="admin-record-controls"><div><strong>Administrator controls</strong><span>Administrative completion never marks an invoice paid.</span></div><AdminQueueActionButtons onAction={action=>openAdminAction(action,[selected.id])}/></section>}
              {selected.close_reason&&<div className="collections-note"><strong>Closed:</strong> {selected.close_reason}</div>}
              {selected.admin_note&&<div className="admin-record-note"><strong>Administrative note:</strong> {selected.admin_note}<span>{selected.admin_actor} · {selected.admin_action_at?when(selected.admin_action_at):''}</span></div>}
            </div>
          </aside>}
        </div>
      </main>

      {outcome&&selected&&<div className="collections-modal-backdrop"><div className="collections-modal">
        <div className="collections-modal-head"><div><small>Attempt {Number(selected.current_attempt)+1} of 3</small><h2>{humanize(outcome)}</h2></div><button onClick={()=>setOutcome(null)} className="ops-icon-button"><X size={17}/></button></div>
        {outcome!=='completed'&&<div className="collections-info">A FreeScout email with the amount due, invoice reference, and Chargebee payment link will be sent. The attempt is not saved if email delivery fails.</div>}
        {outcome==='completed'&&<label className="collections-check"><input type="checkbox" checked={collected} onChange={e=>setCollected(e.target.checked)}/> Were you able to collect payment?</label>}
        {outcome==='completed'&&collected&&<label><span>Amount collected</span><input type="number" min="0.01" step="0.01" value={claimedAmount} onChange={e=>setClaimedAmount(e.target.value)} placeholder="0.00"/></label>}
        {outcome==='completed'&&<label><span>{collected?'Why was payment late?':'Why were you unable to collect?'}</span><select value={reasonCategory} onChange={e=>setReasonCategory(e.target.value)}><option value="">Select a reason</option>{REASONS.map(([v,l])=><option key={v} value={v}>{l}</option>)}</select></label>}
        <label><span>Required notes</span><textarea value={notes} onChange={e=>setNotes(e.target.value)} placeholder="Document what happened, customer commitments, and next steps."/></label>
        <div className="collections-modal-actions"><button onClick={()=>setOutcome(null)} className="ops-secondary-button">Cancel</button><button disabled={working||!notes.trim()||(outcome==='completed'&&!reasonCategory)||(collected&&!claimedAmount)} onClick={()=>void mutate(outcome,{notes,collected,claimedAmount,reasonCategory})} className="ops-primary-button">{working?'Saving...':'Save Attempt'}</button></div>
      </div></div>}
      <AdminQueueDialog action={adminAction} count={adminTargetIds.length} users={users} working={adminWorking} onClose={()=>setAdminAction(null)} onSubmit={submitAdminAction}/>
    </div>
  );
}
