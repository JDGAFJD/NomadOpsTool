import { NextResponse } from 'next/server';
import { ChargebeeService } from '@/lib/services/ChargebeeService';
import { verifyAuth } from '@/lib/auth';

export async function POST(request: Request) {
  try {
    const session = await verifyAuth();
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized NOC Access' }, { status: 401 });
    }

    const { action, customerId, subscriptionId } = await request.json();

    if (!action || !customerId || !subscriptionId) {
      return NextResponse.json({ error: 'Missing required parameters' }, { status: 400 });
    }

    const cb = new ChargebeeService();

    switch (action) {
      case 'get_financial_history':
        const data = await cb.getFinancialHistory(String(customerId), String(subscriptionId));
        if (!data) return NextResponse.json({ error: 'Failed to retrieve from Chargebee' }, { status: 500 });
        return NextResponse.json(data);
      
      default:
        return NextResponse.json({ error: 'Unknown Action Type' }, { status: 400 });
    }
  } catch (err: any) {
    console.error('Chargebee Action Pipeline Error:', err.message);
    return NextResponse.json({ error: 'NOC Chargebee Protocol Error', detail: err.message }, { status: 500 });
  }
}
