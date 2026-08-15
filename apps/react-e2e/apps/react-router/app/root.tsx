import type { ReactNode } from 'react';
import { Outlet, Scripts } from 'react-router';

type LayoutProperties = {
  readonly children: ReactNode;
};

export function Layout({ children }: LayoutProperties): ReactNode {
  return (
    <html lang='en'>
      <head>
        <meta charSet='utf-8' />
        <meta name='viewport' content='width=device-width, initial-scale=1' />
        <title>Tau React Router Runtime E2E</title>
      </head>
      <body>
        {children}
        <Scripts />
      </body>
    </html>
  );
}

export default function App(): ReactNode {
  return <Outlet />;
}
