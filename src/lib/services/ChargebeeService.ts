import { getSetting } from '../db';

type ChargebeeSubscriptionLookup = {
  id?: string;
  customer_id?: string;
  status?: string;
  [key: string]: unknown;
};

type ChargebeeListItem<T> = {
  subscription?: T;
  invoice?: T;
  comment?: T;
  transaction?: T;
  credit_note?: T;
};

const RETURN_LOOKUP_SUBSCRIPTION_STATUSES = ['active', 'in_trial', 'paused', 'future'];

export class ChargebeeService {
  private site: string;
  private apiKey: string;
  private baseUrl: string;

  constructor() {
    this.site = getSetting('chargebee_site') || '';
    this.apiKey = getSetting('chargebee_api_key') || '';
    this.baseUrl = this.site ? `https://${this.site}.chargebee.com/api/v2` : '';
  }

  private isConfigured(): boolean {
    return Boolean(this.site && this.apiKey);
  }

  private async fetchApi(path: string, options: RequestInit = {}) {
    if (!this.isConfigured()) return null;

    const authHeader = 'Basic ' + Buffer.from(`${this.apiKey}:`).toString('base64');
    
    const url = path.startsWith('http') ? path : `${this.baseUrl}${path.startsWith('/') ? path : '/' + path}`;

    const res = await fetch(url, {
      ...options,
      headers: {
        'Authorization': authHeader,
        'Accept': 'application/json',
        ...(options.headers || {}),
      },
      cache: 'no-store',
      signal: options.signal || AbortSignal.timeout(15000),
    });

    if (!res.ok) {
      if (res.status === 404) return null;
      const errText = await res.text();
      console.warn(`Chargebee API Error [${res.status}]: ${errText}`);
      return null;
    }

    return res.json();
  }

  async findSubscriptionByImei(imei: string) {
    if (!this.isConfigured() || !imei) return { configured: false, matches: [] };

    const customFieldCandidates = [
      'cf_IMEI',
      'cf_imei',
      'cf_Device_IMEI',
      'cf_device_imei',
      'cf_router_imei',
      'cf_modem_imei',
    ];
    const matches = new Map<string, ChargebeeSubscriptionLookup>();
    const statusFilter = `status[in]=${encodeURIComponent(RETURN_LOOKUP_SUBSCRIPTION_STATUSES.join(','))}`;

    for (const field of customFieldCandidates) {
      const data = await this.fetchApi(`/subscriptions?${field}[is]=${encodeURIComponent(imei)}&${statusFilter}&limit=10`);
      for (const item of data?.list || []) {
        if (item.subscription?.id) {
          matches.set(item.subscription.id, item.subscription);
        }
      }
    }

    const hydrated = [];
    for (const subscription of matches.values()) {
      const customerId = subscription.customer_id;
      const customerData = customerId ? await this.fetchApi(`/customers/${encodeURIComponent(customerId)}`) : null;
      const customer = customerData?.customer || null;
      hydrated.push({
        subscription,
        customer,
        customerName: customer ? [customer.first_name, customer.last_name].filter(Boolean).join(' ') : null,
        customerEmail: customer?.email || null,
      });
    }

    return { configured: true, matches: hydrated };
  }

  async getSubscriptionWithCustomer(subscriptionId: string) {
    if (!this.isConfigured() || !subscriptionId) return { configured: false, match: null };

    const data = await this.fetchApi(`/subscriptions/${encodeURIComponent(subscriptionId)}`);
    const subscription = data?.subscription || null;
    if (!subscription) return { configured: true, match: null };

    const customerData = subscription.customer_id
      ? await this.fetchApi(`/customers/${encodeURIComponent(subscription.customer_id)}`)
      : null;
    const customer = customerData?.customer || null;

    return {
      configured: true,
      match: {
        subscription,
        customer,
        customerName: customer ? [customer.first_name, customer.last_name].filter(Boolean).join(' ') : null,
        customerEmail: customer?.email || null,
      },
    };
  }

  async addSubscriptionComment(subscriptionId: string, notes: string) {
    if (!this.isConfigured()) return { success: false, error: 'Not configured' };

    const res = await this.fetchApi('/comments', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: [
        `entity_type=${encodeURIComponent('subscription')}`,
        `entity_id=${encodeURIComponent(subscriptionId)}`,
        `notes=${encodeURIComponent(notes)}`,
      ].join('&'),
    });

    if (!res || res.error_code) {
      return { success: false, error: res?.message || 'Failed to add Chargebee comment' };
    }

    return { success: true, comment: res.comment };
  }

  async cancelSubscriptionNow(subscriptionId: string, reasonCode: string) {
    if (!this.isConfigured()) return { success: false, error: 'Not configured' };

    const body = [
      'end_of_term=false',
      reasonCode ? `cancel_reason_code=${encodeURIComponent(reasonCode)}` : '',
    ].filter(Boolean).join('&');

    const res = await this.fetchApi(`/subscriptions/${encodeURIComponent(subscriptionId)}/cancel_for_items`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body,
    });

    if (!res || res.error_code) {
      return { success: false, error: res?.message || 'Failed to cancel Chargebee subscription' };
    }

    return { success: true, subscription: res.subscription };
  }

  async writeOffOpenInvoices(customerId: string, subscriptionId: string, comment: string) {
    if (!this.isConfigured()) return { success: false, error: 'Not configured', writtenOff: [] };

    const invoices = await this.getInvoices(customerId, subscriptionId);
    const writeOffStatuses = new Set(['payment_due', 'posted', 'not_paid']);
    const targets = invoices.filter((invoice: { status?: string; id?: string; amount_due?: number }) =>
      invoice.id && writeOffStatuses.has(invoice.status || '') && (invoice.amount_due || 0) > 0
    );
    const writtenOff = [];
    const failed = [];

    for (const invoice of targets) {
      const res = await this.fetchApi(`/invoices/${encodeURIComponent(invoice.id || '')}/write_off`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: `comment=${encodeURIComponent(comment.slice(0, 300))}`,
      });

      if (res?.invoice) {
        writtenOff.push(res.invoice);
      } else {
        failed.push(invoice.id);
      }
    }

    return { success: failed.length === 0, writtenOff, failed };
  }

  /**
   * Fetches customer accounts and their subscriptions using the ticket requestor's email
   */
  async getCustomerData(email: string) {
    if (!this.isConfigured() || !email) return { configured: false, customers: [] };

    // 1. Get Customers matching Email
    const customersData = await this.fetchApi(`/customers?email[is]=${encodeURIComponent(email)}&limit=100`);
    if (!customersData || !customersData.list || customersData.list.length === 0) {
      return { configured: true, customers: [] };
    }

    const compiledCustomers = [];

    // 2. Fetch Subscriptions for each customer ID
    for (const item of customersData.list) {
      const cust = item.customer;
      
      const subsData = await this.fetchApi(`/subscriptions?customer_id[is]=${cust.id}&limit=50&sort_by[desc]=created_at`);
      const subscriptions = (subsData?.list || []).map((subItem: ChargebeeListItem<unknown>) => subItem.subscription);
      
      compiledCustomers.push({
        id: cust.id,
        firstName: cust.first_name,
        lastName: cust.last_name,
        email: cust.email,
        phone: cust.phone,
        subscriptions: subscriptions
      });
    }

    return {
      configured: true,
      customers: compiledCustomers
    };
  }

  async getInvoices(customerId: string, subscriptionId?: string) {
    if (!this.isConfigured()) return [];
    
    // Sort descending by date so newest invoices are first
    let path = `/invoices?customer_id[is]=${encodeURIComponent(customerId)}&limit=10&sort_by[desc]=date`;
    if (subscriptionId) {
      path += `&subscription_id[is]=${encodeURIComponent(subscriptionId)}`;
    }
    
    const data = await this.fetchApi(path);
    return (data?.list || []).map((item: ChargebeeListItem<unknown>) => item.invoice);
  }

  async getInvoice(invoiceId: string) {
    if (!this.isConfigured() || !invoiceId) return null;
    const data = await this.fetchApi(`/invoices/${encodeURIComponent(invoiceId)}`);
    return data?.invoice || null;
  }

  async generatePaymentLink(customerId: string) {
    if (!this.isConfigured()) return { url: null, error: 'Not configured' };

    const res = await this.fetchApi(`/hosted_pages/collect_now`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded'
      },
      body: `customer[id]=${encodeURIComponent(customerId)}`
    });

    if (!res || !res.hosted_page) {
       return { url: null, error: 'Failed to generate link' };
    }

    return { url: res.hosted_page.url };
  }

  async generateUpdatePaymentMethodLink(customerId: string) {
    if (!this.isConfigured()) return { url: null, error: 'Not configured' };

    const res = await this.fetchApi(`/hosted_pages/manage_payment_sources`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded'
      },
      body: `customer[id]=${encodeURIComponent(customerId)}`
    });

    if (!res || !res.hosted_page) {
       return { url: null, error: 'Failed to generate link' };
    }

    return { url: res.hosted_page.url };
  }

  async addPromotionalCredit(customerId: string, amountInCents: number, description: string) {
    if (!this.isConfigured()) return { success: false, error: 'Not configured' };

    const res = await this.fetchApi(`/customers/${encodeURIComponent(customerId)}/add_promotional_credits`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded'
      },
      body: `amount=${amountInCents}&description=${encodeURIComponent(description)}`
    });

    if (!res || res.error_code) {
       return { success: false, error: res?.message || 'Failed to add credit' };
    }

    return { success: true, promotional_credit: res.promotional_credit };
  }

  async updateSubscriptionPlan(subscriptionId: string, planId: string) {
    if (!this.isConfigured()) return { success: false, error: 'Not configured' };

    const res = await this.fetchApi(`/subscriptions/${encodeURIComponent(subscriptionId)}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded'
      },
      body: `plan_id=${encodeURIComponent(planId)}`
    });

    if (!res || res.error_code) {
       return { success: false, error: res?.message || 'Failed to update plan' };
    }

    return { success: true, subscription: res.subscription };
  }

  async getFinancialHistory(customerId: string, subscriptionId: string) {
    if (!this.isConfigured()) return null;

    const [commentsReq, transactionsReq, creditNotesReq, invoicesData] = await Promise.all([
      this.fetchApi(`/comments?entity_type[is]=subscription&entity_id[is]=${encodeURIComponent(subscriptionId)}`),
      this.fetchApi(`/transactions?customer_id[is]=${encodeURIComponent(customerId)}&limit=25`),
      this.fetchApi(`/credit_notes?customer_id[is]=${encodeURIComponent(customerId)}&limit=25`),
      this.getInvoices(customerId, subscriptionId)
    ]);

    return {
      success: true,
      comments: (commentsReq?.list || []).map((c: ChargebeeListItem<unknown>) => c.comment),
      transactions: (transactionsReq?.list || []).map((t: ChargebeeListItem<unknown>) => t.transaction),
      creditNotes: (creditNotesReq?.list || []).map((cn: ChargebeeListItem<unknown>) => cn.credit_note),
      invoices: invoicesData || []
    };
  }
}
