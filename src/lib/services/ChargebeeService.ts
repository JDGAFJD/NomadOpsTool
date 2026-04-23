import { getSetting } from '../db';

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
      cache: 'no-store'
    });

    if (!res.ok) {
      if (res.status === 404) return null;
      const errText = await res.text();
      console.warn(`Chargebee API Error [${res.status}]: ${errText}`);
      return null;
    }

    return res.json();
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
      const subscriptions = (subsData?.list || []).map((subItem: any) => subItem.subscription);
      
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
    return (data?.list || []).map((item: any) => item.invoice);
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
      comments: (commentsReq?.list || []).map((c: any) => c.comment),
      transactions: (transactionsReq?.list || []).map((t: any) => t.transaction),
      creditNotes: (creditNotesReq?.list || []).map((cn: any) => cn.credit_note),
      invoices: invoicesData || []
    };
  }
}
