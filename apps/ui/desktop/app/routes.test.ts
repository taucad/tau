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

  /* The `tau://` contract main loads against (R4). `/i/*` is a server redirect
     and `/s/:slug` is a server loader, so neither can be in an SPA manifest;
     `tau://i/<repo>` therefore lands on `/import/<repo>`, which is here. */
  it('should carry the import page every tau://i link resolves to', () => {
    const manifest = JSON.stringify(routes);

    expect(manifest).toContain('../../app/routes/import.$/route.tsx');
    expect(manifest).toContain('../../app/routes/invitations.$token/route.tsx');
    expect(manifest).not.toContain('../../app/routes/i.$/');
    expect(manifest).not.toContain('../../app/routes/s.$slug/');
    expect(manifest).not.toContain('../../app/routes/auth.desktop/');
  });
});
