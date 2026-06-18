"use client";

import { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { LogOut, ShieldCheck, Loader2, Search, Package, Zap, CreditCard, Activity, ArrowRight, DollarSign, Calendar, Play, Pause, AlertCircle, Copy, RefreshCw, X, AlertTriangle, ShieldAlert, Check, Info, BarChart2, Sun, Moon, ClipboardList, PhoneCall } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts';
import { useTheme } from '@/components/ThemeProvider';

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

type ReplacementIssueBranch = 'power' | 'internet';
type ReplacementPowerDecision = 'full_unit' | 'power_cord';
type ReplacementInternetDecision = 'stopped_working' | 'never_worked';
type ReplacementType = 'Air' | 'Dragon/Raptor' | 'Omega/Cube' | 'Replacement power cord' | 'Other';
type ReplacementChecklist = {
  checkedOtherSockets: boolean;
  customerMoved: boolean;
  coverageChecked: boolean;
  outageChecked: boolean;
  lineRefreshTried: boolean;
  hardResetTried: boolean;
  deviceMoved: boolean;
};
type ReplacementForm = {
  troubleshootingSteps: string;
  issueBranch: ReplacementIssueBranch | '';
  powerDecision: ReplacementPowerDecision | '';
  internetDecision: ReplacementInternetDecision | '';
  checklist: ReplacementChecklist;
  replacementType: ReplacementType | '';
  customReplacementItem: string;
  replacementReason: string;
  interactionId: string;
  addressChoice: 'confirmed' | 'new' | '';
  newShippingAddress: string;
};
type ReplacementTarget = {
  customer: any;
  subscription: any;
  network?: any;
  shopifyAddress?: string;
};

const EMPTY_REPLACEMENT_FORM: ReplacementForm = {
  troubleshootingSteps: '',
  issueBranch: '',
  powerDecision: '',
  internetDecision: '',
  checklist: {
    checkedOtherSockets: false,
    customerMoved: false,
    coverageChecked: false,
    outageChecked: false,
    lineRefreshTried: false,
    hardResetTried: false,
    deviceMoved: false,
  },
  replacementType: '',
  customReplacementItem: '',
  replacementReason: '',
  interactionId: '',
  addressChoice: '',
  newShippingAddress: '',
};

const REPLACEMENT_TYPES: ReplacementType[] = ['Air', 'Dragon/Raptor', 'Omega/Cube', 'Replacement power cord', 'Other'];
const REPLACEMENT_CHECKLIST_LABELS: { key: keyof ReplacementChecklist; label: string }[] = [
  { key: 'customerMoved', label: 'Did the customer move?' },
  { key: 'coverageChecked', label: 'Did we check coverage?' },
  { key: 'outageChecked', label: 'Did we check for an outage in the area?' },
  { key: 'lineRefreshTried', label: 'Did we try a line refresh?' },
  { key: 'hardResetTried', label: 'Did we try a hard reset?' },
  { key: 'deviceMoved', label: 'Did we try moving/repositioning the device?' },
];
const POWER_REPLACEMENT_CHECKLIST_LABELS: { key: keyof ReplacementChecklist; label: string }[] = [
  { key: 'checkedOtherSockets', label: 'Did we check other sockets?' },
];

const CALLBACK_CATEGORIES: Record<string, { value: string; label: string }[]> = {
  sales: [
    ['product_inquiry', 'Product inquiry'], ['recommendation', 'Recommendation'], ['pricing_promotion', 'Pricing or promotion'],
    ['upgrade_additional_line', 'Upgrade or additional line'], ['order_assistance', 'Order assistance'], ['other', 'Other'],
  ].map(([value, label]) => ({ value, label })),
  internet: [
    ['no_connectivity', 'No connectivity'], ['slow_intermittent', 'Slow or intermittent'], ['activation_setup', 'Activation or setup'],
    ['coverage_signal', 'Coverage or signal'], ['device_troubleshooting', 'Device troubleshooting'], ['outage_follow_up', 'Outage follow-up'], ['other', 'Other'],
  ].map(([value, label]) => ({ value, label })),
  shipment: [
    ['order_status', 'Order status'], ['tracking', 'Tracking'], ['delayed_lost', 'Delayed or lost'], ['address_correction', 'Address correction'],
    ['damaged_missing_item', 'Damaged or missing item'], ['replacement_return_shipment', 'Replacement or return shipment'], ['other', 'Other'],
  ].map(([value, label]) => ({ value, label })),
  billing: [
    ['payment_failure', 'Payment failure'], ['invoice_question', 'Invoice question'], ['incorrect_duplicate_charge', 'Incorrect or duplicate charge'],
    ['refund_credit', 'Refund or credit'], ['pricing_change', 'Pricing change'], ['cancellation_billing', 'Cancellation billing'], ['other', 'Other'],
  ].map(([value, label]) => ({ value, label })),
  general_support: [
    ['account_profile', 'Account or profile'], ['login', 'Login'], ['device_help', 'Device help'], ['documentation', 'Documentation'],
    ['complaint_escalation', 'Complaint or escalation'], ['other', 'Other'],
  ].map(([value, label]) => ({ value, label })),
  cancellation: [
    ['cancel_service', 'Cancel service'], ['retention_request', 'Retention request'], ['equipment_return', 'Equipment return'],
    ['final_bill_refund', 'Final bill or refund'], ['pause_suspend', 'Pause or suspend'], ['other', 'Other'],
  ].map(([value, label]) => ({ value, label })),
};

function formatCommerceAddress(addr: any) {
  if (!addr) return '';
  const cityLine = [
    addr.city,
    [addr.state, addr.zip].filter(Boolean).join(' '),
  ].filter(Boolean).join(', ');
  return [
    addr.name,
    addr.company,
    addr.address1,
    addr.address2,
    cityLine,
    addr.country,
    addr.phone ? `Phone: ${addr.phone}` : '',
  ].filter(Boolean).join('\n').trim();
}

export default function OpsDashboard() {
  const router = useRouter();
  const { theme, toggle: toggleTheme } = useTheme();
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
    <>
    <style dangerouslySetInnerHTML={{__html: ".cb-tab-bar { display: flex; gap: 8px; overflow-x: auto; padding-bottom: 4px; } .cb-tab-bar::-webkit-scrollbar { display: none; } .cb-customer-header { display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 10px; margin-bottom: 16px; padding-bottom: 16px; border-bottom: 1px solid rgba(255,255,255,0.05); } .cb-customer-header-actions { display: flex; gap: 8px; flex-wrap: wrap; } .cb-sub-header { display: flex; justify-content: space-between; align-items: flex-start; flex-wrap: wrap; gap: 8px; margin-bottom: 12px; } .cb-network-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 12px; font-size: 12px; margin-bottom: 16px; } .cb-action-buttons { display: flex; gap: 8px; flex-wrap: wrap; } .cb-action-buttons > button { flex: 1; min-width: 120px; } @media (max-width: 768px) {  .cb-network-grid { grid-template-columns: 1fr 1fr; }  .cb-customer-header { flex-direction: column; align-items: flex-start; }  .cb-sub-header { flex-direction: column; }  .cb-action-buttons { flex-direction: column; }  .cb-action-buttons > button { width: 100%; min-width: unset; } } @media (max-width: 480px) { .cb-network-grid { grid-template-columns: 1fr; } }"}} />
    <div className="ops-app-shell" style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column', color: 'var(--ops-text)' }}>
      {/* Global Header */}
      <header className="ops-topbar" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '16px 32px', borderBottom: '1px solid var(--border)', backgroundColor: 'var(--ops-header-bg)', backdropFilter: 'blur(18px)', zIndex: 100 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <div className="brand-mark">N</div>
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start', lineHeight: 1 }}>
             <div style={{ fontSize: '22px', fontWeight: 800, letterSpacing: 0, color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: '4px' }}>
                Nomad
             </div>
             <div style={{ fontSize: '9px', fontWeight: 800, letterSpacing: '0.22em', color: 'var(--ops-accent)', marginLeft: '2px', marginTop: '2px' }}>
                INTERNET
             </div>
          </div>
          <div style={{ height: '24px', width: '1px', background: 'var(--border)', margin: '0 12px' }} />
          <div>
            <h1 style={{ fontSize: '14px', margin: 0, fontWeight: 700, color: 'var(--text-secondary)' }}>NOC Ecosystem</h1>
            <div style={{ fontSize: '10px', color: 'var(--ops-text-muted)', opacity: 0.8, marginTop: '1px', letterSpacing: '0.04em' }}>Customer intelligence console</div>
          </div>
        </div>
        
        {/* Tab Strip Navigation */}
        <div style={{ flex: 1, margin: '0 40px', display: 'flex', gap: '8px', overflowX: 'auto', paddingBottom: '4px' }}>
          {tabs.map(tab => (
            <div 
              key={tab.id}
              onClick={() => setActiveTabId(tab.id)}
              className="ops-tab"
              data-active={activeTabId === tab.id}
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
              <div style={{ flex: 1, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', fontSize: '13px', color: activeTabId === tab.id ? 'var(--ops-text)' : 'var(--ops-text-muted)', fontWeight: activeTabId === tab.id ? 700 : 500 }}>
                {tab.title}
              </div>
              <button onClick={(e) => handleCloseTab(e, tab.id)} style={{ background: 'transparent', border: 'none', color: 'var(--ops-text-muted)', padding: '2px', cursor: 'pointer', borderRadius: '4px', display: 'flex' }}>
                <X size={12} />
              </button>
            </div>
          ))}
          <button className="ops-secondary-button" onClick={handleCreateTab} style={{ background: 'transparent', border: '1px dashed var(--border)', color: 'var(--ops-text-muted)', borderRadius: '12px', padding: '0 16px', cursor: 'pointer', display: 'flex', alignItems: 'center', transition: 'all 0.2s' }}>
            +
          </button>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          {/* Theme Toggle */}
          <button
            onClick={toggleTheme}
            title={theme === 'light' ? 'Switch to Dark Mode' : 'Switch to Light Mode'}
            className="ops-secondary-button"
            style={{ background: 'var(--surface-200)', border: '1px solid var(--border)', color: 'var(--text-secondary)', padding: '8px 12px', borderRadius: '8px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px', fontSize: '13px', fontWeight: 500, transition: 'all 0.2s' }}
          >
            {theme === 'light' ? <Moon size={15} /> : <Sun size={15} />}
            {theme === 'light' ? 'Dark' : 'Light'}
          </button>

          <button 
            onClick={handleLogout}
            disabled={loggingOut}
            className="ops-secondary-button"
            style={{ background: 'transparent', border: '1px solid var(--border)', color: 'var(--text-secondary)', padding: '8px 16px', borderRadius: '8px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '8px', fontSize: '14px' }}
          >
            {loggingOut ? <Loader2 size={16} className="animate-spin" /> : <LogOut size={16} />} Disconnect
          </button>
        </div>
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
    </>
  );
}


function WorkspaceTab({ id, isVisible, onUpdateTitle }: { id: string; isVisible: boolean; onUpdateTitle: (title: string, error?: boolean) => void }) {
  const [mode, setMode] = useState<'search' | 'results'>('search');
  const [activeTab, setActiveTab] = useState<'chargebee'|'stripe'|'network'|'commerce'|'support'|'returns'|'callbacks'>('chargebee');
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [lastRefresh, setLastRefresh] = useState<number | null>(null);
  const [cooldownSecs, setCooldownSecs] = useState(0);

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

  // Returns Logic States
  const [returnsImei, setReturnsImei] = useState('');
  const [returnsLoading, setReturnsLoading] = useState(false);
  const [returnsError, setReturnsError] = useState('');
  const [returnsData, setReturnsData] = useState<any[] | null>(null);

  // Callback request state
  const [callbackCustomerIndex, setCallbackCustomerIndex] = useState(0);
  const [callbackPhoneChoice, setCallbackPhoneChoice] = useState<'on_file' | 'corrected'>('on_file');
  const [callbackPrimaryPhone, setCallbackPrimaryPhone] = useState('');
  const [callbackSecondaryPhone, setCallbackSecondaryPhone] = useState('');
  const [callbackDepartment, setCallbackDepartment] = useState('');
  const [callbackCategory, setCallbackCategory] = useState('');
  const [callbackPreferredTime, setCallbackPreferredTime] = useState('');
  const [callbackReason, setCallbackReason] = useState('');
  const [callbackHistory, setCallbackHistory] = useState<any[]>([]);
  const [callbackActive, setCallbackActive] = useState<any>(null);
  const [callbackAgentEmail, setCallbackAgentEmail] = useState('');
  const [callbackLoading, setCallbackLoading] = useState(false);
  const [callbackError, setCallbackError] = useState('');
  const [callbackSuccess, setCallbackSuccess] = useState('');

  // Returns Modal Logic
  const [returnsModal, setReturnsModal] = useState<{ imei: string; orderDate?: string } | null>(null);
  const [modalReturnsLoading, setModalReturnsLoading] = useState(false);
  const [modalReturnsError, setModalReturnsError] = useState('');
  const [modalReturnsData, setModalReturnsData] = useState<any[] | null>(null);

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

  // Replacement request workflow
  const [replacementTarget, setReplacementTarget] = useState<ReplacementTarget | null>(null);
  const [replacementForm, setReplacementForm] = useState<ReplacementForm>(EMPTY_REPLACEMENT_FORM);
  const [replacementStep, setReplacementStep] = useState(1);
  const [replacementError, setReplacementError] = useState('');
  const [replacementSubmitting, setReplacementSubmitting] = useState(false);
  const [replacementAgentEmail, setReplacementAgentEmail] = useState('');

  const showEscalationToast = (msg: string, ok: boolean) => {
    setEscalationToast({ msg, ok });
    setTimeout(() => setEscalationToast(null), 4000);
  };

  const ESCALATION_CHANNEL = '#0-urgent-live-calls'; // Escalations channel

  const loadCallbackHistory = async () => {
    if (!email) return;
    try {
      const res = await fetch(`/api/ops/callbacks?email=${encodeURIComponent(email)}`);
      const data = await res.json();
      if (res.ok) {
        setCallbackAgentEmail(data.agentEmail || '');
        setCallbackHistory(data.callbacks || []);
        setCallbackActive(data.activeCallback || null);
      }
    } catch {
      setCallbackError('Could not load callback history.');
    }
  };

  useEffect(() => {
    if (activeTab !== 'callbacks' || !email) return;
    const selectedCustomer = chargebeeData[callbackCustomerIndex] || chargebeeData[0];
    const latestOrder = [...commerceData].sort((a, b) => new Date(b.orderDate || 0).getTime() - new Date(a.orderDate || 0).getTime())[0];
    const onFilePhone = selectedCustomer?.phone || latestOrder?.customerPhone || latestOrder?.shippingAddress?.phone || '';
    if (callbackPhoneChoice === 'on_file') setCallbackPrimaryPhone(onFilePhone);
    void loadCallbackHistory();
  }, [activeTab, email, callbackCustomerIndex, chargebeeData, commerceData, callbackPhoneChoice]);

  const submitCallbackRequest = async (event: React.FormEvent) => {
    event.preventDefault();
    setCallbackError('');
    setCallbackSuccess('');
    const wordCount = callbackReason.trim().split(/\s+/).filter(Boolean).length;
    if (wordCount < 25) {
      setCallbackError(`Add at least 25 words. Current count: ${wordCount}.`);
      return;
    }
    if (!callbackPrimaryPhone.trim() || !callbackDepartment || !callbackCategory || !callbackPreferredTime) {
      setCallbackError('Complete the phone, department, category, and preferred time fields.');
      return;
    }

    const customer = chargebeeData[callbackCustomerIndex] || chargebeeData[0] || {};
    const latestOrder = [...commerceData].sort((a, b) => new Date(b.orderDate || 0).getTime() - new Date(a.orderDate || 0).getTime())[0] || null;
    const subscriptions = customer.subscriptions || [];
    const iccids = subscriptions.map((sub: any) => sub.cf_SIM_ID_ICCID || sub.cf_iccid).filter(Boolean);
    const network = iccids.map((iccid: string) => thingspaceData[iccid]).filter(Boolean);
    const latestFreeScout = [...freescoutData].sort((a, b) => Number(b.id || 0) - Number(a.id || 0))[0];

    setCallbackLoading(true);
    try {
      const res = await fetch('/api/ops/callbacks', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          customerEmail: customer.email || email,
          customerId: customer.id || null,
          customerName: `${customer.firstName || ''} ${customer.lastName || ''}`.trim() || customer.email || email,
          primaryPhone: callbackPrimaryPhone,
          secondaryPhone: callbackSecondaryPhone,
          phoneSource: callbackPhoneChoice,
          department: callbackDepartment,
          category: callbackCategory,
          preferredTime: callbackPreferredTime,
          reason: callbackReason,
          freescoutConversationId: latestFreeScout?.id || null,
          accountSnapshot: {
            customer,
            subscriptions,
            invoices: invoicesData[customer.id] || [],
            transactions: transactionsData[customer.id] || [],
            latestOrder,
            network,
            freescout: freescoutData,
          },
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setCallbackError(data.error || 'Could not create callback request.');
        if (data.activeCallback) setCallbackActive(data.activeCallback);
        return;
      }
      setCallbackSuccess(data.slackWarning
        ? `Callback request created and added to the queue. Slack warning: ${data.slackWarning}`
        : 'Callback request created and added to the queue. Slack notification sent.');
      setCallbackReason('');
      setCallbackSecondaryPhone('');
      setCallbackDepartment('');
      setCallbackCategory('');
      setCallbackPreferredTime('');
      await loadCallbackHistory();
    } catch {
      setCallbackError('Network error while creating the callback request.');
    } finally {
      setCallbackLoading(false);
    }
  };

  const openReplacementModal = async (customer: any, subscription: any) => {
    const iccid = subscription?.cf_SIM_ID_ICCID || subscription?.cf_iccid;
    const latestOrderWithAddress = [...commerceData]
      .filter(order => order?.shippingAddress && formatCommerceAddress(order.shippingAddress))
      .sort((a, b) => new Date(b.orderDate || 0).getTime() - new Date(a.orderDate || 0).getTime())[0];
    setReplacementTarget({
      customer,
      subscription,
      network: iccid ? thingspaceData[iccid] : undefined,
      shopifyAddress: formatCommerceAddress(latestOrderWithAddress?.shippingAddress),
    });
    setReplacementForm(EMPTY_REPLACEMENT_FORM);
    setReplacementStep(1);
    setReplacementError('');
    setReplacementAgentEmail('');
    try {
      const res = await fetch('/api/ops/actions/replacement');
      const data = await res.json();
      if (res.ok && data.agentEmail) setReplacementAgentEmail(data.agentEmail);
    } catch {
      setReplacementAgentEmail('');
    }
  };

  const closeReplacementModal = () => {
    if (replacementSubmitting) return;
    setReplacementTarget(null);
    setReplacementForm(EMPTY_REPLACEMENT_FORM);
    setReplacementStep(1);
    setReplacementError('');
    setReplacementAgentEmail('');
  };

  const updateReplacementForm = (patch: Partial<ReplacementForm>) => {
    setReplacementForm(prev => ({ ...prev, ...patch }));
    setReplacementError('');
  };

  const validateReplacementStep = (step: number) => {
    if (step === 1) return true;
    if (step === 2) {
      if (!replacementForm.issueBranch) return 'Select an issue branch.';
      if (replacementForm.issueBranch === 'power' && !replacementForm.powerDecision) return 'Select full unit replacement or replacement power cord.';
      if (replacementForm.issueBranch === 'internet' && !replacementForm.internetDecision) return 'Select whether this device stopped working or never worked.';
    }
    if (step === 3 && replacementForm.issueBranch === 'internet') {
      const allChecked = REPLACEMENT_CHECKLIST_LABELS.every(item => replacementForm.checklist[item.key]);
      if (!allChecked) return 'Complete every troubleshooting checkbox before proceeding.';
    }
    if (step === 3 && replacementForm.issueBranch === 'power') {
      if (!replacementForm.checklist.checkedOtherSockets) return 'Confirm that other sockets were checked before proceeding.';
    }
    if (step === 4) {
      if (!replacementForm.replacementType) return 'Select what replacement we are sending.';
      if (replacementForm.replacementType === 'Other' && !replacementForm.customReplacementItem.trim()) return 'Type the replacement item when Other is selected.';
    }
    if (step === 5 && !replacementForm.replacementReason.trim()) return 'Add the reason why this replacement is being sent.';
    if (step === 6) {
      if (!replacementForm.addressChoice) return 'Confirm the Shopify address or choose to enter a new address.';
      if (replacementForm.addressChoice === 'confirmed' && !replacementTarget?.shopifyAddress) return 'No Shopify address was found. Enter the replacement shipping address.';
      if (replacementForm.addressChoice === 'new' && !replacementForm.newShippingAddress.trim()) return 'Enter the new replacement shipping address.';
    }
    return true;
  };

  const goReplacementNext = () => {
    const valid = validateReplacementStep(replacementStep);
    if (valid !== true) {
      setReplacementError(valid);
      return;
    }
    setReplacementError('');
    setReplacementStep(step => Math.min(7, step + 1));
  };

  const submitReplacementRequest = async () => {
    if (!replacementTarget) return;
    const valid = validateReplacementStep(5);
    if (valid !== true) {
      setReplacementError(valid);
      return;
    }
    const addressValid = validateReplacementStep(6);
    if (addressValid !== true) {
      setReplacementError(addressValid);
      return;
    }
    setReplacementSubmitting(true);
    setReplacementError('');
    const selectedShippingAddress = replacementForm.addressChoice === 'confirmed'
      ? replacementTarget.shopifyAddress
      : replacementForm.newShippingAddress.trim();
    try {
      const res = await fetch('/api/ops/actions/replacement', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          customer: replacementTarget.customer,
          subscription: replacementTarget.subscription,
          network: replacementTarget.network,
          troubleshootingSteps: replacementForm.troubleshootingSteps,
          issueBranch: replacementForm.issueBranch,
          powerDecision: replacementForm.powerDecision || undefined,
          internetDecision: replacementForm.internetDecision || undefined,
          checklist: replacementForm.checklist,
          replacementType: replacementForm.replacementType,
          customReplacementItem: replacementForm.customReplacementItem,
          replacementReason: replacementForm.replacementReason,
          interactionId: replacementForm.interactionId,
          addressChoice: replacementForm.addressChoice,
          originalShopifyAddress: replacementTarget.shopifyAddress || '',
          shippingAddress: selectedShippingAddress,
          disclaimerAccepted: true,
        }),
      });
      const data = await res.json();
      if (res.ok && data.success) {
        showEscalationToast('✅ Replacement request recorded and sent to Slack.', true);
        closeReplacementModal();
      } else {
        setReplacementError(data.error || 'Replacement request failed.');
      }
    } catch (err: any) {
      setReplacementError(err.message || 'Replacement request failed.');
    } finally {
      setReplacementSubmitting(false);
    }
  };

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

  // Public handler — line_issue and meta_issue (without knownIssue) require an agent note first
  const handleEscalate = (
    type: 'line_issue' | 'plan_issue' | 'meta_issue',
    customer: any,
    subscription: any,
    network?: any,
    knownIssue?: string
  ) => {
    if (type === 'line_issue' || (type === 'meta_issue' && !knownIssue)) {
      // Always prompt agent to describe why they are escalating
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

  // Core data fetch — can be called from form submit OR refresh button
  const runSearch = async (targetEmail: string) => {
    setError('');
    setLoading(true);
    try {
      const res = await fetch(`/api/ops/aggregate?email=${encodeURIComponent(targetEmail)}`);
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
        onUpdateTitle(targetEmail);
        if (data.data.chargebee?.length === 0 && data.data.stripeCustomers?.length > 0) setActiveTab('stripe');
        // Start 60-second cooldown
        setLastRefresh(Date.now());
        setCooldownSecs(60);
      } else {
        setError(data.error || 'Failed to scan ecosystem.');
      }
    } catch (err) {
      setError('Neural network aggregation failure.');
    } finally {
      setLoading(false);
    }
  };

  const handleSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email) return;
    setMode('search');
    onUpdateTitle('New Search');
    setActiveTab('chargebee');
    await runSearch(email);
  };

  // Cooldown ticker
  const handleRefresh = () => {
    if (cooldownSecs > 0 || loading) return;
    runSearch(email);
  };

  // Tick down cooldown every second
  if (typeof window !== 'undefined' && cooldownSecs > 0) {
    // Safe: this pattern is fine since the component won't re-render every second unless cooldownSecs changes.
  }

  // Tick the cooldown counter down every second
  useEffect(() => {
    if (cooldownSecs <= 0) return;
    const timer = setTimeout(() => setCooldownSecs(s => s - 1), 1000);
    return () => clearTimeout(timer);
  }, [cooldownSecs]);

  const resetSearch = () => {
    setMode('search');
    onUpdateTitle('New Search');

    setEmail('');
    setChargebeeData([]);
    setInvoicesData({});
    setTransactionsData({});
    setCommerceData([]);
    setThingspaceData({});
    setReturnsData(null);
    setReturnsImei('');
    setReturnsError('');
  };

  const handleReturnsSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!returnsImei.trim()) return;

    setReturnsLoading(true);
    setReturnsError('');
    setReturnsData(null);

    try {
      const res = await fetch(`/api/ops/returns?imei=${encodeURIComponent(returnsImei.trim())}`);
      const data = await res.json();

      if (!res.ok) {
        setReturnsError(data.error || 'Failed to fetch return details.');
      } else {
        if (data.data && data.data.length > 0) {
          setReturnsData(data.data);
        } else {
          setReturnsError('No return details found for this IMEI.');
        }
      }
    } catch (err) {
      setReturnsError('An unexpected error occurred.');
    } finally {
      setReturnsLoading(false);
    }
  };

  const openReturnsModal = async (imei: string, orderDate?: string) => {
    setReturnsModal({ imei, orderDate });
    setModalReturnsLoading(true);
    setModalReturnsError('');
    setModalReturnsData(null);
    try {
      const res = await fetch(`/api/ops/returns?imei=${encodeURIComponent(imei.trim())}`);
      const data = await res.json();
      if (!res.ok) {
        setModalReturnsError(data.error || 'Failed to fetch return details.');
      } else {
        if (data.data && data.data.length > 0) {
          setModalReturnsData(data.data);
        } else {
          setModalReturnsError('No return details found for this IMEI.');
        }
      }
    } catch (err) {
      setModalReturnsError('An unexpected error occurred.');
    } finally {
      setModalReturnsLoading(false);
    }
  };

  return (
    <div 
      id="ops-dashboard-root"
      suppressHydrationWarning
      style={{ 
      flex: 1, 
      backgroundColor: 'var(--ops-bg)', 
      backgroundImage: mode === 'search' 
        ? 'radial-gradient(circle at 50% 50%, rgba(0, 178, 122, 0.08) 0%, transparent 60%)'
        : 'radial-gradient(circle at 50% 0%, rgba(0, 178, 122, 0.04) 0%, transparent 40%)',
      color: 'var(--ops-text)',
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
          <div style={{ background: 'var(--surface-100)', border: `1px solid ${escalationModal.type === 'line_issue' ? 'rgba(239,68,68,0.4)' : 'rgba(59,130,246,0.4)'}`, borderRadius: 20, padding: 32, width: '100%', maxWidth: 500, boxShadow: '0 24px 80px rgba(0,0,0,0.8)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 20 }}>
              <div style={{ background: escalationModal.type === 'line_issue' ? 'rgba(239,68,68,0.12)' : 'rgba(59,130,246,0.12)', padding: 10, borderRadius: 12 }}>
                <ShieldAlert size={20} color={escalationModal.type === 'line_issue' ? '#ef4444' : '#3b82f6'} />
              </div>
              <div>
                <div style={{ fontSize: 17, fontWeight: 700, color: 'var(--ops-text)' }}>
                  {escalationModal.type === 'line_issue' ? '🔴 Escalate Line Issue' : '🔵 Escalate Meta Issue'}
                </div>
                <div style={{ fontSize: 13, color: 'var(--ops-text-muted)' }}>
                  {escalationModal.customer?.email}
                </div>
              </div>
            </div>

            <div style={{ fontSize: 13, color: 'var(--ops-text-muted)', marginBottom: 12, lineHeight: 1.6 }}>
              {escalationModal.type === 'line_issue'
                ? <>Please <strong style={{ color: 'var(--ops-text)' }}>describe the customer&apos;s internet issue</strong> before escalating to the team:</>
                : <>No obvious meta issue was detected. Please <strong style={{ color: 'var(--ops-text)' }}>briefly describe the problem</strong> so the team knows what to investigate:</>
              }
            </div>

            <textarea
              autoFocus
              value={escalationNote}
              onChange={e => setEscalationNote(e.target.value)}
              placeholder={escalationModal.type === 'line_issue'
                ? 'e.g. Customer reports slow speeds, device not connecting, no signal. Include any troubleshooting steps already taken...'
                : 'e.g. IMEI on Chargebee doesn\'t match the device. Customer says their SIM was never activated...'
              }
              style={{ width: '100%', minHeight: 110, background: 'var(--surface-200)', border: '1px solid var(--border)', color: 'var(--ops-text)', padding: '12px 14px', borderRadius: 10, outline: 'none', fontSize: 14, resize: 'vertical', lineHeight: 1.6, boxSizing: 'border-box', fontFamily: 'system-ui, sans-serif' }}
            />

            <div style={{ display: 'flex', gap: 10, marginTop: 16 }}>
              <button
                onClick={() => setEscalationModal(null)}
                style={{ flex: 1, padding: '11px', background: 'transparent', border: '1px solid rgba(255,255,255,0.1)', color: 'var(--ops-text-muted)', borderRadius: 10, cursor: 'pointer', fontWeight: 600, fontSize: 14 }}
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
                style={{ flex: 2, padding: '11px', background: escalationNote.trim() ? (escalationModal.type === 'line_issue' ? 'rgba(239,68,68,0.85)' : 'rgba(59,130,246,0.9)') : 'rgba(100,100,100,0.3)', border: 'none', color: 'white', borderRadius: 10, cursor: escalationNote.trim() ? 'pointer' : 'not-allowed', fontWeight: 700, fontSize: 14, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}
              >
                <ShieldAlert size={15} /> {escalationModal.type === 'line_issue' ? 'Send Line Issue Escalation' : 'Send Meta Escalation'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Replacement Request Modal */}
      {replacementTarget && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 10000, background: 'rgba(0,0,0,0.78)', backdropFilter: 'blur(10px)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}>
          <div style={{ width: '100%', maxWidth: 760, maxHeight: '92vh', overflow: 'hidden', background: 'var(--surface-100)', border: '1px solid rgba(15,118,110,0.28)', borderRadius: 16, boxShadow: '0 28px 90px rgba(0,0,0,0.45)', display: 'flex', flexDirection: 'column' }}>
            <div style={{ padding: '22px 24px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <div style={{ padding: 10, borderRadius: 12, background: 'var(--primary-light)', color: 'var(--primary)' }}>
                  <ClipboardList size={22} />
                </div>
                <div>
                  <div style={{ fontSize: 12, color: 'var(--primary)', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.08em' }}>Request Replacement</div>
                  <div style={{ fontSize: 18, fontWeight: 800, color: 'var(--ops-text)' }}>{replacementTarget.customer?.email || email}</div>
                  <div style={{ fontSize: 12, color: 'var(--ops-text-muted)' }}>Step {replacementStep} of 7 · Sub {replacementTarget.subscription?.id || 'N/A'}</div>
                </div>
              </div>
              <button onClick={closeReplacementModal} disabled={replacementSubmitting} style={{ background: 'var(--surface-200)', border: '1px solid var(--border)', color: 'var(--ops-text)', borderRadius: 8, padding: 8, cursor: replacementSubmitting ? 'not-allowed' : 'pointer', display: 'flex' }}>
                <X size={18} />
              </button>
            </div>

            <div style={{ padding: 24, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 18 }}>
              {replacementStep === 1 && (
                <div>
                  <h3 style={{ margin: '0 0 8px', fontSize: 20 }}>What steps have already been performed?</h3>
                  <p style={{ margin: '0 0 16px', color: 'var(--ops-text-muted)', fontSize: 14 }}>Add the troubleshooting steps already tried with the customer.</p>
                  <textarea
                    value={replacementForm.troubleshootingSteps}
                    onChange={e => updateReplacementForm({ troubleshootingSteps: e.target.value })}
                    placeholder="Example: confirmed power outlet, checked account status, moved device near window, line refresh performed..."
                    style={{ width: '100%', minHeight: 140, resize: 'vertical', padding: 14, borderRadius: 10, border: '1px solid var(--border)', background: 'var(--surface-200)', color: 'var(--ops-text)', fontSize: 14, lineHeight: 1.5 }}
                  />
                </div>
              )}

              {replacementStep === 2 && (
                <div>
                  <h3 style={{ margin: '0 0 8px', fontSize: 20 }}>Choose the issue path</h3>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 12, marginTop: 16 }}>
                    {[
                      { key: 'power' as const, title: 'Device not turning on', desc: 'Use when the unit has no power or will not boot.' },
                      { key: 'internet' as const, title: 'Internet not working after troubleshooting', desc: 'Use after service/device troubleshooting has been attempted.' },
                    ].map(option => (
                      <button key={option.key} onClick={() => updateReplacementForm({ issueBranch: option.key, powerDecision: '', internetDecision: '' })} style={{ textAlign: 'left', padding: 16, borderRadius: 12, border: `1px solid ${replacementForm.issueBranch === option.key ? 'var(--primary)' : 'var(--border)'}`, background: replacementForm.issueBranch === option.key ? 'var(--primary-light)' : 'var(--surface-200)', color: 'var(--ops-text)', cursor: 'pointer' }}>
                        <div style={{ fontWeight: 800, marginBottom: 6 }}>{option.title}</div>
                        <div style={{ color: 'var(--ops-text-muted)', fontSize: 13 }}>{option.desc}</div>
                      </button>
                    ))}
                  </div>

                  {replacementForm.issueBranch === 'power' && (
                    <div style={{ marginTop: 18 }}>
                      <div style={{ fontSize: 13, color: 'var(--ops-text-muted)', fontWeight: 700, marginBottom: 8 }}>What do we need to send?</div>
                      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                        {[
                          { key: 'full_unit' as const, label: 'Full unit replacement' },
                          { key: 'power_cord' as const, label: 'Replacement power cord' },
                        ].map(option => (
                          <button key={option.key} onClick={() => updateReplacementForm({ powerDecision: option.key, replacementType: option.key === 'power_cord' ? 'Replacement power cord' : replacementForm.replacementType })} style={{ padding: '10px 14px', borderRadius: 8, border: `1px solid ${replacementForm.powerDecision === option.key ? 'var(--primary)' : 'var(--border)'}`, background: replacementForm.powerDecision === option.key ? 'var(--primary-light)' : 'transparent', color: 'var(--ops-text)', cursor: 'pointer', fontWeight: 700 }}>
                            {option.label}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}

                  {replacementForm.issueBranch === 'internet' && (
                    <div style={{ marginTop: 18 }}>
                      <div style={{ fontSize: 13, color: 'var(--ops-text-muted)', fontWeight: 700, marginBottom: 8 }}>What best describes the failure?</div>
                      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                        {[
                          { key: 'stopped_working' as const, label: 'It stopped working after working before' },
                          { key: 'never_worked' as const, label: "New device, hasn't worked from the start" },
                        ].map(option => (
                          <button key={option.key} onClick={() => updateReplacementForm({ internetDecision: option.key })} style={{ padding: '10px 14px', borderRadius: 8, border: `1px solid ${replacementForm.internetDecision === option.key ? 'var(--primary)' : 'var(--border)'}`, background: replacementForm.internetDecision === option.key ? 'var(--primary-light)' : 'transparent', color: 'var(--ops-text)', cursor: 'pointer', fontWeight: 700 }}>
                            {option.label}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}

              {replacementStep === 3 && (
                <div>
                  <h3 style={{ margin: '0 0 8px', fontSize: 20 }}>Troubleshooting checklist</h3>
                  {replacementForm.issueBranch === 'internet' ? (
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: 10, marginTop: 16 }}>
                      {REPLACEMENT_CHECKLIST_LABELS.map(item => (
                        <label key={item.key} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: 12, borderRadius: 10, background: 'var(--surface-200)', border: '1px solid var(--border)', cursor: 'pointer', color: 'var(--ops-text)', fontSize: 14, fontWeight: 600 }}>
                          <input
                            type="checkbox"
                            checked={replacementForm.checklist[item.key]}
                            onChange={e => updateReplacementForm({ checklist: { ...replacementForm.checklist, [item.key]: e.target.checked } })}
                            style={{ width: 16, height: 16, accentColor: 'var(--primary)' }}
                          />
                          {item.label}
                        </label>
                      ))}
                    </div>
                  ) : (
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: 10, marginTop: 16 }}>
                      {POWER_REPLACEMENT_CHECKLIST_LABELS.map(item => (
                        <label key={item.key} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: 12, borderRadius: 10, background: 'var(--surface-200)', border: '1px solid var(--border)', cursor: 'pointer', color: 'var(--ops-text)', fontSize: 14, fontWeight: 600 }}>
                          <input
                            type="checkbox"
                            checked={replacementForm.checklist[item.key]}
                            onChange={e => updateReplacementForm({ checklist: { ...replacementForm.checklist, [item.key]: e.target.checked } })}
                            style={{ width: 16, height: 16, accentColor: 'var(--primary)' }}
                          />
                          {item.label}
                        </label>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {replacementStep === 4 && (
                <div>
                  <h3 style={{ margin: '0 0 8px', fontSize: 20 }}>What replacement are we sending?</h3>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 10, marginTop: 16 }}>
                    {REPLACEMENT_TYPES.map(type => (
                      <button key={type} onClick={() => updateReplacementForm({ replacementType: type })} style={{ padding: 14, borderRadius: 10, border: `1px solid ${replacementForm.replacementType === type ? 'var(--primary)' : 'var(--border)'}`, background: replacementForm.replacementType === type ? 'var(--primary-light)' : 'var(--surface-200)', color: 'var(--ops-text)', cursor: 'pointer', fontWeight: 800 }}>
                        {type}
                      </button>
                    ))}
                  </div>
                  {replacementForm.replacementType === 'Other' && (
                    <input value={replacementForm.customReplacementItem} onChange={e => updateReplacementForm({ customReplacementItem: e.target.value })} placeholder="Type replacement item..." style={{ width: '100%', marginTop: 14, padding: 12, borderRadius: 8, border: '1px solid var(--border)', background: 'var(--surface-200)', color: 'var(--ops-text)' }} />
                  )}
                </div>
              )}

              {replacementStep === 5 && (
                <div>
                  <h3 style={{ margin: '0 0 8px', fontSize: 20 }}>Reason and interaction</h3>
                  <label style={{ display: 'block', fontSize: 12, color: 'var(--ops-text-muted)', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 8 }}>Reason for replacement</label>
                  <textarea value={replacementForm.replacementReason} onChange={e => updateReplacementForm({ replacementReason: e.target.value })} placeholder="Explain why a replacement is being sent..." style={{ width: '100%', minHeight: 120, resize: 'vertical', padding: 14, borderRadius: 10, border: '1px solid var(--border)', background: 'var(--surface-200)', color: 'var(--ops-text)', fontSize: 14, lineHeight: 1.5 }} />
                  <label style={{ display: 'block', fontSize: 12, color: 'var(--ops-text-muted)', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.06em', margin: '16px 0 8px' }}>Ticket ID or call log ID (optional)</label>
                  <input value={replacementForm.interactionId} onChange={e => updateReplacementForm({ interactionId: e.target.value })} placeholder="Example: FS #12345 or call log ID..." style={{ width: '100%', padding: 12, borderRadius: 8, border: '1px solid var(--border)', background: 'var(--surface-200)', color: 'var(--ops-text)' }} />
                </div>
              )}

              {replacementStep === 6 && (
                <div>
                  <h3 style={{ margin: '0 0 8px', fontSize: 20 }}>Verify replacement shipping address</h3>
                  <p style={{ margin: '0 0 16px', color: 'var(--ops-text-muted)', fontSize: 14 }}>
                    Confirm the latest Shopify shipping address or enter the corrected address for this replacement.
                  </p>

                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 12 }}>
                    <button
                      onClick={() => updateReplacementForm({ addressChoice: 'confirmed' })}
                      disabled={!replacementTarget.shopifyAddress}
                      style={{ textAlign: 'left', padding: 16, borderRadius: 12, border: `1px solid ${replacementForm.addressChoice === 'confirmed' ? 'var(--primary)' : 'var(--border)'}`, background: replacementForm.addressChoice === 'confirmed' ? 'var(--primary-light)' : 'var(--surface-200)', color: 'var(--ops-text)', cursor: replacementTarget.shopifyAddress ? 'pointer' : 'not-allowed', opacity: replacementTarget.shopifyAddress ? 1 : 0.55 }}
                    >
                      <div style={{ fontWeight: 800, marginBottom: 8 }}>Use Shopify address</div>
                      <pre style={{ margin: 0, whiteSpace: 'pre-wrap', color: 'var(--ops-text-muted)', fontFamily: 'inherit', fontSize: 13, lineHeight: 1.45 }}>
                        {replacementTarget.shopifyAddress || 'No Shopify shipping address found for this customer.'}
                      </pre>
                    </button>

                    <button
                      onClick={() => updateReplacementForm({ addressChoice: 'new' })}
                      style={{ textAlign: 'left', padding: 16, borderRadius: 12, border: `1px solid ${replacementForm.addressChoice === 'new' ? 'var(--primary)' : 'var(--border)'}`, background: replacementForm.addressChoice === 'new' ? 'var(--primary-light)' : 'var(--surface-200)', color: 'var(--ops-text)', cursor: 'pointer' }}
                    >
                      <div style={{ fontWeight: 800, marginBottom: 8 }}>Enter new address</div>
                      <div style={{ color: 'var(--ops-text-muted)', fontSize: 13, lineHeight: 1.45 }}>Use this when the customer confirms Shopify has the wrong delivery address.</div>
                    </button>
                  </div>

                  {replacementForm.addressChoice === 'new' && (
                    <div style={{ marginTop: 16 }}>
                      <label style={{ display: 'block', fontSize: 12, color: 'var(--ops-text-muted)', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 8 }}>New replacement shipping address</label>
                      <textarea
                        value={replacementForm.newShippingAddress}
                        onChange={e => updateReplacementForm({ newShippingAddress: e.target.value })}
                        placeholder={"Name\nStreet address\nCity, State ZIP\nCountry\nPhone if available"}
                        style={{ width: '100%', minHeight: 130, resize: 'vertical', padding: 14, borderRadius: 10, border: '1px solid var(--border)', background: 'var(--surface-200)', color: 'var(--ops-text)', fontSize: 14, lineHeight: 1.5 }}
                      />
                    </div>
                  )}
                </div>
              )}

              {replacementStep === 7 && (
                <div>
                  <h3 style={{ margin: '0 0 8px', fontSize: 20 }}>Confirm replacement cost disclaimer</h3>
                  <div style={{ padding: 18, borderRadius: 12, background: 'rgba(245,158,11,0.1)', border: '1px solid rgba(245,158,11,0.3)', color: 'var(--ops-text)', lineHeight: 1.6 }}>
                    <strong style={{ color: '#f59e0b' }}>Please know:</strong> a replacement costs us extra money and usually means the next 2-3 months would only cover the cost of the replacement that was sent out. This replacement will be recorded under your name.
                  </div>
                  <div style={{ marginTop: 16, padding: 14, borderRadius: 10, border: '1px solid var(--border)', background: 'var(--surface-200)' }}>
                    <div style={{ fontSize: 12, color: 'var(--ops-text-muted)', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 4 }}>Recorded agent</div>
                    <div style={{ color: 'var(--ops-text)', fontWeight: 800 }}>{replacementAgentEmail || 'Your authenticated OPS session'}</div>
                  </div>
                </div>
              )}

              {replacementError && (
                <div style={{ padding: 12, borderRadius: 10, border: '1px solid rgba(239,68,68,0.3)', background: 'rgba(239,68,68,0.1)', color: '#ef4444', fontSize: 13, fontWeight: 700 }}>
                  {replacementError}
                </div>
              )}
            </div>

            <div style={{ padding: 18, borderTop: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', gap: 12, background: 'var(--surface-100)' }}>
              <button onClick={() => replacementStep === 1 ? closeReplacementModal() : setReplacementStep(step => step - 1)} disabled={replacementSubmitting} style={{ padding: '11px 16px', borderRadius: 8, border: '1px solid var(--border)', background: 'transparent', color: 'var(--ops-text-muted)', cursor: replacementSubmitting ? 'not-allowed' : 'pointer', fontWeight: 700 }}>
                {replacementStep === 1 ? 'Cancel' : 'Back'}
              </button>
              {replacementStep < 7 ? (
                <button onClick={goReplacementNext} style={{ padding: '11px 18px', borderRadius: 8, border: 'none', background: 'linear-gradient(135deg, var(--primary), #0d9488)', color: 'white', cursor: 'pointer', fontWeight: 800 }}>
                  Proceed
                </button>
              ) : (
                <button onClick={submitReplacementRequest} disabled={replacementSubmitting} style={{ padding: '11px 18px', borderRadius: 8, border: 'none', background: replacementSubmitting ? 'var(--surface-300)' : 'linear-gradient(135deg, var(--primary), #0d9488)', color: 'white', cursor: replacementSubmitting ? 'not-allowed' : 'pointer', fontWeight: 800, display: 'flex', alignItems: 'center', gap: 8 }}>
                  {replacementSubmitting ? <><Loader2 size={16} className="animate-spin" /> Sending...</> : 'Accept and Send'}
                </button>
              )}
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
              style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', maxWidth: '760px', margin: '0 auto', width: '100%' }}
            >
              <div style={{ padding: '14px', background: 'var(--primary-light)', borderRadius: '12px', marginBottom: '24px', border: '1px solid rgba(15, 118, 110, 0.22)' }}>
                 <Activity color="var(--primary)" size={32} />
              </div>
              <h2 style={{ fontSize: 'clamp(36px, 6vw, 58px)', fontWeight: 800, marginBottom: '16px', textAlign: 'center', letterSpacing: 0 }}>Customer command search</h2>
              <p style={{ color: 'var(--ops-text-muted)', fontSize: '18px', textAlign: 'center', marginBottom: '42px', lineHeight: 1.6, maxWidth: 620 }}>
                Search once to bring billing, orders, tickets, and network records into a single operator-ready workspace.
              </p>

              <form suppressHydrationWarning onSubmit={handleSearch} style={{ width: '100%', position: 'relative' }}>
                <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
                  <Search size={24} color="var(--ops-text-muted)" style={{ position: 'absolute', left: '22px' }} />
                  <input 
                    type="email" 
                    placeholder="customer@example.com"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    required
                    style={{ 
                      width: '100%', 
                      padding: '22px 190px 22px 60px',
                      backgroundColor: 'var(--ops-card-bg)',
                      border: '1px solid var(--ops-card-border)',
                      borderRadius: '12px',
                      color: 'var(--ops-text)', 
                      fontSize: '18px',
                      outline: 'none', 
                      boxShadow: 'var(--shadow-lg)',
                      transition: 'border-color 0.3s, box-shadow 0.3s' 
                    }}
                    onFocus={(e) => { e.target.style.borderColor = 'var(--primary)'; e.target.style.boxShadow = '0 0 0 4px rgba(15, 118, 110, 0.14), var(--shadow-lg)'; }}
                    onBlur={(e) => { e.target.style.borderColor = 'var(--ops-card-border)'; e.target.style.boxShadow = 'var(--shadow-lg)'; }}
                  />
                  
                  <motion.button
                    suppressHydrationWarning
                    whileHover={{ scale: 1.05 }}
                    whileTap={{ scale: 0.95 }}
                    disabled={loading || !email}
                    type="submit"
                    className="ops-primary-button"
                    style={{ 
                      position: 'absolute',
                      right: '12px',
                      background: 'linear-gradient(135deg, var(--primary), #0d9488)',
                      border: 'none', 
                      color: 'white',
                      padding: '14px 24px',
                      borderRadius: '8px',
                      fontSize: '16px', 
                      fontWeight: 600, 
                      cursor: loading || !email ? 'not-allowed' : 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '8px',
                      opacity: loading || !email ? 0.7 : 1
                    }}
                  >
                    {loading ? <Loader2 size={20} className="animate-spin" /> : 'Search'}
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
                  <button onClick={resetSearch} style={{ background: 'transparent', border: 'none', color: 'var(--ops-text-muted)', display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', padding: 0, marginBottom: '16px', fontSize: '14px' }}>
                    ← New Search
                  </button>
                  <h2 style={{ fontSize: '32px', margin: '0 0 8px 0', fontWeight: 800 }}>Ecosystem Payload</h2>
                  <p style={{ color: 'var(--ops-text-muted)', margin: 0, fontSize: '16px' }}>Target: <span style={{ color: 'var(--ops-text)', fontWeight: 500 }}>{email}</span></p>
                </div>
                
                <div style={{ display: 'flex', gap: '12px', alignItems: 'flex-start', flexWrap: 'wrap' }}>

                   {/* ── Big Refresh Button ── */}
                   <button
                     onClick={handleRefresh}
                     disabled={cooldownSecs > 0 || loading}
                     title={cooldownSecs > 0 ? `Available in ${cooldownSecs}s` : 'Refresh all data for this customer'}
                     style={{
                       display: 'flex', alignItems: 'center', gap: '10px',
                       padding: '14px 22px', borderRadius: '14px', cursor: cooldownSecs > 0 || loading ? 'not-allowed' : 'pointer',
                       fontWeight: 700, fontSize: '14px', border: 'none',
                       background: cooldownSecs > 0
                         ? 'var(--surface-300)'
                         : loading
                           ? 'rgba(0,178,122,0.2)'
                           : 'linear-gradient(135deg, #00b27a, #009a69)',
                       color: cooldownSecs > 0 ? 'var(--ops-text-muted)' : 'white',
                       boxShadow: cooldownSecs > 0 || loading ? 'none' : '0 4px 20px rgba(0,178,122,0.35)',
                       transition: 'all 0.3s ease',
                       position: 'relative', overflow: 'hidden',
                       opacity: loading ? 0.8 : 1,
                       minWidth: '170px', justifyContent: 'center',
                     }}
                   >
                     {loading
                       ? <><Loader2 size={17} style={{ animation: 'spin 1s linear infinite' }} /> Refreshing...</>
                       : cooldownSecs > 0
                         ? <><RefreshCw size={17} /> Refresh in {cooldownSecs}s</>
                         : <><RefreshCw size={17} /> Refresh All Data</>
                     }
                     {cooldownSecs > 0 && (
                       <div style={{
                         position: 'absolute', bottom: 0, left: 0,
                         height: '3px', background: '#00b27a',
                         width: `${((60 - cooldownSecs) / 60) * 100}%`,
                         transition: 'width 1s linear',
                       }} />
                     )}
                   </button>

                   <div style={{ padding: '12px 24px', background: 'rgba(20,20,20,0.6)', border: '1px solid var(--border)', borderRadius: '12px', display: 'flex', alignItems: 'center', gap: '12px' }}>
                     <CreditCard color="#a78bfa" size={20} />
                     <div>
                       <div style={{ fontSize: '12px', color: 'var(--ops-text-muted)', textTransform: 'uppercase', letterSpacing: '1px' }}>Chargebee</div>
                       <div style={{ fontWeight: 600 }}>{chargebeeData.length} Profiles</div>
                     </div>
                  </div>
                  <div style={{ padding: '12px 24px', background: 'rgba(20,20,20,0.6)', border: '1px solid var(--border)', borderRadius: '12px', display: 'flex', alignItems: 'center', gap: '12px' }}>
                     <Package color="#fbbf24" size={20} />
                     <div>
                       <div style={{ fontSize: '12px', color: 'var(--ops-text-muted)', textTransform: 'uppercase', letterSpacing: '1px' }}>Commerce</div>
                       <div style={{ fontWeight: 600 }}>{commerceData.length} Orders</div>
                     </div>
                  </div>
                  <div style={{ padding: '12px 24px', background: 'rgba(20,20,20,0.6)', border: '1px solid var(--border)', borderRadius: '12px', display: 'flex', alignItems: 'center', gap: '12px' }}>
                     <Zap color="#f87171" size={20} />
                     <div>
                       <div style={{ fontSize: '12px', color: 'var(--ops-text-muted)', textTransform: 'uppercase', letterSpacing: '1px' }}>ThingSpace</div>
                       <div style={{ fontWeight: 600 }}>{Object.keys(thingspaceData).length} ICIDs</div>
                     </div>
                  </div>
                </div>
              </div>

              {/* Stateful Tabs Navigation */}
              <div className="cb-tab-bar" style={{ padding: '0 0 24px 0', borderBottom: '1px solid rgba(255,255,255,0.1)', marginBottom: '32px', alignItems: 'center' }}>
                <button 
                  onClick={() => setActiveTab('chargebee')} 
                  style={{ background: activeTab === 'chargebee' ? 'rgba(167, 139, 250, 0.2)' : 'transparent', color: activeTab === 'chargebee' ? '#a78bfa' : '#9ca3af', border: `1px solid ${activeTab === 'chargebee' ? 'rgba(167, 139, 250, 0.4)' : 'transparent'}`, padding: '10px 20px', borderRadius: '100px', cursor: 'pointer', fontSize: '13px', fontWeight: 600, transition: 'all 0.2s', display: 'flex', alignItems: 'center', gap: '8px' }}
                >
                  <CreditCard size={16} /> Chargebee Subscriptions {chargebeeData.length > 0 && <span style={{ background: '#a78bfa', color: 'var(--ops-text)', padding: '2px 6px', borderRadius: '10px', fontSize: '10px' }}>{chargebeeData.length}</span>}
                </button>
                <button 
                  onClick={() => setActiveTab('stripe')} 
                  style={{ background: activeTab === 'stripe' ? 'rgba(99, 102, 241, 0.2)' : 'transparent', color: activeTab === 'stripe' ? '#818cf8' : '#9ca3af', border: `1px solid ${activeTab === 'stripe' ? 'rgba(99, 102, 241, 0.4)' : 'transparent'}`, padding: '10px 20px', borderRadius: '100px', cursor: 'pointer', fontSize: '13px', fontWeight: 600, transition: 'all 0.2s', display: 'flex', alignItems: 'center', gap: '8px' }}
                >
                  <DollarSign size={16} /> Stripe Explorer {stripeCustomers.length > 0 && <span style={{ background: '#818cf8', color: 'var(--ops-text)', padding: '2px 6px', borderRadius: '10px', fontSize: '10px' }}>{stripeCustomers.length}</span>}
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
                  <Package size={16} /> Commerce Orders {commerceData.length > 0 && <span style={{ background: '#fbbf24', color: 'var(--ops-text)', padding: '2px 6px', borderRadius: '10px', fontSize: '10px' }}>{commerceData.length}</span>}
                </button>
                <button 
                  onClick={() => setActiveTab('support')} 
                  style={{ background: activeTab === 'support' ? 'rgba(96, 165, 250, 0.2)' : 'transparent', color: activeTab === 'support' ? '#60a5fa' : '#9ca3af', border: `1px solid ${activeTab === 'support' ? 'rgba(96, 165, 250, 0.4)' : 'transparent'}`, padding: '10px 20px', borderRadius: '100px', cursor: 'pointer', fontSize: '13px', fontWeight: 600, transition: 'all 0.2s', display: 'flex', alignItems: 'center', gap: '8px' }}
                >
                  <Activity size={16} /> Support Tickets {freescoutData.length > 0 && <span style={{ background: '#60a5fa', color: 'var(--ops-text)', padding: '2px 6px', borderRadius: '10px', fontSize: '10px' }}>{freescoutData.length}</span>}
                </button>
                <button 
                  onClick={() => setActiveTab('returns')} 
                  style={{ background: activeTab === 'returns' ? 'rgba(234, 179, 8, 0.2)' : 'transparent', color: activeTab === 'returns' ? '#eab308' : '#9ca3af', border: `1px solid ${activeTab === 'returns' ? 'rgba(234, 179, 8, 0.4)' : 'transparent'}`, padding: '10px 20px', borderRadius: '100px', cursor: 'pointer', fontSize: '13px', fontWeight: 600, transition: 'all 0.2s', display: 'flex', alignItems: 'center', gap: '8px' }}
                >
                  <Package size={16} /> Hardware Returns
                </button>
                <button
                  onClick={() => setActiveTab('callbacks')}
                  style={{ background: activeTab === 'callbacks' ? 'rgba(20,184,166,0.18)' : 'transparent', color: activeTab === 'callbacks' ? '#2dd4bf' : '#9ca3af', border: `1px solid ${activeTab === 'callbacks' ? 'rgba(45,212,191,0.38)' : 'transparent'}`, padding: '10px 20px', borderRadius: '100px', cursor: 'pointer', fontSize: '13px', fontWeight: 600, transition: 'all 0.2s', display: 'flex', alignItems: 'center', gap: '8px' }}
                >
                  <PhoneCall size={16} /> Call Back
                </button>
                <button
                  onClick={() => window.location.assign('/collections')}
                  style={{ background: 'transparent', color: '#f59e0b', border: '1px solid rgba(245,158,11,0.32)', padding: '10px 20px', borderRadius: '100px', cursor: 'pointer', fontSize: '13px', fontWeight: 600, transition: 'all 0.2s', display: 'flex', alignItems: 'center', gap: '8px' }}
                >
                  <DollarSign size={16} /> Collections
                </button>
              </div>

              {/* Data Stack */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '64px' }}>
                
                {/* Chargebee Column */}
                {activeTab === 'chargebee' && (
                <div id="section-chargebee" style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
                  <h3 style={{ fontSize: '20px', color: 'var(--ops-text)', margin: 0, display: 'flex', alignItems: 'center', gap: '8px' }}>
                     <CreditCard size={20} color="#a78bfa" /> Chargebee Subscriptions
                  </h3>
                  
                  {chargebeeData.length === 0 ? (
                    <div style={{ padding: '40px', textAlign: 'center', background: 'var(--surface-200)', borderRadius: '16px', border: '1px dashed rgba(255,255,255,0.1)' }}>
                      <span style={{ color: 'var(--ops-text-muted)' }}>No Chargebee profiles found.</span>
                    </div>
                  ) : (
                    chargebeeData.map((c, i) => (
                      <div key={i} style={{ padding: '24px', background: 'var(--ops-card-bg)', border: '1px solid var(--ops-card-border)', borderRadius: '16px', boxShadow: 'var(--shadow-md)' }}>
                        <div className="cb-customer-header">
                          <div>
                            <div style={{ fontWeight: 600, fontSize: '18px' }}>{c.firstName} {c.lastName}</div>
                            <div style={{ color: 'var(--ops-text-muted)', fontSize: '14px' }}>ID: {c.id}</div>
                          </div>
                          <div className="cb-customer-header-actions">
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
                                <div style={{ fontSize: '13px', color: 'var(--ops-text-muted)' }}>Not enough successful historical transactions to compare.</div>
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
                              <div key={idx} style={{ padding: '16px', background: 'var(--surface-200)', borderRadius: '12px', border: '1px solid var(--border)' }}>
                                <div className="cb-sub-header">
                                  <div>
                                    <span style={{ fontWeight: 600, color: 'var(--ops-text)', fontSize: '15px' }}>
                                      {sub.subscription_items?.find((i: any) => i.item_type === 'plan')?.item_price_id || sub.plan_id || 'Unknown Plan'}
                                    </span>
                                    <span style={{ color: 'var(--ops-text-muted)', fontSize: '13px', marginLeft: '8px' }}>
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
                                <div style={{ fontSize: '13px', color: 'var(--ops-text-muted)', display: 'flex', justifyContent: 'space-between' }}>
                                  <span>Sub ID: {sub.id}</span>
                                  {sub.total_dues > 0 && (
                                    <span style={{ color: '#f87171', fontWeight: 600 }}>Due: ${(sub.total_dues / 100).toFixed(2)}</span>
                                  )}
                                </div>
                                {sub.next_billing_at && (
                                  <div style={{ fontSize: '12px', color: 'var(--ops-text-muted)', marginTop: '6px' }}>
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
                                     <div style={{ marginTop: '10px', padding: '8px 12px', background: 'var(--surface-200)', borderRadius: '8px', border: '1px solid var(--border)', display: 'flex', flexDirection: 'column', gap: '4px' }}>
                                       {cbIccidVal && (
                                         <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '12px' }}>
                                           <span style={{ color: 'var(--ops-text-muted)' }}>ICCID</span>
                                           <span style={{ color: '#f87171', fontFamily: 'monospace', fontSize: '11px' }}>{cbIccidVal}</span>
                                         </div>
                                       )}
                                       {cbImeiVal && (
                                         <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '12px' }}>
                                           <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                                             <span style={{ color: 'var(--ops-text-muted)' }}>IMEI</span>
                                             <button 
                                               onClick={() => openReturnsModal(cbImeiVal)}
                                               title="Query Return Details"
                                               style={{ background: 'rgba(234, 179, 8, 0.1)', border: '1px solid rgba(234, 179, 8, 0.3)', color: '#eab308', padding: '2px 6px', borderRadius: '4px', fontSize: '9px', fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '3px' }}
                                             >
                                               <Package size={10} /> Check
                                             </button>
                                           </div>
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
                                <button
                                  onClick={() => openReplacementModal(c, sub)}
                                  style={{ width: '100%', marginTop: '10px', padding: '10px', background: 'rgba(15, 118, 110, 0.1)', border: '1px solid rgba(15, 118, 110, 0.3)', borderRadius: '8px', color: 'var(--primary)', fontSize: '12px', fontWeight: 700, cursor: 'pointer', transition: 'all 0.2s', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px' }}
                                  onMouseOver={(e) => { e.currentTarget.style.background = 'rgba(15, 118, 110, 0.18)'; }}
                                  onMouseOut={(e) => { e.currentTarget.style.background = 'rgba(15, 118, 110, 0.1)'; }}
                                >
                                  <ClipboardList size={14} /> Request Replacement
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
                                            <div style={{ fontSize: '11px', color: 'var(--ops-text-muted)', marginTop: '6px' }}>
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
                                            <div style={{ padding: '8px 12px', background: 'rgba(239,68,68,0.05)', border: '1px solid rgba(239,68,68,0.15)', borderRadius: '8px', display: 'flex', alignItems: 'center', gap: '8px', fontSize: '12px', color: 'var(--ops-text-muted)' }}>
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
                                            <span style={{ fontSize: '14px', color: 'var(--ops-text)', fontWeight: 600 }}>No Line Found on ThingSpace</span>
                                          </div>
                                          {syncButtonNode}
                                        </div>

                                        {/* Valid ICCID badge */}
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '10px', background: 'var(--surface-200)', padding: '8px 12px', borderRadius: '8px', fontFamily: 'monospace' }}>
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
                                          <div style={{ padding: '8px 12px', background: 'rgba(239,68,68,0.05)', border: '1px solid rgba(239,68,68,0.15)', borderRadius: '8px', display: 'flex', alignItems: 'center', gap: '8px', fontSize: '12px', color: 'var(--ops-text-muted)' }}>
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

                                  // NOTE: total_dues is null/undefined (not 0) in Chargebee when account is fully paid.
                                  // Using !sub.total_dues catches null, undefined, and 0 correctly.
                                  let isRestoreAllowed = false;
                                  if ((sub.status === 'active' || sub.status === 'future' || sub.status === 'non_renewing') && !sub.total_dues) {
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
                                          <span style={{ fontSize: '14px', color: 'var(--ops-text)', fontWeight: 600 }}>Verizon Network Core</span>
                                        </div>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                                          {syncButtonNode}
                                          <div style={{ width: '8px', height: '8px', borderRadius: '50%', background: tsState.toLowerCase() === 'active' ? '#10b981' : tsState.toLowerCase().startsWith('pending') ? '#f59e0b' : '#ef4444' }} />
                                          <span style={{ fontSize: '12px', color: tsState.toLowerCase().startsWith('pending') ? '#f59e0b' : 'white', fontWeight: 500, textTransform: 'uppercase' }}>{tsState}</span>
                                        </div>
                                      </div>

                                      <div className="cb-network-grid">
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
                                              <span style={{ color: 'var(--ops-text-muted)', display: 'block', marginBottom: '4px' }}>ICCID</span>
                                              <span style={{ color: !isValidIccid ? '#ef4444' : '#f87171', fontFamily: 'monospace', fontWeight: !isValidIccid ? 700 : 400 }}>{iccid}</span>
                                            </div>
                                            {!isValidIccid && <AlertTriangle size={14} color="#ef4444" style={{ marginLeft: '8px' }} />}
                                          </div>
                                          <button 
                                            onClick={() => activeUsageIccid === iccid ? setActiveUsageIccid(null) : fetchUsage(iccid)}
                                            style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', color: 'var(--ops-text)', padding: '6px', borderRadius: '4px', fontSize: '11px', cursor: 'pointer', display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '6px', marginTop: '4px' }}
                                          >
                                            <BarChart2 size={12} /> Analyze Usage
                                          </button>
                                        </div>
                                        <div>
                                          <span style={{ color: 'var(--ops-text-muted)', display: 'block', marginBottom: '4px' }}>IMEI</span>
                                          <span style={{ color: '#a78bfa', fontFamily: 'monospace' }}>{tsDev.deviceIds?.find((d:any)=>d.kind==='imei')?.id || tsDev.extendedAttributes?.find((d:any)=>d.key==='PreIMEI')?.value || 'N/A'}</span>
                                        </div>
                                        <div>
                                          <span style={{ color: 'var(--ops-text-muted)', display: 'block', marginBottom: '4px' }}>MDN / Number</span>
                                          <span style={{ color: 'var(--ops-text)' }}>{tsDev.deviceIds?.find((d:any)=>d.kind==='mdn')?.id || 'N/A'}</span>
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
                                            <span style={{ color: 'var(--ops-text-muted)', display: 'block', marginBottom: '4px' }}>Active Plan SKU</span>
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
                                          <span style={{ color: 'var(--ops-text-muted)', display: 'block', marginBottom: '4px' }}>IP Address</span>
                                          <span style={{ color: 'var(--ops-text)', fontFamily: 'monospace' }}>{tsDev.ipAddress || 'Disconnected'}</span>
                                        </div>
                                        <div>
                                          <span style={{ color: 'var(--ops-text-muted)', display: 'block', marginBottom: '4px' }}>Last Connection</span>
                                          <span style={{ color: 'var(--ops-text)' }}>{tsDev.lastConnectionDate ? new Date(tsDev.lastConnectionDate).toLocaleDateString() : 'N/A'}</span>
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


                                      <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', paddingTop: '12px', borderTop: '1px solid var(--border)' }}>
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
                                                        style={{ width: '100%', padding: '11px 16px', background: 'transparent', border: 'none', borderBottom: '1px solid var(--border)', color: '#ef4444', cursor: busy ? 'not-allowed' : 'pointer', display: 'flex', alignItems: 'center', gap: '10px', fontSize: '13px', fontWeight: 600, opacity: busy ? 0.6 : 1, textAlign: 'left' }}
                                                        onMouseOver={e => { e.currentTarget.style.background = 'rgba(239,68,68,0.12)'; }}
                                                        onMouseOut={e => { e.currentTarget.style.background = 'transparent'; }}
                                                      >
                                                        {busy ? <Loader2 size={14} style={{ animation: 'spin 1s linear infinite' }} /> : <span style={{ fontSize: '16px' }}>🔴</span>}
                                                        <div>
                                                          <div>Escalate Line Issue</div>
                                                          <div style={{ fontSize: '11px', color: 'var(--ops-text-muted)', fontWeight: 400 }}>Line is active but not working properly</div>
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
                                                        style={{ width: '100%', padding: '11px 16px', background: 'transparent', border: 'none', borderBottom: '1px solid var(--border)', color: '#f59e0b', cursor: busy ? 'not-allowed' : 'pointer', display: 'flex', alignItems: 'center', gap: '10px', fontSize: '13px', fontWeight: 600, opacity: busy ? 0.6 : 1, textAlign: 'left' }}
                                                        onMouseOver={e => { e.currentTarget.style.background = 'rgba(245,158,11,0.12)'; }}
                                                        onMouseOut={e => { e.currentTarget.style.background = 'transparent'; }}
                                                      >
                                                        {busy ? <Loader2 size={14} style={{ animation: 'spin 1s linear infinite' }} /> : <span style={{ fontSize: '16px' }}>🟡</span>}
                                                        <div>
                                                          <div>Escalate Plan Issue</div>
                                                          <div style={{ fontSize: '11px', color: 'var(--ops-text-muted)', fontWeight: 400 }}>Service plan is on the known problem list</div>
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
                                                          <div style={{ fontSize: '11px', color: 'var(--ops-text-muted)', fontWeight: 400 }}>Account config, IMEI, or metadata problem</div>
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
                                     <div style={{ fontSize: '12px', color: 'var(--ops-text-muted)', textTransform: 'uppercase', marginBottom: '6px' }}>Addons</div>
                                     {sub.subscription_items.filter((i: any) => i.item_type === 'addon').map((addon: any, aIdx: number) => (
                                       <div key={aIdx} style={{ fontSize: '13px', color: 'var(--ops-text)', display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}>
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
                          <div style={{ fontSize: '14px', color: 'var(--ops-text-muted)' }}>No active subscriptions.</div>
                        )}
                      </div>
                    ))
                  )}
                </div>
                )}

                {/* Stripe Explorer Column */}
                {activeTab === 'stripe' && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
                  <h3 style={{ fontSize: '20px', color: 'var(--ops-text)', margin: 0, display: 'flex', alignItems: 'center', gap: '8px' }}>
                     <DollarSign size={20} color="#818cf8" /> Stripe Explorer
                  </h3>
                  
                  {stripeCustomers.length === 0 ? (
                    <div style={{ padding: '40px', textAlign: 'center', background: 'var(--surface-200)', borderRadius: '16px', border: '1px dashed rgba(255,255,255,0.1)' }}>
                      <span style={{ color: 'var(--ops-text-muted)' }}>No Stripe records matched this email.</span>
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
                                <div style={{ fontSize: '15px', fontWeight: 600, color: 'var(--ops-text)' }}>{sc.name || 'Unnamed Record'}</div>
                                <div style={{ fontSize: '13px', color: 'var(--ops-text-muted)', fontFamily: 'monospace' }}>{sc.id}</div>
                              </div>
                              <div style={{ padding: '4px 8px', background: 'rgba(255,255,255,0.05)', borderRadius: '6px', fontSize: '10px', color: 'var(--ops-text-muted)', border: '1px solid rgba(255,255,255,0.1)' }}>
                                {sc.livemode ? 'LIVE' : 'TEST'}
                              </div>
                            </div>
                            <div style={{ fontSize: '12px', color: 'var(--ops-text-muted)', marginTop: '12px' }}>
                              Created {new Date(sc.created * 1000).toLocaleDateString()}
                            </div>
                          </div>
                        ))}
                      </div>

                      {/* Transaction Table */}
                      {activeStripeId && (
                        <div style={{ padding: '24px', background: 'var(--ops-card-bg)', border: '1px solid rgba(99, 102, 241, 0.2)', borderRadius: '16px', marginTop: '16px' }}>
                          <h4 style={{ fontSize: '16px', margin: '0 0 16px 0', borderBottom: '1px solid var(--border)', paddingBottom: '16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                            <span>Unified Transaction Ledger</span>
                            <div style={{ display: 'flex', gap: '8px' }}>
                              <select 
                                value={stripeFilterProps.status} 
                                onChange={(e) => setStripeFilterProps({...stripeFilterProps, status: e.target.value})}
                                style={{ background: 'rgba(0,0,0,0.5)', border: '1px solid rgba(255,255,255,0.1)', color: 'var(--ops-text)', padding: '6px 12px', borderRadius: '8px', fontSize: '12px' }}
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
                                <tr style={{ borderBottom: '1px solid rgba(255,255,255,0.1)', color: 'var(--ops-text-muted)', textAlign: 'left' }}>
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
                                  if (filtered.length === 0) return <tr><td colSpan={5} style={{ padding: '16px', textAlign: 'center', color: 'var(--ops-text-muted)' }}>No transactions match criteria.</td></tr>;
                                  const vol = filtered.reduce((s, t) => s + (isNaN(t.amtM) ? 0 : t.amtM), 0);
                                  
                                  return (
                                    <>
                                      {filtered.map((t, idx) => (
                                        <tr key={idx} style={{ borderBottom: '1px solid var(--border)', backgroundColor: 'transparent', transition: 'background-color 0.2s' }}>
                                          <td style={{ padding: '12px', color: '#d1d5db', whiteSpace: 'nowrap' }}>{t.dateTxt}</td>
                                          <td style={{ padding: '12px', color: 'var(--ops-text-muted)', textTransform: 'uppercase', fontSize: '11px' }}>{t.type}</td>
                                          <td style={{ padding: '12px', color: 'var(--ops-text)', fontWeight: 600 }}>${t.amtM.toFixed(2)}</td>
                                          <td style={{ padding: '12px', color: 'var(--ops-text-muted)' }}>{t.desc}</td>
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
                                        <td colSpan={2} style={{ padding: '16px', fontWeight: 600, color: 'var(--ops-text)' }}>Ledger Summary ({filtered.length})</td>
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
                  <h3 style={{ fontSize: '20px', color: 'var(--ops-text)', margin: 0, display: 'flex', alignItems: 'center', gap: '8px' }}>
                     <Package size={20} color="#fbbf24" /> Commerce Logs
                  </h3>

                  {commerceData.length === 0 ? (
                    <div style={{ padding: '40px', textAlign: 'center', background: 'var(--surface-200)', borderRadius: '16px', border: '1px dashed rgba(255,255,255,0.1)' }}>
                      <span style={{ color: 'var(--ops-text-muted)' }}>No Commerce orders found.</span>
                    </div>
                  ) : (
                    commerceData.map((order, i) => (
                      <div key={i} style={{ background: 'var(--ops-card-bg)', border: '1px solid rgba(251, 191, 36, 0.2)', borderRadius: '16px', boxShadow: 'var(--shadow-md)', overflow: 'hidden' }}>

                        {/* ── Order Header ── */}
                        <div style={{ padding: '20px 24px', background: 'rgba(251,191,36,0.06)', borderBottom: '1px solid rgba(251,191,36,0.15)', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '12px' }}>
                          <div>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '4px' }}>
                              <span style={{ fontWeight: 700, fontSize: '18px', color: 'var(--ops-text)' }}>Order {order.orderNumber}</span>
                              <span style={{ padding: '2px 8px', borderRadius: '100px', fontSize: '11px', fontWeight: 600, background: order.paymentStatus === 'paid' ? 'rgba(16,185,129,0.12)' : 'rgba(251,191,36,0.15)', color: order.paymentStatus === 'paid' ? '#10b981' : '#f59e0b', border: `1px solid ${order.paymentStatus === 'paid' ? 'rgba(16,185,129,0.3)' : 'rgba(251,191,36,0.3)'}`, textTransform: 'uppercase' }}>{order.paymentStatus}</span>
                              {order.refunded && <span style={{ padding: '2px 8px', borderRadius: '100px', fontSize: '11px', fontWeight: 600, background: 'rgba(239,68,68,0.12)', color: '#ef4444', border: '1px solid rgba(239,68,68,0.3)' }}>REFUNDED</span>}
                              <span style={{ padding: '2px 8px', borderRadius: '100px', fontSize: '11px', background: 'var(--surface-300)', color: 'var(--ops-text-muted)', border: '1px solid var(--border)' }}>{order.source === 'both' ? 'Shopify + ShipStation' : order.source}</span>
                            </div>
                            <div style={{ fontSize: '13px', color: 'var(--ops-text-muted)' }}>
                              {new Date(order.orderDate).toLocaleString()} · ID: {order.orderId}
                              {order.tags && <span style={{ marginLeft: '12px', color: '#a78bfa' }}>🏷 {order.tags}</span>}
                            </div>
                          </div>
                          <div style={{ textAlign: 'right' }}>
                            <div style={{ fontSize: '24px', fontWeight: 700, color: 'var(--ops-text)' }}>${order.total.toFixed(2)} <span style={{ fontSize: '13px', color: 'var(--ops-text-muted)', fontWeight: 400 }}>{order.currency}</span></div>
                            {order.fulfillmentStatus && <div style={{ fontSize: '12px', color: 'var(--ops-text-muted)', marginTop: '2px' }}>Fulfillment: <span style={{ color: order.fulfillmentStatus === 'fulfilled' ? '#10b981' : '#f59e0b' }}>{order.fulfillmentStatus}</span></div>}
                          </div>
                        </div>

                        <div style={{ padding: '20px 24px', display: 'flex', flexDirection: 'column', gap: '20px' }}>

                          {/* ── Financial Breakdown ── */}
                          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(130px, 1fr))', gap: '10px' }}>
                            {[
                              { label: 'Subtotal', value: `$${order.subtotal.toFixed(2)}` },
                              { label: 'Shipping', value: `$${order.totalShippingPrice.toFixed(2)}`, sub: order.shippingMethod },
                              { label: 'Tax', value: `$${order.totalTax.toFixed(2)}` },
                              { label: 'Discounts', value: order.totalDiscounts > 0 ? `-$${order.totalDiscounts.toFixed(2)}` : '$0.00', highlight: order.totalDiscounts > 0 },
                              { label: 'Total', value: `$${order.total.toFixed(2)}`, bold: true },
                              ...(order.totalRefunded > 0 ? [{ label: 'Refunded', value: `-$${order.totalRefunded.toFixed(2)}`, danger: true }] : []),
                            ].map((f: any) => (
                              <div key={f.label} style={{ padding: '10px 14px', background: 'var(--surface-200)', borderRadius: '10px', border: '1px solid var(--border)' }}>
                                <div style={{ fontSize: '11px', color: 'var(--ops-text-muted)', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '4px' }}>{f.label}</div>
                                <div style={{ fontSize: '15px', fontWeight: f.bold ? 700 : 500, color: f.danger ? '#ef4444' : f.highlight ? '#10b981' : 'var(--ops-text)' }}>{f.value}</div>
                                {f.sub && <div style={{ fontSize: '10px', color: 'var(--ops-text-muted)', marginTop: '2px' }}>{f.sub}</div>}
                              </div>
                            ))}
                          </div>

                          {/* ── Discount Codes ── */}
                          {order.discountCodes && order.discountCodes.length > 0 && (
                            <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', alignItems: 'center' }}>
                              <span style={{ fontSize: '12px', color: 'var(--ops-text-muted)', textTransform: 'uppercase', letterSpacing: '1px' }}>Coupons:</span>
                              {order.discountCodes.map((d: any, idx: number) => (
                                <span key={idx} style={{ padding: '3px 10px', background: 'rgba(16,185,129,0.1)', color: '#10b981', border: '1px solid rgba(16,185,129,0.3)', borderRadius: '100px', fontSize: '12px', fontFamily: 'monospace', fontWeight: 600 }}>
                                  {d.code} (−${d.amount})
                                </span>
                              ))}
                            </div>
                          )}

                          {/* ── Payment & Gateway ── */}
                          {order.paymentGateway && (
                            <div style={{ fontSize: '13px', color: 'var(--ops-text-muted)' }}>
                              Payment via: <span style={{ color: 'var(--ops-text)', fontWeight: 500 }}>{order.paymentGateway}</span>
                            </div>
                          )}

                          {/* ── Addresses ── */}
                          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: '12px' }}>
                            {[
                              { title: '📦 Ship To', addr: order.shippingAddress },
                              ...(order.billingAddress ? [{ title: '💳 Bill To', addr: order.billingAddress }] : []),
                            ].map(({ title, addr }: any) => (
                              <div key={title} style={{ padding: '14px 16px', background: 'var(--surface-200)', borderRadius: '12px', border: '1px solid var(--border)' }}>
                                <div style={{ fontSize: '11px', color: 'var(--ops-text-muted)', textTransform: 'uppercase', letterSpacing: '1px', marginBottom: '10px' }}>{title}</div>
                                {addr.name && <div style={{ fontWeight: 600, color: 'var(--ops-text)', marginBottom: '4px' }}>{addr.name}</div>}
                                {addr.company && <div style={{ fontSize: '13px', color: 'var(--ops-text-muted)' }}>{addr.company}</div>}
                                {addr.address1 && <div style={{ fontSize: '13px', color: 'var(--ops-text)' }}>{addr.address1}</div>}
                                {addr.address2 && <div style={{ fontSize: '13px', color: 'var(--ops-text)' }}>{addr.address2}</div>}
                                {addr.city && <div style={{ fontSize: '13px', color: 'var(--ops-text)' }}>{addr.city}, {addr.state} {addr.zip}</div>}
                                {addr.country && <div style={{ fontSize: '13px', color: 'var(--ops-text-muted)' }}>{addr.country}</div>}
                                {addr.phone && <div style={{ fontSize: '12px', color: 'var(--primary)', marginTop: '6px' }}>📞 {addr.phone}</div>}
                              </div>
                            ))}
                          </div>

                          {/* ── Line Items ── */}
                          <div>
                            <div style={{ fontSize: '12px', color: 'var(--ops-text-muted)', textTransform: 'uppercase', letterSpacing: '1px', marginBottom: '10px' }}>Line Items ({order.items.length})</div>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                              {order.items.map((item: any, idx: number) => (
                                <div key={idx} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '12px', padding: '12px 14px', background: 'var(--surface-200)', borderRadius: '10px', border: '1px solid var(--border)', flexWrap: 'wrap' }}>
                                  <div style={{ flex: 1, minWidth: 0 }}>
                                    <div style={{ fontWeight: 600, color: 'var(--ops-text)', marginBottom: '4px' }}>{item.name}</div>
                                    <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', fontSize: '12px', color: 'var(--ops-text-muted)' }}>
                                      {item.sku && <span>SKU: <span style={{ fontFamily: 'monospace', color: 'var(--ops-text)' }}>{item.sku}</span></span>}
                                      {item.vendor && <span>· {item.vendor}</span>}
                                      {item.variantTitle && <span>· {item.variantTitle}</span>}
                                      {item.fulfillmentStatus && <span>· <span style={{ color: item.fulfillmentStatus === 'fulfilled' ? '#10b981' : '#f59e0b' }}>{item.fulfillmentStatus}</span></span>}
                                    </div>
                                    {item.totalDiscount > 0 && <div style={{ fontSize: '12px', color: '#10b981', marginTop: '2px' }}>Discount: −${item.totalDiscount.toFixed(2)}</div>}
                                  </div>
                                  <div style={{ textAlign: 'right', flexShrink: 0 }}>
                                    <div style={{ fontWeight: 600, color: 'var(--ops-text)' }}>${(item.price * item.quantity).toFixed(2)}</div>
                                    <div style={{ fontSize: '12px', color: 'var(--ops-text-muted)' }}>${item.price.toFixed(2)} × {item.quantity}</div>
                                    {item.compareAtPrice && item.compareAtPrice > item.price && (
                                      <div style={{ fontSize: '11px', color: '#9ca3af', textDecoration: 'line-through' }}>${item.compareAtPrice.toFixed(2)}</div>
                                    )}
                                  </div>
                                </div>
                              ))}
                            </div>
                          </div>

                          {/* ── Tracking Shipments ── */}
                          {order.tracking && order.tracking.length > 0 && (
                            <div>
                              <div style={{ fontSize: '12px', color: 'var(--ops-text-muted)', textTransform: 'uppercase', letterSpacing: '1px', marginBottom: '8px' }}>Shipments</div>
                              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                                {order.tracking.map((t: any, idx: number) => (
                                  <div key={idx} style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '10px 14px', background: 'var(--surface-200)', borderRadius: '10px', border: '1px solid var(--border)', flexWrap: 'wrap' }}>
                                    <span style={{ padding: '2px 8px', background: 'rgba(251,191,36,0.12)', color: '#f59e0b', border: '1px solid rgba(251,191,36,0.3)', borderRadius: '6px', fontSize: '12px', fontWeight: 600 }}>{t.carrier}</span>
                                    {t.trackingUrl ? (
                                      <a href={t.trackingUrl} target="_blank" style={{ color: '#60a5fa', fontFamily: 'monospace', fontSize: '13px', textDecoration: 'none', wordBreak: 'break-all' }}>{t.trackingNumber}</a>
                                    ) : (
                                      <span style={{ fontFamily: 'monospace', fontSize: '13px', color: 'var(--ops-text)', wordBreak: 'break-all' }}>{t.trackingNumber}</span>
                                    )}
                                    {t.shipDate && <span style={{ fontSize: '12px', color: 'var(--ops-text-muted)', marginLeft: 'auto' }}>Shipped {new Date(t.shipDate).toLocaleDateString()}</span>}
                                  </div>
                                ))}
                              </div>
                            </div>
                          )}

                          {/* ── Order Note ── */}
                          {order.note && (
                            <div style={{ padding: '12px 14px', background: 'rgba(167,139,250,0.08)', borderRadius: '10px', border: '1px solid rgba(167,139,250,0.2)' }}>
                              <div style={{ fontSize: '11px', color: '#a78bfa', textTransform: 'uppercase', letterSpacing: '1px', marginBottom: '6px' }}>Order Note</div>
                              <div style={{ fontSize: '13px', color: 'var(--ops-text)' }}>{order.note}</div>
                            </div>
                          )}

                          {/* ── ICCID / IMEI ── */}
                          {(order.iccid || order.imei) && (
                            <div style={{ padding: '14px 16px', background: 'rgba(248, 113, 113, 0.08)', borderRadius: '12px', border: '1px solid rgba(248, 113, 113, 0.2)' }}>
                              <div style={{ fontSize: '11px', color: '#f87171', textTransform: 'uppercase', letterSpacing: '1px', marginBottom: '10px' }}>Device Activation Fields (ShipStation)</div>
                              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: '12px' }}>
                                {order.iccid && (() => {
                                  const iccid = order.iccid;
                                  const isValidIccid = iccid && iccid.length === 20 && iccid.startsWith('89148');
                                  return (
                                    <div>
                                      <div style={{ fontSize: '12px', color: '#f87171', marginBottom: '6px' }}>ICCID {!isValidIccid && '⚠️ Invalid'}</div>
                                      <div style={{ fontFamily: 'monospace', color: !isValidIccid ? '#ef4444' : 'var(--ops-text)', fontSize: '13px', fontWeight: !isValidIccid ? 700 : 400, wordBreak: 'break-all' }}>{iccid}</div>
                                      <button
                                        onClick={() => activeUsageIccid === iccid ? setActiveUsageIccid(null) : fetchUsage(iccid)}
                                        style={{ marginTop: '8px', background: 'var(--surface-300)', border: '1px solid var(--border)', color: 'var(--ops-text)', padding: '5px 10px', borderRadius: '6px', fontSize: '11px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px' }}
                                      >
                                        <BarChart2 size={11} /> Analyze Usage
                                      </button>
                                    </div>
                                  );
                                })()}
                                {order.imei && (
                                  <div>
                                    <div style={{ fontSize: '12px', color: '#f87171', marginBottom: '6px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                                      IMEI
                                      <button 
                                        onClick={() => openReturnsModal(order.imei, order.orderDate)}
                                        style={{ background: 'rgba(234, 179, 8, 0.1)', border: '1px solid rgba(234, 179, 8, 0.3)', color: '#eab308', padding: '2px 6px', borderRadius: '4px', fontSize: '10px', fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '4px' }}
                                      >
                                        <Package size={10} /> Check Returns
                                      </button>
                                    </div>
                                    <div style={{ fontFamily: 'monospace', color: 'var(--ops-text)', fontSize: '13px', wordBreak: 'break-all' }}>{order.imei}</div>
                                  </div>
                                )}
                              </div>
                            </div>
                          )}

                        </div>
                      </div>
                    ))
                  )}
                </div>
                )}

                {/* Support Column */}
                {activeTab === 'support' && (
                <div id="section-support" style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
                  <h3 style={{ fontSize: '20px', color: 'var(--ops-text)', margin: 0, display: 'flex', alignItems: 'center', gap: '8px' }}>
                     <Activity size={20} color="#60a5fa" /> Support Communications
                  </h3>
                  
                  {freescoutData.length === 0 ? (
                    <div style={{ padding: '40px', textAlign: 'center', background: 'var(--surface-200)', borderRadius: '16px', border: '1px dashed rgba(255,255,255,0.1)' }}>
                      <span style={{ color: 'var(--ops-text-muted)' }}>No active tickets linked.</span>
                    </div>
                  ) : (
                    freescoutData.map((ticket, i) => (
                      <div 
                        key={i} 
                        onClick={() => handleViewTicket(ticket)}
                        style={{ padding: '24px', background: 'var(--ops-card-bg)', border: '1px solid rgba(96, 165, 250, 0.2)', borderRadius: '16px', boxShadow: '0 8px 32px rgba(0,0,0,0.2)', cursor: 'pointer', transition: 'all 0.2s', ...({ ':hover': { borderColor: 'rgba(96, 165, 250, 0.5)' } } as any) }}
                      >
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '12px' }}>
                          <div>
                            <div style={{ color: 'var(--ops-text-muted)', fontSize: '13px', marginBottom: '4px' }}>Ticket #{ticket.number}</div>
                            <div style={{ color: 'var(--ops-text)', fontSize: '15px', fontWeight: 600, lineHeight: 1.4, wordBreak: 'break-word' }}>{ticket.subject}</div>
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
                        <div style={{ color: 'var(--ops-text-muted)', fontSize: '13px', lineHeight: 1.6, marginBottom: '16px', fontStyle: 'italic', background: 'var(--surface-200)', padding: '12px', borderRadius: '8px' }}>
                          "{ticket.preview}"
                        </div>
                        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px', color: 'var(--ops-text-muted)' }}>
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
                  <h3 style={{ fontSize: '20px', color: 'var(--ops-text)', margin: 0, display: 'flex', alignItems: 'center', gap: '8px' }}>
                     <Zap size={20} color="#f87171" /> Verizon Network Lines
                  </h3>
                  {Object.keys(thingspaceData).length === 0 ? (
                    <div style={{ padding: '40px', textAlign: 'center', background: 'var(--surface-200)', borderRadius: '16px', border: '1px dashed rgba(255,255,255,0.1)' }}>
                      <span style={{ color: 'var(--ops-text-muted)' }}>No network lines found for this profile.</span>
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
                                <span style={{ fontSize: '14px', color: 'var(--ops-text)', fontWeight: 600 }}>Verizon Line</span>
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
                                 <span style={{ color: 'var(--ops-text-muted)', width: !isValidIccid ? 'auto' : '80px', marginRight: !isValidIccid ? '8px' : '0', display: 'inline-block' }}>ICCID:</span> 
                                 <span style={{ color: !isValidIccid ? '#ef4444' : '#f87171', fontFamily: 'monospace', fontWeight: !isValidIccid ? 700 : 400 }}>{iccid}</span>
                                 {!isValidIccid && <AlertTriangle size={14} color="#ef4444" style={{ marginLeft: '8px' }} />}
                               </div>

                               <div><span style={{ color: 'var(--ops-text-muted)', width: '80px', display: 'inline-block' }}>IMEI:</span> <span style={{ color: '#a78bfa', fontFamily: 'monospace' }}>{imei}</span></div>
                               <div><span style={{ color: 'var(--ops-text-muted)', width: '80px', display: 'inline-block' }}>NUMBER:</span> <span style={{ color: 'var(--ops-text)' }}>{mdn}</span></div>

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
                                 <span style={{ color: 'var(--ops-text-muted)', width: !isValidPlan ? 'auto' : '80px', marginRight: !isValidPlan ? '8px' : '0', display: 'inline-block' }}>PLAN:</span> 
                                 <span style={{ color: !isValidPlan ? '#ef4444' : 'white', fontWeight: !isValidPlan ? 700 : 400 }}>{rawPlan}</span>
                                 {!isValidPlan && <AlertTriangle size={14} color="#ef4444" style={{ marginLeft: '8px' }} />}
                               </div>
                               <div><span style={{ color: 'var(--ops-text-muted)', width: '80px', display: 'inline-block' }}>IP ADDR:</span> <span style={{ color: 'var(--ops-text)', fontFamily: 'monospace' }}>{ip}</span></div>
                            </div>

                            <button 
                              onClick={() => activeUsageIccid === iccid ? setActiveUsageIccid(null) : fetchUsage(iccid)}
                              style={{ width: '100%', marginTop: '16px', background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', color: 'var(--ops-text)', padding: '10px', borderRadius: '8px', fontSize: '13px', cursor: 'pointer', display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '8px' }}
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
                

                {/* Callback Column */}
                {activeTab === 'callbacks' && (() => {
                  const customer = chargebeeData[callbackCustomerIndex] || chargebeeData[0] || {};
                  const subscriptions = customer.subscriptions || [];
                  const latestOrder = [...commerceData].sort((a, b) => new Date(b.orderDate || 0).getTime() - new Date(a.orderDate || 0).getTime())[0];
                  const onFilePhone = customer.phone || latestOrder?.customerPhone || latestOrder?.shippingAddress?.phone || '';
                  const wordCount = callbackReason.trim().split(/\s+/).filter(Boolean).length;
                  const latestSubscription = subscriptions[0];
                  const customerInvoices = invoicesData[customer.id] || [];
                  const latestInvoice = customerInvoices[0];
                  const iccid = latestSubscription?.cf_SIM_ID_ICCID || latestSubscription?.cf_iccid;
                  const network = iccid ? thingspaceData[iccid] : null;
                  return (
                    <div id="section-callbacks" style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 16, alignItems: 'center', flexWrap: 'wrap' }}>
                        <div>
                          <h3 style={{ fontSize: 20, color: 'var(--ops-text)', margin: 0, display: 'flex', alignItems: 'center', gap: 8 }}>
                            <PhoneCall size={20} color="#2dd4bf" /> Request a Call Back
                          </h3>
                          <p style={{ color: 'var(--ops-text-muted)', fontSize: 13, margin: '6px 0 0' }}>Document the request carefully so the callback agent can act without repeating discovery.</p>
                        </div>
                        <button onClick={() => window.location.assign('/callbacks')} style={{ display: 'flex', alignItems: 'center', gap: 8, border: '1px solid var(--border)', background: 'var(--surface-200)', color: 'var(--ops-text)', borderRadius: 8, padding: '10px 14px', cursor: 'pointer', fontWeight: 700 }}>
                          Open Callback Queue <ArrowRight size={15} />
                        </button>
                      </div>

                      {chargebeeData.length > 1 && (
                        <label style={{ display: 'grid', gap: 7, maxWidth: 520 }}>
                          <span style={{ fontSize: 12, fontWeight: 800, color: 'var(--ops-text-muted)', textTransform: 'uppercase' }}>Customer account</span>
                          <select value={callbackCustomerIndex} onChange={e => setCallbackCustomerIndex(Number(e.target.value))} style={{ padding: 12, borderRadius: 8 }}>
                            {chargebeeData.map((item, index) => <option key={item.id || index} value={index}>{item.firstName} {item.lastName} · {item.id}</option>)}
                          </select>
                        </label>
                      )}

                      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(210px, 1fr))', gap: 12 }}>
                        {[
                          { label: 'Customer', value: `${customer.firstName || ''} ${customer.lastName || ''}`.trim() || customer.email || email, detail: customer.email || email },
                          { label: 'Chargebee', value: latestSubscription?.status || 'No subscription', detail: latestSubscription?.id || customer.id || 'No account ID' },
                          { label: 'Billing', value: latestInvoice?.status || `${customerInvoices.length} recent invoices`, detail: latestInvoice ? `Invoice ${latestInvoice.id || latestInvoice.invoice_number || 'available'}` : 'No recent invoice data' },
                          { label: 'Shipment', value: latestOrder?.orderNumber || 'No Shopify order', detail: latestOrder?.tracking?.[0]?.status || latestOrder?.fulfillmentStatus || 'No tracking status' },
                          { label: 'ThingSpace', value: network?.state || network?.status || 'No line data', detail: iccid || 'No ICCID' },
                          { label: 'Requesting Agent', value: callbackAgentEmail || 'Authenticated agent', detail: 'Recorded when submitted' },
                        ].map(item => (
                          <div key={item.label} style={{ padding: 16, background: 'var(--ops-card-bg)', border: '1px solid var(--ops-card-border)', borderRadius: 8 }}>
                            <div style={{ fontSize: 11, color: 'var(--ops-text-muted)', fontWeight: 800, textTransform: 'uppercase', marginBottom: 7 }}>{item.label}</div>
                            <div style={{ fontWeight: 800, color: 'var(--ops-text)', overflow: 'hidden', textOverflow: 'ellipsis' }}>{item.value}</div>
                            <div style={{ color: 'var(--ops-text-muted)', fontSize: 12, marginTop: 4, overflow: 'hidden', textOverflow: 'ellipsis' }}>{item.detail}</div>
                          </div>
                        ))}
                      </div>

                      {callbackActive && (
                        <div style={{ padding: 16, border: '1px solid rgba(245,158,11,0.35)', background: 'rgba(245,158,11,0.1)', borderRadius: 8, color: 'var(--ops-text)' }}>
                          <strong style={{ color: '#f59e0b' }}>Active callback already exists.</strong> Request #{callbackActive.id} is {String(callbackActive.status).replace(/_/g, ' ')} and must be resolved before another can be created.
                        </div>
                      )}

                      <form onSubmit={submitCallbackRequest} style={{ display: 'grid', gap: 20, padding: 22, background: 'var(--ops-card-bg)', border: '1px solid var(--ops-card-border)', borderRadius: 10 }}>
                        <div style={{ padding: 14, borderRadius: 8, background: 'rgba(37,99,235,0.08)', border: '1px solid rgba(37,99,235,0.22)', color: 'var(--ops-text)', lineHeight: 1.5 }}>
                          <strong>Please take your time completing this request.</strong> Everything is recorded and may be used for review and evaluation purposes.
                        </div>

                        <div>
                          <div style={{ fontSize: 12, fontWeight: 800, color: 'var(--ops-text-muted)', textTransform: 'uppercase', marginBottom: 8 }}>Callback phone</div>
                          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginBottom: 12 }}>
                            <button type="button" onClick={() => { setCallbackPhoneChoice('on_file'); setCallbackPrimaryPhone(onFilePhone); }} disabled={!onFilePhone} style={{ padding: '10px 13px', borderRadius: 8, border: `1px solid ${callbackPhoneChoice === 'on_file' ? 'var(--primary)' : 'var(--border)'}`, background: callbackPhoneChoice === 'on_file' ? 'var(--primary-light)' : 'var(--surface-200)', color: 'var(--ops-text)', cursor: onFilePhone ? 'pointer' : 'not-allowed' }}>
                              Use number on file: {onFilePhone || 'Not found'}
                            </button>
                            <button type="button" onClick={() => { setCallbackPhoneChoice('corrected'); setCallbackPrimaryPhone(''); }} style={{ padding: '10px 13px', borderRadius: 8, border: `1px solid ${callbackPhoneChoice === 'corrected' ? 'var(--primary)' : 'var(--border)'}`, background: callbackPhoneChoice === 'corrected' ? 'var(--primary-light)' : 'var(--surface-200)', color: 'var(--ops-text)', cursor: 'pointer' }}>Use a different number</button>
                          </div>
                          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 12 }}>
                            <input value={callbackPrimaryPhone} onChange={e => setCallbackPrimaryPhone(e.target.value)} placeholder="Primary callback number" required style={{ padding: 12, borderRadius: 8 }} />
                            <input value={callbackSecondaryPhone} onChange={e => setCallbackSecondaryPhone(e.target.value)} placeholder="Secondary number (optional)" style={{ padding: 12, borderRadius: 8 }} />
                          </div>
                        </div>

                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 12 }}>
                          <label style={{ display: 'grid', gap: 7 }}>
                            <span style={{ fontSize: 12, fontWeight: 800, color: 'var(--ops-text-muted)', textTransform: 'uppercase' }}>Department</span>
                            <select value={callbackDepartment} onChange={e => { setCallbackDepartment(e.target.value); setCallbackCategory(''); }} required style={{ padding: 12, borderRadius: 8 }}>
                              <option value="">Select department</option>
                              <option value="sales">Sales</option><option value="internet">Internet</option><option value="shipment">Shipment</option>
                              <option value="billing">Billing</option><option value="general_support">General Support</option><option value="cancellation">Cancellation</option>
                            </select>
                          </label>
                          <label style={{ display: 'grid', gap: 7 }}>
                            <span style={{ fontSize: 12, fontWeight: 800, color: 'var(--ops-text-muted)', textTransform: 'uppercase' }}>Category</span>
                            <select value={callbackCategory} onChange={e => setCallbackCategory(e.target.value)} required disabled={!callbackDepartment} style={{ padding: 12, borderRadius: 8 }}>
                              <option value="">Select category</option>
                              {(CALLBACK_CATEGORIES[callbackDepartment] || []).map(item => <option key={item.value} value={item.value}>{item.label}</option>)}
                            </select>
                          </label>
                          <label style={{ display: 'grid', gap: 7 }}>
                            <span style={{ fontSize: 12, fontWeight: 800, color: 'var(--ops-text-muted)', textTransform: 'uppercase' }}>Preferred time</span>
                            <select value={callbackPreferredTime} onChange={e => setCallbackPreferredTime(e.target.value)} required style={{ padding: 12, borderRadius: 8 }}>
                              <option value="">Select preference</option>
                              <option value="morning">Morning</option><option value="afternoon">Afternoon</option><option value="working_hours">Any time during working hours</option>
                            </select>
                          </label>
                        </div>

                        <label style={{ display: 'grid', gap: 8 }}>
                          <span style={{ display: 'flex', justifyContent: 'space-between', gap: 12, fontSize: 12, fontWeight: 800, color: 'var(--ops-text-muted)', textTransform: 'uppercase' }}>
                            Why is a callback needed? <span style={{ color: wordCount >= 25 ? '#10b981' : '#f59e0b' }}>{wordCount}/25 words</span>
                          </span>
                          <textarea value={callbackReason} onChange={e => setCallbackReason(e.target.value)} placeholder="Give the callback agent enough context to understand the issue, work already completed, customer expectations, and the desired outcome." style={{ minHeight: 150, resize: 'vertical', padding: 14, borderRadius: 8, lineHeight: 1.55 }} />
                        </label>

                        {callbackError && <div style={{ color: '#ef4444', padding: 12, borderRadius: 8, background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.25)' }}>{callbackError}</div>}
                        {callbackSuccess && <div style={{ color: '#10b981', padding: 12, borderRadius: 8, background: 'rgba(16,185,129,0.08)', border: '1px solid rgba(16,185,129,0.25)' }}>{callbackSuccess}</div>}

                        <button type="submit" disabled={callbackLoading || Boolean(callbackActive)} style={{ justifySelf: 'start', display: 'flex', alignItems: 'center', gap: 8, padding: '12px 18px', border: 'none', borderRadius: 8, background: callbackLoading || callbackActive ? 'var(--surface-300)' : 'linear-gradient(135deg, var(--primary), #0d9488)', color: 'white', cursor: callbackLoading || callbackActive ? 'not-allowed' : 'pointer', fontWeight: 800 }}>
                          {callbackLoading ? <Loader2 size={16} className="animate-spin" /> : <PhoneCall size={16} />} Request Call Back
                        </button>
                      </form>

                      <div style={{ background: 'var(--ops-card-bg)', border: '1px solid var(--ops-card-border)', borderRadius: 10, overflow: 'hidden' }}>
                        <div style={{ padding: '16px 18px', borderBottom: '1px solid var(--border)', fontWeight: 800 }}>Previous Callbacks</div>
                        {callbackHistory.length === 0 ? (
                          <div style={{ padding: 24, color: 'var(--ops-text-muted)' }}>No previous callbacks found for this customer.</div>
                        ) : callbackHistory.map(item => (
                          <div key={item.id} style={{ padding: 16, borderBottom: '1px solid var(--border)', display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) auto', gap: 16 }}>
                            <div style={{ minWidth: 0 }}>
                              <div style={{ fontWeight: 800, textTransform: 'capitalize' }}>{String(item.department).replace(/_/g, ' ')} · {String(item.category).replace(/_/g, ' ')}</div>
                              <div style={{ color: 'var(--ops-text-muted)', fontSize: 13, marginTop: 5, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{item.reason}</div>
                              {item.outcome_notes && <div style={{ color: 'var(--ops-text-muted)', fontSize: 12, marginTop: 5 }}>Outcome: {item.outcome_notes}</div>}
                            </div>
                            <div style={{ textAlign: 'right', fontSize: 12, color: 'var(--ops-text-muted)' }}>
                              <div style={{ color: item.status === 'completed' ? '#10b981' : '#f59e0b', fontWeight: 800, textTransform: 'uppercase' }}>{String(item.status).replace(/_/g, ' ')}</div>
                              <div style={{ marginTop: 5 }}>{new Date(item.created_at).toLocaleString()}</div>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  );
                })()}

                {/* Returns Column */}
                {activeTab === 'returns' && (
                  <div id="section-returns" style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
                    <h3 style={{ fontSize: '20px', color: 'var(--ops-text)', margin: 0, display: 'flex', alignItems: 'center', gap: '8px' }}>
                       <Package size={20} color="#eab308" /> Hardware Returns
                    </h3>

                    <form suppressHydrationWarning onSubmit={handleReturnsSearch} style={{ width: '100%', position: 'relative' }}>
                      <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
                        <Search size={20} color="#9ca3af" style={{ position: 'absolute', left: '16px' }} />
                        <input 
                          type="text" 
                          placeholder="Enter 15-digit IMEI to query LRLOS database..." 
                          value={returnsImei}
                          onChange={(e) => setReturnsImei(e.target.value)}
                          required
                          style={{ 
                            width: '100%', 
                            padding: '16px 16px 16px 48px', 
                            backgroundColor: 'var(--surface-200)', 
                            border: '1px solid var(--border)', 
                            borderRadius: '16px', 
                            color: 'var(--ops-text)', 
                            fontSize: '16px', 
                            outline: 'none', 
                            transition: 'border-color 0.3s' 
                          }}
                          onFocus={(e) => { e.target.style.borderColor = '#eab308'; }}
                          onBlur={(e) => { e.target.style.borderColor = 'var(--border)'; }}
                        />
                        
                        <button
                          disabled={returnsLoading || !returnsImei}
                          type="submit"
                          style={{ 
                            position: 'absolute',
                            right: '8px',
                            background: 'linear-gradient(135deg, #eab308 0%, #ca8a04 100%)', 
                            border: 'none', 
                            color: 'white', 
                            padding: '10px 20px', 
                            borderRadius: '12px', 
                            fontSize: '14px', 
                            fontWeight: 600, 
                            cursor: returnsLoading || !returnsImei ? 'not-allowed' : 'pointer',
                            display: 'flex',
                            alignItems: 'center',
                            gap: '8px',
                            opacity: returnsLoading || !returnsImei ? 0.7 : 1
                          }}
                        >
                          {returnsLoading ? <Loader2 size={16} className="animate-spin" /> : 'Query LRLOS'}
                        </button>
                      </div>
                      
                      {returnsError && (
                        <div style={{ marginTop: '16px', padding: '12px', backgroundColor: 'rgba(239, 68, 68, 0.1)', border: '1px solid rgba(239, 68, 68, 0.3)', borderRadius: '12px', color: '#ef4444' }}>
                          {returnsError}
                        </div>
                      )}
                    </form>

                    {returnsData && (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '24px', marginTop: '16px' }}>
                        
                        <div style={{ background: 'rgba(234, 179, 8, 0.1)', border: '1px solid rgba(234, 179, 8, 0.3)', padding: '16px', borderRadius: '12px', display: 'flex', gap: '12px', alignItems: 'flex-start' }}>
                          <AlertCircle color="#eab308" size={20} style={{ flexShrink: 0, marginTop: '2px' }} />
                          <div>
                            <strong style={{ color: '#eab308', display: 'block', marginBottom: '4px' }}>Verification Required</strong>
                            <p style={{ color: 'var(--ops-text-muted)', fontSize: '14px', lineHeight: 1.5, margin: 0 }}>
                              The <strong>Created At</strong> date below indicates when the device was officially logged as returned. 
                              To verify this return belongs to the customer you are assisting, make sure that the customer's original <strong>Ship Date</strong> is <em>less than</em> (before) this return date.
                            </p>
                          </div>
                        </div>

                        {returnsData.map((r, i) => (
                          <div key={r.id || i} style={{ background: 'var(--ops-card-bg)', border: '1px solid var(--ops-card-border)', borderRadius: '16px', padding: '24px', boxShadow: 'var(--shadow-md)' }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '24px' }}>
                              <div>
                                <div style={{ fontSize: '12px', color: 'var(--ops-text-muted)', textTransform: 'uppercase', letterSpacing: '1px', marginBottom: '4px' }}>Return Record #{r.id}</div>
                                <div style={{ fontSize: '24px', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '8px' }}>
                                  {r.imei}
                                </div>
                              </div>
                              <div style={{ 
                                padding: '6px 12px', 
                                borderRadius: '8px', 
                                background: r.status === 'started' ? 'rgba(59,130,246,0.1)' : 'var(--surface-200)',
                                color: r.status === 'started' ? '#3b82f6' : 'var(--ops-text-muted)',
                                fontSize: '12px',
                                fontWeight: 600,
                                textTransform: 'uppercase',
                                border: r.status === 'started' ? '1px solid rgba(59,130,246,0.3)' : '1px solid var(--border)'
                              }}>
                                {r.status || 'Unknown Status'}
                              </div>
                            </div>

                            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '16px', marginBottom: '24px' }}>
                              <div style={{ background: 'var(--surface-200)', padding: '12px', borderRadius: '12px', border: '1px solid var(--border)' }}>
                                <div style={{ fontSize: '12px', color: 'var(--ops-text-muted)', marginBottom: '4px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                                  <Calendar size={14} /> Created At (Return Date)
                                </div>
                                <div style={{ fontSize: '15px', fontWeight: 600, color: '#eab308' }}>{r.created_at || 'N/A'}</div>
                              </div>
                              <div style={{ background: 'var(--surface-200)', padding: '12px', borderRadius: '12px', border: '1px solid var(--border)' }}>
                                <div style={{ fontSize: '12px', color: 'var(--ops-text-muted)', marginBottom: '4px' }}>Shopify Order Number</div>
                                <div style={{ fontSize: '15px', fontWeight: 600 }}>{r.shopify_order_number || 'N/A'}</div>
                              </div>
                              <div style={{ background: 'var(--surface-200)', padding: '12px', borderRadius: '12px', border: '1px solid var(--border)' }}>
                                <div style={{ fontSize: '12px', color: 'var(--ops-text-muted)', marginBottom: '4px' }}>Condition</div>
                                <div style={{ fontSize: '15px', fontWeight: 600 }}>{r.modem_condition || 'N/A'}</div>
                              </div>
                              <div style={{ background: 'var(--surface-200)', padding: '12px', borderRadius: '12px', border: '1px solid var(--border)' }}>
                                <div style={{ fontSize: '12px', color: 'var(--ops-text-muted)', marginBottom: '4px' }}>Return Tracking</div>
                                <div style={{ fontSize: '15px', fontWeight: 600, fontFamily: 'monospace' }}>{r.return_tracking || 'N/A'}</div>
                              </div>
                            </div>

                            {r.notes && (
                              <div style={{ background: 'var(--surface-200)', padding: '16px', borderRadius: '12px', borderLeft: '4px solid #3b82f6' }}>
                                <div style={{ fontSize: '12px', color: 'var(--ops-text-muted)', marginBottom: '4px' }}>Notes</div>
                                <div style={{ fontSize: '14px', lineHeight: 1.5 }}>{r.notes}</div>
                              </div>
                            )}
                          </div>
                        ))}
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
                <div style={{ padding: '24px', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'rgba(20,20,20,0.9)' }}>
                  <div>
                    <div style={{ color: '#60a5fa', fontSize: '13px', fontWeight: 600, marginBottom: '6px' }}>TICKET #{activeTicket.number}</div>
                    <div style={{ color: 'var(--ops-text)', fontSize: '18px', fontWeight: 600 }}>{activeTicket.subject}</div>
                  </div>
                  <button onClick={() => { setActiveTicket(null); setActiveThreads([]); }} style={{ background: 'rgba(255,255,255,0.1)', border: 'none', color: 'var(--ops-text)', padding: '8px', borderRadius: '50%', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <X size={20} />
                  </button>
                </div>

                <div style={{ padding: '24px', overflowY: 'auto', flex: 1, display: 'flex', flexDirection: 'column', gap: '24px', background: '#0a0a0a' }}>
                  {isTicketLoading ? (
                    <div style={{ display: 'flex', justifyContent: 'center', padding: '40px', color: '#60a5fa' }}>
                      <Loader2 size={32} style={{ animation: 'spin 1s linear infinite' }} />
                    </div>
                  ) : activeThreads.length === 0 ? (
                    <div style={{ color: 'var(--ops-text-muted)', textAlign: 'center', padding: '40px' }}>No conversation history found.</div>
                  ) : (
                    activeThreads.map((thread: any, idx: number) => {
                      const isCustomer = thread.createdBy?.type === 'customer' || thread.type === 'customer';
                      return (
                        <div key={idx} style={{ alignSelf: isCustomer ? 'flex-end' : 'flex-start', maxWidth: '85%' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '6px', justifyContent: isCustomer ? 'flex-end' : 'flex-start' }}>
                            <div style={{ fontSize: '12px', color: 'var(--ops-text-muted)', fontWeight: 500 }}>{thread.createdBy?.firstName} {thread.createdBy?.lastName}</div>
                            <div style={{ fontSize: '11px', color: 'var(--ops-text-muted)' }}>{new Date(thread.createdAt).toLocaleString()}</div>
                          </div>
                          <div style={{
                            background: isCustomer ? 'rgba(96, 165, 250, 0.15)' : 'rgba(255,255,255,0.05)',
                            border: `1px solid ${isCustomer ? 'rgba(96, 165, 250, 0.3)' : 'rgba(255,255,255,0.1)'}`,
                            padding: '16px 20px', borderRadius: isCustomer ? '24px 24px 4px 24px' : '24px 24px 24px 4px',
                            color: 'var(--ops-text)', fontSize: '14px', lineHeight: 1.6,
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
                <div style={{ padding: '24px', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'rgba(20,20,20,0.9)' }}>
                  <div>
                    <div style={{ color: '#a78bfa', fontSize: '13px', fontWeight: 600, marginBottom: '6px' }}>SUBSCRIPTION #{activeCbSub.id}</div>
                    <div style={{ color: 'var(--ops-text)', fontSize: '18px', fontWeight: 600 }}>{activeCbCustomer?.firstName} {activeCbCustomer?.lastName}</div>
                  </div>
                  <button onClick={() => { setActiveCbSub(null); setCbFinancials(null); }} style={{ background: 'rgba(255,255,255,0.1)', border: 'none', color: 'var(--ops-text)', padding: '8px', borderRadius: '50%', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <X size={20} />
                  </button>
                </div>

                {/* Tab Navigation */}
                <div style={{ display: 'flex', padding: '0 24px', borderBottom: '1px solid var(--border)', background: 'rgba(15,15,15,1)' }}>
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
                    <div style={{ color: 'var(--ops-text-muted)', textAlign: 'center', padding: '40px' }}>Failed to retrieve connection logic.</div>
                  ) : (
                    <>
                      {/* Comments View */}
                      {cbTab === 'comments' && (
                        <>
                          {cbFinancials.comments?.length === 0 && <div style={{ color: 'var(--ops-text-muted)', textAlign: 'center', padding: '40px' }}>No comments recorded on this subscription.</div>}
                          {cbFinancials.comments.map((comment: any, idx: number) => (
                            <div key={idx} style={{ background: 'rgba(255,255,255,0.05)', padding: '16px', borderRadius: '12px' }}>
                              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px' }}>
                                <span style={{ color: '#a78bfa', fontSize: '13px', fontWeight: 600 }}>{comment.added_by}</span>
                                <span style={{ color: 'var(--ops-text-muted)', fontSize: '12px' }}>{new Date(comment.created_at * 1000).toLocaleString()}</span>
                              </div>
                              <div style={{ color: 'var(--ops-text)', fontSize: '14px', whiteSpace: 'pre-wrap', lineHeight: 1.5 }}>{comment.notes}</div>
                            </div>
                          ))}
                        </>
                      )}

                      {/* Invoices View */}
                      {cbTab === 'invoices' && (
                        <>
                          {cbFinancials.invoices?.length === 0 && <div style={{ color: 'var(--ops-text-muted)', textAlign: 'center', padding: '40px' }}>No invoices linked to this subscription.</div>}
                          {cbFinancials.invoices.map((inv: any, idx: number) => (
                            <div key={idx} style={{ display: 'flex', justifyContent: 'space-between', background: 'rgba(255,255,255,0.05)', padding: '16px', borderRadius: '12px', alignItems: 'center' }}>
                              <div>
                                <div style={{ color: 'var(--ops-text)', fontWeight: 600, fontSize: '15px' }}>${(inv.total / 100).toFixed(2)}</div>
                                <div style={{ color: 'var(--ops-text-muted)', fontSize: '12px', marginTop: '4px' }}>{inv.id} • {new Date(inv.date * 1000).toLocaleDateString()}</div>
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
                          {cbFinancials.transactions?.length === 0 && <div style={{ color: 'var(--ops-text-muted)', textAlign: 'center', padding: '40px' }}>No transactions recorded for this customer core.</div>}
                          {cbFinancials.transactions.map((tx: any, idx: number) => (
                            <div key={idx} style={{ display: 'flex', justifyContent: 'space-between', background: 'rgba(255,255,255,0.05)', padding: '16px', borderRadius: '12px', alignItems: 'center' }}>
                              <div>
                                <div style={{ color: 'var(--ops-text)', fontWeight: 600, fontSize: '15px' }}>${(tx.amount / 100).toFixed(2)}</div>
                                <div style={{ color: 'var(--ops-text-muted)', fontSize: '12px', marginTop: '4px' }}>{tx.id} • {new Date(tx.date * 1000).toLocaleDateString()}</div>
                                {tx.payment_method && <div style={{ color: 'var(--ops-text-muted)', fontSize: '11px', marginTop: '2px' }}>Method: {tx.payment_method.toUpperCase()}</div>}
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
                          {cbFinancials.creditNotes?.length === 0 && <div style={{ color: 'var(--ops-text-muted)', textAlign: 'center', padding: '40px' }}>No credit notes logged against this customer core.</div>}
                          {cbFinancials.creditNotes.map((cn: any, idx: number) => (
                            <div key={idx} style={{ display: 'flex', justifyContent: 'space-between', background: 'rgba(255,255,255,0.05)', padding: '16px', borderRadius: '12px', alignItems: 'flex-start' }}>
                              <div>
                                <div style={{ color: 'var(--ops-text)', fontWeight: 600, fontSize: '15px' }}>${(cn.total / 100).toFixed(2)} Refund/Note</div>
                                <div style={{ color: 'var(--ops-text-muted)', fontSize: '12px', marginTop: '4px' }}>{cn.id} • {new Date(cn.date * 1000).toLocaleDateString()}</div>
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

        {/* Returns Checking Modal Overlay */}
        <AnimatePresence>
          {returnsModal && (
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
                  background: '#111', border: '1px solid rgba(234, 179, 8, 0.3)', borderRadius: '24px',
                  width: '100%', maxWidth: '800px', maxHeight: '90vh',
                  display: 'flex', flexDirection: 'column', overflow: 'hidden', boxShadow: '0 24px 64px rgba(234, 179, 8, 0.15)'
                }}
              >
                <div style={{ padding: '24px', borderBottom: '1px solid rgba(234, 179, 8, 0.1)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'rgba(20,20,20,0.9)' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                    <Package size={24} color="#eab308" />
                    <div>
                      <div style={{ color: '#eab308', fontSize: '12px', fontWeight: 600, marginBottom: '2px', textTransform: 'uppercase', letterSpacing: '1px' }}>Hardware Returns Query</div>
                      <div style={{ color: 'var(--ops-text)', fontSize: '18px', fontWeight: 600, fontFamily: 'monospace' }}>{returnsModal.imei}</div>
                    </div>
                  </div>
                  <button onClick={() => setReturnsModal(null)} style={{ background: 'rgba(255,255,255,0.1)', border: 'none', color: 'var(--ops-text)', padding: '8px', borderRadius: '50%', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <X size={20} />
                  </button>
                </div>

                <div style={{ padding: '24px', flex: 1, display: 'flex', flexDirection: 'column', gap: '24px', background: '#0a0a0a', overflowY: 'auto' }}>
                  {modalReturnsLoading ? (
                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '60px 0', gap: '16px' }}>
                      <Loader2 className="animate-spin" color="#eab308" size={32} />
                      <span style={{ color: 'var(--ops-text-muted)', fontSize: '14px', animation: 'pulse 2s infinite' }}>Querying LRLOS...</span>
                    </div>
                  ) : modalReturnsError ? (
                    <div style={{ display: 'flex', alignItems: 'center', gap: '12px', color: '#ef4444', fontSize: '14px', padding: '24px', background: 'rgba(239,68,68,0.1)', borderRadius: '12px', border: '1px solid rgba(239,68,68,0.2)' }}>
                      <AlertTriangle size={24} /> {modalReturnsError}
                    </div>
                  ) : modalReturnsData ? (
                    <>
                      {returnsModal.orderDate && (() => {
                        const orderDate = new Date(returnsModal.orderDate);
                        const firstReturn = modalReturnsData[0];
                        const returnDate = new Date(firstReturn.created_at);
                        const isValid = returnDate > orderDate;

                        return (
                          <div style={{ background: isValid ? 'rgba(16, 185, 129, 0.1)' : 'rgba(239, 68, 68, 0.1)', border: `1px solid ${isValid ? 'rgba(16, 185, 129, 0.3)' : 'rgba(239, 68, 68, 0.3)'}`, padding: '16px', borderRadius: '12px', display: 'flex', gap: '12px', alignItems: 'center' }}>
                            {isValid ? <Check color="#10b981" size={24} /> : <AlertTriangle color="#ef4444" size={24} />}
                            <div>
                              <strong style={{ color: isValid ? '#10b981' : '#ef4444', display: 'block', marginBottom: '4px' }}>
                                {isValid ? 'Validation Passed' : 'Validation Failed: Review Immediately'}
                              </strong>
                              <p style={{ color: 'var(--ops-text)', fontSize: '14px', margin: 0 }}>
                                {isValid 
                                  ? 'This return was logged AFTER the original order date, which means it probably belongs to this customer.'
                                  : 'This return was logged BEFORE the original order date! This device may belong to a previous customer or the record is mismatched.'}
                              </p>
                              <div style={{ marginTop: '8px', fontSize: '12px', color: 'var(--ops-text-muted)' }}>
                                Order Date: {orderDate.toLocaleDateString()} | Return Date: {returnDate.toLocaleDateString()}
                              </div>
                            </div>
                          </div>
                        );
                      })()}

                      {!returnsModal.orderDate && (
                        <div style={{ background: 'rgba(255, 255, 255, 0.05)', padding: '16px', borderRadius: '12px', fontSize: '13px', color: 'var(--ops-text-muted)' }}>
                          <Info size={16} style={{ display: 'inline', verticalAlign: 'middle', marginRight: '6px' }} />
                          Since no order date was provided by the source module, automatic validation could not be run. Please verify the return date manually.
                        </div>
                      )}

                      {modalReturnsData.map((r, i) => (
                        <div key={r.id || i} style={{ background: 'var(--surface-100)', border: '1px solid var(--border)', borderRadius: '16px', padding: '24px' }}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '24px' }}>
                            <div>
                              <div style={{ fontSize: '12px', color: 'var(--ops-text-muted)', textTransform: 'uppercase', letterSpacing: '1px', marginBottom: '4px' }}>Record #{r.id}</div>
                              <div style={{ fontSize: '24px', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '8px' }}>
                                {r.imei}
                              </div>
                            </div>
                            <div style={{ 
                              padding: '6px 12px', 
                              borderRadius: '8px', 
                              background: r.status === 'started' ? 'rgba(59,130,246,0.1)' : 'var(--surface-200)',
                              color: r.status === 'started' ? '#3b82f6' : 'var(--ops-text-muted)',
                              fontSize: '12px',
                              fontWeight: 600,
                              textTransform: 'uppercase',
                              border: r.status === 'started' ? '1px solid rgba(59,130,246,0.3)' : '1px solid var(--border)'
                            }}>
                              {r.status || 'Unknown Status'}
                            </div>
                          </div>

                          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '16px', marginBottom: '24px' }}>
                            <div style={{ background: 'var(--surface-200)', padding: '12px', borderRadius: '12px', border: '1px solid var(--border)' }}>
                              <div style={{ fontSize: '12px', color: 'var(--ops-text-muted)', marginBottom: '4px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                                <Calendar size={14} /> Created At
                              </div>
                              <div style={{ fontSize: '15px', fontWeight: 600, color: '#eab308' }}>{r.created_at || 'N/A'}</div>
                            </div>
                            <div style={{ background: 'var(--surface-200)', padding: '12px', borderRadius: '12px', border: '1px solid var(--border)' }}>
                              <div style={{ fontSize: '12px', color: 'var(--ops-text-muted)', marginBottom: '4px' }}>Shopify Order</div>
                              <div style={{ fontSize: '15px', fontWeight: 600 }}>{r.shopify_order_number || 'N/A'}</div>
                            </div>
                            <div style={{ background: 'var(--surface-200)', padding: '12px', borderRadius: '12px', border: '1px solid var(--border)' }}>
                              <div style={{ fontSize: '12px', color: 'var(--ops-text-muted)', marginBottom: '4px' }}>Condition</div>
                              <div style={{ fontSize: '15px', fontWeight: 600 }}>{r.modem_condition || 'N/A'}</div>
                            </div>
                            <div style={{ background: 'var(--surface-200)', padding: '12px', borderRadius: '12px', border: '1px solid var(--border)' }}>
                              <div style={{ fontSize: '12px', color: 'var(--ops-text-muted)', marginBottom: '4px' }}>Tracking</div>
                              <div style={{ fontSize: '15px', fontWeight: 600, fontFamily: 'monospace' }}>{r.return_tracking || 'N/A'}</div>
                            </div>
                          </div>

                          {r.notes && (
                            <div style={{ background: 'var(--surface-200)', padding: '16px', borderRadius: '12px', borderLeft: '4px solid #3b82f6' }}>
                              <div style={{ fontSize: '12px', color: 'var(--ops-text-muted)', marginBottom: '4px' }}>Notes</div>
                              <div style={{ fontSize: '14px', lineHeight: 1.5 }}>{r.notes}</div>
                            </div>
                          )}
                        </div>
                      ))}
                    </>
                  ) : null}
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
                    <div style={{ color: 'var(--ops-text)', fontSize: '18px', fontWeight: 600, fontFamily: 'monospace' }}>{activeUsageIccid}</div>
                  </div>
                </div>
                <button onClick={() => setActiveUsageIccid(null)} style={{ background: 'rgba(255,255,255,0.1)', border: 'none', color: 'var(--ops-text)', padding: '8px', borderRadius: '50%', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <X size={20} />
                </button>
              </div>

              <div style={{ padding: '24px', flex: 1, display: 'flex', flexDirection: 'column', gap: '24px', background: '#0a0a0a' }}>
                <div style={{ display: 'flex', gap: '16px', alignItems: 'flex-end' }}>
                  <div style={{ flex: 1 }}>
                    <label style={{ display: 'block', fontSize: '11px', color: 'var(--ops-text-muted)', marginBottom: '6px', fontWeight: 500, letterSpacing: '0.5px' }}>EARLIEST SCAN RANGE</label>
                    <input type="date" value={usageEarliest} onChange={e => setUsageEarliest(e.target.value)} style={{ width: '100%', background: 'rgba(0,0,0,0.5)', border: '1px solid rgba(255,255,255,0.1)', color: 'var(--ops-text)', padding: '12px', borderRadius: '8px', outline: 'none', colorScheme: 'dark', fontSize: '14px' }} />
                  </div>
                  <div style={{ flex: 1 }}>
                    <label style={{ display: 'block', fontSize: '11px', color: 'var(--ops-text-muted)', marginBottom: '6px', fontWeight: 500, letterSpacing: '0.5px' }}>LATEST SCAN RANGE</label>
                    <input type="date" value={usageLatest} onChange={e => setUsageLatest(e.target.value)} style={{ width: '100%', background: 'rgba(0,0,0,0.5)', border: '1px solid rgba(255,255,255,0.1)', color: 'var(--ops-text)', padding: '12px', borderRadius: '8px', outline: 'none', colorScheme: 'dark', fontSize: '14px' }} />
                  </div>
                  <button onClick={() => fetchUsage(activeUsageIccid!)} disabled={usageLoading} style={{ height: '43px', background: '#f87171', color: 'var(--ops-text)', border: 'none', padding: '0 24px', borderRadius: '8px', cursor: usageLoading ? 'not-allowed' : 'pointer', opacity: usageLoading ? 0.7 : 1, display: 'flex', alignItems: 'center', gap: '8px', fontWeight: 600 }}>
                    {usageLoading ? <Loader2 size={18} className="animate-spin" /> : <Play size={18} />} PULL
                  </button>
                </div>

                {usageLoading ? (
                  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '60px 0', gap: '16px' }}>
                    <Loader2 className="animate-spin" color="#f87171" size={32} />
                    <span style={{ color: 'var(--ops-text-muted)', fontSize: '14px', animation: 'pulse 2s infinite' }}>Querying ThingSpace Matrix...</span>
                  </div>
                ) : usageError ? (
                  <div style={{ display: 'flex', alignItems: 'center', gap: '12px', color: '#ef4444', fontSize: '14px', padding: '24px', background: 'rgba(239,68,68,0.1)', borderRadius: '12px', border: '1px solid rgba(239,68,68,0.2)' }}>
                    <AlertTriangle size={24} /> {usageError}
                  </div>
                ) : usageData.length === 0 ? (
                  <div style={{ color: 'var(--ops-text-muted)', fontSize: '15px', textAlign: 'center', padding: '40px', background: 'rgba(255,255,255,0.03)', borderRadius: '12px', border: '1px dashed rgba(255,255,255,0.1)' }}>
                    No raw telemetry emitted natively by this network tower during this phase frame.
                  </div>
                ) : (
                  <div style={{ height: '300px', width: '100%', background: 'var(--surface-200)', padding: '24px', borderRadius: '12px', border: '1px solid var(--border)' }}>
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

                <div style={{ fontSize: '12px', color: 'var(--ops-text-muted)', lineHeight: 1.6, background: 'rgba(255,255,255,0.02)', padding: '16px', borderRadius: '12px', border: '1px solid var(--border)' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px', color: 'var(--ops-text-muted)', marginBottom: '8px', fontWeight: 600 }}>
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
