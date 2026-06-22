import { after, NextResponse } from 'next/server';
import { verifyAuth } from '@/lib/auth';
import { ensureCallVerificationTable, processCallVerification } from '@/lib/callVerification';
import { reprocessVerification } from '@/lib/callReports';
import { getCallVerificationMode, isCallVerificationEnabled } from '@/lib/features';
import { queryOpsDb } from '@/lib/opsDb';

export const maxDuration = 60;

export async function PATCH(_request: Request, context: { params: Promise<{ id: string }> }) {
  const session = await verifyAuth();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (session.role !== 'admin') return NextResponse.json({ error: 'Administrator access is required.' }, { status: 403 });
  if (!isCallVerificationEnabled()) {
    return NextResponse.json({ error: 'Call verification is currently disabled.' }, { status: 503 });
  }

  await ensureCallVerificationTable();
  const id = Number((await context.params).id);
  if (!Number.isInteger(id)) return NextResponse.json({ error: 'Invalid verification ID.' }, { status: 400 });
  const mode = getCallVerificationMode();
  const reset = await queryOpsDb(
    `UPDATE ops_call_verifications
     SET state='pending',
         integration_error=NULL,last_checked_at=NULL,updated_at=NOW()
     WHERE id=$1 RETURNING id`,
    [id]
  );
  if (!reset.rows[0]) return NextResponse.json({ error: 'Verification not found.' }, { status: 404 });
  if (mode === 'twilio') after(() => processCallVerification(id));
  else after(() => reprocessVerification(id));
  return NextResponse.json({ success: true, state: 'pending' }, { status: 202 });
}
