import { createContext, useContext } from 'react';
import type { ReactNode } from 'react';

export type Analytics = {
  readonly capture: (event: string, properties?: Readonly<Record<string, unknown>>) => void;
  readonly captureException: (error: unknown, properties?: Readonly<Record<string, unknown>>) => void;
};

const noopAnalytics: Analytics = {
  capture: () => undefined,
  captureException: () => undefined,
};

const AnalyticsContext = createContext<Analytics>(noopAnalytics);

export function AnalyticsContextProvider({
  analytics,
  children,
}: {
  readonly analytics: Analytics;
  readonly children: ReactNode;
}): React.JSX.Element {
  return <AnalyticsContext.Provider value={analytics}>{children}</AnalyticsContext.Provider>;
}

/** Host-neutral analytics access. Desktop receives the no-op default. */
export function useAnalytics(): Analytics {
  return useContext(AnalyticsContext);
}
