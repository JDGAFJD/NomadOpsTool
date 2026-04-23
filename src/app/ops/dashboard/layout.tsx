import { verifyAuth } from '@/lib/auth';
import { redirect } from 'next/navigation';

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const session = await verifyAuth();

  if (!session) {
    redirect('/ops/login');
  }

  return <>{children}</>;
}
