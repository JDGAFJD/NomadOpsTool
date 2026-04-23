import { NextResponse } from 'next/server';

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const targetUrl = body.url;

    if (!targetUrl) {
      return NextResponse.json({ success: false, error: 'Missing Stripe URL parameter' }, { status: 400 });
    }

    const res = await fetch('https://app.lrlos.com/webhook/GetStripeDetails', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ url: targetUrl })
    });

    if (!res.ok) {
      throw new Error(`Stripe Webhook responded with HTTP ${res.status}`);
    }

    const data = await res.json();

    return NextResponse.json({
      success: true,
      data
    });
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}
