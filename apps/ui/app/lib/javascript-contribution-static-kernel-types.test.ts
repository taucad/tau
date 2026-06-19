/**
 * Ensures TS/JS contributions read kernel typings from the FM `/node_modules`
 * mount and pass them through {@link TypeAcquisitionService}, which then
 * registers each package's `index.d.ts` plus a synthetic `package.json`.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { ActivationContext } from '#lib/monaco-language-registry.js';
import type { MonacoTestStub } from '#lib/testing/monaco-language-stub.js';
import { tsContribution } from '#lib/typescript-contribution.js';
import { jsContribution } from '#lib/javascript-contribution.js';
import { LanguageContributionRegistry } from '#lib/monaco-language-registry.js';
import { TypeAcquisitionService } from '#lib/type-acquisition-service.js';
import { createMonacoTestStub } from '#lib/testing/monaco-language-stub.js';
import { attachTypescriptShim } from '#lib/testing/monaco-typescript-shim.js';
import type { FileManagerRef, FileManagerProxy } from '#machines/file-manager.machine.types.js';

function createMountProxy(packages: Record<string, string>): FileManagerProxy {
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

  for (const [packageName, content] of Object.entries(packages)) {
    addFile(`/node_modules/${packageName}/index.d.ts`, content);
    addFile(`/node_modules/${packageName}/package.json`, JSON.stringify({ name: packageName, types: 'index.d.ts' }));
  }

  return {
    readdir: vi.fn(async (path: string) => {
      const entries = directories.get(path);
      if (entries) {
        return [...entries];
      }
      throw new Error(`unexpected readdir: ${path}`);
    }),
    readFile: vi.fn(async (path: string) => {
      const content = files.get(path);
      if (content === undefined) {
        throw new Error(`ENOENT: ${path}`);
      }
      return new TextEncoder().encode(content);
    }),
  } as unknown as FileManagerProxy;
}

function createMockContext(stub: MonacoTestStub, proxy: FileManagerProxy): ActivationContext {
  // oxlint-disable-next-line @typescript-eslint/consistent-type-assertions -- minimal context for contribution.activate
  return {
    monaco: stub.monaco,
    fileManager: {
      readFile: vi.fn(async () => new Uint8Array()),
      exists: vi.fn(async () => false),
      readdir: vi.fn(async () => []),
      getDirectoryStat: vi.fn(),
    },
    fileManagerRef: {
      getSnapshot: () => ({ context: { proxy } }),
      subscribe: () => ({ unsubscribe: () => undefined }),
    } as unknown as FileManagerRef,
    workspaceFs: {
      registerFileSystemProvider: vi.fn(() => ({ dispose: vi.fn() })),
      registerTextDocumentContentProvider: vi.fn(() => ({ dispose: vi.fn() })),
      hasProvider: vi.fn(() => false),
      getFileSystemProvider: vi.fn(),
      getTextDocumentProvider: vi.fn(),
      openTextDocument: vi.fn(),
      openTextProvider: vi.fn(),
      peekModel: vi.fn(),
      materialiseUrisForWorkspaceEdit: vi.fn(async () => undefined),
      findFiles: vi.fn(async () => []),
      canMaterialise: vi.fn(() => false),
      bindModelService: vi.fn(),
      dispose: vi.fn(),
    },
  } as unknown as ActivationContext;
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

  it('registers index.d.ts and synthetic package.json for each kernel discovered on the mount', async () => {
    const proxy = createMountProxy({ replicad: 'export declare const stubKernel: 1;' });
    const context = createMockContext(stub, proxy);
    registry.addContribution(tsContribution);
    registry.activate(context);
    stub.__createModel('inmemory://t/kernel', 'typescript');

    const tsAdd = stub.monaco.typescript.typescriptDefaults.addExtraLib as unknown as ReturnType<typeof vi.fn>;
    const jsAdd = stub.monaco.typescript.javascriptDefaults.addExtraLib as unknown as ReturnType<typeof vi.fn>;

    await vi.waitFor(() => {
      expect(tsAdd.mock.calls.length).toBeGreaterThan(0);
    });

    const tsPaths = tsAdd.mock.calls.map((c) => c[1] as string);
    expect(tsPaths).toContain('file:///node_modules/replicad/index.d.ts');
    expect(tsPaths).toContain('file:///node_modules/replicad/package.json');

    const jsPaths = jsAdd.mock.calls.map((c) => c[1] as string);
    expect(jsPaths).toContain('file:///node_modules/replicad/index.d.ts');
    expect(jsPaths).toContain('file:///node_modules/replicad/package.json');

    const packageCall = tsAdd.mock.calls.find((c) => c[1] === 'file:///node_modules/replicad/package.json');
    expect(packageCall).toBeDefined();
    expect(JSON.parse(packageCall![0] as string)).toEqual({ name: 'replicad', types: 'index.d.ts' });
  });

  it('uses /node_modules bytes from the FM proxy for each package', async () => {
    const proxy = createMountProxy({ replicad: 'export declare const fromMount: 42;' });
    const context = createMockContext(stub, proxy);
    registry.addContribution(tsContribution);
    registry.activate(context);
    stub.__createModel('inmemory://t/kernel2', 'typescript');

    const tsAdd = stub.monaco.typescript.typescriptDefaults.addExtraLib as unknown as ReturnType<typeof vi.fn>;
    await vi.waitFor(() => {
      expect(tsAdd).toHaveBeenCalled();
    });

    const dtsCall = tsAdd.mock.calls.find((c) => c[1] === 'file:///node_modules/replicad/index.d.ts');
    expect(dtsCall).toBeDefined();
    expect(dtsCall![0] as string).toContain('fromMount');
  });

  it('should register generated GeoSpec package and subpath declarations from the bundled-types mount', async () => {
    const geospecTypes: Record<string, string> = {};
    geospecTypes['geospec'] = 'export declare const describe: unknown;';
    geospecTypes['geospec/brep'] = 'export declare const analyzeBrep: unknown;';
    geospecTypes['geospec/model'] = 'export declare const loadModel: unknown;';
    geospecTypes['geospec/runner/web'] = 'export declare const createGeoSpecWebRunner: unknown;';
    geospecTypes['geospec/runner/worker'] = 'export type GeoSpecRunnerResult = unknown;';
    geospecTypes['geospec/step'] = 'export declare const loadStep: unknown;';
    const proxy = createMountProxy(geospecTypes);
    const context = createMockContext(stub, proxy);
    registry.addContribution(tsContribution);
    registry.activate(context);
    stub.__createModel('inmemory://t/main.geospec.ts', 'typescript');

    const tsAdd = stub.monaco.typescript.typescriptDefaults.addExtraLib as unknown as ReturnType<typeof vi.fn>;
    await vi.waitFor(() => {
      expect(tsAdd.mock.calls.length).toBeGreaterThan(0);
    });

    const tsPaths = tsAdd.mock.calls.map((c) => c[1] as string);
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

  it('registers kernel mount extras when a javascript model opens', async () => {
    const proxy = createMountProxy({ replicad: 'export declare const stubKernel: 1;' });
    const context = createMockContext(stub, proxy);
    registry.addContribution(jsContribution);
    registry.activate(context);
    stub.__createModel('inmemory://j/kernel', 'javascript');

    const tsAdd = stub.monaco.typescript.typescriptDefaults.addExtraLib as unknown as ReturnType<typeof vi.fn>;
    await vi.waitFor(() => {
      expect(tsAdd.mock.calls.length).toBeGreaterThan(0);
    });

    const tsPaths = tsAdd.mock.calls.map((c) => c[1] as string);
    expect(tsPaths).toContain('file:///node_modules/replicad/index.d.ts');
  });
});
