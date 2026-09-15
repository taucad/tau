// @vitest-environment node
import { describe, expect, it } from 'vitest';

(globalThis as typeof globalThis & { __reactRouterAppDirectory?: string }).__reactRouterAppDirectory =
  import.meta.dirname;
const { default: routes } = await import('./routes.js');

describe('desktop route manifest', () => {
  it('should omit legal and cookie routes while retaining browser auth handoff', () => {
    const manifest = JSON.stringify(routes);

    expect(manifest).not.toContain('legal');
    expect(manifest).not.toContain('cookie');
    expect(manifest).toContain('auth.$');
    expect(manifest).toContain('home-surface.desktop.tsx');
    expect(manifest).not.toContain('"file":"../../app/routes/_index/route.tsx"');
  });
});
