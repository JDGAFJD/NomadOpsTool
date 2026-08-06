import { verifyAuth } from '@/lib/auth';
import { buildLineSwapPreview } from '@/lib/lineSwaps/preview';

export const maxDuration = 120;

export async function POST(request: Request) {
  const session = await verifyAuth();
  if (!session || !['admin', 'agent'].includes(session.role)) return Response.json({ error: 'Admin or agent access required' }, { status: 403 });
  try {
    console.info('[line-swaps:preview] request started', { operator: session.email });
    const body = await request.json();
    const batchSize = Number(body?.batchSize);
    if (!Number.isInteger(batchSize) || batchSize < 1 || batchSize > 50) {
      return Response.json({ error: 'Batch size must be an integer from 1 to 50' }, { status: 400 });
    }
    const snapshot = await buildLineSwapPreview(session.email, batchSize);
    console.info('[line-swaps:preview] request completed', { operator: session.email, batchId: snapshot.batch.id, itemCount: snapshot.items.length });
    return Response.json({ success: true, ...snapshot });
  } catch (error) {
    console.error('Line-swap preview failed:', error instanceof Error ? error.message : 'unknown');
    return Response.json({ error: error instanceof Error ? error.message : 'Preview failed' }, { status: 500 });
  }
}
