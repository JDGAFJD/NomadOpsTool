import { NextRequest, NextResponse } from 'next/server';
import { CommerceService } from '@/lib/services/CommerceService';

export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const email = url.searchParams.get('email');

  if (!email) {
    return NextResponse.json({ error: 'Email is required' }, { status: 400 });
  }

  try {
    const service = new CommerceService();
    // Validate credentials in config
    if (!service.isConfigured()) {
       return NextResponse.json({ orders: [], configured: false });
    }

    const orders = await service.getCustomerOrders(email);
    return NextResponse.json({ orders, configured: true });
  } catch (err) {
    console.error('Commerce route err:', err);
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
