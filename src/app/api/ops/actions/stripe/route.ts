import { NextResponse } from 'next/server';
import { verifyAuth } from '@/lib/auth';
import { StripeExplorerService } from '@/lib/services/StripeExplorerService';

export async function POST(request: Request) {
  try {
    const session = await verifyAuth();
    if (!session) {
      return NextResponse.json({ success: false, error: 'Unauthorized NOC Access' }, { status: 401 });
    }

    const body = await request.json();
    const targetUrl = body.url;

    if (!targetUrl) {
      return NextResponse.json({ success: false, error: 'Missing Stripe URL parameter' }, { status: 400 });
    }

    const stripe = new StripeExplorerService();
    if (!stripe.isConfigured()) {
      return NextResponse.json({ success: false, error: 'Stripe API key is not configured.' }, { status: 500 });
    }

    const parsed = new URL(targetUrl, 'https://api.stripe.com');
    const limit = Number(parsed.searchParams.get('limit') || 100);
    const customerId = parsed.searchParams.get('customer');
    if (!customerId) {
      return NextResponse.json({ success: false, error: 'Stripe customer parameter is required.' }, { status: 400 });
    }

    let data: any[] = [];
    if (parsed.pathname === '/v1/invoices') {
      data = await stripe.listInvoices(customerId, Number.isFinite(limit) ? limit : 100);
    } else if (parsed.pathname === '/v1/charges') {
      data = await stripe.listCharges(customerId, Number.isFinite(limit) ? limit : 100);
    } else {
      return NextResponse.json({ success: false, error: 'Unsupported Stripe Explorer endpoint.' }, { status: 400 });
    }

    return NextResponse.json({
      success: true,
      data: { data }
    });
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}
