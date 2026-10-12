import { afterEach, describe, expect, it, vi } from 'vitest';
import { legalUrl } from '#lib/legal-url.js';

const clientEnvironment = globalThis.window.ENV;

afterEach(() => {
  vi.unstubAllEnvs();
  globalThis.window.ENV = clientEnvironment;
});

describe('legalUrl', () => {
  it('should link a root-relative path on the web so each deployment opens its own legal pages', () => {
    expect(legalUrl('terms')).toBe('/legal/terms');
    expect(legalUrl('privacy#9.2.1')).toBe('/legal/privacy#9.2.1');
  });

  it.each([
    ['https://taucad.dev/', 'https://taucad.dev/legal/privacy#9.2.1'],
    ['https://tau.new', 'https://tau.new/legal/privacy#9.2.1'],
  ])('should link the web deployment a desktop shell bound to %s belongs to', (frontendUrl, expected) => {
    vi.stubEnv('TAU_TARGET', 'desktop');
    globalThis.window.ENV = {
      ...clientEnvironment,
      // eslint-disable-next-line @typescript-eslint/naming-convention -- `window.ENV`'s keys are the deployment's own environment variable names.
      TAU_FRONTEND_URL: frontendUrl,
    };

    /* The desktop build ships no `/legal/*` routes, so a relative link would open a missing `app://tau` page. */
    expect(legalUrl('privacy#9.2.1')).toBe(expected);
  });
});
