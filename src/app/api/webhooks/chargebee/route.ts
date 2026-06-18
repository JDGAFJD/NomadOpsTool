import { timingSafeEqual } from 'crypto';
import { NextResponse } from 'next/server';
import {
  isChargebeeWebhookPayload,
  recordChargebeeWebhook,
} from '@/lib/chargebeeWebhooks';
import { processChargebeeCollectionsEvent } from '@/lib/collections';
import { queryOpsDb } from '@/lib/opsDb';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

function constantTimeEqual(left: string, right: string) {
  const leftBuffer = Buffer.from(left);
  const rightBuffer = Buffer.from(right);
  if (leftBuffer.length !== rightBuffer.length) return false;
  return timingSafeEqual(leftBuffer, rightBuffer);
}

function isAuthorized(request: Request) {
  const configuredUsername = process.env.CHARGEBEE_WEBHOOK_USERNAME;
  const configuredPassword = process.env.CHARGEBEE_WEBHOOK_PASSWORD;
  if (!configuredUsername || !configuredPassword) return false;

  const authorization = request.headers.get('authorization');
  if (!authorization?.startsWith('Basic ')) return false;

  try {
    const decoded = Buffer.from(authorization.slice(6), 'base64').toString('utf8');
    const separator = decoded.indexOf(':');
    if (separator < 0) return false;

    const username = decoded.slice(0, separator);
    const password = decoded.slice(separator + 1);
    return constantTimeEqual(username, configuredUsername) &&
      constantTimeEqual(password, configuredPassword);
  } catch {
    return false;
  }
}

export async function POST(request: Request) {
  if (!isAuthorized(request)) {
    return NextResponse.json(
      { ok: false, error: 'Unauthorized' },
      {
        status: 401,
        headers: { 'WWW-Authenticate': 'Basic realm="NomadOps Chargebee Webhook"' },
      }
    );
  }

  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return NextResponse.json({ ok: false, error: 'Invalid JSON payload' }, { status: 400 });
  }

  if (!isChargebeeWebhookPayload(payload)) {
    return NextResponse.json(
      { ok: false, error: 'Payload must include id, event_type, and content' },
      { status: 400 }
    );
  }

  try {
    const recorded = await recordChargebeeWebhook(payload);
    try {
      await queryOpsDb(
        `UPDATE ops_chargebee_webhook_events
         SET processing_status = 'processing', processing_attempts = processing_attempts + 1,
             processing_error = NULL
         WHERE id = $1`,
        [recorded.databaseId]
      );
      await processChargebeeCollectionsEvent(payload);
      await queryOpsDb(
        `UPDATE ops_chargebee_webhook_events
         SET processing_status = 'processed', processed_at = NOW(), processing_error = NULL
         WHERE id = $1`,
        [recorded.databaseId]
      );
    } catch (processingError: any) {
      await queryOpsDb(
        `UPDATE ops_chargebee_webhook_events
         SET processing_status = 'failed', processing_error = $1
         WHERE id = $2`,
        [processingError?.message || 'Collections processing failed', recorded.databaseId]
      ).catch(() => undefined);
      throw processingError;
    }
    return NextResponse.json({
      ok: true,
      eventId: payload.id,
      duplicate: recorded.duplicate,
      duplicateCount: recorded.duplicateCount,
    });
  } catch (error) {
    console.error('Chargebee webhook storage failure:', error);
    return NextResponse.json(
      { ok: false, error: 'Unable to persist webhook event' },
      { status: 500 }
    );
  }
}
