"use client";

import { usePathname } from 'next/navigation';
import Link from 'next/link';
import { Inbox, Settings, Ticket } from 'lucide-react';

export default function AppLayoutWrapper({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const isOps = pathname?.startsWith('/ops');
  const isPayNow = pathname === '/pay-now';

  if (isOps || isPayNow) {
    return <>{children}</>;
  }

  return (
    <div className="layout-container">
      <aside className="sidebar">
        <div style={{ padding: '0 8px 32px 8px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <div suppressHydrationWarning style={{ 
              background: 'linear-gradient(135deg, var(--primary), #8b5cf6)', 
              width: '32px', 
              height: '32px', 
              borderRadius: '8px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              boxShadow: 'var(--shadow-glow)'
            }}>
              <Ticket size={18} color="white" />
            </div>
            <h1 style={{ fontSize: '18px', color: 'white', letterSpacing: '-0.5px' }}>Nomad Workspace</h1>
          </div>
        </div>
        
        <nav style={{ flex: 1 }}>
          <Link href="/" className="nav-link">
            <Inbox size={18} />
            <span>Workspace</span>
          </Link>
        </nav>

        <div style={{ marginTop: 'auto' }}>
          <Link href="/admin" className="nav-link">
            <Settings size={18} />
            <span>Settings</span>
          </Link>
        </div>
      </aside>
      
      <main className="main-content" suppressHydrationWarning>
        {children}
      </main>
    </div>
  );
}
