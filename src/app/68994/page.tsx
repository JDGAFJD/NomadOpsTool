"use client";

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Inbox, Ticket, Settings, ArrowRight, Loader2 } from 'lucide-react';
import Link from 'next/link';

interface Mailbox {
  id: number;
  name: string;
}

export default function Dashboard() {
  const router = useRouter();
  const [mailboxes, setMailboxes] = useState<Mailbox[]>([]);
  const [selectedMailbox, setSelectedMailbox] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [fetchingTicket, setFetchingTicket] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function loadMailboxes() {
      try {
        setLoading(true);
        const res = await fetch('/api/mailboxes');
        const data = await res.json();
        if (data.mailboxes && data.mailboxes.length > 0) {
          setMailboxes(data.mailboxes);
          const savedSelection = localStorage.getItem('nomad_selected_mailbox');
          if (savedSelection && data.mailboxes.find((m: Mailbox) => m.id === parseInt(savedSelection))) {
            setSelectedMailbox(parseInt(savedSelection));
          } else {
            setSelectedMailbox(data.mailboxes[0].id);
          }
        } else if (data.error && data.error.includes("not configured")) {
          setError('FreeScout API is not configured.');
        } else if (data.mailboxes?.length === 0) {
          setError('No mailboxes found or integration failed.');
        } else if (data.error) {
          setError(data.error);
        }
      } catch (err) {
        console.error(err);
        setError('Failed to load mailboxes.');
      } finally {
        setLoading(false);
      }
    }
    loadMailboxes();
  }, []);

  const handleMailboxChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const val = parseInt(e.target.value);
    setSelectedMailbox(val);
    localStorage.setItem('nomad_selected_mailbox', val.toString());
  };

  const handleNextTicket = async () => {
    if (!selectedMailbox) return;
    
    setFetchingTicket(true);
    try {
      const res = await fetch(`/api/tickets/next?mailboxId=${selectedMailbox}`);
      const data = await res.json();
      
      if (data.ticket) {
        router.push(`/ticket/${data.ticket.id}`);
      } else {
        alert("Awesome! Inbox Zero. No open tickets in this mailbox.");
        setFetchingTicket(false);
      }
    } catch (err) {
      console.error(err);
      alert("Failed to fetch next ticket");
      setFetchingTicket(false);
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

  return (
    <div className="animate-fade-in" style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
      <header className="page-header">
        <h1 className="page-title">Workspace</h1>
        <p className="page-subtitle">Your distraction-free single ticket queue.</p>
      </header>

      <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '40px' }}>
        <div className="glass-panel" style={{ width: '100%', maxWidth: '500px', padding: '48px', textAlign: 'center' }}>
          
          <div style={{
            width: '64px',
            height: '64px',
            borderRadius: '50%',
            background: 'var(--primary-light)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            margin: '0 auto 24px auto',
            border: '1px solid var(--primary)'
          }}>
            <Ticket size={28} color="var(--primary)" />
          </div>

          <h2 style={{ fontSize: '24px', marginBottom: '12px' }}>Ready for the next ticket?</h2>
          <p style={{ color: 'var(--text-secondary)', marginBottom: '32px' }}>
            Focus on one customer at a time to maximize quality and efficiency.
          </p>

          {error ? (
            <div style={{ 
              background: 'rgba(239, 68, 68, 0.1)', 
              border: '1px solid var(--danger)', 
              borderRadius: '8px', 
              padding: '16px',
              textAlign: 'left'
            }}>
              <p style={{ color: 'var(--danger)', fontSize: '14px', marginBottom: '12px' }}>{error}</p>
              <Link href="/admin" className="btn btn-secondary" style={{ width: '100%' }}>
                <Settings size={16} /> Go to Settings
              </Link>
            </div>
          ) : (
            <>
              <div style={{ textAlign: 'left', marginBottom: '32px' }}>
                <label style={{ display: 'block', marginBottom: '8px', fontSize: '14px', color: 'var(--text-secondary)' }}>
                  Selected Mailbox
                </label>
                <div style={{ position: 'relative' }}>
                  <Inbox size={18} color="var(--text-muted)" style={{ position: 'absolute', left: '16px', top: '50%', transform: 'translateY(-50%)' }} />
                  <select 
                    className="input-field"
                    style={{ paddingLeft: '44px', appearance: 'none', cursor: 'pointer' }}
                    value={selectedMailbox || ''}
                    onChange={handleMailboxChange}
                  >
                    {mailboxes.map(mb => (
                      <option key={mb.id} value={mb.id}>{mb.name}</option>
                    ))}
                  </select>
                </div>
              </div>

              <button 
                className="btn btn-primary" 
                style={{ width: '100%', padding: '16px', fontSize: '16px', borderRadius: 'var(--radius-lg)' }}
                onClick={handleNextTicket}
                disabled={fetchingTicket || !selectedMailbox}
              >
                {fetchingTicket ? (
                  <>
                    <Loader2 className="animate-spin" size={20} style={{ animation: 'spin 1s linear infinite' }} />
                    Loading Ticket...
                  </>
                ) : (
                  <>
                    Load Next Open Ticket
                    <ArrowRight size={20} />
                  </>
                )}
              </button>
            </>
          )}

        </div>
      </div>
    </div>
  );
}
