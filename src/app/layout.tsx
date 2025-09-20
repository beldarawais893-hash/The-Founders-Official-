import type { Metadata } from 'next';
import './globals.css';
import { Toaster } from '@/components/ui/toaster';
import React from 'react';
import { Space_Grotesk } from 'next/font/google';
import { LoadingProvider } from '@/contexts/loading-context';
import LoadingOverlay from '@/components/loading-overlay';

const spaceGrotesk = Space_Grotesk({
  subsets: ['latin'],
  display: 'swap',
  variable: '--font-space-grotesk',
});

export const metadata: Metadata = {
  title: 'The Founders',
  description: 'Tournament Registration Page for The Founders Official',
  manifest: '/manifest.json',
  themeColor: '#ffffff',
  appleWebApp: {
    capable: true,
    statusBarStyle: 'black-translucent',
    title: 'The Founders',
  },
  icons: {
    icon: 'data:image/svg+xml,<svg xmlns=%22http://www.w3.org/2000/svg%22 viewBox=%220 0 100%22><text y=%22.9em%22 font-size=%2290%22>🎮</text></svg>',
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className={`${spaceGrotesk.variable}`} suppressHydrationWarning>
      <head>
        
      </head>
      <body className="font-sans antialiased bg-background text-foreground">
        <LoadingProvider>
          <LoadingOverlay />
          {children}
          <Toaster />
        </LoadingProvider>
      </body>
    </html>
  );
  }
