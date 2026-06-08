"use client";

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { AlertTriangle, ArrowLeft, Check, Loader2, RefreshCw, Search, X } from 'lucide-react';

type ReturnRecord = {
  id: number;
  imei: string;
  device_condition: string;
  tracking_number: string;
  received_at: string;
  status: string;
  chargebee_customer_id?: string | null;
  chargebee_customer_name?: string | null;
  chargebee_customer_email?: string | null;
  chargebee_subscription_id?: string | null;
  chargebee_subscription_status?: string | null;
  error_message?: string | null;
  chargebee_match_payload?: {
    matches?: unknown[];
  } | null;
};

type CancelDraft = {
  record: ReturnRecord;
  reason: string;
  invoiceHandling: string;
  confirming: boolean;
};

const invoiceOptions = [
  { value: 'write_off_open_invoices', label: 'Write off open invoices' },
  { value: 'leave_open_invoices', label: 'Leave open invoices' },
  { value: 'review_in_chargebee', label: 'Review invoices in Chargebee' },
];

function errorMessage(err: unknown, fallback: string) {
  return err instanceof Error ? err.message : fallback;
}

export default function CancellationTeamClient({ userEmail }: { userEmail: string }) {
  const router = useRouter();
  const [rows, setRows] = useState<ReturnRecord[]>([]);
  const [stats, setStats] = useState<{ status: string; count: number }[]>([]);
  const [manualSubs, setManualSubs] = useState<Record<number, string>>({});
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<number | null>(null);
  const [error, setError] = useState('');
  const [cancelDraft, setCancelDraft] = useState<CancelDraft | null>(null);

  const loadQueue = async () => {
    setLoading(true);
    setError('');
    try {
      const res = await fetch('/api/ops/returns/cancellations');
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to load cancellation queue');
      setRows(data.returns || []);
      setStats(data.stats || []);
    } catch (err: unknown) {
      setError(errorMessage(err, 'Failed to load cancellation queue'));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadQueue();
  }, []);

  const patchRecord = async (id: number, action: string, subscriptionId?: string) => {
    setBusyId(id);
    setError('');
    try {
      const res = await fetch('/api/ops/returns/cancellations', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ returnId: id, action, subscriptionId }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Update failed');
      await loadQueue();
    } catch (err: unknown) {
      setError(errorMessage(err, 'Update failed'));
    } finally {
      setBusyId(null);
    }
  };

  const executeCancel = async () => {
    if (!cancelDraft) return;
    setBusyId(cancelDraft.record.id);
    setError('');
    try {
      const res = await fetch('/api/ops/returns/cancellations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          returnId: cancelDraft.record.id,
          cancellationReason: cancelDraft.reason,
          invoiceHandling: cancelDraft.invoiceHandling,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Cancellation failed');
      setCancelDraft(null);
      await loadQueue();
    } catch (err: unknown) {
      setError(errorMessage(err, 'Cancellation failed'));
    } finally {
      setBusyId(null);
    }
  };

  return (
    <main style={{ minHeight: '100vh', background: '#080808', color: '#f8fafc', fontFamily: 'system-ui, sans-serif' }}>
      <header style={{ height: 72, display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0 32px', borderBottom: '1px solid rgba(255,255,255,0.08)', background: '#0f0f0f' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
          <button onClick={() => router.push('/ops/dashboard')} title="Back to Ops" style={{ width: 36, height: 36, borderRadius: 8, border: '1px solid rgba(255,255,255,0.12)', background: 'rgba(255,255,255,0.04)', color: '#d1d5db', display: 'grid', placeItems: 'center', cursor: 'pointer' }}>
            <ArrowLeft size={17} />
          </button>
          <div>
            <h1 style={{ margin: 0, fontSize: 20, fontWeight: 750 }}>Cancellation Team Queue</h1>
            <p style={{ margin: '3px 0 0', color: '#9ca3af', fontSize: 13 }}>Verify Chargebee matches and cancel returned-device subscriptions.</p>
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <button onClick={loadQueue} title="Refresh queue" style={{ width: 36, height: 36, borderRadius: 8, border: '1px solid rgba(255,255,255,0.12)', background: 'rgba(255,255,255,0.04)', color: '#d1d5db', display: 'grid', placeItems: 'center', cursor: 'pointer' }}>
            <RefreshCw size={16} />
          </button>
          <div style={{ fontSize: 13, color: '#a7f3d0' }}>{userEmail}</div>
        </div>
      </header>

      <div style={{ maxWidth: 1320, margin: '0 auto', padding: 32, display: 'grid', gap: 20 }}>
        {error && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: 12, borderRadius: 8, border: '1px solid rgba(239,68,68,0.25)', color: '#fca5a5', background: 'rgba(239,68,68,0.1)' }}>
            <AlertTriangle size={18} /> {error}
          </div>
        )}

        <section style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
          {stats.map((stat) => (
            <div key={stat.status} style={{ minWidth: 150, border: '1px solid rgba(255,255,255,0.09)', borderRadius: 8, padding: '14px 16px', background: '#111' }}>
              <div style={{ color: '#9ca3af', fontSize: 12, textTransform: 'uppercase' }}>{stat.status.replace(/_/g, ' ')}</div>
              <div style={{ fontSize: 28, fontWeight: 800, marginTop: 4 }}>{stat.count}</div>
            </div>
          ))}
        </section>

        <section style={{ border: '1px solid rgba(255,255,255,0.09)', borderRadius: 8, background: '#111', overflow: 'hidden' }}>
          <div style={{ padding: '18px 22px', borderBottom: '1px solid rgba(255,255,255,0.08)' }}>
            <h2 style={{ margin: 0, fontSize: 17 }}>Pending Returns</h2>
          </div>

          {loading ? (
            <div style={{ padding: 28, color: '#9ca3af' }}><Loader2 size={16} className="animate-spin" style={{ verticalAlign: 'middle', marginRight: 8 }} />Loading and matching Chargebee subscriptions...</div>
          ) : (
            <div style={{ display: 'grid' }}>
              {rows.map((row) => {
                const manualValue = manualSubs[row.id] || '';
                const canConfirm = Boolean(row.chargebee_subscription_id) && row.status !== 'ready_to_cancel';
                const canCancel = Boolean(row.chargebee_subscription_id) && ['ready_to_cancel', 'match_found'].includes(row.status);
                return (
                  <article key={row.id} style={{ display: 'grid', gridTemplateColumns: '1.1fr 1.25fr 1fr', gap: 18, padding: 18, borderTop: '1px solid rgba(255,255,255,0.06)' }}>
                    <div>
                      <div style={{ color: '#9ca3af', fontSize: 12, marginBottom: 6 }}>Returned Device</div>
                      <div style={{ fontFamily: 'monospace', fontSize: 18, fontWeight: 800 }}>{row.imei}</div>
                      <div style={{ marginTop: 8, color: '#d1d5db', fontSize: 13 }}>Condition: {row.device_condition}</div>
                      <div style={{ color: '#d1d5db', fontSize: 13 }}>Tracking: {row.tracking_number}</div>
                      <div style={{ color: '#9ca3af', fontSize: 12, marginTop: 8 }}>Received {new Date(row.received_at).toLocaleString()}</div>
                    </div>

                    <div>
                      <div style={{ color: '#9ca3af', fontSize: 12, marginBottom: 8 }}>Chargebee Match</div>
                      {row.chargebee_subscription_id ? (
                        <div style={{ display: 'grid', gap: 7, fontSize: 13 }}>
                          <div><strong style={{ color: '#f8fafc' }}>Subscription:</strong> <span style={{ fontFamily: 'monospace' }}>{row.chargebee_subscription_id}</span></div>
                          <div><strong style={{ color: '#f8fafc' }}>Status:</strong> {row.chargebee_subscription_status || 'Unknown'}</div>
                          <div><strong style={{ color: '#f8fafc' }}>Customer:</strong> {row.chargebee_customer_name || 'Unknown'}</div>
                          <div><strong style={{ color: '#f8fafc' }}>Email:</strong> {row.chargebee_customer_email || 'Unknown'}</div>
                        </div>
                      ) : (
                        <div style={{ color: row.status === 'needs_manual_review' ? '#facc15' : '#9ca3af', fontSize: 13 }}>
                          {row.error_message || 'Chargebee lookup pending'}
                        </div>
                      )}

                      {Array.isArray(row.chargebee_match_payload?.matches) && (
                        <div style={{ marginTop: 10, color: '#facc15', fontSize: 12 }}>
                          Multiple matches found. Paste the correct subscription ID below.
                        </div>
                      )}
                    </div>

                    <div style={{ display: 'grid', gap: 10, alignContent: 'start' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <span style={{ padding: '5px 9px', borderRadius: 6, background: row.status === 'ready_to_cancel' ? 'rgba(34,197,94,0.14)' : 'rgba(250,204,21,0.12)', color: row.status === 'ready_to_cancel' ? '#86efac' : '#fde68a', border: '1px solid rgba(255,255,255,0.08)', fontSize: 12, textTransform: 'capitalize' }}>
                          {row.status.replace(/_/g, ' ')}
                        </span>
                      </div>

                      <button disabled={!canConfirm || busyId === row.id} onClick={() => patchRecord(row.id, 'confirm_match')} style={{ height: 38, border: 'none', borderRadius: 8, background: canConfirm ? '#2563eb' : '#374151', color: 'white', cursor: canConfirm ? 'pointer' : 'not-allowed', fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
                        {busyId === row.id ? <Loader2 size={15} className="animate-spin" /> : <Check size={15} />}
                        Confirm Correct Account
                      </button>

                      <div style={{ display: 'flex', gap: 8 }}>
                        <input
                          value={manualValue}
                          onChange={(event) => setManualSubs((prev) => ({ ...prev, [row.id]: event.target.value }))}
                          placeholder="Change subscription ID"
                          style={{ minWidth: 0, flex: 1, height: 38, border: '1px solid rgba(255,255,255,0.12)', borderRadius: 8, background: '#050505', color: '#f8fafc', padding: '0 10px' }}
                        />
                        <button disabled={!manualValue || busyId === row.id} onClick={() => patchRecord(row.id, 'set_subscription', manualValue)} title="Set subscription" style={{ width: 40, height: 38, border: 'none', borderRadius: 8, background: manualValue ? '#475569' : '#374151', color: 'white', cursor: manualValue ? 'pointer' : 'not-allowed', display: 'grid', placeItems: 'center' }}>
                          <Search size={15} />
                        </button>
                      </div>

                      <button disabled={!canCancel || busyId === row.id} onClick={() => setCancelDraft({ record: row, reason: '', invoiceHandling: invoiceOptions[0].value, confirming: false })} style={{ height: 40, border: 'none', borderRadius: 8, background: canCancel ? '#dc2626' : '#374151', color: 'white', cursor: canCancel ? 'pointer' : 'not-allowed', fontWeight: 800 }}>
                        Confirm / Cancel Account
                      </button>
                    </div>
                  </article>
                );
              })}
              {rows.length === 0 && <div style={{ padding: 28, color: '#9ca3af' }}>No pending returns in the cancellation queue.</div>}
            </div>
          )}
        </section>
      </div>

      {cancelDraft && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.72)', display: 'grid', placeItems: 'center', padding: 20, zIndex: 50 }}>
          <div style={{ width: '100%', maxWidth: 560, border: '1px solid rgba(255,255,255,0.12)', borderRadius: 8, background: '#111', color: '#f8fafc', boxShadow: '0 24px 80px rgba(0,0,0,0.7)' }}>
            <div style={{ padding: 20, borderBottom: '1px solid rgba(255,255,255,0.08)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <h2 style={{ margin: 0, fontSize: 18 }}>{cancelDraft.confirming ? 'Final Confirmation' : 'Cancel Chargebee Account'}</h2>
              <button onClick={() => setCancelDraft(null)} title="Close" style={{ width: 34, height: 34, borderRadius: 8, border: '1px solid rgba(255,255,255,0.12)', background: 'transparent', color: '#d1d5db', display: 'grid', placeItems: 'center', cursor: 'pointer' }}><X size={16} /></button>
            </div>

            <div style={{ padding: 20, display: 'grid', gap: 14 }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, fontSize: 13 }}>
                <div><span style={{ color: '#9ca3af' }}>Customer</span><br />{cancelDraft.record.chargebee_customer_name || 'Unknown'}</div>
                <div><span style={{ color: '#9ca3af' }}>Email</span><br />{cancelDraft.record.chargebee_customer_email || 'Unknown'}</div>
                <div><span style={{ color: '#9ca3af' }}>Subscription</span><br /><span style={{ fontFamily: 'monospace' }}>{cancelDraft.record.chargebee_subscription_id}</span></div>
                <div><span style={{ color: '#9ca3af' }}>IMEI</span><br /><span style={{ fontFamily: 'monospace' }}>{cancelDraft.record.imei}</span></div>
              </div>

              {!cancelDraft.confirming ? (
                <>
                  <label style={{ display: 'grid', gap: 6, fontSize: 13, color: '#d1d5db' }}>
                    Cancellation reason
                    <input value={cancelDraft.reason} onChange={(event) => setCancelDraft((prev) => prev ? { ...prev, reason: event.target.value } : prev)} placeholder="Returned device received" style={{ height: 40, border: '1px solid rgba(255,255,255,0.12)', borderRadius: 8, background: '#050505', color: '#f8fafc', padding: '0 10px' }} />
                  </label>
                  <label style={{ display: 'grid', gap: 6, fontSize: 13, color: '#d1d5db' }}>
                    Invoice handling
                    <select value={cancelDraft.invoiceHandling} onChange={(event) => setCancelDraft((prev) => prev ? { ...prev, invoiceHandling: event.target.value } : prev)} style={{ height: 40, border: '1px solid rgba(255,255,255,0.12)', borderRadius: 8, background: '#050505', color: '#f8fafc', padding: '0 10px' }}>
                      {invoiceOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
                    </select>
                  </label>
                  <button disabled={!cancelDraft.reason.trim()} onClick={() => setCancelDraft((prev) => prev ? { ...prev, confirming: true } : prev)} style={{ height: 42, border: 'none', borderRadius: 8, background: cancelDraft.reason.trim() ? '#dc2626' : '#374151', color: 'white', fontWeight: 800, cursor: cancelDraft.reason.trim() ? 'pointer' : 'not-allowed' }}>
                    Review Final Confirmation
                  </button>
                </>
              ) : (
                <>
                  <div style={{ border: '1px solid rgba(239,68,68,0.28)', background: 'rgba(239,68,68,0.1)', color: '#fecaca', borderRadius: 8, padding: 12, fontSize: 13 }}>
                    Are you sure you want to cancel this subscription? This action will cancel the Chargebee subscription and mark this return as completed.
                  </div>
                  <div style={{ color: '#d1d5db', fontSize: 13 }}>Reason: {cancelDraft.reason}</div>
                  <div style={{ color: '#d1d5db', fontSize: 13 }}>Invoice handling: {invoiceOptions.find((o) => o.value === cancelDraft.invoiceHandling)?.label}</div>
                  <div style={{ display: 'flex', gap: 10 }}>
                    <button onClick={() => setCancelDraft((prev) => prev ? { ...prev, confirming: false } : prev)} style={{ flex: 1, height: 42, borderRadius: 8, border: '1px solid rgba(255,255,255,0.12)', background: 'transparent', color: '#e5e7eb', cursor: 'pointer', fontWeight: 700 }}>Back</button>
                    <button onClick={executeCancel} disabled={busyId === cancelDraft.record.id} style={{ flex: 1.4, height: 42, border: 'none', borderRadius: 8, background: '#dc2626', color: 'white', cursor: 'pointer', fontWeight: 900, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
                      {busyId === cancelDraft.record.id ? <Loader2 size={16} className="animate-spin" /> : <Check size={16} />}
                      Yes, Cancel Now
                    </button>
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
      )}
    </main>
  );
}
