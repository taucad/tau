// @vitest-environment node
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { isObservabilityHarnessBuild } from '#lib/observability-harness-gate.js';

const appDirectory = fileURLToPath(new URL('../', import.meta.url));

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  vi.resetModules();
});

describe('observability harness build boundary', () => {
  it.each([
    ['staging', 'true', true],
    ['staging', '1', true],
    ['staging', undefined, false],
    ['production', 'true', false],
    [undefined, 'true', false],
  ])('should admit environment %s with debug %s only when explicitly staging', (environment, debug, expected) => {
    // eslint-disable-next-line @typescript-eslint/naming-convention -- Build environment names.
    expect(isObservabilityHarnessBuild({ SENTRY_ENVIRONMENT: environment, TAU_DEBUG: debug })).toBe(expected);
  });

  it.each(['production', 'staging'])(
    'should register the harness only in staging, not %s by default',
    async (environment) => {
      vi.stubGlobal('__reactRouterAppDirectory', path.resolve(appDirectory));
      vi.stubEnv('TAU_DEBUG', 'true');
      vi.stubEnv('SENTRY_ENVIRONMENT', environment);
      const { default: routes } = await import('../routes.js');
      const entries = await routes;
      const route = entries.find((entry) => entry.path === '__debug/observability');
      if (environment === 'staging') {
        expect(route).toMatchObject({
          path: '__debug/observability',
          file: 'routes/[__debug].observability/route.tsx',
        });
      } else {
        expect(route).toBeUndefined();
      }
    },
  );
  it.each(['desktop', 'serve'])('should omit the server-only harness from the %s SPA', async (target) => {
    vi.stubGlobal('__reactRouterAppDirectory', path.resolve(appDirectory, '..', target, 'app'));
    vi.stubEnv('TAU_DEBUG', 'true');
    vi.stubEnv('SENTRY_ENVIRONMENT', 'staging');
    const { default: routes } =
      target === 'desktop' ? await import('../../desktop/app/routes.js') : await import('../../serve/app/routes.js');
    const entries = await routes;
    expect(entries.some((entry) => entry.path === '__debug/observability')).toBe(false);
  });
});
