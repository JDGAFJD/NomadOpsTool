export const COLLECTION_VIEWS = ['unassigned', 'mine', 'all', 'due', 'closed', 'collected'] as const;
export const COLLECTION_SORTS = ['oldest', 'newest'] as const;
export const COLLECTION_SUCCESS_SCOPES = ['mine', 'all'] as const;
export const COLLECTION_SUCCESS_VERIFICATIONS = ['all', 'verified', 'not_verified', 'needs_explanation'] as const;
const COLLECTION_STATUSES = ['all','unassigned','assigned','follow_up_pending','awaiting_payment_confirmation','paused','collected','exhausted','canceled','no_valid_contact','completed_by_admin','closed_by_admin'] as const;
const COLLECTION_ATTEMPTS = ['all','0','1','2','3'] as const;
const COLLECTION_VERIFICATIONS = ['all','pending','verified','unverified','outcome_mismatch','mapping_required','needs_review','not_tracked'] as const;

export type CollectionSavedViewConfig = {
  view: typeof COLLECTION_VIEWS[number];
  successScope: typeof COLLECTION_SUCCESS_SCOPES[number];
  successVerification: typeof COLLECTION_SUCCESS_VERIFICATIONS[number];
  search: string;
  status: string;
  owner: string;
  sort: typeof COLLECTION_SORTS[number];
  attempt: string;
  verification: string;
  minAmount: string;
  maxAmount: string;
  from: string;
  to: string;
};

function oneOf<T extends readonly string[]>(value: unknown, allowed: T, fallback: T[number]) {
  return allowed.includes(String(value) as T[number]) ? String(value) as T[number] : fallback;
}

function shortText(value: unknown, max = 160) {
  return String(value || '').trim().slice(0, max);
}

function dateText(value: unknown) {
  const text = shortText(value, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(text) ? text : '';
}

function amountText(value: unknown) {
  const text = shortText(value, 30);
  return /^\d+(?:\.\d{1,2})?$/.test(text) ? text : '';
}

export function sanitizeCollectionSavedViewConfig(value: unknown): CollectionSavedViewConfig {
  const config = value && typeof value === 'object' ? value as Record<string, unknown> : {};
  return {
    view: oneOf(config.view, COLLECTION_VIEWS, 'unassigned'),
    successScope: oneOf(config.successScope, COLLECTION_SUCCESS_SCOPES, 'mine'),
    successVerification: oneOf(config.successVerification, COLLECTION_SUCCESS_VERIFICATIONS, 'all'),
    search: shortText(config.search),
    status: oneOf(config.status, COLLECTION_STATUSES, 'all'),
    owner: shortText(config.owner) || 'all',
    sort: oneOf(config.sort, COLLECTION_SORTS, 'oldest'),
    attempt: oneOf(config.attempt, COLLECTION_ATTEMPTS, 'all'),
    verification: oneOf(config.verification, COLLECTION_VERIFICATIONS, 'all'),
    minAmount: amountText(config.minAmount),
    maxAmount: amountText(config.maxAmount),
    from: dateText(config.from),
    to: dateText(config.to),
  };
}
