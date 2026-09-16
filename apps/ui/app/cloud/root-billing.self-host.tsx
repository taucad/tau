import type { ReactNode } from 'react';
import { AuthConfigProvider } from '#providers/auth-provider.js';

export function CloudRootBoundary({ children }: { readonly children: ReactNode }): React.JSX.Element {
  return <AuthConfigProvider>{children}</AuthConfigProvider>;
}

export const useCloudPaymentActionReturn = (): void => {
  // Self-host builds have no payment return state.
};
