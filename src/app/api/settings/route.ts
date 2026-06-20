import { NextRequest, NextResponse } from 'next/server';
import { verifyAuth } from '@/lib/auth';
import { getSetting, setSetting } from '@/lib/db';

const PUBLIC_KEYS = ['freescout_api_url', 'callback_freescout_mailbox_id'] as const;
const SECRET_KEYS = [
  'freescout_api_key',
  'twilio_account_sid',
  'twilio_api_key_sid',
  'twilio_api_key_secret',
] as const;
const WRITABLE_KEYS = [...PUBLIC_KEYS, ...SECRET_KEYS];

export async function GET() {
  const session = await verifyAuth();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (session.role !== 'admin') return NextResponse.json({ error: 'Administrator access is required.' }, { status: 403 });

  const settings = Object.fromEntries(PUBLIC_KEYS.map(key => [key, getSetting(key) || '']));
  const configured = Object.fromEntries(SECRET_KEYS.map(key => [key, Boolean(getSetting(key))]));
  return NextResponse.json({ settings, configured });
}

export async function POST(req: NextRequest) {
  const session = await verifyAuth();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (session.role !== 'admin') return NextResponse.json({ error: 'Administrator access is required.' }, { status: 403 });

  try {
    const body = await req.json();
    for (const key of WRITABLE_KEYS) {
      const value = body?.[key];
      if (typeof value === 'string' && value.trim()) setSetting(key, value.trim());
    }
    return NextResponse.json({ success: true });
  } catch (error) {
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}
