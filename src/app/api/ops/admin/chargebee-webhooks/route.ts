import { NextRequest, NextResponse } from 'next/server';
import { verifyAuth } from '@/lib/auth';
import { ensureChargebeeWebhookTable } from '@/lib/chargebeeWebhooks';
import { queryOpsDb } from '@/lib/opsDb';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  const session = await verifyAuth();
  if (!session || session.role !== 'admin') {
    return NextResponse.json({ error: 'Unauthorized. Admin role required.' }, { status: 403 });
  }

  try {
    await ensureChargebeeWebhookTable();

    const search = request.nextUrl.searchParams.get('search')?.trim() || '';
    const eventType = request.nextUrl.searchParams.get('eventType')?.trim() || '';
    const limitParam = Number(request.nextUrl.searchParams.get('limit') || 200);
    const limit = Number.isFinite(limitParam) ? Math.min(Math.max(limitParam, 1), 500) : 200;

    const where: string[] = [];
    const params: unknown[] = [];
    if (eventType && eventType !== 'all') {
      params.push(eventType);
      where.push(`event_type = $${params.length}`);
    }
    if (search) {
      params.push(`%${search}%`);
      const index = params.length;
      where.push(`(
        chargebee_event_id ILIKE $${index}
        OR event_type ILIKE $${index}
        OR COALESCE(customer_id, '') ILIKE $${index}
        OR COALESCE(subscription_id, '') ILIKE $${index}
        OR COALESCE(invoice_id, '') ILIKE $${index}
      )`);
    }
    params.push(limit);

    const clause = where.length ? `WHERE ${where.join(' AND ')}` : '';
    const [eventsResult, statsResult, typesResult] = await Promise.all([
      queryOpsDb(
        `SELECT
           id, chargebee_event_id, event_type, api_version, source, occurred_at,
           customer_id, subscription_id, invoice_id, payload, processing_status,
           duplicate_count, received_at, last_received_at
         FROM ops_chargebee_webhook_events
         ${clause}
         ORDER BY received_at DESC
         LIMIT $${params.length}`,
        params
      ),
      queryOpsDb(`
        SELECT
          COUNT(*)::text AS total,
          COALESCE(SUM(duplicate_count), 0)::text AS duplicates,
          COUNT(*) FILTER (WHERE received_at >= NOW() - INTERVAL '24 hours')::text AS last_24_hours
        FROM ops_chargebee_webhook_events
      `),
      queryOpsDb(`
        SELECT event_type, COUNT(*)::text AS count
        FROM ops_chargebee_webhook_events
        GROUP BY event_type
        ORDER BY event_type ASC
      `),
    ]);

    return NextResponse.json({
      success: true,
      events: eventsResult.rows,
      stats: statsResult.rows[0],
      eventTypes: typesResult.rows,
    });
  } catch (error: any) {
    return NextResponse.json(
      { error: 'Failed to fetch Chargebee webhook events', message: error.message },
      { status: 500 }
    );
  }
}
