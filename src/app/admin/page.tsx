"use client";

import { useEffect, useState } from 'react';
import { Save, CheckCircle, Database, ShieldAlert } from 'lucide-react';

export default function AdminPage() {
  const [formData, setFormData] = useState({
    freescout_api_url: '',
    freescout_api_key: '',
  });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);

  useEffect(() => {
    async function loadSettings() {
      try {
        const res = await fetch('/api/settings');
        const data = await res.json();
        if (data.settings) {
          setFormData({
            freescout_api_url: data.settings.freescout_api_url || '',
            freescout_api_key: data.settings.freescout_api_key || '',
          });
        }
      } catch (err) {
        console.error(err);
      } finally {
        setLoading(false);
      }
    }
    loadSettings();
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setSaveSuccess(false);

    try {
      const res = await fetch('/api/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formData)
      });
      if (res.ok) {
        setSaveSuccess(true);
        setTimeout(() => setSaveSuccess(false), 3000);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return <div className="page-header"><h1 className="page-title">Loading Settings...</h1></div>;
  }

  return (
    <div className="animate-fade-in">
      <header className="page-header">
        <h1 className="page-title">Integration Settings</h1>
        <p className="page-subtitle">Manage API credentials for external integrations securely.</p>
      </header>
      
      <div style={{ padding: '40px', maxWidth: '800px' }}>
        <form onSubmit={handleSubmit} className="glass-panel" style={{ padding: '32px' }}>
          
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '24px' }}>
            <Database size={24} color="var(--primary)" />
            <h2 style={{ margin: 0 }}>FreeScout Configuration</h2>
          </div>

          <div style={{ marginBottom: '24px' }}>
            <label style={{ display: 'block', marginBottom: '8px', color: 'var(--text-secondary)', fontSize: '14px' }}>
              FreeScout API URL
            </label>
            <input 
              type="text" 
              className="input-field" 
              placeholder="https://help.yourdomain.com"
              value={formData.freescout_api_url}
              onChange={(e) => setFormData({...formData, freescout_api_url: e.target.value})}
            />
            <p style={{ marginTop: '8px', fontSize: '12px', color: 'var(--text-muted)' }}>
              The base URL of your FreeScout installation without trailing slash.
            </p>
          </div>

          <div style={{ marginBottom: '32px' }}>
            <label style={{ display: 'block', marginBottom: '8px', color: 'var(--text-secondary)', fontSize: '14px' }}>
              FreeScout API Key
            </label>
            <input 
              type="password" 
              className="input-field" 
              placeholder="Enter your API key"
              value={formData.freescout_api_key}
              onChange={(e) => setFormData({...formData, freescout_api_key: e.target.value})}
            />
          </div>

          <div style={{ height: '1px', backgroundColor: 'var(--border)', margin: '32px 0' }}></div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '24px' }}>
            <ShieldAlert size={24} color="var(--text-muted)" />
            <h2 style={{ margin: 0, color: 'var(--text-secondary)' }}>Future Integrations</h2>
          </div>
          <p style={{ color: 'var(--text-muted)', fontSize: '14px', marginBottom: '32px' }}>
            Placeholders for Chargebee, ThingSpace, Shopify, and ShipStation will appear here in Phase 2.
          </p>

          <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
            <button type="submit" className="btn btn-primary" disabled={saving}>
              <Save size={18} />
              {saving ? 'Saving...' : 'Save Settings'}
            </button>
            {saveSuccess && (
              <span style={{ color: 'var(--success)', display: 'flex', alignItems: 'center', gap: '6px', fontSize: '14px' }}>
                <CheckCircle size={16} /> Saved successfully
              </span>
            )}
          </div>
        </form>
      </div>
    </div>
  );
}
