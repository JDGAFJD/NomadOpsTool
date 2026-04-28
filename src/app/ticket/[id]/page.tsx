"use client";

import { useEffect, useState, use, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowLeft, User, Mail, Hash, Send, FileText, CheckCircle, Loader2, CreditCard, Search, Link as LinkIcon, FileDigit, Wifi, WifiOff, Power, Cpu, ShieldAlert, ShoppingCart, Package, PackageCheck, ShoppingBag, Sparkles } from 'lucide-react';
import Link from 'next/link';
import { Ticket, Thread } from '@/lib/services/FreeScoutService';

export default function TicketFocusView({ params }: { params: Promise<{ id: string }> }) {
  const router = useRouter();
  const { id } = use(params);
  
  const [ticket, setTicket] = useState<Ticket | null>(null);
  const [threads, setThreads] = useState<Thread[]>([]);
  const [loading, setLoading] = useState(true);
  
  const [replyText, setReplyText] = useState('');
  const [replyType, setReplyType] = useState<'reply' | 'note'>('reply');
  const [submitting, setSubmitting] = useState(false);

  // Chargebee Integration State
  const [chargebeeData, setChargebeeData] = useState<any>(null);
  const [chargebeeLoading, setChargebeeLoading] = useState(false);
  const [chargebeeEmail, setChargebeeEmail] = useState('');
  const [expandedInvoices, setExpandedInvoices] = useState<Record<string, any>>({});
  const [paymentLinks, setPaymentLinks] = useState<Record<string, string | 'loading'>>({});

  // ThingSpace Integration State
  const [thingSpaceManualSearch, setThingSpaceManualSearch] = useState('');
  const [simRecords, setSimRecords] = useState<any[]>([]);
  const [thingSpaceInitialized, setThingSpaceInitialized] = useState(false);
  const [thingSpaceIccid, setThingSpaceIccid] = useState('');

  // Commerce Integration State
  const [commerceData, setCommerceData] = useState<any[]>([]);
  const [commerceLoading, setCommerceLoading] = useState(false);
  const [commerceEmail, setCommerceEmail] = useState('');
  const [expandedOrders, setExpandedOrders] = useState<Record<string, boolean>>({});

  // AI Integration State
  const [aiGenerating, setAiGenerating] = useState(false);
  const [aiPrompt, setAiPrompt] = useState('');
  const [showAiConfig, setShowAiConfig] = useState(false);

  // Agent Chat State
  const [agentChatOpen, setAgentChatOpen] = useState(false);
  const [agentChatMessages, setAgentChatMessages] = useState<{role: string, content: string}[]>([]);
  const [agentChatInput, setAgentChatInput] = useState('');
  const [agentChatLoading, setAgentChatLoading] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
     if (scrollRef.current) {
        scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
     }
  }, [agentChatMessages]);
  
  const handleAgentChatSubmit = async () => {
     if (!agentChatInput.trim() || agentChatLoading) return;
     const newMsg = { role: 'user', content: agentChatInput };
     setAgentChatMessages(prev => [...prev, newMsg]);
     setAgentChatInput('');
     setAgentChatLoading(true);

     try {
       const res = await fetch('/api/ai/chat', {
         method: 'POST',
         headers: { 'Content-Type': 'application/json' },
         body: JSON.stringify({
           ticketId: ticket?.id,
           messages: [...agentChatMessages, newMsg],
           contextData: {
             chargebeeData,
             thingSpaceRecords: simRecords,
             commerceData
           }
         })
       });
       if (res.ok) {
         const data = await res.json();
         setAgentChatMessages(prev => [...prev, { role: 'assistant', content: data.reply }]);
       } else {
         const errData = await res.json();
         setAgentChatMessages(prev => [...prev, { role: 'assistant', content: `⚠️ Error: ${errData.error || 'Server error'}` }]);
       }
     } catch {
       setAgentChatMessages(prev => [...prev, { role: 'assistant', content: '⚠️ Network Error communicating with Agent API.' }]);
     } finally {
       setAgentChatLoading(false);
     }
  };

  useEffect(() => {
    async function loadTicket() {
      try {
        const res = await fetch(`/api/tickets/${id}`);
        const data = await res.json();
        if (data.ticket) {
          setTicket(data.ticket);
          // Threads are reversed so newest is bottom
          setThreads([...data.threads].reverse());
        }
      } catch (err) {
        console.error(err);
      } finally {
        setLoading(false);
      }
    }
    loadTicket();
  }, [id]);

  useEffect(() => {
    if (ticket && ticket.customer && ticket.customer.email && !chargebeeData && !chargebeeLoading && !chargebeeEmail) {
      setChargebeeEmail(ticket.customer.email);
      loadChargebee(ticket.customer.email);
    }
  }, [ticket, chargebeeData, chargebeeLoading, chargebeeEmail]);

  const loadChargebee = async (emailToSearch: string) => {
    if (!emailToSearch) return;
    setChargebeeLoading(true);
    setExpandedInvoices({}); // reset expanded on new search
    setPaymentLinks({});
    try {
      const res = await fetch(`/api/integrations/chargebee?email=${encodeURIComponent(emailToSearch)}`);
      if (res.ok) {
        const data = await res.json();
        setChargebeeData(data);
      }
    } catch (e) {
      console.error('Failed to load Chargebee details:', e);
    } finally {
      setChargebeeLoading(false);
    }
  };

  const toggleInvoices = async (customerId: string, subId: string) => {
    if (expandedInvoices[subId]) {
      const copy = { ...expandedInvoices };
      delete copy[subId];
      setExpandedInvoices(copy);
      return;
    }
    
    setExpandedInvoices(prev => ({ ...prev, [subId]: 'loading' }));
    try {
      const res = await fetch(`/api/integrations/chargebee/invoices?customer_id=${encodeURIComponent(customerId)}&subscription_id=${encodeURIComponent(subId)}`);
      const data = await res.json();
      setExpandedInvoices(prev => ({ ...prev, [subId]: data.invoices || [] }));
    } catch {
      setExpandedInvoices(prev => ({ ...prev, [subId]: [] }));
    }
  };

  const generateLink = async (customerId: string, subId: string) => {
    setPaymentLinks(prev => ({ ...prev, [subId]: 'loading' }));
    try {
      const res = await fetch(`/api/integrations/chargebee/payment`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ customerId })
      });
      const data = await res.json();
      setPaymentLinks(prev => ({ ...prev, [subId]: data.url || 'Error generating link' }));
    } catch {
      setPaymentLinks(prev => ({ ...prev, [subId]: 'Error generating link' }));
    }
  };

  useEffect(() => {
    if (chargebeeData && chargebeeData.customers && !thingSpaceInitialized) {
       setThingSpaceInitialized(true);
       const records: any[] = [];
       for (const cust of chargebeeData.customers) {
          for (const sub of cust.subscriptions) {
             const found = sub.cf_iccid || sub.cf_SIM_ID_ICCID || sub.cf_imei || sub.cf_Device_IMEI; // Grab the first ICCID or IMEI we find
             if (found) {
                if (!records.find(r => r.iccid === found)) {
                    records.push({
                       iccid: found,
                       subId: sub.id,
                       subStatus: sub.status,
                       dues: sub.total_dues || 0,
                       loading: false,
                       data: null,
                       actionLoading: null
                    });
                }
             }
          }
       }
       setSimRecords(records);
       records.forEach(r => loadSimRecord(r.iccid));
    }
  }, [chargebeeData, thingSpaceInitialized]);

  const loadSimRecord = async (targetIccid: string) => {
    if (!targetIccid) return;
    setSimRecords(prev => prev.map(r => r.iccid === targetIccid ? { ...r, loading: true } : r));
    try {
      const res = await fetch(`/api/integrations/thingspace/device?iccid=${encodeURIComponent(targetIccid)}`);
      const data = await res.json();
      setSimRecords(prev => prev.map(r => r.iccid === targetIccid ? { ...r, loading: false, data: data.found ? data.device : 'NOT_FOUND' } : r));
    } catch (e) {
      console.error(e);
      setSimRecords(prev => prev.map(r => r.iccid === targetIccid ? { ...r, loading: false, data: 'NOT_FOUND' } : r));
    }
  };

  const handleThingSpaceAction = async (iccid: string, action: 'suspend' | 'restore') => {
    if (!confirm(`Are you sure you want to ${action.toUpperCase()} this SIM?`)) return;
    setSimRecords(prev => prev.map(r => r.iccid === iccid ? { ...r, actionLoading: action } : r));
    try {
      const res = await fetch(`/api/integrations/thingspace/action`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ iccid, action })
      });
      if (res.ok) {
        alert(`${action.toUpperCase()} command sent successfully! Note: ThingSpace queues this request asynchronously, it may take a minute to reflect.`);
        setTimeout(() => loadSimRecord(iccid), 3000);
      } else {
        const err = await res.json();
        alert(`Error: ${err.error}`);
        setSimRecords(prev => prev.map(r => r.iccid === iccid ? { ...r, actionLoading: null } : r));
      }
    } catch {
      alert('Action failed due to network error.');
      setSimRecords(prev => prev.map(r => r.iccid === iccid ? { ...r, actionLoading: null } : r));
    }
  };

  useEffect(() => {
    if (ticket && ticket.customer && ticket.customer.email && !commerceEmail) {
       setCommerceEmail(ticket.customer.email);
       loadCommerce(ticket.customer.email);
    }
  }, [ticket, commerceEmail]);

  const loadCommerce = async (email: string) => {
    if (!email) return;
    setCommerceLoading(true);
    try {
      const res = await fetch(`/api/integrations/commerce?email=${encodeURIComponent(email)}`);
      if (res.ok) {
        const data = await res.json();
        setCommerceData(data.orders || []);
      }
    } catch (e) {
      console.error(e);
    } finally {
      setCommerceLoading(false);
    }
  };

  const toggleOrder = (orderId: string) => {
     setExpandedOrders(prev => ({ ...prev, [orderId]: !prev[orderId] }));
  };

  const generateAIResponse = async (customInstruction?: string) => {
    if (!ticket) return;
    setAiGenerating(true);
    try {
      const res = await fetch('/api/ai/suggest', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          threads,
          chargebeeData,
          thingSpaceRecords: simRecords,
          commerceData,
          customPrompt: customInstruction || undefined
        })
      });
      const data = await res.json();
      if (res.ok && data.reply) {
        setReplyText(data.reply);
        setReplyType('reply');
      } else {
        alert(`AI Generation Failed: ${data.error || 'Unknown error'}`);
      }
    } catch (err) {
      alert('Failed to connect to AI server.');
    } finally {
      setAiGenerating(false);
      setAiPrompt('');
      setShowAiConfig(false);
    }
  };

  const handleSubmit = async (targetStatus: string) => {
    if (!replyText.trim() && targetStatus === 'active') return;

    setSubmitting(true);
    try {
      const actionCategory = replyText.trim() ? (replyType === 'reply' ? 'reply' : 'note') : 'status_update';
      const payload = {
        action: actionCategory,
        text: replyText,
        targetStatus
      };

      const res = await fetch(`/api/tickets/${id}/reply`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      
      if (res.ok) {
        if (targetStatus === 'closed' || targetStatus === 'pending') {
          // Go back to load the next one automatically
          router.push('/'); 
        } else {
          // Just reload this ticket's threads inside the current view
          setReplyText('');
          const ticketRes = await fetch(`/api/tickets/${id}`);
          const ticketData = await ticketRes.json();
          if (ticketData.threads) setThreads([...ticketData.threads].reverse());
          if (ticketData.ticket) setTicket(ticketData.ticket);
        }
      }
    } catch (err) {
      console.error(err);
      alert('Failed to submit response');
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div style={{ display: 'flex', height: '100%', alignItems: 'center', justifyContent: 'center' }}>
        <Loader2 className="animate-spin" size={32} color="var(--primary)" style={{ animation: 'spin 1s linear infinite' }} />
        <style jsx global>{`@keyframes spin { 100% { transform: rotate(360deg); } }`}</style>
      </div>
    );
  }

  if (!ticket) {
    return (
      <div style={{ padding: '40px', textAlign: 'center' }}>
        <h2>Ticket Not Found</h2>
        <Link href="/" className="btn btn-secondary" style={{ marginTop: '24px' }}>Back to Workspace</Link>
      </div>
    );
  }

  return (
    <div className="animate-fade-in" style={{ display: 'flex', height: '100%' }}>
      
      {/* Meta Sidebar */}
      <div style={{ 
        width: '300px', 
        borderRight: '1px solid var(--border)', 
        backgroundColor: 'var(--surface-100)',
        padding: '24px',
        display: 'flex',
        flexDirection: 'column'
      }}>
        <div style={{ marginBottom: '32px' }}>
          <Link href="/" style={{ display: 'inline-flex', alignItems: 'center', gap: '8px', color: 'var(--text-secondary)', fontSize: '14px', marginBottom: '24px' }}>
            <ArrowLeft size={16} /> Back
          </Link>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '16px' }}>
            <span style={{ 
              background: ticket.status === 1 ? 'rgba(16, 185, 129, 0.15)' : 'rgba(245, 158, 11, 0.15)', 
              color: ticket.status === 1 ? 'var(--success)' : 'var(--warning)', 
              padding: '4px 10px', 
              borderRadius: 'var(--radius-full)', 
              fontSize: '12px', 
              fontWeight: 600,
              textTransform: 'uppercase'
            }}>
              {ticket.status === 1 ? 'Active' : 'Pending'}
            </span>
            <span style={{ color: 'var(--text-muted)', fontSize: '14px', display: 'flex', alignItems: 'center', gap: '4px' }}>
              <Hash size={14} /> {ticket.number}
            </span>
          </div>
          <h2 style={{ fontSize: '20px', lineHeight: 1.3, marginBottom: '24px' }}>
            {ticket.subject}
          </h2>
        </div>

        <div className="glass-panel" style={{ padding: '16px', background: 'var(--surface-200)' }}>
          <h3 style={{ fontSize: '12px', textTransform: 'uppercase', color: 'var(--text-muted)', letterSpacing: '1px', marginBottom: '16px' }}>
            Customer Details
          </h3>
          
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '16px' }}>
            <div style={{ width: '40px', height: '40px', borderRadius: '50%', background: 'var(--primary-light)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <User size={20} color="var(--primary)" />
            </div>
            <div>
              <div style={{ fontWeight: 600, fontSize: '14px' }}>{ticket.customer.firstNames} {ticket.customer.lastName}</div>
              <div style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>Customer</div>
            </div>
          </div>

          <div style={{ fontSize: '13px', color: 'var(--text-secondary)', display: 'flex', alignItems: 'center', gap: '8px' }}>
            <Mail size={14} color="var(--text-muted)" />
            {ticket.customer.email}
          </div>
        </div>

        {/* Chargebee Details Panel */}
        <div className="glass-panel" style={{ marginTop: '24px', padding: '16px', background: 'var(--surface-200)', border: '1px solid rgba(99, 102, 241, 0.2)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
            <h3 style={{ fontSize: '12px', textTransform: 'uppercase', color: '#6366f1', letterSpacing: '1px', display: 'flex', alignItems: 'center', gap: '6px' }}>
              <CreditCard size={14} /> Chargebee
            </h3>
            {chargebeeLoading && <Loader2 className="animate-spin" size={12} color="#6366f1" style={{ animation: 'spin 1s linear infinite' }} />}
          </div>

          <div style={{ display: 'flex', gap: '8px', marginBottom: '16px' }}>
            <input 
              type="text" 
              className="input-field" 
              style={{ padding: '6px 10px', fontSize: '12px', minHeight: '32px', flex: 1, backgroundColor: 'var(--surface-100)' }}
              value={chargebeeEmail}
              onChange={(e) => setChargebeeEmail(e.target.value)}
              placeholder="Search by email..."
              onKeyDown={(e) => e.key === 'Enter' && loadChargebee(chargebeeEmail)}
            />
            <button 
              className="btn btn-secondary" 
              style={{ padding: '0 10px', height: '32px', minHeight: '32px' }}
              onClick={() => loadChargebee(chargebeeEmail)}
              disabled={chargebeeLoading}
            >
              <Search size={14} />
            </button>
          </div>

          {!chargebeeData && !chargebeeLoading && (
            <div style={{ fontSize: '12px', color: 'var(--text-muted)', textAlign: 'center', padding: '12px 0' }}>
              Ready to search.
            </div>
          )}

          {chargebeeData && !chargebeeData.configured && (
            <div style={{ fontSize: '12px', color: 'var(--warning)', textAlign: 'center', padding: '12px 0' }}>
              Chargebee API is not configured.
            </div>
          )}

          {chargebeeData && chargebeeData.configured && chargebeeData.customers.length === 0 && (
            <div style={{ fontSize: '12px', color: 'var(--text-muted)', textAlign: 'center', padding: '12px 0' }}>
              No accounts found for this email.
            </div>
          )}

          {chargebeeData && chargebeeData.configured && chargebeeData.customers.map((cust: any) => (
            <div key={cust.id} style={{ marginBottom: '16px', paddingBottom: '16px', borderBottom: '1px solid var(--border)' }}>
              <div style={{ fontSize: '13px', fontWeight: 600, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ color: 'var(--text-primary)' }}>{cust.firstName} {cust.lastName}</span>
                <span style={{ fontSize: '10px', color: 'var(--text-muted)', background: 'var(--surface-100)', padding: '2px 6px', borderRadius: '4px' }}>{cust.id}</span>
              </div>
              
              {cust.subscriptions.length === 0 ? (
                <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '8px' }}>No subscriptions found.</div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginTop: '12px' }}>
                  {cust.subscriptions.map((sub: any) => {
                    const primaryPlan = sub.subscription_items?.find((i: any) => i.item_type === 'plan') || sub.subscription_items?.[0] || {};
                    const planName = sub.plan_id || primaryPlan.item_price_id || 'Unknown Plan';
                    const planAmount = sub.plan_amount !== undefined ? sub.plan_amount : (sub.mrr || primaryPlan.amount || 0);

                    const iccid = sub.cf_iccid || sub.cf_SIM_ID_ICCID;
                    const imei = sub.cf_imei || sub.cf_Device_IMEI;
                    const mdn = sub.cf_mdn || sub.cf_MDN;

                    return (
                    <div key={sub.id} style={{ background: 'var(--surface-100)', padding: '10px', borderRadius: '6px', border: '1px solid var(--border)' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px', alignItems: 'flex-start' }}>
                        <span style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text-primary)', lineHeight: 1.3, paddingRight: '8px' }}>
                          {(planName || '').replace(/-/g, ' ')}
                        </span>
                        <span style={{ 
                          fontSize: '9px', 
                          fontWeight: 700, 
                          textTransform: 'uppercase',
                          color: sub.status === 'active' ? '#10b981' : (sub.status === 'cancelled' ? '#ef4444' : '#f59e0b'),
                          background: sub.status === 'active' ? 'rgba(16, 185, 129, 0.1)' : (sub.status === 'cancelled' ? 'rgba(239, 68, 68, 0.1)' : 'rgba(245, 158, 11, 0.1)'),
                          padding: '3px 6px',
                          borderRadius: '4px',
                          whiteSpace: 'nowrap'
                        }}>
                          {sub.status}
                        </span>
                      </div>
                      
                      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '11px', color: 'var(--text-secondary)' }}>
                        <span>Charge: ${(planAmount / 100).toFixed(2)}</span>
                        {sub.total_dues > 0 ? (
                          <span style={{ color: '#ef4444', fontWeight: 600 }}>Dues: ${(sub.total_dues / 100).toFixed(2)}</span>
                        ) : (
                          <span style={{ color: '#10b981' }}>Current</span>
                        )}
                      </div>
                      
                      {(iccid || imei || mdn) && (
                        <div style={{ marginTop: '8px', paddingTop: '8px', borderTop: '1px dashed var(--border)', fontSize: '11px', color: 'var(--text-muted)' }}>
                          {iccid && <div style={{ display: 'flex', justifyContent: 'space-between' }}><span>ICCID:</span> <span>{iccid}</span></div>}
                          {imei && <div style={{ display: 'flex', justifyContent: 'space-between' }}><span>IMEI:</span> <span>{imei}</span></div>}
                          {mdn && <div style={{ display: 'flex', justifyContent: 'space-between' }}><span>MDN:</span> <span>{mdn}</span></div>}
                        </div>
                      )}

                      {/* Actions */}
                      <div style={{ marginTop: '12px', display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                        <button 
                          className="btn btn-secondary" 
                          onClick={() => toggleInvoices(cust.id, sub.id)}
                          style={{ fontSize: '10px', padding: '4px 8px', minHeight: '24px' }}
                        >
                          <FileText size={12} /> {expandedInvoices[sub.id] ? 'Hide Invoices' : 'View Invoices'}
                        </button>
                        <button 
                          className="btn btn-secondary" 
                          onClick={() => generateLink(cust.id, sub.id)}
                          disabled={paymentLinks[sub.id] === 'loading'}
                          style={{ fontSize: '10px', padding: '4px 8px', minHeight: '24px', flex: 1, justifyContent: 'center' }}
                        >
                          <LinkIcon size={12} />
                          {paymentLinks[sub.id] === 'loading' ? 'Generating...' : (sub.total_dues > 0 ? 'Current Payment Link' : 'Early Payment Link')}
                        </button>
                      </div>
                      
                      {/* Payment Link Display */}
                      {paymentLinks[sub.id] && paymentLinks[sub.id] !== 'loading' && (
                          <div style={{ marginTop: '8px', padding: '8px', background: 'var(--surface-200)', borderRadius: '4px', border: '1px dashed #6366f1', fontSize: '10px', wordBreak: 'break-all' }}>
                            <strong>Payment URL: </strong> 
                            <a href={paymentLinks[sub.id] as string} target="_blank" rel="noreferrer" style={{ color: '#6366f1', textDecoration: 'underline' }}>{paymentLinks[sub.id]}</a>
                          </div>
                      )}

                      {/* Invoices List */}
                      {expandedInvoices[sub.id] === 'loading' && (
                          <div style={{ marginTop: '8px', fontSize: '10px', color: 'var(--text-muted)', textAlign: 'center' }}>Loading invoices...</div>
                      )}
                      {Array.isArray(expandedInvoices[sub.id]) && (
                          <div style={{ marginTop: '8px', display: 'flex', flexDirection: 'column', gap: '4px' }}>
                             {expandedInvoices[sub.id].length === 0 ? (
                                <div style={{ fontSize: '10px', color: 'var(--text-muted)', textAlign: 'center', padding: '4px' }}>No invoices found.</div>
                             ) : (
                               expandedInvoices[sub.id].map((inv: any) => (
                                 <div key={inv.id} style={{ display: 'flex', justifyContent: 'space-between', padding: '6px', background: 'var(--surface-200)', borderRadius: '4px', fontSize: '10px' }}>
                                    <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                                       <span style={{ fontWeight: 600, color: 'var(--text-primary)' }}>#{inv.id}</span>
                                       <span style={{ color: 'var(--text-muted)' }}>{new Date(inv.date * 1000).toLocaleDateString()}</span>
                                    </div>
                                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '4px' }}>
                                       <span style={{ fontWeight: 600 }}>${(inv.total / 100).toFixed(2)}</span>
                                       <span style={{ 
                                         textTransform: 'uppercase', 
                                         fontSize: '8px',
                                         fontWeight: 700,
                                         padding: '2px 4px',
                                         borderRadius: '4px',
                                         background: inv.status === 'paid' ? 'rgba(16, 185, 129, 0.1)' : 'rgba(239, 68, 68, 0.1)',
                                         color: inv.status === 'paid' ? '#10b981' : '#ef4444'
                                       }}>
                                         {inv.status}
                                       </span>
                                    </div>
                                 </div>
                               ))
                             )}
                          </div>
                      )}
                    </div>
                  )})}
                </div>
              )}
            </div>
          ))}
        </div>

        {/* ThingSpace Network Panel */}
        <div className="glass-panel" style={{ marginTop: '24px', padding: '16px', background: 'var(--surface-200)', border: '1px solid rgba(239, 68, 68, 0.2)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
            <h3 style={{ fontSize: '12px', textTransform: 'uppercase', color: '#ef4444', letterSpacing: '1px', display: 'flex', alignItems: 'center', gap: '6px' }}>
              <Wifi size={14} /> ThingSpace (Verizon)
            </h3>
            {simRecords.some(r => r.loading) && <Loader2 className="animate-spin" size={12} color="#ef4444" style={{ animation: 'spin 1s linear infinite' }} />}
          </div>

          <div style={{ display: 'flex', gap: '8px', marginBottom: '16px' }}>
            <input 
              type="text" 
              className="input-field" 
              style={{ padding: '6px 10px', fontSize: '12px', minHeight: '32px', flex: 1, backgroundColor: 'var(--surface-100)' }}
              value={thingSpaceManualSearch}
              onChange={(e) => setThingSpaceManualSearch(e.target.value)}
              placeholder="Search by ICCID manually..."
              onKeyDown={(e) => {
                 if (e.key === 'Enter' && thingSpaceManualSearch) {
                    if (!simRecords.find(r => r.iccid === thingSpaceManualSearch)) {
                       setSimRecords(prev => [{ iccid: thingSpaceManualSearch, subStatus: 'manual', dues: 0, loading: false, data: null, actionLoading: null }, ...prev]);
                    }
                    loadSimRecord(thingSpaceManualSearch);
                    setThingSpaceManualSearch('');
                 }
              }}
            />
            <button 
              className="btn btn-secondary" 
              style={{ padding: '0 10px', height: '32px', minHeight: '32px' }}
              onClick={() => {
                 if (thingSpaceManualSearch) {
                    if (!simRecords.find(r => r.iccid === thingSpaceManualSearch)) {
                       setSimRecords(prev => [{ iccid: thingSpaceManualSearch, subStatus: 'manual', dues: 0, loading: false, data: null, actionLoading: null }, ...prev]);
                    }
                    loadSimRecord(thingSpaceManualSearch);
                    setThingSpaceManualSearch('');
                 }
              }}
            >
              <Cpu size={14} />
            </button>
          </div>

          {!thingSpaceInitialized && (
            <div style={{ fontSize: '12px', color: 'var(--text-muted)', textAlign: 'center', padding: '12px 0' }}>
              Waiting for Chargebee Sync...
            </div>
          )}

          {thingSpaceInitialized && simRecords.length === 0 && (
            <div style={{ fontSize: '12px', color: 'var(--text-muted)', textAlign: 'center', padding: '12px 0' }}>
               No SIM IDs detected in Chargebee.
            </div>
          )}

          <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
             {simRecords.map(sim => {
                const canRestore = (sim.subStatus === 'active' || sim.subStatus === 'manual') && sim.dues === 0;
                
                return (
                   <div key={sim.iccid} style={{ border: '1px solid rgba(239, 68, 68, 0.1)', borderRadius: '6px', padding: '12px', backgroundColor: 'var(--surface-100)' }}>
                      <div style={{ fontSize: '11px', color: 'var(--text-secondary)', marginBottom: '8px', display: 'flex', justifyContent: 'space-between' }}>
                         <span><strong>ID:</strong> {sim.iccid}</span>
                         {sim.loading && <Loader2 className="animate-spin" size={10} color="#ef4444" />}
                      </div>

                      {sim.data === 'NOT_FOUND' && (
                         <div style={{ fontSize: '11px', color: 'var(--text-muted)', textAlign: 'center', padding: '8px 0' }}>
                            SIM record not found on Verizon.
                         </div>
                      )}

                      {sim.data && sim.data !== 'NOT_FOUND' && sim.data.carrierInformations && (
                         <div style={{ marginBottom: '8px' }}>
                           <div style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0', borderBottom: '1px solid var(--border)' }}>
                             <span style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>Carrier State</span>
                             <span style={{ 
                               fontSize: '11px', 
                               fontWeight: 700, 
                               textTransform: 'uppercase',
                               color: sim.data.carrierInformations[0]?.state === 'active' ? '#10b981' : (sim.data.carrierInformations[0]?.state === 'suspend' ? '#ef4444' : '#f59e0b') 
                             }}>
                               {sim.data.carrierInformations[0]?.state}
                             </span>
                           </div>
                           
                           <div style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0', borderBottom: '1px solid var(--border)' }}>
                             <span style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>Connection</span>
                             <span style={{ fontSize: '11px', fontWeight: 600, color: sim.data.connected ? '#10b981' : '#f59e0b' }}>
                               {sim.data.connected ? 'ONLINE' : 'OFFLINE'}
                             </span>
                           </div>
                           
                           <div style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0' }}>
                             <span style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>IP Address</span>
                             <span style={{ fontSize: '12px', fontFamily: 'monospace', color: 'var(--text-primary)' }}>
                               {sim.data.ipAddress}
                             </span>
                           </div>
                           
                           {/* Suspend/Restore Actions */}
                           <div style={{ marginTop: '16px', display: 'flex', gap: '8px' }}>
                             <button 
                               className="btn" 
                               onClick={() => handleThingSpaceAction(sim.iccid, 'suspend')}
                               disabled={sim.actionLoading !== null || sim.data.carrierInformations[0]?.state === 'suspend'}
                               style={{ flex: 1, backgroundColor: 'rgba(239, 68, 68, 0.1)', color: '#ef4444', border: '1px solid rgba(239, 68, 68, 0.3)', padding: '6px', fontSize: '11px', minHeight: '32px' }}
                             >
                               <WifiOff size={14} style={{ marginRight: '6px' }} /> 
                               {sim.actionLoading === 'suspend' ? 'Processing...' : 'Suspend SIM'}
                             </button>

                             <div style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
                                <button 
                                  className="btn" 
                                  onClick={() => handleThingSpaceAction(sim.iccid, 'restore')}
                                  disabled={sim.actionLoading !== null || sim.data.carrierInformations[0]?.state === 'active' || !canRestore}
                                  style={{ width: '100%', backgroundColor: 'rgba(16, 185, 129, 0.1)', color: '#10b981', border: '1px solid rgba(16, 185, 129, 0.3)', padding: '6px', fontSize: '11px', minHeight: '32px', opacity: !canRestore ? 0.4 : 1, cursor: !canRestore ? 'not-allowed' : 'pointer' }}
                                  title={!canRestore ? "Subscription must be Active and fully Paid to Restore." : "Restore SIM connectivity."}
                                >
                                  <Power size={14} style={{ marginRight: '6px' }} /> 
                                  {sim.actionLoading === 'restore' ? 'Processing...' : 'Restore SIM'}
                                </button>
                                {!canRestore && sim.data.carrierInformations[0]?.state !== 'active' && (
                                   <span style={{ fontSize: '8px', color: '#ef4444', textAlign: 'center', marginTop: '4px' }}>Sub Not Paid/Active</span>
                                )}
                             </div>
                           </div>
                         </div>
                      )}
                   </div>
                );
             })}
          </div>

        </div>

        {/* Commerce Panel (Shopify + ShipStation) */}
        <div className="glass-panel" style={{ marginTop: '24px', padding: '16px', background: 'var(--surface-200)', border: '1px solid rgba(16, 185, 129, 0.2)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
            <h3 style={{ fontSize: '12px', textTransform: 'uppercase', color: '#10b981', letterSpacing: '1px', display: 'flex', alignItems: 'center', gap: '6px' }}>
              <ShoppingCart size={14} /> Orders & Shipping
            </h3>
            {commerceLoading && <Loader2 className="animate-spin" size={12} color="#10b981" style={{ animation: 'spin 1s linear infinite' }} />}
          </div>

          <div style={{ display: 'flex', gap: '8px', marginBottom: '16px' }}>
            <input 
              type="text" 
              className="input-field" 
              style={{ padding: '6px 10px', fontSize: '12px', minHeight: '32px', flex: 1, backgroundColor: 'var(--surface-100)' }}
              value={commerceEmail}
              onChange={(e) => setCommerceEmail(e.target.value)}
              placeholder="Search overriding email..."
              onKeyDown={(e) => e.key === 'Enter' && loadCommerce(commerceEmail)}
            />
            <button 
              className="btn btn-secondary" 
              style={{ padding: '0 10px', height: '32px', minHeight: '32px' }}
              onClick={() => loadCommerce(commerceEmail)}
              disabled={commerceLoading}
            >
              <Search size={14} />
            </button>
          </div>

          {!commerceLoading && commerceData.length === 0 && (
             <div style={{ fontSize: '12px', color: 'var(--text-muted)', textAlign: 'center', padding: '12px 0' }}>
               No orders found for this email.
             </div>
          )}

          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
             {commerceData.map((order, idx) => {
                const isExpanded = expandedOrders[order.orderId];
                return (
                   <div key={order.orderId || idx} style={{ background: 'var(--surface-100)', borderRadius: '6px', border: '1px solid var(--border)', overflow: 'hidden' }}>
                      <div 
                         onClick={() => toggleOrder(order.orderId)}
                         style={{ padding: '10px 12px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', cursor: 'pointer', backgroundColor: 'var(--surface-200)' }}
                      >
                         <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                            <span style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text-primary)' }}>{order.orderNumber}</span>
                            <span style={{ fontSize: '10px', color: 'var(--text-muted)' }}>{new Date(order.orderDate).toLocaleDateString()}</span>
                         </div>
                         <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '4px' }}>
                            <span style={{ fontSize: '11px', fontWeight: 700, color: '#f8fafc' }}>${order.total.toFixed(2)}</span>
                            <span style={{ 
                               fontSize: '8px', 
                               textTransform: 'uppercase', 
                               fontWeight: 700, 
                               padding: '2px 4px', 
                               borderRadius: '4px',
                               background: order.fulfillmentStatus === 'fulfilled' ? 'rgba(16, 185, 129, 0.1)' : 'rgba(245, 158, 11, 0.1)',
                               color: order.fulfillmentStatus === 'fulfilled' ? '#10b981' : '#f59e0b'
                            }}>
                               {order.fulfillmentStatus || order.status}
                            </span>
                         </div>
                      </div>

                      {isExpanded && (
                         <div style={{ padding: '12px', borderTop: '1px solid var(--border)', backgroundColor: 'var(--surface-100)' }}>
                            {/* Line Items */}
                            <div style={{ marginBottom: '12px' }}>
                               <strong style={{ fontSize: '10px', textTransform: 'uppercase', color: 'var(--text-secondary)', display: 'block', marginBottom: '6px' }}>Items</strong>
                               {order.items.map((item: any, i: number) => (
                                  <div key={i} style={{ display: 'flex', justifyContent: 'space-between', fontSize: '11px', marginBottom: '4px' }}>
                                     <span style={{ color: 'var(--text-primary)', flex: 1, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', marginRight: '8px' }}>{item.quantity}x {item.name}</span>
                                     <span style={{ color: 'var(--text-secondary)' }}>${item.price.toFixed(2)}</span>
                                  </div>
                               ))}
                            </div>

                            {/* Tracking Data */}
                            {order.tracking && order.tracking.length > 0 && (
                               <div style={{ marginBottom: '12px' }}>
                                  <strong style={{ fontSize: '10px', textTransform: 'uppercase', color: 'var(--text-secondary)', display: 'block', marginBottom: '6px' }}>Shipments</strong>
                                  {order.tracking.map((trk: any, i: number) => (
                                     <div key={i} style={{ padding: '6px', backgroundColor: 'var(--surface-200)', borderRadius: '4px', marginBottom: '4px', border: '1px dashed #6366f1' }}>
                                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4px' }}>
                                           <span style={{ fontSize: '10px', fontWeight: 600, color: '#6366f1', textTransform: 'uppercase' }}>{trk.carrier}</span>
                                           <span style={{ fontSize: '9px', color: 'var(--text-muted)' }}>{trk.shipDate ? new Date(trk.shipDate).toLocaleDateString() : ''}</span>
                                        </div>
                                        <div style={{ fontSize: '11px' }}>
                                           {trk.trackingUrl ? (
                                              <a href={trk.trackingUrl} target="_blank" rel="noreferrer" style={{ color: '#818cf8', textDecoration: 'underline' }}>{trk.trackingNumber}</a>
                                           ) : (
                                              <span style={{ color: 'var(--text-primary)' }}>{trk.trackingNumber}</span>
                                           )}
                                        </div>
                                     </div>
                                  ))}
                               </div>
                            )}

                            {/* Advanced Options (Hardware) */}
                            {(order.imei || order.iccid) && (
                               <div style={{ padding: '8px', backgroundColor: 'rgba(239, 68, 68, 0.05)', borderRadius: '4px', border: '1px solid rgba(239, 68, 68, 0.2)' }}>
                                  <strong style={{ fontSize: '10px', textTransform: 'uppercase', color: '#ef4444', display: 'flex', alignItems: 'center', gap: '4px', marginBottom: '6px' }}>
                                     <Cpu size={10} /> Hardware Assigned
                                  </strong>
                                  {order.imei && (
                                     <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '10px', marginBottom: '2px' }}>
                                        <span style={{ color: 'var(--text-secondary)' }}>IMEI:</span>
                                        <span style={{ color: 'var(--text-primary)', fontFamily: 'monospace' }}>{order.imei}</span>
                                     </div>
                                  )}
                                  {order.iccid && (
                                     <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '10px' }}>
                                        <span style={{ color: 'var(--text-secondary)' }}>ICCID:</span>
                                        <span style={{ color: 'var(--text-primary)', fontFamily: 'monospace' }}>{order.iccid}</span>
                                     </div>
                                  )}
                               </div>
                            )}

                         </div>
                      )}
                   </div>
                );
             })}
          </div>

        </div>
      </div>

      {/* Main Conversation Area */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', backgroundColor: 'var(--background)' }}>
        
        {/* Thread History */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '40px' }}>
          {threads.length === 0 ? (
            <div style={{ textAlign: 'center', color: 'var(--text-muted)', marginTop: '40px' }}>No conversation history.</div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '24px', maxWidth: '800px', margin: '0 auto' }}>
              {threads.map((thread) => {
                const isNote = thread.type === 'note';
                const isCustomer = thread.type === 'customer';
                return (
                  <div key={thread.id} style={{
                    alignSelf: isNote ? 'center' : (isCustomer ? 'flex-start' : 'flex-end'),
                    width: isNote ? '100%' : '85%',
                    backgroundColor: isNote ? 'rgba(245, 158, 11, 0.05)' : (isCustomer ? 'var(--surface-100)' : 'var(--primary-light)'),
                    border: isNote ? '1px dashed rgba(245, 158, 11, 0.3)' : `1px solid ${isCustomer ? 'var(--border)' : 'rgba(99, 102, 241, 0.2)'}`,
                    borderRadius: 'var(--radius-lg)',
                    padding: '20px',
                    position: 'relative'
                  }}>
                    {isNote && (
                      <div style={{ position: 'absolute', top: '-10px', left: '20px', background: 'var(--warning)', color: '#000', fontSize: '10px', fontWeight: 700, padding: '2px 8px', borderRadius: '10px', textTransform: 'uppercase' }}>
                        Internal Note
                      </div>
                    )}
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '12px', fontSize: '12px', color: 'var(--text-secondary)' }}>
                      <span style={{ fontWeight: 600, color: isNote ? 'var(--warning)' : 'var(--text-primary)' }}>
                        {thread.createdBy.firstName} {thread.createdBy.lastName}
                      </span>
                      <span>{new Date(thread.createdAt).toLocaleString()}</span>
                    </div>
                    {/* FreeScout returns HTML body, but for safety in MVP we might just dangerouslySetInnerHTML */}
                    <div 
                      style={{ fontSize: '14px', lineHeight: 1.6, color: 'var(--text-primary)' }}
                      dangerouslySetInnerHTML={{ __html: thread.body ?? '' }} 
                    />
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Composer */}
        <div style={{ borderTop: '1px solid var(--border)', padding: '24px', backgroundColor: 'var(--surface-100)' }}>
          <div style={{ maxWidth: '800px', margin: '0 auto' }}>
            
            <div style={{ display: 'flex', gap: '8px', marginBottom: '16px' }}>
              <button 
                className={`btn ${replyType === 'reply' ? 'btn-primary' : 'btn-secondary'}`}
                onClick={() => setReplyType('reply')}
                style={{ padding: '6px 16px', fontSize: '13px' }}
              >
                <Send size={14} /> Public Reply
              </button>
              <button 
                className={`btn ${replyType === 'note' ? 'btn-secondary' : 'btn-secondary'}`}
                onClick={() => setReplyType('note')}
                style={{ 
                  padding: '6px 16px', 
                  fontSize: '13px',
                  backgroundColor: replyType === 'note' ? 'rgba(245, 158, 11, 0.1)' : 'var(--surface-200)',
                  color: replyType === 'note' ? 'var(--warning)' : 'var(--text-primary)',
                  borderColor: replyType === 'note' ? 'rgba(245, 158, 11, 0.3)' : 'var(--border)'
                }}
              >
                <FileText size={14} /> Internal Note
              </button>
            </div>

            {/* AI Assistant Block */}
            <div style={{ marginBottom: '16px', background: 'linear-gradient(135deg, rgba(99, 102, 241, 0.05) 0%, rgba(139, 92, 246, 0.05) 100%)', border: '1px solid rgba(139, 92, 246, 0.2)', borderRadius: '8px', padding: '12px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <button 
                  className="btn"
                  onClick={() => generateAIResponse()}
                  disabled={aiGenerating}
                  style={{ background: 'linear-gradient(90deg, #6366f1, #8b5cf6)', color: 'white', border: 'none', padding: '8px 16px', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '6px' }}
                >
                   {aiGenerating ? <Loader2 size={14} className="animate-spin" /> : <Sparkles size={14} />}
                   {aiGenerating ? 'Analyzing Context...' : 'Generate Smart Reply'}
                </button>
                <button 
                  className="btn btn-secondary" 
                  onClick={() => setShowAiConfig(!showAiConfig)}
                  style={{ fontSize: '11px', padding: '4px 8px', height: 'auto', minHeight: 'auto' }}
                >
                  {showAiConfig ? 'Hide Custom Prompt' : 'Custom Prompt...'}
                </button>
              </div>
              
              {showAiConfig && (
                 <div style={{ display: 'flex', gap: '8px', marginTop: '4px' }}>
                   <input 
                      type="text" 
                      className="input-field" 
                      style={{ fontSize: '12px', padding: '8px', flex: 1, backgroundColor: 'var(--surface-100)', borderColor: 'rgba(139, 92, 246, 0.3)' }}
                      placeholder="E.g., Speak very formally and confirm we'll waive the late fee..."
                      value={aiPrompt}
                      onChange={e => setAiPrompt(e.target.value)}
                      onKeyDown={e => e.key === 'Enter' && generateAIResponse(aiPrompt)}
                      disabled={aiGenerating}
                    />
                    <button 
                      className="btn"
                      onClick={() => generateAIResponse(aiPrompt)}
                      disabled={aiGenerating || !aiPrompt}
                      style={{ background: 'var(--surface-200)', border: '1px solid rgba(139, 92, 246, 0.4)', color: '#8b5cf6' }}
                    >
                      <Send size={14} />
                    </button>
                 </div>
              )}
            </div>

            <textarea 
              className="input-field"
              placeholder={replyType === 'reply' ? "Type your customer reply here..." : "Type an internal note visible only to your team..."}
              style={{ 
                minHeight: '120px', 
                resize: 'vertical', 
                marginBottom: '16px',
                borderColor: replyType === 'note' ? 'rgba(245, 158, 11, 0.3)' : 'var(--border)'
              }}
              value={replyText}
              onChange={(e) => setReplyText(e.target.value)}
            />

            <div style={{ display: 'flex', justifyContent: 'flex-end', alignItems: 'center' }}>
              <div style={{ display: 'flex', gap: '8px' }}>
                <button 
                  className="btn btn-secondary"
                  onClick={() => handleSubmit('active')}
                  disabled={submitting || !replyText.trim()}
                >
                  {submitting ? 'Sending...' : (replyType === 'reply' ? 'Send & Keep Open' : 'Add Note & Keep Open')}
                </button>
                <button 
                  className="btn btn-secondary"
                  onClick={() => handleSubmit('pending')}
                  disabled={submitting}
                  style={{ backgroundColor: 'rgba(245, 158, 11, 0.1)', color: 'var(--warning)', borderColor: 'rgba(245, 158, 11, 0.3)' }}
                >
                  {submitting ? 'Processing...' : (replyText.trim() ? (replyType === 'reply' ? 'Send & Set Pending' : 'Add Note & Set Pending') : 'Set as Pending')}
                </button>
                <button 
                  className="btn btn-primary"
                  onClick={() => handleSubmit('closed')}
                  disabled={submitting}
                  style={{ gap: '8px' }}
                >
                  <CheckCircle size={16} />
                  {submitting ? 'Processing...' : (replyText.trim() ? (replyType === 'reply' ? 'Send & Close Ticket' : 'Add Note & Close Ticket') : 'Just Close Ticket')}
                </button>
              </div>
            </div>
          </div>
        </div>

      </div>

      {/* Floating Agent Chat Button */}
      <button 
        onClick={() => setAgentChatOpen(!agentChatOpen)}
        style={{
          position: 'fixed',
          bottom: '24px',
          right: '24px',
          width: '56px',
          height: '56px',
          borderRadius: '28px',
          background: agentChatOpen ? '#ef4444' : 'linear-gradient(135deg, #6366f1, #8b5cf6)',
          border: 'none',
          color: 'white',
          boxShadow: '0 8px 16px rgba(0,0,0,0.3)',
          display: 'flex',
          justifyContent: 'center',
          alignItems: 'center',
          cursor: 'pointer',
          zIndex: 10000,
          transition: 'transform 0.2s, background 0.2s',
          transform: agentChatOpen ? 'scale(0.9)' : 'scale(1)'
        }}
      >
        <Sparkles size={24} />
      </button>

      {/* Floating Agent Chat Window */}
      {agentChatOpen && (
         <div style={{
           position: 'fixed',
           bottom: '100px',
           right: '24px',
           width: '400px',
           height: '650px',
           backgroundColor: '#ffffff',
           border: '1px solid rgba(139, 92, 246, 0.3)',
           borderRadius: '16px',
           boxShadow: '0 12px 32px rgba(0,0,0,0.5)',
           zIndex: 9999,
           overflow: 'hidden'
         }}>
           <iframe 
              src="https://app.relevanceai.com/agents/bcbe5a/bc676bf8-a395-48ec-a0c8-f631aca2c5a9/b1d0d8ab-74b8-403d-b848-a117b7399fa9/embed-chat?hide_tool_steps=false&hide_file_uploads=false&hide_conversation_list=false&primary_color=%23685FFF&bubble_icon=pd%2Fchat&input_placeholder_text=Type+your+message...&hide_logo=false&hide_description=false" 
              style={{ width: '100%', height: '100%', border: 'none', backgroundColor: '#ffffff' }}
              allow="microphone"
           />
         </div>
      )}
    </div>
  );
}
