import { NextResponse } from 'next/server';
import { verifyAuth } from '@/lib/auth';
import { queryOpsDb, logActivity } from '@/lib/opsDb';
import { ChargebeeService } from '@/lib/services/ChargebeeService';
import {
  CANCELLATION_ROLES,
  auditReturn,
  ensureReturnsTables,
  hasRole,
} from '@/lib/returnsWorkflow';

export const dynamic = 'force-dynamic';

type ChargebeeCustomer = {
  id?: string;
  first_name?: string;
  last_name?: string;
  email?: string;
};

type ChargebeeSubscription = {
  id?: string;
  customer_id?: string;
  status?: string;
};

type ChargebeeMatch = {
  subscription?: ChargebeeSubscription;
  customer?: ChargebeeCustomer | null;
  customerName?: string | null;
  customerEmail?: string | null;
};

type ReturnQueueRow = {
  id: number;
  imei: string;
  status: string;
  chargebee_subscription_id?: string | null;
  chargebee_subscription_status?: string | null;
  chargebee_customer_id?: string | null;
  chargebee_customer_name?: string | null;
  chargebee_customer_email?: string | null;
  chargebee_match_payload?: unknown;
  error_message?: string | null;
};

type ReturnDbRecord = ReturnQueueRow & {
  tracking_number: string;
  chargebee_customer_id?: string | null;
};

function customerName(match: ChargebeeMatch) {
  return match?.customerName || [match?.customer?.first_name, match?.customer?.last_name].filter(Boolean).join(' ') || null;
}

async function saveMatch(returnId: number, actorEmail: string, match: ChargebeeMatch, status: string) {
  const subscription = match?.subscription;
  const customer = match?.customer;
  await queryOpsDb(
    `UPDATE ops_returns
     SET chargebee_customer_id = $1,
         chargebee_customer_name = $2,
         chargebee_customer_email = $3,
         chargebee_subscription_id = $4,
         chargebee_subscription_status = $5,
         chargebee_match_payload = $6::jsonb,
         status = $7,
         error_message = NULL,
         updated_at = NOW()
     WHERE id = $8`,
    [
      customer?.id || subscription?.customer_id || null,
      customerName(match),
      match?.customerEmail || customer?.email || null,
      subscription?.id || null,
      subscription?.status || null,
      JSON.stringify(match || {}),
      status,
      returnId,
    ]
  );
  await auditReturn(returnId, actorEmail, status === 'ready_to_cancel' ? 'confirmed_chargebee_match' : 'matched_chargebee_subscription', {
    subscriptionId: subscription?.id,
    customerEmail: match?.customerEmail || customer?.email,
  });
}

async function enrichPendingRows(rows: ReturnQueueRow[], actorEmail: string) {
  const chargebee = new ChargebeeService();

  for (const row of rows) {
    if (row.chargebee_subscription_id || !['uploaded', 'needs_manual_review'].includes(row.status)) continue;

    const lookup = await chargebee.findSubscriptionByImei(row.imei);
    if (!lookup.configured) {
      await queryOpsDb(
        `UPDATE ops_returns
         SET status = 'error', error_message = 'Chargebee is not configured', updated_at = NOW()
         WHERE id = $1`,
        [row.id]
      );
      row.status = 'error';
      row.error_message = 'Chargebee is not configured';
      continue;
    }

    if (lookup.matches.length === 1) {
      await saveMatch(row.id, actorEmail, lookup.matches[0], 'match_found');
      Object.assign(row, {
        status: 'match_found',
        chargebee_subscription_id: lookup.matches[0].subscription?.id || null,
        chargebee_subscription_status: lookup.matches[0].subscription?.status || null,
        chargebee_customer_id: lookup.matches[0].customer?.id || null,
        chargebee_customer_name: customerName(lookup.matches[0]),
        chargebee_customer_email: lookup.matches[0].customerEmail || lookup.matches[0].customer?.email || null,
        chargebee_match_payload: lookup.matches[0],
      });
    } else if (lookup.matches.length > 1) {
      await queryOpsDb(
        `UPDATE ops_returns
         SET status = 'needs_manual_review',
             chargebee_match_payload = $1::jsonb,
             error_message = 'Multiple Chargebee subscriptions matched this IMEI',
             updated_at = NOW()
         WHERE id = $2`,
        [JSON.stringify({ matches: lookup.matches }), row.id]
      );
      row.status = 'needs_manual_review';
      row.chargebee_match_payload = { matches: lookup.matches };
      row.error_message = 'Multiple Chargebee subscriptions matched this IMEI';
      await auditReturn(row.id, actorEmail, 'multiple_chargebee_matches', { count: lookup.matches.length });
    } else {
      await queryOpsDb(
        `UPDATE ops_returns
         SET status = 'needs_manual_review',
             error_message = 'No Chargebee subscription matched this IMEI',
             updated_at = NOW()
         WHERE id = $1`,
        [row.id]
      );
      row.status = 'needs_manual_review';
      row.error_message = 'No Chargebee subscription matched this IMEI';
      await auditReturn(row.id, actorEmail, 'no_chargebee_match', { imei: row.imei });
    }
  }
}

export async function GET() {
  try {
    const session = await verifyAuth();
    if (!hasRole(session, CANCELLATION_ROLES)) {
      return NextResponse.json({ error: 'Cancellation Team access required' }, { status: 403 });
    }

    await ensureReturnsTables();
    const queue = await queryOpsDb(`
      SELECT *
      FROM ops_returns
      WHERE status NOT IN ('canceled', 'completed')
      ORDER BY received_at ASC
      LIMIT 50
    `);

    await enrichPendingRows(queue.rows, session.email);

    const stats = await queryOpsDb(`
      SELECT status, COUNT(*)::int AS count
      FROM ops_returns
      GROUP BY status
      ORDER BY status
    `);

    return NextResponse.json({ success: true, returns: queue.rows, stats: stats.rows });
  } catch (err: unknown) {
    console.error('Cancellation queue error:', err);
    return NextResponse.json({ error: 'Failed to load cancellation queue' }, { status: 500 });
  }
}

export async function PATCH(request: Request) {
  try {
    const session = await verifyAuth();
    if (!hasRole(session, CANCELLATION_ROLES)) {
      return NextResponse.json({ error: 'Cancellation Team access required' }, { status: 403 });
    }

    await ensureReturnsTables();
    const body = await request.json();
    const { action, returnId, subscriptionId } = body;
    if (!returnId || !action) {
      return NextResponse.json({ error: 'returnId and action are required' }, { status: 400 });
    }

    const existing = await queryOpsDb('SELECT * FROM ops_returns WHERE id = $1', [returnId]);
    const record = existing.rows[0] as ReturnDbRecord | undefined;
    if (!record) return NextResponse.json({ error: 'Return record not found' }, { status: 404 });

    if (action === 'confirm_match') {
      if (!record.chargebee_subscription_id) {
        return NextResponse.json({ error: 'No Chargebee subscription selected' }, { status: 400 });
      }
      await queryOpsDb(
        `UPDATE ops_returns SET status = 'ready_to_cancel', updated_at = NOW() WHERE id = $1`,
        [returnId]
      );
      await auditReturn(returnId, session.email, 'confirmed_chargebee_match', {
        subscriptionId: record.chargebee_subscription_id,
      });
      return NextResponse.json({ success: true });
    }

    if (action === 'set_subscription') {
      if (!subscriptionId) {
        return NextResponse.json({ error: 'subscriptionId is required' }, { status: 400 });
      }
      const chargebee = new ChargebeeService();
      const lookup = await chargebee.getSubscriptionWithCustomer(subscriptionId);
      if (!lookup.configured) {
        return NextResponse.json({ error: 'Chargebee is not configured' }, { status: 500 });
      }
      if (!lookup.match) {
        return NextResponse.json({ error: 'Subscription was not found in Chargebee' }, { status: 404 });
      }
      await saveMatch(returnId, session.email, lookup.match, 'ready_to_cancel');
      return NextResponse.json({ success: true, match: lookup.match });
    }

    return NextResponse.json({ error: 'Unsupported action' }, { status: 400 });
  } catch (err: unknown) {
    console.error('Cancellation patch error:', err);
    return NextResponse.json({ error: 'Failed to update return cancellation record' }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const session = await verifyAuth();
    if (!hasRole(session, CANCELLATION_ROLES)) {
      return NextResponse.json({ error: 'Cancellation Team access required' }, { status: 403 });
    }

    await ensureReturnsTables();
    const { returnId, cancellationReason, invoiceHandling } = await request.json();
    if (!returnId || !cancellationReason || !invoiceHandling) {
      return NextResponse.json({ error: 'returnId, cancellationReason, and invoiceHandling are required' }, { status: 400 });
    }

    const existing = await queryOpsDb('SELECT * FROM ops_returns WHERE id = $1', [returnId]);
    const record = existing.rows[0] as ReturnDbRecord | undefined;
    if (!record) return NextResponse.json({ error: 'Return record not found' }, { status: 404 });
    if (!record.chargebee_subscription_id) {
      return NextResponse.json({ error: 'A Chargebee subscription must be selected before cancellation' }, { status: 400 });
    }
    if (!['ready_to_cancel', 'match_found'].includes(record.status)) {
      return NextResponse.json({ error: 'The Chargebee match must be confirmed before cancellation' }, { status: 400 });
    }
    if (invoiceHandling === 'write_off_open_invoices' && !record.chargebee_customer_id) {
      return NextResponse.json({ error: 'Chargebee customer ID is required to write off invoices' }, { status: 400 });
    }

    const chargebee = new ChargebeeService();
    const reasonCode = cancellationReason.toLowerCase().trim().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 100);
    const cancelResult = await chargebee.cancelSubscriptionNow(record.chargebee_subscription_id, reasonCode || 'returned_device');
    if (!cancelResult.success) {
      await queryOpsDb(
        `UPDATE ops_returns
         SET status = 'error', error_message = $1, updated_at = NOW()
         WHERE id = $2`,
        [cancelResult.error, returnId]
      );
      await auditReturn(returnId, session.email, 'chargebee_cancellation_failed', { error: cancelResult.error });
      return NextResponse.json({ error: cancelResult.error }, { status: 502 });
    }

    const comment = [
      `Return cancellation completed by ${session.email}.`,
      `IMEI: ${record.imei}.`,
      `Reason: ${cancellationReason}.`,
      `Invoice handling selected: ${invoiceHandling}.`,
      `Tracking number: ${record.tracking_number}.`,
    ].join(' ');

    let invoiceResult = null;
    if (invoiceHandling === 'write_off_open_invoices') {
      invoiceResult = await chargebee.writeOffOpenInvoices(
        record.chargebee_customer_id || '',
        record.chargebee_subscription_id,
        `Return cancellation by ${session.email}: ${cancellationReason}`
      );
      await auditReturn(returnId, session.email, 'processed_invoice_write_offs', {
        writtenOffCount: invoiceResult.writtenOff.length,
        failedInvoiceIds: invoiceResult.failed || [],
      });
    }

    await chargebee.addSubscriptionComment(record.chargebee_subscription_id, comment);

    await queryOpsDb(
      `UPDATE ops_returns
       SET status = 'completed',
           cancellation_reason = $1,
           invoice_handling = $2,
           canceled_by = $3,
           canceled_at = NOW(),
           updated_at = NOW(),
           error_message = NULL
       WHERE id = $4`,
      [cancellationReason, invoiceHandling, session.email, returnId]
    );
    await auditReturn(returnId, session.email, 'canceled_chargebee_subscription', {
      subscriptionId: record.chargebee_subscription_id,
      cancellationReason,
      invoiceHandling,
      invoiceResult,
    });
    await logActivity(session.email, 'return_subscription_canceled', record.chargebee_subscription_id, request);

    return NextResponse.json({ success: true, subscription: cancelResult.subscription });
  } catch (err: unknown) {
    console.error('Cancellation execute error:', err);
    return NextResponse.json({ error: 'Failed to cancel Chargebee subscription' }, { status: 500 });
  }
}
