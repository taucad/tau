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

const packageDtsPattern = /^\/node_modules\/([^/]+)\/index\.d\.ts$/;

function createMountProxy(packages: Record<string, string>): FileManagerProxy {
  return {
    readdir: vi.fn(async (path: string) => {
      if (path === '/node_modules') {
        return Object.keys(packages);
      }
      throw new Error(`unexpected readdir: ${path}`);
    }),
    readFile: vi.fn(async (path: string) => {
      const match = packageDtsPattern.exec(path);
      const content = match ? packages[match[1]!] : undefined;
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
