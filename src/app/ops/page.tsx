"use client";

import { motion } from 'framer-motion';
import { useRouter } from 'next/navigation';
import { Sparkles, ArrowRight } from 'lucide-react';

export default function OpsLandingPage() {
  const router = useRouter();

  return (
    <div style={{ 
      minHeight: '100vh', 
      backgroundColor: '#050505', 
      backgroundImage: 'radial-gradient(circle at 50% 0%, rgba(0, 178, 122, 0.10) 0%, transparent 70%)',
      display: 'flex', 
      flexDirection: 'column', 
      alignItems: 'center', 
      justifyContent: 'center',
      position: 'relative',
      overflow: 'hidden'
    }}>
      
      {/* Background Floating Elements */}
      <motion.div 
        animate={{ y: [0, -20, 0], opacity: [0.3, 0.5, 0.3] }} 
        transition={{ repeat: Infinity, duration: 8, ease: "easeInOut" }}
        style={{ position: 'absolute', top: '20%', left: '15%', width: '300px', height: '300px', background: 'radial-gradient(circle, rgba(0, 178, 122, 0.15) 0%, transparent 70%)', filter: 'blur(40px)' }}
      />
      <motion.div 
        animate={{ y: [0, 30, 0], opacity: [0.2, 0.4, 0.2] }} 
        transition={{ repeat: Infinity, duration: 10, ease: "easeInOut" }}
        style={{ position: 'absolute', bottom: '10%', right: '15%', width: '400px', height: '400px', background: 'radial-gradient(circle, rgba(0, 178, 122, 0.15) 0%, transparent 70%)', filter: 'blur(50px)' }}
      />

      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.8, ease: "easeOut" }}
        style={{ zIndex: 10, display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center' }}
      >
        <motion.div 
          initial={{ scale: 0.9, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ duration: 1, ease: 'easeOut', delay: 0.2 }}
          style={{ marginBottom: '24px', display: 'flex', alignItems: 'center', gap: '12px', padding: '12px 24px', backgroundColor: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: '100px', backdropFilter: 'blur(10px)' }}
        >
          <Sparkles color="#00b27a" size={20} />
          <span style={{ color: '#e5e7eb', fontSize: '14px', letterSpacing: '2px', textTransform: 'uppercase', fontWeight: 500 }}>
            Nomad V2 Infrastructure
          </span>
        </motion.div>

        <h1 style={{ 
          fontSize: 'clamp(48px, 8vw, 84px)', 
          fontWeight: 800, 
          letterSpacing: '-0.04em', 
          lineHeight: 1.1,
          color: 'white',
          marginBottom: '24px',
          maxWidth: '800px',
          background: 'linear-gradient(180deg, #FFFFFF 0%, rgba(255,255,255,0.5) 100%)',
          WebkitBackgroundClip: 'text',
          WebkitTextFillColor: 'transparent'
        }}>
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', lineHeight: 1, marginBottom: '24px' }}>
            <div style={{ fontSize: 'clamp(64px, 12vw, 120px)', fontWeight: 800, letterSpacing: '-4px', color: 'white', display: 'flex', alignItems: 'center' }}>
              n<span style={{ position: 'relative', display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}><span style={{ color: '#00b27a' }}>ō</span></span>mad
            </div>
            <div style={{ fontSize: 'clamp(14px, 2.5vw, 24px)', fontWeight: 500, letterSpacing: '8px', color: '#00b27a', marginLeft: '6px' }}>
              I N T E R N E T
            </div>
          </div>
          <span style={{ background: 'linear-gradient(90deg, #00b27a 0%, #00a26a 50%, #007b50 100%)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', fontSize: 'clamp(32px, 5vw, 48px)' }}>OPS Tool V2</span>
        </h1>

        <p style={{ color: '#9ca3af', fontSize: '20px', maxWidth: '600px', marginBottom: '48px', lineHeight: 1.6 }}>
          Internal support tool for the Nomad Internet team to help customers faster.
        </p>

        {/* Floating Animated Get Started Button */}
        <motion.button
          onClick={() => router.push('/ops/login')}
          whileHover={{ scale: 1.05, boxShadow: '0 0 32px rgba(0, 178, 122, 0.6)' }}
          whileTap={{ scale: 0.95 }}
          animate={{ y: [0, -8, 0] }}
          transition={{ 
            y: { repeat: Infinity, duration: 4, ease: "easeInOut" },
            scale: { type: 'spring', stiffness: 400, damping: 10 }
          }}
          style={{
            background: 'linear-gradient(135deg, #00b27a 0%, #00a26a 100%)',
            border: 'none',
            color: 'white',
            padding: '20px 48px',
            fontSize: '18px',
            fontWeight: 600,
            borderRadius: '100px',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            gap: '12px',
            boxShadow: '0 16px 32px rgba(0, 178, 122, 0.4)',
            borderTop: '1px solid rgba(255,255,255,0.2)'
          }}
        >
          Get Started <ArrowRight size={20} />
        </motion.button>
      </motion.div>

      {/* Watermark */}
      <motion.div 
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 1, duration: 1 }}
        style={{ position: 'absolute', bottom: '32px', color: 'rgba(255,255,255,0.3)', fontSize: '13px', letterSpacing: '1px' }}
      >
        Created by Bryan
      </motion.div>
    </div>
  );
}
