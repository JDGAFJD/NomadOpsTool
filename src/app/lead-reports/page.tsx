import { redirect } from 'next/navigation';
import { verifyAuth } from '@/lib/auth';
import LeadReportsClient from './LeadReportsClient';

export default async function LeadReportsPage() {
  const session = await verifyAuth();
  if (!session) redirect('/ops/login');
  return <LeadReportsClient userEmail={session.email} />;
}
