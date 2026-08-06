import { verifyAuth } from '@/lib/auth';
import { getBatch } from '@/lib/lineSwaps/store';

export async function GET(_request: Request, { params }: { params: Promise<{ batchId: string }> }) {
  const session = await verifyAuth();
  if (!session || !['admin', 'agent'].includes(session.role)) return Response.json({ error: 'Admin or agent access required' }, { status: 403 });
  const { batchId } = await params;
  const snapshot = await getBatch(batchId);
  if (!snapshot) return Response.json({ error: 'Batch not found' }, { status: 404 });
  return Response.json({ success: true, ...snapshot }, { headers: { 'Cache-Control': 'no-store' } });
}
