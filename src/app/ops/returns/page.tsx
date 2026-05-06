"use client";

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Search, Loader2, ArrowLeft, Package, AlertCircle, Calendar } from 'lucide-react';
import { useTheme } from '@/components/ThemeProvider';
import { motion, AnimatePresence } from 'framer-motion';

export default function ReturnsDashboard() {
  const router = useRouter();
  const { theme } = useTheme();
  
  const [imei, setImei] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [results, setResults] = useState<any[] | null>(null);

  const handleSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!imei.trim()) return;

    setLoading(true);
    setError('');
    setResults(null);

    try {
      const res = await fetch(`/api/ops/returns?imei=${encodeURIComponent(imei.trim())}`);
      const data = await res.json();

      if (!res.ok) {
        setError(data.error || 'Failed to fetch return details.');
      } else {
        if (data.data && data.data.length > 0) {
          setResults(data.data);
        } else {
          setError('No return details found for this IMEI.');
        }
      }
    } catch (err) {
      setError('An unexpected error occurred.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column', backgroundColor: '#0a0a0a', color: 'var(--ops-text)', fontFamily: 'system-ui, sans-serif' }}>
      {/* Header */}
      <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '16px 40px', borderBottom: '1px solid var(--border)', backgroundColor: 'var(--ops-header-bg)', backdropFilter: 'blur(10px)', zIndex: 100 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start', lineHeight: 1 }}>
             <div style={{ fontSize: '22px', fontWeight: 800, letterSpacing: '-1px', color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: '4px' }}>
                n<span style={{ position: 'relative', display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}><span style={{ color: '#00b27a' }}>ō</span></span>mad
             </div>
             <div style={{ fontSize: '9px', fontWeight: 500, letterSpacing: '4px', color: '#00b27a', marginLeft: '2px', marginTop: '2px' }}>
                I N T E R N E T
             </div>
          </div>
          <div style={{ height: '20px', width: '1px', background: 'rgba(255,255,255,0.1)', margin: '0 12px' }} />
          <div>
            <h1 style={{ fontSize: '14px', margin: 0, fontWeight: 600, color: 'var(--text-secondary)' }}>NOC <span style={{ color: '#3b82f6' }}>Returns Portal</span></h1>
          </div>
        </div>
        
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <button 
            onClick={() => router.push('/ops/dashboard')}
            style={{ background: 'transparent', border: '1px solid var(--border)', color: 'var(--text-secondary)', padding: '8px 16px', borderRadius: '8px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '8px', fontSize: '14px' }}
          >
            <ArrowLeft size={16} /> Back to Dashboard
          </button>
        </div>
      </header>

      <main style={{ flex: 1, padding: '40px', display: 'flex', flexDirection: 'column', alignItems: 'center', maxWidth: '800px', margin: '0 auto', width: '100%' }}>
        <div style={{ padding: '16px', background: 'rgba(59, 130, 246, 0.1)', borderRadius: '24px', marginBottom: '24px', border: '1px solid rgba(59, 130, 246, 0.2)' }}>
           <Package color="#3b82f6" size={32} />
        </div>
        <h2 style={{ fontSize: '40px', fontWeight: 800, marginBottom: '16px', textAlign: 'center', letterSpacing: '-1px' }}>Check Return Details</h2>
        <p style={{ color: 'var(--ops-text-muted)', fontSize: '16px', textAlign: 'center', marginBottom: '40px', lineHeight: 1.5 }}>
          Enter a device IMEI to instantly pull return history from the logistics database.
        </p>

        <form suppressHydrationWarning onSubmit={handleSearch} style={{ width: '100%', position: 'relative', marginBottom: '40px' }}>
          <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
            <Search size={24} color="#9ca3af" style={{ position: 'absolute', left: '24px' }} />
            <input 
              type="text" 
              placeholder="Enter 15-digit IMEI..." 
              value={imei}
              onChange={(e) => setImei(e.target.value)}
              required
              style={{ 
                width: '100%', 
                padding: '24px 24px 24px 64px', 
                backgroundColor: 'rgba(20,20,20,0.8)', 
                border: '1px solid rgba(255,255,255,0.1)', 
                borderRadius: '24px', 
                color: 'var(--ops-text)', 
                fontSize: '20px', 
                outline: 'none', 
                boxShadow: '0 24px 48px rgba(0,0,0,0.5)',
                transition: 'border-color 0.3s, box-shadow 0.3s' 
              }}
              onFocus={(e) => { e.target.style.borderColor = '#3b82f6'; e.target.style.boxShadow = '0 0 0 4px rgba(59, 130, 246, 0.2)'; }}
              onBlur={(e) => { e.target.style.borderColor = 'transparent'; e.target.style.boxShadow = 'none'; }}
            />
            
            <motion.button
              suppressHydrationWarning
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
              disabled={loading || !imei}
              type="submit"
              style={{ 
                position: 'absolute',
                right: '12px',
                background: 'linear-gradient(90deg, #3b82f6 0%, #2563eb 100%)', 
                border: 'none', 
                color: 'white', 
                padding: '14px 28px', 
                borderRadius: '16px', 
                fontSize: '16px', 
                fontWeight: 600, 
                cursor: loading || !imei ? 'not-allowed' : 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                opacity: loading || !imei ? 0.7 : 1
              }}
            >
              {loading ? <Loader2 size={20} className="animate-spin" /> : 'Query LRLOS'}
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

        {/* Results Container */}
        {results && (
          <div style={{ width: '100%', display: 'flex', flexDirection: 'column', gap: '24px' }}>
            
            {/* Warning Message */}
            <div style={{ background: 'rgba(234, 179, 8, 0.1)', border: '1px solid rgba(234, 179, 8, 0.2)', padding: '16px', borderRadius: '12px', display: 'flex', gap: '12px', alignItems: 'flex-start' }}>
              <AlertCircle color="#eab308" size={20} style={{ flexShrink: 0, marginTop: '2px' }} />
              <div>
                <strong style={{ color: '#eab308', display: 'block', marginBottom: '4px' }}>Verification Required</strong>
                <p style={{ color: 'var(--ops-text-muted)', fontSize: '14px', lineHeight: 1.5, margin: 0 }}>
                  The <strong>Created At</strong> date below indicates when the device was officially logged as returned. 
                  To verify this return belongs to the customer you are assisting, make sure that the customer's original <strong>Ship Date</strong> is <em>less than</em> (before) this return date.
                </p>
              </div>
            </div>

            {results.map((r, i) => (
              <div key={r.id || i} style={{ background: 'var(--surface-100)', border: '1px solid var(--border)', borderRadius: '16px', padding: '24px', position: 'relative', overflow: 'hidden' }}>
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
                    background: r.status === 'started' ? 'rgba(59,130,246,0.1)' : 'rgba(255,255,255,0.05)',
                    color: r.status === 'started' ? '#3b82f6' : 'var(--ops-text-muted)',
                    fontSize: '12px',
                    fontWeight: 600,
                    textTransform: 'uppercase'
                  }}>
                    {r.status || 'Unknown Status'}
                  </div>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', marginBottom: '24px' }}>
                  <div style={{ background: 'var(--surface-200)', padding: '12px', borderRadius: '8px' }}>
                    <div style={{ fontSize: '12px', color: 'var(--ops-text-muted)', marginBottom: '4px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                      <Calendar size={14} /> Created At (Return Date)
                    </div>
                    <div style={{ fontSize: '15px', fontWeight: 500, color: '#eab308' }}>{r.created_at || 'N/A'}</div>
                  </div>
                  <div style={{ background: 'var(--surface-200)', padding: '12px', borderRadius: '8px' }}>
                    <div style={{ fontSize: '12px', color: 'var(--ops-text-muted)', marginBottom: '4px' }}>Shopify Order Number</div>
                    <div style={{ fontSize: '15px', fontWeight: 500 }}>{r.shopify_order_number || 'N/A'}</div>
                  </div>
                  <div style={{ background: 'var(--surface-200)', padding: '12px', borderRadius: '8px' }}>
                    <div style={{ fontSize: '12px', color: 'var(--ops-text-muted)', marginBottom: '4px' }}>Condition</div>
                    <div style={{ fontSize: '15px', fontWeight: 500 }}>{r.modem_condition || 'N/A'}</div>
                  </div>
                  <div style={{ background: 'var(--surface-200)', padding: '12px', borderRadius: '8px' }}>
                    <div style={{ fontSize: '12px', color: 'var(--ops-text-muted)', marginBottom: '4px' }}>Return Tracking</div>
                    <div style={{ fontSize: '15px', fontWeight: 500, fontFamily: 'monospace' }}>{r.return_tracking || 'N/A'}</div>
                  </div>
                </div>

                {r.notes && (
                  <div style={{ background: 'var(--surface-200)', padding: '16px', borderRadius: '8px', borderLeft: '4px solid #3b82f6' }}>
                    <div style={{ fontSize: '12px', color: 'var(--ops-text-muted)', marginBottom: '4px' }}>Notes</div>
                    <div style={{ fontSize: '14px', lineHeight: 1.5 }}>{r.notes}</div>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}
