import { createContext, useContext } from 'react';
import type { ReactNode } from 'react';

export type BillingSession = {
  readonly apiBaseUrl: string | undefined;
  readonly userId: string | undefined;
};

const signedOutSession: BillingSession = { apiBaseUrl: undefined, userId: undefined };
const BillingSessionContext = createContext<BillingSession>(signedOutSession);

export const BillingSessionProvider = ({
  children,
  value,
}: {
  readonly children: ReactNode;
  readonly value: BillingSession;
}): React.JSX.Element => <BillingSessionContext.Provider value={value}>{children}</BillingSessionContext.Provider>;

export const useBillingSession = (): BillingSession => useContext(BillingSessionContext);
