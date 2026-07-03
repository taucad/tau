import type { ReactNode } from 'react';
import './globals.css';

export const metadata = {
  title: 'Tau Runtime Next.js Example',
  description: 'Next.js Turbopack example for @taucad/runtime with Replicad in a web worker.',
};

export default function RootLayout({ children }: { children: ReactNode }): ReactNode {
  return (
    <html lang='en' className='bg-slate-950 text-slate-100 scheme-dark'>
      <body className='bg-slate-950 min-h-screen font-sans antialiased'>{children}</body>
    </html>
  );
}
