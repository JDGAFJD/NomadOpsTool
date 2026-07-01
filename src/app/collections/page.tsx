"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  AlertCircle, BarChart3, FileCheck2,
  ArrowLeft, BadgeDollarSign, CalendarClock, CheckCircle2, ChevronDown, ChevronLeft, ChevronRight, ChevronUp,
  CircleDollarSign, Clock3, ExternalLink, FileText, Inbox, Loader2, LogOut, Moon,
  Bookmark, Mail, Pencil, PhoneCall, RefreshCw, RotateCcw, Save, Search, Sun, Trash2, UserCheck, Voicemail, X,
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

type View = 'unassigned' | 'mine' | 'all' | 'due' | 'closed' | 'collected' | 'missed_attempts' | 'missed_attempt_candidates';
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
  due_now: boolean; age_seconds: number | string; age_anchor_at: string;
  invoices: any[]; attempts: any[]; events: any[];
  admin_disposition?: string | null; admin_actor?: string | null; admin_note?: string | null; admin_action_at?: string | null;
  verification?: CallVerificationRecord | null;
  total_collected_amount?: number; viewer_credit_amount?: number; latest_paid_at?: string | null;
  agent_credits?: Array<{ agent_email: string; credited_amount: number; paid_invoices: number }>;
  missed_attempt_requests?: MissedAttemptRequest[];
};
type SavedView = { id: number; name: string; config: Record<string, string>; created_at: string; updated_at: string };
type ExplanationTarget = { verificationId: number; attemptId: number; customer: string };
type MissedAttemptRequest = {
  id: number; case_id: number; invoice_id: string | null; submitting_agent_email: string;
  requested_attempt_at: string; outcome: string; called_phone: string; notes: string;
  late_entry_reason: string; status: 'pending'|'approved'|'rejected';
  approved_attempt_id: number | null; reviewed_by: string | null; admin_note: string | null;
  reviewed_at: string | null; created_at: string; updated_at: string;
  customer_name?: string | null; customer_email?: string | null; subscription_id?: string | null;
  currency_code?: string | null; paid_invoices?: any[];
};
type MissedAttemptDialog = {
  requestedAttemptAt: string; outcome: 'completed'|'left_voicemail'|'no_answer';
  calledPhone: string; invoiceId: string; notes: string; lateEntryReason: string;
};
type MissedAttemptReviewDialog = { request: MissedAttemptRequest; action: 'approve'|'reject'; adminNote: string };

const STATUS_OPTIONS = ['all','unassigned','assigned','follow_up_pending','awaiting_payment_confirmation','paused','collected','exhausted','canceled','no_valid_contact','completed_by_admin','closed_by_admin'];
const ACTIVE_STATUSES = ['unassigned','assigned','follow_up_pending','awaiting_payment_confirmation','paused'];
const REASONS = [
  ['insufficient_funds','Insufficient funds'], ['expired_replaced_card','Expired or replaced card'],
  ['bank_decline','Bank decline'], ['payday_timing','Payday timing'], ['forgot','Forgot to pay'],
  ['billing_dispute','Billing dispute'], ['financial_hardship','Financial hardship'],
  ['technical_issue','Technical issue'], ['refused_payment','Refused payment'],
  ['promised_later','Promised to pay later'], ['other','Other'],
];
const EXPLANATION_REASONS = [
  ['report_not_uploaded','Report not uploaded'],
  ['extension_mapping_issue','Extension mapping issue'],
  ['called_number_differs','Called number differs'],
  ['outside_matching_window','Call outside matching window'],
  ['call_missing_from_report','Call missing from report'],
  ['status_mismatch','3CX status does not match outcome'],
  ['import_system_issue','Import or system issue'],
  ['other','Other'],
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
  const [successScope, setSuccessScope] = useState<'mine'|'all'>('mine');
  const [successVerification, setSuccessVerification] = useState('all');
  const [callVerificationEnabled, setCallVerificationEnabled] = useState(false);
  const [phoneSource, setPhoneSource] = useState('on_file');
  const [calledPhone, setCalledPhone] = useState('');
  const [verificationWorking, setVerificationWorking] = useState<number | null>(null);
  const [selectedIds, setSelectedIds] = useState<number[]>([]);
  const [adminAction, setAdminAction] = useState<AdminQueueAction | null>(null);
  const [adminTargetIds, setAdminTargetIds] = useState<number[]>([]);
  const [adminWorking, setAdminWorking] = useState(false);
  const [adminNotice, setAdminNotice] = useState('');
  const [savedViews, setSavedViews] = useState<SavedView[]>([]);
  const [savedViewId, setSavedViewId] = useState('');
  const [savedViewDialog, setSavedViewDialog] = useState<{ mode: 'create'|'rename'; name: string; id?: number } | null>(null);
  const [savedViewWorking, setSavedViewWorking] = useState(false);
  const [explanationTarget, setExplanationTarget] = useState<ExplanationTarget | null>(null);
  const [explanationCategory, setExplanationCategory] = useState('');
  const [explanationNotes, setExplanationNotes] = useState('');
  const [explanationWorking, setExplanationWorking] = useState(false);
  const [shopifyPhoneNoResult, setShopifyPhoneNoResult] = useState(false);
  const [missedAttemptDialog, setMissedAttemptDialog] = useState<MissedAttemptDialog | null>(null);
  const [missedAttemptReview, setMissedAttemptReview] = useState<MissedAttemptReviewDialog | null>(null);
  const [missedAttemptWorking, setMissedAttemptWorking] = useState(false);
  const [missedAttemptError, setMissedAttemptError] = useState('');
  const [missedAttemptRequests, setMissedAttemptRequests] = useState<MissedAttemptRequest[]>([]);
  const [selectedMissedAttempt, setSelectedMissedAttempt] = useState<MissedAttemptRequest | null>(null);
  const [missedAttemptStatus, setMissedAttemptStatus] = useState('pending');
  const [missedAttemptAgents, setMissedAttemptAgents] = useState<string[]>([]);
  const [missedAttemptCounts, setMissedAttemptCounts] = useState<any>({});
  const selectedIdRef = useRef<number | null>(null);
  const selectedMissedAttemptIdRef = useRef<number | null>(null);
  const requestIdRef = useRef(0);
  const requestControllerRef = useRef<AbortController | null>(null);
  const seenSentCaseIdsRef = useRef<Set<number>>(new Set());

  const selectCase = useCallback((record: CollectionCase | null) => {
    selectedIdRef.current = record?.id ?? null;
    setSelected(record);
    setLiveInvoices(null);
    setExpandedInvoice(false);
    setShopifyPhoneNoResult(false);
    setMissedAttemptDialog(null);
    setMissedAttemptReview(null);
    setMissedAttemptError('');
  }, []);

  const selectMissedAttempt = useCallback((record: MissedAttemptRequest | null) => {
    selectedMissedAttemptIdRef.current = record?.id ?? null;
    setSelectedMissedAttempt(record);
    setSelected(null);
    selectedIdRef.current = null;
    setMissedAttemptReview(null);
    setMissedAttemptError('');
  }, []);

  const load = useCallback(async (): Promise<CollectionCase[]> => {
    const requestId = requestIdRef.current + 1;
    requestIdRef.current = requestId;
    requestControllerRef.current?.abort();
    const controller = new AbortController();
    requestControllerRef.current = controller;
    setLoading(true); setError('');
    try {
      if (view === 'missed_attempts') {
        const params = new URLSearchParams({ status: missedAttemptStatus, page: String(page) });
        if (search.trim()) params.set('search', search.trim());
        if (owner !== 'all') params.set('agent', owner);
        if (fromDate) params.set('from', fromDate);
        if (toDate) params.set('to', toDate);
        const res = await fetch(`/api/ops/collections/missed-attempts?${params}`, { cache: 'no-store', signal: controller.signal });
        const data = await res.json();
        if (requestId !== requestIdRef.current) return [];
        if (!res.ok) throw new Error(data.error || 'Could not load missed attempt requests.');
        setAgentEmail(data.agentEmail); setViewerRole(data.viewerRole || '');
        setMissedAttemptRequests(data.requests || []);
        setMissedAttemptCounts(data.counts || {});
        setMissedAttemptAgents(data.agents || []);
        setPagination(data.pagination || { page: 1, pageSize: 50, totalRecords: 0, totalPages: 1 });
        setRecords([]);
        setSelected(null);
        selectedIdRef.current = null;
        if (data.pagination?.page && data.pagination.page !== page) setPage(data.pagination.page);
        const selectedRequestId = selectedMissedAttemptIdRef.current;
        if (selectedRequestId !== null) {
          const updatedSelection = (data.requests || []).find((item: MissedAttemptRequest) => item.id === selectedRequestId) || null;
          selectedMissedAttemptIdRef.current = updatedSelection?.id ?? null;
          setSelectedMissedAttempt(updatedSelection);
        }
        return [];
      }
      const params = new URLSearchParams({ view, page: String(page), sort });
      if (search.trim()) params.set('search', search.trim());
      if (status !== 'all') params.set('status', status);
      if (owner !== 'all') params.set('owner', owner);
      if (attempt !== 'all') params.set('attempt', attempt);
      if (minAmount) params.set('minAmount', minAmount);
      if (maxAmount) params.set('maxAmount', maxAmount);
      if (fromDate) params.set('from', fromDate);
      if (toDate) params.set('to', toDate);
      if (view === 'collected') {
        params.set('successScope', successScope);
        if (successVerification !== 'all') params.set('successVerification', successVerification);
      } else if (callVerificationEnabled && verificationFilter !== 'all') {
        params.set('verification', verificationFilter);
      }
      const res = await fetch(`/api/ops/collections/queue?${params}`, { cache: 'no-store', signal: controller.signal });
      const data = await res.json();
      if (requestId !== requestIdRef.current) return [];
      if (!res.ok) throw new Error(data.error || 'Could not load collections.');
      setAgentEmail(data.agentEmail); setViewerRole(data.viewerRole || ''); setUsers(data.users || []);
      setCallVerificationEnabled(Boolean(data.callVerificationEnabled));
      if (data.successScope) setSuccessScope(data.successScope);
      setCounts(data.counts || {}); setOwners(data.owners || []);
      const nextRecords = data.records || [];
      const nextPagination = data.pagination || { page: 1, pageSize: 50, totalRecords: 0, totalPages: 1 };
      setRecords(nextRecords);
      setMissedAttemptRequests([]);
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
  }, [view, page, sort, search, status, owner, attempt, minAmount, maxAmount, fromDate, toDate, verificationFilter, successScope, successVerification, callVerificationEnabled, missedAttemptStatus]);

  const loadSavedViews = useCallback(async () => {
    try {
      const response = await fetch('/api/ops/collections/saved-views', { cache: 'no-store' });
      const data = await response.json();
      if (response.ok) setSavedViews(data.views || []);
    } catch {}
  }, []);

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

  useEffect(() => { void loadSavedViews(); }, [loadSavedViews]);

  const isAdmin = viewerRole === 'admin';
  const successfulView = view === 'collected';
  const missedAttemptCandidateView = view === 'missed_attempt_candidates';
  const paidCaseView = successfulView || missedAttemptCandidateView;
  const missedAttemptView = view === 'missed_attempts';
  const tabs = [
    ['unassigned','Unassigned',Inbox,counts.unassigned || 0],
    ['mine','My Cases',UserCheck,counts.mine || 0],
    ['all','All Active',UserCheck,counts.active || 0],
    ['due','Due Follow-ups',CalendarClock,counts.due || 0],
    ['missed_attempt_candidates','Log Missed Attempt',Clock3,counts.collected_all || ''],
    ['missed_attempts','Missed Attempts',FileCheck2,missedAttemptCounts.pending || ''],
    ['closed','Closed',FileText,''],
    ['collected','Successful Collections',CircleDollarSign,view==='collected'&&successScope==='all'&&isAdmin ? counts.collected_all || 0 : counts.collected || 0],
  ] as const;
  const claimableRecords = view === 'unassigned' ? records.filter(item => item.status === 'unassigned') : [];
  const selectableRecords = isAdmin && ['unassigned','mine','all','due'].includes(view)
    ? records.filter(item => ACTIVE_STATUSES.includes(item.status))
    : claimableRecords;
  const allVisibleSelected = selectableRecords.length > 0 && selectableRecords.every(item => selectedIds.includes(item.id));

  useEffect(() => {
    setSelectedIds([]);
  }, [view, page, sort, search, status, owner, attempt, minAmount, maxAmount, fromDate, toDate, verificationFilter, successScope, successVerification, missedAttemptStatus]);

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
      if (data.verification) setAdminNotice('Attempt saved. Daily call verification is pending.');
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
      if (!res.ok) throw new Error(data.error || 'Could not reprocess verification.');
      setAdminNotice('Call verification was queued for another check.');
      await load();
    } catch (e: any) {
      setError(e.message || 'Could not reprocess verification.');
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

  async function checkPayment() {
    if (!selected) return;
    setWorking(true); setError(''); setAdminNotice('');
    try {
      const res = await fetch(`/api/ops/collections/${selected.id}/check-payment`, { method: 'POST' });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Could not check Chargebee payment.');
      setLiveInvoices(data.invoices || []);
      setExpandedInvoice(true);
      if (data.resultType === 'collected') {
        setAdminNotice('Payment confirmed in Chargebee. The collection case was marked collected.');
      } else if (data.resultType === 'paid_after_admin_closure') {
        setAdminNotice('Payment confirmed in Chargebee. The case was already administratively closed, so only invoice history was updated.');
      } else if (data.resultType === 'partial_payment') {
        setAdminNotice(`Partial payment found in Chargebee. Balance updated to ${money(data.totalAmountDue || 0, selected.currency_code)}.`);
      } else if (data.resultType === 'incomplete_check') {
        setAdminNotice('Chargebee updated some invoices, but one or more attached invoices could not be confirmed. Review the invoice list and try again.');
      } else {
        setAdminNotice(`No paid invoice found in Chargebee. Balance remains ${money(data.totalAmountDue || selected.total_amount_due, selected.currency_code)}.`);
      }
      await load();
    } catch (e: any) {
      setError(e.message || 'Could not check Chargebee payment.');
    } finally {
      setWorking(false);
    }
  }

  async function searchShopifyPhone() {
    if (!selected) return;
    setWorking(true); setError(''); setAdminNotice(''); setShopifyPhoneNoResult(false);
    try {
      const res = await fetch(`/api/ops/collections/${selected.id}/shopify-phone`, { method: 'POST' });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Could not search Shopify for a phone number.');
      if (data.found && data.phone) {
        setSelected(current => current ? { ...current, customer_phone: data.phone } : current);
        setAdminNotice(`Shopify returned ${data.phone} from ${data.source || 'the latest order'}. The case phone number was updated.`);
        await load();
      } else {
        setShopifyPhoneNoResult(true);
        setAdminNotice(data.message || 'Shopify did not return a valid phone number. You can close this case as no valid contact.');
      }
    } catch (e: any) {
      setError(e.message || 'Could not search Shopify for a phone number.');
    } finally {
      setWorking(false);
    }
  }

  async function closeNoValidContact() {
    if (!selected) return;
    setWorking(true); setError(''); setAdminNotice('');
    try {
      const res = await fetch(`/api/ops/collections/${selected.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'no_valid_contact' }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Could not close this case.');
      setAdminNotice('Collection case closed because no valid contact number was available.');
      selectCase(null);
      await load();
    } catch (e: any) {
      setError(e.message || 'Could not close this case.');
    } finally {
      setWorking(false);
    }
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

  function currentSavedViewConfig() {
    return {
      view,
      successScope,
      successVerification,
      search,
      status,
      owner,
      sort,
      attempt,
      verification: verificationFilter,
      missedAttemptStatus,
      minAmount,
      maxAmount,
      from: fromDate,
      to: toDate,
    };
  }

  function applySavedView(saved: SavedView) {
    const config = saved.config || {};
    setView((config.view || 'unassigned') as View);
    setSuccessScope(config.successScope === 'all' && isAdmin ? 'all' : 'mine');
    setSuccessVerification(config.successVerification || 'all');
    setSearch(config.search || '');
    setStatus(config.status || 'all');
    setOwner(config.owner || 'all');
    setSort(config.sort === 'newest' ? 'newest' : 'oldest');
    setAttempt(config.attempt || 'all');
    setVerificationFilter(config.verification || 'all');
    setMissedAttemptStatus(config.missedAttemptStatus || 'pending');
    setMinAmount(config.minAmount || '');
    setMaxAmount(config.maxAmount || '');
    setFromDate(config.from || '');
    setToDate(config.to || '');
    setSavedViewId(String(saved.id));
    setPage(1);
    setSelectedIds([]);
    selectCase(null);
    selectMissedAttempt(null);
  }

  async function submitSavedViewDialog() {
    if (!savedViewDialog) return;
    setSavedViewWorking(true);
    setError('');
    try {
      const isRename = savedViewDialog.mode === 'rename';
      const response = await fetch(
        isRename ? `/api/ops/collections/saved-views/${savedViewDialog.id}` : '/api/ops/collections/saved-views',
        {
          method: isRename ? 'PATCH' : 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(isRename
            ? { name: savedViewDialog.name }
            : { name: savedViewDialog.name, config: currentSavedViewConfig() }),
        }
      );
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'The saved view could not be updated.');
      setSavedViewDialog(null);
      setSavedViewId(String(data.view.id));
      await loadSavedViews();
    } catch (e: any) {
      setError(e.message || 'The saved view could not be updated.');
    } finally {
      setSavedViewWorking(false);
    }
  }

  async function deleteSavedView() {
    if (!savedViewId) return;
    setSavedViewWorking(true);
    setError('');
    try {
      const response = await fetch(`/api/ops/collections/saved-views/${savedViewId}`, { method: 'DELETE' });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'The saved view could not be deleted.');
      setSavedViewId('');
      await loadSavedViews();
    } catch (e: any) {
      setError(e.message || 'The saved view could not be deleted.');
    } finally {
      setSavedViewWorking(false);
    }
  }

  async function submitVerificationExplanation() {
    if (!explanationTarget) return;
    setExplanationWorking(true);
    setError('');
    try {
      const response = await fetch(`/api/ops/call-verifications/${explanationTarget.verificationId}/explanations`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ category: explanationCategory, notes: explanationNotes }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'The explanation could not be saved.');
      setExplanationTarget(null);
      setExplanationCategory('');
      setExplanationNotes('');
      setAdminNotice('Call verification explanation saved.');
      await load();
    } catch (e: any) {
      setError(e.message || 'The explanation could not be saved.');
    } finally {
      setExplanationWorking(false);
    }
  }

  function openMissedAttemptDialog() {
    if (!selected) return;
    const now = new Date();
    const localValue = new Date(now.getTime() - now.getTimezoneOffset() * 60_000).toISOString().slice(0, 16);
    const firstPaidInvoice = (selected.invoices || []).find((invoice: any) => invoice.paid_at && Number(invoice.amount_paid || 0) > 0);
    setMissedAttemptError('');
    setMissedAttemptDialog({
      requestedAttemptAt: localValue,
      outcome: 'completed',
      calledPhone: selected.customer_phone || '',
      invoiceId: firstPaidInvoice?.invoice_id || '',
      notes: '',
      lateEntryReason: '',
    });
  }

  async function submitMissedAttempt() {
    if (!selected || !missedAttemptDialog) return;
    setMissedAttemptWorking(true);
    setMissedAttemptError('');
    try {
      const requestedAttemptAt = new Date(missedAttemptDialog.requestedAttemptAt);
      const response = await fetch(`/api/ops/collections/${selected.id}/missed-attempts`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...missedAttemptDialog,
          requestedAttemptAt: requestedAttemptAt.toISOString(),
          invoiceId: missedAttemptDialog.invoiceId || null,
        }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'The missed attempt request could not be submitted.');
      setMissedAttemptDialog(null);
      setAdminNotice('Missed attempt submitted for admin review. It will not count for credit until approved.');
      await load();
    } catch (e: any) {
      setMissedAttemptError(e.message || 'The missed attempt request could not be submitted.');
    } finally {
      setMissedAttemptWorking(false);
    }
  }

  async function submitMissedAttemptReview() {
    if (!missedAttemptReview) return;
    setMissedAttemptWorking(true);
    setMissedAttemptError('');
    try {
      const response = await fetch(`/api/ops/collections/missed-attempts/${missedAttemptReview.request.id}/review`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: missedAttemptReview.action, adminNote: missedAttemptReview.adminNote }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'The missed attempt request could not be reviewed.');
      setMissedAttemptReview(null);
      setAdminNotice(missedAttemptReview.action === 'approve'
        ? 'Missed attempt approved. Successful collection credit will refresh from the approved call timestamp.'
        : 'Missed attempt request rejected.');
      await load();
    } catch (e: any) {
      setMissedAttemptError(e.message || 'The missed attempt request could not be reviewed.');
    } finally {
      setMissedAttemptWorking(false);
    }
  }

  const selectedSavedView = savedViews.find(saved => String(saved.id) === savedViewId);
  const explanationWordCount = explanationNotes.trim().split(/\s+/).filter(Boolean).length;
  const missedAttemptWordCount = missedAttemptDialog?.lateEntryReason.trim().split(/\s+/).filter(Boolean).length || 0;

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
          <button title="Call verification" onClick={()=>router.push('/call-verification')} className="ops-secondary-button collections-report-link"><FileCheck2 size={15}/><span>Verify Calls</span></button>
          <button title="Refresh" onClick={() => void load()} className="ops-icon-button"><RefreshCw size={17}/></button>
          <button title="Toggle theme" onClick={toggle} className="ops-icon-button">{theme === 'dark' ? <Sun size={17}/> : <Moon size={17}/>}</button>
          <button title="Sign out" onClick={async () => { await fetch('/api/ops/logout',{method:'POST'}); router.push('/ops/login'); }} className="ops-icon-button"><LogOut size={17}/></button>
        </div>
      </header>

      <main className="collections-main">
        <div className="collections-tabs">
          {tabs.map(([id,label,Icon,count]) => <button key={id} onClick={() => { setView(id); setPage(1); selectCase(null); selectMissedAttempt(null); }} className="ops-tab" data-active={view===id}><Icon size={15}/>{label}{count !== '' && <span>{count}</span>}</button>)}
        </div>

        <section className="collections-saved-views">
          <div><Bookmark size={16}/><strong>Saved views</strong></div>
          <select value={savedViewId} onChange={event=>{
            const saved = savedViews.find(item=>String(item.id)===event.target.value);
            if (saved) applySavedView(saved); else setSavedViewId('');
          }}>
            <option value="">Select a personal view</option>
            {savedViews.map(saved=><option key={saved.id} value={saved.id}>{saved.name}</option>)}
          </select>
          <button className="ops-secondary-button" onClick={()=>setSavedViewDialog({mode:'create',name:''})}><Save size={14}/>Save current</button>
          <button className="ops-icon-button" title="Rename selected view" disabled={!selectedSavedView||savedViewWorking} onClick={()=>selectedSavedView&&setSavedViewDialog({mode:'rename',id:selectedSavedView.id,name:selectedSavedView.name})}><Pencil size={15}/></button>
          <button className="ops-icon-button" title="Delete selected view" disabled={!selectedSavedView||savedViewWorking} onClick={()=>void deleteSavedView()}><Trash2 size={15}/></button>
          <span>{savedViews.length}/25</span>
        </section>

        <section className="collections-filters">
          <label className="collections-search"><Search size={16}/><input value={search} onChange={e=>{setSearch(e.target.value);setPage(1);}} placeholder="Search customer, case, invoice, or subscription"/></label>
          {missedAttemptView
            ? <select value={missedAttemptStatus} onChange={e=>{setMissedAttemptStatus(e.target.value);setPage(1);}}><option value="pending">Pending</option><option value="approved">Approved</option><option value="rejected">Rejected</option><option value="all">All statuses</option></select>
            : <select value={status} onChange={e=>{setStatus(e.target.value);setPage(1);}}>{STATUS_OPTIONS.map(v=><option key={v} value={v}>{v==='all'?'All statuses':humanize(v)}</option>)}</select>}
          {missedAttemptView
            ? <select value={owner} onChange={e=>{setOwner(e.target.value);setPage(1);}}><option value="all">All submitting agents</option>{missedAttemptAgents.map(v=><option key={v} value={v}>{v}</option>)}</select>
            : (!successfulView||isAdmin)&&<select value={owner} onChange={e=>{setOwner(e.target.value);setPage(1);}}><option value="all">{paidCaseView?'All credited agents':'All owners'}</option>{owners.map(v=><option key={v} value={v}>{v}</option>)}</select>}
          {!missedAttemptView&&<>
          {successfulView&&isAdmin&&<select value={successScope} onChange={e=>{setSuccessScope(e.target.value as 'mine'|'all');setOwner('all');setPage(1);}}>
            <option value="mine">My credited collections</option>
            <option value="all">All successful collections</option>
          </select>}
          <select aria-label="Sort collection cases" value={sort} onChange={e=>{setSort(e.target.value as 'oldest'|'newest');setPage(1);}}>
            <option value="oldest">Oldest first</option>
            <option value="newest">Newest first</option>
          </select>
          <select value={attempt} onChange={e=>{setAttempt(e.target.value);setPage(1);}}><option value="all">Any attempt</option><option value="0">Not attempted</option><option value="1">Attempt 1</option><option value="2">Attempt 2</option><option value="3">Attempt 3</option></select>
          {successfulView&&callVerificationEnabled&&<select value={successVerification} onChange={e=>{setSuccessVerification(e.target.value);setPage(1);}}>
            <option value="all">All calls</option>
            <option value="verified">Verified calls</option>
            <option value="not_verified">Not verified</option>
            <option value="needs_explanation">Needs explanation</option>
          </select>}
          {!paidCaseView&&callVerificationEnabled&&<select value={verificationFilter} onChange={e=>{setVerificationFilter(e.target.value);setPage(1);}}>
            <option value="all">All verification</option>
            <option value="pending">Pending daily verification</option>
            <option value="verified">Verified</option>
            <option value="unverified">Unable to verify</option>
            <option value="outcome_mismatch">Outcome mismatch</option>
            <option value="mapping_required">Agent mapping required</option>
            {isAdmin&&<option value="needs_review">Needs review</option>}
            <option value="not_tracked">Not tracked</option>
          </select>}
          <input type="number" min="0" value={minAmount} onChange={e=>{setMinAmount(e.target.value);setPage(1);}} placeholder="Min $"/>
          <input type="number" min="0" value={maxAmount} onChange={e=>{setMaxAmount(e.target.value);setPage(1);}} placeholder="Max $"/>
          </>}
          <input aria-label="Created from" type="date" value={fromDate} onChange={e=>{setFromDate(e.target.value);setPage(1);}}/>
          <input aria-label="Created through" type="date" value={toDate} onChange={e=>{setToDate(e.target.value);setPage(1);}}/>
          <button onClick={()=>{setSearch('');setStatus('all');setMissedAttemptStatus('pending');setOwner('all');setAttempt('all');setVerificationFilter('all');setSuccessVerification('all');setMinAmount('');setMaxAmount('');setFromDate('');setToDate('');setPage(1);}} className="ops-secondary-button">Reset</button>
        </section>

        {error && <div className="collections-error">{error}</div>}
        {adminNotice && <div className="admin-queue-notice">{adminNotice}</div>}
        {isAdmin && !missedAttemptView && !missedAttemptCandidateView && <AdminQueueToolbar count={selectedIds.length} onClear={() => setSelectedIds([])} onAction={action => openAdminAction(action, selectedIds)} />}
        {!isAdmin && !missedAttemptView && !missedAttemptCandidateView && selectedIds.length>0&&<section className="admin-queue-toolbar collections-claim-toolbar" aria-label="Bulk claim collection cases">
          <div><strong>{selectedIds.length} selected</strong><span>Assign these unassigned cases to yourself.</span></div>
          <button type="button" className="ops-primary-button" disabled={working} onClick={()=>void claimSelectedCases()}><UserCheck size={15}/>{working?'Claiming...':'Claim selected'}</button>
          <button type="button" className="ops-secondary-button" disabled={working} onClick={()=>setSelectedIds([])}>Clear</button>
        </section>}
        <div className={`collections-workspace ${selected || selectedMissedAttempt ? 'is-open' : ''}`}>
          <section className="collections-list">
            {!missedAttemptView && selectableRecords.length > 0 && <label className="admin-select-all"><input type="checkbox" checked={allVisibleSelected} onChange={()=>setSelectedIds(allVisibleSelected ? [] : selectableRecords.map(item=>item.id))}/>Select all {selectableRecords.length} visible collection cases</label>}
            {missedAttemptView ? (
              loading && missedAttemptRequests.length===0 ? <div className="collections-empty"><Loader2 className="animate-spin"/></div> :
              missedAttemptRequests.length===0 ? <div className="collections-empty">{missedAttemptStatus==='pending'?'No missed attempt requests need review.':'No missed attempt requests match this view.'}</div> :
              missedAttemptRequests.map(request => <article key={request.id} className={`collection-row missed-attempt-row is-${request.status} ${selectedMissedAttempt?.id===request.id?'is-selected':''}`} onClick={()=>selectMissedAttempt(request)}>
                <div className="collection-row-main">
                  <div className="collection-row-heading"><strong>{request.customer_name || request.customer_email || `Case #${request.case_id}`}</strong><span>{humanize(request.status)}</span><em>Case #{request.case_id}</em></div>
                  <div className="collection-row-meta"><span>{request.subscription_id || 'Invoice-only case'}</span><span>{request.submitting_agent_email}</span><span><Clock3 size={12}/>{when(request.requested_attempt_at)}</span><span>{humanize(request.outcome)}</span><span>{request.called_phone}</span></div>
                </div>
                <div className="collection-row-amount"><strong>{request.paid_invoices?.length || 0}</strong><small>paid invoice{request.paid_invoices?.length===1?'':'s'}</small></div>
              </article>)
            ) : loading && records.length===0 ? <div className="collections-empty"><Loader2 className="animate-spin"/></div> :
             records.length===0 ? <div className="collections-empty">No collection cases in this view.</div> :
             records.map(item => <article key={item.id} className={`collection-row ${!paidCaseView&&item.due_now?'is-due':''} ${paidCaseView?'is-successful':''} ${selected?.id===item.id?'is-selected':''} ${selectableRecords.some(record=>record.id===item.id)?'has-admin-select':''}`} onClick={()=>selectCase(item)}>
               {selectableRecords.some(record=>record.id===item.id)&&<input className="admin-row-checkbox" type="checkbox" checked={selectedIds.includes(item.id)} onClick={e=>e.stopPropagation()} onChange={()=>toggleSelected(item.id)} aria-label={`Select collection case ${item.id}`}/>}
               <div className="collection-row-main">
                 <div className="collection-row-heading"><strong>{item.customer_name || item.customer_email || item.customer_id || 'Unknown customer'}</strong><span>{paidCaseView?'Paid history':humanize(item.status)}</span>{missedAttemptCandidateView&&<em>{item.missed_attempt_requests?.length||0} missed request{item.missed_attempt_requests?.length===1?'':'s'}</em>}{item.reopened_count>0&&<em>Reopened {item.reopened_count}x</em>}</div>
                 <div className="collection-row-meta"><span>{item.subscription_id || 'Invoice-only case'}</span>{paidCaseView?<><span>{item.attempts?.length||0} credited call{item.attempts?.length===1?'':'s'}</span><span><CheckCircle2 size={12}/>Paid {when(item.latest_paid_at||null)}</span></>:<><span>Attempt {Number(item.current_attempt)+1} of 3</span><span><Clock3 size={12}/>{when(item.next_attempt_at)}</span><span className="collection-age">Age: {ageLabel(item.age_seconds)}</span>{callVerificationEnabled&&(item.attempts?.length>0||item.verification)&&<VerificationBadge verification={item.verification}/>}</>}</div>
               </div>
               <div className="collection-row-amount"><strong>{money(paidCaseView ? (successfulView&&successScope==='mine' ? item.viewer_credit_amount||0 : item.total_collected_amount||0) : item.total_amount_due,item.currency_code)}</strong><small>{paidCaseView?(successfulView&&successScope==='mine'?'Your credit':'Confirmed paid'):`#${item.id}`}</small>{view==='unassigned'&&<button onClick={e=>{e.stopPropagation();selectCase(item);void mutate('claim',{},item);}} className="ops-primary-button">Claim</button>}</div>
             </article>)}
            <nav className="collections-pagination" aria-label="Collections pagination">
              <div>
                <strong>Page {pagination.page} of {pagination.totalPages}</strong>
                <span>{pagination.totalRecords === 0 ? 'Showing 0 records' : `Showing ${(pagination.page - 1) * pagination.pageSize + 1}-${Math.min(pagination.page * pagination.pageSize, pagination.totalRecords)} of ${pagination.totalRecords}`}</span>
              </div>
              <div>
                <button type="button" className="ops-secondary-button" disabled={pagination.page <= 1 || loading} onClick={()=>{selectCase(null);selectMissedAttempt(null);setPage(current=>Math.max(1,current-1));}}><ChevronLeft size={15}/>Previous</button>
                <button type="button" className="ops-secondary-button" disabled={pagination.page >= pagination.totalPages || loading} onClick={()=>{selectCase(null);selectMissedAttempt(null);setPage(current=>Math.min(pagination.totalPages,current+1));}}>Next<ChevronRight size={15}/></button>
              </div>
            </nav>
          </section>

          {selectedMissedAttempt && <aside className="collections-detail">
            <div className="collections-detail-head"><div><small>Missed Attempt Request #{selectedMissedAttempt.id}</small><h2>{selectedMissedAttempt.customer_name || selectedMissedAttempt.customer_email || `Case #${selectedMissedAttempt.case_id}`}</h2></div><button onClick={()=>selectMissedAttempt(null)} className="ops-icon-button"><X size={17}/></button></div>
            <div className="collections-detail-body">
              <div className="collections-balance"><span>Review status</span><strong>{humanize(selectedMissedAttempt.status)}</strong><em>Collections case #{selectedMissedAttempt.case_id}</em></div>
              <div className="collections-grid">
                <div><small>Submitting agent</small><strong>{selectedMissedAttempt.submitting_agent_email}</strong></div>
                <div><small>Requested call time</small><strong>{when(selectedMissedAttempt.requested_attempt_at)}</strong></div>
                <div><small>Outcome</small><strong>{humanize(selectedMissedAttempt.outcome)}</strong></div>
                <div><small>Called phone</small><strong>{selectedMissedAttempt.called_phone}</strong></div>
                <div><small>Subscription</small><strong>{selectedMissedAttempt.subscription_id || 'Invoice only'}</strong></div>
                <div><small>Submitted</small><strong>{when(selectedMissedAttempt.created_at)}</strong></div>
              </div>
              <div className="collections-actions">
                <button type="button" className="ops-secondary-button" onClick={()=>{setView('missed_attempt_candidates');setSearch(String(selectedMissedAttempt.case_id));setMissedAttemptStatus('pending');setPage(1);selectMissedAttempt(null);}}>Open Related Case</button>
              </div>
              <section className="missed-attempt-section">
                <h3>Request details</h3>
                <article className={`missed-attempt-card is-${selectedMissedAttempt.status}`}>
                  <div><strong>Attempt notes</strong><span>{selectedMissedAttempt.submitting_agent_email}</span></div>
                  <p>{selectedMissedAttempt.notes}</p>
                  <small>Late-entry reason: {selectedMissedAttempt.late_entry_reason}</small>
                </article>
              </section>
              <section><h3>Paid invoice context</h3>{selectedMissedAttempt.paid_invoices?.length ? <div className="collections-invoices">{selectedMissedAttempt.paid_invoices.map((invoice:any)=><div key={invoice.id||invoice.invoice_id}><strong>{invoice.invoice_id||invoice.id}</strong><span>Paid {when(invoice.paid_at||null)}</span><span>{money(invoice.amount_paid||0,invoice.currency_code||selectedMissedAttempt.currency_code||'USD')}</span></div>)}</div> : <p className="collections-muted">No paid invoice context was returned for this request.</p>}</section>
              {(selectedMissedAttempt.reviewed_by || selectedMissedAttempt.admin_note) && <section className="collections-note">
                <strong>{selectedMissedAttempt.status==='approved'?'Approved':selectedMissedAttempt.status==='rejected'?'Rejected':'Reviewed'} by {selectedMissedAttempt.reviewed_by || 'admin'}</strong>
                <p>{selectedMissedAttempt.admin_note}</p>
                <small>{when(selectedMissedAttempt.reviewed_at)}</small>
                {selectedMissedAttempt.approved_attempt_id&&<small>Approved attempt #{selectedMissedAttempt.approved_attempt_id}</small>}
              </section>}
              {selectedMissedAttempt.status==='pending'&&isAdmin&&<section className="admin-record-controls"><div><strong>Administrator review</strong><span>Approval creates a real collection attempt if the call time is before Chargebee payment confirmation.</span></div><div className="missed-attempt-actions"><button type="button" className="ops-primary-button" onClick={()=>{setMissedAttemptError('');setMissedAttemptReview({request:selectedMissedAttempt,action:'approve',adminNote:''});}}><CheckCircle2 size={14}/>Approve</button><button type="button" className="ops-secondary-button" onClick={()=>{setMissedAttemptError('');setMissedAttemptReview({request:selectedMissedAttempt,action:'reject',adminNote:''});}}><X size={14}/>Reject</button></div></section>}
            </div>
          </aside>}

          {selected && <aside className="collections-detail">
            <div className="collections-detail-head"><div><small>Collections Case #{selected.id}</small><h2>{selected.customer_name || selected.customer_email || 'Customer'}</h2></div><button onClick={()=>selectCase(null)} className="ops-icon-button"><X size={17}/></button></div>
            <div className="collections-detail-body">
              <div className="collections-balance"><span>{paidCaseView?'Chargebee-confirmed collected':'Total outstanding'}</span><strong>{money(paidCaseView?(selected.total_collected_amount||0):selected.total_amount_due,selected.currency_code)}</strong><em>{paidCaseView?(missedAttemptCandidateView?'Missed attempt correction candidate':'Successful collection history'):humanize(selected.status)}</em></div>
              <div className="collections-grid">
                <div><small>Phone</small><strong>{selected.customer_phone || 'Not available'}</strong></div>
                <div><small>Owner</small><strong>{selected.assigned_to || 'Unassigned'}</strong></div>
                <div><small>Subscription</small><strong>{selected.subscription_id || 'Invoice only'}</strong></div>
                <div><small>Status</small><strong>{selected.subscription_status || 'Unknown'}</strong></div>
                <div><small>Plan</small><strong>{selected.plan_id || 'Unknown'}</strong></div>
                {paidCaseView?<><div><small>Latest payment</small><strong>{when(selected.latest_paid_at||null)}</strong></div><div><small>{successfulView&&successScope==='mine'?'Your credited amount':'Credited agents'}</small><strong>{successfulView&&successScope==='mine'?money(selected.viewer_credit_amount||0,selected.currency_code):String(selected.agent_credits?.length||0)}</strong></div></>:<><div><small>Next attempt</small><strong>{when(selected.next_attempt_at)}</strong></div><div className="collection-detail-age"><small>Age</small><strong>{ageLabel(selected.age_seconds)}</strong><em>{selected.attempts?.length ? 'Since last attempt' : 'Since case creation'}</em></div></>}
              </div>
              {!paidCaseView&&!selected.customer_phone&&ACTIVE_STATUSES.includes(selected.status)&&<section className="collections-note">
                <strong>No phone number on this case.</strong>
                <p>Search Shopify for the customer’s latest order phone before closing this collection case.</p>
                <div className="collections-actions">
                  <button type="button" onClick={()=>void searchShopifyPhone()} disabled={working||!selected.customer_email} className="ops-secondary-button">{working?<Loader2 className="animate-spin" size={14}/>:<Search size={14}/>}Search Shopify</button>
                  {(shopifyPhoneNoResult||!selected.customer_email)&&<button type="button" onClick={()=>void closeNoValidContact()} disabled={working} className="ops-primary-button"><X size={14}/>Close: No Valid Contact</button>}
                </div>
                {!selected.customer_email&&<small>Customer email is missing, so Shopify cannot be searched.</small>}
              </section>}
              <div className="collections-actions">
                {selected.chargebeeUrl&&<a href={selected.chargebeeUrl} target="_blank" rel="noreferrer" className="ops-secondary-button">Chargebee Profile <ExternalLink size={14}/></a>}
                {selected.freeScoutUrl&&<a href={selected.freeScoutUrl} target="_blank" rel="noreferrer" className="ops-secondary-button">FreeScout Ticket #{selected.latest_freescout_conversation_id} <ExternalLink size={14}/></a>}
                <button onClick={()=>void loadInvoices()} disabled={working} className="ops-secondary-button">Load Invoices <RefreshCw size={14}/></button>
                <button onClick={()=>void checkPayment()} disabled={working} className="ops-primary-button">{working?<Loader2 className="animate-spin" size={14}/>:<CheckCircle2 size={14}/>}Check Payment</button>
              </div>
              <section><button className="collections-section-toggle" onClick={()=>setExpandedInvoice(!expandedInvoice)}><span>Invoices ({(liveInvoices||selected.invoices||[]).length})</span>{expandedInvoice?<ChevronUp size={16}/>:<ChevronDown size={16}/>}</button>
                {expandedInvoice&&<div className="collections-invoices">{(liveInvoices||selected.invoices||[]).map((invoice:any)=><div key={invoice.id||invoice.invoice_id}><strong>{invoice.invoice_id||invoice.id}</strong><span>{paidCaseView?`Paid ${when(invoice.paid_at||null)}`:(invoice.status||invoice.invoice_status||'Unknown')}</span><span>{money(paidCaseView?(invoice.amount_paid??0):(invoice.amount_due??0),invoice.currency_code||selected.currency_code)}</span></div>)}</div>}
              </section>
              {successfulView&&isAdmin&&selected.agent_credits?.length?<section><h3>Credited agents</h3><div className="collection-credit-list">{selected.agent_credits.map(credit=><div key={credit.agent_email}><strong>{credit.agent_email}</strong><span>{credit.paid_invoices} paid invoice{credit.paid_invoices===1?'':'s'}</span><b>{money(credit.credited_amount,selected.currency_code)}</b></div>)}</div></section>:null}
              {paidCaseView&&<section className="missed-attempt-section">
                <div className="missed-attempt-head">
                  <div><h3>Missed attempt corrections</h3><p>Missed attempts are audited. Approved attempts only count when the call time is before Chargebee payment confirmation.</p></div>
                  <button type="button" className="ops-secondary-button" disabled={missedAttemptWorking} onClick={()=>openMissedAttemptDialog()}><Clock3 size={14}/>Submit Missed Attempt</button>
                </div>
                {selected.missed_attempt_requests?.length ? <div className="missed-attempt-list">
                  {selected.missed_attempt_requests.map(request=><article key={request.id} className={`missed-attempt-card is-${request.status}`}>
                    <div><strong>{humanize(request.outcome)} · {when(request.requested_attempt_at)}</strong><span>{request.submitting_agent_email} · {humanize(request.status)}</span></div>
                    <p>{request.notes}</p>
                    <small>Late-entry reason: {request.late_entry_reason}</small>
                    {request.admin_note&&<small>Admin note: {request.admin_note}</small>}
                    {request.status==='pending'&&isAdmin&&<div className="missed-attempt-actions">
                      <button type="button" className="ops-primary-button" onClick={()=>{setMissedAttemptError('');setMissedAttemptReview({request,action:'approve',adminNote:''});}}><CheckCircle2 size={14}/>Approve</button>
                      <button type="button" className="ops-secondary-button" onClick={()=>{setMissedAttemptError('');setMissedAttemptReview({request,action:'reject',adminNote:''});}}><X size={14}/>Reject</button>
                    </div>}
                    {request.status==='approved'&&request.approved_attempt_id&&<small>Approved attempt #{request.approved_attempt_id}{request.reviewed_by?` by ${request.reviewed_by}`:''}</small>}
                    {request.status==='rejected'&&request.reviewed_by&&<small>Rejected by {request.reviewed_by} · {when(request.reviewed_at)}</small>}
                  </article>)}
                </div> : <p className="collections-muted">No missed attempt corrections have been submitted for this case.</p>}
              </section>}
              <section><h3>{paidCaseView?'Credited call attempts':'Attempt history'}</h3>{selected.attempts?.length?<div className="collections-timeline">{selected.attempts.map((a:any)=><div key={a.id}><strong>Attempt {a.attempt_number}: {humanize(a.outcome)}</strong><span>{a.agent_email} · {when(a.created_at)}{a.email_delivery_status?` · Email ${humanize(a.email_delivery_status)}`:''}</span><p>{a.notes}</p>{a.freeScoutUrl&&<a className="collection-attempt-ticket" href={a.freeScoutUrl} target="_blank" rel="noreferrer">FreeScout Ticket #{a.freescout_conversation_id} <ExternalLink size={12}/></a>}{a.email_delivery_error&&<small className="collection-email-error">{a.email_delivery_error}</small>}{callVerificationEnabled&&<CallVerificationDetails verification={a.verification} isAdmin={isAdmin} working={verificationWorking===a.verification?.id} onRecheck={recheckVerification}/>}
                {a.verification?.explanations?.length>0&&<div className="verification-explanations">{a.verification.explanations.map((explanation:any)=><article key={explanation.id}><strong>{humanize(explanation.category)}</strong><span>{explanation.author_email} · {when(explanation.created_at)} · State: {humanize(explanation.verification_state)}</span><p>{explanation.notes}</p></article>)}</div>}
                {paidCaseView&&a.verification&&a.verification.state!=='verified'&&a.agent_email.toLowerCase()===agentEmail.toLowerCase()&&<button className="ops-secondary-button verification-explain-button" onClick={()=>{setExplanationTarget({verificationId:a.verification.id,attemptId:a.id,customer:selected.customer_name||selected.customer_email||`Case #${selected.id}`});setExplanationCategory('');setExplanationNotes('');}}>Explain why this call was not verified</button>}
              </div>)}</div>:<p className="collections-muted">No eligible call attempts were recorded before payment confirmation.</p>}</section>
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
      {savedViewDialog&&<div className="collections-modal-backdrop"><div className="collections-modal">
        <div className="collections-modal-head"><div><small>Personal Collections view</small><h2>{savedViewDialog.mode==='create'?'Save current view':'Rename saved view'}</h2></div><button disabled={savedViewWorking} onClick={()=>setSavedViewDialog(null)} className="ops-icon-button"><X size={17}/></button></div>
        <label><span>View name</span><input autoFocus maxLength={60} value={savedViewDialog.name} onChange={event=>setSavedViewDialog(current=>current?{...current,name:event.target.value}:current)} placeholder="Example: My unverified collections"/></label>
        <div className="collections-info">{savedViewDialog.mode==='create'?'The current tab, filters, sorting, and successful-collection scope will be saved for your account.':'Only the name will change; the saved filters stay the same.'}</div>
        <div className="collections-modal-actions"><button disabled={savedViewWorking} onClick={()=>setSavedViewDialog(null)} className="ops-secondary-button">Cancel</button><button disabled={savedViewWorking||savedViewDialog.name.trim().length<2} onClick={()=>void submitSavedViewDialog()} className="ops-primary-button">{savedViewWorking?'Saving...':savedViewDialog.mode==='create'?'Save view':'Rename view'}</button></div>
      </div></div>}
      {explanationTarget&&<div className="collections-modal-backdrop"><div className="collections-modal">
        <div className="collections-modal-head"><div><small>Call verification explanation</small><h2>{explanationTarget.customer}</h2></div><button disabled={explanationWorking} onClick={()=>setExplanationTarget(null)} className="ops-icon-button"><X size={17}/></button></div>
        <div className="collections-info">This explanation is append-only and does not change the call verification result.</div>
        <label><span>Reason</span><select value={explanationCategory} onChange={event=>setExplanationCategory(event.target.value)}><option value="">Select a reason</option>{EXPLANATION_REASONS.map(([value,label])=><option key={value} value={value}>{label}</option>)}</select></label>
        <label><span>Explanation</span><textarea value={explanationNotes} onChange={event=>setExplanationNotes(event.target.value)} placeholder="Explain why you believe the call was made even though the available 3CX evidence did not verify it."/></label>
        <small className={explanationWordCount<15?'verification-word-count is-short':'verification-word-count'}>{explanationWordCount}/15 words minimum</small>
        <div className="collections-modal-actions"><button disabled={explanationWorking} onClick={()=>setExplanationTarget(null)} className="ops-secondary-button">Cancel</button><button disabled={explanationWorking||!explanationCategory||explanationWordCount<15} onClick={()=>void submitVerificationExplanation()} className="ops-primary-button">{explanationWorking?'Saving...':'Save explanation'}</button></div>
      </div></div>}
      {missedAttemptDialog&&selected&&<div className="collections-modal-backdrop"><div className="collections-modal">
        <div className="collections-modal-head"><div><small>Audited credit correction</small><h2>Submit Missed Attempt</h2></div><button disabled={missedAttemptWorking} onClick={()=>setMissedAttemptDialog(null)} className="ops-icon-button"><X size={17}/></button></div>
        <div className="collections-info">This request needs admin approval before it can count toward collection credit. Approval only succeeds when the call time is before Chargebee payment confirmation.</div>
        {missedAttemptError&&<div className="collections-modal-error" role="alert">{missedAttemptError}</div>}
        <label><span>Actual call date and time</span><input type="datetime-local" value={missedAttemptDialog.requestedAttemptAt} onChange={event=>setMissedAttemptDialog(current=>current?{...current,requestedAttemptAt:event.target.value}:current)}/></label>
        <label><span>Paid invoice</span><select value={missedAttemptDialog.invoiceId} onChange={event=>setMissedAttemptDialog(current=>current?{...current,invoiceId:event.target.value}:current)}>
          <option value="">Auto-match eligible paid invoice</option>
          {(selected.invoices||[]).filter((invoice:any)=>invoice.paid_at&&Number(invoice.amount_paid||0)>0).map((invoice:any)=><option key={invoice.invoice_id||invoice.id} value={invoice.invoice_id||invoice.id}>{invoice.invoice_id||invoice.id} · Paid {when(invoice.paid_at||null)}</option>)}
        </select></label>
        <label><span>Outcome</span><select value={missedAttemptDialog.outcome} onChange={event=>setMissedAttemptDialog(current=>current?{...current,outcome:event.target.value as MissedAttemptDialog['outcome']}:current)}>
          <option value="completed">Completed</option>
          <option value="left_voicemail">Left Voicemail</option>
          <option value="no_answer">No Answer</option>
        </select></label>
        <label><span>Called phone number</span><input value={missedAttemptDialog.calledPhone} onChange={event=>setMissedAttemptDialog(current=>current?{...current,calledPhone:event.target.value}:current)} placeholder="Number the agent called"/></label>
        <label><span>Attempt notes</span><textarea value={missedAttemptDialog.notes} onChange={event=>setMissedAttemptDialog(current=>current?{...current,notes:event.target.value}:current)} placeholder="Document what happened on the call."/></label>
        <label><span>Why was this entered late?</span><textarea value={missedAttemptDialog.lateEntryReason} onChange={event=>setMissedAttemptDialog(current=>current?{...current,lateEntryReason:event.target.value}:current)} placeholder="Explain why the payment was collected before the attempt could be saved in NomadOps."/></label>
        <small className={missedAttemptWordCount<15?'verification-word-count is-short':'verification-word-count'}>{missedAttemptWordCount}/15 words minimum</small>
        <div className="collections-modal-actions"><button disabled={missedAttemptWorking} onClick={()=>setMissedAttemptDialog(null)} className="ops-secondary-button">Cancel</button><button disabled={missedAttemptWorking||!missedAttemptDialog.requestedAttemptAt||missedAttemptDialog.calledPhone.replace(/\D/g,'').length<7||!missedAttemptDialog.notes.trim()||missedAttemptWordCount<15} onClick={()=>void submitMissedAttempt()} className="ops-primary-button">{missedAttemptWorking?'Submitting...':'Submit for Review'}</button></div>
      </div></div>}
      {missedAttemptReview&&<div className="collections-modal-backdrop"><div className="collections-modal">
        <div className="collections-modal-head"><div><small>Admin review</small><h2>{missedAttemptReview.action==='approve'?'Approve Missed Attempt':'Reject Missed Attempt'}</h2></div><button disabled={missedAttemptWorking} onClick={()=>setMissedAttemptReview(null)} className="ops-icon-button"><X size={17}/></button></div>
        <div className="collections-info">{missedAttemptReview.action==='approve'?'Approval creates a real collection attempt at the requested call time. It will only be credited if it is before Chargebee payment confirmation.':'Rejected requests remain visible in audit history and do not affect collection credit.'}</div>
        {missedAttemptError&&<div className="collections-modal-error" role="alert">{missedAttemptError}</div>}
        <div className="missed-attempt-review-summary"><strong>{missedAttemptReview.request.submitting_agent_email}</strong><span>{humanize(missedAttemptReview.request.outcome)} · {when(missedAttemptReview.request.requested_attempt_at)}</span><p>{missedAttemptReview.request.notes}</p></div>
        <label><span>Admin note</span><textarea value={missedAttemptReview.adminNote} onChange={event=>setMissedAttemptReview(current=>current?{...current,adminNote:event.target.value}:current)} placeholder="Explain why this request is approved or rejected."/></label>
        <div className="collections-modal-actions"><button disabled={missedAttemptWorking} onClick={()=>setMissedAttemptReview(null)} className="ops-secondary-button">Cancel</button><button disabled={missedAttemptWorking||!missedAttemptReview.adminNote.trim()} onClick={()=>void submitMissedAttemptReview()} className="ops-primary-button">{missedAttemptWorking?'Saving...':missedAttemptReview.action==='approve'?'Approve Request':'Reject Request'}</button></div>
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
