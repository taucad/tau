import type { TypeScriptWorkerCommand } from '@taucad/lsp/typescript-worker/protocol';
import { TypeScriptProjectService } from '@taucad/lsp/typescript-worker/typescript-service';
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

/**
 * Packages whose index re-exports each module from its own declaration file. The fake CDN reproduces the
 * esm.sh 4.x shapes recorded on 2026-11-14: the module response names an absolute declaration URL in
 * `X-TypeScript-Types`, and declarations import siblings and other packages by `.d.ts` URL. The `@~4.17.12`
 * range redirects (302) on esm.sh; `fetch` follows it, so the fake answers the requested URL directly.
 */
describe('TypeAcquisitionController wide declaration packages', () => {
  function workerFixture(
    files: ReadonlyMap<string, string>,
    types: ReadonlyMap<string, string>,
    latency: (url: string) => number = () => 1,
  ) {
    const service = new TypeScriptProjectService({
      syncFs: {
        readFileText: () => undefined,
        fileExists: () => false,
        directoryExists: () => false,
        getDirectories: () => [],
        getScriptVersionForPath: () => '0',
      },
      standardLibraries: {},
    });
    let inFlight = 0;
    let peak = 0;
    const fetched: string[] = [];
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: string) => {
        inFlight += 1;
        peak = Math.max(peak, inFlight);
        await new Promise((resolve) => {
          setTimeout(resolve, latency(input));
        });
        inFlight -= 1;
        fetched.push(input);
        const header = types.get(input);
        if (header) {
          return new Response('', { headers: { 'X-TypeScript-Types': header } });
        }
        const text = files.get(input);
        return text === undefined ? new Response('', { status: 404 }) : new Response(text);
      }),
    );
    const errors: Error[] = [];
    const controller = new TypeAcquisitionController({
      client: {
        setExtraLib: async (uri, text) => {
          service.setExtraLib(uri, text);
        },
        request: async <T>(command: TypeScriptWorkerCommand): Promise<T> => {
          if (command.kind === 'declarationImports') {
            return service.declarationImports(command.text) as T;
          }
          if (command.kind === 'setModuleAlias') {
            service.setModuleAlias(command.specifier, command.uri);
            return undefined as T;
          }
          throw new Error(`Unexpected acquisition command ${command.kind}`);
        },
      },
      staticTypes: [],
      dynamicTypes: true,
      onError: (error) => {
        errors.push(error);
      },
    });
    const open = (text: string): EditorDocument => {
      const document = new EditorDocument('main.ts', text);
      service.open(document.uri, document.text, document.version);
      controller.watch(document);
      return document;
    };
    const diagnose = async (text: string): Promise<number[]> => {
      const document = open(text);
      await vi.advanceTimersByTimeAsync(500);
      await vi.advanceTimersByTimeAsync(5000);
      return service.getDiagnostics(document.uri).map((row) => row.code);
    };
    return {
      diagnose,
      open,
      codes: (document: EditorDocument) => service.getDiagnostics(document.uri).map((row) => row.code),
      subscribe: (listener: () => void) => controller.subscribe(listener),
      fetched: () => fetched.length,
      errors,
      peak: () => peak,
      dispose: () => {
        controller.dispose();
        service.dispose();
      },
    };
  }

  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  it('should type lodash-es through its 304 re-exports of @types/lodash with at most six requests in flight', async () => {
    const esModule = 'https://esm.sh/@types/lodash-es@~4.17.12/';
    const lodash = 'https://esm.sh/@types/lodash@4.17.14/';
    const names = ['add', ...Array.from({ length: 303 }, (_, index) => `fn${index}`)];
    const files = new Map<string, string>([
      [`${esModule}index.d.ts`, names.map((name) => `export { default as ${name} } from "./${name}.d.ts";`).join('\n')],
      ...names.map((name): [string, string] => [
        `${esModule}${name}.d.ts`,
        `import { ${name} } from "${lodash}index.d.ts";\nexport default ${name};`,
      ]),
      [
        `${lodash}index.d.ts`,
        [
          '/// <reference path="./common/common.d.ts" />',
          'export = _;',
          'export as namespace _;',
          'declare const _: _.LoDashStatic;',
          'declare namespace _ {',
          '    interface LoDashStatic {}',
          '}',
        ].join('\n'),
      ],
      [
        `${lodash}common/common.d.ts`,
        [
          'import _ = require("../index.d.ts");',
          'declare module "../index.d.ts" {',
          '    interface LoDashStatic {',
          ...names.map((name) => `        ${name}(augend: number, addend: number): number;`),
          '    }',
          '}',
        ].join('\n'),
      ],
    ]);
    const { diagnose, errors, peak, dispose } = workerFixture(
      files,
      new Map([['https://esm.sh/lodash-es', `${esModule}index.d.ts`]]),
    );
    try {
      const codes = await diagnose(
        "import { add } from 'https://esm.sh/lodash-es'; export const bad: string = add(1, 2);",
      );
      expect(errors).toEqual([]);
      expect(codes).toEqual([2322]);
      expect(peak()).toBeLessThanOrEqual(6);
    } finally {
      dispose();
    }
  });

  it('should type date-fns through its 246 sibling re-exports', async () => {
    const base = 'https://esm.sh/date-fns@4.4.0/';
    const names = ['addDays', ...Array.from({ length: 245 }, (_, index) => `fn${index}`)];
    const files = new Map<string, string>([
      [`${base}index.d.ts`, names.map((name) => `export * from "./${name}.d.ts";`).join('\n')],
      // The worker here has no standard library, so a structural stand-in plays `Date`.
      [`${base}types.d.ts`, 'export type DateArg = number | string;\nexport interface Day { readonly epoch: number }'],
      ...names.map((name): [string, string] => [
        `${base}${name}.d.ts`,
        `import type { DateArg, Day } from "./types.d.ts";\nexport declare function ${name}(date: DateArg, amount: number): Day;`,
      ]),
    ]);
    const { diagnose, errors, dispose } = workerFixture(
      files,
      new Map([['https://esm.sh/date-fns', `${base}index.d.ts`]]),
    );
    try {
      const codes = await diagnose(
        "import { addDays } from 'https://esm.sh/date-fns'; export const bad: string = addDays(0, 1);",
      );
      expect(errors).toEqual([]);
      expect(codes).toEqual([2322]);
    } finally {
      dispose();
    }
  });

  it('should publish a fast package as soon as its own graph loads while a wide one is still loading', async () => {
    // A wide package whose 60 siblings each take 100 ms, beside a narrow one three files deep at 1 ms each.
    const wide = 'https://esm.sh/wide@1.0.0/';
    const narrow = 'https://esm.sh/narrow@1.0.0/';
    const names = ['first', ...Array.from({ length: 59 }, (_, index) => `fn${index}`)];
    const files = new Map<string, string>([
      [`${wide}index.d.ts`, names.map((name) => `export * from "./${name}.d.ts";`).join('\n')],
      ...names.map((name): [string, string] => [
        `${wide}${name}.d.ts`,
        `export declare function ${name}(value: number): number;`,
      ]),
      [`${narrow}index.d.ts`, 'export * from "./schema.d.ts";'],
      [`${narrow}schema.d.ts`, 'export * from "./types.d.ts";'],
      [`${narrow}types.d.ts`, 'export declare function parse(value: number): number;'],
    ]);
    const { open, codes, subscribe, fetched, errors, dispose } = workerFixture(
      files,
      new Map([
        ['https://esm.sh/wide', `${wide}index.d.ts`],
        ['https://esm.sh/narrow', `${narrow}index.d.ts`],
      ]),
      (url) => (url.startsWith(wide) && !url.endsWith('/index.d.ts') ? 100 : 1),
    );
    const published: Array<{ codes: number[]; fetched: number }> = [];
    let document: EditorDocument | undefined;
    const stop = subscribe(() => {
      if (document) {
        published.push({ codes: codes(document), fetched: fetched() });
      }
    });
    try {
      document = open(
        [
          "import { first } from 'https://esm.sh/wide';",
          "import { parse } from 'https://esm.sh/narrow';",
          'export const bad: string = parse(1);',
          'export const alsoBad: string = first(1);',
        ].join('\n'),
      );
      await vi.advanceTimersByTimeAsync(500);
      await vi.advanceTimersByTimeAsync(5000);
      expect(errors).toEqual([]);
      expect(codes(document)).toEqual([2322, 2322]);
      // The narrow package's real error is published while the wide import still reports 2307, and long
      // before the wide package's 60 siblings have all arrived: it does not wait in line behind them.
      const narrowFirst = published.find((entry) => entry.codes.includes(2322));
      expect(narrowFirst?.codes).toEqual([2307, 2322]);
      expect(narrowFirst?.fetched).toBeLessThan(30);
      // Each package refreshes editors once, after its files and alias are in place, not once per file.
      expect(published).toHaveLength(2);
    } finally {
      stop();
      dispose();
    }
  });
});
