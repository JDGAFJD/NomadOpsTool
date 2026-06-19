import { getSetting } from '../db';

export interface Mailbox {
  id: number;
  name: string;
  email: string;
}

export interface FreeScoutUser {
  id: number;
  firstName?: string;
  lastName?: string;
  email?: string;
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
  private timeoutMs: number;
  
  // Hardcoded for MVP, user ID from the FreeScout docs
  private defaultUserId = 5; 

  constructor() {
    this.apiUrl = getSetting('freescout_api_url') || '';
    this.apiKey = getSetting('freescout_api_key') || '';
    const configuredTimeout = Number(process.env.FREESCOUT_API_TIMEOUT_MS);
    this.timeoutMs = Number.isFinite(configuredTimeout)
      ? Math.min(120000, Math.max(15000, configuredTimeout))
      : 60000;
  }

  private isConfigured(): boolean {
    return Boolean(this.apiUrl && this.apiKey);
  }

  // Exposed so the generic API route can use it if needed
  public async fetchApi(path: string, options: RequestInit = {}) {
    if (!this.isConfigured()) {
      throw new Error('FreeScout API is not configured.');
    }

    // Accept either the FreeScout origin or an API URL ending in /api.
    const trimmedBaseUrl = this.apiUrl.replace(/\/+$/, '');
    const safeBaseUrl = trimmedBaseUrl.endsWith('/api') ? trimmedBaseUrl.slice(0, -4) : trimmedBaseUrl;

    let res: Response;
    try {
      res = await fetch(`${safeBaseUrl}/api/${path}`, {
        ...options,
        headers: {
          'Content-Type': 'application/json',
          'X-FreeScout-API-Key': this.apiKey,
          'Accept': 'application/json',
          ...(options.headers || {}),
        },
        // Avoid caching real ticket requests for support workflows.
        cache: 'no-store',
        signal: options.signal || AbortSignal.timeout(this.timeoutMs),
      });
    } catch (error: any) {
      if (error?.name === 'TimeoutError' || error?.name === 'AbortError') {
        throw new Error(`FreeScout did not respond within ${Math.round(this.timeoutMs / 1000)} seconds.`);
      }
      throw error;
    }

    if (!res.ok) {
      const err = await res.text();
      throw new Error(`FreeScout API error: ${res.status} ${err}`);
    }

    // Create endpoints may return the new ID in a header with no JSON body.
    if (res.status === 204) return null;
    const text = await res.text();
    if (!text) {
      const resourceId = res.headers.get('Resource-ID');
      return resourceId ? { id: Number(resourceId) } : null;
    }
    return JSON.parse(text);
  }

  async getMailboxes(): Promise<Mailbox[]> {
    if (!this.isConfigured()) return [];
    
    const data = await this.fetchApi('mailboxes');
    return data._embedded?.mailboxes || [];
  }

  async findMailboxByName(name: string): Promise<Mailbox> {
    const mailboxes = await this.getMailboxes();
    const normalizedName = name.trim().toLowerCase();
    const mailbox = mailboxes.find(item => item.name?.trim().toLowerCase() === normalizedName);
    if (!mailbox) {
      throw new Error(`FreeScout mailbox "${name}" was not found.`);
    }
    return mailbox;
  }

  async findComplianceMailbox(): Promise<Mailbox> {
    const mailboxes = await this.getMailboxes();
    const normalize = (value: string | undefined) => value?.trim().toLowerCase() || '';
    const exactEmail = mailboxes.find(item => normalize(item.email) === 'compliance@nomadinternet.com');
    if (exactEmail) return exactEmail;

    const exactName = mailboxes.find(item => normalize(item.name) === 'nomad internet compliance');
    if (exactName) return exactName;

    const containing = mailboxes.filter(item => normalize(item.name).includes('compliance'));
    if (containing.length === 1) return containing[0];
    if (containing.length > 1) {
      throw new Error('Multiple FreeScout mailboxes contain "compliance". Configure a unique Compliance mailbox email or name.');
    }
    throw new Error('FreeScout Compliance mailbox was not found. Expected compliance@nomadinternet.com or Nomad Internet Compliance.');
  }

  async findUserByEmail(email: string): Promise<FreeScoutUser> {
    const normalizedEmail = email.trim().toLowerCase();
    const normalizedIdentity = normalizedEmail.split('@')[0].replace(/[^a-z0-9]/g, '');
    const users: FreeScoutUser[] = [];
    let page = 1;
    while (page <= 100) {
      const data = await this.fetchApi(`users?page=${page}&pageSize=100`);
      const pageUsers: FreeScoutUser[] = data?._embedded?.users || [];
      users.push(...pageUsers);
      const user = pageUsers.find(item => item.email?.trim().toLowerCase() === normalizedEmail);
      if (user) return user;
      const totalPages = Number(data?.page?.totalPages || page);
      if (page >= totalPages || pageUsers.length === 0) break;
      page += 1;
    }

    const identityMatches = users.filter(user => {
      const emailIdentity = user.email?.split('@')[0].toLowerCase().replace(/[^a-z0-9]/g, '') || '';
      const nameIdentity = `${user.firstName || ''}${user.lastName || ''}`.toLowerCase().replace(/[^a-z0-9]/g, '');
      return normalizedIdentity && (emailIdentity === normalizedIdentity || nameIdentity === normalizedIdentity);
    });
    if (identityMatches.length === 1) return identityMatches[0];
    if (identityMatches.length > 1) {
      throw new Error(`Multiple FreeScout agents match ${email}. Update the OPS agent email to match FreeScout exactly.`);
    }
    throw new Error(`No FreeScout agent matches ${email}.`);
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

  async addReply(ticketId: number, text: string, status?: string, userId = this.defaultUserId): Promise<void> {
    if (!this.isConfigured()) {
      throw new Error('FreeScout API is not configured.');
    }
    
    const payload: any = {
      type: 'message',
      text, // Must be text, not body
      user: userId
    };
    if (status) payload.status = status;

    await this.fetchApi(`conversations/${ticketId}/threads`, {
      method: 'POST',
      body: JSON.stringify(payload)
    });
  }

  async createConversation(
    mailboxId: number,
    customerEmail: string,
    subject: string,
    text: string,
    userId = this.defaultUserId,
    assigneeId?: number
  ): Promise<number> {
    if (!this.isConfigured()) {
      throw new Error('FreeScout API is not configured.');
    }

    const data = await this.fetchApi('conversations', {
      method: 'POST',
      body: JSON.stringify({
        type: 'email',
        mailboxId,
        subject,
        customer: { email: customerEmail },
        threads: [{
          type: 'message',
          text,
          user: userId,
        }],
        imported: false,
        status: 'active',
        ...(assigneeId ? { assignTo: assigneeId } : {}),
      }),
    });

    const conversationId = Number(data?.id || data?.conversation?.id);
    if (!conversationId) {
      throw new Error('FreeScout did not return a conversation ID.');
    }
    return conversationId;
  }

  async assignConversation(ticketId: number, mailboxId: number, assigneeId: number, byUserId: number): Promise<void> {
    await this.fetchApi(`conversations/${ticketId}`, {
      method: 'PUT',
      body: JSON.stringify({
        mailboxId,
        assignTo: assigneeId,
        byUser: byUserId,
      }),
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
