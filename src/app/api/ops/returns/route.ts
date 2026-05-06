import { NextResponse } from 'next/server';
import { verifyAuth } from '@/lib/auth';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  try {
    const session = await verifyAuth();
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized NOC Access' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const imei = searchParams.get('imei');

    if (!imei) {
      return NextResponse.json({ error: 'IMEI parameter required' }, { status: 400 });
    }

    const res = await fetch(`https://app.lrlos.com/webhook/QueryReturnIMEI?imei=${encodeURIComponent(imei)}`);
    if (!res.ok) {
      return NextResponse.json({ error: 'Failed to fetch return details from LRLOS API' }, { status: res.status });
    }

    const data = await res.json();
    return NextResponse.json({ success: true, data });

  } catch (err: any) {
    console.error('LRLOS API Error:', err);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
