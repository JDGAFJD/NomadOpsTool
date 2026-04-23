import { NextRequest, NextResponse } from 'next/server';
import { ChargebeeService } from '@/lib/services/ChargebeeService';

export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const email = url.searchParams.get('email');

  if (!email) {
    return NextResponse.json({ error: 'Email parameter is required' }, { status: 400 });
  }

  try {
    const service = new ChargebeeService();
    const data = await service.getCustomerData(email);
    
    return NextResponse.json(data);
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
