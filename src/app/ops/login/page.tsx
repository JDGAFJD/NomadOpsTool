"use client";

import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
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
    <div style={{ 
      minHeight: '100vh', 
      backgroundColor: '#050505', 
      backgroundImage: 'radial-gradient(circle at 100% 100%, rgba(0, 178, 122, 0.15) 0%, transparent 50%)',
      display: 'flex', 
      alignItems: 'center', 
      justifyContent: 'center',
      position: 'relative'
    }}>
      <motion.div 
        animate={{ scale: [1, 1.1, 1], opacity: [0.2, 0.4, 0.2] }} 
        transition={{ repeat: Infinity, duration: 10, ease: "easeInOut" }}
        style={{ position: 'absolute', top: '10%', left: '10%', width: '500px', height: '500px', background: 'radial-gradient(circle, rgba(0, 178, 122, 0.1) 0%, transparent 60%)', filter: 'blur(60px)' }}
      />

      <motion.form 
        onSubmit={handleLogin}
        initial={{ opacity: 0, y: 30 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6, ease: 'easeOut' }}
        style={{ 
          zIndex: 10, 
          width: '100%', 
          maxWidth: '420px', 
          padding: '48px', 
          backgroundColor: 'rgba(20, 20, 20, 0.6)', 
          border: '1px solid rgba(255, 255, 255, 0.08)', 
          borderRadius: '24px', 
          backdropFilter: 'blur(24px)',
          boxShadow: '0 24px 64px rgba(0,0,0,0.4)',
          display: 'flex',
          flexDirection: 'column',
          gap: '24px'
        }}
      >
        <div style={{ textAlign: 'center', marginBottom: '8px' }}>
          <div style={{ display: 'flex', justifyContent: 'center', marginBottom: '16px' }}>
            <div style={{ padding: '12px', background: 'linear-gradient(135deg, rgba(0,178,122,0.2), rgba(0,162,106,0.2))', borderRadius: '16px', border: '1px solid rgba(0,178,122,0.3)' }}>
               {mode === 'login' ? <Lock color="#00b27a" size={28} /> : <User color="#00b27a" size={28} />}
            </div>
          </div>
          <h2 style={{ fontSize: '28px', color: 'white', fontWeight: 700, margin: '0 0 8px 0' }}>
            {mode === 'login' ? 'Security Gateway' : 'Request Access'}
          </h2>
          <p style={{ color: '#9ca3af', margin: 0, fontSize: '14px' }}>
            {mode === 'login' ? 'Nomad Network Operations Center' : 'Access requests are routed to Bryan Fury'}
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
              <strong style={{ display: 'block', fontSize: '18px', marginBottom: '6px', color: 'white' }}>Request Sent</strong>
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
                  <Mail size={18} color="#9ca3af" style={{ position: 'absolute', top: '50%', transform: 'translateY(-50%)', left: '16px' }} />
                  <input 
                    type="email" 
                    placeholder="Operator Email" 
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    required
                    style={{ width: '100%', padding: '14px 16px 14px 48px', backgroundColor: 'rgba(0,0,0,0.3)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '12px', color: 'white', fontSize: '15px', outline: 'none', transition: 'border-color 0.2s' }}
                    onFocus={(e) => e.target.style.borderColor = '#00b27a'}
                    onBlur={(e) => e.target.style.borderColor = 'rgba(255,255,255,0.1)'}
                  />
                </div>

                <div style={{ position: 'relative' }}>
                  <Lock size={18} color="#9ca3af" style={{ position: 'absolute', top: '50%', transform: 'translateY(-50%)', left: '16px' }} />
                  <input 
                    type="password" 
                    placeholder="Passcode" 
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    required
                    style={{ width: '100%', padding: '14px 16px 14px 48px', backgroundColor: 'rgba(0,0,0,0.3)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '12px', color: 'white', fontSize: '15px', outline: 'none', transition: 'border-color 0.2s' }}
                    onFocus={(e) => e.target.style.borderColor = '#00b27a'}
                    onBlur={(e) => e.target.style.borderColor = 'rgba(255,255,255,0.1)'}
                  />
                </div>
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                <div style={{ position: 'relative' }}>
                  <User size={18} color="#9ca3af" style={{ position: 'absolute', top: '50%', transform: 'translateY(-50%)', left: '16px' }} />
                  <input 
                    type="text" 
                    placeholder="Full Name" 
                    value={reqName}
                    onChange={(e) => setReqName(e.target.value)}
                    required
                    style={{ width: '100%', padding: '14px 16px 14px 48px', backgroundColor: 'rgba(0,0,0,0.3)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '12px', color: 'white', fontSize: '15px', outline: 'none', transition: 'border-color 0.2s' }}
                    onFocus={(e) => e.target.style.borderColor = '#00b27a'}
                    onBlur={(e) => e.target.style.borderColor = 'rgba(255,255,255,0.1)'}
                  />
                </div>

                <div style={{ position: 'relative' }}>
                  <Mail size={18} color="#9ca3af" style={{ position: 'absolute', top: '50%', transform: 'translateY(-50%)', left: '16px' }} />
                  <input 
                    type="email" 
                    placeholder="Work Email" 
                    value={reqEmail}
                    onChange={(e) => setReqEmail(e.target.value)}
                    required
                    style={{ width: '100%', padding: '14px 16px 14px 48px', backgroundColor: 'rgba(0,0,0,0.3)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '12px', color: 'white', fontSize: '15px', outline: 'none', transition: 'border-color 0.2s' }}
                    onFocus={(e) => e.target.style.borderColor = '#00b27a'}
                    onBlur={(e) => e.target.style.borderColor = 'rgba(255,255,255,0.1)'}
                  />
                </div>
              </div>
            )}

            {mode === 'login' && (
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: '4px' }}>
                 <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', color: '#9ca3af', fontSize: '13px' }}>
                    <input type="checkbox" checked={rememberMe} onChange={(e) => setRememberMe(e.target.checked)} style={{ accentColor: '#00b27a', width: '16px', height: '16px' }} />
                    Remember me (30 Days)
                 </label>
                 <button type="button" onClick={() => { setMode('request'); setError(''); }} style={{ background: 'transparent', border: 'none', color: '#00b27a', fontSize: '13px', textDecoration: 'none', cursor: 'pointer', padding: 0 }}>Request Access</button>
              </div>
            )}

            <motion.button
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
              disabled={loading}
              type="submit"
              style={{ 
                marginTop: '8px',
                background: loading ? 'rgba(255,255,255,0.1)' : 'linear-gradient(90deg, #00b27a 0%, #00a26a 100%)', 
                border: 'none', 
                color: loading ? '#9ca3af' : 'white', 
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
                 <button type="button" onClick={() => { setMode('login'); setError(''); }} style={{ background: 'transparent', border: 'none', color: '#9ca3af', fontSize: '13px', cursor: 'pointer', padding: 0 }}>
                   ← Back to Login
                 </button>
               </div>
            )}
          </>
        )}
      </motion.form>

      {/* Credit */}
      <div style={{ position: 'absolute', bottom: '24px', left: '50%', transform: 'translateX(-50%)', color: 'rgba(255,255,255,0.25)', fontSize: '12px', letterSpacing: '1px', whiteSpace: 'nowrap' }}>
        Created by Bryan
      </div>
    </div>
  );
}
