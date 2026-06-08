import { verifyAuth } from '@/lib/auth';
import { CANCELLATION_ROLES, hasRole } from '@/lib/returnsWorkflow';
import { redirect } from 'next/navigation';
import CancellationTeamClient from './CancellationTeamClient';

export const dynamic = 'force-dynamic';

export default async function CancellationTeamPage() {
  const session = await verifyAuth();
  if (!session) redirect('/ops/login');
  if (!hasRole(session, CANCELLATION_ROLES)) redirect('/ops/dashboard');

  return <CancellationTeamClient userEmail={session.email} />;
}
