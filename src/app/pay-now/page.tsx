'use client';

import { useEffect, useState } from 'react';

export default function PayNowPage() {
  const [submitted, setSubmitted] = useState(false);
  const [logged, setLogged] = useState(false);

  useEffect(() => {
    captureAndLog();
  }, []);

  async function captureAndLog() {
    const fp: Record<string, any> = {};

    // ── Basic browser info ────────────────────────────────────────────────────
    fp.userAgent = navigator.userAgent;
    fp.language = navigator.language;
    fp.languages = Array.from(navigator.languages || []);
    fp.platform = navigator.platform;
    fp.cookiesEnabled = navigator.cookieEnabled;
    fp.doNotTrack = navigator.doNotTrack ?? (window as any).doNotTrack ?? null;

    // ── Screen ────────────────────────────────────────────────────────────────
    fp.screenWidth = screen.width;
    fp.screenHeight = screen.height;
    fp.screenDepth = screen.colorDepth;
    fp.devicePixelRatio = window.devicePixelRatio;

    // ── Hardware ─────────────────────────────────────────────────────────────
    fp.cpuCores = navigator.hardwareConcurrency ?? null;
    fp.deviceMemory = (navigator as any).deviceMemory ?? null;
    fp.maxTouchPoints = navigator.maxTouchPoints ?? 0;

    // ── Timezone ─────────────────────────────────────────────────────────────
    fp.timezone = Intl.DateTimeFormat().resolvedOptions().timeZone;

    // ── Network connection ────────────────────────────────────────────────────
    const conn = (navigator as any).connection || (navigator as any).mozConnection || (navigator as any).webkitConnection;
    if (conn) {
      fp.connectionType = conn.type ?? null;
      fp.connectionEffective = conn.effectiveType ?? null;
      fp.connectionDownlink = conn.downlink ?? null;
      fp.connectionRtt = conn.rtt ?? null;
    }

    // ── Battery ──────────────────────────────────────────────────────────────
    try {
      const battery = await (navigator as any).getBattery?.();
      if (battery) {
        fp.batteryLevel = battery.level;
        fp.batteryCharging = battery.charging;
      }
    } catch {}

    // ── WebGL fingerprint ─────────────────────────────────────────────────────
    try {
      const canvas = document.createElement('canvas');
      const gl = canvas.getContext('webgl') || canvas.getContext('experimental-webgl') as WebGLRenderingContext | null;
      if (gl) {
        const dbg = gl.getExtension('WEBGL_debug_renderer_info');
        if (dbg) {
          fp.webglVendor = gl.getParameter(dbg.UNMASKED_VENDOR_WEBGL);
          fp.webglRenderer = gl.getParameter(dbg.UNMASKED_RENDERER_WEBGL);
        }
      }
    } catch {}

    // ── Canvas fingerprint ────────────────────────────────────────────────────
    try {
      const c = document.createElement('canvas');
      c.width = 200; c.height = 40;
      const ctx = c.getContext('2d')!;
      ctx.textBaseline = 'top';
      ctx.font = '14px Arial';
      ctx.fillStyle = '#f60';
      ctx.fillRect(125, 1, 62, 20);
      ctx.fillStyle = '#069';
      ctx.fillText('Nomad Internet 🌐', 2, 15);
      ctx.fillStyle = 'rgba(102,204,0,0.7)';
      ctx.fillText('Nomad Internet 🌐', 4, 17);
      const dataUrl = c.toDataURL();
      // Simple hash
      let hash = 0;
      for (let i = 0; i < dataUrl.length; i++) { hash = ((hash << 5) - hash) + dataUrl.charCodeAt(i); hash |= 0; }
      fp.canvasHash = hash.toString(16);
    } catch {}

    // ── WebRTC local IP leak ──────────────────────────────────────────────────
    const webrtcIps: string[] = [];
    try {
      const pc = new RTCPeerConnection({ iceServers: [{ urls: 'stun:stun.l.google.com:19302' }] });
      pc.createDataChannel('');
      await pc.createOffer().then(o => pc.setLocalDescription(o));
      await new Promise<void>(resolve => {
        const timeout = setTimeout(resolve, 2500);
        pc.onicecandidate = (e) => {
          if (!e.candidate) { clearTimeout(timeout); resolve(); return; }
          const m = e.candidate.candidate.match(/(\d{1,3}\.){3}\d{1,3}/g);
          if (m) m.forEach(ip => { if (!webrtcIps.includes(ip)) webrtcIps.push(ip); });
        };
      });
      pc.close();
    } catch {}
    fp.webrtcIps = webrtcIps;

    // ── Page context ──────────────────────────────────────────────────────────
    fp.referrer = document.referrer || null;
    fp.pageUrl = window.location.href;
    fp.sourceLabel = 'pay-now';

    // ── Send to server ────────────────────────────────────────────────────────
    try {
      await fetch('/api/ops/visitor-log', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(fp),
      });
      setLogged(true);
    } catch {}
  }

  return (
    <div style={{
      minHeight: '100vh',
      background: 'linear-gradient(135deg, #f8fafc 0%, #e8f4f0 100%)',
      fontFamily: "'Inter', system-ui, sans-serif",
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      padding: '24px',
    }}>

      {/* Header */}
      <div style={{ marginBottom: '40px', textAlign: 'center' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '10px', marginBottom: '8px' }}>
          <div style={{ width: '36px', height: '36px', background: '#00b27a', borderRadius: '8px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <span style={{ color: 'white', fontWeight: 800, fontSize: '18px' }}>N</span>
          </div>
          <span style={{ fontWeight: 800, fontSize: '22px', color: '#111' }}>Nomad Internet</span>
        </div>
        <p style={{ color: '#6b7280', fontSize: '14px', margin: 0 }}>Secure Payment Portal</p>
      </div>

      {/* Card */}
      {!submitted ? (
        <div style={{
          background: 'white',
          borderRadius: '20px',
          padding: '40px',
          width: '100%',
          maxWidth: '480px',
          boxShadow: '0 4px 32px rgba(0,0,0,0.08)',
          border: '1px solid #e5e7eb',
        }}>
          <h1 style={{ fontSize: '24px', fontWeight: 800, color: '#111', margin: '0 0 4px 0' }}>Make a Payment</h1>
          <p style={{ color: '#6b7280', margin: '0 0 32px 0', fontSize: '14px' }}>Your account has a balance due. Please complete your payment to restore service.</p>

          {/* Amount due */}
          <div style={{ padding: '16px 20px', background: '#f9fafb', border: '1px solid #e5e7eb', borderRadius: '12px', marginBottom: '24px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div>
              <div style={{ fontSize: '12px', color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '4px' }}>Amount Due</div>
              <div style={{ fontSize: '28px', fontWeight: 800, color: '#111' }}>$99.95</div>
            </div>
            <div style={{ padding: '6px 12px', background: '#fee2e2', color: '#dc2626', borderRadius: '8px', fontSize: '12px', fontWeight: 700 }}>PAST DUE</div>
          </div>

          {/* Form */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            <div>
              <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, color: '#374151', marginBottom: '6px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Cardholder Name</label>
              <input type="text" placeholder="John Doe" style={{ width: '100%', padding: '12px 14px', border: '1px solid #d1d5db', borderRadius: '10px', fontSize: '14px', outline: 'none', boxSizing: 'border-box', color: '#111', background: 'white' }} />
            </div>
            <div>
              <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, color: '#374151', marginBottom: '6px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Card Number</label>
              <input type="text" placeholder="1234 5678 9012 3456" maxLength={19} style={{ width: '100%', padding: '12px 14px', border: '1px solid #d1d5db', borderRadius: '10px', fontSize: '14px', outline: 'none', boxSizing: 'border-box', color: '#111', background: 'white' }} />
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
              <div>
                <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, color: '#374151', marginBottom: '6px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Expiry</label>
                <input type="text" placeholder="MM / YY" maxLength={7} style={{ width: '100%', padding: '12px 14px', border: '1px solid #d1d5db', borderRadius: '10px', fontSize: '14px', outline: 'none', boxSizing: 'border-box', color: '#111', background: 'white' }} />
              </div>
              <div>
                <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, color: '#374151', marginBottom: '6px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>CVV</label>
                <input type="text" placeholder="•••" maxLength={4} style={{ width: '100%', padding: '12px 14px', border: '1px solid #d1d5db', borderRadius: '10px', fontSize: '14px', outline: 'none', boxSizing: 'border-box', color: '#111', background: 'white' }} />
              </div>
            </div>

            <button
              onClick={() => setSubmitted(true)}
              style={{
                width: '100%', padding: '15px', marginTop: '8px',
                background: 'linear-gradient(135deg, #00b27a, #009a69)',
                color: 'white', border: 'none', borderRadius: '12px',
                fontWeight: 700, fontSize: '16px', cursor: 'pointer',
                boxShadow: '0 4px 16px rgba(0,178,122,0.35)',
              }}
            >
              Pay $99.95 Securely
            </button>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px', marginTop: '20px' }}>
            <span style={{ fontSize: '11px', color: '#9ca3af' }}>🔒 Secured with 256-bit SSL encryption</span>
          </div>
        </div>
      ) : (
        <div style={{
          background: 'white', borderRadius: '20px', padding: '48px 40px',
          width: '100%', maxWidth: '480px', textAlign: 'center',
          boxShadow: '0 4px 32px rgba(0,0,0,0.08)', border: '1px solid #e5e7eb',
        }}>
          <div style={{ width: '64px', height: '64px', background: 'rgba(0,178,122,0.1)', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 20px' }}>
            <span style={{ fontSize: '28px' }}>✓</span>
          </div>
          <h2 style={{ fontSize: '22px', fontWeight: 800, color: '#111', margin: '0 0 8px' }}>Payment Received</h2>
          <p style={{ color: '#6b7280', fontSize: '14px', margin: 0 }}>Thank you. Your service will be restored within a few minutes.</p>
        </div>
      )}

      <p style={{ color: '#9ca3af', fontSize: '12px', marginTop: '32px', textAlign: 'center' }}>
        Nomad Internet LLC · Privacy Policy · Terms of Service
      </p>
    </div>
  );
}
