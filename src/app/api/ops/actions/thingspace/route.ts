import { NextResponse } from 'next/server';
import { ThingSpaceService } from '@/lib/services/ThingSpaceService';
import { verifyAuth } from '@/lib/auth';
import { queryOpsDb } from '@/lib/opsDb';

export async function POST(request: Request) {
  try {
    const session = await verifyAuth();
    if (!session) return NextResponse.json({ error: 'Unauthorized NOC Access' }, { status: 401 });

    const { action, iccid } = await request.json();

    if (!iccid || !['suspend', 'restore', 'refresh'].includes(action)) {
      return NextResponse.json({ error: 'Invalid Parameters' }, { status: 400 });
    }

    const ts = new ThingSpaceService();

    if (action === 'refresh') {
      const device = await ts.getDeviceDetails(iccid);
      if (!device) return NextResponse.json({ error: 'Failed to fetch device details' }, { status: 500 });
      return NextResponse.json({ success: true, device });
    }

    const result = await ts.performAction(iccid, action as 'suspend' | 'restore');

    if (!result.success) {
      return NextResponse.json({ error: result.error || 'Failed to dispatch network signal.' }, { status: 500 });
    }

    await queryOpsDb('INSERT INTO ops_activity_logs (agent_email, action_type, target) VALUES ($1, $2, $3)', [
      session.email, 
      action === 'restore' ? 'restore_customer' : 'suspend_customer', 
      iccid
    ]);

    return NextResponse.json({ success: true, requestId: result.requestId });
  } catch (err: any) {
    console.error('OPS ThingSpace Action Pipeline Error:', err.message);
    return NextResponse.json({ error: 'Telecommunication Subsystem Failure' }, { status: 500 });
  }
}
