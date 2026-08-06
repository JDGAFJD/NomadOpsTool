import { sleep } from 'workflow';
import {
  completeItem,
  completeItemWithWarning,
  dispatchParking,
  dispatchReplacement,
  dispatchRestore,
  dispatchSwapNote,
  finalizeInventory,
  finishBatch,
  getCarrierRequestStatus,
  handleItemFailure,
  revalidateItem,
  verifyDestinationActive,
  verifyParked,
  verifyReplacement,
  verifySwapNote,
} from './steps';

export async function lineSwapBatchWorkflow(batchId: string, itemIds: string[]) {
  'use workflow';
  for (const itemId of itemIds) {
    try {
      const phase = await revalidateItem(itemId);
      if (!phase.sourceParked) {
        const requestId = await dispatchParking(itemId);
        if (requestId) await waitForRequest(requestId);
        await waitForParking(itemId);
      }
      if (!phase.destinationReplaced) {
        if (!phase.destinationActive) {
          const restoreId = await dispatchRestore(itemId);
          if (restoreId) await waitForRequest(restoreId);
          await waitForDestinationActive(itemId);
        }
        const replaceId = await dispatchReplacement(itemId);
        if (replaceId) await waitForRequest(replaceId);
        await waitForReplacement(itemId);
      }
      let metadataWarning = '';
      try {
        const noteId = await dispatchSwapNote(itemId);
        if (noteId) await waitForRequest(noteId);
        await waitForSwapNote(itemId);
      } catch (error) {
        metadataWarning = error instanceof Error ? error.message : 'Custom-field update failed';
      }
      await finalizeInventory(itemId);
      if (metadataWarning) await completeItemWithWarning(itemId, metadataWarning);
      else await completeItem(itemId);
    } catch (error) {
      await handleItemFailure(itemId, error instanceof Error ? error.message : 'Unknown workflow failure');
    }
  }
  await finishBatch(batchId);
  return { batchId };
}

async function waitForRequest(requestId: string): Promise<void> {
  for (let attempt = 0; attempt < 40; attempt += 1) {
    const status = await getCarrierRequestStatus(requestId);
    if (status === 'success') return;
    if (status === 'failure') throw new Error(`ThingSpace request ${requestId} failed`);
    await sleep('15s');
  }
  throw new Error(`ThingSpace request ${requestId} stalled for 10 minutes`);
}

async function waitForParking(itemId: string): Promise<void> {
  for (let attempt = 0; attempt < 20; attempt += 1) {
    if (await verifyParked(itemId)) return;
    await sleep('15s');
  }
  throw new Error('parking verification did not settle within 5 minutes');
}

async function waitForDestinationActive(itemId: string): Promise<void> {
  for (let attempt = 0; attempt < 20; attempt += 1) {
    if (await verifyDestinationActive(itemId)) return;
    await sleep('15s');
  }
  throw new Error('destination activation did not settle within 5 minutes');
}

async function waitForReplacement(itemId: string): Promise<void> {
  for (let attempt = 0; attempt < 20; attempt += 1) {
    if (await verifyReplacement(itemId)) return;
    await sleep('15s');
  }
  throw new Error('replacement verification did not settle within 5 minutes');
}

async function waitForSwapNote(itemId: string): Promise<void> {
  for (let attempt = 0; attempt < 20; attempt += 1) {
    if (await verifySwapNote(itemId)) return;
    await sleep('15s');
  }
  throw new Error('custom-field verification did not settle within 5 minutes');
}
