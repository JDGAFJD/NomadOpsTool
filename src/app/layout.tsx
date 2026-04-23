import type { Metadata } from 'next';
import './globals.css';
import Link from 'next/link';
import { Inbox, Settings, Ticket } from 'lucide-react';
import AppLayoutWrapper from '@/components/AppLayoutWrapper';

export const metadata: Metadata = {
  title: 'Nomad Ticket Workspace',
  description: 'Distraction-free single ticket resolution workspace.',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body suppressHydrationWarning>
        <AppLayoutWrapper>
          {children}
        </AppLayoutWrapper>
      </body>
    </html>
  );
}
