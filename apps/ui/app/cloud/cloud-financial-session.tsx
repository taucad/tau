import { createContext, useContext } from 'react';
import type { ReactNode } from 'react';

/**
 * The financial session the Cloud chunk's payment return captures for each request (I5, D17), handed in by Core: the
 * root boundary of a pinned `cloud` build, or `CloudSurface` in an adaptive one. A Cloud-only context, so the chunk
 * reads the session without importing the Core provider module (gate G1, one-way dependency).
 */
export type CloudFinancialSession = Readonly<{
  capture: () => Readonly<{ generation: number; signal: AbortSignal; isCurrent: () => boolean }>;
}>;

const CloudFinancialSessionContext = createContext<CloudFinancialSession | undefined>(undefined);

/**
 * Provides the financial session to the Cloud surfaces below it.
 *
 * @param props - The session and the surfaces.
 * @returns The provider.
 */
export function CloudFinancialSessionProvider({
  value,
  children,
}: {
  readonly value: CloudFinancialSession | undefined;
  readonly children: ReactNode;
}): React.JSX.Element {
  return <CloudFinancialSessionContext value={value}>{children}</CloudFinancialSessionContext>;
}

/**
 * The financial session Core handed to the Cloud surfaces.
 *
 * @returns The session.
 * @throws When no Core boundary provided one.
 */
export const useCloudFinancialSession = (): CloudFinancialSession => {
  const value = useContext(CloudFinancialSessionContext);
  if (value === undefined) {
    throw new Error('The financial session was not handed to the Cloud surfaces');
  }
  return value;
};
