import { NextRequest, NextResponse } from 'next/server';
import { ChargebeeService } from '@/lib/services/ChargebeeService';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { customerId } = body;

    if (!customerId) {
      return NextResponse.json({ error: 'Customer ID parameter is required' }, { status: 400 });
    }

    const service = new ChargebeeService();
    const result = await service.generatePaymentLink(customerId);
    
    if (result.error) {
      return NextResponse.json({ error: result.error }, { status: 400 });
    }

    return NextResponse.json({ url: result.url });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
