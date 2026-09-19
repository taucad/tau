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
    expect(manifest).not.toContain('../../app/routes/usage/');
  });

  /* The `tau://` contract main loads against (R4). `/i/*` is a server redirect,
     so `tau://i/<repo>` lands on `/import/<repo>` instead; `/s/:slug` keeps its
     path and swaps its module, because SPA mode admits no server `loader`. */
  it('should carry every page a tau:// content link resolves to', () => {
    const manifest = JSON.stringify(routes);

    expect(manifest).toContain('../../app/routes/import.$/route.tsx');
    expect(manifest).toContain('../../app/routes/invitations.$token/route.tsx');
    expect(manifest).toContain('../../app/routes/s.$slug/desktop-route.tsx');
    expect(manifest).not.toContain('../../app/routes/i.$/');
    expect(manifest).not.toContain('"file":"../../app/routes/s.$slug/route.tsx"');
    expect(manifest).not.toContain('../../app/routes/auth.desktop/');
  });

  /* One route, one path: the desktop module replaces the web one rather than
     adding a second `/s/:slug`, and no sibling in that folder becomes a route
     of its own. */
  it('should serve the shared file from exactly one route', () => {
    const shareRoutes = routes.filter((entry) => entry.path === 's/:slug');

    expect(shareRoutes).toEqual([expect.objectContaining({ file: '../../app/routes/s.$slug/desktop-route.tsx' })]);
  });
});
