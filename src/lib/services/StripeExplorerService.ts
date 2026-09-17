import Stripe from 'stripe';

type StripeClientEntry = {
  id: string;
  label: string;
  mode: 'live' | 'test';
  client: Stripe;
};

const STRIPE_API_VERSION = '2026-07-29.dahlia' as Stripe.LatestApiVersion;

function decodeBase64UrlJson(value: string) {
  const normalized = value.replace(/-/g, '+').replace(/_/g, '/');
  const padded = normalized + '='.repeat((4 - normalized.length % 4) % 4);
  return JSON.parse(Buffer.from(padded, 'base64').toString('utf8'));
}

function stripeClient(secretKey: string) {
  return new Stripe(secretKey, { apiVersion: STRIPE_API_VERSION });
}

function configuredStripeClients(): StripeClientEntry[] {
  const entries: StripeClientEntry[] = [];
  const seen = new Set<string>();

  const addKey = (id: string, label: string, secretKey?: string | null) => {
    const key = secretKey?.trim();
    if (!key || seen.has(key)) return;
    if (!key.startsWith('sk_') && !key.startsWith('rk_')) return;
    seen.add(key);
    entries.push({
      id,
      label,
      mode: key.startsWith('sk_live_') || key.startsWith('rk_live_') ? 'live' : 'test',
      client: stripeClient(key),
    });
  };

  for (const [name, value] of Object.entries(process.env)) {
    if (/^STRIPE_SECRET_KEY(?:_[A-Z0-9]+)?$/.test(name)) {
      addKey(name, name === 'STRIPE_SECRET_KEY' ? 'Configured Stripe key' : `Configured Stripe key ${name.replace('STRIPE_SECRET_KEY_', '')}`, value);
    }
  }

  for (const [name, value] of Object.entries(process.env)) {
    if (!/^N8N_VALIDATED_CREDENTIAL_STRIPEAPI_.*_B64URL$/.test(name) || !value) continue;
    try {
      const credential = decodeBase64UrlJson(value);
      addKey(name, credential?.name || 'Imported Stripe credential', credential?.data?.secretKey);
    } catch {
      // Ignore malformed legacy credential blobs; other configured keys may still work.
    }
  }

  return entries;
}

function stripeSearchString(value: string) {
  return value.replace(/\\/g, '\\\\').replace(/'/g, "\\'");
}

function withExplorerMeta<T extends Stripe.Customer | Stripe.Invoice | Stripe.Charge>(
  item: T,
  entry: StripeClientEntry,
) {
  return {
    ...item,
    stripeExplorerSource: {
      id: entry.id,
      label: entry.label,
      mode: entry.mode,
    },
  };
}

export class StripeExplorerService {
  private readonly entries = configuredStripeClients();

  isConfigured() {
    return this.entries.length > 0;
  }

  async testConnections() {
    return Promise.all(this.entries.map(async entry => {
      await entry.client.balance.retrieve();
      return {
        source: entry.id,
        label: entry.label,
        mode: entry.mode,
        ok: true,
      };
    }));
  }

  async searchCustomersByEmail(email: string) {
    const trimmed = email.trim();
    if (!trimmed) return [];
    const query = `email:'${stripeSearchString(trimmed)}'`;
    const results = await Promise.all(this.entries.map(async entry => {
      try {
        const searched = await entry.client.customers.search({ query, limit: 100 });
        if (searched.data.length > 0) return searched.data.map(customer => withExplorerMeta(customer, entry));

        // Search can lag on newly-created customers. Keep an exact-email list fallback.
        const listed = await entry.client.customers.list({ email: trimmed, limit: 100 });
        return listed.data.map(customer => withExplorerMeta(customer, entry));
      } catch (error) {
        console.warn(`Stripe customer search failed for ${entry.label}:`, error instanceof Error ? error.message : error);
        return [];
      }
    }));
    return results.flat();
  }

  async listInvoices(customerId: string, limit = 100) {
    const results = await Promise.all(this.entries.map(async entry => {
      try {
        const invoices = await entry.client.invoices.list({
          customer: customerId,
          limit: Math.min(Math.max(limit, 1), 100),
        });
        return invoices.data.map(invoice => withExplorerMeta(invoice, entry));
      } catch (error: any) {
        if (error?.code === 'resource_missing') return [];
        console.warn(`Stripe invoice lookup failed for ${entry.label}:`, error?.message || error);
        return [];
      }
    }));
    return results.flat();
  }

  async listCharges(customerId: string, limit = 100) {
    const results = await Promise.all(this.entries.map(async entry => {
      try {
        const charges = await entry.client.charges.list({
          customer: customerId,
          limit: Math.min(Math.max(limit, 1), 100),
        });
        return charges.data.map(charge => withExplorerMeta(charge, entry));
      } catch (error: any) {
        if (error?.code === 'resource_missing') return [];
        console.warn(`Stripe charge lookup failed for ${entry.label}:`, error?.message || error);
        return [];
      }
    }));
    return results.flat();
  }
}
