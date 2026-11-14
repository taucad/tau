import type { TypeScriptWorkerCommand } from '@taucad/lsp/typescript-worker/protocol';
import ts from 'typescript';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { EditorDocument } from '#lib/editor-document.js';
import type { DeclarationImport } from '#lib/typescript-language/declaration-graph.js';
import { TypeAcquisitionController } from '#lib/typescript-language/type-acquisition.js';

const declarations = 'export declare const size: number;';

function fixture(options: Partial<ConstructorParameters<typeof TypeAcquisitionController>[0]> = {}) {
  const setExtraLib = vi.fn(async (_uri: string, _text: string) => undefined);
  const request = vi.fn(async (command: TypeScriptWorkerCommand) =>
    ts
      .preProcessFile(command.kind === 'declarationImports' ? command.text : '', true, true)
      .importedFiles.map((ref) => ({ name: ref.fileName, from: ref.pos + 1, to: ref.end + 1 })),
  );
  const controller = new TypeAcquisitionController({
    client: {
      setExtraLib,
      request: async <T>(command: TypeScriptWorkerCommand): Promise<T> => (await request(command)) as T,
    },
    staticTypes: [],
    dynamicTypes: true,
    ...options,
  });
  return { controller, setExtraLib, request };
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
    expect(fetch).toHaveBeenCalledWith('https://esm.sh/@scope/pkg@2.4.1/subpath', expect.any(Object));
    expect(setExtraLib).toHaveBeenCalledWith(expect.stringContaining('/node_modules/.tau-types/'), declarations);
    controller.dispose();
  });

  it('aliases real CDN imports to the package declaration without a synthetic success', async () => {
    const fetch = vi.fn(async (input: string) =>
      input.endsWith('.d.ts')
        ? new Response(declarations)
        : new Response('', { headers: { 'X-TypeScript-Types': '/lodash@4.17.21/index.d.ts' } }),
    );
    vi.stubGlobal('fetch', fetch);
    const { controller, setExtraLib, request } = fixture();
    const cdn = 'https://cdn.jsdelivr.net/npm/lodash@4.17.21/lodash.js';
    await scan(controller, `import _ from '${cdn}';`);
    expect(setExtraLib).toHaveBeenCalledWith(expect.stringContaining('/node_modules/.tau-types/'), declarations);
    const alias = request.mock.calls
      .flatMap(([command]) => (command.kind === 'setModuleAlias' ? [command] : []))
      .find((command) => command.specifier === cdn);
    expect(alias?.uri).toContain('/node_modules/.tau-types/');
    expect(fetch).toHaveBeenCalledWith('https://esm.sh/lodash@4.17.21/lodash.js', expect.any(Object));
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
    expect(setExtraLib).toHaveBeenCalledWith(expect.stringContaining('/node_modules/.tau-types/'), declarations);
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
      expect.stringContaining('/node_modules/.tau-types/'),
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

it('publishes a semantic revision after declarations arrive and stops after disposal', async () => {
  const { controller } = fixture({ staticTypes: [{ packageName: 'pkg', content: declarations }] });
  const changed = vi.fn();
  const stop = controller.subscribe(changed);
  await controller.initialize();
  expect(controller.revision).toBeGreaterThan(0);
  expect(changed).toHaveBeenCalledWith(controller.revision);
  stop();
  controller.dispose();
});

it('should acquire transitive bundled declarations and recover from an unavailable mount without editing', async () => {
  vi.useFakeTimers();
  let available = false;
  const files = new Map([
    ['/node_modules/a/index.d.mts', "export type { B } from 'b';"],
    ['/node_modules/b/index.d.cts', 'export type B = number;'],
  ]);
  const reader = {
    readFile: vi.fn(async (path: string) => new TextEncoder().encode(files.get(path) ?? '{}')),
    readdir: vi.fn(async (path: string) => {
      if (!available) {
        throw new Error('mount unavailable');
      }
      return [...files.keys()]
        .filter((key) => key.slice(0, key.lastIndexOf('/')) === path)
        .map((key) => key.slice(key.lastIndexOf('/') + 1));
    }),
  };
  const { controller, setExtraLib } = fixture({ dependencyReader: reader, dynamicTypes: false });
  try {
    await scan(controller, "import type { B } from 'a';");
    expect(setExtraLib).not.toHaveBeenCalled();
    available = true;
    await vi.advanceTimersByTimeAsync(60_000);
    expect(setExtraLib).toHaveBeenCalledWith('file:///node_modules/a/index.d.mts', "export type { B } from 'b';");
    expect(setExtraLib).toHaveBeenCalledWith('file:///node_modules/b/index.d.cts', 'export type B = number;');
  } finally {
    controller.dispose();
    vi.useRealTimers();
  }
});

describe('declaration acquisition recovery and identity', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });
  it('loads a subpath even after the root package has already resolved', async () => {
    const fetch = vi.fn(async (input: string) =>
      input.endsWith('.d.ts')
        ? new Response(declarations)
        : new Response('', {
            headers: { 'X-TypeScript-Types': input.includes('/extra') ? '/pkg@1/extra.d.ts' : '/pkg@1/index.d.ts' },
          }),
    );
    vi.stubGlobal('fetch', fetch);
    const { controller, request } = fixture();
    try {
      await scan(controller, "import 'pkg';");
      await scan(controller, "import 'pkg/extra';");
      expect(fetch).toHaveBeenCalledWith('https://esm.sh/pkg/extra', expect.any(Object));
      const aliases = request.mock.calls.flatMap(([command]) =>
        command.kind === 'setModuleAlias' ? [command.specifier] : [],
      );
      expect(aliases).toEqual(['pkg', 'pkg/extra']);
    } finally {
      controller.dispose();
    }
  });
  it('keeps explicit CDN versions separate and preserves their default export files', async () => {
    const fetch = vi.fn(async (input: string) =>
      input.endsWith('.d.ts')
        ? new Response('declare const value: number; export default value;')
        : new Response('', { headers: { 'X-TypeScript-Types': `${input}/index.d.ts` } }),
    );
    vi.stubGlobal('fetch', fetch);
    const { controller, request } = fixture();
    try {
      await scan(controller, "import a from 'https://esm.sh/pkg@1'; import b from 'https://esm.sh/pkg@2';");
      const aliases = request.mock.calls.flatMap(([command]) => (command.kind === 'setModuleAlias' ? [command] : []));
      expect(aliases.map((row) => row.specifier)).toEqual(['https://esm.sh/pkg@1', 'https://esm.sh/pkg@2']);
      expect(aliases[0]?.uri).not.toBe(aliases[1]?.uri);
      expect(fetch).toHaveBeenCalledWith('https://esm.sh/pkg@1', expect.any(Object));
      expect(fetch).toHaveBeenCalledWith('https://esm.sh/pkg@2', expect.any(Object));
    } finally {
      controller.dispose();
    }
  });
  it('does not publish declarations or retry after the project is closed during a fetch', async () => {
    let release: (response: Response) => void = () => undefined;
    const pending = new Promise<Response>((resolve) => {
      release = resolve;
    });
    const fetch = vi.fn(async () => pending);
    vi.stubGlobal('fetch', fetch);
    const { controller, setExtraLib, request } = fixture();
    await scan(controller, "import 'pkg';");
    controller.dispose();
    release(new Response('', { headers: { 'X-TypeScript-Types': '/pkg/index.d.ts' } }));
    await vi.advanceTimersByTimeAsync(180_000);
    expect(setExtraLib).not.toHaveBeenCalled();
    expect(request.mock.calls.some(([command]) => command.kind === 'setModuleAlias')).toBe(false);
  });
  it('loads remote sibling declarations referenced with JavaScript extensions before publishing aliases', async () => {
    const fetch = vi.fn(async (input: string) => {
      if (input === 'https://esm.sh/pkg') {
        return new Response('', { headers: { 'X-TypeScript-Types': '/pkg@1/index.d.ts' } });
      }
      if (input.endsWith('/index.d.ts')) {
        return new Response("export {value} from './value.js';");
      }
      if (input.endsWith('/value.d.ts')) {
        return new Response('export declare const value: number;');
      }
      return new Response('', { status: 404 });
    });
    vi.stubGlobal('fetch', fetch);
    const { controller, setExtraLib } = fixture();
    try {
      await scan(controller, "import {value} from 'pkg';");
      expect(fetch).toHaveBeenCalledWith('https://esm.sh/pkg@1/value.d.ts', expect.any(Object));
      expect(setExtraLib).toHaveBeenCalledTimes(2);
    } finally {
      controller.dispose();
    }
  });
});

describe('TypeAcquisitionController implicit packages', () => {
  it('should mount a TSX document implicit packages from the dependency mount only', async () => {
    vi.useFakeTimers();
    const fetch = vi.fn();
    vi.stubGlobal('fetch', fetch);
    const files = new Map([['/node_modules/@tscircuit/core/index.d.ts', 'export declare const sel: unknown;']]);
    const reader = {
      readFile: vi.fn(async (path: string) => new TextEncoder().encode(files.get(path) ?? '{}')),
      readdir: vi.fn(async (path: string) =>
        [...files.keys()]
          .filter((key) => key.slice(0, key.lastIndexOf('/')) === path)
          .map((key) => key.slice(key.lastIndexOf('/') + 1)),
      ),
    };
    const { controller, setExtraLib } = fixture({
      dependencyReader: reader,
      implicitPackages: (uri) => (uri.endsWith('.tsx') ? ['@tscircuit/core'] : []),
    });
    try {
      controller.watch(new EditorDocument('helper.ts', 'export const x = 1;'));
      await vi.advanceTimersByTimeAsync(500);
      expect(setExtraLib).not.toHaveBeenCalled();
      controller.watch(new EditorDocument('main.tsx', "export default () => <board width='10mm' />;"));
      await vi.advanceTimersByTimeAsync(500);
      expect(setExtraLib).toHaveBeenCalledWith(
        'file:///node_modules/@tscircuit/core/index.d.ts',
        'export declare const sel: unknown;',
      );
      expect(fetch).not.toHaveBeenCalled();
    } finally {
      controller.dispose();
      vi.unstubAllGlobals();
      vi.useRealTimers();
    }
  });
});

describe('TypeAcquisitionController network shape', () => {
  /** A worker stand-in that also reports `/// <reference types>` directives, as the real worker does. */
  function referencingFixture() {
    const setExtraLib = vi.fn(async (_uri: string, _text: string) => undefined);
    const request = vi.fn(async (command: TypeScriptWorkerCommand): Promise<DeclarationImport[] | undefined> => {
      if (command.kind !== 'declarationImports') {
        return undefined;
      }
      const info = ts.preProcessFile(command.text, true, true);
      const at = (name: string) => {
        const from = command.text.indexOf(name);
        return { from, to: from + name.length };
      };
      return [
        ...info.importedFiles.map((ref) => ({ name: ref.fileName, ...at(ref.fileName) })),
        ...info.typeReferenceDirectives.map((ref) => ({
          name: ref.fileName,
          ...at(ref.fileName),
          reference: 'types',
        })),
      ];
    });
    const controller = new TypeAcquisitionController({
      client: {
        setExtraLib,
        request: async <T>(command: TypeScriptWorkerCommand): Promise<T> => (await request(command)) as T,
      },
      staticTypes: [],
      dynamicTypes: true,
    });
    return { controller, setExtraLib };
  }

  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  it('acquires independent imports concurrently, never more than six requests at once', async () => {
    let inFlight = 0;
    let peak = 0;
    const held: Array<() => void> = [];
    const fetch = vi.fn(async (input: string) => {
      inFlight += 1;
      peak = Math.max(peak, inFlight);
      await new Promise<void>((resolve) => {
        held.push(resolve);
      });
      inFlight -= 1;
      const name = new URL(input).pathname.split('/')[1];
      return input.endsWith('.d.ts')
        ? new Response(declarations)
        : new Response('', { headers: { 'X-TypeScript-Types': `/${name}@1/index.d.ts` } });
    });
    vi.stubGlobal('fetch', fetch);
    const { controller, setExtraLib } = referencingFixture();
    const packages = Array.from({ length: 10 }, (_, index) => `pkg${index}`);
    try {
      await scan(controller, packages.map((name) => `import '${name}';`).join('\n'));
      // Serial acquisition holds one request open at a time; ten independent imports may not wait in line.
      expect(inFlight).toBe(6);
      while (held.length > 0) {
        held.shift()?.();
        // oxlint-disable-next-line eslint/no-await-in-loop -- release one held response per tick.
        await vi.advanceTimersByTimeAsync(0);
      }
      expect(peak).toBe(6);
      for (const name of packages) {
        expect(fetch).toHaveBeenCalledWith(`https://esm.sh/${name}`, expect.any(Object));
      }
      expect(setExtraLib).toHaveBeenCalledTimes(packages.length);
    } finally {
      controller.dispose();
    }
  });

  it('follows a URL types reference as a URL, never as a malformed @types package', async () => {
    const dependency = 'https://esm.sh/@types/dep@1.0.0/index.d.ts';
    const fetch = vi.fn(async (input: string) => {
      if (input === 'https://esm.sh/pkg') {
        return new Response('', { headers: { 'X-TypeScript-Types': '/pkg@1/index.d.ts' } });
      }
      if (input === 'https://esm.sh/pkg@1/index.d.ts') {
        return new Response(`/// <reference types="${dependency}" />\nexport declare const size: number;`);
      }
      if (input === dependency) {
        return new Response('declare const dep: number;');
      }
      return new Response('', { status: 404 });
    });
    vi.stubGlobal('fetch', fetch);
    const { controller, setExtraLib } = referencingFixture();
    try {
      await scan(controller, "import 'pkg';");
      const requested = fetch.mock.calls.map(([input]) => input);
      expect(requested.filter((input) => input.includes('@types/https'))).toEqual([]);
      expect(requested).toContain(dependency);
      expect(setExtraLib).toHaveBeenCalledWith(
        expect.stringContaining('/node_modules/.tau-types/'),
        'declare const dep: number;',
      );
    } finally {
      controller.dispose();
    }
  });

  it('maps a scoped bare types reference to its @types package', async () => {
    const fetch = vi.fn(async (input: string) =>
      input.endsWith('.d.ts')
        ? new Response(declarations)
        : new Response('', { headers: { 'X-TypeScript-Types': '/@types/scope__lib@1/index.d.ts' } }),
    );
    vi.stubGlobal('fetch', fetch);
    const { controller } = referencingFixture();
    try {
      await scan(controller, '/// <reference types="@scope/lib" />\nexport {};');
      expect(fetch).toHaveBeenCalledWith('https://esm.sh/@types/scope__lib', expect.any(Object));
    } finally {
      controller.dispose();
    }
  });

  it('requests a declaration shared by two packages once', async () => {
    const shared = 'https://esm.sh/shared@1/index.d.ts';
    const fetch = vi.fn(async (input: string) => {
      if (input === 'https://esm.sh/a' || input === 'https://esm.sh/b') {
        const name = input.slice(-1);
        return new Response('', { headers: { 'X-TypeScript-Types': `/${name}@1/index.d.ts` } });
      }
      if (input === shared) {
        return new Response('export type Shared = number;');
      }
      return new Response(`export type { Shared } from '${shared}';`);
    });
    vi.stubGlobal('fetch', fetch);
    const { controller } = referencingFixture();
    try {
      await scan(controller, "import 'a'; import 'b';");
      expect(fetch.mock.calls.filter(([input]) => input === shared)).toHaveLength(1);
    } finally {
      controller.dispose();
    }
  });
});
