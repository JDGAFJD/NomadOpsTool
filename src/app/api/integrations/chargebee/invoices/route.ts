import { NextRequest, NextResponse } from 'next/server';
import { ChargebeeService } from '@/lib/services/ChargebeeService';

export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const customerId = url.searchParams.get('customer_id');
  const subscriptionId = url.searchParams.get('subscription_id') || undefined;

  if (!customerId) {
    return NextResponse.json({ error: 'Customer ID parameter is required' }, { status: 400 });
  }

  try {
    const service = new ChargebeeService();
    const invoices = await service.getInvoices(customerId, subscriptionId);
    return NextResponse.json({ invoices });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
