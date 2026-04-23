import { getSetting } from '../db';

export interface Mailbox {
  id: number;
  name: string;
  email: string;
}

export interface Ticket {
  id: number;
  number: string;
  subject: string;
  status: string | number;
  customer: {
    firstNames?: string;
    firstName?: string;
    lastName: string;
    email: string;
  };
  assignee?: {
    id: number;
    firstName: string;
    lastName: string;
  };
}

export interface Thread {
  id: number;
  type: 'message' | 'customer' | 'note' | 'forward' | string;
  body?: string;
  text?: string; 
  createdAt: string;
  createdBy: {
    id: number;
    firstName: string;
    lastName: string;
    email: string;
  };
}

export class FreeScoutService {
  private apiUrl: string;
  private apiKey: string;
  
  // Hardcoded for MVP, user ID from the FreeScout docs
  private defaultUserId = 5; 

  constructor() {
    this.apiUrl = getSetting('freescout_api_url') || '';
    this.apiKey = getSetting('freescout_api_key') || '';
  }

  private isConfigured(): boolean {
    return Boolean(this.apiUrl && this.apiKey);
  }

  // Exposed so the generic API route can use it if needed
  public async fetchApi(path: string, options: RequestInit = {}) {
    if (!this.isConfigured()) {
      throw new Error('FreeScout API is not configured.');
    }

    // Ensure we don't end up with /api//mailboxes
    const safeBaseUrl = this.apiUrl.endsWith('/') ? this.apiUrl.slice(0, -1) : this.apiUrl;

    const res = await fetch(`${safeBaseUrl}/api/${path}`, {
      ...options,
      headers: {
        'Content-Type': 'application/json',
        'X-FreeScout-API-Key': this.apiKey,
        'Accept': 'application/json',
        ...(options.headers || {}),
      },
      // Avoid caching real ticket requests for support workflows
      cache: 'no-store',
    });

    if (!res.ok) {
      const err = await res.text();
      throw new Error(`FreeScout API error: ${res.status} ${err}`);
    }

    // 204 No Content won't have JSON body
    if (res.status === 204) return null;

    return res.json();
  }

  async getMailboxes(): Promise<Mailbox[]> {
    if (!this.isConfigured()) return [];
    
    const data = await this.fetchApi('mailboxes');
    return data._embedded?.mailboxes || [];
  }

  /**
   * Fetches ONE open ticket from a specific mailbox.
   */
  async getNextOpenTicket(mailboxId: number): Promise<Ticket | null> {
    if (!this.isConfigured()) return null;

    // Searching active tickets in specific mailbox
    const data = await this.fetchApi(`conversations?status=active&mailboxId=${mailboxId}&page=1`);
    const tickets = data._embedded?.conversations || [];

    if (tickets.length === 0) return null;
    
    // Normalize customer name from different API variations
    const t = tickets[0];
    if (t.customer && !t.customer.firstNames && t.customer.firstName) {
       t.customer.firstNames = t.customer.firstName;
    }
    
    return t;
  }

  /**
   * Fetches the embedded threads directly from the conversation GET 
   * as per API best practices.
   */
  async getTicketThreads(ticketId: number): Promise<Thread[]> {
    if (!this.isConfigured()) return [];

    const data = await this.fetchApi(`conversations/${ticketId}`);
    
    // Threads can contain 'body' but post requests use 'text'
    return data._embedded?.threads || [];
  }

  async addReply(ticketId: number, text: string, status?: string): Promise<void> {
    if (!this.isConfigured()) return;
    
    const payload: any = {
      type: 'message',
      text, // Must be text, not body
      user: this.defaultUserId
    };
    if (status) payload.status = status;

    await this.fetchApi(`conversations/${ticketId}/threads`, {
      method: 'POST',
      body: JSON.stringify(payload)
    });
  }

  async addNote(ticketId: number, text: string): Promise<void> {
    if (!this.isConfigured()) return;
    
    await this.fetchApi(`conversations/${ticketId}/threads`, {
      method: 'POST',
      body: JSON.stringify({
        type: 'note',
        text, // Must be text, not body
        user: this.defaultUserId
      })
    });
  }

  async updateTicketStatus(ticketId: number, status: string): Promise<void> {
    if (!this.isConfigured()) return;

    await this.fetchApi(`conversations/${ticketId}`, {
      method: 'PUT',
      body: JSON.stringify({
        status,
        byUser: this.defaultUserId
      })
    });
  }
}
