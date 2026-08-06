'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { AlertTriangle, ArrowLeft, CheckCircle2, Loader2, Play, RefreshCw, ShieldCheck, XCircle } from 'lucide-react';

type BatchRecord = { id: string; status: string };
type ItemRecord = {
  id: string; position: number; status: string; executable: boolean; block_reason: string | null; error_message: string | null;
  source_mdn: string; source_iccid: string; source_imei: string; source_plan: string;
  chargebee_status: string | null; chargebee_invoice_status: string | null; chargebee_reason: string; chargebee_subscription_id: string | null;
  parking_iccid: string | null; parking_imei: string | null; parking_sheet_row: number | null;
  destination_mdn: string | null; destination_iccid: string | null; destination_imei: string | null;
};
type Snapshot = { batch: BatchRecord; items: ItemRecord[]; counts: Record<string, number>; events: Array<Record<string, unknown>> };
const ACTIVE = new Set(['starting', 'running']);
const ACTIVE_ITEM = new Set(['reserved', 'parking', 'restoring', 'replacing', 'verifying']);

export default function LineSwapsClient({ initialBatchId, role }: { initialBatchId: string | null; role: string }) {
  const router = useRouter();
  const [batchSize, setBatchSize] = useState(5);
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const loadBatch = useCallback(async (batchId: string) => {
    const response = await fetch(`/api/ops/line-swaps/${batchId}`, { cache: 'no-store' });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || 'Failed to load batch');
    setSnapshot(data);
  }, []);

  useEffect(() => {
    if (!initialBatchId) return;
    loadBatch(initialBatchId).catch(err => setError(err.message));
  }, [initialBatchId, loadBatch]);

  useEffect(() => {
    const batch = snapshot?.batch;
    if (!batch || !ACTIVE.has(batch.status)) return;
    const timer = window.setInterval(() => loadBatch(batch.id).catch(err => setError(err.message)), 5000);
    return () => window.clearInterval(timer);
  }, [snapshot, loadBatch]);

  const executable = useMemo(() => snapshot?.items.filter(item => item.executable).length || 0, [snapshot]);
  const inProcess = useMemo(() => snapshot?.items.filter(item => ACTIVE_ITEM.has(item.status)).length || 0, [snapshot]);

  async function preview() {
    setBusy(true); setError('');
    try {
      const response = await fetch('/api/ops/line-swaps/preview', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ batchSize }), signal: AbortSignal.timeout(110_000),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Preview failed');
      setSnapshot(data);
      router.replace(`/ops/line-swaps?batch=${data.batch.id}`);
    } catch (err) { setError(err instanceof DOMException && err.name === 'TimeoutError' ? 'Preview timed out after 110 seconds. No carrier changes were made; try a smaller batch or retry.' : err instanceof Error ? err.message : 'Preview failed'); }
    finally { setBusy(false); }
  }

  async function confirm() {
    if (!snapshot?.batch?.id || !window.confirm(`Start ${executable} production line swap${executable === 1 ? '' : 's'}? This changes live ThingSpace identifiers.`)) return;
    setBusy(true); setError('');
    try {
      const response = await fetch(`/api/ops/line-swaps/${snapshot.batch.id}/confirm`, { method: 'POST' });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Could not start workflow');
      await loadBatch(snapshot.batch.id);
    } catch (err) { setError(err instanceof Error ? err.message : 'Confirmation failed'); }
    finally { setBusy(false); }
  }

  async function retry() {
    if (!snapshot?.batch?.id || !window.confirm('Retry only failed or quarantined checkpoints after reviewing their live state?')) return;
    setBusy(true); setError('');
    try {
      const response = await fetch(`/api/ops/line-swaps/${snapshot.batch.id}/retry`, { method: 'POST' });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Retry failed');
      await loadBatch(snapshot.batch.id);
    } catch (err) { setError(err instanceof Error ? err.message : 'Retry failed'); }
    finally { setBusy(false); }
  }

  async function releaseInventory(itemId: string) {
    if (!snapshot?.batch?.id || !window.confirm('Release this parking reservation only after confirming the identifiers are absent from ThingSpace?')) return;
    setBusy(true); setError('');
    try {
      const response = await fetch(`/api/ops/line-swaps/items/${itemId}/release`, { method: 'POST' });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Release failed');
      await loadBatch(snapshot.batch.id);
    } catch (err) { setError(err instanceof Error ? err.message : 'Release failed'); }
    finally { setBusy(false); }
  }

  return (
    <main className="swap-shell">
      <header className="swap-header">
        <button className="swap-ghost" onClick={() => router.push('/ops/dashboard')}><ArrowLeft size={16} /> Dashboard</button>
        <div><div className="swap-kicker">NOC CONTROL</div><h1>Contract-Line Swap Orchestrator</h1><p>Preview, validate, and monitor two-stage carrier swaps.</p></div>
        <div className="swap-role"><ShieldCheck size={16} /> {role}</div>
      </header>

      <section className="swap-controls">
        <label>Batch size<input type="number" min={1} max={50} value={batchSize} onChange={event => setBatchSize(Math.max(1, Math.min(50, Number(event.target.value) || 1)))} disabled={busy || Boolean(snapshot && ACTIVE.has(snapshot.batch.status))} /></label>
        <button className="swap-primary" onClick={preview} disabled={busy || Boolean(snapshot && ACTIVE.has(snapshot.batch.status))}>{busy ? <Loader2 className="spin" size={17} /> : <RefreshCw size={17} />} Pull preview</button>
        {snapshot?.batch?.status === 'preview' && <button className="swap-danger" onClick={confirm} disabled={busy || executable === 0}><Play size={17} /> Confirm {executable} eligible</button>}
        {snapshot && ['completed_with_failures', 'failed'].includes(snapshot.batch.status) && <button className="swap-danger" onClick={retry} disabled={busy}><RefreshCw size={17} /> Retry checkpoints</button>}
      </section>

      {error && <div className="swap-error"><AlertTriangle size={17} /> {error}</div>}

      {snapshot ? <>
        <section className="swap-summary">
          <Summary label="Reviewed" value={snapshot.items.length} />
          <Summary label="Eligible" value={executable} tone="good" />
          <Summary label="Blocked" value={snapshot.counts.blocked || 0} tone="warn" />
          <Summary label="In process" value={inProcess} />
          <Summary label="Completed" value={snapshot.counts.completed || 0} tone="good" />
          <Summary label="Failed / review" value={(snapshot.counts.failed || 0) + (snapshot.counts.quarantined || 0) + (snapshot.counts.completed_with_warning || 0)} tone="bad" />
        </section>
        <div className="swap-batchbar"><span>Batch <code>{snapshot.batch.id}</code></span><Status status={snapshot.batch.status} /></div>
        <section className="swap-table-wrap">
          <table className="swap-table"><thead><tr><th>#</th><th>Source line</th><th>Chargebee</th><th>Parking hardware</th><th>Replacement line</th><th>Plan</th><th>Stage</th></tr></thead>
            <tbody>{snapshot.items.map(item => <tr key={item.id}>
              <td>{item.position}</td>
              <td><Identifier label="MDN" value={item.source_mdn} /><Identifier label="ICCID" value={item.source_iccid} /><Identifier label="IMEI" value={item.source_imei} /></td>
              <td><strong>{item.chargebee_status || 'No match'}</strong><small>{item.chargebee_invoice_status ? `Latest invoice: ${item.chargebee_invoice_status}` : item.chargebee_reason}</small>{item.chargebee_subscription_id && <code>{item.chargebee_subscription_id}</code>}</td>
              <td>{item.parking_iccid ? <><Identifier label="ICCID" value={item.parking_iccid} /><Identifier label="IMEI" value={item.parking_imei || ''} /><small>Sheet row {item.parking_sheet_row}</small></> : <small>Not reserved</small>}</td>
              <td>{item.destination_mdn ? <><Identifier label="MDN" value={item.destination_mdn} /><Identifier label="ICCID" value={item.destination_iccid || ''} /><Identifier label="IMEI" value={item.destination_imei || ''} /></> : <small>No safe match</small>}</td>
              <td><code className="plan-code">{item.source_plan}</code></td>
              <td><Status status={item.status} />{item.block_reason && <small className="reason">{item.block_reason}</small>}{item.error_message && <small className="reason">{item.error_message}</small>}{role === 'admin' && ['failed', 'quarantined'].includes(item.status) && item.parking_iccid && <button className="swap-release" onClick={() => releaseInventory(item.id)} disabled={busy}>Release inventory</button>}</td>
            </tr>)}</tbody></table>
        </section>
      </> : <section className="swap-empty"><ShieldCheck size={36} /><h2>No batch loaded</h2><p>Pull a preview to validate source lines, Chargebee standing, inventory, and same-plan replacements. No carrier mutation occurs during preview.</p></section>}
    </main>
  );
}

function Summary({ label, value, tone = '' }: { label: string; value: number; tone?: string }) { return <div className={`swap-stat ${tone}`}><span>{label}</span><strong>{value}</strong></div>; }
function Identifier({ label, value }: { label: string; value: string }) { return <div className="swap-id"><span>{label}</span><code>{value}</code></div>; }
function Status({ status }: { status: string }) {
  const good = status === 'completed'; const bad = ['failed', 'quarantined', 'completed_with_failures'].includes(status); const pending = ACTIVE_ITEM.has(status) || ACTIVE.has(status);
  return <span className={`swap-status ${good ? 'good' : bad ? 'bad' : pending ? 'pending' : ''}`}>{good ? <CheckCircle2 size={13} /> : bad ? <XCircle size={13} /> : pending ? <Loader2 className="spin" size={13} /> : null}{status.replaceAll('_', ' ')}</span>;
}
