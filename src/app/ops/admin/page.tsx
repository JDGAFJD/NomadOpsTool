"use client";

import { useEffect, useState, Fragment } from 'react';
import { useRouter } from 'next/navigation';
import {
  ShieldAlert, Server, UserPlus, Activity, Database,
  Loader2, ArrowLeft, Shield, User, Trash2, ChevronDown,
  ChevronUp, RefreshCw, Check, X as XIcon, TrendingUp, AlertCircle
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

type OpsUser = { id: number; email: string; role: string; created_at: string };
type ActivityLog = { id: number; agent_email: string; action_type: string; target: string | null; timestamp: string };
type Analytics = Record<string, Record<string, { searches: number; restores: string[]; suspends: string[]; signins: number }>>;
type EscalationRecord = {
  id: number; agent_email: string; escalation_type: string;
  customer_email: string | null; subscription_id: string | null;
  plan_id: string | null; iccid: string | null; network_state: string | null;
  agent_note: string | null; known_issue: string | null;
  created_at: string;
};
type EscalationStats = {
  byType: { escalation_type: string; count: string }[];
  byAgent: { agent_email: string; count: string }[];
  byDay: { day: string; escalation_type: string; count: string }[];
  total: string;
};
type VisitorLog = {
  id: number;
  ip: string | null; ip_forwarded: string | null; cf_ip: string | null; real_ip: string | null;
  geo_country: string | null; geo_region: string | null; geo_city: string | null;
  geo_isp: string | null; geo_org: string | null; geo_timezone: string | null;
  geo_mobile: boolean | null; geo_proxy: boolean | null; geo_hosting: boolean | null;
  geo_lat: number | null; geo_lon: number | null;
  user_agent: string | null; platform: string | null; browser_language: string | null;
  screen_width: number | null; screen_height: number | null;
  device_pixel_ratio: number | null;
  cpu_cores: number | null; device_memory: number | null; max_touch_points: number | null;
  timezone: string | null; webgl_vendor: string | null; webgl_renderer: string | null;
  canvas_hash: string | null; webrtc_ips: string | null;
  connection_effective: string | null; battery_level: number | null;
  referrer: string | null; page_url: string | null; source_label: string | null;
  client_lat: number | null; client_lon: number | null;
  captured_at: string;
};
type VisitorStats = { total: string; unique_ips: string; countries: string; vpn_count: string };

const ACTION_COLOR: Record<string, string> = {
  signin: '#3b82f6',
  search_unique_customer: '#e5e7eb',
  restore_customer: '#10b981',
  suspend_customer: '#ef4444',
};

const ACTION_LABEL: Record<string, string> = {
  signin: 'Signed In',
  search_unique_customer: 'Customer Lookup',
  restore_customer: 'Network Restored',
  suspend_customer: 'Network Suspended',
};

// ── Inline components ──────────────────────────────────────────────────────────

function Toast({ msg, type }: { msg: string; type: 'success' | 'error' }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: -12 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -12 }}
      style={{
        position: 'fixed', top: 80, right: 24, zIndex: 9999,
        background: type === 'success' ? 'rgba(16,185,129,0.15)' : 'rgba(239,68,68,0.15)',
        border: `1px solid ${type === 'success' ? '#10b981' : '#ef4444'}`,
        color: type === 'success' ? '#10b981' : '#ef4444',
        padding: '12px 20px', borderRadius: '12px', fontSize: '14px', fontWeight: 600,
        backdropFilter: 'blur(12px)', maxWidth: 380,
      }}
    >
      {type === 'success' ? <Check size={14} style={{ display: 'inline', marginRight: 8 }} /> : <XIcon size={14} style={{ display: 'inline', marginRight: 8 }} />}
      {msg}
    </motion.div>
  );
}

// ── Main Component ─────────────────────────────────────────────────────────────

export default function AdminControlPanel() {
  const router = useRouter();

  // Auth / loading
  const [loading, setLoading] = useState(true);
  const [accessDenied, setAccessDenied] = useState(false);

  // Toast
  const [toast, setToast] = useState<{ msg: string; type: 'success' | 'error' } | null>(null);

  // Active section tab
  const [activeSection, setActiveSection] = useState<'analytics' | 'users' | 'escalations' | 'visitors'>('analytics');

  // Analytics
  const [analytics, setAnalytics] = useState<Analytics | null>(null);
  const [rawLogs, setRawLogs] = useState<ActivityLog[]>([]);
  const [expandedLog, setExpandedLog] = useState<{ date: string; agent: string } | null>(null);

  // Escalations
  const [escalations, setEscalations] = useState<EscalationRecord[]>([]);
  const [escalationStats, setEscalationStats] = useState<EscalationStats | null>(null);

  // Visitor logs
  const [visitorLogs, setVisitorLogs] = useState<VisitorLog[]>([]);
  const [visitorStats, setVisitorStats] = useState<VisitorStats | null>(null);
  const [expandedVisitor, setExpandedVisitor] = useState<number | null>(null);

  // Users
  const [users, setUsers] = useState<OpsUser[]>([]);
  const [editingRoleId, setEditingRoleId] = useState<number | null>(null);
  const [pendingRole, setPendingRole] = useState<string>('');
  const [roleSaving, setRoleSaving] = useState(false);
  const [deletingId, setDeletingId] = useState<number | null>(null);

  // New user form
  const [newEmail, setNewEmail] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [newRole, setNewRole] = useState<'agent' | 'admin'>('agent');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const showToast = (msg: string, type: 'success' | 'error') => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 3500);
  };

  useEffect(() => { bootstrap(); }, []);

  const bootstrap = async () => {
    setLoading(true);
    try {
      const [logsRes, usersRes, escalationsRes, visitorsRes] = await Promise.all([
        fetch('/api/ops/admin/logs'),
        fetch('/api/ops/admin/users'),
        fetch('/api/ops/admin/escalations'),
        fetch('/api/ops/visitor-log'),
      ]);

      if (logsRes.status === 403 || logsRes.status === 401) {
        setAccessDenied(true);
        setTimeout(() => router.push('/ops/dashboard'), 3000);
        return;
      }

      const logsData = await logsRes.json();
      const usersData = await usersRes.json();
      const escalationsData = await escalationsRes.json();

      if (logsData.success) {
        setAnalytics(logsData.analytics);
        setRawLogs(logsData.rawLogs || []);
      }
      if (usersData.success) {
        setUsers(usersData.users || []);
      }
      if (!escalationsData.error) {
        setEscalations(escalationsData.escalations || []);
        setEscalationStats(escalationsData.stats || null);
      }
      const visitorsData = await visitorsRes.json().catch(() => ({}));
      if (!visitorsData.error) {
        setVisitorLogs(visitorsData.logs || []);
        setVisitorStats(visitorsData.stats || null);
      }
    } catch (err: any) {
      showToast(err.message || 'Bootstrap failure', 'error');
    } finally {
      setLoading(false);
    }
  };

  const handleAddAgent = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    try {
      const res = await fetch('/api/ops/admin/users', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: newEmail, password: newPassword, role: newRole }),
      });
      const data = await res.json();
      if (res.ok && data.success) {
        showToast(`Agent ${newEmail} provisioned successfully.`, 'success');
        setNewEmail(''); setNewPassword('');
        bootstrap();
      } else showToast(data.error || 'Failed to provision agent.', 'error');
    } finally { setIsSubmitting(false); }
  };

  const handleRoleSave = async (id: number) => {
    setRoleSaving(true);
    try {
      const res = await fetch('/api/ops/admin/users', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, role: pendingRole }),
      });
      const data = await res.json();
      if (res.ok && data.success) {
        showToast('Role updated successfully.', 'success');
        setEditingRoleId(null);
        bootstrap();
      } else showToast(data.error || 'Role update failed.', 'error');
    } finally { setRoleSaving(false); }
  };

  const handleDelete = async (id: number, email: string) => {
    if (!confirm(`Permanently remove ${email} from the system? This cannot be undone.`)) return;
    setDeletingId(id);
    try {
      const res = await fetch('/api/ops/admin/users', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id }),
      });
      const data = await res.json();
      if (res.ok && data.success) {
        showToast(`${email} has been removed.`, 'success');
        bootstrap();
      } else showToast(data.error || 'Deletion failed.', 'error');
    } finally { setDeletingId(null); }
  };

  // ── Render States ──────────────────────────────────────────────────────────

  if (loading) {
    return (
      <div style={{ minHeight: '100vh', background: '#050505', display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column', gap: 16 }}>
        <Loader2 color="#00b27a" size={48} style={{ animation: 'spin 1s linear infinite' }} />
        <span style={{ color: '#6b7280', fontSize: 14 }}>Authenticating admin session...</span>
      </div>
    );
  }

  if (accessDenied) {
    return (
      <div style={{ minHeight: '100vh', background: '#050505', color: 'white', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: 24 }}>
        <ShieldAlert color="#ef4444" size={64} style={{ marginBottom: 24 }} />
        <h1 style={{ fontSize: 32, fontWeight: 800, marginBottom: 16 }}>UNAUTHORIZED ACCESS</h1>
        <p style={{ color: '#9ca3af', fontSize: 18, textAlign: 'center', maxWidth: 500 }}>This panel requires Administrator clearance.</p>
        <p style={{ color: '#6b7280', marginTop: 24, fontSize: 14 }}>Rerouting to workspace...</p>
      </div>
    );
  }

  // ── Main Render ────────────────────────────────────────────────────────────

  return (
    <div style={{ minHeight: '100vh', backgroundColor: '#0a0a0a', color: 'white', fontFamily: "'Inter', system-ui, sans-serif" }}>

      {/* Toast */}
      <AnimatePresence>
        {toast && <Toast msg={toast.msg} type={toast.type} />}
      </AnimatePresence>

      {/* Header */}
      <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '20px 40px', borderBottom: '1px solid rgba(255,255,255,0.05)', backgroundColor: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(16px)', zIndex: 100, position: 'sticky', top: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <div style={{ display: 'flex', flexDirection: 'column', lineHeight: 1 }}>
            <div style={{ fontSize: 24, fontWeight: 800, letterSpacing: '-1px', display: 'flex', alignItems: 'center', gap: 2 }}>
              n<span style={{ color: '#3b82f6' }}>ō</span>mad
            </div>
            <div style={{ fontSize: 9, fontWeight: 600, letterSpacing: '4px', color: '#3b82f6', marginTop: 2 }}>ADMIN OPS</div>
          </div>
          <div style={{ height: 24, width: 1, background: 'rgba(255,255,255,0.1)', margin: '0 8px' }} />
          <h1 style={{ fontSize: 14, margin: 0, fontWeight: 600, color: '#9ca3af', display: 'flex', alignItems: 'center', gap: 6 }}>
            <Server size={14} /> CONTROL CENTER
          </h1>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <button onClick={bootstrap} style={{ background: 'transparent', border: '1px solid rgba(255,255,255,0.1)', color: '#9ca3af', padding: '8px 12px', borderRadius: 8, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6, fontSize: 13 }}>
            <RefreshCw size={14} /> Refresh
          </button>
          <button onClick={() => router.push('/ops/dashboard')} style={{ background: 'transparent', border: '1px solid rgba(255,255,255,0.2)', color: '#e5e7eb', padding: '8px 16px', borderRadius: 8, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 8, fontSize: 14 }}>
            <ArrowLeft size={16} /> Workspace
          </button>
        </div>
      </header>

      {/* Section Nav */}
      <div style={{ display: 'flex', gap: 0, padding: '0 40px', borderBottom: '1px solid rgba(255,255,255,0.05)', backgroundColor: 'rgba(0,0,0,0.3)' }}>
        {(['analytics', 'escalations', 'visitors', 'users'] as const).map(s => (
          <button
            key={s}
            onClick={() => setActiveSection(s)}
            style={{
              background: 'transparent', border: 'none', cursor: 'pointer',
              padding: '16px 24px', fontSize: 14, fontWeight: 600,
              color: activeSection === s ? 'white' : '#6b7280',
              borderBottom: activeSection === s ? '2px solid #3b82f6' : '2px solid transparent',
              transition: 'all 0.2s', display: 'flex', alignItems: 'center', gap: 8,
            }}
          >
            {s === 'analytics' ? <Activity size={14} /> : s === 'escalations' ? <ShieldAlert size={14} /> : s === 'visitors' ? <Database size={14} /> : <User size={14} />}
            {s === 'analytics' ? 'Activity Logs' : s === 'escalations' ? 'Escalations' : s === 'visitors' ? 'Visitor Logs' : 'Manage Users'}
          </button>
        ))}
      </div>

      <main style={{ padding: '40px', maxWidth: 1400, margin: '0 auto' }}>

        {/* ── ANALYTICS TAB ── */}
        <AnimatePresence mode="wait">
          {activeSection === 'analytics' && (
            <motion.div key="analytics" initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}>
              <div style={{ display: 'grid', gridTemplateColumns: 'minmax(340px, 1fr) 2fr', gap: 32 }}>

                {/* Provision form */}
                <div style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.06)', borderRadius: 24, padding: 32, height: 'fit-content' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 24 }}>
                    <div style={{ background: 'rgba(59,130,246,0.1)', padding: 12, borderRadius: 16 }}><UserPlus color="#3b82f6" size={20} /></div>
                    <div>
                      <h2 style={{ fontSize: 18, fontWeight: 700, margin: 0 }}>Provision Agent</h2>
                      <p style={{ color: '#9ca3af', margin: 0, fontSize: 13 }}>Inject credentials into Postgres</p>
                    </div>
                  </div>
                  <form onSubmit={handleAddAgent} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                    <div>
                      <label style={{ display: 'block', color: '#9ca3af', fontSize: 11, marginBottom: 6, fontWeight: 600, letterSpacing: '0.5px' }}>AGENT EMAIL</label>
                      <input type="email" required value={newEmail} onChange={e => setNewEmail(e.target.value)} style={{ width: '100%', background: 'rgba(0,0,0,0.5)', border: '1px solid rgba(255,255,255,0.1)', color: 'white', padding: '11px 14px', borderRadius: 8, outline: 'none', fontSize: 14, boxSizing: 'border-box' }} placeholder="agent@nomadinternet.com" />
                    </div>
                    <div>
                      <label style={{ display: 'block', color: '#9ca3af', fontSize: 11, marginBottom: 6, fontWeight: 600, letterSpacing: '0.5px' }}>PASSWORD</label>
                      <input type="password" required value={newPassword} onChange={e => setNewPassword(e.target.value)} style={{ width: '100%', background: 'rgba(0,0,0,0.5)', border: '1px solid rgba(255,255,255,0.1)', color: 'white', padding: '11px 14px', borderRadius: 8, outline: 'none', fontSize: 14, boxSizing: 'border-box' }} placeholder="••••••••" />
                    </div>
                    <div>
                      <label style={{ display: 'block', color: '#9ca3af', fontSize: 11, marginBottom: 6, fontWeight: 600, letterSpacing: '0.5px' }}>CLEARANCE ROLE</label>
                      <select value={newRole} onChange={e => setNewRole(e.target.value as any)} style={{ width: '100%', background: 'rgba(0,0,0,0.8)', border: '1px solid rgba(255,255,255,0.1)', color: 'white', padding: '11px 14px', borderRadius: 8, outline: 'none', fontSize: 14, boxSizing: 'border-box' }}>
                        <option value="agent">Standard Operations Agent</option>
                        <option value="admin">System Administrator</option>
                      </select>
                    </div>
                    <button disabled={isSubmitting} type="submit" style={{ background: 'linear-gradient(135deg, #3b82f6, #2563eb)', color: 'white', border: 'none', padding: 14, borderRadius: 8, fontWeight: 700, cursor: isSubmitting ? 'not-allowed' : 'pointer', opacity: isSubmitting ? 0.7 : 1, display: 'flex', justifyContent: 'center', alignItems: 'center', gap: 8, fontSize: 14, marginTop: 4 }}>
                      {isSubmitting ? <Loader2 size={16} style={{ animation: 'spin 1s linear infinite' }} /> : <><UserPlus size={16} /> CREATE IDENTIFIER</>}
                    </button>
                  </form>
                </div>

                {/* Daily analytics */}
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 28 }}>
                    <div style={{ background: 'rgba(16,185,129,0.1)', padding: 12, borderRadius: 16 }}><Activity color="#10b981" size={20} /></div>
                    <div>
                      <h2 style={{ fontSize: 18, fontWeight: 700, margin: 0 }}>Agent Activity Log</h2>
                      <p style={{ color: '#9ca3af', margin: 0, fontSize: 13 }}>Click any row to expand the full chronological trace</p>
                    </div>
                  </div>

                  {analytics && Object.keys(analytics).sort((a, b) => new Date(b).getTime() - new Date(a).getTime()).map(date => (
                    <div key={date} style={{ marginBottom: 36 }}>
                      <div style={{ fontSize: 13, fontWeight: 700, color: '#3b82f6', marginBottom: 14, display: 'flex', alignItems: 'center', gap: 8 }}>
                        <div style={{ height: 1, flex: 1, background: 'rgba(59,130,246,0.2)' }} />
                        {new Date(date).toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}
                        <div style={{ height: 1, flex: 1, background: 'rgba(59,130,246,0.2)' }} />
                      </div>

                      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                        {Object.entries(analytics[date]).map(([agent, stats]) => {
                          const isOpen = expandedLog?.date === date && expandedLog?.agent === agent;
                          const agentLogs = rawLogs
                            .filter(l => new Date(l.timestamp).toISOString().split('T')[0] === date && l.agent_email === agent)
                            .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());

                          return (
                            <div key={agent} style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.06)', borderRadius: 16, overflow: 'hidden' }}>
                              {/* Summary Row */}
                              <div
                                onClick={() => setExpandedLog(isOpen ? null : { date, agent })}
                                style={{ padding: '18px 24px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', cursor: 'pointer', transition: 'background 0.15s' }}
                                onMouseOver={e => (e.currentTarget.style.background = 'rgba(255,255,255,0.04)')}
                                onMouseOut={e => (e.currentTarget.style.background = 'transparent')}
                              >
                                <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                                  <div style={{ width: 36, height: 36, borderRadius: '50%', background: 'rgba(59,130,246,0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                    <User size={16} color="#3b82f6" />
                                  </div>
                                  <div>
                                    <div style={{ fontWeight: 600, fontSize: 15 }}>{agent}</div>
                                    <div style={{ color: '#6b7280', fontSize: 12, marginTop: 2 }}>{stats.signins} sign-in{stats.signins !== 1 ? 's' : ''} · {agentLogs.length} total events</div>
                                  </div>
                                </div>

                                <div style={{ display: 'flex', alignItems: 'center', gap: 24 }}>
                                  <div style={{ textAlign: 'center' }}>
                                    <div style={{ fontSize: 22, fontWeight: 800 }}>{stats.searches}</div>
                                    <div style={{ fontSize: 10, color: '#9ca3af', textTransform: 'uppercase', letterSpacing: '0.8px' }}>Lookups</div>
                                  </div>
                                  <div style={{ textAlign: 'center' }}>
                                    <div style={{ fontSize: 22, fontWeight: 800, color: '#10b981' }}>{stats.restores.length}</div>
                                    <div style={{ fontSize: 10, color: '#10b981', textTransform: 'uppercase', letterSpacing: '0.8px' }}>Restores</div>
                                  </div>
                                  <div style={{ textAlign: 'center' }}>
                                    <div style={{ fontSize: 22, fontWeight: 800, color: '#ef4444' }}>{stats.suspends.length}</div>
                                    <div style={{ fontSize: 10, color: '#ef4444', textTransform: 'uppercase', letterSpacing: '0.8px' }}>Suspends</div>
                                  </div>
                                  <div style={{ color: '#6b7280', marginLeft: 8 }}>
                                    {isOpen ? <ChevronUp size={18} /> : <ChevronDown size={18} />}
                                  </div>
                                </div>
                              </div>

                              {/* Expandable Log Drawer */}
                              <AnimatePresence>
                                {isOpen && (
                                  <motion.div
                                    initial={{ height: 0, opacity: 0 }}
                                    animate={{ height: 'auto', opacity: 1 }}
                                    exit={{ height: 0, opacity: 0 }}
                                    transition={{ duration: 0.22 }}
                                    style={{ overflow: 'hidden' }}
                                  >
                                    <div style={{ padding: '4px 24px 24px 24px' }}>
                                      <div style={{ borderTop: '1px solid rgba(255,255,255,0.05)', paddingTop: 16, marginBottom: 12, fontSize: 11, color: '#6b7280', fontWeight: 700, letterSpacing: '1px', textTransform: 'uppercase' }}>
                                        Chronological Security Trace
                                      </div>
                                      <div style={{ background: 'rgba(0,0,0,0.4)', borderRadius: 12, padding: 16, display: 'flex', flexDirection: 'column', gap: 6 }}>
                                        {agentLogs.length === 0 && (
                                          <div style={{ color: '#6b7280', fontSize: 13, textAlign: 'center', padding: 16 }}>No log entries found for this period.</div>
                                        )}
                                        {agentLogs.map(log => {
                                          const ts = new Date(log.timestamp);
                                          const dateStr = ts.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
                                          const timeStr = ts.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
                                          const color = ACTION_COLOR[log.action_type] || '#e5e7eb';
                                          const label = ACTION_LABEL[log.action_type] || log.action_type.replace(/_/g, ' ').toUpperCase();

                                          return (
                                            <div key={log.id} style={{ display: 'flex', alignItems: 'center', gap: 16, padding: '8px 12px', borderRadius: 8, background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.03)' }}>
                                              {/* Dot indicator */}
                                              <div style={{ width: 8, height: 8, borderRadius: '50%', background: color, flexShrink: 0, boxShadow: `0 0 6px ${color}` }} />
                                              {/* Timestamp */}
                                              <div style={{ color: '#6b7280', fontSize: 12, fontFamily: 'monospace', width: 130, flexShrink: 0 }}>
                                                {dateStr} · {timeStr}
                                              </div>
                                              {/* Label */}
                                              <div style={{ color, fontWeight: 600, fontSize: 13, width: 150, flexShrink: 0 }}>{label}</div>
                                              {/* Target */}
                                              {log.target && (
                                                <div style={{ color: '#9ca3af', fontSize: 12, flex: 1 }}>
                                                  <span style={{ color: '#6b7280' }}>Target: </span>
                                                  <span style={{ fontFamily: 'monospace', color: 'white' }}>{log.target}</span>
                                                </div>
                                              )}
                                            </div>
                                          );
                                        })}
                                      </div>
                                    </div>
                                  </motion.div>
                                )}
                              </AnimatePresence>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  ))}

                  {analytics && Object.keys(analytics).length === 0 && (
                    <div style={{ color: '#6b7280', textAlign: 'center', padding: '60px 0', fontSize: 14 }}>
                      <Database size={32} style={{ margin: '0 auto 12px', display: 'block' }} />
                      No activity recorded in the last 30 days.
                    </div>
                  )}
                </div>
              </div>
            </motion.div>
          )}

          {/* ── ESCALATIONS TAB ── */}
          {activeSection === 'escalations' && (
            <motion.div key="escalations" initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}>
              <div style={{ display: 'grid', gridTemplateColumns: 'minmax(340px, 1fr) 2fr', gap: 32 }}>
                
                {/* Stats Summary */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
                  <div style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.06)', borderRadius: 24, padding: 24 }}>
                    <div style={{ fontSize: 13, color: '#9ca3af', marginBottom: 16, fontWeight: 600, letterSpacing: '0.5px' }}>TOTAL ESCALATIONS</div>
                    <div style={{ fontSize: 48, fontWeight: 800 }}>{escalationStats?.total || 0}</div>
                  </div>

                  <div style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.06)', borderRadius: 24, padding: 24 }}>
                    <div style={{ fontSize: 13, color: '#9ca3af', marginBottom: 16, fontWeight: 600, letterSpacing: '0.5px' }}>BY ISSUE TYPE</div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                      {escalationStats?.byType.map(t => (
                        <div key={t.escalation_type} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                          <span style={{ fontSize: 14, color: '#e5e7eb', textTransform: 'capitalize' }}>{t.escalation_type.replace(/_/g, ' ')}</span>
                          <span style={{ background: 'rgba(255,255,255,0.05)', padding: '2px 10px', borderRadius: 8, fontSize: 12, fontWeight: 700 }}>{t.count}</span>
                        </div>
                      ))}
                    </div>
                  </div>

                  <div style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.06)', borderRadius: 24, padding: 24 }}>
                    <div style={{ fontSize: 13, color: '#9ca3af', marginBottom: 16, fontWeight: 600, letterSpacing: '0.5px' }}>TOP AGENTS</div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                      {escalationStats?.byAgent.map(a => (
                        <div key={a.agent_email} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                          <span style={{ fontSize: 14, color: '#e5e7eb', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: '160px' }}>{a.agent_email}</span>
                          <span style={{ background: '#3b82f633', color: '#3b82f6', padding: '2px 10px', borderRadius: 8, fontSize: 12, fontWeight: 700 }}>{a.count}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>

                {/* Log Table */}
                <div style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.06)', borderRadius: 24, padding: 0, overflow: 'hidden' }}>
                  <div style={{ padding: '24px 32px', borderBottom: '1px solid rgba(255,255,255,0.05)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <h3 style={{ fontSize: 18, fontWeight: 700, margin: 0 }}>Recent Escalations</h3>
                  </div>
                  <div style={{ overflowX: 'auto' }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                      <thead>
                        <tr style={{ textAlign: 'left', borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
                          <th style={{ padding: '16px 32px', fontSize: 12, color: '#9ca3af', fontWeight: 600 }}>AGENT</th>
                          <th style={{ padding: '16px 32px', fontSize: 12, color: '#9ca3af', fontWeight: 600 }}>TYPE</th>
                          <th style={{ padding: '16px 32px', fontSize: 12, color: '#9ca3af', fontWeight: 600 }}>CUSTOMER</th>
                          <th style={{ padding: '16px 32px', fontSize: 12, color: '#9ca3af', fontWeight: 600 }}>DATE</th>
                        </tr>
                      </thead>
                      <tbody>
                        {escalations.map(e => (
                          <tr key={e.id} style={{ borderBottom: '1px solid rgba(255,255,255,0.03)' }}>
                            <td style={{ padding: '16px 32px', fontSize: 14, fontWeight: 500 }}>{e.agent_email}</td>
                            <td style={{ padding: '16px 32px' }}>
                              <span style={{ 
                                padding: '4px 10px', borderRadius: 6, fontSize: 11, fontWeight: 700, textTransform: 'uppercase',
                                background: e.escalation_type === 'line_issue' ? '#ef444422' : '#3b82f622',
                                color: e.escalation_type === 'line_issue' ? '#ef4444' : '#3b82f6'
                              }}>
                                {e.escalation_type.replace(/_/g, ' ')}
                              </span>
                            </td>
                            <td style={{ padding: '16px 32px', fontSize: 14, color: '#9ca3af' }}>{e.customer_email || '—'}</td>
                            <td style={{ padding: '16px 32px', fontSize: 13, color: '#6b7280' }}>
                              {new Date(e.created_at).toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>
            </motion.div>
          )}

          {/* ── VISITORS TAB ── */}
          {activeSection === 'visitors' && (
            <motion.div key="visitors" initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
                
                {/* Visitor Stats */}
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 24 }}>
                  <div style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.06)', borderRadius: 20, padding: 24 }}>
                    <div style={{ color: '#9ca3af', fontSize: 12, fontWeight: 600, letterSpacing: '0.5px', marginBottom: 8 }}>TOTAL CAPTURES</div>
                    <div style={{ fontSize: 32, fontWeight: 800 }}>{visitorStats?.total || 0}</div>
                  </div>
                  <div style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.06)', borderRadius: 20, padding: 24 }}>
                    <div style={{ color: '#9ca3af', fontSize: 12, fontWeight: 600, letterSpacing: '0.5px', marginBottom: 8 }}>UNIQUE IPs</div>
                    <div style={{ fontSize: 32, fontWeight: 800 }}>{visitorStats?.unique_ips || 0}</div>
                  </div>
                  <div style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.06)', borderRadius: 20, padding: 24 }}>
                    <div style={{ color: '#9ca3af', fontSize: 12, fontWeight: 600, letterSpacing: '0.5px', marginBottom: 8 }}>COUNTRIES</div>
                    <div style={{ fontSize: 32, fontWeight: 800 }}>{visitorStats?.countries || 0}</div>
                  </div>
                  <div style={{ background: 'rgba(239,68,68,0.05)', border: '1px solid rgba(239,68,68,0.1)', borderRadius: 20, padding: 24 }}>
                    <div style={{ color: '#ef4444', fontSize: 12, fontWeight: 600, letterSpacing: '0.5px', marginBottom: 8 }}>VPN / PROXY DETECTED</div>
                    <div style={{ fontSize: 32, fontWeight: 800, color: '#ef4444' }}>{visitorStats?.vpn_count || 0}</div>
                  </div>
                </div>

                {/* Visitor Log Table */}
                <div style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.06)', borderRadius: 24, overflow: 'hidden' }}>
                  <div style={{ padding: '24px 32px', borderBottom: '1px solid rgba(255,255,255,0.05)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <h3 style={{ fontSize: 18, fontWeight: 700, margin: 0 }}>Fingerprint Forensics</h3>
                  </div>
                  <div style={{ overflowX: 'auto' }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                      <thead>
                        <tr style={{ textAlign: 'left', borderBottom: '1px solid rgba(255,255,255,0.05)', background: 'rgba(255,255,255,0.01)' }}>
                          <th style={{ padding: '16px 24px', fontSize: 12, color: '#9ca3af' }}>IP / LOCATION</th>
                          <th style={{ padding: '16px 24px', fontSize: 12, color: '#9ca3af' }}>ISP / ORG</th>
                          <th style={{ padding: '16px 24px', fontSize: 12, color: '#9ca3af' }}>DEVICE / OS</th>
                          <th style={{ padding: '16px 24px', fontSize: 12, color: '#9ca3af' }}>TIME</th>
                          <th style={{ padding: '16px 24px', fontSize: 12, color: '#9ca3af' }}></th>
                        </tr>
                      </thead>
                      <tbody>
                        {visitorLogs.map(log => (
                          <Fragment key={log.id}>
                            <tr style={{ borderBottom: '1px solid rgba(255,255,255,0.03)', cursor: 'pointer' }} onClick={() => setExpandedVisitor(expandedVisitor === log.id ? null : log.id)}>
                              <td style={{ padding: '16px 24px' }}>
                                <div style={{ fontWeight: 700, color: log.geo_proxy ? '#ef4444' : 'white', display: 'flex', alignItems: 'center', gap: 6 }}>
                                  {log.ip} {log.geo_proxy && <AlertCircle size={14} />}
                                </div>
                                <div style={{ fontSize: 12, color: '#6b7280' }}>
                                  {log.geo_city}, {log.geo_region}, {log.geo_country}
                                </div>
                              </td>
                              <td style={{ padding: '16px 24px' }}>
                                <div style={{ fontSize: 13, fontWeight: 500 }}>{log.geo_isp}</div>
                                <div style={{ fontSize: 11, color: '#6b7280' }}>{log.geo_org}</div>
                              </td>
                              <td style={{ padding: '16px 24px' }}>
                                <div style={{ fontSize: 13 }}>{log.platform}</div>
                                <div style={{ fontSize: 11, color: '#6b7280', maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                  {log.user_agent}
                                </div>
                              </td>
                              <td style={{ padding: '16px 24px', fontSize: 13, color: '#6b7280' }}>
                                {new Date(log.captured_at).toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                              </td>
                              <td style={{ padding: '16px 24px', textAlign: 'right' }}>
                                {expandedVisitor === log.id ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                              </td>
                            </tr>
                            {expandedVisitor === log.id && (
                              <tr>
                                <td colSpan={5} style={{ background: 'rgba(0,0,0,0.3)', padding: '24px 32px', borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
                                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))', gap: 24 }}>
                                    <div>
                                      <div style={{ fontSize: 11, fontWeight: 700, color: '#3b82f6', marginBottom: 12, textTransform: 'uppercase' }}>HARDWARE & SCREEN</div>
                                      <div style={{ display: 'flex', flexDirection: 'column', gap: 8, fontSize: 13 }}>
                                        <div style={{ display: 'flex', justifyContent: 'space-between' }}><span>Resolution</span> <span style={{ color: '#9ca3af' }}>{log.screen_width}x{log.screen_height} (@{log.device_pixel_ratio}x)</span></div>
                                        <div style={{ display: 'flex', justifyContent: 'space-between' }}><span>CPU Cores</span> <span style={{ color: '#9ca3af' }}>{log.cpu_cores}</span></div>
                                        <div style={{ display: 'flex', justifyContent: 'space-between' }}><span>Memory</span> <span style={{ color: '#9ca3af' }}>{log.device_memory} GB</span></div>
                                        <div style={{ display: 'flex', justifyContent: 'space-between' }}><span>Battery</span> <span style={{ color: '#9ca3af' }}>{log.battery_level ? Math.round(log.battery_level * 100) + '%' : 'N/A'}</span></div>
                                      </div>
                                    </div>
                                    <div>
                                      <div style={{ fontSize: 11, fontWeight: 700, color: '#10b981', marginBottom: 12, textTransform: 'uppercase' }}>FINGERPRINTING</div>
                                      <div style={{ display: 'flex', flexDirection: 'column', gap: 8, fontSize: 13 }}>
                                        <div style={{ display: 'flex', justifyContent: 'space-between' }}><span>Canvas Hash</span> <span style={{ color: '#9ca3af', fontFamily: 'monospace' }}>{log.canvas_hash}</span></div>
                                        <div style={{ display: 'flex', justifyContent: 'space-between' }}><span>WebGL Vendor</span> <span style={{ color: '#9ca3af', fontSize: 11 }}>{log.webgl_vendor}</span></div>
                                        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10 }}><span>WebRTC IPs</span> <span style={{ color: '#9ca3af', fontSize: 11, textAlign: 'right' }}>{log.webrtc_ips}</span></div>
                                      </div>
                                    </div>
                                    <div>
                                      <div style={{ fontSize: 11, fontWeight: 700, color: '#f59e0b', marginBottom: 12, textTransform: 'uppercase' }}>CONTEXT</div>
                                      <div style={{ display: 'flex', flexDirection: 'column', gap: 8, fontSize: 13 }}>
                                        <div style={{ display: 'flex', justifyContent: 'space-between' }}><span>Referrer</span> <span style={{ color: '#9ca3af', fontSize: 11, maxWidth: 150, overflow: 'hidden', textOverflow: 'ellipsis' }}>{log.referrer || 'None'}</span></div>
                                        <div style={{ display: 'flex', justifyContent: 'space-between' }}><span>Timezone</span> <span style={{ color: '#9ca3af' }}>{log.timezone}</span></div>
                                        <div style={{ display: 'flex', justifyContent: 'space-between' }}><span>Language</span> <span style={{ color: '#9ca3af' }}>{log.browser_language}</span></div>
                                      </div>
                                    </div>
                                    {log.client_lat && (
                                      <div>
                                        <div style={{ fontSize: 11, fontWeight: 700, color: '#ef4444', marginBottom: 12, textTransform: 'uppercase' }}>GPS LOCATION (PRECISE)</div>
                                        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, fontSize: 13 }}>
                                          <div style={{ display: 'flex', justifyContent: 'space-between' }}><span>Latitude</span> <span style={{ color: 'white' }}>{log.client_lat}</span></div>
                                          <div style={{ display: 'flex', justifyContent: 'space-between' }}><span>Longitude</span> <span style={{ color: 'white' }}>{log.client_lon}</span></div>
                                          <a 
                                            href={`https://www.google.com/maps?q=${log.client_lat},${log.client_lon}`} 
                                            target="_blank" 
                                            rel="noopener noreferrer"
                                            style={{ color: '#3b82f6', textDecoration: 'none', fontSize: 12, fontWeight: 600, marginTop: 8, display: 'block' }}
                                          >
                                            View on Google Maps →
                                          </a>
                                        </div>
                                      </div>
                                    )}
                                  </div>
                                </td>
                              </tr>
                            )}
                          </Fragment>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>
            </motion.div>
          )}

          {/* ── USERS TAB ── */}

          {activeSection === 'users' && (
            <motion.div key="users" initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}>
              <div style={{ display: 'grid', gridTemplateColumns: 'minmax(340px, 1fr) 2fr', gap: 32 }}>

                {/* Provision form (same, reused) */}
                <div style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.06)', borderRadius: 24, padding: 32, height: 'fit-content' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 24 }}>
                    <div style={{ background: 'rgba(59,130,246,0.1)', padding: 12, borderRadius: 16 }}><UserPlus color="#3b82f6" size={20} /></div>
                    <div>
                      <h2 style={{ fontSize: 18, fontWeight: 700, margin: 0 }}>Provision Agent</h2>
                      <p style={{ color: '#9ca3af', margin: 0, fontSize: 13 }}>Inject credentials into Postgres</p>
                    </div>
                  </div>
                  <form onSubmit={handleAddAgent} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                    <div>
                      <label style={{ display: 'block', color: '#9ca3af', fontSize: 11, marginBottom: 6, fontWeight: 600, letterSpacing: '0.5px' }}>AGENT EMAIL</label>
                      <input type="email" required value={newEmail} onChange={e => setNewEmail(e.target.value)} style={{ width: '100%', background: 'rgba(0,0,0,0.5)', border: '1px solid rgba(255,255,255,0.1)', color: 'white', padding: '11px 14px', borderRadius: 8, outline: 'none', fontSize: 14, boxSizing: 'border-box' }} placeholder="agent@nomadinternet.com" />
                    </div>
                    <div>
                      <label style={{ display: 'block', color: '#9ca3af', fontSize: 11, marginBottom: 6, fontWeight: 600, letterSpacing: '0.5px' }}>PASSWORD</label>
                      <input type="password" required value={newPassword} onChange={e => setNewPassword(e.target.value)} style={{ width: '100%', background: 'rgba(0,0,0,0.5)', border: '1px solid rgba(255,255,255,0.1)', color: 'white', padding: '11px 14px', borderRadius: 8, outline: 'none', fontSize: 14, boxSizing: 'border-box' }} placeholder="••••••••" />
                    </div>
                    <div>
                      <label style={{ display: 'block', color: '#9ca3af', fontSize: 11, marginBottom: 6, fontWeight: 600, letterSpacing: '0.5px' }}>CLEARANCE ROLE</label>
                      <select value={newRole} onChange={e => setNewRole(e.target.value as any)} style={{ width: '100%', background: 'rgba(0,0,0,0.8)', border: '1px solid rgba(255,255,255,0.1)', color: 'white', padding: '11px 14px', borderRadius: 8, outline: 'none', fontSize: 14, boxSizing: 'border-box' }}>
                        <option value="agent">Standard Operations Agent</option>
                        <option value="admin">System Administrator</option>
                      </select>
                    </div>
                    <button disabled={isSubmitting} type="submit" style={{ background: 'linear-gradient(135deg, #3b82f6, #2563eb)', color: 'white', border: 'none', padding: 14, borderRadius: 8, fontWeight: 700, cursor: isSubmitting ? 'not-allowed' : 'pointer', opacity: isSubmitting ? 0.7 : 1, display: 'flex', justifyContent: 'center', alignItems: 'center', gap: 8, fontSize: 14, marginTop: 4 }}>
                      {isSubmitting ? <Loader2 size={16} style={{ animation: 'spin 1s linear infinite' }} /> : <><UserPlus size={16} /> CREATE IDENTIFIER</>}
                    </button>
                  </form>
                </div>

                {/* User roster */}
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 28 }}>
                    <div style={{ background: 'rgba(168,85,247,0.1)', padding: 12, borderRadius: 16 }}><Shield color="#a855f7" size={20} /></div>
                    <div>
                      <h2 style={{ fontSize: 18, fontWeight: 700, margin: 0 }}>System Access Control</h2>
                      <p style={{ color: '#9ca3af', margin: 0, fontSize: 13 }}>Manage agent permissions and revoke system access</p>
                    </div>
                  </div>

                  <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                    {users.map(u => {
                      const isEditing = editingRoleId === u.id;
                      const isDeleting = deletingId === u.id;
                      const joinDate = new Date(u.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });

                      return (
                        <motion.div key={u.id} layout style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.06)', borderRadius: 16, padding: '18px 24px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 24 }}>
                          {/* Identity */}
                          <div style={{ display: 'flex', alignItems: 'center', gap: 14, flex: 1, minWidth: 0 }}>
                            <div style={{ width: 40, height: 40, borderRadius: '50%', background: u.role === 'admin' ? 'rgba(168,85,247,0.15)' : 'rgba(59,130,246,0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                              {u.role === 'admin' ? <Shield size={18} color="#a855f7" /> : <User size={18} color="#3b82f6" />}
                            </div>
                            <div style={{ minWidth: 0 }}>
                              <div style={{ fontWeight: 600, fontSize: 15, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{u.email}</div>
                              <div style={{ color: '#6b7280', fontSize: 12, marginTop: 2 }}>Provisioned {joinDate}</div>
                            </div>
                          </div>

                          {/* Role badge / editor */}
                          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                            {isEditing ? (
                              <>
                                <select
                                  value={pendingRole}
                                  onChange={e => setPendingRole(e.target.value)}
                                  style={{ background: 'rgba(0,0,0,0.8)', border: '1px solid rgba(255,255,255,0.15)', color: 'white', padding: '7px 12px', borderRadius: 8, outline: 'none', fontSize: 13 }}
                                >
                                  <option value="agent">Agent</option>
                                  <option value="admin">Admin</option>
                                </select>
                                <button onClick={() => handleRoleSave(u.id)} disabled={roleSaving} style={{ background: '#10b981', border: 'none', color: 'white', padding: '7px 14px', borderRadius: 8, cursor: 'pointer', fontWeight: 600, fontSize: 13, display: 'flex', alignItems: 'center', gap: 6 }}>
                                  {roleSaving ? <Loader2 size={14} style={{ animation: 'spin 1s linear infinite' }} /> : <><Check size={14} /> Save</>}
                                </button>
                                <button onClick={() => setEditingRoleId(null)} style={{ background: 'transparent', border: '1px solid rgba(255,255,255,0.1)', color: '#9ca3af', padding: '7px 12px', borderRadius: 8, cursor: 'pointer', fontSize: 13, display: 'flex', alignItems: 'center' }}>
                                  <XIcon size={14} />
                                </button>
                              </>
                            ) : (
                              <>
                                <span style={{ padding: '5px 12px', borderRadius: 20, fontSize: 12, fontWeight: 700, background: u.role === 'admin' ? 'rgba(168,85,247,0.15)' : 'rgba(59,130,246,0.1)', color: u.role === 'admin' ? '#a855f7' : '#3b82f6', border: `1px solid ${u.role === 'admin' ? 'rgba(168,85,247,0.3)' : 'rgba(59,130,246,0.2)'}`, letterSpacing: '0.5px', textTransform: 'uppercase' }}>
                                  {u.role}
                                </span>
                                <button
                                  onClick={() => { setEditingRoleId(u.id); setPendingRole(u.role); }}
                                  style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)', color: '#9ca3af', padding: '7px 14px', borderRadius: 8, cursor: 'pointer', fontSize: 13, fontWeight: 500 }}
                                >
                                  Edit Role
                                </button>
                                <button
                                  onClick={() => handleDelete(u.id, u.email)}
                                  disabled={isDeleting}
                                  style={{ background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.2)', color: '#ef4444', padding: '7px 12px', borderRadius: 8, cursor: isDeleting ? 'not-allowed' : 'pointer', display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, opacity: isDeleting ? 0.6 : 1 }}
                                >
                                  {isDeleting ? <Loader2 size={14} style={{ animation: 'spin 1s linear infinite' }} /> : <Trash2 size={14} />}
                                </button>
                              </>
                            )}
                          </div>
                        </motion.div>
                      );
                    })}
                  </div>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </main>
    </div>
  );
}
