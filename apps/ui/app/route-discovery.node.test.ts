// @vitest-environment node
/**
 * Route discovery stays eager. With lazy discovery a phone tap on a sidebar row whose link had
 * only just mounted in the sheet waited on its own `/__manifest` round trip before navigating
 * (see `routeDiscovery` in `react-router.config.ts`).
 */
import { describe, expect, it } from 'vitest';
// oxlint-disable-next-line eslint/no-restricted-imports -- the build configuration lives one directory above the app alias root.
import config from '../react-router.config.js';

describe('route discovery', () => {
  it('ships every route on boot so no navigation waits on /__manifest', () => {
    expect(config.routeDiscovery).toEqual({ mode: 'initial' });
  });

  it('keeps server rendering, which lazy discovery would otherwise default to', () => {
    expect(config.ssr).toBe(true);
  });
});
