import { verifyAuth } from '@/lib/auth';
import { attachWorkflowRun, getExecutableItemIds } from '@/lib/lineSwaps/store';
import { lineSwapBatchWorkflow } from '@/workflows/lineSwap';
import { start } from 'workflow/api';

export async function POST(_request: Request, { params }: { params: Promise<{ batchId: string }> }) {
  const session = await verifyAuth();
  if (!session || !['admin', 'agent'].includes(session.role)) return Response.json({ error: 'Admin or agent access required' }, { status: 403 });
  const { batchId } = await params;
  try {
    const { queryOpsDb: db } = await import('@/lib/opsDb');
    const claim = await db(
      `UPDATE ops_line_swap_batches SET status = 'starting', updated_at = NOW() WHERE id = $1 AND status IN ('completed_with_failures','failed')`,
      [batchId],
    );
    if (!claim.rowCount) return Response.json({ error: 'Batch is not retryable' }, { status: 409 });
    await db(
      `UPDATE ops_line_swap_items SET status = 'reserved', error_code = NULL, error_message = NULL, completed_at = NULL,
       park_request_id = NULL, restore_request_id = NULL, replace_request_id = NULL, custom_field_request_id = NULL, updated_at = NOW()
       WHERE batch_id = $1 AND executable = TRUE AND status IN ('failed','quarantined','completed_with_warning')`,
      [batchId],
    );
    const itemIds = await getExecutableItemIds(batchId);
    const run = await start(lineSwapBatchWorkflow, [batchId, itemIds]);
    await attachWorkflowRun(batchId, run.runId);
    return Response.json({ success: true, runId: run.runId });
  } catch (error) {
    const { queryOpsDb: db } = await import('@/lib/opsDb');
    await db(`UPDATE ops_line_swap_batches SET status = 'completed_with_failures', updated_at = NOW() WHERE id = $1 AND status = 'starting'`, [batchId]).catch(() => undefined);
    return Response.json({ error: error instanceof Error ? error.message : 'Retry failed' }, { status: 500 });
  }
}
