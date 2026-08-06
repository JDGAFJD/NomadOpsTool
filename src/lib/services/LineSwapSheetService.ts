import { GoogleAuth } from 'google-auth-library';
import { digits, isValidIccid, isValidImei, type InventoryRow } from '../lineSwaps/types';

const HEADERS = ['IMEI', 'ICCID', 'Status', 'Reserved At', 'Used At', 'Batch ID', 'Provenance', 'Notes'];

export class LineSwapSheetService {
  private spreadsheetId = process.env.LINE_SWAP_SPREADSHEET_ID || '14fYbbwhP8LT4mT324EoOF5biCrIhSsH-4YwLnNLw9f4';
  private sheetId = Number(process.env.LINE_SWAP_SHEET_ID || '661451193');
  private sheetName = process.env.LINE_SWAP_SHEET_NAME || 'Missing Lines';

  isConfigured(): boolean {
    return Boolean(process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL && process.env.GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY && this.spreadsheetId);
  }

  private async client() {
    if (!this.isConfigured()) throw new Error('Google Sheets service account is not configured');
    const auth = new GoogleAuth({
      credentials: {
        client_email: process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL,
        private_key: process.env.GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY?.replace(/\\n/g, '\n'),
      },
      scopes: ['https://www.googleapis.com/auth/spreadsheets', 'https://www.googleapis.com/auth/drive.metadata.readonly'],
    });
    return auth.getClient();
  }

  private async request<T>(url: string, method: 'GET' | 'PUT' | 'POST' = 'GET', data?: unknown): Promise<T> {
    const client = await this.client();
    const response = await client.request<T>({ url, method, data });
    return response.data;
  }

  private valuesUrl(range: string): string {
    return `https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(this.spreadsheetId)}/values/${encodeURIComponent(`${this.sheetName}!${range}`)}`;
  }

  async ensureSchema(): Promise<void> {
    await this.request(`${this.valuesUrl('A1:H1')}?valueInputOption=RAW`, 'PUT', { range: `${this.sheetName}!A1:H1`, majorDimension: 'ROWS', values: [HEADERS] });
    const metadata = await this.request<{ sheets?: Array<{ properties?: { sheetId?: number; gridProperties?: { rowCount?: number } }; tables?: Array<{ tableId?: string }> }> }>(
      `https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(this.spreadsheetId)}?fields=sheets(properties(sheetId,gridProperties(rowCount)),tables(tableId))`,
    );
    const targetSheet = metadata.sheets?.find(sheet => sheet.properties?.sheetId === this.sheetId);
    const tableId = targetSheet?.tables?.[0]?.tableId;
    const rowCount = targetSheet?.properties?.gridProperties?.rowCount || 2;
    const requests: Array<Record<string, unknown>> = [];
    if (tableId) {
      requests.push({ updateTable: { table: { tableId, range: { sheetId: this.sheetId, startRowIndex: 0, endRowIndex: rowCount, startColumnIndex: 0, endColumnIndex: 8 } }, fields: 'range' } });
    }
    requests.push({
      setDataValidation: {
        range: { sheetId: this.sheetId, startRowIndex: 1, startColumnIndex: 2, endColumnIndex: 3 },
        rule: {
          condition: { type: 'ONE_OF_LIST', values: ['Available', 'Reserved', 'Used', 'Quarantined'].map(userEnteredValue => ({ userEnteredValue })) },
          strict: true,
          showCustomUi: true,
        },
      },
    });
    await this.request(`https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(this.spreadsheetId)}:batchUpdate`, 'POST', {
      requests,
    });
  }

  async listInventory(): Promise<InventoryRow[]> {
    const payload = await this.request<{ values?: string[][] }>(`${this.valuesUrl('A2:H')}?majorDimension=ROWS&valueRenderOption=FORMATTED_VALUE`);
    const rows = (payload.values || []).map((row, index): InventoryRow => ({
      rowNumber: index + 2,
      imei: digits(row[0]),
      iccid: digits(row[1]),
      status: normalizeStatus(row[2]),
      reservedAt: row[3] || '',
      usedAt: row[4] || '',
      batchId: row[5] || '',
      provenance: row[6] || '',
      notes: row[7] || '',
    }));
    const pairCounts = new Map<string, number>();
    for (const row of rows) pairCounts.set(`${row.imei}:${row.iccid}`, (pairCounts.get(`${row.imei}:${row.iccid}`) || 0) + 1);
    return rows.filter(row => isValidImei(row.imei) && isValidIccid(row.iccid) && pairCounts.get(`${row.imei}:${row.iccid}`) === 1);
  }

  async updateInventoryRows(rows: InventoryRow[]): Promise<void> {
    if (!rows.length) return;
    const data = rows.map(row => ({
      range: `${this.sheetName}!A${row.rowNumber}:H${row.rowNumber}`,
      majorDimension: 'ROWS',
      values: [[row.imei, row.iccid, row.status, row.reservedAt, row.usedAt, row.batchId, row.provenance, row.notes]],
    }));
    await this.request(`https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(this.spreadsheetId)}/values:batchUpdate`, 'POST', {
      valueInputOption: 'RAW',
      data,
    });
  }

  async appendInventory(row: Omit<InventoryRow, 'rowNumber'>): Promise<void> {
    const url = `${this.valuesUrl('A:H')}:append?valueInputOption=RAW&insertDataOption=INSERT_ROWS`;
    await this.request(url, 'POST', {
      majorDimension: 'ROWS',
      values: [[row.imei, row.iccid, row.status, row.reservedAt, row.usedAt, row.batchId, row.provenance, row.notes]],
    });
  }
}

function normalizeStatus(value: unknown): InventoryRow['status'] {
  const normalized = String(value || '').trim().toLowerCase();
  if (normalized === 'reserved') return 'Reserved';
  if (normalized === 'used') return 'Used';
  if (normalized === 'quarantined') return 'Quarantined';
  return 'Available';
}
