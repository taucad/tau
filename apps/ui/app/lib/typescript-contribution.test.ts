import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { ActivationContext } from '#lib/monaco-language-registry.js';
import type { MonacoTestStub } from '#lib/testing/monaco-language-stub.js';
import { LanguageContributionRegistry } from '#lib/monaco-language-registry.js';
import { createMonacoTestStub } from '#lib/testing/monaco-language-stub.js';
import { attachTypescriptShim } from '#lib/testing/monaco-typescript-shim.js';
import { tsContribution } from '#lib/typescript-contribution.js';
import type { FileManagerRef } from '#machines/file-manager.machine.types.js';

const ataConstructorCalls = vi.fn();
const ataInstance = {
  initialize: vi.fn(),
  startWatching: vi.fn(),
  dispose: vi.fn(),
  onProjectSessionChange: vi.fn(),
};

/* eslint-disable @typescript-eslint/naming-convention -- mock mirrors upstream `TypeAcquisitionService` export shape */
vi.mock('#lib/type-acquisition-service.js', () => ({
  TypeAcquisitionService: vi.fn().mockImplementation(function mockAta(...args: unknown[]) {
    ataConstructorCalls(...args);
    return ataInstance;
  }),
}));
/* eslint-enable @typescript-eslint/naming-convention -- end type acquisition mock waiver */

function createMockContext(stub: MonacoTestStub): ActivationContext {
  const proxyStub = {
    readdir: vi.fn(async () => [] as string[]),
    readFile: vi.fn(async () => new Uint8Array()),
  };
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
      getSnapshot: () => ({ context: { proxy: proxyStub } }),
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

describe('tsContribution', () => {
  let stub: MonacoTestStub;
  let registry: LanguageContributionRegistry;
  let context: ActivationContext;

  beforeEach(() => {
    stub = createMonacoTestStub();
    attachTypescriptShim(stub);
    registry = new LanguageContributionRegistry();
    ataConstructorCalls.mockClear();
    for (const mockFunction of Object.values(ataInstance)) {
      mockFunction.mockClear();
    }

    context = createMockContext(stub);
  });

  afterEach(() => {
    registry.dispose();
    stub.__reset();
    vi.clearAllMocks();
  });

  it('should expose activationLanguageIds === ["typescript", "typescriptreact"]', () => {
    expect(tsContribution.activationLanguageIds).toEqual(['typescript', 'typescriptreact']);
  });

  it('should not initialize TypeAcquisitionService when no TS model exists', () => {
    registry.addContribution(tsContribution);
    registry.activate(context);

    expect(ataConstructorCalls).not.toHaveBeenCalled();
  });

  it('should initialize TypeAcquisitionService exactly once when a typescript model is created', async () => {
    registry.addContribution(tsContribution);
    registry.activate(context);

    stub.__createModel('inmemory://t/0', 'typescript');

    await vi.waitFor(() => {
      expect(ataConstructorCalls).toHaveBeenCalledTimes(1);
    });
    expect(ataInstance.initialize).toHaveBeenCalledTimes(1);
    expect(ataInstance.startWatching).toHaveBeenCalledTimes(1);
  });

  it('should initialize TypeAcquisitionService exactly once when both typescript and tsx models are created', async () => {
    registry.addContribution(tsContribution);
    registry.activate(context);

    stub.__createModel('inmemory://t/0', 'typescript');
    stub.__createModel('inmemory://t/1', 'typescriptreact');

    await vi.waitFor(() => {
      expect(ataConstructorCalls).toHaveBeenCalledTimes(1);
    });
  });

  it('should register materializing definition providers after workers resolve', async () => {
    const definitionSpy = vi.spyOn(stub.monaco.languages, 'registerDefinitionProvider');

    registry.addContribution(tsContribution);
    registry.activate(context);

    stub.__createModel('inmemory://t/0', 'typescript');

    await vi.waitFor(() => {
      expect(definitionSpy).toHaveBeenCalled();
    });
  });

  it('should disable stock definitions / references / rename in typescript mode configuration', async () => {
    registry.addContribution(tsContribution);
    registry.activate(context);

    stub.__createModel('inmemory://t/0', 'typescript');

    await vi.waitFor(() => {
      const tsDefaults = stub.monaco.typescript.typescriptDefaults as unknown as {
        modeConfiguration: { definitions: boolean; references: boolean; rename: boolean };
      };
      expect(tsDefaults.modeConfiguration.definitions).toBe(false);
    });
    const tsDefaults = stub.monaco.typescript.typescriptDefaults as unknown as {
      modeConfiguration: { definitions: boolean; references: boolean; rename: boolean };
    };
    expect(tsDefaults.modeConfiguration.references).toBe(false);
    expect(tsDefaults.modeConfiguration.rename).toBe(false);
  });

  it('should set moduleResolution to Bundler on TS defaults when a typescript model opens', async () => {
    registry.addContribution(tsContribution);
    registry.activate(context);

    stub.__createModel('inmemory://t/0', 'typescript');

    await vi.waitFor(() => {
      expect(vi.mocked(stub.monaco.typescript.typescriptDefaults.setCompilerOptions)).toHaveBeenCalled();
    });
    const tsOptions = vi.mocked(stub.monaco.typescript.typescriptDefaults.setCompilerOptions).mock.calls[0]![0];
    expect(tsOptions.moduleResolution).toBe(100);
  });

  it('should enable TypeScript parameter-name inlay hints when a typescript model opens', async () => {
    registry.addContribution(tsContribution);
    registry.activate(context);

    stub.__createModel('inmemory://t_inlay/0', 'typescript');

    await vi.waitFor(() => {
      expect(vi.mocked(stub.monaco.typescript.typescriptDefaults.setInlayHintsOptions)).toHaveBeenCalled();
    });
    expect(vi.mocked(stub.monaco.typescript.typescriptDefaults.setInlayHintsOptions)).toHaveBeenCalledWith({
      includeInlayParameterNameHints: 'all',
      includeInlayParameterNameHintsWhenArgumentMatchesName: true,
    });
  });

  it('should register implementation and type-definition providers for both TS language ids', async () => {
    const implSpy = vi.spyOn(stub.monaco.languages, 'registerImplementationProvider');
    const typedefSpy = vi.spyOn(stub.monaco.languages, 'registerTypeDefinitionProvider');

    registry.addContribution(tsContribution);
    registry.activate(context);

    stub.__createModel('inmemory://t_impl/0', 'typescript');

    await vi.waitFor(() => {
      expect(implSpy).toHaveBeenCalledTimes(2);
    });
    expect(typedefSpy).toHaveBeenCalledTimes(2);

    implSpy.mockRestore();
    typedefSpy.mockRestore();
  });

  it('should not activate from a javascript-only model', async () => {
    registry.addContribution(tsContribution);
    registry.activate(context);

    stub.__createModel('inmemory://j_only/0', 'javascript');

    await new Promise<void>((resolve) => {
      setTimeout(resolve, 30);
    });
    expect(ataConstructorCalls).not.toHaveBeenCalled();
  });
});
