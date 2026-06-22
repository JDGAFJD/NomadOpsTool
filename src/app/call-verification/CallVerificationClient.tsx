"use client";

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  AlertTriangle, ArrowLeft, CheckCircle2, Clock3, FileCheck2, FileUp,
  Loader2, Moon, PhoneCall, RefreshCw, RotateCcw, Save, Sun, Trash2, UserRoundCog,
} from 'lucide-react';
import { useTheme } from '@/components/ThemeProvider';

type Batch = {
  id: number; report_date: string; file_name: string; uploaded_by: string;
  total_rows: number; imported_rows: number; ignored_rows: number; rejected_rows: number;
  matched_rows: number; mismatch_rows: number; unverified_rows: number;
  mapping_required_rows: number; created_at: string; processed_at: string | null;
};
type Mapping = { id: number; extension: string; display_name: string | null; ops_email: string; updated_at: string };
type Unmapped = { agent_extension: string; agent_display_name: string; call_count: number; latest_report_date: string };
type Verification = {
  id: number; work_type: string; callback_id: number | null; collection_attempt_id: number | null;
  agent_email: string; reported_outcome: string; selected_phone: string; submitted_at: string;
  state: string; external_call_id: string | null; agent_extension: string | null;
  agent_display_name: string | null; evidence_status: string | null; ringing_seconds: number | null;
  talking_seconds: number | null; report_date: string | null; integration_error: string | null;
  evidence_call_time: string | null;
};
type OpsUser = { id: number; email: string; role: string };
type UploadResult = {
  duplicate: boolean;
  batch: Batch;
  processing: { verified: number; outcomeMismatch: number; unverified: number; mappingRequired: number; processed: number } | null;
  rejected: { row: number; reason: string }[];
};

const STATE_COPY: Record<string, string> = {
  pending: 'Pending daily verification',
  verified: 'Call verified',
  outcome_mismatch: 'Outcome mismatch',
  unverified: 'Unable to verify',
  mapping_required: 'Agent mapping required',
};

function humanize(value: string) {
  return value.replace(/_/g, ' ').replace(/\b\w/g, letter => letter.toUpperCase());
}

function duration(seconds: number | null) {
  if (seconds === null || seconds === undefined) return 'N/A';
  const minutes = Math.floor(seconds / 60);
  return minutes ? `${minutes}m ${seconds % 60}s` : `${seconds}s`;
}

export default function CallVerificationClient({ userEmail }: { userEmail: string }) {
  const router = useRouter();
  const { theme, toggle } = useTheme();
  const [file, setFile] = useState<File | null>(null);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [working, setWorking] = useState('');
  const [error, setError] = useState('');
  const [result, setResult] = useState<UploadResult | null>(null);
  const [viewerRole, setViewerRole] = useState('');
  const [stats, setStats] = useState<Record<string, number>>({});
  const [batches, setBatches] = useState<Batch[]>([]);
  const [mappings, setMappings] = useState<Mapping[]>([]);
  const [unmapped, setUnmapped] = useState<Unmapped[]>([]);
  const [verifications, setVerifications] = useState<Verification[]>([]);
  const [users, setUsers] = useState<OpsUser[]>([]);
  const [mappingEmail, setMappingEmail] = useState<Record<string, string>>({});

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const response = await fetch('/api/ops/call-reports', { cache: 'no-store' });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Could not load call verification.');
      setViewerRole(data.viewerRole || '');
      setStats(data.stats || {});
      setBatches(data.batches || []);
      setMappings(data.mappings || []);
      setUnmapped(data.unmapped || []);
      setVerifications(data.verifications || []);
      setUsers(data.users || []);
    } catch (err: any) {
      setError(err.message || 'Could not load call verification.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);
  const isAdmin = viewerRole === 'admin';
  const metricCards = useMemo(() => [
    ['Pending', stats.pending || 0, Clock3, 'pending'],
    ['Verified', stats.verified || 0, CheckCircle2, 'verified'],
    ['Outcome mismatch', stats.outcome_mismatch || 0, AlertTriangle, 'outcome_mismatch'],
    ['Unable to verify', stats.unverified || 0, AlertTriangle, 'unverified'],
    ['Mapping required', stats.mapping_required || 0, UserRoundCog, 'mapping_required'],
  ] as const, [stats]);

  const upload = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!file) return;
    setUploading(true);
    setError('');
    setResult(null);
    try {
      const form = new FormData();
      form.append('file', file);
      const response = await fetch('/api/ops/call-reports', { method: 'POST', body: form });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'The call report could not be uploaded.');
      setResult(data);
      setFile(null);
      await load();
    } catch (err: any) {
      setError(err.message || 'The call report could not be uploaded.');
    } finally {
      setUploading(false);
    }
  };

  const saveMapping = async (entry: Unmapped | Mapping) => {
    const extension = 'extension' in entry ? entry.extension : entry.agent_extension;
    const opsEmail = mappingEmail[extension] || ('ops_email' in entry ? entry.ops_email : '');
    const displayName = 'display_name' in entry ? entry.display_name : entry.agent_display_name;
    if (!opsEmail) return;
    setWorking(extension);
    setError('');
    try {
      const response = await fetch('/api/ops/call-reports/mappings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          extension,
          displayName,
          opsEmail,
        }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Mapping could not be saved.');
      await load();
    } catch (err: any) {
      setError(err.message || 'Mapping could not be saved.');
    } finally {
      setWorking('');
    }
  };

  const deleteMapping = async (extension: string) => {
    setWorking(extension);
    try {
      const response = await fetch('/api/ops/call-reports/mappings', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ extension }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Mapping could not be removed.');
      await load();
    } catch (err: any) {
      setError(err.message || 'Mapping could not be removed.');
    } finally {
      setWorking('');
    }
  };

  const reprocess = async (verificationId: number) => {
    setWorking(`v-${verificationId}`);
    try {
      const response = await fetch('/api/ops/call-reports/reprocess', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ verificationId }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Verification could not be reprocessed.');
      await load();
    } catch (err: any) {
      setError(err.message || 'Verification could not be reprocessed.');
    } finally {
      setWorking('');
    }
  };

  return (
    <div className="ops-app-shell call-report-shell">
      <header className="ops-topbar call-report-topbar">
        <div className="call-report-title">
          <button title="Back to OPS" className="ops-icon-button" onClick={() => router.push('/ops/dashboard')}><ArrowLeft size={18}/></button>
          <div className="brand-mark"><PhoneCall size={19}/></div>
          <div><small>NomadOps</small><h1>Call Verification</h1></div>
        </div>
        <div className="call-report-header-actions">
          <span>{userEmail}</span>
          <button title="Refresh" className="ops-icon-button" onClick={() => void load()}><RefreshCw size={17}/></button>
          <button title="Toggle theme" className="ops-icon-button" onClick={toggle}>{theme === 'dark' ? <Sun size={17}/> : <Moon size={17}/>}</button>
        </div>
      </header>

      <main className="call-report-main">
        <section className="call-report-metrics">
          {metricCards.map(([label, value, Icon, state]) => <article key={label} data-state={state}><div><span>{label}</span><strong>{value}</strong></div><Icon size={20}/></article>)}
        </section>

        {error && <div className="collections-error">{error}</div>}
        <section className="call-report-intake-grid">
          <form className="call-report-upload" onSubmit={upload}>
            <div><FileUp size={20}/><div><small>Daily 3CX report</small><h2>Upload completed CSV</h2></div></div>
            <p>Upload the completed report for one Central Time calendar date. Outbound calls are imported and matched automatically.</p>
            <input type="file" accept=".csv,text/csv" onChange={event => setFile(event.target.files?.[0] || null)}/>
            <button className="ops-primary-button" disabled={!file || uploading}>{uploading ? <Loader2 className="animate-spin" size={16}/> : <FileCheck2 size={16}/>} {uploading ? 'Processing...' : 'Upload and verify'}</button>
          </form>
          <section className="call-report-result">
            <h2>Latest upload result</h2>
            {!result && <p>No report uploaded in this session.</p>}
            {result && <div className="call-report-result-grid">
              <strong>{result.duplicate ? 'File already imported' : `Report ${String(result.batch.report_date).slice(0,10)} processed`}</strong>
              <span>{result.batch.imported_rows} new outbound rows</span>
              <span>{result.processing?.verified || 0} verified</span>
              <span>{result.processing?.outcomeMismatch || 0} mismatched</span>
              <span>{result.processing?.unverified || 0} unverified</span>
              <span>{result.processing?.mappingRequired || 0} need mapping</span>
              {result.rejected.length > 0 && <em>{result.rejected.length} malformed row(s) rejected</em>}
            </div>}
          </section>
        </section>

        {isAdmin && <section className="call-report-section">
          <div className="call-report-section-head"><div><small>Administrator</small><h2>3CX agent mappings</h2></div><span>Extensions are the authoritative agent identity.</span></div>
          {unmapped.length > 0 && <div className="call-report-unmapped">
            {unmapped.map(entry => <article key={entry.agent_extension}>
              <div><strong>{entry.agent_display_name || 'Unknown agent'}</strong><span>Extension {entry.agent_extension} · {entry.call_count} call(s)</span></div>
              <select value={mappingEmail[entry.agent_extension] || ''} onChange={event => setMappingEmail(current => ({...current,[entry.agent_extension]:event.target.value}))}><option value="">Select OPS user</option>{users.map(user => <option key={user.id} value={user.email}>{user.email}</option>)}</select>
              <button title="Save mapping" className="ops-primary-button" disabled={!mappingEmail[entry.agent_extension] || working === entry.agent_extension} onClick={() => void saveMapping(entry)}><Save size={14}/></button>
            </article>)}
          </div>}
          <div className="call-report-table-wrap"><table><thead><tr><th>Extension</th><th>3CX name</th><th>OPS user</th><th>Updated</th><th></th></tr></thead><tbody>{mappings.map(mapping => <tr key={mapping.id}><td>{mapping.extension}</td><td>{mapping.display_name || 'N/A'}</td><td>{mapping.ops_email}</td><td>{new Date(mapping.updated_at).toLocaleString()}</td><td><button title="Remove mapping" disabled={working === mapping.extension} onClick={() => void deleteMapping(mapping.extension)}><Trash2 size={14}/></button></td></tr>)}{mappings.length === 0 && <tr><td colSpan={5}>No extensions mapped yet.</td></tr>}</tbody></table></div>
        </section>}

        <section className="call-report-section">
          <div className="call-report-section-head"><div><small>Evidence</small><h2>Recent verification results</h2></div><span>New outcomes only</span></div>
          <div className="call-report-verifications">{verifications.map(item => <article key={item.id} data-state={item.state}>
            <div className="call-report-verification-main"><div><strong>{STATE_COPY[item.state] || humanize(item.state)}</strong><span>{item.work_type === 'callback' ? `Callback #${item.callback_id}` : `Collection attempt #${item.collection_attempt_id}`}</span></div><span>{item.agent_email}</span></div>
            <div className="call-report-evidence-grid">
              <div><small>Reported</small><strong>{humanize(item.reported_outcome)}</strong></div>
              <div><small>Called number</small><strong>{item.selected_phone}</strong></div>
              <div><small>3CX agent</small><strong>{item.agent_display_name ? `${item.agent_display_name} (${item.agent_extension})` : 'Awaiting evidence'}</strong></div>
              <div><small>CSV status</small><strong>{item.evidence_status ? humanize(item.evidence_status) : 'N/A'}</strong></div>
              <div><small>Call time</small><strong>{item.evidence_call_time ? new Date(item.evidence_call_time).toLocaleString() : 'N/A'}</strong></div>
              <div><small>Ringing / talking</small><strong>{duration(item.ringing_seconds)} / {duration(item.talking_seconds)}</strong></div>
            </div>
            {item.integration_error && <p>{item.integration_error}</p>}
            {isAdmin && <button className="ops-secondary-button" disabled={working === `v-${item.id}`} onClick={() => void reprocess(item.id)}><RotateCcw size={13}/> Reprocess</button>}
          </article>)}</div>
        </section>

        <section className="call-report-section">
          <div className="call-report-section-head"><div><small>Imports</small><h2>Upload history</h2></div></div>
          <div className="call-report-table-wrap"><table><thead><tr><th>Report date</th><th>File</th><th>Imported</th><th>Verified</th><th>Mismatch</th><th>Unverified</th><th>Mapping</th><th>Uploaded by</th></tr></thead><tbody>{batches.map(batch => <tr key={batch.id}><td>{String(batch.report_date).slice(0,10)}</td><td>{batch.file_name}</td><td>{batch.imported_rows}</td><td>{batch.matched_rows}</td><td>{batch.mismatch_rows}</td><td>{batch.unverified_rows}</td><td>{batch.mapping_required_rows}</td><td>{batch.uploaded_by}<small>{new Date(batch.created_at).toLocaleString()}</small></td></tr>)}{batches.length === 0 && <tr><td colSpan={8}>{loading ? 'Loading...' : 'No reports uploaded yet.'}</td></tr>}</tbody></table></div>
        </section>
      </main>
    </div>
  );
}
