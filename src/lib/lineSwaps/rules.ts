import { ACTIVE_LIKE_SUBSCRIPTION_STATUSES, type ChargebeeEligibility, type NormalizedThingSpaceDevice } from './types';

type Subscription = { id?: string; customer_id?: string; status?: string };
type Invoice = { id?: string; status?: string; amount_due?: number; date?: number; created_at?: number };

export function evaluateChargebeeEligibility(
  subscriptions: Subscription[],
  invoicesBySubscription: Map<string, Invoice[]>,
): ChargebeeEligibility {
  if (subscriptions.length === 0) {
    return emptyEligibility('NO_SUBSCRIPTION', 0);
  }
  if (subscriptions.length !== 1) {
    return emptyEligibility('AMBIGUOUS_SUBSCRIPTIONS', subscriptions.length);
  }

  const subscription = subscriptions[0];
  const status = String(subscription.status || '').toLowerCase();
  if (!ACTIVE_LIKE_SUBSCRIPTION_STATUSES.has(status)) {
    return {
      ...emptyEligibility('SUBSCRIPTION_NOT_ACTIVE_LIKE', 1),
      subscriptionId: subscription.id || null,
      customerId: subscription.customer_id || null,
      subscriptionStatus: status || null,
    };
  }

  const invoices = [...(invoicesBySubscription.get(subscription.id || '') || [])]
    .sort((a, b) => Number(b.date || b.created_at || 0) - Number(a.date || a.created_at || 0));
  const invoice = invoices[0];
  if (!invoice) {
    return {
      ...emptyEligibility('NO_INVOICE', 1),
      subscriptionId: subscription.id || null,
      customerId: subscription.customer_id || null,
      subscriptionStatus: status,
    };
  }

  const amountDue = Number(invoice.amount_due || 0);
  const paid = String(invoice.status || '').toLowerCase() === 'paid' && amountDue === 0;
  return {
    eligible: paid,
    reasonCode: paid ? 'ELIGIBLE' : 'LATEST_INVOICE_NOT_PAID',
    subscriptionId: subscription.id || null,
    customerId: subscription.customer_id || null,
    subscriptionStatus: status,
    latestInvoiceId: invoice.id || null,
    latestInvoiceStatus: String(invoice.status || '').toLowerCase() || null,
    latestInvoiceAmountDue: amountDue,
    matchCount: 1,
  };
}
function emptyEligibility(reasonCode: string, matchCount: number): ChargebeeEligibility {
  return {
    eligible: false,
    reasonCode,
    subscriptionId: null,
    customerId: null,
    subscriptionStatus: null,
    latestInvoiceId: null,
    latestInvoiceStatus: null,
    latestInvoiceAmountDue: null,
    matchCount,
  };
}

export function isSourceCandidate(device: NormalizedThingSpaceDevice): boolean {
  return device.state === 'active'
    && device.customField5.toLowerCase() === 'contract ended'
    && !device.customField4.toLowerCase().startsWith('swapped')
    && Boolean(device.mdn && device.iccid && device.imei && device.plan);
}

export function isDestinationCandidate(device: NormalizedThingSpaceDevice, sourcePlan: string): boolean {
  return device.state === 'suspend'
    && device.customField5.toLowerCase() === 'contract active'
    && device.plan.trim() === sourcePlan.trim()
    && Boolean(device.mdn && device.iccid && device.imei);
}
