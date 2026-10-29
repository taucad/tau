import { ENV } from '#environment.config.js';

/** Runtime defense for a staging artifact accidentally served with production configuration. */
export const isObservabilityHarnessEnabled = (): boolean =>
  import.meta.env.TAU_OBSERVABILITY_HARNESS === 'enabled' && ENV.TAU_DEBUG && ENV.SENTRY_ENVIRONMENT === 'staging';

/** Read only a bounded, opaque run id on the harness route; never retain arbitrary query values. */
export const observabilityHarnessTags = (): Readonly<Record<string, string>> => {
  // oxlint-disable-next-line @typescript-eslint/no-unnecessary-condition -- location is absent during SSR.
  if (!isObservabilityHarnessEnabled() || globalThis.location === undefined) {
    return {};
  }
  const url = new URL(globalThis.location.href);
  const run = url.searchParams.get('e2e_run');
  return url.pathname === '/__debug/observability' && run !== null && /^[\w-]{1,128}$/u.test(run)
    ? // eslint-disable-next-line @typescript-eslint/naming-convention -- Sentry query tag contract.
      { e2e_run: run }
    : {};
};

/** A fresh harness navigation disables the SDK before its first import, exercising the real fallback. */
export const isObservabilityHarnessDirect = (): boolean =>
  isObservabilityHarnessEnabled() &&
  // oxlint-disable-next-line @typescript-eslint/no-unnecessary-condition -- location is absent during SSR.
  globalThis.location?.pathname === '/__debug/observability' &&
  new URLSearchParams(globalThis.location.search).get('trigger') === 'direct';
