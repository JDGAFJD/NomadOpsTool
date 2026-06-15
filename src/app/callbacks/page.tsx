"use client";

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  ArrowLeft, CalendarClock, CheckCircle2, Clock3, Headphones, History,
  Inbox, Loader2, LogOut, Mail, Phone, PhoneCall, RefreshCw, RotateCcw,
  Sun, Moon, UserCheck, Voicemail, X,
} from 'lucide-react';
import { useTheme } from '@/components/ThemeProvider';

type QueueTab = 'unassigned' | 'assigned' | 'history';
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
  created_at: string;
  overdue?: boolean;
  events?: any[];
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
  const [unassigned, setUnassigned] = useState<CallbackRecord[]>([]);
  const [assigned, setAssigned] = useState<CallbackRecord[]>([]);
  const [history, setHistory] = useState<CallbackRecord[]>([]);
  const [counts, setCounts] = useState({ unassigned: '0', assigned: '0', overdue: '0' });
  const [selected, setSelected] = useState<CallbackRecord | null>(null);
  const [outcome, setOutcome] = useState<'completed' | 'left_voicemail' | 'no_answer' | null>(null);
  const [notes, setNotes] = useState('');

  const loadQueue = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const res = await fetch(`/api/ops/callbacks/queue?scope=${scope}`, { cache: 'no-store' });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Could not load callback queue.');
      setAgentEmail(data.agentEmail);
      setUnassigned(data.unassigned || []);
      setAssigned(data.assigned || []);
      setHistory(data.history || []);
      setCounts(data.counts || { unassigned: '0', assigned: '0', overdue: '0' });
      if (selected) {
        const updated = [...(data.unassigned || []), ...(data.assigned || []), ...(data.history || [])].find((item: CallbackRecord) => item.id === selected.id);
        setSelected(updated || null);
      }
    } catch (err: any) {
      setError(err.message || 'Could not load callback queue.');
    } finally {
      setLoading(false);
    }
  }, [scope, selected?.id]);

  useEffect(() => {
    void loadQueue();
    const timer = window.setInterval(() => void loadQueue(), 60_000);
    return () => window.clearInterval(timer);
  }, [loadQueue]);

  const mutate = async (record: CallbackRecord, action: string, outcomeNotes?: string) => {
    setWorkingId(record.id);
    setError('');
    try {
      const res = await fetch(`/api/ops/callbacks/${record.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action, notes: outcomeNotes }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Callback update failed.');
      setOutcome(null);
      setNotes('');
      await loadQueue();
    } catch (err: any) {
      setError(err.message || 'Callback update failed.');
    } finally {
      setWorkingId(null);
    }
  };

  const records = useMemo(() => tab === 'unassigned' ? unassigned : tab === 'assigned' ? assigned : history, [tab, unassigned, assigned, history]);
  const snapshot = selected?.account_snapshot || {};
  const latestSubscription = snapshot.subscriptions?.[0];
  const latestOrder = snapshot.latestOrder;
  const network = snapshot.network?.[0];

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
          <span style={{ color: 'var(--ops-text-muted)', fontSize: 13 }}>{agentEmail}</span>
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
              <button key={item.id} onClick={() => setTab(item.id)} className="ops-tab" data-active={tab === item.id} style={{ padding: '10px 14px', display: 'flex', alignItems: 'center', gap: 7, cursor: 'pointer', fontWeight: 800 }}>
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

        {error && <div style={{ marginBottom: 14, padding: 12, color: '#ef4444', background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.25)', borderRadius: 8 }}>{error}</div>}

        <div className={selected ? 'callback-workspace-grid callback-workspace-grid-open' : 'callback-workspace-grid'} style={{ display: 'grid', gridTemplateColumns: selected ? 'minmax(0, 1fr) minmax(360px, 0.7fr)' : '1fr', gap: 18, alignItems: 'start' }}>
          <section style={{ display: 'grid', gap: 10 }}>
            {loading && records.length === 0 ? (
              <div style={{ minHeight: 300, display: 'grid', placeItems: 'center', color: 'var(--ops-text-muted)' }}><Loader2 className="animate-spin" /></div>
            ) : records.length === 0 ? (
              <div style={{ padding: 50, textAlign: 'center', color: 'var(--ops-text-muted)', background: 'var(--ops-card-bg)', border: '1px dashed var(--border)', borderRadius: 8 }}>No callbacks in this queue.</div>
            ) : records.map(record => (
              <article key={record.id} onClick={() => setSelected(record)} style={{ padding: 18, border: `1px solid ${record.overdue ? 'rgba(239,68,68,0.5)' : selected?.id === record.id ? 'var(--primary)' : 'var(--ops-card-border)'}`, borderLeft: record.overdue ? '4px solid #ef4444' : '1px solid var(--ops-card-border)', background: 'var(--ops-card-bg)', borderRadius: 8, cursor: 'pointer', display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) auto', gap: 18 }}>
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
                  </div>
                </div>
                <div style={{ textAlign: 'right', fontSize: 12, color: 'var(--ops-text-muted)' }}>
                  <div>#{record.id}</div>
                  <div style={{ marginTop: 6 }}>{record.assigned_to || record.requested_by}</div>
                  {tab === 'unassigned' && <button onClick={event => { event.stopPropagation(); void mutate(record, 'claim'); }} disabled={workingId === record.id} className="ops-primary-button" style={{ marginTop: 10, padding: '8px 12px', cursor: 'pointer', fontWeight: 800 }}>{workingId === record.id ? 'Claiming...' : 'Claim'}</button>}
                </div>
              </article>
            ))}
          </section>

          {selected && (
            <aside style={{ position: 'sticky', top: 90, maxHeight: 'calc(100vh - 112px)', overflowY: 'auto', background: 'var(--ops-card-bg)', border: '1px solid var(--ops-card-border)', borderRadius: 8 }}>
              <div style={{ padding: 18, borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', gap: 12 }}>
                <div><div style={{ color: 'var(--primary)', fontSize: 11, fontWeight: 900, textTransform: 'uppercase' }}>Callback #{selected.id}</div><h2 style={{ margin: '4px 0 0', fontSize: 19 }}>{selected.customer_name || selected.customer_email}</h2></div>
                <button title="Close details" onClick={() => setSelected(null)} className="ops-icon-button" style={{ width: 36, height: 36, cursor: 'pointer' }}><X size={17} /></button>
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

                {selected.status === 'unassigned' && <button onClick={() => void mutate(selected, 'claim')} disabled={workingId === selected.id} className="ops-primary-button" style={{ padding: 12, cursor: 'pointer', fontWeight: 900 }}>Claim Callback</button>}
                {selected.status === 'assigned' && selected.assigned_to === agentEmail && (
                  <div style={{ display: 'grid', gap: 8 }}>
                    <div className="callback-outcome-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 7 }}>
                      <button onClick={() => setOutcome('completed')} style={{ padding: 10, borderRadius: 7, border: '1px solid rgba(16,185,129,0.3)', background: 'rgba(16,185,129,0.1)', color: '#10b981', cursor: 'pointer', fontWeight: 800 }}><CheckCircle2 size={15} /> Completed</button>
                      <button onClick={() => setOutcome('left_voicemail')} style={{ padding: 10, borderRadius: 7, border: '1px solid rgba(59,130,246,0.3)', background: 'rgba(59,130,246,0.1)', color: '#60a5fa', cursor: 'pointer', fontWeight: 800 }}><Voicemail size={15} /> Voicemail</button>
                      <button onClick={() => setOutcome('no_answer')} style={{ padding: 10, borderRadius: 7, border: '1px solid rgba(245,158,11,0.3)', background: 'rgba(245,158,11,0.1)', color: '#f59e0b', cursor: 'pointer', fontWeight: 800 }}><PhoneCall size={15} /> No Answer</button>
                    </div>
                    <button onClick={() => void mutate(selected, 'release')} style={{ padding: 10, borderRadius: 7, border: '1px solid var(--border)', background: 'transparent', color: 'var(--ops-text-muted)', cursor: 'pointer', fontWeight: 800 }}><RotateCcw size={15} /> Return to Unassigned</button>
                  </div>
                )}
                {selected.outcome_notes && <div style={{ padding: 12, background: 'var(--surface-200)', borderRadius: 7 }}><strong>Outcome:</strong> {selected.outcome_notes}</div>}
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
            <label style={{ display: 'grid', gap: 8, marginTop: 16 }}><span style={{ fontSize: 12, color: 'var(--ops-text-muted)', fontWeight: 900, textTransform: 'uppercase' }}>Required notes</span><textarea value={notes} onChange={event => setNotes(event.target.value)} placeholder={outcome === 'completed' ? 'Describe the conversation, resolution, commitments, and follow-up.' : 'Record when the call was attempted and what occurred.'} style={{ minHeight: 140, resize: 'vertical', padding: 13, borderRadius: 8 }} /></label>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 9, marginTop: 18 }}><button onClick={() => setOutcome(null)} className="ops-secondary-button" style={{ padding: '10px 14px' }}>Cancel</button><button onClick={() => void mutate(selected, outcome, notes)} disabled={!notes.trim() || workingId === selected.id} className="ops-primary-button" style={{ padding: '10px 15px', cursor: 'pointer', fontWeight: 900 }}>{workingId === selected.id ? 'Saving...' : outcome === 'completed' ? 'Complete Callback' : 'Save and Send Email'}</button></div>
          </div>
        </div>
      )}
    </div>
  );
}
