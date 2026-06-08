import { verifyAuth } from '@/lib/auth';
import { RETURN_MANAGER_ROLES, hasRole } from '@/lib/returnsWorkflow';
import { redirect } from 'next/navigation';
import ReturnsManagerClient from './ReturnsManagerClient';

export const dynamic = 'force-dynamic';

export default async function ReturnsManagerPage() {
  const session = await verifyAuth();
  if (!session) redirect('/ops/login');
  if (!hasRole(session, RETURN_MANAGER_ROLES)) redirect('/ops/dashboard');

  return <ReturnsManagerClient userEmail={session.email} />;
}
