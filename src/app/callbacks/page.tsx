"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  ArrowLeft, CalendarClock, CheckCircle2, Clock3, Headphones, History,
  FileCheck2, Inbox, Loader2, LogOut, Mail, Phone, PhoneCall, RefreshCw, RotateCcw, Search,
  Sun, Moon, UserCheck, Voicemail, X,
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

type QueueTab = 'unassigned' | 'assigned' | 'history';
const DEPARTMENT_OPTIONS = [
  ['all', 'All departments'],
  ['internet', 'Internet'],
  ['shipment', 'Shipment'],
  ['billing', 'Billing'],
  ['sales', 'Sales'],
  ['general_support', 'General Support'],
  ['cancellation', 'Cancellation'],
];
const TIME_OPTIONS = [
  ['all', 'Any time'],
  ['morning', 'Morning'],
  ['afternoon', 'Afternoon'],
  ['working_hours', 'Working hours'],
];
type CallbackRecord = {
  id: number;
  customer_email: string;
  customer_id: string | null;
  customer_name: string | null;
  primary_phone: string;
  secondary_phone: string | null;
  department: string;
  category: string;
  reason: string;
  preferred_time: string;
  status: string;
  requested_by: string;
  assigned_to: string | null;
  account_snapshot: any;
  freescout_conversation_id: number | null;
  due_at: string;
  assigned_at: string | null;
  completed_at: string | null;
  outcome_notes: string | null;
  admin_disposition?: string | null;
  admin_actor?: string | null;
  admin_note?: string | null;
  admin_action_at?: string | null;
  created_at: string;
  overdue?: boolean;
  events?: any[];
  verification?: CallVerificationRecord | null;
};

function humanize(value: string) {
  return value.replace(/_/g, ' ').replace(/\b\w/g, char => char.toUpperCase());
}

function durationFrom(date: string) {
  const ms = Date.now() - new Date(date).getTime();
  const hours = Math.floor(ms / 3_600_000);
  if (hours < 1) return `${Math.max(1, Math.floor(ms / 60_000))}m`;
  if (hours < 24) return `${hours}h`;
  return `${Math.floor(hours / 24)}d ${hours % 24}h`;
}

export default function CallbacksPage() {
  const router = useRouter();
  const { theme, toggle } = useTheme();
  const [tab, setTab] = useState<QueueTab>('unassigned');
  const [scope, setScope] = useState<'mine' | 'all'>('mine');
  const [loading, setLoading] = useState(true);
  const [workingId, setWorkingId] = useState<number | null>(null);
  const [error, setError] = useState('');
  const [agentEmail, setAgentEmail] = useState('');
  const [viewerRole, setViewerRole] = useState('');
  const [users, setUsers] = useState<OpsUserOption[]>([]);
  const [unassigned, setUnassigned] = useState<CallbackRecord[]>([]);
  const [assigned, setAssigned] = useState<CallbackRecord[]>([]);
  const [history, setHistory] = useState<CallbackRecord[]>([]);
  const [counts, setCounts] = useState({ unassigned: '0', assigned: '0', overdue: '0' });
  const [selected, setSelected] = useState<CallbackRecord | null>(null);
  const [outcome, setOutcome] = useState<'completed' | 'left_voicemail' | 'no_answer' | null>(null);
  const [notes, setNotes] = useState('');
  const [departmentFilter, setDepartmentFilter] = useState('all');
  const [timeFilter, setTimeFilter] = useState('all');
  const [overdueOnly, setOverdueOnly] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [verificationFilter, setVerificationFilter] = useState('all');
  const [callVerificationEnabled, setCallVerificationEnabled] = useState(false);
  const [phoneSource, setPhoneSource] = useState('primary');
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

  const selectCallback = useCallback((record: CallbackRecord | null) => {
    selectedIdRef.current = record?.id ?? null;
    setSelected(record);
  }, []);

  const loadQueue = useCallback(async () => {
    const requestId = requestIdRef.current + 1;
    requestIdRef.current = requestId;
    requestControllerRef.current?.abort();
    const controller = new AbortController();
    requestControllerRef.current = controller;
    setLoading(true);
    setError('');
    try {
      const params = new URLSearchParams({ scope });
      if (departmentFilter !== 'all') params.set('department', departmentFilter);
      if (timeFilter !== 'all') params.set('preferredTime', timeFilter);
      if (overdueOnly) params.set('overdue', 'true');
      if (searchTerm.trim()) params.set('search', searchTerm.trim());
      if (callVerificationEnabled && verificationFilter !== 'all') params.set('verification', verificationFilter);
      const res = await fetch(`/api/ops/callbacks/queue?${params.toString()}`, { cache: 'no-store', signal: controller.signal });
      const data = await res.json();
      if (requestId !== requestIdRef.current) return;
      if (!res.ok) throw new Error(data.error || 'Could not load callback queue.');
      setAgentEmail(data.agentEmail);
      setViewerRole(data.viewerRole || '');
      setCallVerificationEnabled(Boolean(data.callVerificationEnabled));
      setUsers(data.users || []);
      setUnassigned(data.unassigned || []);
      setAssigned(data.assigned || []);
      setHistory(data.history || []);
      setCounts(data.counts || { unassigned: '0', assigned: '0', overdue: '0' });
      const selectedId = selectedIdRef.current;
      if (selectedId !== null) {
        const updated = [...(data.unassigned || []), ...(data.assigned || []), ...(data.history || [])].find((item: CallbackRecord) => item.id === selectedId) || null;
        selectedIdRef.current = updated?.id ?? null;
        setSelected(updated);
      }
    } catch (err: any) {
      if (err?.name !== 'AbortError' && requestId === requestIdRef.current) {
        setError(err.message || 'Could not load callback queue.');
      }
    } finally {
      if (requestId === requestIdRef.current) setLoading(false);
    }
  }, [scope, departmentFilter, timeFilter, overdueOnly, searchTerm, verificationFilter, callVerificationEnabled]);

  useEffect(() => {
    void loadQueue();
    const timer = window.setInterval(() => void loadQueue(), 60_000);
    return () => {
      window.clearInterval(timer);
      requestControllerRef.current?.abort();
    };
  }, [loadQueue]);

  const mutate = async (record: CallbackRecord, action: string, outcomeNotes?: string, extra: Record<string, unknown> = {}) => {
    setWorkingId(record.id);
    setError('');
    try {
      const res = await fetch(`/api/ops/callbacks/${record.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action, notes: outcomeNotes, ...extra }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Callback update failed.');
      setOutcome(null);
      setNotes('');
      setCalledPhone('');
      if (data.verification) setAdminNotice('Outcome saved. Daily call verification is pending.');
      await loadQueue();
    } catch (err: any) {
      setError(err.message || 'Callback update failed.');
    } finally {
      setWorkingId(null);
    }
  };

  const records = useMemo(() => tab === 'unassigned' ? unassigned : tab === 'assigned' ? assigned : history, [tab, unassigned, assigned, history]);
  const isAdmin = viewerRole === 'admin';
  const selectableRecords = tab === 'history' ? [] : records;
  const allVisibleSelected = selectableRecords.length > 0 && selectableRecords.every(record => selectedIds.includes(record.id));
  const hasActiveFilters = departmentFilter !== 'all' || timeFilter !== 'all' || (callVerificationEnabled && verificationFilter !== 'all') || overdueOnly || Boolean(searchTerm.trim());
  const clearFilters = () => {
    setDepartmentFilter('all');
    setTimeFilter('all');
    setOverdueOnly(false);
    setSearchTerm('');
    setVerificationFilter('all');
  };
  const snapshot = selected?.account_snapshot || {};
  const latestSubscription = snapshot.subscriptions?.[0];
  const latestOrder = snapshot.latestOrder;
  const network = snapshot.network?.[0];

  useEffect(() => {
    setSelectedIds([]);
  }, [tab, scope, departmentFilter, timeFilter, overdueOnly, searchTerm, verificationFilter]);

  const openOutcome = (value: 'completed'|'left_voicemail'|'no_answer') => {
    setPhoneSource('primary');
    setCalledPhone('');
    setOutcome(value);
  };

  const recheckVerification = async (id: number) => {
    setVerificationWorking(id);
    try {
      const res = await fetch(`/api/ops/call-verifications/${id}`, { method: 'PATCH' });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Could not reprocess verification.');
      setAdminNotice('Call verification was queued for another check.');
      await loadQueue();
    } catch (err: any) {
      setError(err.message || 'Could not reprocess verification.');
    } finally {
      setVerificationWorking(null);
    }
  };

  const toggleSelected = (id: number) => {
    setSelectedIds(current => current.includes(id) ? current.filter(item => item !== id) : [...current, id]);
  };

  const openAdminAction = (action: AdminQueueAction, ids: number[]) => {
    setAdminTargetIds(ids);
    setAdminAction(action);
    setAdminNotice('');
  };

  const submitAdminAction = async (action: AdminQueueAction, note: string, assignee?: string) => {
    setAdminWorking(true);
    setError('');
    try {
      const res = await fetch('/api/ops/callbacks/bulk', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ids: adminTargetIds, action, note, assignee }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Administrative action failed.');
      setAdminNotice(`${data.updated} callback${data.updated === 1 ? '' : 's'} updated${data.skipped ? `; ${data.skipped} skipped because they changed or were no longer active` : ''}.`);
      setAdminAction(null);
      setAdminTargetIds([]);
      setSelectedIds([]);
      await loadQueue();
    } catch (err: any) {
      setError(err.message || 'Administrative action failed.');
    } finally {
      setAdminWorking(false);
    }
  };

  return (
    <div className="ops-app-shell" style={{ minHeight: '100vh', color: 'var(--ops-text)' }}>
      <header className="ops-topbar" style={{ minHeight: 72, padding: '14px 28px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16, position: 'sticky', top: 0, zIndex: 20 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
          <button title="Back to OPS" onClick={() => router.push('/ops/dashboard')} className="ops-icon-button" style={{ width: 40, height: 40, display: 'grid', placeItems: 'center', cursor: 'pointer' }}><ArrowLeft size={18} /></button>
          <div className="brand-mark"><Headphones size={19} /></div>
          <div>
            <div style={{ fontSize: 12, color: 'var(--primary)', fontWeight: 800, textTransform: 'uppercase' }}>NomadOps</div>
            <h1 style={{ margin: 0, fontSize: 21 }}>Callback Operations</h1>
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <span className="callback-agent-label" style={{ color: 'var(--ops-text-muted)', fontSize: 13 }}>{agentEmail}</span>
          <button title="Call verification" onClick={() => router.push('/call-verification')} className="ops-secondary-button collections-report-link"><FileCheck2 size={15}/><span>Verify Calls</span></button>
          <button title="Toggle theme" onClick={toggle} className="ops-icon-button" style={{ width: 40, height: 40, cursor: 'pointer', display: 'grid', placeItems: 'center' }}>{theme === 'dark' ? <Sun size={17} /> : <Moon size={17} />}</button>
          <button title="Sign out" onClick={async () => { await fetch('/api/ops/logout', { method: 'POST' }); router.push('/ops/login'); }} className="ops-icon-button" style={{ width: 40, height: 40, display: 'grid', placeItems: 'center', cursor: 'pointer' }}><LogOut size={17} /></button>
        </div>
      </header>

      <main style={{ width: '100%', maxWidth: 1600, margin: '0 auto', padding: 28, boxSizing: 'border-box' }}>
        <div className="callback-stats-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: 12, marginBottom: 22 }}>
          {[
            { label: 'Unassigned', value: counts.unassigned, icon: Inbox, color: '#2dd4bf' },
            { label: 'Assigned', value: counts.assigned, icon: UserCheck, color: '#60a5fa' },
            { label: 'Overdue', value: counts.overdue, icon: CalendarClock, color: '#ef4444' },
          ].map(item => (
            <div key={item.label} style={{ padding: 18, border: '1px solid var(--ops-card-border)', background: 'var(--ops-card-bg)', borderRadius: 8, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div><div style={{ color: 'var(--ops-text-muted)', fontSize: 12, fontWeight: 800, textTransform: 'uppercase' }}>{item.label}</div><div style={{ fontSize: 30, fontWeight: 900, marginTop: 5 }}>{item.value}</div></div>
              <item.icon size={24} color={item.color} />
            </div>
          ))}
        </div>

        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, flexWrap: 'wrap', marginBottom: 16 }}>
          <div style={{ display: 'flex', gap: 7 }}>
            {[
              { id: 'unassigned' as const, label: 'Unassigned', icon: Inbox },
              { id: 'assigned' as const, label: 'Assigned', icon: UserCheck },
              { id: 'history' as const, label: 'History', icon: History },
            ].map(item => (
              <button key={item.id} onClick={() => { setTab(item.id); selectCallback(null); }} className="ops-tab" data-active={tab === item.id} style={{ padding: '10px 14px', display: 'flex', alignItems: 'center', gap: 7, cursor: 'pointer', fontWeight: 800 }}>
                <item.icon size={15} /> {item.label}
              </button>
            ))}
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            {tab === 'assigned' && (
              <div style={{ display: 'flex', border: '1px solid var(--border)', borderRadius: 8, overflow: 'hidden' }}>
                <button onClick={() => setScope('mine')} style={{ border: 0, padding: '9px 12px', background: scope === 'mine' ? 'var(--primary-light)' : 'var(--surface-200)', color: 'var(--ops-text)', cursor: 'pointer', fontWeight: 700 }}>My Assigned</button>
                <button onClick={() => setScope('all')} style={{ border: 0, padding: '9px 12px', background: scope === 'all' ? 'var(--primary-light)' : 'var(--surface-200)', color: 'var(--ops-text)', cursor: 'pointer', fontWeight: 700 }}>All Assigned</button>
              </div>
            )}
            <button onClick={() => void loadQueue()} disabled={loading} className="ops-secondary-button" style={{ padding: '9px 12px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 7 }}><RefreshCw size={15} /> Refresh</button>
          </div>
        </div>

        <div style={{ marginBottom: 16, padding: 14, border: '1px solid var(--ops-card-border)', background: 'var(--ops-card-bg)', borderRadius: 8, display: 'grid', gap: 12 }}>
          <div style={{ display: 'grid', gridTemplateColumns: 'minmax(220px, 1fr) repeat(4, minmax(150px, auto)) auto', gap: 10, alignItems: 'center' }} className="callback-filter-grid">
            <label style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
              <Search size={16} style={{ position: 'absolute', left: 12, color: 'var(--ops-text-muted)' }} />
              <input
                value={searchTerm}
                onChange={event => setSearchTerm(event.target.value)}
                placeholder="Search customer, phone, reason, agent, or ID..."
                style={{ width: '100%', padding: '11px 12px 11px 36px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--surface-200)', color: 'var(--ops-text)' }}
              />
            </label>
            <select value={departmentFilter} onChange={event => setDepartmentFilter(event.target.value)} style={{ padding: 11, borderRadius: 8, border: '1px solid var(--border)', background: 'var(--surface-200)', color: 'var(--ops-text)' }}>
              {DEPARTMENT_OPTIONS.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
            </select>
            <select value={timeFilter} onChange={event => setTimeFilter(event.target.value)} style={{ padding: 11, borderRadius: 8, border: '1px solid var(--border)', background: 'var(--surface-200)', color: 'var(--ops-text)' }}>
              {TIME_OPTIONS.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
            </select>
            {callVerificationEnabled&&<select value={verificationFilter} onChange={event=>setVerificationFilter(event.target.value)} style={{ padding: 11, borderRadius: 8, border: '1px solid var(--border)', background: 'var(--surface-200)', color: 'var(--ops-text)' }}>
              <option value="all">All verification</option>
              <option value="pending">Pending daily verification</option>
              <option value="verified">Verified</option>
              <option value="unverified">Unable to verify</option>
              <option value="outcome_mismatch">Outcome mismatch</option>
              <option value="mapping_required">Agent mapping required</option>
              {isAdmin&&<option value="needs_review">Needs review</option>}
              <option value="not_tracked">Not tracked</option>
            </select>}
            <label style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '11px 12px', borderRadius: 8, border: '1px solid var(--border)', background: overdueOnly ? 'rgba(239,68,68,0.1)' : 'var(--surface-200)', color: overdueOnly ? '#ef4444' : 'var(--ops-text)', fontWeight: 800, cursor: 'pointer', whiteSpace: 'nowrap' }}>
              <input type="checkbox" checked={overdueOnly} onChange={event => setOverdueOnly(event.target.checked)} style={{ accentColor: '#ef4444' }} />
              Overdue only
            </label>
            <button onClick={clearFilters} disabled={!hasActiveFilters} style={{ padding: '11px 13px', borderRadius: 8, border: '1px solid var(--border)', background: hasActiveFilters ? 'var(--surface-200)' : 'transparent', color: hasActiveFilters ? 'var(--ops-text)' : 'var(--ops-text-muted)', cursor: hasActiveFilters ? 'pointer' : 'not-allowed', fontWeight: 800 }}>
              Reset
            </button>
          </div>
          {hasActiveFilters && (
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              {searchTerm.trim() && <span style={{ padding: '4px 9px', borderRadius: 999, background: 'var(--primary-light)', color: 'var(--primary)', fontSize: 12, fontWeight: 800 }}>Search: {searchTerm.trim()}</span>}
              {departmentFilter !== 'all' && <span style={{ padding: '4px 9px', borderRadius: 999, background: 'var(--primary-light)', color: 'var(--primary)', fontSize: 12, fontWeight: 800 }}>{humanize(departmentFilter)}</span>}
              {timeFilter !== 'all' && <span style={{ padding: '4px 9px', borderRadius: 999, background: 'var(--primary-light)', color: 'var(--primary)', fontSize: 12, fontWeight: 800 }}>{humanize(timeFilter)}</span>}
              {callVerificationEnabled && verificationFilter !== 'all' && <span style={{ padding: '4px 9px', borderRadius: 999, background: 'var(--primary-light)', color: 'var(--primary)', fontSize: 12, fontWeight: 800 }}>{humanize(verificationFilter)}</span>}
              {overdueOnly && <span style={{ padding: '4px 9px', borderRadius: 999, background: 'rgba(239,68,68,0.12)', color: '#ef4444', fontSize: 12, fontWeight: 800 }}>Overdue</span>}
            </div>
          )}
        </div>

        {error && <div style={{ marginBottom: 14, padding: 12, color: '#ef4444', background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.25)', borderRadius: 8 }}>{error}</div>}
        {adminNotice && <div className="admin-queue-notice">{adminNotice}</div>}
        {isAdmin && <AdminQueueToolbar count={selectedIds.length} onClear={() => setSelectedIds([])} onAction={action => openAdminAction(action, selectedIds)} />}

        <div className={selected ? 'callback-workspace-grid callback-workspace-grid-open' : 'callback-workspace-grid'} style={{ display: 'grid', gridTemplateColumns: selected ? 'minmax(0, 1fr) minmax(360px, 0.7fr)' : '1fr', gap: 18, alignItems: 'start' }}>
          <section style={{ display: 'grid', gap: 10 }}>
            {isAdmin && selectableRecords.length > 0 && (
              <label className="admin-select-all">
                <input
                  type="checkbox"
                  checked={allVisibleSelected}
                  onChange={() => setSelectedIds(allVisibleSelected ? [] : selectableRecords.map(record => record.id))}
                />
                Select all {selectableRecords.length} visible callbacks
              </label>
            )}
            {loading && records.length === 0 ? (
              <div style={{ minHeight: 300, display: 'grid', placeItems: 'center', color: 'var(--ops-text-muted)' }}><Loader2 className="animate-spin" /></div>
            ) : records.length === 0 ? (
              <div style={{ padding: 50, textAlign: 'center', color: 'var(--ops-text-muted)', background: 'var(--ops-card-bg)', border: '1px dashed var(--border)', borderRadius: 8 }}>No callbacks in this queue.</div>
            ) : records.map(record => (
              <article className={isAdmin && tab !== 'history' ? 'callback-row-admin' : ''} key={record.id} onClick={() => selectCallback(record)} style={{ padding: 18, border: `1px solid ${record.overdue ? 'rgba(239,68,68,0.5)' : selected?.id === record.id ? 'var(--primary)' : 'var(--ops-card-border)'}`, borderLeft: record.overdue ? '4px solid #ef4444' : '1px solid var(--ops-card-border)', background: 'var(--ops-card-bg)', borderRadius: 8, cursor: 'pointer', display: 'grid', gridTemplateColumns: isAdmin && tab !== 'history' ? 'auto minmax(0, 1fr) auto' : 'minmax(0, 1fr) auto', gap: 18 }}>
                {isAdmin && tab !== 'history' && (
                  <input
                    className="admin-row-checkbox"
                    type="checkbox"
                    checked={selectedIds.includes(record.id)}
                    onClick={event => event.stopPropagation()}
                    onChange={() => toggleSelected(record.id)}
                    aria-label={`Select callback ${record.id}`}
                  />
                )}
                <div style={{ minWidth: 0 }}>
                  <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
                    <strong>{record.customer_name || record.customer_email}</strong>
                    <span style={{ padding: '3px 7px', borderRadius: 5, background: 'var(--surface-200)', color: 'var(--ops-text-muted)', fontSize: 11, fontWeight: 800 }}>{humanize(record.department)}</span>
                    {record.overdue && <span style={{ color: '#ef4444', fontSize: 11, fontWeight: 900 }}>OVERDUE {durationFrom(record.due_at)}</span>}
                  </div>
                  <div style={{ color: 'var(--ops-text-muted)', fontSize: 13, marginTop: 6, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{record.reason}</div>
                  <div style={{ display: 'flex', gap: 15, flexWrap: 'wrap', marginTop: 9, color: 'var(--ops-text-muted)', fontSize: 12 }}>
                    <span><Phone size={12} style={{ verticalAlign: -2 }} /> {record.primary_phone}</span>
                    <span><Clock3 size={12} style={{ verticalAlign: -2 }} /> {humanize(record.preferred_time)}</span>
                    <span>Requested {durationFrom(record.created_at)} ago</span>
                    {callVerificationEnabled&&(tab==='history'||record.verification)&&<VerificationBadge verification={record.verification}/>}
                  </div>
                </div>
                <div style={{ textAlign: 'right', fontSize: 12, color: 'var(--ops-text-muted)' }}>
                  <div>#{record.id}</div>
                  <div style={{ marginTop: 6 }}>{record.assigned_to || record.requested_by}</div>
                  {tab === 'unassigned' && <button onClick={event => { event.stopPropagation(); selectCallback(record); void mutate(record, 'claim'); }} disabled={workingId === record.id} className="ops-primary-button" style={{ marginTop: 10, padding: '8px 12px', cursor: 'pointer', fontWeight: 800 }}>{workingId === record.id ? 'Claiming...' : 'Claim'}</button>}
                </div>
              </article>
            ))}
          </section>

          {selected && (
            <aside style={{ position: 'sticky', top: 90, maxHeight: 'calc(100vh - 112px)', overflowY: 'auto', background: 'var(--ops-card-bg)', border: '1px solid var(--ops-card-border)', borderRadius: 8 }}>
              <div style={{ padding: 18, borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', gap: 12 }}>
                <div><div style={{ color: 'var(--primary)', fontSize: 11, fontWeight: 900, textTransform: 'uppercase' }}>Callback #{selected.id}</div><h2 style={{ margin: '4px 0 0', fontSize: 19 }}>{selected.customer_name || selected.customer_email}</h2></div>
                <button title="Close details" onClick={() => selectCallback(null)} className="ops-icon-button" style={{ width: 36, height: 36, cursor: 'pointer' }}><X size={17} /></button>
              </div>
              <div style={{ padding: 18, display: 'grid', gap: 18 }}>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                  {[
                    ['Primary', selected.primary_phone], ['Secondary', selected.secondary_phone || 'Not provided'],
                    ['Department', humanize(selected.department)], ['Category', humanize(selected.category)],
                    ['Preferred', humanize(selected.preferred_time)], ['Due', new Date(selected.due_at).toLocaleString()],
                  ].map(([label, value]) => <div key={label} style={{ padding: 11, background: 'var(--surface-200)', borderRadius: 7 }}><div style={{ color: 'var(--ops-text-muted)', fontSize: 10, fontWeight: 900, textTransform: 'uppercase' }}>{label}</div><div style={{ marginTop: 4, fontSize: 13, fontWeight: 700, overflowWrap: 'anywhere' }}>{value}</div></div>)}
                </div>

                <div><div style={{ color: 'var(--ops-text-muted)', fontSize: 11, fontWeight: 900, textTransform: 'uppercase', marginBottom: 6 }}>Request context</div><div style={{ lineHeight: 1.55, fontSize: 14 }}>{selected.reason}</div></div>

                <div>
                  <div style={{ color: 'var(--ops-text-muted)', fontSize: 11, fontWeight: 900, textTransform: 'uppercase', marginBottom: 8 }}>Account snapshot</div>
                  <div style={{ display: 'grid', gap: 7, fontSize: 13 }}>
                    <div><strong>Subscription:</strong> {latestSubscription?.id || 'N/A'} · {latestSubscription?.status || 'No status'}</div>
                    <div><strong>Plan:</strong> {latestSubscription?.plan_id || latestSubscription?.subscription_items?.[0]?.item_price_id || 'N/A'}</div>
                    <div><strong>Shipment:</strong> {latestOrder?.orderNumber || 'N/A'} · {latestOrder?.tracking?.[0]?.status || latestOrder?.fulfillmentStatus || 'No status'}</div>
                    <div><strong>ThingSpace:</strong> {network?.state || network?.status || 'N/A'}</div>
                    <div><strong>FreeScout:</strong> {selected.freescout_conversation_id ? `Conversation #${selected.freescout_conversation_id}` : 'New conversation will be created if email is needed'}</div>
                  </div>
                </div>

                {(selected.events || []).length > 0 && <div><div style={{ color: 'var(--ops-text-muted)', fontSize: 11, fontWeight: 900, textTransform: 'uppercase', marginBottom: 8 }}>Activity</div>{selected.events!.map(event => <div key={event.id} style={{ padding: '8px 0', borderBottom: '1px solid var(--border)', fontSize: 12 }}><strong>{humanize(event.event_type)}</strong> by {event.actor_email}<div style={{ color: 'var(--ops-text-muted)', marginTop: 3 }}>{new Date(event.created_at).toLocaleString()}</div></div>)}</div>}
                {callVerificationEnabled&&['completed','left_voicemail','no_answer'].includes(selected.status)&&<CallVerificationDetails verification={selected.verification} isAdmin={isAdmin} working={verificationWorking===selected.verification?.id} onRecheck={recheckVerification}/>}

                {selected.status === 'unassigned' && <button onClick={() => void mutate(selected, 'claim')} disabled={workingId === selected.id} className="ops-primary-button" style={{ padding: 12, cursor: 'pointer', fontWeight: 900 }}>Claim Callback</button>}
                {selected.status === 'assigned' && selected.assigned_to === agentEmail && (
                  <div style={{ display: 'grid', gap: 8 }}>
                    <div className="callback-outcome-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 7 }}>
                      <button onClick={() => openOutcome('completed')} style={{ padding: 10, borderRadius: 7, border: '1px solid rgba(16,185,129,0.3)', background: 'rgba(16,185,129,0.1)', color: '#10b981', cursor: 'pointer', fontWeight: 800 }}><CheckCircle2 size={15} /> Completed</button>
                      <button onClick={() => openOutcome('left_voicemail')} style={{ padding: 10, borderRadius: 7, border: '1px solid rgba(59,130,246,0.3)', background: 'rgba(59,130,246,0.1)', color: '#60a5fa', cursor: 'pointer', fontWeight: 800 }}><Voicemail size={15} /> Voicemail</button>
                      <button onClick={() => openOutcome('no_answer')} style={{ padding: 10, borderRadius: 7, border: '1px solid rgba(245,158,11,0.3)', background: 'rgba(245,158,11,0.1)', color: '#f59e0b', cursor: 'pointer', fontWeight: 800 }}><PhoneCall size={15} /> No Answer</button>
                    </div>
                    <button onClick={() => void mutate(selected, 'release')} style={{ padding: 10, borderRadius: 7, border: '1px solid var(--border)', background: 'transparent', color: 'var(--ops-text-muted)', cursor: 'pointer', fontWeight: 800 }}><RotateCcw size={15} /> Return to Unassigned</button>
                  </div>
                )}
                {isAdmin && ['unassigned', 'assigned'].includes(selected.status) && (
                  <section className="admin-record-controls">
                    <div><strong>Administrator controls</strong><span>Every action requires a permanent audit note.</span></div>
                    <AdminQueueActionButtons onAction={action => openAdminAction(action, [selected.id])} />
                  </section>
                )}
                {selected.outcome_notes && <div style={{ padding: 12, background: 'var(--surface-200)', borderRadius: 7 }}><strong>Outcome:</strong> {selected.outcome_notes}</div>}
                {selected.admin_note && <div className="admin-record-note"><strong>Administrative note:</strong> {selected.admin_note}<span>{selected.admin_actor} · {selected.admin_action_at ? new Date(selected.admin_action_at).toLocaleString() : ''}</span></div>}
              </div>
            </aside>
          )}
        </div>
      </main>

      {outcome && selected && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 50, display: 'grid', placeItems: 'center', padding: 20, background: 'rgba(0,0,0,0.72)', backdropFilter: 'blur(8px)' }}>
          <div style={{ width: '100%', maxWidth: 560, background: 'var(--surface-100)', border: '1px solid var(--border)', borderRadius: 10, padding: 22 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12 }}><div><div style={{ color: 'var(--primary)', fontSize: 11, fontWeight: 900, textTransform: 'uppercase' }}>Record Outcome</div><h2 style={{ margin: '5px 0 0' }}>{humanize(outcome)}</h2></div><button onClick={() => setOutcome(null)} className="ops-icon-button" style={{ width: 36, height: 36 }}><X size={17} /></button></div>
            {outcome !== 'completed' && <div style={{ margin: '16px 0', padding: 12, background: 'rgba(37,99,235,0.08)', border: '1px solid rgba(37,99,235,0.22)', borderRadius: 7, display: 'flex', gap: 9, fontSize: 13, lineHeight: 1.45 }}><Mail size={17} style={{ flexShrink: 0 }} /> Saving this outcome automatically sends a FreeScout email to {selected.customer_email}. If delivery fails, the callback remains assigned.</div>}
            {callVerificationEnabled&&<label style={{ display:'grid',gap:8,marginTop:16 }}><span style={{fontSize:12,color:'var(--ops-text-muted)',fontWeight:900,textTransform:'uppercase'}}>Which number did you call?</span>
              <select value={phoneSource} onChange={event=>setPhoneSource(event.target.value)} style={{padding:11,borderRadius:8}}>
                <option value="primary">Primary: {selected.primary_phone}</option>
                {selected.secondary_phone&&<option value="secondary">Secondary: {selected.secondary_phone}</option>}
                <option value="different">Different number</option>
              </select>
            </label>}
            {callVerificationEnabled&&phoneSource==='different'&&<label style={{display:'grid',gap:8,marginTop:12}}><span style={{fontSize:12,color:'var(--ops-text-muted)',fontWeight:900,textTransform:'uppercase'}}>Called number</span><input value={calledPhone} onChange={event=>setCalledPhone(event.target.value)} placeholder="Enter the number dialed" style={{padding:11,borderRadius:8}}/></label>}
            <label style={{ display: 'grid', gap: 8, marginTop: 16 }}><span style={{ fontSize: 12, color: 'var(--ops-text-muted)', fontWeight: 900, textTransform: 'uppercase' }}>Required notes</span><textarea value={notes} onChange={event => setNotes(event.target.value)} placeholder={outcome === 'completed' ? 'Describe the conversation, resolution, commitments, and follow-up.' : 'Record when the call was attempted and what occurred.'} style={{ minHeight: 140, resize: 'vertical', padding: 13, borderRadius: 8 }} /></label>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 9, marginTop: 18 }}><button onClick={() => setOutcome(null)} className="ops-secondary-button" style={{ padding: '10px 14px' }}>Cancel</button><button onClick={() => void mutate(selected, outcome, notes,callVerificationEnabled?{phoneSource,calledPhone}:{})} disabled={!notes.trim() || (callVerificationEnabled&&phoneSource==='different'&&calledPhone.replace(/\D/g,'').length<7) || workingId === selected.id} className="ops-primary-button" style={{ padding: '10px 15px', cursor: 'pointer', fontWeight: 900 }}>{workingId === selected.id ? 'Saving...' : outcome === 'completed' ? 'Complete Callback' : 'Save and Send Email'}</button></div>
          </div>
        </div>
      )}
      <AdminQueueDialog
        action={adminAction}
        count={adminTargetIds.length}
        users={users}
        working={adminWorking}
        onClose={() => setAdminAction(null)}
        onSubmit={submitAdminAction}
      />
    </div>
  );
}
