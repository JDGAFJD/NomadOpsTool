"use client";

import { useState } from 'react';
import { motion } from 'framer-motion';
import { useRouter } from 'next/navigation';
import { Lock, Mail, Loader2, ArrowRight, User, CheckCircle } from 'lucide-react';

export default function OpsLogin() {
  const router = useRouter();
  const [mode, setMode] = useState<'login' | 'request'>('login');
  
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [rememberMe, setRememberMe] = useState(false);
  
  const [reqName, setReqName] = useState('');
  const [reqEmail, setReqEmail] = useState('');
  const [reqSuccess, setReqSuccess] = useState(false);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (mode === 'request') {
      return handleRequest(e);
    }

    setError('');
    setLoading(true);

    try {
      const res = await fetch('/api/ops/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password, rememberMe })
      });

      const data = await res.json();
      
      if (res.ok && data.success) {
        router.push('/ops/dashboard');
      } else {
        setError(data.error || 'Authenication failed');
      }
    } catch (err) {
      setError('Network error connecting to OPS cluster.');
    } finally {
      setLoading(false);
    }
  };

  const handleRequest = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    setReqSuccess(false);

    try {
      const res = await fetch('/api/ops/request-access', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: reqEmail, name: reqName })
      });
      const data = await res.json();
      if (res.ok && data.success) {
        setReqSuccess(true);
        setReqEmail('');
        setReqName('');
      } else {
        setError(data.error || 'Failed to submit request');
      }
    } catch (err) {
      setError('Network error connecting to OPS cluster.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="ops-login-screen" suppressHydrationWarning>
      <section className="ops-login-panel">
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 72 }}>
            <div className="brand-mark" suppressHydrationWarning>N</div>
            <div>
              <div style={{ fontSize: 22, fontWeight: 800 }}>Nomad</div>
              <div style={{ color: '#99f6e4', fontSize: 10, fontWeight: 800, letterSpacing: '0.26em' }}>OPS CENTER</div>
            </div>
          </div>

          <div className="ops-login-story">
            <div className="ops-login-kicker"><CheckCircle size={15} /> Network Operations</div>
            <h1 className="ops-login-title">Support command, redesigned.</h1>
            <p className="ops-login-copy">
              A cleaner control surface for customer lookups, billing signals, device state, escalations, and agent access. Built for fast scanning and confident handoffs.
            </p>
            <div className="ops-login-metrics">
              <div className="ops-login-metric">
                <div style={{ fontSize: 24, fontWeight: 800 }}>360°</div>
                <div style={{ color: 'rgba(226,232,240,0.68)', fontSize: 12, marginTop: 4 }}>Customer context</div>
              </div>
              <div className="ops-login-metric">
                <div style={{ fontSize: 24, fontWeight: 800 }}>Live</div>
                <div style={{ color: 'rgba(226,232,240,0.68)', fontSize: 12, marginTop: 4 }}>Network actions</div>
              </div>
              <div className="ops-login-metric">
                <div style={{ fontSize: 24, fontWeight: 800 }}>Audit</div>
                <div style={{ color: 'rgba(226,232,240,0.68)', fontSize: 12, marginTop: 4 }}>Admin visibility</div>
              </div>
            </div>
          </div>
        </div>

        <div style={{ color: 'rgba(226,232,240,0.46)', fontSize: 12, letterSpacing: '0.08em', textTransform: 'uppercase' }}>
          Nomad Internet internal systems
        </div>
      </section>

      <section className="ops-login-form-wrap">
      <motion.form 
        className="ops-login-card"
        suppressHydrationWarning
        onSubmit={handleLogin}
        initial={{ opacity: 0, y: 30 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6, ease: 'easeOut' }}
        style={{ 
          display: 'flex',
          flexDirection: 'column',
          gap: '24px'
        }}
      >
        <div style={{ textAlign: 'center', marginBottom: '8px' }}>
          <div style={{ display: 'flex', justifyContent: 'center', marginBottom: '16px' }}>
            <div style={{ padding: '12px', background: 'rgba(15,118,110,0.1)', borderRadius: '12px', border: '1px solid rgba(15,118,110,0.18)' }}>
               {mode === 'login' ? <Lock color="var(--primary)" size={28} /> : <User color="var(--primary)" size={28} />}
            </div>
          </div>
          <h2 style={{ fontSize: '28px', fontWeight: 700, margin: '0 0 8px 0' }}>
            {mode === 'login' ? 'Welcome back' : 'Request Access'}
          </h2>
          <p style={{ margin: 0, fontSize: '14px' }}>
            {mode === 'login' ? 'Sign in to continue to the operations workspace.' : 'Access requests are routed for approval.'}
          </p>
        </div>

        {error && (
          <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} style={{ padding: '12px', backgroundColor: 'rgba(239, 68, 68, 0.1)', border: '1px solid rgba(239, 68, 68, 0.3)', borderRadius: '8px', color: '#ef4444', fontSize: '13px', textAlign: 'center' }}>
            {error}
          </motion.div>
        )}

        {reqSuccess && mode === 'request' ? (
          <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} style={{ padding: '24px 16px', backgroundColor: 'rgba(16, 185, 129, 0.1)', border: '1px solid rgba(16, 185, 129, 0.3)', borderRadius: '12px', color: '#10b981', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '16px', textAlign: 'center' }}>
            <CheckCircle size={40} />
            <div>
              <strong style={{ display: 'block', fontSize: '18px', marginBottom: '6px', color: '#0f172a' }}>Request Sent</strong>
              <span style={{ fontSize: '14px', color: '#a7f3d0' }}>Bryan Fury has been notified via Slack.</span>
            </div>
            <button 
              type="button" 
              onClick={() => { setMode('login'); setReqSuccess(false); }}
              style={{ marginTop: '8px', background: 'transparent', border: '1px solid #10b981', color: '#10b981', padding: '10px 20px', borderRadius: '8px', cursor: 'pointer', fontSize: '14px', fontWeight: 500 }}
            >
              Return to Login
            </button>
          </motion.div>
        ) : (
          <>
            {mode === 'login' ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                <div style={{ position: 'relative' }}>
                  <Mail size={18} color="#64748b" style={{ position: 'absolute', top: '50%', transform: 'translateY(-50%)', left: '16px' }} />
                  <input 
                    type="email" 
                    placeholder="Operator email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    required
                    style={{ width: '100%', padding: '14px 16px 14px 48px', backgroundColor: 'rgba(0,0,0,0.3)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '12px', color: 'white', fontSize: '15px', outline: 'none', transition: 'border-color 0.2s' }}
                    onFocus={(e) => e.target.style.borderColor = 'var(--primary)'}
                    onBlur={(e) => e.target.style.borderColor = '#dbe5ef'}
                  />
                </div>

                <div style={{ position: 'relative' }}>
                  <Lock size={18} color="#64748b" style={{ position: 'absolute', top: '50%', transform: 'translateY(-50%)', left: '16px' }} />
                  <input 
                    type="password" 
                    placeholder="Password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    required
                    style={{ width: '100%', padding: '14px 16px 14px 48px', backgroundColor: 'rgba(0,0,0,0.3)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '12px', color: 'white', fontSize: '15px', outline: 'none', transition: 'border-color 0.2s' }}
                    onFocus={(e) => e.target.style.borderColor = 'var(--primary)'}
                    onBlur={(e) => e.target.style.borderColor = '#dbe5ef'}
                  />
                </div>
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                <div style={{ position: 'relative' }}>
                  <User size={18} color="#64748b" style={{ position: 'absolute', top: '50%', transform: 'translateY(-50%)', left: '16px' }} />
                  <input 
                    type="text" 
                    placeholder="Full Name" 
                    value={reqName}
                    onChange={(e) => setReqName(e.target.value)}
                    required
                    style={{ width: '100%', padding: '14px 16px 14px 48px', backgroundColor: 'rgba(0,0,0,0.3)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '12px', color: 'white', fontSize: '15px', outline: 'none', transition: 'border-color 0.2s' }}
                    onFocus={(e) => e.target.style.borderColor = 'var(--primary)'}
                    onBlur={(e) => e.target.style.borderColor = '#dbe5ef'}
                  />
                </div>

                <div style={{ position: 'relative' }}>
                  <Mail size={18} color="#64748b" style={{ position: 'absolute', top: '50%', transform: 'translateY(-50%)', left: '16px' }} />
                  <input 
                    type="email" 
                    placeholder="Work Email" 
                    value={reqEmail}
                    onChange={(e) => setReqEmail(e.target.value)}
                    required
                    style={{ width: '100%', padding: '14px 16px 14px 48px', backgroundColor: 'rgba(0,0,0,0.3)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '12px', color: 'white', fontSize: '15px', outline: 'none', transition: 'border-color 0.2s' }}
                    onFocus={(e) => e.target.style.borderColor = 'var(--primary)'}
                    onBlur={(e) => e.target.style.borderColor = '#dbe5ef'}
                  />
                </div>
              </div>
            )}

            {mode === 'login' && (
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: '4px' }}>
                 <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', color: '#9ca3af', fontSize: '13px' }}>
                    <input type="checkbox" checked={rememberMe} onChange={(e) => setRememberMe(e.target.checked)} style={{ accentColor: 'var(--primary)', width: '16px', height: '16px' }} />
                    Remember me (30 Days)
                 </label>
                 <button type="button" onClick={() => { setMode('request'); setError(''); }} style={{ background: 'transparent', border: 'none', color: 'var(--primary)', fontSize: '13px', textDecoration: 'none', cursor: 'pointer', padding: 0, fontWeight: 700 }}>Request Access</button>
              </div>
            )}

            <motion.button
              className="ops-login-submit"
              suppressHydrationWarning
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
              disabled={loading}
              type="submit"
              style={{ 
                marginTop: '8px',
                background: loading ? 'rgba(15,23,42,0.08)' : undefined,
                border: 'none', 
                color: loading ? '#64748b' : 'white',
                padding: '16px', 
                borderRadius: '12px', 
                fontSize: '15px', 
                fontWeight: 600, 
                cursor: loading ? 'not-allowed' : 'pointer',
                display: 'flex',
                justifyContent: 'center',
                alignItems: 'center',
                gap: '8px',
                boxShadow: loading ? 'none' : '0 8px 16px rgba(0, 178, 122, 0.3)'
              }}
            >
              {loading ? <Loader2 size={18} className="animate-spin" /> : (mode === 'login' ? 'Authenticate' : 'Submit Request')}
              {!loading && <ArrowRight size={18} />}
            </motion.button>

            {mode === 'request' && (
               <div style={{ textAlign: 'center', marginTop: '4px' }}>
                 <button type="button" onClick={() => { setMode('login'); setError(''); }} style={{ background: 'transparent', border: 'none', color: '#64748b', fontSize: '13px', cursor: 'pointer', padding: 0 }}>
                   Back to Login
                 </button>
               </div>
            )}
          </>
        )}
      </motion.form>

      </section>
    </div>
  );
}
