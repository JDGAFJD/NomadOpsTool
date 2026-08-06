import { verifyAuth } from '@/lib/auth';
import { redirect } from 'next/navigation';
import LineSwapsClient from './LineSwapsClient';

export default async function LineSwapsPage({ searchParams }: { searchParams: Promise<{ batch?: string }> }) {
  const session = await verifyAuth();
  if (!session) redirect('/ops/login');
  if (!['admin', 'agent'].includes(session.role)) redirect('/ops/dashboard');
  const { batch } = await searchParams;
  return <LineSwapsClient initialBatchId={batch || null} role={session.role} />;
}
