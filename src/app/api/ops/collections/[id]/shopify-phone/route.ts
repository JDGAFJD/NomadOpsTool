import { NextResponse } from 'next/server';
import { verifyAuth } from '@/lib/auth';
import { ensureCollectionsTables, addCollectionEvent } from '@/lib/collections';
import { logActivity, queryOpsDb } from '@/lib/opsDb';
import { CommerceService } from '@/lib/services/CommerceService';

function normalizePhone(value: unknown) {
  const raw = typeof value === 'string' ? value.trim() : '';
  const digits = raw.replace(/\D/g, '');
  return digits.length >= 7 ? raw : null;
}

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const session = await verifyAuth();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  await ensureCollectionsTables();
  const id = Number((await context.params).id);
  if (!Number.isInteger(id) || id <= 0) {
    return NextResponse.json({ error: 'Invalid case ID.' }, { status: 400 });
  }

  const caseResult = await queryOpsDb(
    'SELECT id, customer_email, customer_phone, status FROM ops_collection_cases WHERE id=$1 LIMIT 1',
    [id]
  );
  const row = caseResult.rows[0];
  if (!row) return NextResponse.json({ error: 'Case not found.' }, { status: 404 });
  if (row.customer_phone && normalizePhone(row.customer_phone)) {
    return NextResponse.json({ success: true, found: true, phone: row.customer_phone, source: 'existing' });
  }
  if (!row.customer_email) {
    await addCollectionEvent(id, session.email, 'shopify_phone_lookup_failed', {
      reason: 'missing_customer_email',
    });
    return NextResponse.json({ error: 'Customer email is unavailable, so Shopify cannot be searched.' }, { status: 400 });
  }

  const orders = await new CommerceService().getCustomerOrders(row.customer_email);
  const sortedOrders = [...orders].sort((a, b) => new Date(b.orderDate).getTime() - new Date(a.orderDate).getTime());
  let match: { phone: string; source: string; orderNumber: string } | null = null;
  for (const order of sortedOrders) {
    const candidates = [
      { phone: order.customerPhone, source: 'Shopify customer phone' },
      { phone: order.shippingAddress?.phone, source: 'Shopify shipping phone' },
      { phone: order.billingAddress?.phone, source: 'Shopify billing phone' },
    ];
    const candidate = candidates.find(item => normalizePhone(item.phone));
    if (candidate?.phone) {
      match = { phone: candidate.phone, source: candidate.source, orderNumber: order.orderNumber };
      break;
    }
  }

  if (!match) {
    await addCollectionEvent(id, session.email, 'shopify_phone_lookup_no_result', {
      customerEmail: row.customer_email,
      ordersChecked: orders.length,
    });
    await logActivity(session.email, 'search_collection_shopify_phone', String(id), request);
    return NextResponse.json({
      success: true,
      found: false,
      message: 'Shopify did not return a valid phone number for this customer.',
      ordersChecked: orders.length,
    });
  }

  const updated = await queryOpsDb(
    `UPDATE ops_collection_cases SET customer_phone=$1, updated_at=NOW()
     WHERE id=$2 AND (customer_phone IS NULL OR customer_phone = '')
     RETURNING *`,
    [match.phone, id]
  );
  await addCollectionEvent(id, session.email, 'shopify_phone_lookup_found', {
    phone: match.phone,
    source: match.source,
    orderNumber: match.orderNumber,
  });
  await logActivity(session.email, 'search_collection_shopify_phone', String(id), request);
  return NextResponse.json({
    success: true,
    found: true,
    phone: match.phone,
    source: match.source,
    orderNumber: match.orderNumber,
    case: updated.rows[0] || null,
  });
}
