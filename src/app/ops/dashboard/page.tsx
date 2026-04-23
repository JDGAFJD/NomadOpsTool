"use client";

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { LogOut, ShieldCheck, Loader2, Search, Package, Zap, CreditCard, Activity, ArrowRight, DollarSign, Calendar, Play, Pause, AlertCircle, Copy, RefreshCw, X, AlertTriangle, ShieldAlert, Check, Info, BarChart2 } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts';

const PROBLEM_SKUS = [
  '52904x48526x54307x73578x76193',
  '4G FWA BACKUP ROUTER MBB PLAN 1GB ACCT SHR block text',
  '4G FWA BACKUP ROUTER MBB PLAN 1GB ACCT SHR',
  '64186x48526x54307x75803x84777',
  '64186x48526x54307x73578x76193',
  '64186x48526x75803x84777',
  '64186x48526x73578x76193',
  '64186x48526x84777',
  '64186x48526x54307x90274',
  'FWA 25MBPS 50GB DPR 300GB DTL 600KBPS',
  '61607x48526x54307x84777',
  '50945x48526x54307x75802x84777',
  '50945x48526x54307x75803x84777',
  'FWA PRIMARY MBB 25MBPS',
  '59142x48526x90274',
  '59142x48526x76193x87826',
  'M2M_CPN',
  '59145x48526x76193x87826'
];

const GOOD_SKUS = [
  '59142x48526x84777',
  'M2MPublicStatic',
  'Static 5G Bus Internet 100MBPS',
  '59145x48526x84777'
];

export default function OpsDashboard() {
  const router = useRouter();
  const [loggingOut, setLoggingOut] = useState(false);
  const [tabs, setTabs] = useState<{ id: string; title: string, isError: boolean }[]>([{ id: '1', title: 'New Search', isError: false }]);
  const [activeTabId, setActiveTabId] = useState('1');

  const handleLogout = async () => {
    setLoggingOut(true);
    await fetch('/api/ops/logout', { method: 'POST' });
    router.push('/ops');
  };

  const handleCreateTab = () => {
    const newId = Date.now().toString();
    setTabs(prev => [...prev, { id: newId, title: 'New Search', isError: false }]);
    setActiveTabId(newId);
  };

  const handleCloseTab = (e: React.MouseEvent, targetId: string) => {
    e.stopPropagation();
    setTabs(prev => {
      const remaining = prev.filter(t => t.id !== targetId);
      if (remaining.length === 0) {
        const fallbackId = Date.now().toString();
        setActiveTabId(fallbackId);
        return [{ id: fallbackId, title: 'New Search', isError: false }];
      }
      if (activeTabId === targetId) setActiveTabId(remaining[remaining.length - 1].id);
      return remaining;
    });
  };

  const updateTabTitle = (targetId: string, newTitle: string, isError = false) => {
    setTabs(prev => prev.map(t => t.id === targetId ? { ...t, title: newTitle, isError } : t));
  };

  return (
    <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column', backgroundColor: '#0a0a0a', color: 'white', fontFamily: 'system-ui, sans-serif' }}>
      {/* Global Header */}
      <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '16px 40px', borderBottom: '1px solid rgba(255,255,255,0.05)', backgroundColor: 'rgba(0,0,0,0.5)', backdropFilter: 'blur(10px)', zIndex: 100 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start', lineHeight: 1 }}>
             <div style={{ fontSize: '22px', fontWeight: 800, letterSpacing: '-1px', color: 'white', display: 'flex', alignItems: 'center', gap: '4px' }}>
                n<span style={{ position: 'relative', display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}><span style={{ color: '#00b27a' }}>ō</span></span>mad
             </div>
             <div style={{ fontSize: '9px', fontWeight: 500, letterSpacing: '4px', color: '#00b27a', marginLeft: '2px', marginTop: '2px' }}>
                I N T E R N E T
             </div>
          </div>
          <div style={{ height: '20px', width: '1px', background: 'rgba(255,255,255,0.1)', margin: '0 12px' }} />
          <h1 style={{ fontSize: '14px', margin: 0, fontWeight: 600, color: '#9ca3af' }}>NOC <span style={{ color: '#6b7280' }}>Ecosystem</span></h1>
        </div>
        
        {/* Tab Strip Navigation */}
        <div style={{ flex: 1, margin: '0 40px', display: 'flex', gap: '8px', overflowX: 'auto', paddingBottom: '4px' }}>
          {tabs.map(tab => (
            <div 
              key={tab.id}
              onClick={() => setActiveTabId(tab.id)}
              style={{
                display: 'flex', alignItems: 'center', gap: '8px', padding: '8px 16px', borderRadius: '12px',
                background: activeTabId === tab.id ? 'rgba(0, 178, 122, 0.15)' : 'rgba(255,255,255,0.03)',
                border: `1px solid ${activeTabId === tab.id ? 'rgba(0, 178, 122, 0.4)' : 'rgba(255,255,255,0.05)'}`,
                cursor: 'pointer',
                transition: 'all 0.2s',
                minWidth: '150px',
                maxWidth: '220px'
              }}
            >
              <Activity size={14} color={activeTabId === tab.id ? '#00b27a' : '#6b7280'} />
              <div style={{ flex: 1, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', fontSize: '13px', color: activeTabId === tab.id ? 'white' : '#9ca3af', fontWeight: activeTabId === tab.id ? 600 : 400 }}>
                {tab.title}
              </div>
              <button onClick={(e) => handleCloseTab(e, tab.id)} style={{ background: 'transparent', border: 'none', color: '#9ca3af', padding: '2px', cursor: 'pointer', borderRadius: '4px', display: 'flex' }}>
                <X size={12} />
              </button>
            </div>
          ))}
          <button onClick={handleCreateTab} style={{ background: 'transparent', border: '1px dashed rgba(255,255,255,0.2)', color: '#9ca3af', borderRadius: '12px', padding: '0 16px', cursor: 'pointer', display: 'flex', alignItems: 'center', transition: 'all 0.2s' }}>
            +
          </button>
        </div>

        <button 
          onClick={handleLogout}
          disabled={loggingOut}
          style={{ background: 'transparent', border: '1px solid rgba(255, 255, 255, 0.2)', color: '#e5e7eb', padding: '8px 16px', borderRadius: '8px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '8px', fontSize: '14px' }}
        >
          {loggingOut ? <Loader2 size={16} className="animate-spin" /> : <LogOut size={16} />} Disconnect
        </button>
      </header>
      
      {/* Workspace Containers Layered securely using shadow DOM principles */}
      <div style={{ flex: 1, position: 'relative', overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
        {tabs.map(tab => (
          <WorkspaceTab 
            key={tab.id} 
            id={tab.id} 
            isVisible={activeTabId === tab.id} 
            onUpdateTitle={(title, error) => updateTabTitle(tab.id, title, error)} 
          />
        ))}
      </div>
    </div>
  );
}


function WorkspaceTab({ id, isVisible, onUpdateTitle }: { id: string; isVisible: boolean; onUpdateTitle: (title: string, error?: boolean) => void }) {
  const [mode, setMode] = useState<'search' | 'results'>('search');
  const [activeTab, setActiveTab] = useState<'chargebee'|'stripe'|'network'|'commerce'|'support'>('chargebee');
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  // Results State
  const [chargebeeData, setChargebeeData] = useState<any[]>([]);
  const [commerceData, setCommerceData] = useState<any[]>([]);
  const [thingspaceData, setThingspaceData] = useState<Record<string, any>>({});
  const [invoicesData, setInvoicesData] = useState<Record<string, any[]>>({});
  const [transactionsData, setTransactionsData] = useState<Record<string, any[]>>({});
  const [freescoutData, setFreescoutData] = useState<any[]>([]);
  const [stripeCustomers, setStripeCustomers] = useState<any[]>([]);
  const [refreshingIccids, setRefreshingIccids] = useState<Record<string, boolean>>({});
  const [activeDoubleChargeTarget, setActiveDoubleChargeTarget] = useState<string | null>(null);

  // Stripe Logic States
  const [activeStripeId, setActiveStripeId] = useState<string | null>(null);
  const [stripeTxs, setStripeTxs] = useState<any[]>([]);
  const [stripeLoading, setStripeLoading] = useState(false);
  const [stripeFilterProps, setStripeFilterProps] = useState({ type: 'all', status: 'all', min: '', max: '' });

  // Usage Logic States
  const [activeUsageIccid, setActiveUsageIccid] = useState<string | null>(null);
  const [usageData, setUsageData] = useState<any[]>([]);
  const [usageLoading, setUsageLoading] = useState(false);
  const [usageError, setUsageError] = useState('');
  const [usageEarliest, setUsageEarliest] = useState(() => {
    const d = new Date(); d.setDate(d.getDate() - 60); return d.toISOString().split('T')[0];
  });
  const [usageLatest, setUsageLatest] = useState(() => {
    return new Date().toISOString().split('T')[0];
  });

  // Action State
  const [activeTicket, setActiveTicket] = useState<any>(null);
  const [activeThreads, setActiveThreads] = useState<any[]>([]);
  const [isTicketLoading, setIsTicketLoading] = useState(false);
  
  const [activeCbSub, setActiveCbSub] = useState<any>(null);
  const [activeCbCustomer, setActiveCbCustomer] = useState<any>(null);
  const [cbFinancials, setCbFinancials] = useState<any>(null);
  const [isCbLoading, setIsCbLoading] = useState(false);
  const [cbTab, setCbTab] = useState<'comments' | 'transactions' | 'invoices' | 'creditNotes'>('comments');

  // Escalation States
  const [escalatingKey, setEscalatingKey] = useState<string | null>(null);
  const [escalationToast, setEscalationToast] = useState<{ msg: string; ok: boolean } | null>(null);
  const [escalationDropdownOpen, setEscalationDropdownOpen] = useState<string | null>(null);
  // Modal for agent-note prompt (meta_issue with no known issue)
  const [escalationModal, setEscalationModal] = useState<{
    type: 'line_issue' | 'plan_issue' | 'meta_issue';
    customer: any; subscription: any; network?: any; knownIssue?: string;
  } | null>(null);
  const [escalationNote, setEscalationNote] = useState('');

  const showEscalationToast = (msg: string, ok: boolean) => {
    setEscalationToast({ msg, ok });
    setTimeout(() => setEscalationToast(null), 4000);
  };

  const ESCALATION_CHANNEL = 'U05HMJ0JG79'; // Bryan Fury DM — swap to channel ID like C0XXXXXX

  // Fire the actual Slack post
  const fireEscalate = async (
    type: 'line_issue' | 'plan_issue' | 'meta_issue',
    customer: any,
    subscription: any,
    network?: any,
    agentNote?: string,
    knownIssue?: string
  ) => {
    const key = `${type}-${subscription?.id}`;
    setEscalatingKey(key);
    try {
      const res = await fetch('/api/ops/actions/escalate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type, channel: ESCALATION_CHANNEL,
          customer, subscription, network,
          agentNote: agentNote || undefined,
          knownIssue: knownIssue || undefined,
        }),
      });
      const data = await res.json();
      if (res.ok && data.success) {
        showEscalationToast('✅ Escalation sent to Slack successfully!', true);
      } else {
        showEscalationToast(`❌ Slack error: ${data.error || 'Unknown'}`, false);
      }
    } catch (err: any) {
      showEscalationToast(`❌ ${err.message}`, false);
    } finally {
      setEscalatingKey(null);
    }
  };

  // Public handler — for meta_issue with no knownIssue, opens note modal first
  const handleEscalate = (
    type: 'line_issue' | 'plan_issue' | 'meta_issue',
    customer: any,
    subscription: any,
    network?: any,
    knownIssue?: string
  ) => {
    if (type === 'meta_issue' && !knownIssue) {
      // Prompt agent for a description
      setEscalationNote('');
      setEscalationModal({ type, customer, subscription, network, knownIssue });
    } else {
      fireEscalate(type, customer, subscription, network, undefined, knownIssue);
    }
  };


  const handleViewTicket = async (ticket: any) => {
    setActiveTicket(ticket);
    setIsTicketLoading(true);
    try {
      const res = await fetch('/api/ops/actions/freescout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'get_threads', ticketId: ticket.id })
      });
      const data = await res.json();
      if (data.success) {
        setActiveThreads(data.threads || []);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setIsTicketLoading(false);
    }
  };

  const fetchUsage = async (iccid: string, overrideEarliest?: string, overrideLatest?: string) => {
    setActiveUsageIccid(iccid);
    setUsageLoading(true);
    setUsageError('');
    
    try {
      const eDate = overrideEarliest || usageEarliest;
      const lDate = overrideLatest || usageLatest;
      const earliestIso = new Date(eDate + "T00:00:00Z").toISOString();
      const latestIso = new Date(lDate + "T23:59:59Z").toISOString();

      const res = await fetch('/api/ops/actions/usage', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ iccid, earliest: earliestIso, latest: latestIso })
      });
      const data = await res.json();
      
      if (!res.ok || !data.success) {
        setUsageError(data.error || 'Failed to fetch usage telemetry from active tower.');
      } else {
        const history = data.usageHistory || [];
        const mapped = history.map((item: any) => ({
          date: new Date(item.timestamp).toLocaleDateString(),
          GB: Number((item.bytesUsed / (1024 * 1024 * 1024)).toFixed(3)),
          rawBytes: item.bytesUsed
        })).sort((a: any, b: any) => new Date(a.date).getTime() - new Date(b.date).getTime());
        setUsageData(mapped);
      }
    } catch (err: any) {
      setUsageError(err.message || 'Network disconnected');
    } finally {
      setUsageLoading(false);
    }
  };

  const handleViewFinancials = async (customer: any, sub: any) => {
    setActiveCbCustomer(customer);
    setActiveCbSub(sub);
    setIsCbLoading(true);
    setCbTab('comments');
    setCbFinancials(null);
    try {
      const res = await fetch('/api/ops/actions/chargebee', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'get_financial_history', customerId: customer.id, subscriptionId: sub.id })
      });
      const data = await res.json();
      if (res.ok && data.success) {
        setCbFinancials(data);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setIsCbLoading(false);
    }
  };

  const handlePayment = async (customerId: string, intent: 'collect_now' | 'share_collect' | 'update_payment') => {
    try {
      const payloadAction = intent === 'update_payment' ? 'manage_payment_sources' : 'collect_payment';
      const res = await fetch('/api/ops/actions/chargebee', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: payloadAction, customerId })
      });
      const data = await res.json();
      if (res.ok && data.url) {
        if (intent === 'share_collect') {
           await navigator.clipboard.writeText(data.url);
           alert('Payment collection link copied to clipboard!');
        } else {
           window.open(data.url, '_blank');
        }
      } else {
        alert(data.error || 'Failed to generate payment portal');
      }
    } catch {
      alert('Network Error');
    }
  };

  const handleRefreshNetwork = async (iccid: string) => {
    setRefreshingIccids(prev => ({...prev, [iccid]: true}));
    try {
      const res = await fetch('/api/ops/actions/thingspace', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'refresh', iccid })
      });
      const data = await res.json();
      if (res.ok && data.success && data.device) {
        setThingspaceData(prev => ({
          ...prev,
          [iccid]: data.device
        }));
      }
    } catch {
      console.error('Failed to refresh network');
    } finally {
      setRefreshingIccids(prev => ({...prev, [iccid]: false}));
    }
  };

  const handleNetworkAction = async (iccid: string, action: 'suspend' | 'restore') => {
    try {
      setThingspaceData(prev => {
        const dev = prev[iccid];
        if (!dev) return prev;
        const newDev = JSON.parse(JSON.stringify(dev));
        if (newDev.carrierInformations?.[0]) {
          newDev.carrierInformations[0].state = 'pending';
        } else {
          newDev.state = 'Pending';
        }
        return { ...prev, [iccid]: newDev };
      });

      const res = await fetch('/api/ops/actions/thingspace', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action, iccid })
      });
      const data = await res.json();
      if (res.ok && data.success) {
        setTimeout(() => handleRefreshNetwork(iccid), 5000);
      } else {
        setTimeout(() => handleRefreshNetwork(iccid), 5000);
        alert(data.error || 'Failed to update network state');
      }
    } catch {
      alert('Network Error');
    }
  };

  const handleSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email) return;

    setError('');
    setLoading(true);

    try {
      setMode('search');
    onUpdateTitle('New Search');

      setActiveTab('chargebee');
      const res = await fetch(`/api/ops/aggregate?email=${encodeURIComponent(email)}`);
      const data = await res.json();

      if (res.ok && data.success) {
        setChargebeeData(data.data.chargebee || []);
        setInvoicesData(data.data.invoices || {});
        setTransactionsData(data.data.transactions || {});
        setCommerceData(data.data.commerce || []);
        setThingspaceData(data.data.thingspace || {});
        setFreescoutData(data.data.freescout || []);
        setStripeCustomers(data.data.stripeCustomers || []);
        setMode('results');
        onUpdateTitle(email);

        
        // Contextual Default Tab
        if (data.data.chargebee?.length === 0 && data.data.stripeCustomers?.length > 0) setActiveTab('stripe');
      } else {
        setError(data.error || 'Failed to scan ecosystem.');
      }
    } catch (err) {
      setError('Neural network aggregation failure.');
    } finally {
      setLoading(false);
    }
  };

  const resetSearch = () => {
    setMode('search');
    onUpdateTitle('New Search');

    setEmail('');
    setChargebeeData([]);
    setInvoicesData({});
    setTransactionsData({});
    setCommerceData([]);
    setThingspaceData({});
  };

  return (
    <div 
      suppressHydrationWarning
      style={{ 
      flex: 1, 
      backgroundColor: '#050505', 
      backgroundImage: mode === 'search' 
        ? 'radial-gradient(circle at 50% 50%, rgba(0, 178, 122, 0.1) 0%, transparent 60%)'
        : 'radial-gradient(circle at 50% 0%, rgba(0, 178, 122, 0.05) 0%, transparent 40%)',
      color: 'white',
      fontFamily: 'system-ui, sans-serif',
      transition: 'background-image 1s ease',
      display: isVisible ? 'flex' : 'none',
      flexDirection: 'column'
    }}>

      {/* Escalation Toast */}
      {escalationToast && (
        <div style={{
          position: 'fixed', top: 80, right: 24, zIndex: 9999,
          background: escalationToast.ok ? 'rgba(16,185,129,0.12)' : 'rgba(239,68,68,0.12)',
          border: `1px solid ${escalationToast.ok ? '#10b981' : '#ef4444'}`,
          color: escalationToast.ok ? '#10b981' : '#ef4444',
          padding: '12px 20px', borderRadius: '12px', fontSize: '14px', fontWeight: 600,
          backdropFilter: 'blur(12px)', maxWidth: 400, boxShadow: '0 8px 32px rgba(0,0,0,0.4)',
          animation: 'fadeIn 0.2s ease',
        }}>
          {escalationToast.msg}
        </div>
      )}

      {/* Escalation Agent-Note Modal */}
      {escalationModal && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 10000, background: 'rgba(0,0,0,0.75)', backdropFilter: 'blur(8px)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}>
          <div style={{ background: '#111', border: '1px solid rgba(59,130,246,0.4)', borderRadius: 20, padding: 32, width: '100%', maxWidth: 500, boxShadow: '0 24px 80px rgba(0,0,0,0.8)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 20 }}>
              <div style={{ background: 'rgba(59,130,246,0.12)', padding: 10, borderRadius: 12 }}>
                <ShieldAlert size={20} color="#3b82f6" />
              </div>
              <div>
                <div style={{ fontSize: 17, fontWeight: 700 }}>Escalate Meta Issue</div>
                <div style={{ fontSize: 13, color: '#6b7280' }}>
                  {escalationModal.customer?.email}
                </div>
              </div>
            </div>

            <div style={{ fontSize: 13, color: '#9ca3af', marginBottom: 12, lineHeight: 1.6 }}>
              No obvious meta issue was automatically detected. Please <strong style={{ color: 'white' }}>briefly describe the problem</strong> so the team knows what to investigate:
            </div>

            <textarea
              autoFocus
              value={escalationNote}
              onChange={e => setEscalationNote(e.target.value)}
              placeholder="e.g. IMEI on Chargebee doesn't match the device. Customer says their SIM was never activated. Account shows duplicate ICCID..."
              style={{ width: '100%', minHeight: 110, background: 'rgba(0,0,0,0.5)', border: '1px solid rgba(255,255,255,0.1)', color: 'white', padding: '12px 14px', borderRadius: 10, outline: 'none', fontSize: 14, resize: 'vertical', lineHeight: 1.6, boxSizing: 'border-box', fontFamily: 'system-ui, sans-serif' }}
            />

            <div style={{ display: 'flex', gap: 10, marginTop: 16 }}>
              <button
                onClick={() => setEscalationModal(null)}
                style={{ flex: 1, padding: '11px', background: 'transparent', border: '1px solid rgba(255,255,255,0.1)', color: '#9ca3af', borderRadius: 10, cursor: 'pointer', fontWeight: 600, fontSize: 14 }}
              >
                Cancel
              </button>
              <button
                disabled={!escalationNote.trim()}
                onClick={() => {
                  const m = escalationModal;
                  setEscalationModal(null);
                  fireEscalate(m.type, m.customer, m.subscription, m.network, escalationNote.trim(), m.knownIssue);
                }}
                style={{ flex: 2, padding: '11px', background: escalationNote.trim() ? 'rgba(59,130,246,0.9)' : 'rgba(59,130,246,0.3)', border: 'none', color: 'white', borderRadius: 10, cursor: escalationNote.trim() ? 'pointer' : 'not-allowed', fontWeight: 700, fontSize: 14, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}
              >
                <ShieldAlert size={15} /> Send Escalation to Slack
              </button>
            </div>
          </div>
        </div>
      )}

      <main style={{ flex: 1, padding: '40px', position: 'relative', display: 'flex', flexDirection: 'column' }}>
        <AnimatePresence mode="wait">
          {mode === 'search' && (
            <motion.div 
              key="search-view"
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, y: -40, scale: 0.95 }}
              transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
              style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', maxWidth: '700px', margin: '0 auto', width: '100%' }}
            >
              <div style={{ padding: '16px', background: 'rgba(0, 178, 122, 0.1)', borderRadius: '24px', marginBottom: '24px', border: '1px solid rgba(0, 178, 122, 0.2)' }}>
                 <Activity color="#00b27a" size={32} />
              </div>
              <h2 style={{ fontSize: '48px', fontWeight: 800, marginBottom: '16px', textAlign: 'center', letterSpacing: '-1px' }}>System Omni-Search</h2>
              <p style={{ color: '#9ca3af', fontSize: '18px', textAlign: 'center', marginBottom: '48px', lineHeight: 1.5 }}>
                Enter a customer email to instantly scan Chargebee, Shopify, ShipStation, and ThingSpace databanks.
              </p>

              <form suppressHydrationWarning onSubmit={handleSearch} style={{ width: '100%', position: 'relative' }}>
                <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
                  <Search size={24} color="#9ca3af" style={{ position: 'absolute', left: '24px' }} />
                  <input 
                    type="email" 
                    placeholder="Operator target email..." 
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    required
                    style={{ 
                      width: '100%', 
                      padding: '24px 24px 24px 64px', 
                      backgroundColor: 'rgba(20,20,20,0.8)', 
                      border: '1px solid rgba(255,255,255,0.1)', 
                      borderRadius: '24px', 
                      color: 'white', 
                      fontSize: '20px', 
                      outline: 'none', 
                      boxShadow: '0 24px 48px rgba(0,0,0,0.5)',
                      transition: 'border-color 0.3s, box-shadow 0.3s' 
                    }}
                    onFocus={(e) => { e.target.style.borderColor = '#00b27a'; e.target.style.boxShadow = '0 0 0 4px rgba(0, 178, 122, 0.2)'; }}
                    onBlur={(e) => { e.target.style.borderColor = 'transparent'; e.target.style.boxShadow = 'none'; }}
                  />
                  
                  <motion.button
                    suppressHydrationWarning
                    whileHover={{ scale: 1.05 }}
                    whileTap={{ scale: 0.95 }}
                    disabled={loading || !email}
                    type="submit"
                    style={{ 
                      position: 'absolute',
                      right: '12px',
                      background: 'linear-gradient(90deg, #00b27a 0%, #00a26a 100%)', 
                      border: 'none', 
                      color: 'white', 
                      padding: '14px 28px', 
                      borderRadius: '16px', 
                      fontSize: '16px', 
                      fontWeight: 600, 
                      cursor: loading || !email ? 'not-allowed' : 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '8px',
                      opacity: loading || !email ? 0.7 : 1
                    }}
                  >
                    {loading ? <Loader2 size={20} className="animate-spin" /> : 'Scan Ecosystem'}
                    {!loading && <ArrowRight size={18} />}
                  </motion.button>
                </div>
                
                <AnimatePresence>
                  {error && (
                    <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 16 }} exit={{ opacity: 0 }} style={{ position: 'absolute', width: '100%', padding: '16px', backgroundColor: 'rgba(239, 68, 68, 0.1)', border: '1px solid rgba(239, 68, 68, 0.3)', borderRadius: '12px', color: '#ef4444', textAlign: 'center' }}>
                      {error}
                    </motion.div>
                  )}
                </AnimatePresence>
              </form>
            </motion.div>
          )}

          {mode === 'results' && (
            <motion.div 
              key="results-view"
              initial={{ opacity: 0, y: 40 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
              style={{ width: '100%', maxWidth: '1400px', margin: '0 auto' }}
            >
              {/* Dynamic Header */}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '40px' }}>
                <div>
                  <button onClick={resetSearch} style={{ background: 'transparent', border: 'none', color: '#9ca3af', display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', padding: 0, marginBottom: '16px', fontSize: '14px' }}>
                    ← New Search
                  </button>
                  <h2 style={{ fontSize: '32px', margin: '0 0 8px 0', fontWeight: 800 }}>Ecosystem Payload</h2>
                  <p style={{ color: '#9ca3af', margin: 0, fontSize: '16px' }}>Target: <span style={{ color: 'white', fontWeight: 500 }}>{email}</span></p>
                </div>
                
                <div style={{ display: 'flex', gap: '16px' }}>
                  <div style={{ padding: '12px 24px', background: 'rgba(20,20,20,0.6)', border: '1px solid rgba(255,255,255,0.05)', borderRadius: '12px', display: 'flex', alignItems: 'center', gap: '12px' }}>
                     <CreditCard color="#a78bfa" size={20} />
                     <div>
                       <div style={{ fontSize: '12px', color: '#9ca3af', textTransform: 'uppercase', letterSpacing: '1px' }}>Chargebee</div>
                       <div style={{ fontWeight: 600 }}>{chargebeeData.length} Profiles</div>
                     </div>
                  </div>
                  <div style={{ padding: '12px 24px', background: 'rgba(20,20,20,0.6)', border: '1px solid rgba(255,255,255,0.05)', borderRadius: '12px', display: 'flex', alignItems: 'center', gap: '12px' }}>
                     <Package color="#fbbf24" size={20} />
                     <div>
                       <div style={{ fontSize: '12px', color: '#9ca3af', textTransform: 'uppercase', letterSpacing: '1px' }}>Commerce</div>
                       <div style={{ fontWeight: 600 }}>{commerceData.length} Orders</div>
                     </div>
                  </div>
                  <div style={{ padding: '12px 24px', background: 'rgba(20,20,20,0.6)', border: '1px solid rgba(255,255,255,0.05)', borderRadius: '12px', display: 'flex', alignItems: 'center', gap: '12px' }}>
                     <Zap color="#f87171" size={20} />
                     <div>
                       <div style={{ fontSize: '12px', color: '#9ca3af', textTransform: 'uppercase', letterSpacing: '1px' }}>ThingSpace</div>
                       <div style={{ fontWeight: 600 }}>{Object.keys(thingspaceData).length} ICIDs</div>
                     </div>
                  </div>
                </div>
              </div>

              {/* Stateful Tabs Navigation */}
              <div style={{ padding: '0 0 24px 0', borderBottom: '1px solid rgba(255,255,255,0.1)', marginBottom: '32px', display: 'flex', gap: '12px', alignItems: 'center' }}>
                <button 
                  onClick={() => setActiveTab('chargebee')} 
                  style={{ background: activeTab === 'chargebee' ? 'rgba(167, 139, 250, 0.2)' : 'transparent', color: activeTab === 'chargebee' ? '#a78bfa' : '#9ca3af', border: `1px solid ${activeTab === 'chargebee' ? 'rgba(167, 139, 250, 0.4)' : 'transparent'}`, padding: '10px 20px', borderRadius: '100px', cursor: 'pointer', fontSize: '13px', fontWeight: 600, transition: 'all 0.2s', display: 'flex', alignItems: 'center', gap: '8px' }}
                >
                  <CreditCard size={16} /> Chargebee Subscriptions {chargebeeData.length > 0 && <span style={{ background: '#a78bfa', color: 'white', padding: '2px 6px', borderRadius: '10px', fontSize: '10px' }}>{chargebeeData.length}</span>}
                </button>
                <button 
                  onClick={() => setActiveTab('stripe')} 
                  style={{ background: activeTab === 'stripe' ? 'rgba(99, 102, 241, 0.2)' : 'transparent', color: activeTab === 'stripe' ? '#818cf8' : '#9ca3af', border: `1px solid ${activeTab === 'stripe' ? 'rgba(99, 102, 241, 0.4)' : 'transparent'}`, padding: '10px 20px', borderRadius: '100px', cursor: 'pointer', fontSize: '13px', fontWeight: 600, transition: 'all 0.2s', display: 'flex', alignItems: 'center', gap: '8px' }}
                >
                  <DollarSign size={16} /> Stripe Explorer {stripeCustomers.length > 0 && <span style={{ background: '#818cf8', color: 'white', padding: '2px 6px', borderRadius: '10px', fontSize: '10px' }}>{stripeCustomers.length}</span>}
                </button>
                <button 
                  onClick={() => setActiveTab('network')} 
                  style={{ background: activeTab === 'network' ? 'rgba(248, 113, 113, 0.2)' : 'transparent', color: activeTab === 'network' ? '#f87171' : '#9ca3af', border: `1px solid ${activeTab === 'network' ? 'rgba(248, 113, 113, 0.4)' : 'transparent'}`, padding: '10px 20px', borderRadius: '100px', cursor: 'pointer', fontSize: '13px', fontWeight: 600, transition: 'all 0.2s', display: 'flex', alignItems: 'center', gap: '8px' }}
                >
                  <Zap size={16} /> Network Core
                </button>
                <button 
                  onClick={() => setActiveTab('commerce')} 
                  style={{ background: activeTab === 'commerce' ? 'rgba(251, 191, 36, 0.2)' : 'transparent', color: activeTab === 'commerce' ? '#fbbf24' : '#9ca3af', border: `1px solid ${activeTab === 'commerce' ? 'rgba(251, 191, 36, 0.4)' : 'transparent'}`, padding: '10px 20px', borderRadius: '100px', cursor: 'pointer', fontSize: '13px', fontWeight: 600, transition: 'all 0.2s', display: 'flex', alignItems: 'center', gap: '8px' }}
                >
                  <Package size={16} /> Commerce Orders {commerceData.length > 0 && <span style={{ background: '#fbbf24', color: 'white', padding: '2px 6px', borderRadius: '10px', fontSize: '10px' }}>{commerceData.length}</span>}
                </button>
                <button 
                  onClick={() => setActiveTab('support')} 
                  style={{ background: activeTab === 'support' ? 'rgba(96, 165, 250, 0.2)' : 'transparent', color: activeTab === 'support' ? '#60a5fa' : '#9ca3af', border: `1px solid ${activeTab === 'support' ? 'rgba(96, 165, 250, 0.4)' : 'transparent'}`, padding: '10px 20px', borderRadius: '100px', cursor: 'pointer', fontSize: '13px', fontWeight: 600, transition: 'all 0.2s', display: 'flex', alignItems: 'center', gap: '8px' }}
                >
                  <Activity size={16} /> Support Tickets {freescoutData.length > 0 && <span style={{ background: '#60a5fa', color: 'white', padding: '2px 6px', borderRadius: '10px', fontSize: '10px' }}>{freescoutData.length}</span>}
                </button>
              </div>

              {/* Data Stack */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '64px' }}>
                
                {/* Chargebee Column */}
                {activeTab === 'chargebee' && (
                <div id="section-chargebee" style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
                  <h3 style={{ fontSize: '20px', color: '#e5e7eb', margin: 0, display: 'flex', alignItems: 'center', gap: '8px' }}>
                     <CreditCard size={20} color="#a78bfa" /> Chargebee Subscriptions
                  </h3>
                  
                  {chargebeeData.length === 0 ? (
                    <div style={{ padding: '40px', textAlign: 'center', background: 'rgba(20,20,20,0.4)', borderRadius: '16px', border: '1px dashed rgba(255,255,255,0.1)' }}>
                      <span style={{ color: '#6b7280' }}>No Chargebee profiles found.</span>
                    </div>
                  ) : (
                    chargebeeData.map((c, i) => (
                      <div key={i} style={{ padding: '24px', background: 'rgba(20,20,20,0.8)', border: '1px solid rgba(167, 139, 250, 0.2)', borderRadius: '16px', boxShadow: '0 8px 32px rgba(0,0,0,0.2)' }}>
                        <div style={{ marginBottom: '16px', paddingBottom: '16px', borderBottom: '1px solid rgba(255,255,255,0.05)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                          <div>
                            <div style={{ fontWeight: 600, fontSize: '18px' }}>{c.firstName} {c.lastName}</div>
                            <div style={{ color: '#9ca3af', fontSize: '14px' }}>ID: {c.id}</div>
                          </div>
                          <div style={{ display: 'flex', gap: '8px' }}>
                            {c.subscriptions?.length > 1 && (
                              <button 
                                onClick={() => setActiveDoubleChargeTarget(activeDoubleChargeTarget === c.id ? null : c.id)}
                                style={{ display: 'flex', alignItems: 'center', gap: '6px', background: activeDoubleChargeTarget === c.id ? 'rgba(239, 68, 68, 0.2)' : 'rgba(239, 68, 68, 0.1)', border: '1px solid rgba(239, 68, 68, 0.3)', color: '#ef4444', padding: '6px 10px', borderRadius: '8px', fontSize: '12px', cursor: 'pointer', fontWeight: 500, transition: 'all 0.2s' }}
                              >
                                <AlertTriangle size={14} /> Compare Charges
                              </button>
                            )}
                            <button 
                              onClick={() => handlePayment(c.id, 'collect_now')}
                              title="Open Collect Payment Portal"
                              style={{ display: 'flex', alignItems: 'center', gap: '6px', background: 'rgba(167, 139, 250, 0.1)', border: '1px solid rgba(167, 139, 250, 0.3)', color: '#a78bfa', padding: '6px 10px', borderRadius: '8px', fontSize: '12px', cursor: 'pointer', fontWeight: 500 }}
                            >
                              <DollarSign size={14} /> Collect
                            </button>
                            <button 
                              onClick={() => handlePayment(c.id, 'share_collect')}
                              title="Copy Collect Payment Link"
                              style={{ display: 'flex', alignItems: 'center', gap: '6px', background: 'rgba(167, 139, 250, 0.1)', border: '1px solid rgba(167, 139, 250, 0.3)', color: '#a78bfa', padding: '6px 10px', borderRadius: '8px', fontSize: '12px', cursor: 'pointer', fontWeight: 500 }}
                            >
                              <Copy size={14} /> Share
                            </button>
                            <button 
                              onClick={() => handlePayment(c.id, 'update_payment')}
                              title="Update Payment Method Portal"
                              style={{ display: 'flex', alignItems: 'center', gap: '6px', background: 'rgba(167, 139, 250, 0.1)', border: '1px solid rgba(167, 139, 250, 0.3)', color: '#a78bfa', padding: '6px 10px', borderRadius: '8px', fontSize: '12px', cursor: 'pointer', fontWeight: 500 }}
                            >
                              <CreditCard size={14} /> Update
                            </button>
                          </div>
                        </div>

                        {activeDoubleChargeTarget === c.id && (() => {
                          const custTxs = (transactionsData[c.id] || [])
                            .filter((tx: any) => tx.status === 'success')
                            .sort((a: any, b: any) => b.date - a.date); // Newest first

                          const anomalies = [];
                          for (let x = 0; x < custTxs.length - 1; x++) {
                            const t1 = custTxs[x];
                            const t2 = custTxs[x + 1];
                            const diffDays = Math.abs(t1.date - t2.date) / 86400;
                            if (diffDays < 25) {
                              anomalies.push({ t1, t2, diffDays });
                            }
                          }

                          return (
                            <div style={{ marginBottom: '24px', padding: '16px', background: 'rgba(239, 68, 68, 0.05)', border: '1px solid rgba(239, 68, 68, 0.2)', borderRadius: '12px' }}>
                              <h4 style={{ fontSize: '14px', color: '#fca5a5', margin: '0 0 16px 0', display: 'flex', alignItems: 'center', gap: '8px' }}>
                                <ShieldAlert size={16} /> Subscription Charge Overlap Engine
                              </h4>
                              {custTxs.length < 2 ? (
                                <div style={{ fontSize: '13px', color: '#9ca3af' }}>Not enough successful historical transactions to compare.</div>
                              ) : anomalies.length === 0 ? (
                                <div style={{ fontSize: '13px', color: '#10b981', display: 'flex', alignItems: 'center', gap: '6px' }}>
                                  <Check size={14} /> No mathematical double-charges detected in recent history. All payments are securely spaced &gt;= 25 days apart.
                                </div>
                              ) : (
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                                  {anomalies.map((anom, aIdx) => (
                                    <div key={aIdx} style={{ background: 'rgba(0,0,0,0.5)', padding: '12px', borderRadius: '8px', borderLeft: '4px solid #ef4444', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                      <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                                        <div style={{ fontSize: '13px', color: '#ef4444', fontWeight: 600 }}>Overlap Warning: {anom.diffDays < 1 ? 'Same Day' : `${Math.floor(anom.diffDays)} Days Apart`}</div>
                                        <div style={{ fontSize: '12px', color: '#d1d5db' }}>
                                          <span style={{color:'white'}}>T1:</span> ${anom.t1.amount / 100} on {new Date(anom.t1.date * 1000).toLocaleDateString()} (Sub: {anom.t1.linked_invoices?.[0]?.txn_linked_sub || 'Unknown'})
                                        </div>
                                        <div style={{ fontSize: '12px', color: '#d1d5db' }}>
                                          <span style={{color:'white'}}>T2:</span> ${anom.t2.amount / 100} on {new Date(anom.t2.date * 1000).toLocaleDateString()} (Sub: {anom.t2.linked_invoices?.[0]?.txn_linked_sub || 'Unknown'})
                                        </div>
                                      </div>
                                    </div>
                                  ))}
                                </div>
                              )}
                            </div>
                          );
                        })()}

                        {c.subscriptions?.length > 0 ? (
                          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                            {c.subscriptions.map((sub: any, idx: number) => (
                              <div key={idx} style={{ padding: '16px', background: 'rgba(0,0,0,0.4)', borderRadius: '12px', border: '1px solid rgba(255,255,255,0.05)' }}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '12px' }}>
                                  <div>
                                    <span style={{ fontWeight: 600, color: '#e5e7eb', fontSize: '15px' }}>
                                      {sub.subscription_items?.find((i: any) => i.item_type === 'plan')?.item_price_id || sub.plan_id || 'Unknown Plan'}
                                    </span>
                                    <span style={{ color: '#9ca3af', fontSize: '13px', marginLeft: '8px' }}>
                                      ${((sub.subscription_items?.find((i: any) => i.item_type === 'plan')?.amount || sub.plan_amount || 0) / 100).toFixed(2)}
                                    </span>
                                  </div>
                                  <span style={{ 
                                    padding: '4px 10px', 
                                    borderRadius: '100px', 
                                    fontSize: '12px', 
                                    fontWeight: 600,
                                    background: (sub.status === 'active' || sub.status === 'future') ? 'rgba(16, 185, 129, 0.1)' : 'rgba(239, 68, 68, 0.1)',
                                    color: (sub.status === 'active' || sub.status === 'future') ? '#10b981' : '#ef4444',
                                    border: `1px solid ${(sub.status === 'active' || sub.status === 'future') ? 'rgba(16, 185, 129, 0.3)' : 'rgba(239, 68, 68, 0.3)'}`
                                  }}>
                                    {sub.status.toUpperCase()}
                                  </span>
                                </div>
                                <div style={{ fontSize: '13px', color: '#9ca3af', display: 'flex', justifyContent: 'space-between' }}>
                                  <span>Sub ID: {sub.id}</span>
                                  {sub.total_dues > 0 && (
                                    <span style={{ color: '#f87171', fontWeight: 600 }}>Due: ${(sub.total_dues / 100).toFixed(2)}</span>
                                  )}
                                </div>
                                {sub.next_billing_at && (
                                  <div style={{ fontSize: '12px', color: '#6b7280', marginTop: '6px' }}>
                                    Next Bill: {new Date(sub.next_billing_at * 1000).toLocaleDateString()}
                                  </div>
                                )}
                                {sub.due_since && (
                                  <div style={{ fontSize: '12px', color: '#f87171', marginTop: '4px' }}>
                                    Due Since: {Math.floor((Date.now() - (sub.due_since * 1000)) / 86400000)} Days Ago
                                  </div>
                                )}
                                 {/* ICCID + IMEI from Chargebee custom fields */}
                                 {(() => {
                                   const cbIccidVal = sub.cf_SIM_ID_ICCID || sub.cf_iccid;
                                   const cbImeiVal  = sub.cf_IMEI || sub.cf_imei || sub.cf_Device_IMEI || sub.cf_device_imei;
                                   if (!cbIccidVal && !cbImeiVal) return null;
                                   return (
                                     <div style={{ marginTop: '10px', padding: '8px 12px', background: 'rgba(0,0,0,0.3)', borderRadius: '8px', border: '1px solid rgba(255,255,255,0.05)', display: 'flex', flexDirection: 'column', gap: '4px' }}>
                                       {cbIccidVal && (
                                         <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '12px' }}>
                                           <span style={{ color: '#6b7280' }}>ICCID</span>
                                           <span style={{ color: '#f87171', fontFamily: 'monospace', fontSize: '11px' }}>{cbIccidVal}</span>
                                         </div>
                                       )}
                                       {cbImeiVal && (
                                         <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '12px' }}>
                                           <span style={{ color: '#6b7280' }}>IMEI</span>
                                           <span style={{ color: '#a78bfa', fontFamily: 'monospace', fontSize: '11px' }}>{cbImeiVal}</span>
                                         </div>
                                       )}
                                     </div>
                                   );
                                 })()}
                                <button 
                                  onClick={() => handleViewFinancials(c, sub)}
                                  style={{ width: '100%', marginTop: '16px', padding: '10px', background: 'rgba(167, 139, 250, 0.1)', border: '1px solid rgba(167, 139, 250, 0.3)', borderRadius: '8px', color: '#a78bfa', fontSize: '12px', fontWeight: 600, cursor: 'pointer', transition: 'all 0.2s' }}
                                  onMouseOver={(e) => { e.currentTarget.style.background = 'rgba(167, 139, 250, 0.2)'; }}
                                  onMouseOut={(e) => { e.currentTarget.style.background = 'rgba(167, 139, 250, 0.1)'; }}
                                >
                                  Load Financials & Comments
                                </button>
                                {(() => {
                                  const iccid = sub.cf_SIM_ID_ICCID || sub.cf_iccid;
                                  if (!iccid) return null;
                                  
                                  const syncButtonNode = (
                                    <button
                                      onClick={() => handleRefreshNetwork(iccid)}
                                      disabled={refreshingIccids[iccid]}
                                      title="Sync Live Status from Verizon"
                                      style={{
                                        display: 'flex',
                                        alignItems: 'center',
                                        gap: '6px',
                                        padding: '4px 10px',
                                        background: 'rgba(255, 255, 255, 0.05)',
                                        border: '1px solid rgba(255, 255, 255, 0.1)',
                                        borderRadius: '100px',
                                        color: '#d1d5db',
                                        fontSize: '11px',
                                        fontWeight: 600,
                                        textTransform: 'uppercase',
                                        cursor: refreshingIccids[iccid] ? 'wait' : 'pointer',
                                        opacity: refreshingIccids[iccid] ? 0.7 : 1,
                                        transition: 'all 0.2s',
                                        ...({ ':hover': { background: 'rgba(255, 255, 255, 0.1)' } } as any)
                                      }}
                                      onMouseOver={(e) => { e.currentTarget.style.background = 'rgba(255, 255, 255, 0.1)'; }}
                                      onMouseOut={(e) => { e.currentTarget.style.background = 'rgba(255, 255, 255, 0.05)'; }}
                                    >
                                      <RefreshCw size={12} style={{ animation: refreshingIccids[iccid] ? 'spin 1s linear infinite' : 'none' }} />
                                      {refreshingIccids[iccid] ? 'SYNCING...' : 'SYNC'}
                                    </button>
                                  );

                                  // ── Compute billing lock status (needed in all branches) ──
                                  // NOTE: total_dues can be null/undefined when there are no dues,
                                  // so use !sub.total_dues rather than === 0
                                  const _custTxs = transactionsData[c.id] || [];
                                  const _inProgressActive = _custTxs.some((tx: any) => tx.status === 'in_progress');
                                  const _custInvoices = invoicesData[c.id] || [];
                                  const _latestInvoice = _custInvoices.find((inv: any) => inv.subscription_id === sub.id) || _custInvoices[0];
                                  let _gracePeriodActive = false;
                                  if (sub.due_invoices_count === 1 && _latestInvoice?.date) {
                                    const daysOverdue = Math.floor((Date.now() - _latestInvoice.date * 1000) / 86400000);
                                    if (daysOverdue <= 4) _gracePeriodActive = true;
                                  }
                                  const isNetworkUnlocked =
                                    ((sub.status === 'active' || sub.status === 'future' || sub.status === 'non_renewing') && !sub.total_dues)
                                    || _gracePeriodActive
                                    || _inProgressActive;

                                  const tsDev = thingspaceData[iccid];
                                  if (!tsDev || Object.keys(tsDev).length === 0) {
                                    // ── ICCID Diagnosis ──────────────────────────────────
                                    const iccidLen = iccid?.length ?? 0;
                                    const iccidStartsOk = iccid?.startsWith('89148');
                                    const iccidLenOk = iccidLen === 20;
                                    const iccidValid = iccidStartsOk && iccidLenOk;

                                    // Build human diagnosis string
                                    let iccidIssueReason = '';
                                    if (!iccidLenOk && !iccidStartsOk) {
                                      iccidIssueReason = `Wrong length (${iccidLen} digits, expected 20) and wrong prefix (expected 89148).`;
                                    } else if (!iccidLenOk) {
                                      iccidIssueReason = `Wrong length: ${iccidLen} digits, expected 20.`;
                                    } else if (!iccidStartsOk) {
                                      iccidIssueReason = `Wrong prefix: starts with "${iccid?.substring(0,5)}", expected 89148.`;
                                    }

                                    if (!iccidValid) {
                                      // ── Bad ICCID: likely data entry error ──────────────
                                      const escKey = `meta_issue-${sub.id}`;
                                      const busy = escalatingKey === escKey;
                                      return (
                                        <div style={{ marginTop: '16px', padding: '16px', background: 'rgba(239, 68, 68, 0.06)', borderRadius: '12px', border: '1px solid rgba(239, 68, 68, 0.35)', boxShadow: '0 0 16px rgba(239,68,68,0.12)' }}>
                                          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '12px' }}>
                                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                              <AlertTriangle size={16} color="#ef4444" />
                                              <span style={{ fontSize: '14px', color: '#fca5a5', fontWeight: 700 }}>Invalid ICCID — Cannot Lookup</span>
                                            </div>
                                            {syncButtonNode}
                                          </div>

                                          {/* Bad ICCID breakdown */}
                                          <div style={{ background: 'rgba(0,0,0,0.35)', borderRadius: '8px', padding: '12px', marginBottom: '12px', fontFamily: 'monospace' }}>
                                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '6px' }}>
                                              <span style={{ color: '#ef4444', fontSize: '13px', fontWeight: 700 }}>{iccid}</span>
                                              <span style={{ padding: '2px 8px', background: 'rgba(239,68,68,0.2)', color: '#ef4444', borderRadius: '4px', fontSize: '10px', fontWeight: 700, letterSpacing: '1px' }}>INVALID</span>
                                            </div>
                                            <div style={{ fontSize: '12px', color: '#fca5a5', lineHeight: 1.6 }}>
                                              ⚠ {iccidIssueReason}
                                            </div>
                                            <div style={{ fontSize: '11px', color: '#6b7280', marginTop: '6px' }}>
                                              A valid ICCID must be exactly 20 digits and start with <span style={{ color: '#f87171' }}>89148</span>.
                                            </div>
                                          </div>

                                          <div style={{ fontSize: '13px', color: '#fca5a5', lineHeight: 1.6, marginBottom: '14px' }}>
                                            There is probably an issue with the ICCID in Chargebee — it appears to be <strong>incorrect or malformed</strong>. Please escalate this to the team so the correct ICCID can be updated before any network actions are taken.
                                          </div>

                                          {/* Escalate CTA — only if billing isn't locked */}
                                          {isNetworkUnlocked ? (
                                            <button
                                              disabled={busy}
                                              onClick={() => handleEscalate('meta_issue', c, sub, undefined, `ICCID appears to be invalid in Chargebee. ${iccidIssueReason} The ICCID currently stored is: ${iccid}. A valid ICCID must be 20 digits starting with 89148. Please correct before any network actions are taken.`)}
                                              style={{ width: '100%', padding: '10px 14px', background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.4)', color: '#ef4444', borderRadius: '8px', cursor: busy ? 'not-allowed' : 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px', fontSize: '13px', fontWeight: 700, opacity: busy ? 0.7 : 1, transition: 'all 0.2s' }}
                                              onMouseOver={e => { if (!busy) e.currentTarget.style.background = 'rgba(239,68,68,0.2)'; }}
                                              onMouseOut={e => { e.currentTarget.style.background = 'rgba(239,68,68,0.1)'; }}
                                            >
                                              {busy
                                                ? <><Loader2 size={14} style={{ animation: 'spin 1s linear infinite' }} /> Sending to Slack...</>
                                                : <><ShieldAlert size={14} /> Escalate — Incorrect ICCID to Team</>
                                              }
                                            </button>
                                          ) : (
                                            <div style={{ padding: '8px 12px', background: 'rgba(239,68,68,0.05)', border: '1px solid rgba(239,68,68,0.15)', borderRadius: '8px', display: 'flex', alignItems: 'center', gap: '8px', fontSize: '12px', color: '#9ca3af' }}>
                                              <AlertCircle size={13} color="#ef4444" />
                                              Escalation unavailable — account has billing constraints.
                                            </div>
                                          )}
                                        </div>
                                      );
                                    }

                                    // ── Valid ICCID but no ThingSpace record: SIM not provisioned ──
                                    const swapKey = `swap-${sub.id}`;
                                    const swapBusy = escalatingKey === swapKey;
                                    return (
                                      <div style={{ marginTop: '16px', padding: '16px', background: 'rgba(239, 68, 68, 0.05)', borderRadius: '12px', border: '1px solid rgba(239, 68, 68, 0.2)' }}>
                                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
                                          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                            <AlertCircle size={16} color="#ef4444" />
                                            <span style={{ fontSize: '14px', color: '#e5e7eb', fontWeight: 600 }}>No Line Found on ThingSpace</span>
                                          </div>
                                          {syncButtonNode}
                                        </div>

                                        {/* Valid ICCID badge */}
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '10px', background: 'rgba(0,0,0,0.3)', padding: '8px 12px', borderRadius: '8px', fontFamily: 'monospace' }}>
                                          <span style={{ color: '#f87171', fontSize: '13px' }}>{iccid}</span>
                                          <span style={{ padding: '2px 8px', background: 'rgba(16,185,129,0.15)', color: '#10b981', borderRadius: '4px', fontSize: '10px', fontWeight: 700, letterSpacing: '1px' }}>ICCID VALID</span>
                                        </div>

                                        <div style={{ fontSize: '13px', color: '#fca5a5', lineHeight: 1.6, marginBottom: '14px' }}>
                                          The ICCID format is correct but <strong>Verizon has no record of this SIM</strong>. The SIM may not have been provisioned, may be defective, or may need to be swapped. Please request a SIM swap or escalate if needed.
                                        </div>

                                        {/* Two-action row — only if billing isn't locked */}
                                        {isNetworkUnlocked ? (
                                          <div style={{ display: 'flex', gap: '8px' }}>
                                            <button
                                              disabled={swapBusy}
                                              onClick={() => handleEscalate('meta_issue', c, sub, undefined, `Valid ICCID (${iccid}) found in Chargebee but Verizon/ThingSpace has NO record of this SIM. Device may never have been provisioned, SIM may be defective, or a SIM swap is required.`)}
                                              style={{ flex: 1, padding: '10px 14px', background: 'rgba(245,158,11,0.1)', border: '1px solid rgba(245,158,11,0.35)', color: '#f59e0b', borderRadius: '8px', cursor: swapBusy ? 'not-allowed' : 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px', fontSize: '12px', fontWeight: 700, opacity: swapBusy ? 0.7 : 1, transition: 'all 0.2s' }}
                                              onMouseOver={e => { if (!swapBusy) e.currentTarget.style.background = 'rgba(245,158,11,0.2)'; }}
                                              onMouseOut={e => { e.currentTarget.style.background = 'rgba(245,158,11,0.1)'; }}
                                            >
                                              {swapBusy
                                                ? <><Loader2 size={13} style={{ animation: 'spin 1s linear infinite' }} /> Sending...</>
                                                : <>📲 Request SIM Swap</>
                                              }
                                            </button>
                                            <button
                                              onClick={() => handleEscalate('line_issue', c, sub, undefined)}
                                              disabled={escalatingKey === `line_issue-${sub.id}`}
                                              style={{ flex: 1, padding: '10px 14px', background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.3)', color: '#ef4444', borderRadius: '8px', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px', fontSize: '12px', fontWeight: 700, transition: 'all 0.2s' }}
                                              onMouseOver={e => { e.currentTarget.style.background = 'rgba(239,68,68,0.18)'; }}
                                              onMouseOut={e => { e.currentTarget.style.background = 'rgba(239,68,68,0.08)'; }}
                                            >
                                              {escalatingKey === `line_issue-${sub.id}`
                                                ? <><Loader2 size={13} style={{ animation: 'spin 1s linear infinite' }} /> Sending...</>
                                                : <><ShieldAlert size={13} /> Escalate to Team</>
                                              }
                                            </button>
                                          </div>
                                        ) : (
                                          <div style={{ padding: '8px 12px', background: 'rgba(239,68,68,0.05)', border: '1px solid rgba(239,68,68,0.15)', borderRadius: '8px', display: 'flex', alignItems: 'center', gap: '8px', fontSize: '12px', color: '#9ca3af' }}>
                                            <AlertCircle size={13} color="#ef4444" />
                                            Escalation unavailable — account has billing constraints.
                                          </div>
                                        )}
                                      </div>
                                    );
                                  }

                                  const tsStateRaw = tsDev.carrierInformations?.[0]?.state || tsDev.state || 'Unknown';
                                  const tsState = tsStateRaw.toLowerCase() === 'active' ? 'Active' : tsStateRaw;
                                  
                                  let gracePeriodActive = false;
                                  let inProgressActive = false;
                                  let graceWarning = false;
                                  
                                  if (sub.due_invoices_count === 1) {
                                    const custInvoices = invoicesData[c.id] || [];
                                    const latestInvoice = custInvoices.find((inv: any) => inv.subscription_id === sub.id) || custInvoices[0];
                                    if (latestInvoice && latestInvoice.date) {
                                      const nowTime = new Date().getTime();
                                      const invoiceTime = new Date(latestInvoice.date * 1000).getTime();
                                      const daysOverdue = Math.floor((nowTime - invoiceTime) / (1000 * 60 * 60 * 24));
                                      if (daysOverdue <= 3) {
                                        gracePeriodActive = true;
                                      } else if (daysOverdue === 4) {
                                        gracePeriodActive = true;
                                        graceWarning = true;
                                      }
                                    }
                                  }

                                  const custTxs = transactionsData[c.id] || [];
                                  if (custTxs.some((tx: any) => tx.status === 'in_progress')) {
                                    inProgressActive = true;
                                  }

                                  let isRestoreAllowed = false;
                                  if ((sub.status === 'active' || sub.status === 'future' || sub.status === 'non_renewing') && sub.total_dues === 0) {
                                    isRestoreAllowed = true;
                                  } else if (gracePeriodActive || inProgressActive) {
                                    isRestoreAllowed = true;
                                  }
                                  
                                  const isValidIccid = iccid && iccid.length === 20 && iccid.startsWith('89148');
                                  const rawPlan = tsDev.carrierInformations?.[0]?.servicePlan || 'N/A';
                                  const isValidPlan = rawPlan && rawPlan !== 'N/A' && rawPlan.trim() !== '' && !PROBLEM_SKUS.includes(rawPlan);
                                  
                                  return (
                                    <div style={{ marginTop: '16px', padding: '16px', background: 'rgba(248, 113, 113, 0.05)', borderRadius: '12px', border: '1px solid rgba(248, 113, 113, 0.2)' }}>
                                      
                                      {gracePeriodActive && (
                                        <div style={{ padding: '8px 12px', background: 'rgba(59, 130, 246, 0.1)', color: '#60a5fa', fontSize: '12px', borderRadius: '8px', marginBottom: '12px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                                          <Info size={14} /> Grace Period Active: Network restore permitted.
                                        </div>
                                      )}
                                      
                                      {inProgressActive && (
                                        <div style={{ padding: '8px 12px', background: 'rgba(16, 185, 129, 0.1)', color: '#34d399', fontSize: '12px', borderRadius: '8px', marginBottom: '12px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                                          <Loader2 size={14} style={{ animation: 'spin 1s linear infinite' }} /> Transaction In-Progress: Network restore permitted.
                                        </div>
                                      )}

                                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '12px' }}>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                          <Zap size={16} color="#f87171" />
                                          <span style={{ fontSize: '14px', color: '#e5e7eb', fontWeight: 600 }}>Verizon Network Core</span>
                                        </div>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                                          {syncButtonNode}
                                          <div style={{ width: '8px', height: '8px', borderRadius: '50%', background: tsState.toLowerCase() === 'active' ? '#10b981' : tsState.toLowerCase().startsWith('pending') ? '#f59e0b' : '#ef4444' }} />
                                          <span style={{ fontSize: '12px', color: tsState.toLowerCase().startsWith('pending') ? '#f59e0b' : 'white', fontWeight: 500, textTransform: 'uppercase' }}>{tsState}</span>
                                        </div>
                                      </div>

                                      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '12px', fontSize: '12px', marginBottom: '16px' }}>
                                        <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                                          <div
                                            title={!isValidIccid ? "Incorrect ICCID get it updated" : undefined}
                                            style={{ 
                                              display: 'flex', 
                                              alignItems: 'center',
                                              background: !isValidIccid ? 'rgba(239, 68, 68, 0.1)' : 'transparent',
                                              boxShadow: !isValidIccid ? '0 0 8px rgba(239, 68, 68, 0.6)' : 'none',
                                              border: !isValidIccid ? '1px solid #ef4444' : 'none',
                                              padding: !isValidIccid ? '4px 8px' : '0',
                                              borderRadius: '4px',
                                              transition: 'all 0.3s ease',
                                              cursor: !isValidIccid ? 'help' : 'default'
                                            }}
                                          >
                                            <div>
                                              <span style={{ color: '#9ca3af', display: 'block', marginBottom: '4px' }}>ICCID</span>
                                              <span style={{ color: !isValidIccid ? '#ef4444' : '#f87171', fontFamily: 'monospace', fontWeight: !isValidIccid ? 700 : 400 }}>{iccid}</span>
                                            </div>
                                            {!isValidIccid && <AlertTriangle size={14} color="#ef4444" style={{ marginLeft: '8px' }} />}
                                          </div>
                                          <button 
                                            onClick={() => activeUsageIccid === iccid ? setActiveUsageIccid(null) : fetchUsage(iccid)}
                                            style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', color: '#e5e7eb', padding: '6px', borderRadius: '4px', fontSize: '11px', cursor: 'pointer', display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '6px', marginTop: '4px' }}
                                          >
                                            <BarChart2 size={12} /> Analyze Usage
                                          </button>
                                        </div>
                                        <div>
                                          <span style={{ color: '#9ca3af', display: 'block', marginBottom: '4px' }}>IMEI</span>
                                          <span style={{ color: '#a78bfa', fontFamily: 'monospace' }}>{tsDev.deviceIds?.find((d:any)=>d.kind==='imei')?.id || tsDev.extendedAttributes?.find((d:any)=>d.key==='PreIMEI')?.value || 'N/A'}</span>
                                        </div>
                                        <div>
                                          <span style={{ color: '#9ca3af', display: 'block', marginBottom: '4px' }}>MDN / Number</span>
                                          <span style={{ color: 'white' }}>{tsDev.deviceIds?.find((d:any)=>d.kind==='mdn')?.id || 'N/A'}</span>
                                        </div>
                                        <div>
                                          <div
                                            title={!isValidPlan ? "Incorrect Service Plan get it updated" : undefined}
                                            style={{ 
                                              display: 'flex', 
                                              flexDirection: 'column',
                                              background: !isValidPlan ? 'rgba(239, 68, 68, 0.1)' : 'transparent',
                                              boxShadow: !isValidPlan ? '0 0 8px rgba(239, 68, 68, 0.6)' : 'none',
                                              border: !isValidPlan ? '1px solid #ef4444' : 'none',
                                              padding: !isValidPlan ? '4px 8px' : '0',
                                              borderRadius: '4px',
                                              transition: 'all 0.3s ease',
                                              cursor: !isValidPlan ? 'help' : 'default'
                                            }}
                                          >
                                            <span style={{ color: '#9ca3af', display: 'block', marginBottom: '4px' }}>Active Plan SKU</span>
                                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                              <span style={{ color: !isValidPlan ? '#ef4444' : 'white', fontWeight: !isValidPlan ? 700 : 400 }}>{rawPlan}</span>
                                              {!isValidPlan && <AlertTriangle size={14} color="#ef4444" />}
                                              {PROBLEM_SKUS.includes(tsDev.carrierInformations?.[0]?.servicePlan) && (
                                                <span style={{ padding: '2px 6px', background: 'rgba(239, 68, 68, 0.2)', color: '#f87171', borderRadius: '4px', fontSize: '10px', fontWeight: 600 }}>ISSUE KNOWN</span>
                                              )}
                                              {GOOD_SKUS.includes(tsDev.carrierInformations?.[0]?.servicePlan) && (
                                                <span style={{ padding: '2px 6px', background: 'rgba(16, 185, 129, 0.2)', color: '#34d399', borderRadius: '4px', fontSize: '10px', fontWeight: 600 }}>GOOD</span>
                                              )}
                                            </div>
                                          </div>
                                        </div>
                                        <div>
                                          <span style={{ color: '#9ca3af', display: 'block', marginBottom: '4px' }}>IP Address</span>
                                          <span style={{ color: 'white', fontFamily: 'monospace' }}>{tsDev.ipAddress || 'Disconnected'}</span>
                                        </div>
                                        <div>
                                          <span style={{ color: '#9ca3af', display: 'block', marginBottom: '4px' }}>Last Connection</span>
                                          <span style={{ color: 'white' }}>{tsDev.lastConnectionDate ? new Date(tsDev.lastConnectionDate).toLocaleDateString() : 'N/A'}</span>
                                        </div>
                                      </div>

                                      {graceWarning && (
                                        <div style={{ padding: '8px 12px', background: 'rgba(245, 158, 11, 0.1)', border: '1px solid rgba(245, 158, 11, 0.3)', borderRadius: '8px', color: '#f59e0b', fontSize: '13px', lineHeight: 1.4, marginBottom: '16px' }}>
                                          <strong>Courtesy 4th Day Grace Period.</strong> Note: Normal grace period is exactly 3 days. Resume functionalities remain unlocked as a courtesy.
                                        </div>
                                      )}

                                      {tsState.toLowerCase().startsWith('pending') && (
                                        <div style={{ padding: '8px 12px', background: 'rgba(245, 158, 11, 0.1)', border: '1px solid rgba(245, 158, 11, 0.3)', borderRadius: '8px', color: '#f59e0b', fontSize: '13px', lineHeight: 1.4, marginBottom: '16px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                                          <Loader2 size={14} style={{ animation: 'spin 1s linear infinite' }} />
                                          <div>
                                            <strong>Operation Pending.</strong> Please wait for about a minute or two and then refresh the status.
                                          </div>
                                        </div>
                                      )}


                                      <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', paddingTop: '12px', borderTop: '1px solid rgba(255,255,255,0.05)' }}>
                                        <div style={{ display: 'flex', gap: '8px' }}>
                                          {tsState === 'Active' && (
                                            <button onClick={() => handleNetworkAction(iccid, 'suspend')} style={{ flex: 1, padding: '8px', background: 'rgba(245, 158, 11, 0.1)', border: '1px solid rgba(245, 158, 11, 0.3)', color: '#f59e0b', borderRadius: '8px', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px', fontSize: '12px', fontWeight: 500 }}>
                                              <Pause size={14} /> Suspend Line
                                            </button>
                                          )}
                                          {tsState !== 'Active' && isRestoreAllowed && (
                                            <button onClick={() => handleNetworkAction(iccid, 'restore')} style={{ flex: 1, padding: '8px', background: 'rgba(16, 185, 129, 0.1)', border: '1px solid rgba(16, 185, 129, 0.3)', color: '#10b981', borderRadius: '8px', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px', fontSize: '12px', fontWeight: 500 }}>
                                              <Play size={14} /> Restore Line
                                            </button>
                                          )}
                                          {tsState !== 'Active' && !isRestoreAllowed && (
                                            <div style={{ flex: 1, padding: '8px 12px', background: 'rgba(239, 68, 68, 0.1)', border: '1px solid rgba(239, 68, 68, 0.2)', borderRadius: '8px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px' }}>
                                              <AlertCircle size={14} color="#ef4444" />
                                              <span style={{ fontSize: '12px', color: '#ef4444' }}>Network locked (Billing Constraints)</span>
                                            </div>
                                          )}
                                        </div>
                                        {/* Escalate Dropdown — only when network is unlocked/active */}
                                        {tsState === 'Active' && (() => {
                                          const dropKey = sub.id;
                                          const isOpen = escalationDropdownOpen === dropKey;
                                          const isProblemPlan = !isValidPlan;
                                          return (
                                            <div style={{ position: 'relative', width: '100%' }}>
                                              {/* Trigger button */}
                                              <button
                                                onClick={() => setEscalationDropdownOpen(isOpen ? null : dropKey)}
                                                style={{ width: '100%', padding: '8px 12px', background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.3)', color: '#ef4444', borderRadius: '8px', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px', fontSize: '12px', fontWeight: 600, transition: 'all 0.2s' }}
                                                onMouseOver={e => { if (!isOpen) e.currentTarget.style.background = 'rgba(239,68,68,0.16)'; }}
                                                onMouseOut={e => { e.currentTarget.style.background = isOpen ? 'rgba(239,68,68,0.16)' : 'rgba(239,68,68,0.08)'; }}
                                              >
                                                <ShieldAlert size={13} />
                                                Escalate Issue
                                                <span style={{ marginLeft: 'auto', fontSize: '10px', opacity: 0.7 }}>{isOpen ? '▲' : '▼'}</span>
                                              </button>

                                              {/* Dropdown menu */}
                                              {isOpen && (
                                                <div
                                                  style={{ position: 'absolute', bottom: 'calc(100% + 6px)', left: 0, right: 0, background: '#111', border: '1px solid rgba(239,68,68,0.3)', borderRadius: '10px', overflow: 'hidden', zIndex: 200, boxShadow: '0 -8px 24px rgba(0,0,0,0.6)' }}
                                                >
                                                  {/* Line Issue — always shown */}
                                                  {(() => {
                                                    const k = `line_issue-${sub.id}`;
                                                    const busy = escalatingKey === k;
                                                    return (
                                                      <button
                                                        disabled={busy}
                                                        onClick={() => { setEscalationDropdownOpen(null); handleEscalate('line_issue', c, sub, tsDev); }}
                                                        style={{ width: '100%', padding: '11px 16px', background: 'transparent', border: 'none', borderBottom: '1px solid rgba(255,255,255,0.05)', color: '#ef4444', cursor: busy ? 'not-allowed' : 'pointer', display: 'flex', alignItems: 'center', gap: '10px', fontSize: '13px', fontWeight: 600, opacity: busy ? 0.6 : 1, textAlign: 'left' }}
                                                        onMouseOver={e => { e.currentTarget.style.background = 'rgba(239,68,68,0.12)'; }}
                                                        onMouseOut={e => { e.currentTarget.style.background = 'transparent'; }}
                                                      >
                                                        {busy ? <Loader2 size={14} style={{ animation: 'spin 1s linear infinite' }} /> : <span style={{ fontSize: '16px' }}>🔴</span>}
                                                        <div>
                                                          <div>Escalate Line Issue</div>
                                                          <div style={{ fontSize: '11px', color: '#9ca3af', fontWeight: 400 }}>Line is active but not working properly</div>
                                                        </div>
                                                      </button>
                                                    );
                                                  })()}

                                                  {/* Plan Issue — only if plan is in PROBLEM_SKUS */}
                                                  {isProblemPlan && (() => {
                                                    const k = `plan_issue-${sub.id}`;
                                                    const busy = escalatingKey === k;
                                                    return (
                                                      <button
                                                        disabled={busy}
                                                        onClick={() => { setEscalationDropdownOpen(null); handleEscalate('plan_issue', c, sub, tsDev); }}
                                                        style={{ width: '100%', padding: '11px 16px', background: 'transparent', border: 'none', borderBottom: '1px solid rgba(255,255,255,0.05)', color: '#f59e0b', cursor: busy ? 'not-allowed' : 'pointer', display: 'flex', alignItems: 'center', gap: '10px', fontSize: '13px', fontWeight: 600, opacity: busy ? 0.6 : 1, textAlign: 'left' }}
                                                        onMouseOver={e => { e.currentTarget.style.background = 'rgba(245,158,11,0.12)'; }}
                                                        onMouseOut={e => { e.currentTarget.style.background = 'transparent'; }}
                                                      >
                                                        {busy ? <Loader2 size={14} style={{ animation: 'spin 1s linear infinite' }} /> : <span style={{ fontSize: '16px' }}>🟡</span>}
                                                        <div>
                                                          <div>Escalate Plan Issue</div>
                                                          <div style={{ fontSize: '11px', color: '#9ca3af', fontWeight: 400 }}>Service plan is on the known problem list</div>
                                                        </div>
                                                      </button>
                                                    );
                                                  })()}

                                                  {/* Meta Issue — always shown */}
                                                  {(() => {
                                                    const k = `meta_issue-${sub.id}`;
                                                    const busy = escalatingKey === k;
                                                    return (
                                                      <button
                                                        disabled={busy}
                                                        onClick={() => { setEscalationDropdownOpen(null); handleEscalate('meta_issue', c, sub, tsDev); }}
                                                        style={{ width: '100%', padding: '11px 16px', background: 'transparent', border: 'none', color: '#3b82f6', cursor: busy ? 'not-allowed' : 'pointer', display: 'flex', alignItems: 'center', gap: '10px', fontSize: '13px', fontWeight: 600, opacity: busy ? 0.6 : 1, textAlign: 'left' }}
                                                        onMouseOver={e => { e.currentTarget.style.background = 'rgba(59,130,246,0.12)'; }}
                                                        onMouseOut={e => { e.currentTarget.style.background = 'transparent'; }}
                                                      >
                                                        {busy ? <Loader2 size={14} style={{ animation: 'spin 1s linear infinite' }} /> : <span style={{ fontSize: '16px' }}>🔵</span>}
                                                        <div>
                                                          <div>Escalate Meta Issue</div>
                                                          <div style={{ fontSize: '11px', color: '#9ca3af', fontWeight: 400 }}>Account config, IMEI, or metadata problem</div>
                                                        </div>
                                                      </button>
                                                    );
                                                  })()}
                                                </div>
                                              )}
                                            </div>
                                          );
                                        })()}
                                      </div>
                                    </div>
                                  );
                                })()}

                                {sub.subscription_items?.filter((i: any) => i.item_type === 'addon').length > 0 && (
                                  <div style={{ marginTop: '12px', paddingTop: '12px', borderTop: '1px dashed rgba(255,255,255,0.1)' }}>
                                     <div style={{ fontSize: '12px', color: '#9ca3af', textTransform: 'uppercase', marginBottom: '6px' }}>Addons</div>
                                     {sub.subscription_items.filter((i: any) => i.item_type === 'addon').map((addon: any, aIdx: number) => (
                                       <div key={aIdx} style={{ fontSize: '13px', color: '#e5e7eb', display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}>
                                         <span>{addon.item_price_id}</span>
                                         <span style={{ color: '#a78bfa' }}>${(addon.amount / 100).toFixed(2)}</span>
                                       </div>
                                     ))}
                                  </div>
                                )}

                                {sub.has_scheduled_changes && (
                                  <div style={{ marginTop: '12px', padding: '8px 12px', background: 'rgba(251, 191, 36, 0.1)', borderRadius: '8px', display: 'flex', alignItems: 'center', gap: '8px', border: '1px solid rgba(251, 191, 36, 0.2)' }}>
                                    <Calendar size={14} color="#fbbf24" />
                                    <span style={{ fontSize: '13px', color: '#fbbf24' }}>Scheduled changes pending</span>
                                  </div>
                                )}
                              </div>
                            ))}
                          </div>
                        ) : (
                          <div style={{ fontSize: '14px', color: '#6b7280' }}>No active subscriptions.</div>
                        )}
                      </div>
                    ))
                  )}
                </div>
                )}

                {/* Stripe Explorer Column */}
                {activeTab === 'stripe' && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
                  <h3 style={{ fontSize: '20px', color: '#e5e7eb', margin: 0, display: 'flex', alignItems: 'center', gap: '8px' }}>
                     <DollarSign size={20} color="#818cf8" /> Stripe Explorer
                  </h3>
                  
                  {stripeCustomers.length === 0 ? (
                    <div style={{ padding: '40px', textAlign: 'center', background: 'rgba(20,20,20,0.4)', borderRadius: '16px', border: '1px dashed rgba(255,255,255,0.1)' }}>
                      <span style={{ color: '#6b7280' }}>No Stripe records matched this email.</span>
                    </div>
                  ) : (
                    <>
                      {/* Customer Selection Phase */}
                      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: '16px' }}>
                        {stripeCustomers.map((sc, i) => (
                          <div 
                            key={i} 
                            onClick={async () => {
                              setActiveStripeId(sc.id);
                              setStripeLoading(true);
                              setStripeTxs([]);
                              try {
                                const id = sc.id;
                                const [invsRes, chRes] = await Promise.all([
                                  fetch('/api/ops/actions/stripe', { method: 'POST', body: JSON.stringify({ url: `/v1/invoices?customer=${id}&limit=100` }) }).then(r => r.json()),
                                  fetch('/api/ops/actions/stripe', { method: 'POST', body: JSON.stringify({ url: `/v1/charges?customer=${id}&limit=100` }) }).then(r => r.json())
                                ]);
                                
                                const invData = invsRes?.data?.data || [];
                                const chData = chRes?.data?.data || [];
                                
                                let rawTxRaw: any[] = [];
                                
                                invData.forEach((inv: any) => {
                                  const paid = inv.paid;
                                  const rawStat = inv.status;
                                  const bad = rawStat === 'uncollectible' || rawStat === 'void';
                                  const open = rawStat === 'open' || rawStat === 'draft';
                                  
                                  rawTxRaw.push({
                                    type: 'inv',
                                    id: inv.id,
                                    curr: (inv.currency || 'usd').toUpperCase(),
                                    amount: typeof inv.amount_paid === 'number' && inv.amount_paid > 0 ? inv.amount_paid : (inv.amount_due || 0),
                                    ts: inv.created ? inv.created * 1000 : Date.now(),
                                    desc: inv.description || inv.number || 'Invoice',
                                    statusLabel: paid ? 'Paid' : bad ? 'Uncollectible/Void' : open ? 'Open' : rawStat,
                                    statusClass: paid ? 'ok' : bad ? 'bad' : open ? 'open' : ''
                                  });
                                });

                                chData.forEach((ch: any) => {
                                  const paid = ch.paid && ch.status === 'succeeded';
                                  const ref = ch.refunded || (ch.refunds?.data && ch.refunds.data.length > 0);
                                  const open = ch.status === 'pending';
                                  const fail = ch.status === 'failed';
                                  
                                  rawTxRaw.push({
                                    type: 'ch',
                                    id: ch.id,
                                    curr: (ch.currency || 'usd').toUpperCase(),
                                    amount: typeof ch.amount === 'number' ? ch.amount : 0,
                                    ts: ch.created ? ch.created * 1000 : Date.now(),
                                    desc: ch.description || ch.statement_descriptor || 'Charge',
                                    statusLabel: paid && !ref ? 'Succeeded' : ref ? 'Refunded' : open ? 'Pending' : fail ? 'Failed' : ch.status,
                                    statusClass: paid && !ref ? 'ok' : ref || fail ? 'bad' : open ? 'open' : ''
                                  });
                                });

                                rawTxRaw.sort((a,b) => b.ts - a.ts);
                                const enriched = rawTxRaw.map(t => {
                                  const d = new Date(t.ts);
                                  return { ...t, amtM: t.amount / 100, dateIso: d.toISOString().slice(0,10), dateTxt: d.toLocaleString() };
                                });
                                setStripeTxs(enriched);

                              } catch (e) {
                                console.log('Stripe Load Err', e);
                              }
                              setStripeLoading(false);
                            }}
                            style={{ padding: '16px', background: activeStripeId === sc.id ? 'rgba(99, 102, 241, 0.2)' : 'rgba(20,20,20,0.8)', border: `1px solid ${activeStripeId === sc.id ? 'rgba(99, 102, 241, 0.5)' : 'rgba(99, 102, 241, 0.2)'}`, borderRadius: '12px', cursor: 'pointer', transition: 'all 0.2s' }}
                          >
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                              <div>
                                <div style={{ fontSize: '15px', fontWeight: 600, color: '#e5e7eb' }}>{sc.name || 'Unnamed Record'}</div>
                                <div style={{ fontSize: '13px', color: '#9ca3af', fontFamily: 'monospace' }}>{sc.id}</div>
                              </div>
                              <div style={{ padding: '4px 8px', background: 'rgba(255,255,255,0.05)', borderRadius: '6px', fontSize: '10px', color: '#9ca3af', border: '1px solid rgba(255,255,255,0.1)' }}>
                                {sc.livemode ? 'LIVE' : 'TEST'}
                              </div>
                            </div>
                            <div style={{ fontSize: '12px', color: '#6b7280', marginTop: '12px' }}>
                              Created {new Date(sc.created * 1000).toLocaleDateString()}
                            </div>
                          </div>
                        ))}
                      </div>

                      {/* Transaction Table */}
                      {activeStripeId && (
                        <div style={{ padding: '24px', background: 'rgba(20,20,20,0.8)', border: '1px solid rgba(99, 102, 241, 0.2)', borderRadius: '16px', marginTop: '16px' }}>
                          <h4 style={{ fontSize: '16px', margin: '0 0 16px 0', borderBottom: '1px solid rgba(255,255,255,0.05)', paddingBottom: '16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                            <span>Unified Transaction Ledger</span>
                            <div style={{ display: 'flex', gap: '8px' }}>
                              <select 
                                value={stripeFilterProps.status} 
                                onChange={(e) => setStripeFilterProps({...stripeFilterProps, status: e.target.value})}
                                style={{ background: 'rgba(0,0,0,0.5)', border: '1px solid rgba(255,255,255,0.1)', color: 'white', padding: '6px 12px', borderRadius: '8px', fontSize: '12px' }}
                              >
                                <option value="all">All Statuses</option>
                                <option value="ok">Success/Paid</option>
                                <option value="bad">Failed/Refunded</option>
                                <option value="open">Pending/Open</option>
                              </select>
                            </div>
                          </h4>
                          
                          {stripeLoading ? (
                            <div style={{ display: 'flex', justifyContent: 'center', padding: '40px', color: '#818cf8', alignItems: 'center', gap: '12px' }}>
                              <Loader2 size={24} className="animate-spin" /> Mining Stripe ledgers...
                            </div>
                          ) : (
                            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
                              <thead>
                                <tr style={{ borderBottom: '1px solid rgba(255,255,255,0.1)', color: '#9ca3af', textAlign: 'left' }}>
                                  <th style={{ padding: '12px', fontWeight: 500 }}>Date</th>
                                  <th style={{ padding: '12px', fontWeight: 500 }}>Type</th>
                                  <th style={{ padding: '12px', fontWeight: 500 }}>Amount</th>
                                  <th style={{ padding: '12px', fontWeight: 500 }}>Description</th>
                                  <th style={{ padding: '12px', fontWeight: 500 }}>Status</th>
                                </tr>
                              </thead>
                              <tbody>
                                {(() => {
                                  let filtered = stripeTxs;
                                  if (stripeFilterProps.status !== 'all') {
                                    filtered = filtered.filter(t => t.statusClass === stripeFilterProps.status);
                                  }
                                  if (filtered.length === 0) return <tr><td colSpan={5} style={{ padding: '16px', textAlign: 'center', color: '#6b7280' }}>No transactions match criteria.</td></tr>;
                                  const vol = filtered.reduce((s, t) => s + (isNaN(t.amtM) ? 0 : t.amtM), 0);
                                  
                                  return (
                                    <>
                                      {filtered.map((t, idx) => (
                                        <tr key={idx} style={{ borderBottom: '1px solid rgba(255,255,255,0.05)', backgroundColor: 'transparent', transition: 'background-color 0.2s' }}>
                                          <td style={{ padding: '12px', color: '#d1d5db', whiteSpace: 'nowrap' }}>{t.dateTxt}</td>
                                          <td style={{ padding: '12px', color: '#9ca3af', textTransform: 'uppercase', fontSize: '11px' }}>{t.type}</td>
                                          <td style={{ padding: '12px', color: 'white', fontWeight: 600 }}>${t.amtM.toFixed(2)}</td>
                                          <td style={{ padding: '12px', color: '#9ca3af' }}>{t.desc}</td>
                                          <td style={{ padding: '12px' }}>
                                            <span style={{ 
                                              padding: '4px 8px', borderRadius: '4px', fontSize: '11px', fontWeight: 600,
                                              background: t.statusClass === 'ok' ? 'rgba(16, 185, 129, 0.1)' : t.statusClass === 'bad' ? 'rgba(239, 68, 68, 0.1)' : 'rgba(251, 191, 36, 0.1)',
                                              color: t.statusClass === 'ok' ? '#34d399' : t.statusClass === 'bad' ? '#ef4444' : '#fbbf24'
                                            }}>
                                              {t.statusLabel}
                                            </span>
                                          </td>
                                        </tr>
                                      ))}
                                      <tr style={{ background: 'rgba(255,255,255,0.02)' }}>
                                        <td colSpan={2} style={{ padding: '16px', fontWeight: 600, color: '#e5e7eb' }}>Ledger Summary ({filtered.length})</td>
                                        <td colSpan={3} style={{ padding: '16px', fontWeight: 600, color: '#818cf8' }}>Total Implied Volume: ${vol.toFixed(2)}</td>
                                      </tr>
                                    </>
                                  );
                                })()}
                              </tbody>
                            </table>
                          )}
                        </div>
                      )}
                    </>
                  )}
                </div>
                )}

                {/* Commerce Column (Shopify + Shipstation) */}
                {activeTab === 'commerce' && (
                <div id="section-commerce" style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
                  <h3 style={{ fontSize: '20px', color: '#e5e7eb', margin: 0, display: 'flex', alignItems: 'center', gap: '8px' }}>
                     <Package size={20} color="#fbbf24" /> Commerce Logs
                  </h3>
                  
                  {commerceData.length === 0 ? (
                    <div style={{ padding: '40px', textAlign: 'center', background: 'rgba(20,20,20,0.4)', borderRadius: '16px', border: '1px dashed rgba(255,255,255,0.1)' }}>
                      <span style={{ color: '#6b7280' }}>No Commerce orders found.</span>
                    </div>
                  ) : (
                    commerceData.map((order, i) => (
                      <div key={i} style={{ padding: '24px', background: 'rgba(20,20,20,0.8)', border: '1px solid rgba(251, 191, 36, 0.2)', borderRadius: '16px', boxShadow: '0 8px 32px rgba(0,0,0,0.2)' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '16px' }}>
                          <div>
                            <div style={{ fontWeight: 600, fontSize: '16px' }}>Order #{order.orderNumber}</div>
                            <div style={{ color: '#9ca3af', fontSize: '13px' }}>{new Date(order.orderDate).toLocaleDateString()}</div>
                          </div>
                          <div>
                            <span style={{ 
                                padding: '4px 10px', 
                                borderRadius: '100px', 
                                fontSize: '12px', 
                                background: 'rgba(255,255,255,0.05)',
                                color: '#e5e7eb',
                                border: '1px solid rgba(255,255,255,0.1)'
                              }}>
                                {order.source.toUpperCase()}
                              </span>
                          </div>
                        </div>

                        <div style={{ padding: '16px', background: 'rgba(0,0,0,0.4)', borderRadius: '12px', marginBottom: '16px' }}>
                          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', fontSize: '13px' }}>
                            <div>
                               <span style={{ color: '#9ca3af', display: 'block', marginBottom: '4px' }}>Payment</span>
                               <span style={{ color: order.paymentStatus === 'paid' ? '#10b981' : '#fbbf24' }}>{order.paymentStatus}</span>
                            </div>
                            <div>
                               <span style={{ color: '#9ca3af', display: 'block', marginBottom: '4px' }}>Fulfillment</span>
                               <span style={{ color: 'white' }}>{order.fulfillmentStatus || 'unfulfilled'}</span>
                            </div>
                          </div>
                        </div>

                        {order.tracking && order.tracking.length > 0 && (
                          <div>
                            <span style={{ fontSize: '12px', color: '#9ca3af', textTransform: 'uppercase', letterSpacing: '1px', marginBottom: '8px', display: 'block' }}>Shipments</span>
                            {order.tracking.map((t: any, idx: number) => (
                              <div key={idx} style={{ fontSize: '13px', display: 'flex', alignItems: 'center', gap: '8px', background: 'rgba(255,255,255,0.03)', padding: '8px 12px', borderRadius: '8px', border: '1px solid rgba(255,255,255,0.05)' }}>
                                <span style={{ color: '#fbbf24' }}>{t.carrier}</span>
                                {t.trackingUrl ? (
                                  <a href={t.trackingUrl} target="_blank" style={{ color: '#60a5fa', textDecoration: 'none' }}>{t.trackingNumber}</a>
                                ) : (
                                  <span style={{ color: 'white' }}>{t.trackingNumber}</span>
                                )}
                              </div>
                            ))}
                          </div>
                        )}
                        
                        {(order.iccid || order.imei) && (
                          <div style={{ marginTop: '16px', padding: '12px', background: 'rgba(248, 113, 113, 0.1)', borderRadius: '8px', border: '1px solid rgba(248, 113, 113, 0.2)' }}>
                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                              {order.iccid && (() => {
                                const iccid = order.iccid;
                                const isValidIccid = iccid && iccid.length === 20 && iccid.startsWith('89148');
                                return (
                                  <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                                    <div
                                      title={!isValidIccid ? "Incorrect ICCID get it updated" : undefined}
                                      style={{ 
                                        display: 'flex', 
                                        alignItems: 'center',
                                        background: !isValidIccid ? 'rgba(239, 68, 68, 0.1)' : 'transparent',
                                        boxShadow: !isValidIccid ? '0 0 8px rgba(239, 68, 68, 0.6)' : 'none',
                                        border: !isValidIccid ? '1px solid #ef4444' : 'none',
                                        padding: !isValidIccid ? '4px 8px' : '0',
                                        borderRadius: '4px',
                                        transition: 'all 0.3s ease',
                                        cursor: !isValidIccid ? 'help' : 'default'
                                      }}
                                    >
                                      <div>
                                        <div style={{ fontSize: '12px', color: '#f87171', marginBottom: '4px' }}>ACTIVATED ICCID</div>
                                        <div style={{ fontFamily: 'monospace', color: !isValidIccid ? '#ef4444' : 'white', fontSize: '13px', fontWeight: !isValidIccid ? 700 : 400 }}>{iccid}</div>
                                      </div>
                                      {!isValidIccid && <AlertTriangle size={14} color="#ef4444" style={{ marginLeft: '8px' }} />}
                                    </div>
                                    <button 
                                      onClick={() => activeUsageIccid === iccid ? setActiveUsageIccid(null) : fetchUsage(iccid)}
                                      style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', color: '#e5e7eb', padding: '6px', borderRadius: '4px', fontSize: '11px', cursor: 'pointer', display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '6px', marginTop: '4px' }}
                                    >
                                      <BarChart2 size={12} /> Analyze Usage
                                    </button>
                                  </div>
                                );
                              })()}
                              {order.imei && (
                                <div>
                                  <div style={{ fontSize: '12px', color: '#f87171', marginBottom: '4px' }}>ACTIVATED IMEI</div>
                                  <div style={{ fontFamily: 'monospace', color: 'white', fontSize: '13px' }}>{order.imei}</div>
                                </div>
                              )}
                            </div>
                          </div>
                        )}
                      </div>
                    ))
                  )}
                </div>
                )}

                {/* Support Column */}
                {activeTab === 'support' && (
                <div id="section-support" style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
                  <h3 style={{ fontSize: '20px', color: '#e5e7eb', margin: 0, display: 'flex', alignItems: 'center', gap: '8px' }}>
                     <Activity size={20} color="#60a5fa" /> Support Communications
                  </h3>
                  
                  {freescoutData.length === 0 ? (
                    <div style={{ padding: '40px', textAlign: 'center', background: 'rgba(20,20,20,0.4)', borderRadius: '16px', border: '1px dashed rgba(255,255,255,0.1)' }}>
                      <span style={{ color: '#6b7280' }}>No active tickets linked.</span>
                    </div>
                  ) : (
                    freescoutData.map((ticket, i) => (
                      <div 
                        key={i} 
                        onClick={() => handleViewTicket(ticket)}
                        style={{ padding: '24px', background: 'rgba(20,20,20,0.8)', border: '1px solid rgba(96, 165, 250, 0.2)', borderRadius: '16px', boxShadow: '0 8px 32px rgba(0,0,0,0.2)', cursor: 'pointer', transition: 'all 0.2s', ...({ ':hover': { borderColor: 'rgba(96, 165, 250, 0.5)' } } as any) }}
                      >
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '12px' }}>
                          <div>
                            <div style={{ color: '#9ca3af', fontSize: '13px', marginBottom: '4px' }}>Ticket #{ticket.number}</div>
                            <div style={{ color: '#e5e7eb', fontSize: '15px', fontWeight: 600, lineHeight: 1.4, wordBreak: 'break-word' }}>{ticket.subject}</div>
                          </div>
                          <span style={{ 
                            padding: '4px 10px', 
                            borderRadius: '100px', 
                            fontSize: '12px', 
                            fontWeight: 600,
                            background: ticket.status === 'active' || ticket.status === 'pending' ? 'rgba(245, 158, 11, 0.1)' : 'rgba(16, 185, 129, 0.1)',
                            color: ticket.status === 'active' || ticket.status === 'pending' ? '#f59e0b' : '#10b981',
                            border: `1px solid ${ticket.status === 'active' || ticket.status === 'pending' ? 'rgba(245, 158, 11, 0.3)' : 'rgba(16, 185, 129, 0.3)'}`,
                            whiteSpace: 'nowrap',
                            marginLeft: '12px'
                          }}>
                            {String(ticket.status === 1 ? 'ACTIVE' : ticket.status === 2 ? 'PENDING' : ticket.status === 3 ? 'CLOSED' : ticket.status === 4 ? 'SPAM' : ticket.status).toUpperCase()}
                          </span>
                        </div>
                        <div style={{ color: '#9ca3af', fontSize: '13px', lineHeight: 1.6, marginBottom: '16px', fontStyle: 'italic', background: 'rgba(0,0,0,0.3)', padding: '12px', borderRadius: '8px' }}>
                          "{ticket.preview}"
                        </div>
                        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px', color: '#6b7280' }}>
                          <span>Updated: {new Date(ticket.updatedAt).toLocaleDateString()}</span>
                          <span>Assignee: {ticket.assignee ? `${ticket.assignee.firstName} ${ticket.assignee.lastName}` : 'Unassigned'}</span>
                        </div>
                      </div>
                    ))
                  )}
                </div>
                )}

                {/* Network / ThingSpace Isolated View */}
                {activeTab === 'network' && (
                <div id="section-network" style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
                  <h3 style={{ fontSize: '20px', color: '#e5e7eb', margin: 0, display: 'flex', alignItems: 'center', gap: '8px' }}>
                     <Zap size={20} color="#f87171" /> Verizon Network Lines
                  </h3>
                  {Object.keys(thingspaceData).length === 0 ? (
                    <div style={{ padding: '40px', textAlign: 'center', background: 'rgba(20,20,20,0.4)', borderRadius: '16px', border: '1px dashed rgba(255,255,255,0.1)' }}>
                      <span style={{ color: '#6b7280' }}>No network lines found for this profile.</span>
                    </div>
                  ) : (
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: '16px' }}>
                      {Object.keys(thingspaceData).map((iccid) => {
                        const tsDev = thingspaceData[iccid];
                        const tsStateRaw = tsDev.carrierInformations?.[0]?.state || tsDev.state || 'Unknown';
                        const tsState = tsStateRaw.toLowerCase() === 'active' ? 'Active' : tsStateRaw;
                        const imei = tsDev.deviceIds?.find((d:any)=>d.kind==='imei')?.id || tsDev.extendedAttributes?.find((d:any)=>d.key==='PreIMEI')?.value || 'N/A';
                        const mdn = tsDev.deviceIds?.find((d:any)=>d.kind==='mdn')?.id || 'N/A';
                        const ip = tsDev.ipAddress || 'Disconnected';
                        
                        const isValidIccid = iccid && iccid.length === 20 && iccid.startsWith('89148');
                        const rawPlan = tsDev.carrierInformations?.[0]?.servicePlan || 'N/A';
                        const isValidPlan = rawPlan && rawPlan !== 'N/A' && rawPlan.trim() !== '' && !PROBLEM_SKUS.includes(rawPlan);
                        
                        return (
                          <div key={iccid} style={{ padding: '16px', background: 'rgba(248, 113, 113, 0.05)', borderRadius: '12px', border: '1px solid rgba(248, 113, 113, 0.2)' }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '12px' }}>
                              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                <Zap size={16} color="#f87171" />
                                <span style={{ fontSize: '14px', color: '#e5e7eb', fontWeight: 600 }}>Verizon Line</span>
                              </div>
                              <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                                <div style={{ width: '8px', height: '8px', borderRadius: '50%', background: tsState.toLowerCase() === 'active' ? '#10b981' : tsState.toLowerCase().startsWith('pending') ? '#f59e0b' : '#ef4444' }} />
                                <span style={{ fontSize: '12px', color: tsState.toLowerCase().startsWith('pending') ? '#f59e0b' : 'white', fontWeight: 500, textTransform: 'uppercase' }}>{tsState}</span>
                              </div>
                            </div>
                            
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', fontSize: '12px' }}>
                               <div
                                 title={!isValidIccid ? "Incorrect ICCID get it updated" : undefined}
                                 style={{ 
                                   display: 'flex', 
                                   alignItems: 'center',
                                   background: !isValidIccid ? 'rgba(239, 68, 68, 0.1)' : 'transparent',
                                   boxShadow: !isValidIccid ? '0 0 8px rgba(239, 68, 68, 0.6)' : 'none',
                                   border: !isValidIccid ? '1px solid #ef4444' : 'none',
                                   padding: !isValidIccid ? '4px 8px' : '0',
                                   borderRadius: '4px',
                                   transition: 'all 0.3s ease',
                                   cursor: !isValidIccid ? 'help' : 'default'
                                 }}
                               >
                                 <span style={{ color: '#9ca3af', width: !isValidIccid ? 'auto' : '80px', marginRight: !isValidIccid ? '8px' : '0', display: 'inline-block' }}>ICCID:</span> 
                                 <span style={{ color: !isValidIccid ? '#ef4444' : '#f87171', fontFamily: 'monospace', fontWeight: !isValidIccid ? 700 : 400 }}>{iccid}</span>
                                 {!isValidIccid && <AlertTriangle size={14} color="#ef4444" style={{ marginLeft: '8px' }} />}
                               </div>

                               <div><span style={{ color: '#9ca3af', width: '80px', display: 'inline-block' }}>IMEI:</span> <span style={{ color: '#a78bfa', fontFamily: 'monospace' }}>{imei}</span></div>
                               <div><span style={{ color: '#9ca3af', width: '80px', display: 'inline-block' }}>NUMBER:</span> <span style={{ color: 'white' }}>{mdn}</span></div>

                               <div
                                 title={!isValidPlan ? "Incorrect Service Plan get it updated" : undefined}
                                 style={{ 
                                   display: 'flex', 
                                   alignItems: 'center',
                                   background: !isValidPlan ? 'rgba(239, 68, 68, 0.1)' : 'transparent',
                                   boxShadow: !isValidPlan ? '0 0 8px rgba(239, 68, 68, 0.6)' : 'none',
                                   border: !isValidPlan ? '1px solid #ef4444' : 'none',
                                   padding: !isValidPlan ? '4px 8px' : '0',
                                   borderRadius: '4px',
                                   transition: 'all 0.3s ease',
                                   cursor: !isValidPlan ? 'help' : 'default'
                                 }}
                               >
                                 <span style={{ color: '#9ca3af', width: !isValidPlan ? 'auto' : '80px', marginRight: !isValidPlan ? '8px' : '0', display: 'inline-block' }}>PLAN:</span> 
                                 <span style={{ color: !isValidPlan ? '#ef4444' : 'white', fontWeight: !isValidPlan ? 700 : 400 }}>{rawPlan}</span>
                                 {!isValidPlan && <AlertTriangle size={14} color="#ef4444" style={{ marginLeft: '8px' }} />}
                               </div>
                               <div><span style={{ color: '#9ca3af', width: '80px', display: 'inline-block' }}>IP ADDR:</span> <span style={{ color: 'white', fontFamily: 'monospace' }}>{ip}</span></div>
                            </div>

                            <button 
                              onClick={() => activeUsageIccid === iccid ? setActiveUsageIccid(null) : fetchUsage(iccid)}
                              style={{ width: '100%', marginTop: '16px', background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', color: '#e5e7eb', padding: '10px', borderRadius: '8px', fontSize: '13px', cursor: 'pointer', display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '8px' }}
                            >
                              <BarChart2 size={16} /> {activeUsageIccid === iccid ? 'Close Analytics' : 'Analyze Usage'}
                            </button>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
                )}
                
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* FreeScout Threads Modal Overlay */}
        <AnimatePresence>
          {activeTicket && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              style={{
                position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
                background: 'rgba(0,0,0,0.8)', backdropFilter: 'blur(10px)',
                zIndex: 999, display: 'flex', justifyContent: 'center', alignItems: 'center', padding: '24px'
              }}
            >
              <motion.div
                initial={{ y: 50, scale: 0.95 }}
                animate={{ y: 0, scale: 1 }}
                exit={{ y: 50, scale: 0.95 }}
                style={{
                  background: '#111', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '24px',
                  width: '100%', maxWidth: '800px', maxHeight: '90vh',
                  display: 'flex', flexDirection: 'column', overflow: 'hidden', boxShadow: '0 24px 64px rgba(0,0,0,0.5)'
                }}
              >
                <div style={{ padding: '24px', borderBottom: '1px solid rgba(255,255,255,0.05)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'rgba(20,20,20,0.9)' }}>
                  <div>
                    <div style={{ color: '#60a5fa', fontSize: '13px', fontWeight: 600, marginBottom: '6px' }}>TICKET #{activeTicket.number}</div>
                    <div style={{ color: 'white', fontSize: '18px', fontWeight: 600 }}>{activeTicket.subject}</div>
                  </div>
                  <button onClick={() => { setActiveTicket(null); setActiveThreads([]); }} style={{ background: 'rgba(255,255,255,0.1)', border: 'none', color: 'white', padding: '8px', borderRadius: '50%', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <X size={20} />
                  </button>
                </div>

                <div style={{ padding: '24px', overflowY: 'auto', flex: 1, display: 'flex', flexDirection: 'column', gap: '24px', background: '#0a0a0a' }}>
                  {isTicketLoading ? (
                    <div style={{ display: 'flex', justifyContent: 'center', padding: '40px', color: '#60a5fa' }}>
                      <Loader2 size={32} style={{ animation: 'spin 1s linear infinite' }} />
                    </div>
                  ) : activeThreads.length === 0 ? (
                    <div style={{ color: '#6b7280', textAlign: 'center', padding: '40px' }}>No conversation history found.</div>
                  ) : (
                    activeThreads.map((thread: any, idx: number) => {
                      const isCustomer = thread.createdBy?.type === 'customer' || thread.type === 'customer';
                      return (
                        <div key={idx} style={{ alignSelf: isCustomer ? 'flex-end' : 'flex-start', maxWidth: '85%' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '6px', justifyContent: isCustomer ? 'flex-end' : 'flex-start' }}>
                            <div style={{ fontSize: '12px', color: '#9ca3af', fontWeight: 500 }}>{thread.createdBy?.firstName} {thread.createdBy?.lastName}</div>
                            <div style={{ fontSize: '11px', color: '#6b7280' }}>{new Date(thread.createdAt).toLocaleString()}</div>
                          </div>
                          <div style={{
                            background: isCustomer ? 'rgba(96, 165, 250, 0.15)' : 'rgba(255,255,255,0.05)',
                            border: `1px solid ${isCustomer ? 'rgba(96, 165, 250, 0.3)' : 'rgba(255,255,255,0.1)'}`,
                            padding: '16px 20px', borderRadius: isCustomer ? '24px 24px 4px 24px' : '24px 24px 24px 4px',
                            color: '#e5e7eb', fontSize: '14px', lineHeight: 1.6,
                            whiteSpace: 'pre-wrap'
                          }}>
                            {/* Strip basic HTML from thread body since it's raw from FreeScout */}
                            {(thread.body || thread.text || '').replace(/<[^>]*>?/gm, '')}
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Chargebee Financials Modal Overlay */}
        <AnimatePresence>
          {activeCbSub && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              style={{
                position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
                background: 'rgba(0,0,0,0.8)', backdropFilter: 'blur(10px)',
                zIndex: 999, display: 'flex', justifyContent: 'center', alignItems: 'center', padding: '24px'
              }}
            >
              <motion.div
                initial={{ y: 50, scale: 0.95 }}
                animate={{ y: 0, scale: 1 }}
                exit={{ y: 50, scale: 0.95 }}
                style={{
                  background: '#111', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '24px',
                  width: '100%', maxWidth: '800px', height: '80vh',
                  display: 'flex', flexDirection: 'column', overflow: 'hidden', boxShadow: '0 24px 64px rgba(0,0,0,0.5)'
                }}
              >
                {/* Modal Header */}
                <div style={{ padding: '24px', borderBottom: '1px solid rgba(255,255,255,0.05)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'rgba(20,20,20,0.9)' }}>
                  <div>
                    <div style={{ color: '#a78bfa', fontSize: '13px', fontWeight: 600, marginBottom: '6px' }}>SUBSCRIPTION #{activeCbSub.id}</div>
                    <div style={{ color: 'white', fontSize: '18px', fontWeight: 600 }}>{activeCbCustomer?.firstName} {activeCbCustomer?.lastName}</div>
                  </div>
                  <button onClick={() => { setActiveCbSub(null); setCbFinancials(null); }} style={{ background: 'rgba(255,255,255,0.1)', border: 'none', color: 'white', padding: '8px', borderRadius: '50%', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <X size={20} />
                  </button>
                </div>

                {/* Tab Navigation */}
                <div style={{ display: 'flex', padding: '0 24px', borderBottom: '1px solid rgba(255,255,255,0.05)', background: 'rgba(15,15,15,1)' }}>
                  {[
                    { id: 'comments', label: 'Comments' },
                    { id: 'invoices', label: 'Invoices' },
                    { id: 'transactions', label: 'Transactions' },
                    { id: 'creditNotes', label: 'Credit Notes' }
                  ].map(tab => (
                    <button
                      key={tab.id}
                      onClick={() => setCbTab(tab.id as any)}
                      style={{
                        padding: '16px 20px',
                        background: 'none',
                        border: 'none',
                        borderBottom: cbTab === tab.id ? '2px solid #a78bfa' : '2px solid transparent',
                        color: cbTab === tab.id ? '#a78bfa' : '#6b7280',
                        fontWeight: 600,
                        fontSize: '13px',
                        cursor: 'pointer',
                        transition: 'all 0.2s'
                      }}
                    >
                      {tab.label}
                    </button>
                  ))}
                </div>

                {/* Tab Content */}
                <div style={{ padding: '24px', overflowY: 'auto', flex: 1, display: 'flex', flexDirection: 'column', gap: '16px', background: '#0a0a0a' }}>
                  {isCbLoading ? (
                    <div style={{ display: 'flex', justifyContent: 'center', padding: '40px', color: '#a78bfa' }}>
                      <Loader2 size={32} style={{ animation: 'spin 1s linear infinite' }} />
                    </div>
                  ) : !cbFinancials ? (
                    <div style={{ color: '#6b7280', textAlign: 'center', padding: '40px' }}>Failed to retrieve connection logic.</div>
                  ) : (
                    <>
                      {/* Comments View */}
                      {cbTab === 'comments' && (
                        <>
                          {cbFinancials.comments?.length === 0 && <div style={{ color: '#6b7280', textAlign: 'center', padding: '40px' }}>No comments recorded on this subscription.</div>}
                          {cbFinancials.comments.map((comment: any, idx: number) => (
                            <div key={idx} style={{ background: 'rgba(255,255,255,0.05)', padding: '16px', borderRadius: '12px' }}>
                              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px' }}>
                                <span style={{ color: '#a78bfa', fontSize: '13px', fontWeight: 600 }}>{comment.added_by}</span>
                                <span style={{ color: '#6b7280', fontSize: '12px' }}>{new Date(comment.created_at * 1000).toLocaleString()}</span>
                              </div>
                              <div style={{ color: '#e5e7eb', fontSize: '14px', whiteSpace: 'pre-wrap', lineHeight: 1.5 }}>{comment.notes}</div>
                            </div>
                          ))}
                        </>
                      )}

                      {/* Invoices View */}
                      {cbTab === 'invoices' && (
                        <>
                          {cbFinancials.invoices?.length === 0 && <div style={{ color: '#6b7280', textAlign: 'center', padding: '40px' }}>No invoices linked to this subscription.</div>}
                          {cbFinancials.invoices.map((inv: any, idx: number) => (
                            <div key={idx} style={{ display: 'flex', justifyContent: 'space-between', background: 'rgba(255,255,255,0.05)', padding: '16px', borderRadius: '12px', alignItems: 'center' }}>
                              <div>
                                <div style={{ color: 'white', fontWeight: 600, fontSize: '15px' }}>${(inv.total / 100).toFixed(2)}</div>
                                <div style={{ color: '#9ca3af', fontSize: '12px', marginTop: '4px' }}>{inv.id} • {new Date(inv.date * 1000).toLocaleDateString()}</div>
                              </div>
                              <span style={{ padding: '4px 10px', borderRadius: '100px', fontSize: '11px', fontWeight: 600, textTransform: 'uppercase', background: inv.status === 'paid' ? 'rgba(16,185,129,0.1)' : 'rgba(239,68,68,0.1)', color: inv.status === 'paid' ? '#10b981' : '#ef4444' }}>
                                {inv.status}
                              </span>
                            </div>
                          ))}
                        </>
                      )}

                      {/* Transactions View */}
                      {cbTab === 'transactions' && (
                        <>
                          {cbFinancials.transactions?.length === 0 && <div style={{ color: '#6b7280', textAlign: 'center', padding: '40px' }}>No transactions recorded for this customer core.</div>}
                          {cbFinancials.transactions.map((tx: any, idx: number) => (
                            <div key={idx} style={{ display: 'flex', justifyContent: 'space-between', background: 'rgba(255,255,255,0.05)', padding: '16px', borderRadius: '12px', alignItems: 'center' }}>
                              <div>
                                <div style={{ color: 'white', fontWeight: 600, fontSize: '15px' }}>${(tx.amount / 100).toFixed(2)}</div>
                                <div style={{ color: '#9ca3af', fontSize: '12px', marginTop: '4px' }}>{tx.id} • {new Date(tx.date * 1000).toLocaleDateString()}</div>
                                {tx.payment_method && <div style={{ color: '#6b7280', fontSize: '11px', marginTop: '2px' }}>Method: {tx.payment_method.toUpperCase()}</div>}
                              </div>
                              <span style={{ padding: '4px 10px', borderRadius: '100px', fontSize: '11px', fontWeight: 600, textTransform: 'uppercase', background: tx.status === 'success' ? 'rgba(16,185,129,0.1)' : 'rgba(239,68,68,0.1)', color: tx.status === 'success' ? '#10b981' : '#ef4444' }}>
                                {tx.status}
                              </span>
                            </div>
                          ))}
                        </>
                      )}

                      {/* Credit Notes View */}
                      {cbTab === 'creditNotes' && (
                        <>
                          {cbFinancials.creditNotes?.length === 0 && <div style={{ color: '#6b7280', textAlign: 'center', padding: '40px' }}>No credit notes logged against this customer core.</div>}
                          {cbFinancials.creditNotes.map((cn: any, idx: number) => (
                            <div key={idx} style={{ display: 'flex', justifyContent: 'space-between', background: 'rgba(255,255,255,0.05)', padding: '16px', borderRadius: '12px', alignItems: 'flex-start' }}>
                              <div>
                                <div style={{ color: 'white', fontWeight: 600, fontSize: '15px' }}>${(cn.total / 100).toFixed(2)} Refund/Note</div>
                                <div style={{ color: '#9ca3af', fontSize: '12px', marginTop: '4px' }}>{cn.id} • {new Date(cn.date * 1000).toLocaleDateString()}</div>
                                {cn.reason_code && <div style={{ color: '#f59e0b', fontSize: '11px', marginTop: '6px' }}>Reason: {cn.reason_code.toUpperCase()}</div>}
                              </div>
                              <span style={{ padding: '4px 10px', borderRadius: '100px', fontSize: '11px', fontWeight: 600, textTransform: 'uppercase', background: cn.status === 'refunded' ? 'rgba(16,185,129,0.1)' : 'rgba(107,114,128,0.1)', color: cn.status === 'refunded' ? '#10b981' : '#d1d5db' }}>
                                {cn.status}
                              </span>
                            </div>
                          ))}
                        </>
                      )}
                    </>
                  )}
                </div>
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>

      </main>

      {/* Global Usage Telemetry Modal Overlay */}
      <AnimatePresence>
        {activeUsageIccid && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            style={{
              position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
              background: 'rgba(0,0,0,0.85)', backdropFilter: 'blur(12px)',
              zIndex: 1000, display: 'flex', justifyContent: 'center', alignItems: 'center', padding: '24px'
            }}
          >
            <motion.div
              initial={{ y: 50, scale: 0.95 }}
              animate={{ y: 0, scale: 1 }}
              exit={{ y: 50, scale: 0.95 }}
              style={{
                background: '#111', border: '1px solid rgba(248,113,113,0.3)', borderRadius: '24px',
                width: '100%', maxWidth: '800px',
                display: 'flex', flexDirection: 'column', overflow: 'hidden', boxShadow: '0 24px 64px rgba(248,113,113,0.15)'
              }}
            >
              <div style={{ padding: '24px', borderBottom: '1px solid rgba(248,113,113,0.1)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'rgba(20,20,20,0.9)' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                  <BarChart2 size={24} color="#f87171" />
                  <div>
                    <div style={{ color: '#f87171', fontSize: '12px', fontWeight: 600, marginBottom: '2px', textTransform: 'uppercase', letterSpacing: '1px' }}>Network Telemetry</div>
                    <div style={{ color: 'white', fontSize: '18px', fontWeight: 600, fontFamily: 'monospace' }}>{activeUsageIccid}</div>
                  </div>
                </div>
                <button onClick={() => setActiveUsageIccid(null)} style={{ background: 'rgba(255,255,255,0.1)', border: 'none', color: 'white', padding: '8px', borderRadius: '50%', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <X size={20} />
                </button>
              </div>

              <div style={{ padding: '24px', flex: 1, display: 'flex', flexDirection: 'column', gap: '24px', background: '#0a0a0a' }}>
                <div style={{ display: 'flex', gap: '16px', alignItems: 'flex-end' }}>
                  <div style={{ flex: 1 }}>
                    <label style={{ display: 'block', fontSize: '11px', color: '#9ca3af', marginBottom: '6px', fontWeight: 500, letterSpacing: '0.5px' }}>EARLIEST SCAN RANGE</label>
                    <input type="date" value={usageEarliest} onChange={e => setUsageEarliest(e.target.value)} style={{ width: '100%', background: 'rgba(0,0,0,0.5)', border: '1px solid rgba(255,255,255,0.1)', color: 'white', padding: '12px', borderRadius: '8px', outline: 'none', colorScheme: 'dark', fontSize: '14px' }} />
                  </div>
                  <div style={{ flex: 1 }}>
                    <label style={{ display: 'block', fontSize: '11px', color: '#9ca3af', marginBottom: '6px', fontWeight: 500, letterSpacing: '0.5px' }}>LATEST SCAN RANGE</label>
                    <input type="date" value={usageLatest} onChange={e => setUsageLatest(e.target.value)} style={{ width: '100%', background: 'rgba(0,0,0,0.5)', border: '1px solid rgba(255,255,255,0.1)', color: 'white', padding: '12px', borderRadius: '8px', outline: 'none', colorScheme: 'dark', fontSize: '14px' }} />
                  </div>
                  <button onClick={() => fetchUsage(activeUsageIccid!)} disabled={usageLoading} style={{ height: '43px', background: '#f87171', color: 'white', border: 'none', padding: '0 24px', borderRadius: '8px', cursor: usageLoading ? 'not-allowed' : 'pointer', opacity: usageLoading ? 0.7 : 1, display: 'flex', alignItems: 'center', gap: '8px', fontWeight: 600 }}>
                    {usageLoading ? <Loader2 size={18} className="animate-spin" /> : <Play size={18} />} PULL
                  </button>
                </div>

                {usageLoading ? (
                  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '60px 0', gap: '16px' }}>
                    <Loader2 className="animate-spin" color="#f87171" size={32} />
                    <span style={{ color: '#9ca3af', fontSize: '14px', animation: 'pulse 2s infinite' }}>Querying ThingSpace Matrix...</span>
                  </div>
                ) : usageError ? (
                  <div style={{ display: 'flex', alignItems: 'center', gap: '12px', color: '#ef4444', fontSize: '14px', padding: '24px', background: 'rgba(239,68,68,0.1)', borderRadius: '12px', border: '1px solid rgba(239,68,68,0.2)' }}>
                    <AlertTriangle size={24} /> {usageError}
                  </div>
                ) : usageData.length === 0 ? (
                  <div style={{ color: '#9ca3af', fontSize: '15px', textAlign: 'center', padding: '40px', background: 'rgba(255,255,255,0.03)', borderRadius: '12px', border: '1px dashed rgba(255,255,255,0.1)' }}>
                    No raw telemetry emitted natively by this network tower during this phase frame.
                  </div>
                ) : (
                  <div style={{ height: '300px', width: '100%', background: 'rgba(0,0,0,0.3)', padding: '24px', borderRadius: '12px', border: '1px solid rgba(255,255,255,0.05)' }}>
                    <ResponsiveContainer width="100%" height="100%">
                      <AreaChart data={usageData} margin={{ top: 5, right: 0, left: -20, bottom: 0 }}>
                        <defs>
                          <linearGradient id="usageGradientModal" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="5%" stopColor="#f87171" stopOpacity={0.6}/>
                            <stop offset="95%" stopColor="#f87171" stopOpacity={0}/>
                          </linearGradient>
                        </defs>
                        <XAxis dataKey="date" stroke="#6b7280" fontSize={11} tickMargin={12} minTickGap={30} />
                        <YAxis stroke="#6b7280" fontSize={11} />
                        <Tooltip contentStyle={{ backgroundColor: 'rgba(20,20,20,0.95)', border: '1px solid rgba(248,113,113,0.3)', borderRadius: '12px', fontSize: '13px', boxShadow: '0 8px 32px rgba(0,0,0,0.5)' }} />
                        <Area type="monotone" dataKey="GB" stroke="#f87171" strokeWidth={3} fillOpacity={1} fill="url(#usageGradientModal)" />
                      </AreaChart>
                    </ResponsiveContainer>
                  </div>
                )}

                <div style={{ fontSize: '12px', color: '#6b7280', lineHeight: 1.6, background: 'rgba(255,255,255,0.02)', padding: '16px', borderRadius: '12px', border: '1px solid rgba(255,255,255,0.05)' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px', color: '#9ca3af', marginBottom: '8px', fontWeight: 600 }}>
                    <Info size={14} /> Data Policy Disclaimer
                  </div>
                  No usage displayed here does not mean the customer didn't use the service; this is a billing-based service, not usage-based. Although rare, all cellular networks occasionally have localized tower outages which result in service disruptions. In the event this happens, downtime credit will be issued for all downtime experienced, if applicable. Credit will be issued from the first point of contact about a technical issue affecting the account. During this time, Customer dues are still owed, and credits will be applied once the issue is resolved. You must contact Nomad for any and all downtime credit requests.<br/>
                  <a href="https://nomadinternet.com/policies/terms-of-service#section-21" target="_blank" style={{ color: '#3b82f6', textDecoration: 'underline', marginTop: '12px', display: 'inline-block', fontWeight: 500 }}>View Section 21 of Terms of Service</a>
                </div>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

