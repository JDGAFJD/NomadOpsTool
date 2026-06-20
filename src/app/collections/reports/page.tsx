import { redirect } from 'next/navigation';
import { verifyAuth } from '@/lib/auth';
import CollectionsReportsClient from './CollectionsReportsClient';

export default async function CollectionsReportsPage() {
  const session = await verifyAuth();
  if (!session) redirect('/ops/login');
  if (session.role !== 'admin') redirect('/collections');
  const today = new Date();
  const from = new Date(today);
  from.setUTCDate(from.getUTCDate() - 29);
  return (
    <CollectionsReportsClient
      agentEmail={session.email}
      defaultFrom={from.toISOString().slice(0, 10)}
      defaultTo={today.toISOString().slice(0, 10)}
    />
  );
}
