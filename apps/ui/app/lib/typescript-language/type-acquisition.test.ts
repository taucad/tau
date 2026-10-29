import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { EditorDocument } from '#lib/editor-document.js';
import { TypeAcquisitionController } from '#lib/typescript-language/type-acquisition.js';

const declarations = 'export declare const size: number;';

function fixture(options: Partial<ConstructorParameters<typeof TypeAcquisitionController>[0]> = {}) {
  const setExtraLib = vi.fn(async (_uri: string, _text: string) => undefined);
  const controller = new TypeAcquisitionController({
    client: { setExtraLib },
    staticTypes: [],
    dynamicTypes: true,
    ...options,
  });
  return { controller, setExtraLib };
}

async function scan(controller: TypeAcquisitionController, text: string): Promise<void> {
  controller.watch(new EditorDocument('main.ts', text));
  await vi.advanceTimersByTimeAsync(500);
}

describe('TypeAcquisitionController', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  it('inserts actual static declaration bytes and metadata without fetching', async () => {
    const fetch = vi.fn();
    vi.stubGlobal('fetch', fetch);
    const { controller, setExtraLib } = fixture({
      staticTypes: [
        {
          packageName: '@taucad/kernel',
          content: declarations,
          filePath: 'file:///node_modules/@taucad/kernel/dist/index.d.ts',
          packageJsonContent: '{"name":"@taucad/kernel","types":"dist/index.d.ts"}',
        },
      ],
    });
    await controller.initialize();
    await scan(controller, "import { size } from '@taucad/kernel';");
    expect(setExtraLib).toHaveBeenCalledWith('file:///node_modules/@taucad/kernel/dist/index.d.ts', declarations);
    expect(setExtraLib).toHaveBeenCalledWith(
      'file:///node_modules/@taucad/kernel/package.json',
      '{"name":"@taucad/kernel","types":"dist/index.d.ts"}',
    );
    expect(fetch).not.toHaveBeenCalled();
    controller.dispose();
  });

  it('skips relative imports and loads scoped package subpaths from their locked version', async () => {
    const fetch = vi.fn(async (input: string) =>
      input.endsWith('.d.ts')
        ? new Response(declarations)
        : new Response('', { headers: { 'X-TypeScript-Types': '/@scope/pkg@2.4.1/index.d.ts' } }),
    );
    vi.stubGlobal('fetch', fetch);
    const { controller, setExtraLib } = fixture({
      readProjectFile: async (path) =>
        path === 'package-lock.json'
          ? JSON.stringify({ packages: { 'node_modules/@scope/pkg': { version: '2.4.1' } } })
          : undefined,
    });
    await scan(controller, "import './local.js'; import { size } from '@scope/pkg/subpath';");
    expect(fetch).toHaveBeenCalledWith('https://esm.sh/@scope/pkg@2.4.1', expect.any(Object));
    expect(setExtraLib).toHaveBeenCalledWith(
      'file:///node_modules/@scope/pkg/index.d.ts',
      expect.stringContaining(declarations),
    );
    controller.dispose();
  });

  it('aliases real CDN imports to the package declaration without a synthetic success', async () => {
    const fetch = vi.fn(async (input: string) =>
      input.endsWith('.d.ts')
        ? new Response(declarations)
        : new Response('', { headers: { 'X-TypeScript-Types': '/lodash@4.17.21/index.d.ts' } }),
    );
    vi.stubGlobal('fetch', fetch);
    const { controller, setExtraLib } = fixture();
    const cdn = 'https://cdn.jsdelivr.net/npm/lodash@4.17.21/lodash.js';
    await scan(controller, `import _ from '${cdn}';`);
    expect(setExtraLib).toHaveBeenCalledWith(
      'file:///node_modules/lodash/index.d.ts',
      expect.stringContaining(declarations),
    );
    expect(setExtraLib).toHaveBeenCalledWith(
      `file:///cdn-types/${encodeURIComponent(cdn)}.d.ts`,
      expect.stringContaining(`declare module '${cdn}'`),
    );
    controller.dispose();
  });

  it('retries a failed type fetch after the bounded delay', async () => {
    const fetch = vi
      .fn()
      .mockRejectedValueOnce(new Error('offline'))
      .mockResolvedValueOnce(new Response('', { headers: { 'X-TypeScript-Types': '/pkg/index.d.ts' } }))
      .mockResolvedValueOnce(new Response(declarations));
    vi.stubGlobal('fetch', fetch);
    const { controller, setExtraLib } = fixture();
    const document = new EditorDocument('main.ts', "import 'pkg';");
    controller.watch(document);
    await vi.advanceTimersByTimeAsync(500);
    expect(fetch).toHaveBeenCalledTimes(1);
    document.apply({
      expectedVersion: document.version,
      origin: 'view',
      changes: [{ from: document.text.length, to: document.text.length, insert: '\n' }],
    });
    await vi.advanceTimersByTimeAsync(500);
    expect(fetch).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(60_000);
    document.apply({
      expectedVersion: document.version,
      origin: 'view',
      changes: [{ from: document.text.length, to: document.text.length, insert: '\n' }],
    });
    await vi.advanceTimersByTimeAsync(500);
    expect(fetch).toHaveBeenCalledTimes(3);
    expect(setExtraLib).toHaveBeenCalledWith(
      'file:///node_modules/pkg/index.d.ts',
      expect.stringContaining(declarations),
    );
    controller.dispose();
  });

  it('uses declarations from the exact installed lock version before requesting the CDN', async () => {
    const fetch = vi.fn();
    vi.stubGlobal('fetch', fetch);
    const { controller, setExtraLib } = fixture({
      readProjectFile: async (path) => {
        if (path === 'package-lock.json') {
          return JSON.stringify({ packages: { 'node_modules/pkg': { version: '1.2.3' } } });
        }
        if (path === 'node_modules/pkg/package.json') {
          return '{"name":"pkg","version":"1.2.3","types":"dist/index.d.ts"}';
        }
        return path === 'node_modules/pkg/dist/index.d.ts' ? declarations : undefined;
      },
    });
    await scan(controller, "import 'pkg';");
    expect(setExtraLib).toHaveBeenCalledWith(
      'file:///node_modules/pkg/index.d.ts',
      expect.stringContaining(declarations),
    );
    expect(fetch).not.toHaveBeenCalled();
    controller.dispose();
  });

  it('ignores installed declarations from a mismatched lock version', async () => {
    const fetch = vi.fn(async (input: string) =>
      input.endsWith('.d.ts')
        ? new Response(declarations)
        : new Response('', { headers: { 'X-TypeScript-Types': '/pkg@2.0.0/index.d.ts' } }),
    );
    vi.stubGlobal('fetch', fetch);
    const { controller } = fixture({
      readProjectFile: async (path) => {
        if (path === 'package-lock.json') {
          return JSON.stringify({ packages: { 'node_modules/pkg': { version: '2.0.0' } } });
        }
        if (path === 'node_modules/pkg/package.json') {
          return '{"name":"pkg","version":"1.0.0","types":"index.d.ts"}';
        }
        return path === 'node_modules/pkg/index.d.ts' ? 'declare const wrong: string;' : undefined;
      },
    });
    await scan(controller, "import 'pkg';");
    expect(fetch).toHaveBeenCalledWith('https://esm.sh/pkg@2.0.0', expect.any(Object));
    controller.dispose();
  });

  it('does not invent declarations when the CDN has no TypeScript header', async () => {
    const fetch = vi.fn(async () => new Response('export const runtime = 1;'));
    vi.stubGlobal('fetch', fetch);
    const { controller, setExtraLib } = fixture();
    await scan(controller, "import 'untyped';");
    expect(fetch).toHaveBeenCalledOnce();
    expect(setExtraLib).not.toHaveBeenCalled();
    controller.dispose();
  });

  it('keeps the locked acquisition profile entirely offline', async () => {
    const fetch = vi.fn();
    vi.stubGlobal('fetch', fetch);
    const { controller } = fixture({ dynamicTypes: false });
    await scan(controller, "import 'unmounted';");
    expect(fetch).not.toHaveBeenCalled();
    controller.dispose();
  });
});
