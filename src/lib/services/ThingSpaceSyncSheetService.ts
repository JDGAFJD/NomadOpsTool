import { GoogleAuth } from 'google-auth-library';
import { digits, type NormalizedThingSpaceDevice } from '../lineSwaps/types';

const REQUIRED_HEADERS = ['DeviceId', 'mdn', 'imei', 'iccId', 'servicePlan', 'carrierState', 'CustomField4', 'CustomField5'];
export const MAX_SYNC_AGE_MS = 2 * 60 * 60 * 1000;

export class ThingSpaceSyncSheetService {
  private spreadsheetId = process.env.LINE_SWAP_SYNC_SPREADSHEET_ID || '1adQcwu3S9D5l8rBYKsA1x61GRPtZ3AC5MtS54svvGC0';
  private sheetName = process.env.LINE_SWAP_SYNC_SHEET_NAME || 'TS_Lines';

  isConfigured() {
    return Boolean(process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL && process.env.GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY && this.spreadsheetId);
  }

  private async client() {
    if (!this.isConfigured()) throw new Error('Google Sheets service account is not configured');
    const auth = new GoogleAuth({
      credentials: {
        client_email: process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL,
        private_key: process.env.GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY?.replace(/\\n/g, '\n'),
      },
      scopes: ['https://www.googleapis.com/auth/spreadsheets.readonly', 'https://www.googleapis.com/auth/drive.metadata.readonly'],
    });
    return auth.getClient();
  }

  private async get<T>(url: string): Promise<T> {
    const response = await (await this.client()).request<T>({ url, method: 'GET' });
    return response.data;
  }

  async loadFreshSnapshot(now = new Date()): Promise<{ devices: NormalizedThingSpaceDevice[]; modifiedTime: string; ageMs: number; verifiedAt: string }> {
    const metadata = await this.get<{ modifiedTime?: string }>(`https://www.googleapis.com/drive/v3/files/${encodeURIComponent(this.spreadsheetId)}?fields=modifiedTime`);
    const ageMs = snapshotAgeMs(metadata.modifiedTime, now);
    if (!Number.isFinite(ageMs)) throw new Error('TS_Lines fallback is unavailable because Drive modifiedTime is missing or invalid');
    if (ageMs < 0 || ageMs > MAX_SYNC_AGE_MS) throw new Error(`TS_Lines fallback is stale (${formatAge(ageMs)} old; maximum is 2 hours)`);
    const range = encodeURIComponent(`${this.sheetName}!A:X`);
    const payload = await this.get<{ values?: unknown[][] }>(`https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(this.spreadsheetId)}/values/${range}?majorDimension=ROWS&valueRenderOption=UNFORMATTED_VALUE`);
    return { devices: mapSyncRows(payload.values || []), modifiedTime: metadata.modifiedTime!, ageMs, verifiedAt: now.toISOString() };
  }
}

export function snapshotAgeMs(modifiedTime: string | undefined, now = new Date()): number {
  if (!modifiedTime) return Number.NaN;
  return now.getTime() - new Date(modifiedTime).getTime();
}

export function mapSyncRows(rows: unknown[][]): NormalizedThingSpaceDevice[] {
  if (!rows.length) throw new Error('TS_Lines fallback has no header row');
  const headers = rows[0].map(value => String(value || '').trim());
  const indexes = Object.fromEntries(REQUIRED_HEADERS.map(header => [header, headers.indexOf(header)]));
  const missing = REQUIRED_HEADERS.filter(header => indexes[header] < 0);
  if (missing.length) throw new Error(`TS_Lines fallback is missing required columns: ${missing.join(', ')}`);
  const seen = new Set<number>();
  const devices: NormalizedThingSpaceDevice[] = [];
  for (const row of rows.slice(1)) {
    const internalId = Number(row[indexes.DeviceId]);
    if (!Number.isSafeInteger(internalId) || internalId <= 0 || seen.has(internalId)) continue;
    seen.add(internalId);
    devices.push({
      internalId,
      mdn: digits(row[indexes.mdn]),
      imei: digits(row[indexes.imei]),
      iccid: digits(row[indexes.iccId]),
      plan: String(row[indexes.servicePlan] || '').trim(),
      state: String(row[indexes.carrierState] || '').trim().toLowerCase(),
      customField4: String(row[indexes.CustomField4] || '').trim(),
      customField5: String(row[indexes.CustomField5] || '').trim(),
    });
  }
  return devices.sort((a, b) => a.internalId - b.internalId);
}

function formatAge(ageMs: number): string {
  return ageMs < 60_000 ? 'under a minute' : `${Math.ceil(ageMs / 60_000)} minutes`;
}
