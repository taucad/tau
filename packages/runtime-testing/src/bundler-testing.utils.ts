import { describe, expect, it } from 'vitest';

import type { BuiltinModule } from '@taucad/runtime/bundler';

/** Rooted in-memory filesystem shape supplied to bundler conformance factories. @public */
export type BundlerConformanceFileSystem = {
  exists(path: string): Promise<boolean>;
  readFile(path: string): Promise<Uint8Array<ArrayBuffer>>;
  readFile(path: string, encoding: 'utf8'): Promise<string>;
  writeFile(path: string, content: string): Promise<void>;
  ensureDir(path: string): Promise<void>;
};

/** VM surface required by the shared bundler conformance contract. @public */
export type BundlerConformanceVm = {
  detectImports(
    entryPath: string,
    signal?: AbortSignal,
  ): Promise<{ readonly detectedModules: string[]; readonly dependencies: string[] }>;
  bundle(
    entryPath: string,
    signal?: AbortSignal,
  ): Promise<{
    readonly code: string;
    readonly sourceMap?: string;
    readonly success: boolean;
    readonly issues: ReadonlyArray<{
      readonly message: string;
      readonly location?: {
        readonly fileName?: string;
        readonly startLineNumber?: number;
        readonly startColumn?: number;
      };
    }>;
    readonly dependencies: string[];
    readonly unresolvedPaths: string[];
  }>;
  execute<T = unknown>(
    code: string,
    signal?: AbortSignal,
  ): Promise<{ readonly success: true; readonly value: T } | { readonly success: false; readonly issues: unknown[] }>;
  registerModule(name: string, module: BuiltinModule): void;
  clearExecutionCache(code?: string): void;
  dispose(): void;
};

/** Adapter factory for the parameterized bundler conformance suite. @public */
export type DescribeBundlerConformanceOptions = {
  readonly name: string;
  readonly create: (
    filesystem: BundlerConformanceFileSystem,
    options?: { readonly cacheExecution?: boolean },
  ) => Promise<BundlerConformanceVm>;
};

const createFileSystem = (initial: Readonly<Record<string, string>>): BundlerConformanceFileSystem => {
  const files = new Map(Object.entries(initial));
  const encoder = new TextEncoder();
  async function readFile(path: string, encoding: 'utf8'): Promise<string>;
  async function readFile(path: string): Promise<Uint8Array<ArrayBuffer>>;
  async function readFile(path: string, encoding?: 'utf8'): Promise<string | Uint8Array<ArrayBuffer>> {
    const value = files.get(path);
    if (value === undefined) {
      throw new Error(`ENOENT: ${path}`);
    }
    return encoding === 'utf8' ? value : encoder.encode(value);
  }
  const filesystem: BundlerConformanceFileSystem = {
    exists: async (path) => files.has(path),
    readFile,
    writeFile: async (path, content) => {
      files.set(path, content);
    },
    ensureDir: async () => undefined,
  };
  return filesystem;
};

/**
 * Register the observable cross-engine Tau bundler conformance contract.
 * @param options - Adapter name and VM factory.
 * @public
 */
export const describeBundlerConformance = (options: DescribeBundlerConformanceOptions): void => {
  describe(`${options.name} bundler conformance`, () => {
    it('walks transitive TypeScript, probes .js to .ts, and executes automatic CAD exports', async () => {
      const vm = await options.create(
        createFileSystem({
          'main.ts': "import { value } from './lib/value.js'; import 'replicad'; const main = () => value;",
          'lib/value.ts': 'export const value = 42;',
        }),
      );
      try {
        await expect(vm.detectImports('main.ts')).resolves.toEqual({
          detectedModules: ['replicad'],
          dependencies: ['lib/value.ts', 'main.ts'],
        });
        vm.registerModule('replicad', { code: 'export {};', version: '1.0.0' });
        const bundle = await vm.bundle('main.ts');
        expect(bundle).toMatchObject({ success: true, dependencies: ['lib/value.ts', 'main.ts'] });
        expect(() => {
          JSON.parse(bundle.sourceMap ?? '');
        }).not.toThrow();
        const execution = await vm.execute<{ main: () => number }>(bundle.code);
        expect(execution.success && execution.value.main()).toBe(42);
      } finally {
        vm.dispose();
      }
    });

    it('maps query and static-attribute assets to equivalent values and dependencies', async () => {
      const vm = await options.create(
        createFileSystem({
          'main.ts': [
            "import raw from './note.txt?raw';",
            "import text from './note.txt' with { type: 'text' };",
            "import bytes from './shape.bin' with { type: 'bytes' };",
            'export default () => ({ raw, text, bytes: [...bytes] });',
          ].join('\n'),
          'note.txt': 'hello',
          'shape.bin': 'AB',
        }),
      );
      try {
        await expect(vm.detectImports('main.ts')).resolves.toEqual({
          detectedModules: [],
          dependencies: ['main.ts', 'note.txt', 'shape.bin'],
        });
        const bundle = await vm.bundle('main.ts');
        expect(bundle).toMatchObject({ success: true, dependencies: ['main.ts', 'note.txt', 'shape.bin'] });
        const execution = await vm.execute<{ default: () => unknown }>(bundle.code);
        expect(execution.success && execution.value.default()).toEqual({
          raw: 'hello',
          text: 'hello',
          bytes: [65, 66],
        });
      } finally {
        vm.dispose();
      }
    });

    it('maps base64, data URL, and self-contained file assets equivalently', async () => {
      const vm = await options.create(
        createFileSystem({
          'main.ts': [
            "import base64 from './shape.bin?base64';",
            "import dataUrl from './shape.bin?dataurl';",
            "import file from './shape.bin?file';",
            'export default () => ({ base64, dataUrl, file });',
          ].join('\n'),
          'shape.bin': 'AB',
        }),
      );
      try {
        const bundle = await vm.bundle('main.ts');
        const execution = await vm.execute<{ default: () => unknown }>(bundle.code);
        const value = execution.success
          ? (execution.value.default() as { base64: string; dataUrl: string; file: string })
          : undefined;
        expect(value?.base64).toBe('QUI=');
        expect(value?.file).toBe(value?.dataUrl);
        const response = await fetch(value?.dataUrl ?? '');
        expect([...new Uint8Array(await response.arrayBuffer())]).toEqual([65, 66]);
      } finally {
        vm.dispose();
      }
    });

    it('compiles TypeScript, TSX, JSX, JSON, and directory-index imports into one graph', async () => {
      const vm = await options.create(
        createFileSystem({
          'main.ts': [
            "import { tsx } from './component.tsx';",
            "import { jsx } from './widget.jsx';",
            "import config from './config.json';",
            "import { indexed } from './folder';",
            'export default { tsx, jsx, config, indexed };',
          ].join('\n'),
          'component.tsx': 'export const tsx = <div data-value={1} />;',
          'widget.jsx': 'export const jsx = <span />;',
          'config.json': '{"enabled":true}',
          'folder/index.ts': 'export const indexed = 42;',
        }),
      );
      try {
        const bundle = await vm.bundle('main.ts');
        expect(bundle).toMatchObject({
          success: true,
          dependencies: ['component.tsx', 'config.json', 'folder/index.ts', 'main.ts', 'widget.jsx'],
        });
        expect(() => {
          JSON.parse(bundle.sourceMap ?? '');
        }).not.toThrow();
      } finally {
        vm.dispose();
      }
    });

    it('resolves registered built-in package subpaths without acquisition', async () => {
      const vm = await options.create(
        createFileSystem({ 'main.ts': "import { value } from 'fixture/subpath'; export default value;" }),
      );
      try {
        await expect(vm.detectImports('main.ts')).resolves.toMatchObject({ detectedModules: ['fixture/subpath'] });
        vm.registerModule('fixture', { code: 'export const value = 7;', version: '1.0.0' });
        const bundle = await vm.bundle('main.ts');
        const execution = await vm.execute<{ default: number }>(bundle.code);
        expect(execution.success && execution.value.default).toBe(7);
      } finally {
        vm.dispose();
      }
    });

    it('reports compiler diagnostics with the project source location', async () => {
      const vm = await options.create(createFileSystem({ 'main.ts': 'export const = 1;' }));
      try {
        const bundle = await vm.bundle('main.ts');
        expect(bundle.success).toBe(false);
        expect(bundle.issues.some(({ location }) => location?.fileName?.includes('main.ts') === true)).toBe(true);
      } finally {
        vm.dispose();
      }
    });

    it('re-executes identical code by default and clears all host resources', async () => {
      const vm = await options.create(
        createFileSystem({
          'main.ts': [
            'globalThis.__tauBundlerConformanceCounter = (globalThis.__tauBundlerConformanceCounter ?? 0) + 1;',
            'export default globalThis.__tauBundlerConformanceCounter;',
          ].join('\n'),
        }),
      );
      try {
        const bundle = await vm.bundle('main.ts');
        const first = await vm.execute<{ default: number }>(bundle.code);
        const second = await vm.execute<{ default: number }>(bundle.code);
        expect(first.success && first.value.default).toBe(1);
        expect(second.success && second.value.default).toBe(2);
        vm.clearExecutionCache();
      } finally {
        Reflect.deleteProperty(globalThis, '__tauBundlerConformanceCounter');
        vm.dispose();
      }
    });

    it('supports opt-in execution caching with targeted and all-entry invalidation', async () => {
      const vm = await options.create(
        createFileSystem({
          'main.ts': [
            'globalThis.__tauBundlerConformanceCounter = (globalThis.__tauBundlerConformanceCounter ?? 0) + 1;',
            'export default globalThis.__tauBundlerConformanceCounter;',
          ].join('\n'),
        }),
        { cacheExecution: true },
      );
      try {
        const bundle = await vm.bundle('main.ts');
        const first = await vm.execute<{ default: number }>(bundle.code);
        const cached = await vm.execute<{ default: number }>(bundle.code);
        expect(first.success && first.value.default).toBe(1);
        expect(cached.success && cached.value.default).toBe(1);

        vm.clearExecutionCache(bundle.code);
        const targeted = await vm.execute<{ default: number }>(bundle.code);
        expect(targeted.success && targeted.value.default).toBe(2);

        vm.clearExecutionCache();
        const cleared = await vm.execute<{ default: number }>(bundle.code);
        expect(cleared.success && cleared.value.default).toBe(3);
      } finally {
        Reflect.deleteProperty(globalThis, '__tauBundlerConformanceCounter');
        vm.dispose();
      }
    });

    it('reports unsupported imports and never converts a failed detection to an empty graph', async () => {
      const vm = await options.create(createFileSystem({ 'main.ts': "import '#private';" }));
      try {
        await expect(vm.detectImports('missing.ts')).rejects.toThrow();
        const bundle = await vm.bundle('main.ts');
        expect(bundle.success).toBe(false);
        expect(bundle.issues.map(({ message }) => message).join('\n')).toContain('Private package import');
      } finally {
        vm.dispose();
      }
    });

    it('does not retain cancellation between operations', async () => {
      const vm = await options.create(createFileSystem({ 'main.ts': 'export default 1;' }));
      try {
        const controller = new AbortController();
        controller.abort();
        await expect(vm.detectImports('main.ts', controller.signal)).rejects.toThrow();
        await expect(vm.detectImports('main.ts', new AbortController().signal)).resolves.toMatchObject({
          dependencies: ['main.ts'],
        });
      } finally {
        vm.dispose();
      }
    });
  });
};
