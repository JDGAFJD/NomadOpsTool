export default function OpsLayout({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ width: '100vw', minHeight: '100vh', margin: 0, padding: 0, overflowX: 'hidden', backgroundColor: 'var(--ops-bg)' }}>
      {children}
    </div>
  );
}
