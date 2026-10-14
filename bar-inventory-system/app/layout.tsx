import type { Metadata, Viewport } from 'next';
import { Inter } from 'next/font/google';
import './globals.css';
import { Toaster } from 'sonner';

const inter = Inter({ subsets: ['latin'] });

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
  themeColor: '#16a34a',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className={inter.className}>
        {children}
        <Toaster position="top-right" richColors />
      </body>
    </html>
  );
}
