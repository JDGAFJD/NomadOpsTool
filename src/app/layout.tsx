import type { Metadata } from 'next';
import './globals.css';
import AppLayoutWrapper from '@/components/AppLayoutWrapper';
import { ThemeProvider } from '@/components/ThemeProvider';

export const metadata: Metadata = {
  title: 'Nomad NOC — Operations Center',
  description: 'Nomad Internet Network Operations Center',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" data-theme="light" suppressHydrationWarning>
      <body suppressHydrationWarning>
        <ThemeProvider>
          <AppLayoutWrapper>
            {children}
          </AppLayoutWrapper>
        </ThemeProvider>
      </body>
    </html>
  );
}
