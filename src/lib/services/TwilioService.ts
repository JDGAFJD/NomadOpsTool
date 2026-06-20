import { getSetting } from '@/lib/db';

export type TwilioCall = {
  sid: string;
  status: string;
  direction: string;
  from: string;
  to: string;
  startTime: string | null;
  endTime: string | null;
  duration: number;
};

function dateParam(date: Date) {
  return date.toISOString().slice(0, 10);
}

export class TwilioService {
  private accountSid = getSetting('twilio_account_sid') || '';
  private apiKeySid = getSetting('twilio_api_key_sid') || '';
  private apiKeySecret = getSetting('twilio_api_key_secret') || '';

  isConfigured() {
    return Boolean(this.accountSid && this.apiKeySid && this.apiKeySecret);
  }

  async listCalls(from: Date, to: Date): Promise<TwilioCall[]> {
    if (!this.isConfigured()) throw new Error('Twilio call verification is not configured.');
    const calls: TwilioCall[] = [];
    let path = `/2010-04-01/Accounts/${encodeURIComponent(this.accountSid)}/Calls.json?PageSize=1000&StartTime%3E=${dateParam(from)}&StartTime%3C=${dateParam(to)}`;
    let page = 0;

    while (path && page < 10) {
      const response = await fetch(`https://api.twilio.com${path}`, {
        headers: {
          Authorization: `Basic ${Buffer.from(`${this.apiKeySid}:${this.apiKeySecret}`).toString('base64')}`,
          Accept: 'application/json',
        },
        cache: 'no-store',
        signal: AbortSignal.timeout(30000),
      });
      if (!response.ok) {
        const detail = await response.text();
        throw new Error(`Twilio API error: ${response.status} ${detail.slice(0, 300)}`);
      }
      const data = await response.json();
      for (const call of data.calls || []) {
        const startTime = call.start_time || call.date_created || null;
        const startedAt = startTime ? new Date(startTime) : null;
        if (!startedAt || startedAt < from || startedAt > to) continue;
        calls.push({
          sid: String(call.sid || ''),
          status: String(call.status || ''),
          direction: String(call.direction || ''),
          from: String(call.from || ''),
          to: String(call.to || ''),
          startTime,
          endTime: call.end_time || null,
          duration: Number(call.duration || 0),
        });
      }
      path = data.next_page_uri || '';
      page += 1;
    }
    return calls;
  }
}
