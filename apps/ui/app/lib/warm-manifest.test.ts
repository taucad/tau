// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { isWarmableHref, parseWarmManifest, warmHrefs, warmManifestFile } from '#lib/warm-manifest.js';
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
