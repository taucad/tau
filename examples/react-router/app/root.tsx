import type { ReactNode } from 'react';
import { Links, Meta, Outlet, Scripts, ScrollRestoration } from 'react-router';
import './globals.css';

type LayoutProperties = {
  readonly children: ReactNode;
};

export function Layout({ children }: LayoutProperties): ReactNode {
  return (
    <html lang='en' className='bg-slate-950 text-slate-100 scheme-dark'>
      <head>
        <meta charSet='utf-8' />
        <meta name='viewport' content='width=device-width, initial-scale=1' />
        <Meta />
        <Links />
      </head>
      <body className='bg-slate-950 min-h-screen font-sans antialiased'>
        {children}
        <ScrollRestoration />
        <Scripts />
      </body>
    </html>
  );
}

export default function App(): ReactNode {
  return <Outlet />;
}
