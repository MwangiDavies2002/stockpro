import type { Metadata, Viewport } from 'next';
import './globals.css';
import {Suspense} from 'react';
import AccessBoundary from './components/AccessBoundary';
import ThemeProvider from './components/ThemeProvider';
import { Toaster } from 'sonner';



export const metadata: Metadata = {
  title: 'StockPro ',
  description: 'Real-time bar inventory management with M-Pesa integration',
  manifest:'/manifest.json',
   appleWebApp: {
    capable: true,
    statusBarStyle: 'default',
    title: 'StockPro',
  },
};

export const viewport: Viewport = {
  themeColor: '#354f43',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body>
        <ThemeProvider>
        <Suspense fallback={<p className="p-8">Loading workspace...</p>}><AccessBoundary>{children}</AccessBoundary></Suspense>
        <footer className="site-footer"><span>StockPro</span><a href="/terms">Terms of use</a><a href="/privacy">Privacy</a></footer>
        <Toaster position="top-right" duration={2500} />
        </ThemeProvider>
      </body>
    </html>
  );
}
