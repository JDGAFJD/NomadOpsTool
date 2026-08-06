import { verifyAuth } from '@/lib/auth';
import { attachWorkflowRun, claimBatchForStart, getExecutableItemIds, resetBatchStart } from '@/lib/lineSwaps/store';
import { lineSwapBatchWorkflow } from '@/workflows/lineSwap';
import { start } from 'workflow/api';

export async function POST(_request: Request, { params }: { params: Promise<{ batchId: string }> }) {
  const session = await verifyAuth();
  if (!session || !['admin', 'agent'].includes(session.role)) return Response.json({ error: 'Admin or agent access required' }, { status: 403 });
  const { batchId } = await params;
  try {
    await claimBatchForStart(batchId);
    const itemIds = await getExecutableItemIds(batchId);
    if (!itemIds.length) {
      await resetBatchStart(batchId, 'No executable rows');
      return Response.json({ error: 'This preview has no executable rows' }, { status: 409 });
    }
    try {
      const run = await start(lineSwapBatchWorkflow, [batchId, itemIds]);
      await attachWorkflowRun(batchId, run.runId);
      return Response.json({ success: true, batchId, runId: run.runId });
    } catch (error) {
      await resetBatchStart(batchId, error instanceof Error ? error.message : 'Workflow start failed');
      throw error;
    }
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : 'Confirmation failed' }, { status: 409 });
  }
}
