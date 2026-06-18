import { NextResponse } from 'next/server';
import { verifyAuth } from '@/lib/auth';
import { ensureCollectionsTables } from '@/lib/collections';
import { queryOpsDb } from '@/lib/opsDb';
import { ChargebeeService } from '@/lib/services/ChargebeeService';

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  const session = await verifyAuth();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  await ensureCollectionsTables();
  const id = Number((await context.params).id);
  const result = await queryOpsDb('SELECT customer_id, subscription_id FROM ops_collection_cases WHERE id=$1', [id]);
  const row = result.rows[0];
  if (!row) return NextResponse.json({ error: 'Case not found.' }, { status: 404 });
  if (!row.customer_id) {
    const stored = await queryOpsDb('SELECT * FROM ops_collection_invoices WHERE case_id=$1 ORDER BY failure_date DESC', [id]);
    return NextResponse.json({ success: true, invoices: stored.rows, source: 'stored' });
  }
  const invoices = await new ChargebeeService().getInvoices(row.customer_id, row.subscription_id || undefined);
  return NextResponse.json({ success: true, invoices, source: 'chargebee' });
}
