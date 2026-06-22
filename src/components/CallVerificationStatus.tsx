"use client";

import { AlertTriangle, CheckCircle2, Clock3, PhoneCall, RefreshCw } from 'lucide-react';

export type CallVerificationRecord = {
  id: number;
  state: 'pending' | 'verified' | 'outcome_mismatch' | 'unverified' | 'mapping_required';
  selected_phone: string;
  phone_source: string;
  twilio_call_sid: string | null;
  twilio_status: string | null;
  twilio_from: string | null;
  twilio_to: string | null;
  twilio_start_time: string | null;
  twilio_duration: number | null;
  integration_error: string | null;
  verification_deadline: string;
  evidence_source?: string | null;
  external_call_id?: string | null;
  agent_extension?: string | null;
  agent_display_name?: string | null;
  evidence_status?: string | null;
  evidence_call_time?: string | null;
  ringing_seconds?: number | null;
  talking_seconds?: number | null;
  report_date?: string | null;
  explanations?: Array<{
    id: number;
    author_email: string;
    verification_state: string;
    category: string;
    notes: string;
    created_at: string;
  }>;
};

const COPY = {
  pending: { label: 'Pending daily verification', Icon: Clock3 },
  verified: { label: 'Call verified', Icon: CheckCircle2 },
  outcome_mismatch: { label: 'Outcome mismatch', Icon: AlertTriangle },
  unverified: { label: 'Unable to verify', Icon: AlertTriangle },
  mapping_required: { label: 'Agent mapping required', Icon: AlertTriangle },
};

export function VerificationBadge({ verification }: { verification?: CallVerificationRecord | null }) {
  if (!verification) return <span className="call-verification-badge is-not-tracked">Not tracked</span>;
  const copy = COPY[verification.state];
  const Icon = copy.Icon;
  return <span className={`call-verification-badge is-${verification.state}`}><Icon size={12}/>{copy.label}</span>;
}

export function CallVerificationDetails({
  verification,
  isAdmin,
  working,
  onRecheck,
}: {
  verification?: CallVerificationRecord | null;
  isAdmin?: boolean;
  working?: boolean;
  onRecheck?: (id: number) => void;
}) {
  if (!verification) {
    return <div className="call-verification-panel"><VerificationBadge verification={null}/><p>This historical outcome was created before call verification was enabled.</p></div>;
  }
  return (
    <div className={`call-verification-panel is-${verification.state}`}>
      <div className="call-verification-head">
        <VerificationBadge verification={verification}/>
        {isAdmin&&onRecheck&&<button type="button" title="Reprocess verification" disabled={working} onClick={()=>onRecheck(verification.id)}><RefreshCw size={13}/>{working?'Checking...':'Recheck'}</button>}
      </div>
      <div className="call-verification-grid">
        <div><small>Called number</small><strong>{verification.selected_phone}</strong></div>
        <div><small>Source</small><strong>{verification.phone_source.replace(/_/g,' ')}</strong></div>
        {verification.evidence_source==='csv'&&verification.external_call_id&&<div><small>3CX Evidence Reference</small><strong>{verification.external_call_id.slice(0,12)}</strong></div>}
        {verification.evidence_source==='csv'&&verification.agent_display_name&&<div><small>3CX agent</small><strong>{verification.agent_display_name} ({verification.agent_extension})</strong></div>}
        {verification.evidence_source==='csv'&&verification.evidence_status&&<div><small>CSV status</small><strong>{verification.evidence_status}</strong></div>}
        {verification.evidence_source==='csv'&&verification.evidence_call_time&&<div><small>Call time</small><strong>{new Date(verification.evidence_call_time).toLocaleString()}</strong></div>}
        {verification.evidence_source==='csv'&&<div><small>Ringing / talking</small><strong>{verification.ringing_seconds || 0}s / {verification.talking_seconds || 0}s</strong></div>}
        {verification.evidence_source!=='csv'&&verification.twilio_call_sid&&<div><small>Twilio Call SID</small><strong>{verification.twilio_call_sid}</strong></div>}
        {verification.evidence_source!=='csv'&&verification.twilio_status&&<div><small>Twilio status</small><strong>{verification.twilio_status}</strong></div>}
        {verification.evidence_source!=='csv'&&verification.twilio_start_time&&<div><small>Call time</small><strong>{new Date(verification.twilio_start_time).toLocaleString()}</strong></div>}
        {verification.evidence_source!=='csv'&&verification.twilio_duration!==null&&verification.twilio_duration!==undefined&&<div><small>Duration</small><strong>{verification.twilio_duration}s</strong></div>}
      </div>
      {verification.state==='pending'&&<p><PhoneCall size={13}/> Waiting for the completed daily 3CX call report.</p>}
      {verification.integration_error&&<p className="is-error">{verification.integration_error}</p>}
    </div>
  );
}
