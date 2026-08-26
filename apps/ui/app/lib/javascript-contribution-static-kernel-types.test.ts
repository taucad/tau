/**
 * Ensures TS/JS contributions read kernel typings from the FM `/node_modules`
 * mount and pass them through {@link TypeAcquisitionService}, which then
 * recursively registers each declaration file plus one root `package.json`.
 */
/* eslint-disable @typescript-eslint/naming-convention -- Test fixtures are keyed by canonical filesystem paths and package export specifiers. */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mock } from 'vitest-mock-extended';
import type { WorkspaceScope } from '@taucad/filesystem';
import type { ActivationContext } from '#lib/monaco-language-registry.js';
import type { MonacoTestStub } from '#lib/testing/monaco-language-stub.js';
import { tsContribution } from '#lib/typescript-contribution.js';
import { jsContribution } from '#lib/javascript-contribution.js';
import { LanguageContributionRegistry } from '#lib/monaco-language-registry.js';
import { TypeAcquisitionService } from '#lib/type-acquisition-service.js';
import { createMonacoTestStub } from '#lib/testing/monaco-language-stub.js';
import { attachTypescriptShim } from '#lib/testing/monaco-typescript-shim.js';
import type { FileManagerRef, FileManagerProxy } from '#machines/file-manager.machine.types.js';

function createMountProxy(fileContents: Record<string, string>): FileManagerProxy {
  const files = new Map<string, string>();
  const directories = new Map<string, Set<string>>();
  const addDirectoryEntry = (directory: string, entry: string): void => {
    directories.set(directory, (directories.get(directory) ?? new Set()).add(entry));
  };
  const addFile = (path: string, content: string): void => {
    files.set(path, content);
    const parts = path.split('/').filter(Boolean);
    let directory = '';
    for (let index = 0; index < parts.length - 1; index += 1) {
      const parent = directory === '' ? '/' : directory;
      const part = parts[index]!;
      addDirectoryEntry(parent, part);
      directory = `${directory}/${part}`;
    }
    addDirectoryEntry(directory, parts.at(-1)!);
  };

  for (const [path, content] of Object.entries(fileContents)) {
    addFile(path, content);
  }

  const proxy: FileManagerProxy = mock<FileManagerProxy>();
  vi.mocked(proxy.readdir).mockImplementation(async (path: string) => {
    const entries = directories.get(path);
    if (entries) {
      return [...entries];
    }
    throw new Error(`unexpected readdir: ${path}`);
  });

  function readFile(
    path: string,
    options: 'utf8' | { readonly encoding: 'utf8'; readonly scope?: WorkspaceScope },
  ): Promise<string>;
  function readFile(path: string, options?: { readonly scope?: WorkspaceScope }): Promise<Uint8Array<ArrayBuffer>>;
  async function readFile(
    path: string,
    options?: 'utf8' | { readonly encoding?: 'utf8'; readonly scope?: WorkspaceScope },
  ): Promise<string | Uint8Array<ArrayBuffer>> {
    const content = files.get(path);
    if (content === undefined) {
      throw new Error(`ENOENT: ${path}`);
    }
    const asText = options === 'utf8' || (typeof options === 'object' && options.encoding === 'utf8');
    return asText ? content : new TextEncoder().encode(content);
  }

  proxy.readFile = readFile;
  return proxy;
}

function createMockContext(stub: MonacoTestStub, proxy: FileManagerProxy): ActivationContext {
  const context = mock<ActivationContext>();
  context.monaco = stub.monaco;
  const fileManagerRef = mock<FileManagerRef>();
  const snapshot = mock<ReturnType<FileManagerRef['getSnapshot']>>();
  snapshot.context.proxy = proxy;
  vi.mocked(fileManagerRef.getSnapshot).mockReturnValue(snapshot);
  context.fileManagerRef = fileManagerRef;
  return context;
}

describe('tsContribution static kernel types', () => {
  let stub: MonacoTestStub;
  let registry: LanguageContributionRegistry;

  beforeEach(() => {
    stub = createMonacoTestStub();
    attachTypescriptShim(stub);
    registry = new LanguageContributionRegistry();
    vi.spyOn(TypeAcquisitionService.prototype, 'startWatching').mockImplementation(() => undefined);
  });

  afterEach(() => {
    vi.restoreAllMocks();
    registry.dispose();
    stub.__reset();
    vi.clearAllMocks();
  });

  it('should register index.d.ts and package.json for each kernel discovered on the mount', async () => {
    const proxy = createMountProxy({
      '/node_modules/replicad/index.d.ts': 'export declare const stubKernel: 1;',
      '/node_modules/replicad/package.json': JSON.stringify({ name: 'replicad', types: 'index.d.ts' }),
    });
    const context = createMockContext(stub, proxy);
    registry.addContribution(tsContribution);
    registry.activate(context);
    stub.__createModel('inmemory://t/kernel', 'typescript');

    const tsAdd = vi.mocked(stub.monaco.typescript.typescriptDefaults.addExtraLib);
    const jsAdd = vi.mocked(stub.monaco.typescript.javascriptDefaults.addExtraLib);

    await vi.waitFor(() => {
      expect(tsAdd.mock.calls.length).toBeGreaterThan(0);
    });

    const tsPaths = tsAdd.mock.calls.map((c) => c[1]!);
    expect(tsPaths).toContain('file:///node_modules/replicad/index.d.ts');
    expect(tsPaths).toContain('file:///node_modules/replicad/package.json');

    const jsPaths = jsAdd.mock.calls.map((c) => c[1]!);
    expect(jsPaths).toContain('file:///node_modules/replicad/index.d.ts');
    expect(jsPaths).toContain('file:///node_modules/replicad/package.json');

    const packageCall = tsAdd.mock.calls.find((c) => c[1] === 'file:///node_modules/replicad/package.json');
    expect(packageCall).toBeDefined();
    expect(JSON.parse(packageCall![0])).toEqual({ name: 'replicad', types: 'index.d.ts' });
  });

  it('should use /node_modules bytes from the file-manager proxy for each package', async () => {
    const proxy = createMountProxy({
      '/node_modules/replicad/index.d.ts': 'export declare const fromMount: 42;',
      '/node_modules/replicad/package.json': JSON.stringify({ name: 'replicad', types: 'index.d.ts' }),
    });
    const context = createMockContext(stub, proxy);
    registry.addContribution(tsContribution);
    registry.activate(context);
    stub.__createModel('inmemory://t/kernel2', 'typescript');

    const tsAdd = vi.mocked(stub.monaco.typescript.typescriptDefaults.addExtraLib);
    await vi.waitFor(() => {
      expect(tsAdd).toHaveBeenCalled();
    });

    const dtsCall = tsAdd.mock.calls.find((c) => c[1] === 'file:///node_modules/replicad/index.d.ts');
    expect(dtsCall).toBeDefined();
    expect(dtsCall![0]).toContain('fromMount');
  });

  it('should register libcascade without legacy OpenCascade package aliases', async () => {
    const proxy = createMountProxy({
      '/node_modules/libcascade/index.d.ts': 'export declare class TopoDS_Shape {}',
      '/node_modules/libcascade/package.json': JSON.stringify({ name: 'libcascade', types: 'index.d.ts' }),
    });
    const context = createMockContext(stub, proxy);
    registry.addContribution(tsContribution);
    registry.activate(context);
    stub.__createModel('inmemory://t/libcascade', 'typescript');

    const tsAdd = vi.mocked(stub.monaco.typescript.typescriptDefaults.addExtraLib);
    const jsAdd = vi.mocked(stub.monaco.typescript.javascriptDefaults.addExtraLib);
    await vi.waitFor(() => {
      expect(tsAdd.mock.calls.length).toBeGreaterThan(0);
    });

    for (const addExtraLib of [tsAdd, jsAdd]) {
      const paths = addExtraLib.mock.calls.map((call) => call[1]);
      expect(paths).toContain('file:///node_modules/libcascade/index.d.ts');
      expect(paths).toContain('file:///node_modules/libcascade/package.json');
      expect(paths).not.toContain('file:///node_modules/opencascade/index.d.ts');
      expect(paths).not.toContain('file:///node_modules/opencascade.js/index.d.ts');
    }
  });

  it('should register generated GeoSpec package and subpath declarations from the bundled-types mount', async () => {
    const proxy = createMountProxy({
      '/node_modules/geospec/index.d.ts': 'export declare const describe: unknown;',
      '/node_modules/geospec/brep/index.d.ts': 'export declare const analyzeBrep: unknown;',
      '/node_modules/geospec/model/index.d.ts': 'export declare const loadModel: unknown;',
      '/node_modules/geospec/runner/web/index.d.ts': 'export declare const createGeoSpecWebRunner: unknown;',
      '/node_modules/geospec/runner/worker/index.d.ts': 'export type GeoSpecRunnerResult = unknown;',
      '/node_modules/geospec/step/index.d.ts': 'export declare const loadStep: unknown;',
      '/node_modules/geospec/package.json': JSON.stringify({ name: 'geospec', types: 'index.d.ts' }),
    });
    const context = createMockContext(stub, proxy);
    registry.addContribution(tsContribution);
    registry.activate(context);
    stub.__createModel('inmemory://t/main.geospec.ts', 'typescript');

    const tsAdd = vi.mocked(stub.monaco.typescript.typescriptDefaults.addExtraLib);
    await vi.waitFor(() => {
      expect(tsAdd.mock.calls.length).toBeGreaterThan(0);
    });

    const tsPaths = tsAdd.mock.calls.map((c) => c[1]!);
    expect(tsPaths).toContain('file:///node_modules/geospec/index.d.ts');
    expect(tsPaths).toContain('file:///node_modules/geospec/brep/index.d.ts');
    expect(tsPaths).toContain('file:///node_modules/geospec/model/index.d.ts');
    expect(tsPaths).toContain('file:///node_modules/geospec/runner/web/index.d.ts');
    expect(tsPaths).toContain('file:///node_modules/geospec/runner/worker/index.d.ts');
    expect(tsPaths).toContain('file:///node_modules/geospec/step/index.d.ts');

    const modelCall = tsAdd.mock.calls.find((c) => c[1] === 'file:///node_modules/geospec/model/index.d.ts');
    expect(modelCall?.[0]).toContain('loadModel');

    const stepCall = tsAdd.mock.calls.find((c) => c[1] === 'file:///node_modules/geospec/step/index.d.ts');
    expect(stepCall?.[0]).toContain('loadStep');

    const runnerWebCall = tsAdd.mock.calls.find((c) => c[1] === 'file:///node_modules/geospec/runner/web/index.d.ts');
    expect(runnerWebCall?.[0]).toContain('createGeoSpecWebRunner');

    const runnerWorkerCall = tsAdd.mock.calls.find(
      (c) => c[1] === 'file:///node_modules/geospec/runner/worker/index.d.ts',
    );
    expect(runnerWorkerCall?.[0]).toContain('GeoSpecRunnerResult');

    const brepCall = tsAdd.mock.calls.find((c) => c[1] === 'file:///node_modules/geospec/brep/index.d.ts');
    expect(brepCall?.[0]).toContain('analyzeBrep');
  });

  it('should register scoped and unscoped subpath declarations for both TypeScript and JavaScript', async () => {
    const proxy = createMountProxy({
      '/node_modules/@jscad/modeling/index.d.ts': 'export type Geometry = unknown;',
      '/node_modules/@jscad/modeling/colors/index.d.ts': 'export declare const colorize: unknown;',
      '/node_modules/@jscad/modeling/package.json': JSON.stringify({
        name: '@jscad/modeling',
        types: 'index.d.ts',
      }),
      '/node_modules/manifold-3d/index.d.ts': 'export declare class Manifold {}',
      '/node_modules/manifold-3d/manifoldCAD/index.d.ts': 'export declare const manifoldCAD: unknown;',
      '/node_modules/manifold-3d/package.json': JSON.stringify({ name: 'manifold-3d', types: 'index.d.ts' }),
    });
    const context = createMockContext(stub, proxy);
    registry.addContribution(tsContribution);
    registry.activate(context);
    stub.__createModel('inmemory://t/subpaths', 'typescript');

    const tsAdd = vi.mocked(stub.monaco.typescript.typescriptDefaults.addExtraLib);
    const jsAdd = vi.mocked(stub.monaco.typescript.javascriptDefaults.addExtraLib);
    await vi.waitFor(() => {
      expect(tsAdd.mock.calls.length).toBeGreaterThan(0);
    });

    for (const addExtraLib of [tsAdd, jsAdd]) {
      const paths = addExtraLib.mock.calls.map((call) => call[1]);
      expect(paths).toContain('file:///node_modules/@jscad/modeling/colors/index.d.ts');
      expect(paths).toContain('file:///node_modules/manifold-3d/manifoldCAD/index.d.ts');
      expect(paths).toContain('file:///node_modules/@jscad/modeling/package.json');
      expect(paths).toContain('file:///node_modules/manifold-3d/package.json');
      expect(paths).not.toContain('file:///node_modules/@jscad/modeling/colors/package.json');
      expect(paths).not.toContain('file:///node_modules/manifold-3d/manifoldCAD/package.json');
    }
  });

  it('should preserve custom package metadata when a nested declaration is enumerated first', async () => {
    const packageJsonContent = JSON.stringify({
      name: 'geospec',
      types: 'index.d.ts',
      exports: { './runner/web': { types: './runner/web/index.d.ts' } },
    });
    const proxy = createMountProxy({
      '/node_modules/geospec/runner/web/index.d.ts': 'export declare const createGeoSpecWebRunner: unknown;',
      '/node_modules/geospec/index.d.ts': 'export declare const describe: unknown;',
      '/node_modules/geospec/package.json': packageJsonContent,
    });
    const context = createMockContext(stub, proxy);
    registry.addContribution(tsContribution);
    registry.activate(context);
    stub.__createModel('inmemory://t/metadata-order', 'typescript');

    const tsAdd = vi.mocked(stub.monaco.typescript.typescriptDefaults.addExtraLib);
    const jsAdd = vi.mocked(stub.monaco.typescript.javascriptDefaults.addExtraLib);
    await vi.waitFor(() => {
      expect(tsAdd.mock.calls.length).toBeGreaterThan(0);
    });

    for (const addExtraLib of [tsAdd, jsAdd]) {
      const packageJsonCall = addExtraLib.mock.calls.find(
        (call) => call[1] === 'file:///node_modules/geospec/package.json',
      );
      expect(packageJsonCall?.[0]).toBe(packageJsonContent);
    }
  });
});

describe('jsContribution static kernel types', () => {
  let stub: MonacoTestStub;
  let registry: LanguageContributionRegistry;

  beforeEach(() => {
    stub = createMonacoTestStub();
    attachTypescriptShim(stub);
    registry = new LanguageContributionRegistry();
    vi.spyOn(TypeAcquisitionService.prototype, 'startWatching').mockImplementation(() => undefined);
  });

  afterEach(() => {
    vi.restoreAllMocks();
    registry.dispose();
    stub.__reset();
    vi.clearAllMocks();
  });

  it('should register kernel mount extras when a JavaScript model opens', async () => {
    const proxy = createMountProxy({
      '/node_modules/replicad/index.d.ts': 'export declare const stubKernel: 1;',
      '/node_modules/replicad/package.json': JSON.stringify({ name: 'replicad', types: 'index.d.ts' }),
    });
    const context = createMockContext(stub, proxy);
    registry.addContribution(jsContribution);
    registry.activate(context);
    stub.__createModel('inmemory://j/kernel', 'javascript');

    const tsAdd = vi.mocked(stub.monaco.typescript.typescriptDefaults.addExtraLib);
    await vi.waitFor(() => {
      expect(tsAdd.mock.calls.length).toBeGreaterThan(0);
    });

    const tsPaths = tsAdd.mock.calls.map((c) => c[1]!);
    expect(tsPaths).toContain('file:///node_modules/replicad/index.d.ts');
  });
});
