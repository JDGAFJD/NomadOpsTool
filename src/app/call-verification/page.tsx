import { redirect } from 'next/navigation';
import { verifyAuth } from '@/lib/auth';
import CallVerificationClient from './CallVerificationClient';

export default async function CallVerificationPage() {
  const session = await verifyAuth();
  if (!session) redirect('/ops/login');
  return <CallVerificationClient userEmail={session.email} />;
}
