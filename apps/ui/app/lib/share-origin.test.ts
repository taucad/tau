import { afterEach, describe, expect, it, vi } from 'vitest';
import { shareOrigin } from '#lib/share-origin.js';

const clientEnvironment = globalThis.window.ENV;

afterEach(() => {
  vi.unstubAllEnvs();
  globalThis.window.ENV = clientEnvironment;
});

describe('shareOrigin', () => {
  it('should stay on the document origin on the web', () => {
    expect(shareOrigin()).toBe(globalThis.location.origin);
  });

  it('should answer the web origin on desktop, where the document is app://tau', () => {
    vi.stubEnv('TAU_TARGET', 'desktop');
    globalThis.window.ENV = {
      ...clientEnvironment,
      // eslint-disable-next-line @typescript-eslint/naming-convention -- `window.ENV`'s keys are the deployment's own environment variable names.
      TAU_FRONTEND_URL: 'https://tau.new/',
    };

    /* Nobody outside the app can open `app://tau/...`, which is what every
       `location.origin`-derived link minted on desktop
       (`docs/research/desktop-share-links-blueprint.md`, Finding 2). */
    expect(shareOrigin()).toBe('https://tau.new');
    expect(shareOrigin().startsWith('app://')).toBe(false);
  });
});
