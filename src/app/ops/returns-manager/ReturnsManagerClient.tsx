"use client";

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowLeft, CheckCircle, FileText, Loader2, Upload, XCircle } from 'lucide-react';

type UploadResult = {
  batchUuid: string;
  importedCount: number;
  rejectedCount: number;
  rejected: { row: number | null; reason: string; imei?: string }[];
};

type Batch = {
  batch_uuid: string;
  uploaded_by: string;
  file_name: string;
  total_rows: number;
  imported_rows: number;
  rejected_rows: number;
  pending_rows: number;
  completed_rows: number;
  created_at: string;
};

type ReturnRow = {
  id: number;
  imei: string;
  device_condition: string;
  tracking_number: string;
  received_at: string;
  status: string;
  chargebee_subscription_id?: string | null;
  chargebee_customer_email?: string | null;
  error_message?: string | null;
};

function errorMessage(err: unknown, fallback: string) {
  return err instanceof Error ? err.message : fallback;
}

export default function ReturnsManagerClient({ userEmail }: { userEmail: string }) {
  const router = useRouter();
  const [file, setFile] = useState<File | null>(null);
  const [loading, setLoading] = useState(false);
  const [historyLoading, setHistoryLoading] = useState(true);
  const [error, setError] = useState('');
  const [result, setResult] = useState<UploadResult | null>(null);
  const [batches, setBatches] = useState<Batch[]>([]);
  const [returns, setReturns] = useState<ReturnRow[]>([]);

  const loadHistory = async () => {
    setHistoryLoading(true);
    try {
      const res = await fetch('/api/ops/returns/upload');
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to load upload history');
      setBatches(data.batches || []);
      setReturns(data.returns || []);
    } catch (err: unknown) {
      setError(errorMessage(err, 'Failed to load upload history'));
    } finally {
      setHistoryLoading(false);
    }
  };

  useEffect(() => {
    loadHistory();
  }, []);

  const uploadCsv = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!file) return;

    setLoading(true);
    setError('');
    setResult(null);
    try {
      const form = new FormData();
      form.append('file', file);
      const res = await fetch('/api/ops/returns/upload', { method: 'POST', body: form });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'CSV upload failed');
      setResult(data);
      setFile(null);
      await loadHistory();
    } catch (err: unknown) {
      setError(errorMessage(err, 'CSV upload failed'));
    } finally {
      setLoading(false);
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
            <h1 style={{ margin: 0, fontSize: 20, fontWeight: 750 }}>Returns Manager</h1>
            <p style={{ margin: '3px 0 0', color: '#9ca3af', fontSize: 13 }}>CSV intake only. Cancellation work is handled on the separate agent page.</p>
          </div>
        </div>
        <div style={{ fontSize: 13, color: '#a7f3d0' }}>{userEmail}</div>
      </header>

      <div style={{ maxWidth: 1180, margin: '0 auto', padding: 32, display: 'grid', gap: 24 }}>
        <section style={{ display: 'grid', gridTemplateColumns: 'minmax(320px, 420px) 1fr', gap: 24, alignItems: 'start' }}>
          <form onSubmit={uploadCsv} style={{ border: '1px solid rgba(255,255,255,0.09)', borderRadius: 8, padding: 22, background: '#111' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 18 }}>
              <Upload size={20} color="#22c55e" />
              <h2 style={{ margin: 0, fontSize: 17 }}>Upload Returned Devices</h2>
            </div>
            <label style={{ display: 'block', color: '#d1d5db', fontSize: 13, marginBottom: 8 }}>Required columns</label>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 18 }}>
              {['imei', 'device_condition', 'tracking_number'].map((item) => (
                <code key={item} style={{ background: 'rgba(34,197,94,0.12)', color: '#86efac', border: '1px solid rgba(34,197,94,0.25)', padding: '5px 8px', borderRadius: 6, fontSize: 12 }}>{item}</code>
              ))}
            </div>
            <input
              type="file"
              accept=".csv,text/csv"
              onChange={(event) => setFile(event.target.files?.[0] || null)}
              style={{ width: '100%', color: '#e5e7eb', background: '#050505', border: '1px solid rgba(255,255,255,0.12)', borderRadius: 8, padding: 12, boxSizing: 'border-box' }}
            />
            <button disabled={!file || loading} style={{ marginTop: 16, width: '100%', height: 42, border: 'none', borderRadius: 8, background: !file || loading ? '#374151' : '#16a34a', color: 'white', fontWeight: 700, cursor: !file || loading ? 'not-allowed' : 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
              {loading ? <Loader2 size={16} className="animate-spin" /> : <Upload size={16} />}
              Upload CSV
            </button>
          </form>

          <section style={{ border: '1px solid rgba(255,255,255,0.09)', borderRadius: 8, padding: 22, background: '#111', minHeight: 210 }}>
            <h2 style={{ margin: '0 0 14px', fontSize: 17 }}>Upload Result</h2>
            {error && <div style={{ display: 'flex', gap: 10, color: '#fca5a5', background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.25)', borderRadius: 8, padding: 12, fontSize: 13 }}><XCircle size={18} />{error}</div>}
            {!error && !result && <p style={{ color: '#9ca3af', margin: 0, fontSize: 14 }}>Upload a CSV to see imported and rejected rows here.</p>}
            {result && (
              <div style={{ display: 'grid', gap: 14 }}>
                <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap' }}>
                  <div style={{ color: '#86efac', fontWeight: 800 }}><CheckCircle size={16} style={{ verticalAlign: 'middle', marginRight: 6 }} />{result.importedCount} imported</div>
                  <div style={{ color: result.rejectedCount ? '#fca5a5' : '#9ca3af', fontWeight: 800 }}><XCircle size={16} style={{ verticalAlign: 'middle', marginRight: 6 }} />{result.rejectedCount} rejected</div>
                </div>
                {result.rejected.length > 0 && (
                  <div style={{ maxHeight: 180, overflow: 'auto', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 8 }}>
                    {result.rejected.map((row, index) => (
                      <div key={`${row.imei || row.row}-${index}`} style={{ padding: '9px 12px', borderBottom: '1px solid rgba(255,255,255,0.06)', fontSize: 13, color: '#d1d5db' }}>
                        Row {row.row ?? 'existing'} {row.imei ? `(${row.imei})` : ''}: {row.reason}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </section>
        </section>

        <section style={{ border: '1px solid rgba(255,255,255,0.09)', borderRadius: 8, background: '#111', overflow: 'hidden' }}>
          <div style={{ padding: '18px 22px', borderBottom: '1px solid rgba(255,255,255,0.08)', display: 'flex', alignItems: 'center', gap: 10 }}>
            <FileText size={19} color="#60a5fa" />
            <h2 style={{ margin: 0, fontSize: 17 }}>Upload History</h2>
          </div>
          {historyLoading ? (
            <div style={{ padding: 28, color: '#9ca3af' }}><Loader2 size={16} className="animate-spin" style={{ verticalAlign: 'middle', marginRight: 8 }} />Loading history...</div>
          ) : (
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                <thead style={{ background: '#0b0b0b', color: '#9ca3af', textAlign: 'left' }}>
                  <tr>
                    {['File', 'Uploaded', 'Rows', 'Pending', 'Completed', 'Uploaded By'].map((h) => <th key={h} style={{ padding: '12px 16px' }}>{h}</th>)}
                  </tr>
                </thead>
                <tbody>
                  {batches.map((batch) => (
                    <tr key={batch.batch_uuid} style={{ borderTop: '1px solid rgba(255,255,255,0.06)' }}>
                      <td style={{ padding: '13px 16px', color: '#e5e7eb' }}>{batch.file_name}</td>
                      <td style={{ padding: '13px 16px', color: '#9ca3af' }}>{new Date(batch.created_at).toLocaleString()}</td>
                      <td style={{ padding: '13px 16px' }}>{batch.imported_rows} imported / {batch.rejected_rows} rejected</td>
                      <td style={{ padding: '13px 16px', color: '#facc15' }}>{batch.pending_rows}</td>
                      <td style={{ padding: '13px 16px', color: '#86efac' }}>{batch.completed_rows}</td>
                      <td style={{ padding: '13px 16px', color: '#9ca3af' }}>{batch.uploaded_by}</td>
                    </tr>
                  ))}
                  {batches.length === 0 && <tr><td colSpan={6} style={{ padding: 22, color: '#9ca3af' }}>No CSV uploads yet.</td></tr>}
                </tbody>
              </table>
            </div>
          )}
        </section>

        <section style={{ border: '1px solid rgba(255,255,255,0.09)', borderRadius: 8, background: '#111', overflow: 'hidden' }}>
          <div style={{ padding: '18px 22px', borderBottom: '1px solid rgba(255,255,255,0.08)' }}>
            <h2 style={{ margin: 0, fontSize: 17 }}>Recent Imported Returns</h2>
          </div>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
              <thead style={{ background: '#0b0b0b', color: '#9ca3af', textAlign: 'left' }}>
                <tr>
                  {['IMEI', 'Condition', 'Tracking', 'Received', 'Status', 'Chargebee'].map((h) => <th key={h} style={{ padding: '12px 16px' }}>{h}</th>)}
                </tr>
              </thead>
              <tbody>
                {returns.map((row) => (
                  <tr key={row.id} style={{ borderTop: '1px solid rgba(255,255,255,0.06)' }}>
                    <td style={{ padding: '13px 16px', fontFamily: 'monospace' }}>{row.imei}</td>
                    <td style={{ padding: '13px 16px' }}>{row.device_condition}</td>
                    <td style={{ padding: '13px 16px' }}>{row.tracking_number}</td>
                    <td style={{ padding: '13px 16px', color: '#9ca3af' }}>{new Date(row.received_at).toLocaleString()}</td>
                    <td style={{ padding: '13px 16px', textTransform: 'capitalize' }}>{row.status.replace(/_/g, ' ')}</td>
                    <td style={{ padding: '13px 16px', color: row.chargebee_subscription_id ? '#86efac' : '#9ca3af' }}>{row.chargebee_subscription_id || row.error_message || 'Pending lookup'}</td>
                  </tr>
                ))}
                {returns.length === 0 && <tr><td colSpan={6} style={{ padding: 22, color: '#9ca3af' }}>No imported return records yet.</td></tr>}
              </tbody>
            </table>
          </div>
        </section>
      </div>
    </main>
  );
}
