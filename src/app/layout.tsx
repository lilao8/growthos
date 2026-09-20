import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import './globals.css';

export const metadata: Metadata = {
  title: 'GrowthOS — DTC Growth Decision Workbench',
  description:
    'A portfolio workbench for DTC SEO, GEO, content, analytics and conversion decisions. Demo data only.',
};

export default function RootLayout({
  children,
}: Readonly<{ children: ReactNode }>) {
  return (
    <html lang="en">
      <body className="min-h-screen antialiased">{children}</body>
    </html>
  );
}
