import type { JSX } from 'react';
import { isObservabilityHarnessEnabled } from '#lib/observability-harness-context.js';

/** Sits outside the filesystem loading gate so the application's own hydrateRoot sees a real mismatch. */
export const ObservabilityHarnessHydrationProbe = ({
  pathname,
  search,
}: {
  readonly pathname: string;
  readonly search: string;
}): JSX.Element | undefined => {
  if (
    !isObservabilityHarnessEnabled() ||
    pathname !== '/__debug/observability' ||
    new URLSearchParams(search).get('trigger') !== 'hydration'
  ) {
    return undefined;
  }
  // oxlint-disable-next-line @typescript-eslint/no-unnecessary-condition -- location is absent during SSR.
  const text = globalThis.location === undefined ? 'Hydration server fixture' : 'Hydration browser fixture';
  return <span hidden>{text}</span>;
};
