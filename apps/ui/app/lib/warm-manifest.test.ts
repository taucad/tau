// @vitest-environment node
import { describe, expect, it } from 'vitest';
import {
  isSendWarmableHref,
  isWarmableHref,
  parseWarmManifest,
  sendHrefs,
  warmHrefs,
  warmManifestFile,
} from '#lib/warm-manifest.js';
import type { WarmManifest } from '#lib/warm-manifest.js';

const manifest: WarmManifest = {
  version: 1,
  classes: {
    home: ['/assets/entry.client-a.js', '/assets/root-b.css'],
    project: [
      '/assets/entry.client-a.js',
      '/assets/root-b.css',
      '/assets/project-live-sessions-c.js',
      '/assets/replicad_single-d.wasm',
      '/assets/kernel.worker-e.js',
      'https://cdn.example/assets/f.js',
    ],
  },
};

describe('isWarmableHref', () => {
  it.each(['/assets/route-AbC_9.js', '/assets/root-b.css', '/assets/chat-interface-desktop-x~y.js'])(
    'should accept the build asset %s',
    (href) => {
      expect(isWarmableHref(href)).toBe(true);
    },
  );

  it.each([
    '/assets/replicad_single-d.wasm',
    '/assets/kernel.worker-e.js',
    '/assets/esbuild-Worker-f.js',
    '/assets/sub/dir.js',
    '/fonts/inter.woff2',
    '/__shell/home/index.html',
    'https://cdn.example/assets/f.js',
    '//cdn.example/assets/f.js',
    '/assets/route.js?worker',
  ])('should refuse %s', (href) => {
    expect(isWarmableHref(href)).toBe(false);
  });
});

describe('parseWarmManifest', () => {
  it('should read version 1', () => {
    expect(parseWarmManifest(structuredClone(manifest))).toEqual(manifest);
  });

  it.each([
    ['null', null],
    ['another version', { version: 2, classes: {} }],
    ['no classes', { version: 1 }],
    ['a non-list class', { version: 1, classes: { home: '/assets/a.js' } }],
    ['a non-string file', { version: 1, classes: { home: [1] } }],
  ])('should refuse %s', (_label, value) => {
    expect(parseWarmManifest(value)).toBeUndefined();
  });

  it('should be served from the shell directory of the client build', () => {
    expect(warmManifestFile).toBe('__shell/warm.json');
  });
});

describe('warmHrefs', () => {
  it("should list the target's files less the loaded class's, and never a wasm, worker or foreign URL", () => {
    expect(warmHrefs(manifest, 'project', 'home')).toEqual(['/assets/project-live-sessions-c.js']);
  });

  it('should list every warmable file when nothing is loaded', () => {
    expect(warmHrefs(manifest, 'home')).toEqual(['/assets/entry.client-a.js', '/assets/root-b.css']);
  });

  it('should list nothing for an unknown class', () => {
    expect(warmHrefs(manifest, 'publication', 'home')).toEqual([]);
  });
});

describe('the send tier (WP-12 step 2)', () => {
  it('should accept worker-imported code but never a worker entry, wasm or a foreign URL', () => {
    expect(isSendWarmableHref('/assets/agent-host.impl-a.js')).toBe(true);
    expect(isSendWarmableHref('/assets/three.module-b.js')).toBe(true);
    expect(isSendWarmableHref('/assets/agent-host.worker-c.js')).toBe(false);
    expect(isSendWarmableHref('/assets/replicad-d.wasm')).toBe(false);
    expect(isSendWarmableHref('https://cdn.example/assets/e.js')).toBe(false);
  });

  it('should read a send tier, drop an unreadable one alone, and list only send-warmable URLs', () => {
    const parsed = parseWarmManifest({
      version: 1,
      classes: { project: ['/assets/a.js'] },
      send: { project: ['/assets/agent-host.impl-a.js', '/assets/k.worker-b.js'], broken: [1] },
    });
    expect(parsed?.classes).toEqual({ project: ['/assets/a.js'] });
    expect(parsed?.send).toEqual({ project: ['/assets/agent-host.impl-a.js', '/assets/k.worker-b.js'] });
    expect(parsed === undefined ? [] : sendHrefs(parsed, 'project')).toEqual(['/assets/agent-host.impl-a.js']);
    expect(parseWarmManifest({ version: 1, classes: {} })?.send).toBeUndefined();
  });
});
