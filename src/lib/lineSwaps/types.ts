export const ACTIVE_LIKE_SUBSCRIPTION_STATUSES = new Set(['active', 'in_trial', 'paused', 'future']);

export type SwapItemStatus =
  | 'blocked'
  | 'reserved'
  | 'parking'
  | 'restoring'
  | 'replacing'
  | 'verifying'
  | 'completed'
  | 'completed_with_warning'
  | 'quarantined'
  | 'failed';

export type SwapBatchStatus = 'preview' | 'running' | 'completed' | 'completed_with_failures' | 'failed';

export type NormalizedThingSpaceDevice = {
  internalId: number;
  mdn: string;
  iccid: string;
  imei: string;
  state: string;
  plan: string;
  customField4: string;
  customField5: string;
  raw?: unknown;
};

export type ChargebeeEligibility = {
  eligible: boolean;
  reasonCode: string;
  subscriptionId: string | null;
  customerId: string | null;
  subscriptionStatus: string | null;
  latestInvoiceId: string | null;
  latestInvoiceStatus: string | null;
  latestInvoiceAmountDue: number | null;
  matchCount: number;
};

export type InventoryRow = {
  rowNumber: number;
  imei: string;
  iccid: string;
  status: 'Available' | 'Reserved' | 'Used' | 'Quarantined';
  reservedAt: string;
  usedAt: string;
  batchId: string;
  provenance: string;
  notes: string;
};

export function digits(value: unknown): string {
  return String(value ?? '').replace(/\D/g, '');
}
export function maskIdentifier(value: string): string {
  const normalized = digits(value);
  return normalized ? `••••${normalized.slice(-4)}` : 'missing';
}

export function isValidImei(value: string): boolean {
  return /^99\d{13}$/.test(digits(value));
}

export function isValidIccid(value: string): boolean {
  return /^89148\d{15}$/.test(digits(value));
}
