import type { Metadata } from 'next';
import { Inter } from 'next/font/google';
import { Toaster } from 'react-hot-toast';
import { Providers } from './providers';
import './globals.css';

const inter = Inter({ subsets: ['latin'] });

export const metadata: Metadata = {
  title: 'TN Land Verify — Tamil Nadu Land Records Verification',
  description:
    'Verify Tamil Nadu land records, check encumbrances, and get risk analysis before property purchase.',
  keywords: ['Tamil Nadu land records', 'EC certificate', 'Patta Chitta', 'land verification'],
  openGraph: {
    title: 'TN Land Verify',
    description: 'Smart land verification for Tamil Nadu properties',
    type: 'website',
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className="h-full">
      <body className={`${inter.className} h-full bg-gray-50 text-gray-900`}>
        <Providers>
          {children}
          <Toaster
            position="top-right"
            toastOptions={{
              duration: 4000,
              style: { fontSize: '14px' },
            }}
          />
        </Providers>
      </body>
    </html>
  );
}
