import { verifyAuth } from '@/lib/auth';
import { redirect } from 'next/navigation';

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const session = await verifyAuth();

  if (!session) {
    redirect('/ops/login');
  }

  if (session.role === 'returns_manager') {
    redirect('/ops/returns-manager');
  }

  if (session.role === 'cancellation_agent') {
    redirect('/ops/cancellation-team');
  }

  return <>{children}</>;
}
