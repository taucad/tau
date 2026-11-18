// @vitest-environment node
import path from 'node:path';
import { describe, expect, it, vi } from 'vitest';

(globalThis as typeof globalThis & { __reactRouterAppDirectory?: string }).__reactRouterAppDirectory =
  import.meta.dirname;
const { default: routes } = await import('./routes.js');

describe('desktop route manifest', () => {
  it('should serve the same Parts catalog route in the desktop app', () => {
    expect(routes.find((entry) => entry.path === 'parts')).toEqual(
      expect.objectContaining({ file: '../../app/routes/parts/route.tsx' }),
    );
  });

  it('should omit legal and cookie routes while retaining browser auth handoff', () => {
    const manifest = JSON.stringify(routes);

    expect(manifest).not.toContain('legal');
    expect(manifest).not.toContain('cookie');
    expect(manifest).not.toContain('../../app/routes/vision/');
    expect(manifest).toContain('auth.$');
    expect(manifest).toContain('home-surface.desktop.tsx');
    expect(manifest).not.toContain('"file":"../../app/routes/_index/route.tsx"');
    expect(manifest).not.toContain('../../app/routes/usage/');
  });

  /* The `tau://` contract main loads against (R4). `/i/*` is a server redirect,
     so `tau://i/<repo>` lands on `/import/<repo>` instead; `/s/:slug` and
     `/invitations/:token` keep their paths and swap their modules, because SPA
     mode admits no server `loader`. */
  it('should carry every page a tau:// content link resolves to', () => {
    const manifest = JSON.stringify(routes);

    expect(manifest).toContain('../../app/routes/import.$/route.tsx');
    expect(manifest).toContain('../../app/routes/invitations.$token/desktop-route.tsx');
    expect(manifest).toContain('../../app/routes/invitations._index/route.tsx');
    expect(manifest).not.toContain('"file":"../../app/routes/invitations.$token/route.ts"');
    expect(manifest).toContain('../../app/routes/s.$slug/desktop-route.tsx');
    expect(manifest).not.toContain('../../app/routes/i.$/');
    expect(manifest).not.toContain('"file":"../../app/routes/s.$slug/route.tsx"');
    expect(manifest).not.toContain('../../app/routes/auth.desktop/');
  });

  /* Setup runs on the desktop too: its module has no server export. */
  it('should serve setup at /welcome', () => {
    expect(routes.find((entry) => entry.path === 'welcome')).toEqual(
      expect.objectContaining({ file: '../../app/routes/welcome/route.tsx' }),
    );
  });

  /* One route, one path: the desktop module replaces the web one rather than
     adding a second `/s/:slug`, and no sibling in that folder becomes a route
     of its own. */
  it('should serve the shared file from exactly one route', () => {
    const shareRoutes = routes.filter((entry) => entry.path === 's/:slug');

    expect(shareRoutes).toEqual([expect.objectContaining({ file: '../../app/routes/s.$slug/desktop-route.tsx' })]);
  });

  /* Windows: `path.relative` answers with backslashes. `flatRoutes` normalised a file's relative path but not a
     folder's, and this manifest's out-of-tree root makes it `..\\..\\app\\routes\\<folder>`, which the default
     dot-file ignore matches, so a Windows build dropped every folder route and served a blank Home
     (tools/pnpm/patches/@react-router__fs-routes@8.5.1.patch). */
  it('should keep every route when paths are resolved with Windows separators', async () => {
    const posixRelative = path.relative;
    const relative = vi
      .spyOn(path, 'relative')
      .mockImplementation((from, to) => posixRelative(from, to).replaceAll('/', '\\'));
    try {
      vi.resetModules();
      const { default: windowsRoutes } = await import('./routes.js');

      expect(relative).toHaveBeenCalled();
      expect(windowsRoutes).toHaveLength(routes.length);
    } finally {
      relative.mockRestore();
    }
  });
});
