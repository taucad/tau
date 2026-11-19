import type { ReactNode } from 'react';
import { AuthConfigProvider } from '#providers/auth-provider.js';

export function CloudRootBoundary({ children }: { readonly children: ReactNode }): React.JSX.Element {
  return <AuthConfigProvider>{children}</AuthConfigProvider>;
}

/** Self-host builds have no payment return to announce. */
export function CloudPaymentReturn(): undefined {
  return undefined;
}
