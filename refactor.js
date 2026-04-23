import fs from 'fs';
import path from 'path';

const PAGE_PATH = path.join(process.cwd(), 'src/app/ops/dashboard/page.tsx');
let content = fs.readFileSync(PAGE_PATH, 'utf-8');

// 1. Rename OpsDashboard to WorkspaceTab and change signature:
content = content.replace(
  'export default function OpsDashboard() {',
  'function WorkspaceTab({ id, isVisible, onUpdateTitle }: { id: string; isVisible: boolean; onUpdateTitle: (title: string, error?: boolean) => void }) {'
);

// 2. Remove the header from WorkspaceTab (Lines starting from {/* Header Pipeline */} to </header>)
const headerRegex = /\{\/\* Header Pipeline \*\/\}[\s\S]*?<\/header>/;
content = content.replace(headerRegex, '');

// 3. Move loggingOut logic out of WorkspaceTab.
// Actually, loggingOut was used in the header. We can just leave it or remove it from WorkspaceTab.
content = content.replace(/const \[loggingOut, setLoggingOut\] = useState\(false\);\n/, '');
content = content.replace(/const handleLogout = async \(\) => \{[\s\S]*?^  \};\n/m, '');

// 4. Update the outermost container of WorkspaceTab to use display none if not visible
// The outermost container in WorkspaceTab is:
// <div style={{ minHeight: '100vh', ... }}>
content = content.replace(
  /minHeight: '100vh',/,
  "display: isVisible ? 'flex' : 'none', minHeight: '100vh',"
);

// 5. Trigger onUpdateTitle inside handleSearch successfully block
const searchSuccessRegex = /setChargebeeData\(data\.chargebeeData_{\.subscriptions \|\| \[\]}\);\n\s*setCommerceData\(data\.commerceData \|\| \[\]\);/g;
// We'll replace it by looking for setChargebeeData...
// Actually, it's easier to find: `setMode('results');`
content = content.replace(
  /setMode\('results'\);/g,
  "setMode('results');\n      onUpdateTitle(searchEmail);\n"
);

// Also when there's an error, maybe set the title to error?
content = content.replace(
  /setError\(err\.message || 'System fault'\);/g,
  "setError(err.message || 'System fault');\n      onUpdateTitle('Search Error', true);\n"
);

// The handleSearch inside WorkspaceTab uses `email` state. 
// When user successfully searches, they passed `email` into the body.
// Wait, the body uses `email`. But `email` state is bound to input. 
// Let's replace `const searchEmail = email.trim();` ... Wait, we can just look for `setMode('results')`.

// 6. Append the new OpsDashboard wrapper at the end.
const newWrapper = `
export default function OpsDashboard() {
  const router = useRouter();
  const [loggingOut, setLoggingOut] = useState(false);
  const [tabs, setTabs] = useState<{ id: string; title: string, isError: boolean }[]>([{ id: '1', title: 'New Search', isError: false }]);
  const [activeTabId, setActiveTabId] = useState('1');

  const handleLogout = async () => {
    setLoggingOut(true);
    await fetch('/api/ops/logout', { method: 'POST' });
    router.push('/ops');
  };

  const handleCreateTab = () => {
    const newId = Date.now().toString();
    setTabs(prev => [...prev, { id: newId, title: 'New Search', isError: false }]);
    setActiveTabId(newId);
  };

  const handleCloseTab = (e: React.MouseEvent, targetId: string) => {
    e.stopPropagation();
    setTabs(prev => {
      const remaining = prev.filter(t => t.id !== targetId);
      if (remaining.length === 0) {
        const fallbackId = Date.now().toString();
        setActiveTabId(fallbackId);
        return [{ id: fallbackId, title: 'New Search', isError: false }];
      }
      if (activeTabId === targetId) setActiveTabId(remaining[remaining.length - 1].id);
      return remaining;
    });
  };

  const updateTabTitle = (targetId: string, newTitle: string, isError = false) => {
    setTabs(prev => prev.map(t => t.id === targetId ? { ...t, title: newTitle, isError } : t));
  };

  return (
    <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column', backgroundColor: '#0a0a0a', color: 'white', fontFamily: 'system-ui, sans-serif' }}>
      {/* Global Header */}
      <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '16px 40px', borderBottom: '1px solid rgba(255,255,255,0.05)', backgroundColor: 'rgba(0,0,0,0.5)', backdropFilter: 'blur(10px)', zIndex: 100 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start', lineHeight: 1 }}>
             <div style={{ fontSize: '22px', fontWeight: 800, letterSpacing: '-1px', color: 'white', display: 'flex', alignItems: 'center', gap: '4px' }}>
                n<span style={{ position: 'relative', display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}><span style={{ color: '#00b27a' }}>ō</span></span>mad
             </div>
             <div style={{ fontSize: '9px', fontWeight: 500, letterSpacing: '4px', color: '#00b27a', marginLeft: '2px', marginTop: '2px' }}>
                I N T E R N E T
             </div>
          </div>
          <div style={{ height: '20px', width: '1px', background: 'rgba(255,255,255,0.1)', margin: '0 12px' }} />
          <h1 style={{ fontSize: '14px', margin: 0, fontWeight: 600, color: '#9ca3af' }}>NOC <span style={{ color: '#6b7280' }}>Ecosystem</span></h1>
        </div>
        
        {/* Tab Strip Navigation */}
        <div style={{ flex: 1, margin: '0 40px', display: 'flex', gap: '8px', overflowX: 'auto', paddingBottom: '4px' }}>
          {tabs.map(tab => (
            <div 
              key={tab.id}
              onClick={() => setActiveTabId(tab.id)}
              style={{
                display: 'flex', alignItems: 'center', gap: '8px', padding: '8px 16px', borderRadius: '12px',
                background: activeTabId === tab.id ? 'rgba(0, 178, 122, 0.15)' : 'rgba(255,255,255,0.03)',
                border: \`1px solid \${activeTabId === tab.id ? 'rgba(0, 178, 122, 0.4)' : 'rgba(255,255,255,0.05)'}\`,
                cursor: 'pointer',
                transition: 'all 0.2s',
                minWidth: '150px',
                maxWidth: '220px'
              }}
            >
              <Activity size={14} color={activeTabId === tab.id ? '#00b27a' : '#6b7280'} />
              <div style={{ flex: 1, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', fontSize: '13px', color: activeTabId === tab.id ? 'white' : '#9ca3af', fontWeight: activeTabId === tab.id ? 600 : 400 }}>
                {tab.title}
              </div>
              <button onClick={(e) => handleCloseTab(e, tab.id)} style={{ background: 'transparent', border: 'none', color: '#9ca3af', padding: '2px', cursor: 'pointer', borderRadius: '4px', display: 'flex' }}>
                <X size={12} />
              </button>
            </div>
          ))}
          <button onClick={handleCreateTab} style={{ background: 'transparent', border: '1px dashed rgba(255,255,255,0.2)', color: '#9ca3af', borderRadius: '12px', padding: '0 16px', cursor: 'pointer', display: 'flex', alignItems: 'center', transition: 'all 0.2s' }}>
            +
          </button>
        </div>

        <button 
          onClick={handleLogout}
          disabled={loggingOut}
          style={{ background: 'transparent', border: '1px solid rgba(255, 255, 255, 0.2)', color: '#e5e7eb', padding: '8px 16px', borderRadius: '8px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '8px', fontSize: '14px' }}
        >
          {loggingOut ? <Loader2 size={16} className="animate-spin" /> : <LogOut size={16} />} Disconnect
        </button>
      </header>
      
      {/* Workspace Containers Layered securely using shadow DOM principles */}
      <div style={{ flex: 1, position: 'relative', overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
        {tabs.map(tab => (
          <WorkspaceTab 
            key={tab.id} 
            id={tab.id} 
            isVisible={activeTabId === tab.id} 
            onUpdateTitle={(title, error) => updateTabTitle(tab.id, title, error)} 
          />
        ))}
      </div>
    </div>
  );
}
`;

content += newWrapper;

// 7. Small fixes. The initial search input might be centered vertically. If WorkspaceTab's container expects to be full height.
// Currently WorkspaceTab has `minHeight: '100vh'. We can make it `flex: 1`.
content = content.replace("minHeight: '100vh',", "flex: 1,");

fs.writeFileSync(PAGE_PATH, content);
console.log("Refactor Complete!");
