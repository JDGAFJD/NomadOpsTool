#!/usr/bin/env node

import path from 'node:path';
import Database from 'better-sqlite3';

const DEFAULT_ASSIGNEE_NAME = 'Bryan Fury';
const DEFAULT_PAGE_SIZE = 100;

function parseArgs(argv) {
  const args = {
    assigneeName: DEFAULT_ASSIGNEE_NAME,
    assigneeId: null,
    byUserId: null,
    apiUrl: process.env.FREESCOUT_API_URL || '',
    apiKey: process.env.FREESCOUT_API_KEY || '',
    settingsDb: process.env.SETTINGS_DB_PATH || path.join(process.cwd(), '.data', 'settings.db'),
    pageSize: DEFAULT_PAGE_SIZE,
    limit: null,
    timeoutMs: Number(process.env.FREESCOUT_TIMEOUT_MS || 30000),
    execute: false,
    help: false,
  };

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    const next = () => {
      const value = argv[i + 1];
      if (!value || value.startsWith('--')) {
        throw new Error(`${arg} requires a value`);
      }
      i += 1;
      return value;
    };

    switch (arg) {
      case '--execute':
        args.execute = true;
        break;
      case '--dry-run':
        args.execute = false;
        break;
      case '--assignee':
        args.assigneeName = next();
        break;
      case '--assignee-id':
        args.assigneeId = Number(next());
        break;
      case '--by-user-id':
        args.byUserId = Number(next());
        break;
      case '--api-url':
        args.apiUrl = next();
        break;
      case '--api-key':
        args.apiKey = next();
        break;
      case '--settings-db':
        args.settingsDb = next();
        break;
      case '--page-size':
        args.pageSize = Number(next());
        break;
      case '--limit':
        args.limit = Number(next());
        break;
      case '--timeout-ms':
        args.timeoutMs = Number(next());
        break;
      case '--help':
      case '-h':
        args.help = true;
        break;
      default:
        throw new Error(`Unknown argument: ${arg}`);
    }
  }

  if (!Number.isInteger(args.pageSize) || args.pageSize < 1 || args.pageSize > 100) {
    throw new Error('--page-size must be an integer between 1 and 100');
  }

  if (args.limit !== null && (!Number.isInteger(args.limit) || args.limit < 1)) {
    throw new Error('--limit must be a positive integer');
  }

  if (args.assigneeId !== null && !Number.isInteger(args.assigneeId)) {
    throw new Error('--assignee-id must be an integer');
  }

  if (args.byUserId !== null && !Number.isInteger(args.byUserId)) {
    throw new Error('--by-user-id must be an integer');
  }

  if (!Number.isInteger(args.timeoutMs) || args.timeoutMs < 1000) {
    throw new Error('--timeout-ms must be an integer of at least 1000');
  }

  return args;
}

function printHelp() {
  console.log(`
Close all pending FreeScout tickets assigned to Bryan Fury.

Usage:
  node scripts/close-bryan-pending-tickets.mjs [options]

Defaults to a dry run. Add --execute to close tickets.

Options:
  --execute                 Actually close matching tickets
  --dry-run                 List matches without changing them
  --assignee "Bryan Fury"   Assignee name to look up
  --assignee-id 5           Skip name lookup and use this FreeScout user ID
  --by-user-id 5            User ID recorded as the closer; defaults to assignee ID
  --api-url URL             FreeScout base URL; otherwise FREESCOUT_API_URL/settings DB
  --api-key KEY             FreeScout API key; otherwise FREESCOUT_API_KEY/settings DB
  --settings-db PATH        Settings DB path; defaults to ./.data/settings.db
  --page-size 100           API page size, 1-100
  --limit 25                Close/list at most this many tickets
  --timeout-ms 30000        Timeout for each FreeScout API request
  --help                    Show this help

Examples:
  node scripts/close-bryan-pending-tickets.mjs
  node scripts/close-bryan-pending-tickets.mjs --execute
`);
}

function readSettings(settingsDb) {
  try {
    const db = new Database(settingsDb, { readonly: true, fileMustExist: true });
    const rows = db.prepare('SELECT key, value FROM settings').all();
    db.close();
    return Object.fromEntries(rows.map((row) => [row.key, row.value]));
  } catch {
    return {};
  }
}

function normalizeBaseUrl(url) {
  return url.endsWith('/') ? url.slice(0, -1) : url;
}

function fullName(user) {
  return [user.firstName, user.lastName].filter(Boolean).join(' ').trim();
}

function ticketAssigneeName(ticket) {
  return ticket.assignee ? fullName(ticket.assignee) : '';
}

function ticketNumber(ticket) {
  return ticket.number ? `#${ticket.number}` : `id:${ticket.id}`;
}

class FreeScoutClient {
  constructor(apiUrl, apiKey, timeoutMs) {
    this.apiUrl = normalizeBaseUrl(apiUrl);
    this.apiKey = apiKey;
    this.timeoutMs = timeoutMs;
  }

  async request(apiPath, options = {}) {
    let response;

    try {
      response = await fetch(`${this.apiUrl}/api/${apiPath}`, {
        ...options,
        signal: AbortSignal.timeout(this.timeoutMs),
        headers: {
          Accept: 'application/json',
          'Content-Type': 'application/json',
          'X-FreeScout-API-Key': this.apiKey,
          ...(options.headers || {}),
        },
      });
    } catch (error) {
      if (error.name === 'TimeoutError' || error.name === 'AbortError') {
        throw new Error(`FreeScout API request timed out after ${this.timeoutMs}ms: ${apiPath}`);
      }
      throw error;
    }

    if (!response.ok) {
      const body = await response.text();
      throw new Error(`FreeScout API error ${response.status}: ${body}`);
    }

    if (response.status === 204) return null;
    return response.json();
  }

  async listUsers(page, pageSize) {
    const params = new URLSearchParams({ page: String(page), pageSize: String(pageSize) });
    const data = await this.request(`users?${params}`);
    return {
      users: data._embedded?.users || [],
      page: data.page || {},
    };
  }

  async listPendingAssignedTickets(assignedTo, page, pageSize) {
    const params = new URLSearchParams({
      status: 'pending',
      assignedTo: String(assignedTo),
      page: String(page),
      pageSize: String(pageSize),
    });

    const data = await this.request(`conversations?${params}`);
    return {
      tickets: data._embedded?.conversations || [],
      page: data.page || {},
    };
  }

  async closeTicket(ticketId, byUserId) {
    await this.request(`conversations/${ticketId}`, {
      method: 'PUT',
      body: JSON.stringify({
        byUser: byUserId,
        status: 'closed',
      }),
    });
  }
}

async function findUserId(client, assigneeName, pageSize) {
  const matches = [];
  let page = 1;

  while (true) {
    const result = await client.listUsers(page, pageSize);
    for (const user of result.users) {
      if (fullName(user).toLowerCase() === assigneeName.toLowerCase()) {
        matches.push(user);
      }
    }

    const totalPages = result.page.totalPages || page;
    if (page >= totalPages || result.users.length === 0) break;
    page += 1;
  }

  if (matches.length === 0) {
    throw new Error(`Could not find a FreeScout user named "${assigneeName}"`);
  }

  if (matches.length > 1) {
    const ids = matches.map((user) => `${fullName(user)} (id ${user.id})`).join(', ');
    throw new Error(`Multiple users matched "${assigneeName}": ${ids}. Re-run with --assignee-id.`);
  }

  return matches[0].id;
}

async function collectTickets(client, assigneeId, assigneeName, pageSize, limit) {
  const tickets = [];
  let page = 1;

  while (true) {
    const result = await client.listPendingAssignedTickets(assigneeId, page, pageSize);
    const exactMatches = result.tickets.filter((ticket) => {
      const name = ticketAssigneeName(ticket);
      return !name || name.toLowerCase() === assigneeName.toLowerCase();
    });

    tickets.push(...exactMatches);

    if (limit !== null && tickets.length >= limit) {
      return tickets.slice(0, limit);
    }

    const totalPages = result.page.totalPages || page;
    if (page >= totalPages || result.tickets.length === 0) break;
    page += 1;
  }

  return tickets;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    printHelp();
    return;
  }

  const settings = readSettings(args.settingsDb);
  const apiUrl = args.apiUrl || settings.freescout_api_url;
  const apiKey = args.apiKey || settings.freescout_api_key;

  if (!apiUrl || !apiKey) {
    throw new Error('FreeScout API config missing. Set FREESCOUT_API_URL/FREESCOUT_API_KEY or provide --api-url/--api-key.');
  }

  const client = new FreeScoutClient(apiUrl, apiKey, args.timeoutMs);
  const assigneeId = args.assigneeId || await findUserId(client, args.assigneeName, args.pageSize);
  const byUserId = args.byUserId || assigneeId;
  const tickets = await collectTickets(client, assigneeId, args.assigneeName, args.pageSize, args.limit);

  console.log(`Found ${tickets.length} pending ticket(s) assigned to ${args.assigneeName} (user ${assigneeId}).`);

  if (tickets.length === 0) return;

  for (const ticket of tickets) {
    const label = `${ticketNumber(ticket)} ${ticket.subject || '(no subject)'}`;
    if (!args.execute) {
      console.log(`[dry-run] Would close ${label}`);
      continue;
    }

    await client.closeTicket(ticket.id, byUserId);
    console.log(`[closed] ${label}`);
  }

  if (!args.execute) {
    console.log('Dry run complete. Re-run with --execute to close these tickets.');
  }
}

main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
