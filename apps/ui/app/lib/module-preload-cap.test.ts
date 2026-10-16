import { Readable } from 'node:stream';
import { text } from 'node:stream/consumers';

import type { EntryContext } from 'react-router';
import { describe, expect, it } from 'vitest';

import {
  capModulePreloads,
  createModulePreloadCap,
  criticalModuleHrefs,
  isNotFoundRender,
} from '#lib/module-preload-cap.js';

const contextMatching = (...routeIds: string[]): EntryContext =>
  ({
    manifest: {
      entry: { module: '/assets/entry.js', imports: ['/assets/react.js'] },
      routes: {
        root: { module: '/assets/root.js', imports: ['/assets/a.js'] },
        'routes/_index': { module: '/assets/home.js', imports: ['/assets/b.js'] },
      },
    },
    staticHandlerContext: { matches: routeIds.map((id) => ({ route: { id } })) },
  }) as unknown as EntryContext;

const preload = (href: string): string => `<link rel="modulepreload" href="${href}"/>`;

const keep = new Set(['/assets/entry.js', '/assets/root.js']);

describe('criticalModuleHrefs', () => {
  it('keeps the entry, its imports and each matched route module', () => {
    expect([...criticalModuleHrefs(contextMatching('root', 'routes/_index'))]).toEqual([
      '/assets/entry.js',
      '/assets/react.js',
      '/assets/root.js',
      '/assets/home.js',
    ]);
  });
});

describe('isNotFoundRender', () => {
  it('is true only when the catch-all route is the deepest match', () => {
    expect(isNotFoundRender(contextMatching('root', 'routes/$'))).toBe(true);
    expect(isNotFoundRender(contextMatching('root', 'routes/_index'))).toBe(false);
  });
});

describe('capModulePreloads', () => {
  it('drops module preloads outside the kept set and leaves other links alone', () => {
    const head = `<head>${preload('/assets/entry.js')}${preload('/assets/a.js')}<link rel="stylesheet" href="/x.css"/></head>`;
    expect(capModulePreloads(head, keep)).toBe(
      `<head>${preload('/assets/entry.js')}<link rel="stylesheet" href="/x.css"/></head>`,
    );
  });
});

describe('createModulePreloadCap', () => {
  it('caps a head split across chunks and streams the body untouched', async () => {
    const document = `<html><head>${preload('/assets/root.js')}${preload('/assets/b.js')}</head><body>${preload('/assets/b.js')}é</body></html>`;
    const bytes = Buffer.from(document);
    const chunks = Array.from({ length: Math.ceil(bytes.length / 7) }, (_, index) =>
      bytes.subarray(index * 7, index * 7 + 7),
    );

    const output = await text(Readable.from(chunks).pipe(createModulePreloadCap(keep)));

    expect(output).toBe(
      `<html><head>${preload('/assets/root.js')}</head><body>${preload('/assets/b.js')}é</body></html>`,
    );
  });

  it('passes a document without a head through unchanged', async () => {
    const output = await text(Readable.from([Buffer.from('<p>partial</p>')]).pipe(createModulePreloadCap(keep)));
    expect(output).toBe('<p>partial</p>');
  });
});
