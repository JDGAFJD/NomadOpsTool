export default function OpsLayout({ children }: { children: React.ReactNode }) {
  // We wrap the OPS section in a container that strips out global layout paddings
  // allowing the Framer Motion backgrounds to safely span 100vw/100vh
  return (
    <div style={{ width: '100vw', minHeight: '100vh', margin: 0, padding: 0, overflowX: 'hidden', backgroundColor: '#050505' }}>
      {children}
    </div>
  );
}
