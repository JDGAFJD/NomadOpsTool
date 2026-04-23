import { getSetting } from '../db';

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
