import { getSetting } from '../db';
import { digits, type NormalizedThingSpaceDevice } from '../lineSwaps/types';

interface TokenCache {
  oauthToken: string;
  sessionToken: string;
  expiresAt: number;
}

// In Next.js dev mode, global variables are preserved across hot reloads.
declare global {
  // eslint-disable-next-line no-var
  var __thingSpaceCache: TokenCache | undefined;
}

if (!global.__thingSpaceCache) {
  global.__thingSpaceCache = { oauthToken: '', sessionToken: '', expiresAt: 0 };
}

export class ThingSpaceService {
  private clientId: string;
  private clientSecret: string;
  private accountName: string;
  private username: string;
  private password: string;
  private baseUrl = 'https://thingspace.verizon.com';

  constructor() {
    this.clientId = getSetting('thingspace_client_id') || '';
    this.clientSecret = getSetting('thingspace_client_secret') || '';
    this.accountName = getSetting('thingspace_account_name') || '';
    this.username = getSetting('thingspace_username') || '';
    this.password = getSetting('thingspace_password') || '';
  }

  isConfigured(): boolean {
    return Boolean(this.clientId && this.clientSecret && this.accountName);
  }

  private async getTokens(forceRefresh = false): Promise<{ oauth: string; session: string } | null> {
    const cache = global.__thingSpaceCache!;
    if (!forceRefresh && cache.oauthToken && cache.sessionToken && Date.now() < cache.expiresAt) {
      return { oauth: cache.oauthToken, session: cache.sessionToken };
    }

    try {
      // 1. Get OAuth Token
      const creds = Buffer.from(`${this.clientId}:${this.clientSecret}`).toString('base64');
      const oauthRes = await fetch(`${this.baseUrl}/api/ts/v1/oauth2/token`, {
        method: 'POST',
        headers: {
          'Authorization': `Basic ${creds}`,
          'Content-Type': 'application/x-www-form-urlencoded'
        },
        body: 'grant_type=client_credentials'
      });
      const oauthData = await oauthRes.json();
      if (!oauthData.access_token) throw new Error('OAuth token missing');

      // 2. Get Session Token
      const sessionRes = await fetch(`${this.baseUrl}/api/m2m/v1/session/login`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${oauthData.access_token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ username: this.username, password: this.password })
      });
      const sessionData = await sessionRes.json();
      if (!sessionData.sessionToken) throw new Error('Session token missing');

      // Update Cache (OAuth tokens usually last 1 hour, we cache for 50 mins)
      cache.oauthToken = oauthData.access_token;
      cache.sessionToken = sessionData.sessionToken;
      cache.expiresAt = Date.now() + 50 * 60 * 1000;

      return { oauth: cache.oauthToken, session: cache.sessionToken };
    } catch (err) {
      console.error('ThingSpace Auth Error:', err);
      return null;
    }
  }

  private async apiRequest(path: string, init: RequestInit = {}, retry = true): Promise<any> {
    if (!this.isConfigured()) throw new Error('ThingSpace is not configured');
    const tokens = await this.getTokens();
    if (!tokens) throw new Error('ThingSpace authentication failed');
    const response = await fetch(`${this.baseUrl}${path}`, {
      ...init,
      headers: {
        'Authorization': `Bearer ${tokens.oauth}`,
        'VZ-M2M-Token': tokens.session,
        'Content-Type': 'application/json',
        ...(init.headers || {}),
      },
      cache: 'no-store',
    });
    const text = await response.text();
    let payload: any = null;
    try { payload = text ? JSON.parse(text) : null; } catch { payload = { message: text.slice(0, 500) }; }
    if (!response.ok) {
      const expired = String(payload?.errorCode || payload?.errorMessage || payload?.message || '').toLowerCase().includes('expired');
      if (expired && retry) {
        global.__thingSpaceCache = { oauthToken: '', sessionToken: '', expiresAt: 0 };
        await this.getTokens(true);
        return this.apiRequest(path, init, false);
      }
      const error = new Error(`ThingSpace request failed (${response.status})`) as Error & { status?: number; payload?: unknown };
      error.status = response.status;
      error.payload = payload;
      throw error;
    }
    return payload;
  }

  normalizeDevice(device: any): NormalizedThingSpaceDevice {
    const identifiers = Object.fromEntries((device?.deviceIds || []).map((entry: any) => [String(entry.kind || '').toLowerCase(), digits(entry.id)]));
    const customFields = Object.fromEntries((device?.customFields || []).map((entry: any) => [String(entry.key || '').toLowerCase(), String(entry.value || '')]));
    const carrier = (device?.carrierInformations || [])[0] || {};
    const internal = (device?.extendedAttributes || []).find((entry: any) => String(entry.key || '').toLowerCase() === 'deviceid');
    return {
      internalId: Number(internal?.value || 0),
      mdn: identifiers.mdn || digits(carrier.mdn),
      iccid: identifiers.iccid || digits(carrier.iccid),
      imei: identifiers.imei || digits(carrier.imei),
      state: String(carrier.state || device?.state || '').trim().toLowerCase(),
      plan: String(carrier.servicePlan || carrier.plan || device?.servicePlan || '').trim(),
      customField4: customFields.customfield4 || '',
      customField5: customFields.customfield5 || '',
      raw: device,
    };
  }

  async listAllDevices(): Promise<NormalizedThingSpaceDevice[]> {
    const devices: NormalizedThingSpaceDevice[] = [];
    const seen = new Set<number>();
    let largestDeviceIdSeen = 0;
    for (let page = 0; page < 100; page += 1) {
      const payload = await this.apiRequest('/api/m2m/v1/devices/actions/list', {
        method: 'POST',
        body: JSON.stringify({ accountName: this.accountName, largestDeviceIdSeen, maxNumberOfDevices: 500 }),
      });
      let maxSeen = largestDeviceIdSeen;
      for (const raw of payload?.devices || []) {
        const device = this.normalizeDevice(raw);
        if (!Number.isFinite(device.internalId) || device.internalId <= 0) throw new Error('ThingSpace device is missing its internal ID');
        if (seen.has(device.internalId)) throw new Error(`Duplicate ThingSpace internal device ID ${device.internalId}`);
        seen.add(device.internalId);
        devices.push(device);
        maxSeen = Math.max(maxSeen, device.internalId);
      }
      if (!payload?.hasMoreData) return devices.sort((a, b) => a.internalId - b.internalId);
      if (maxSeen <= largestDeviceIdSeen) throw new Error('ThingSpace pagination cursor did not advance');
      largestDeviceIdSeen = maxSeen;
    }
    throw new Error('ThingSpace pagination exceeded its safety limit');
  }

  async getDeviceByIdentifier(kind: 'mdn' | 'iccid' | 'imei', id: string): Promise<NormalizedThingSpaceDevice | null> {
    const payload = await this.apiRequest('/api/m2m/v1/devices/actions/list', {
      method: 'POST',
      body: JSON.stringify({ deviceId: { kind, id: digits(id) } }),
    });
    const exact = (payload?.devices || []).map((entry: any) => this.normalizeDevice(entry)).filter((device: NormalizedThingSpaceDevice) => device[kind] === digits(id));
    if (exact.length > 1) throw new Error(`ThingSpace returned multiple exact ${kind} matches`);
    return exact[0] || null;
  }

  async change4gIdentifiers(sourceMdn: string, targetImei: string, targetIccid: string): Promise<string> {
    const payload = await this.apiRequest('/api/m2m/v1/devices/4g/actions/deviceId', {
      method: 'PUT',
      body: JSON.stringify({
        deviceIds: [{ kind: 'mdn', id: digits(sourceMdn) }],
        deviceIdsTo: [{ kind: 'imei', id: digits(targetImei) }, { kind: 'iccid', id: digits(targetIccid) }],
        change4gOption: 'ChangeIMEIandICCID',
      }),
    });
    if (!payload?.requestId) throw new Error('ThingSpace identifier change did not return a request ID');
    return payload.requestId;
  }

  async restoreByMdn(mdn: string): Promise<string> {
    const payload = await this.apiRequest('/api/m2m/v1/devices/actions/restore', {
      method: 'POST',
      body: JSON.stringify({ accountName: this.accountName, devices: [{ deviceIds: [{ kind: 'mdn', id: digits(mdn) }] }] }),
    });
    if (!payload?.requestId) throw new Error('ThingSpace restore did not return a request ID');
    return payload.requestId;
  }

  async updateCustomFieldByMdn(mdn: string, key: 'CustomField4' | 'CustomField5', value: string): Promise<string> {
    const payload = await this.apiRequest('/api/m2m/v1/devices/actions/customFields', {
      method: 'PUT',
      body: JSON.stringify({
        devices: [{ deviceIds: [{ kind: 'mdn', id: digits(mdn) }] }],
        customFieldsToUpdate: [{ key, value: value.slice(0, 50) }],
      }),
    });
    if (!payload?.requestId) throw new Error('ThingSpace custom-field update did not return a request ID');
    return payload.requestId;
  }

  async getRequestStatus(requestId: string): Promise<'pending' | 'success' | 'failure'> {
    const payload = await this.apiRequest(`/api/m2m/v1/accounts/${encodeURIComponent(this.accountName)}/requests/${encodeURIComponent(requestId)}/status`, { method: 'GET' });
    const status = String(payload?.status || '').toLowerCase();
    if (status === 'success') return 'success';
    if (status === 'failure' || status === 'failed') return 'failure';
    return 'pending';
  }

  async getDeviceDetails(iccid: string) {
    if (!this.isConfigured()) return null;
    const tokens = await this.getTokens();
    if (!tokens) return null;

    const res = await fetch(`${this.baseUrl}/api/m2m/v1/devices/actions/list`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${tokens.oauth}`,
        'VZ-M2M-Token': tokens.session,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        accountName: this.accountName,
        filter: {
          deviceIdentifierFilters: [{ kind: 'iccid', contains: iccid }]
        }
      })
    });

    if (!res.ok) {
      const errPayload = await res.json().catch(() => null);
      if (errPayload?.errorCode?.includes('SessionToken.Expired') || errPayload?.errorMessage?.includes('expired')) {
        // Clear local cache physically and recurse exactly once
        global.__thingSpaceCache = { oauthToken: '', sessionToken: '', expiresAt: 0 };
        const newTokens = await this.getTokens(true);
        if (!newTokens) return null;
        const retryRes = await fetch(`${this.baseUrl}/api/m2m/v1/devices/actions/list`, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${newTokens.oauth}`,
            'VZ-M2M-Token': newTokens.session,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            accountName: this.accountName,
            filter: { deviceIdentifierFilters: [{ kind: 'iccid', contains: iccid }] }
          })
        });
        if (!retryRes.ok) return null;
        const retryData = await retryRes.json();
        return retryData.devices && retryData.devices.length > 0 ? retryData.devices[0] : null;
      }
      return null;
    }
    
    const data = await res.json();
    return data.devices && data.devices.length > 0 ? data.devices[0] : null;
  }

  async getDeviceUsageData(iccid: string, earliest: string, latest: string) {
    if (!this.isConfigured()) return null;
    const tokens = await this.getTokens();
    if (!tokens) return null;

    const res = await fetch(`${this.baseUrl}/api/m2m/v1/devices/usage/actions/list`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${tokens.oauth}`,
        'VZ-M2M-Token': tokens.session,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        deviceId: { id: iccid, kind: "iccid" },
        earliest,
        latest
      })
    });

    if (!res.ok) {
      const errPayload = await res.json().catch(() => null);
      if (errPayload?.errorCode?.includes('SessionToken.Expired') || 
          errPayload?.errorMessage?.includes('expired') || 
          errPayload?.fault?.code === '900901' || 
          errPayload?.fault?.message?.includes('Invalid Credentials')) {
        global.__thingSpaceCache = { oauthToken: '', sessionToken: '', expiresAt: 0 };
        const newTokens = await this.getTokens(true);
        if (!newTokens) throw new Error("Retry token failed");
        const retryRes = await fetch(`${this.baseUrl}/api/m2m/v1/devices/usage/actions/list`, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${newTokens.oauth}`,
            'VZ-M2M-Token': newTokens.session,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            deviceId: { id: iccid, kind: "iccid" },
            earliest,
            latest
          })
        });
        if (!retryRes.ok) throw new Error("Retry: " + await retryRes.text());
        return await retryRes.json();
      }
      throw new Error("Initial: " + JSON.stringify(errPayload));
    }

    const payload = await res.json();
    console.log("Usage SUCCESS", payload);
    return payload;
  }

  async performAction(iccid: string, action: 'suspend' | 'restore') {
    if (!this.isConfigured()) return { success: false, error: 'Not configured' };
    const tokens = await this.getTokens();
    if (!tokens) return { success: false, error: 'Authentication failed' };

    const endpoint = action === 'suspend' 
      ? '/api/m2m/v1/devices/actions/suspend' 
      : '/api/m2m/v1/devices/actions/restore';

    let res = await fetch(`${this.baseUrl}${endpoint}`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${tokens.oauth}`,
        'VZ-M2M-Token': tokens.session,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        accountName: this.accountName,
        devices: [
          {
            deviceIds: [{ id: iccid, kind: 'iccid' }]
          }
        ]
      })
    });

    if (!res.ok) {
      const errText = await res.text();
      try {
        const errJson = JSON.parse(errText);
        if (errJson?.errorCode?.includes('SessionToken.Expired') || errJson?.errorMessage?.includes('expired')) {
          global.__thingSpaceCache = { oauthToken: '', sessionToken: '', expiresAt: 0 };
          const newTokens = await this.getTokens(true);
          if (!newTokens) return { success: false, error: 'Auth Retry Failed' };
          
          res = await fetch(`${this.baseUrl}${endpoint}`, {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${newTokens.oauth}`,
              'VZ-M2M-Token': newTokens.session,
              'Content-Type': 'application/json'
            },
            body: JSON.stringify({
              accountName: this.accountName,
              devices: [{ deviceIds: [{ id: iccid, kind: 'iccid' }] }]
            })
          });

          if (!res.ok) {
            return { success: false, error: await res.text() };
          }
        } else {
          return { success: false, error: errText };
        }
      } catch (e) {
        return { success: false, error: errText };
      }
    }
    
    const data = await res.json();
    return { success: true, requestId: data.requestId };
  }
}
