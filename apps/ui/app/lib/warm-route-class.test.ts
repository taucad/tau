import { afterEach, describe, expect, it, vi } from 'vitest';
import { warmRouteClass, warmSendTier } from '#lib/warm-route-class.js';
import type { WarmTarget } from '#lib/warm-route-class.js';
import { warmManifestPath } from '#lib/warm-manifest.js';

const manifest = {
  version: 1,
  classes: {
    home: ['/assets/entry.client-a.js', '/assets/root-b.css'],
    project: [
      '/assets/entry.client-a.js',
      '/assets/root-b.css',
      '/assets/project-live-sessions-c.js',
      '/assets/chat-interface-desktop-d.js',
      '/assets/chat-interface-d.css',
      '/assets/replicad_single-e.wasm',
      '/assets/kernel.worker-f.js',
      '/assets/three.module-g.js?worker',
      'https://cdn.example/assets/h.js',
      '/fonts/inter.woff2',
    ],
  },
};

const hostWith = (respond: () => Promise<Pick<Response, 'ok' | 'json'>>) => {
  const fetch = vi.fn(async (_input: string, _init?: RequestInit) => respond());
  const host: WarmTarget = { document, fetch };
  return { host, fetch };
};

const prefetchLinks = (): string[] =>
  [...document.head.querySelectorAll('link[rel="prefetch"]')].map((link) => link.getAttribute('href') ?? '');

describe('warmRouteClass', () => {
  afterEach(() => {
    document.head.replaceChildren();
  });

  it("should prefetch the project tier beyond Home's, at low priority, and never a wasm, worker or foreign URL", async () => {
    const { host, fetch } = hostWith(async () => ({ ok: true, json: async () => manifest }));
    const warmed = await warmRouteClass({ target: 'project', loaded: 'home', host });
    expect(fetch).toHaveBeenCalledExactlyOnceWith(warmManifestPath, { credentials: 'same-origin', priority: 'low' });
    expect(warmed).toEqual([
      '/assets/project-live-sessions-c.js',
      '/assets/chat-interface-desktop-d.js',
      '/assets/chat-interface-d.css',
    ]);
    expect(prefetchLinks()).toEqual(warmed);
    expect(document.head.querySelectorAll('link[rel="modulepreload"], link[rel="preload"]')).toHaveLength(0);
  });

  it('should skip a file the document already references', async () => {
    const existing = document.createElement('link');
    existing.rel = 'modulepreload';
    existing.setAttribute('href', '/assets/project-live-sessions-c.js');
    document.head.append(existing);
    const { host } = hostWith(async () => ({ ok: true, json: async () => manifest }));
    await expect(warmRouteClass({ target: 'project', loaded: 'home', host })).resolves.toEqual([
      '/assets/chat-interface-desktop-d.js',
      '/assets/chat-interface-d.css',
    ]);
  });

  it.each([
    ['a missing manifest', async () => ({ ok: false, json: async () => manifest })],
    ['another version', async () => ({ ok: true, json: async () => ({ ...manifest, version: 2 }) })],
    [
      'a malformed body',
      async () => ({
        ok: true,
        json: async () => {
          throw new SyntaxError('Unexpected token');
        },
      }),
    ],
    [
      'a failed request',
      async () => {
        throw new TypeError('Failed to fetch');
      },
    ],
  ])('should warm nothing for %s', async (_label, respond) => {
    const { host } = hostWith(respond);
    await expect(warmRouteClass({ target: 'project', loaded: 'home', host })).resolves.toEqual([]);
    expect(prefetchLinks()).toEqual([]);
  });
});

describe('warmSendTier (WP-12 step 2)', () => {
  afterEach(() => {
    document.head.replaceChildren();
  });

  it('should prefetch the send tier, heavy and worker-imported code included, never a worker entry or wasm', async () => {
    const send = [
      '/assets/three.module-g.js',
      '/assets/agent-host.impl-h.js',
      '/assets/agent-host.worker-i.js',
      '/assets/replicad_single-e.wasm',
      '/assets/cad-viewer-j.css',
    ];
    const { host } = hostWith(async () => ({ ok: true, json: async () => ({ ...manifest, send: { project: send } }) }));
    const script = document.createElement('script');
    script.src = '/assets/three.module-g.js';
    script.setAttribute('src', '/assets/three.module-g.js');
    document.head.append(script);
    expect(await warmSendTier({ target: 'project', host })).toEqual([
      '/assets/agent-host.impl-h.js',
      '/assets/cad-viewer-j.css',
    ]);
    expect(prefetchLinks()).toEqual(['/assets/agent-host.impl-h.js', '/assets/cad-viewer-j.css']);
  });

  it('should warm nothing for a manifest without a send tier, or one that cannot be read', async () => {
    expect(
      await warmSendTier({
        target: 'project',
        host: hostWith(async () => ({ ok: true, json: async () => manifest })).host,
      }),
    ).toEqual([]);
    expect(
      await warmSendTier({
        target: 'project',
        host: hostWith(async () => {
          throw new Error('offline');
        }).host,
      }),
    ).toEqual([]);
    expect(prefetchLinks()).toEqual([]);
  });
});
