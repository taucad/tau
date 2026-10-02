import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { ActivationContext } from '#lib/monaco-language-registry.js';
import type { MonacoTestStub } from '#lib/testing/monaco-language-stub.js';
import { LanguageContributionRegistry } from '#lib/monaco-language-registry.js';
import { createMonacoTestStub } from '#lib/testing/monaco-language-stub.js';
import { attachTypescriptShim } from '#lib/testing/monaco-typescript-shim.js';
import { jsContribution } from '#lib/javascript-contribution.js';
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

describe('jsContribution', () => {
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

  it('should expose activationLanguageIds === ["javascript", "javascriptreact"]', () => {
    expect(jsContribution.activationLanguageIds).toEqual(['javascript', 'javascriptreact']);
  });

  it('should not initialize TypeAcquisitionService when no JS model exists', () => {
    registry.addContribution(jsContribution);
    registry.activate(context);

    expect(ataConstructorCalls).not.toHaveBeenCalled();
  });

  it('should initialize TypeAcquisitionService exactly once when a javascript model is created', async () => {
    registry.addContribution(jsContribution);
    registry.activate(context);

    stub.__createModel('inmemory://j/0', 'javascript');

    await vi.waitFor(() => {
      expect(ataConstructorCalls).toHaveBeenCalledTimes(1);
    });
    expect(ataInstance.initialize).toHaveBeenCalledTimes(1);
    expect(ataInstance.startWatching).toHaveBeenCalledTimes(1);
  });

  it('should initialize TypeAcquisitionService exactly once when both javascript and jsx models are created', async () => {
    registry.addContribution(jsContribution);
    registry.activate(context);

    stub.__createModel('inmemory://j/0', 'javascript');
    stub.__createModel('inmemory://j/1', 'javascriptreact');

    await vi.waitFor(() => {
      expect(ataConstructorCalls).toHaveBeenCalledTimes(1);
    });
  });

  it('should register materializing definition providers after workers resolve', async () => {
    const definitionSpy = vi.spyOn(stub.monaco.languages, 'registerDefinitionProvider');

    registry.addContribution(jsContribution);
    registry.activate(context);

    stub.__createModel('inmemory://j/0', 'javascript');

    await vi.waitFor(() => {
      expect(definitionSpy).toHaveBeenCalled();
    });
  });

  it('should disable stock definitions / references / rename in javascript mode configuration', async () => {
    registry.addContribution(jsContribution);
    registry.activate(context);

    stub.__createModel('inmemory://j/0', 'javascript');

    await vi.waitFor(() => {
      const jsDefaults = stub.monaco.typescript.javascriptDefaults as unknown as {
        modeConfiguration: { definitions: boolean; references: boolean; rename: boolean };
      };
      expect(jsDefaults.modeConfiguration.definitions).toBe(false);
    });
    const jsDefaults = stub.monaco.typescript.javascriptDefaults as unknown as {
      modeConfiguration: { definitions: boolean; references: boolean; rename: boolean };
    };
    expect(jsDefaults.modeConfiguration.references).toBe(false);
    expect(jsDefaults.modeConfiguration.rename).toBe(false);
  });

  it('should set moduleResolution to Bundler on JS defaults when a javascript model opens', async () => {
    registry.addContribution(jsContribution);
    registry.activate(context);

    stub.__createModel('inmemory://j/0', 'javascript');

    await vi.waitFor(() => {
      expect(vi.mocked(stub.monaco.typescript.javascriptDefaults.setCompilerOptions)).toHaveBeenCalled();
    });
    const jsOptions = vi.mocked(stub.monaco.typescript.javascriptDefaults.setCompilerOptions).mock.calls[0]![0];
    expect(jsOptions.moduleResolution).toBe(100);
  });

  it('should enable JavaScript parameter-name inlay hints when a javascript model opens', async () => {
    registry.addContribution(jsContribution);
    registry.activate(context);

    stub.__createModel('inmemory://j_inlay/0', 'javascript');

    await vi.waitFor(() => {
      expect(vi.mocked(stub.monaco.typescript.javascriptDefaults.setInlayHintsOptions)).toHaveBeenCalled();
    });
    expect(vi.mocked(stub.monaco.typescript.javascriptDefaults.setInlayHintsOptions)).toHaveBeenCalledWith({
      includeInlayParameterNameHints: 'all',
      includeInlayParameterNameHintsWhenArgumentMatchesName: true,
    });
  });

  it('should register implementation and type-definition providers for both JS language ids', async () => {
    const implSpy = vi.spyOn(stub.monaco.languages, 'registerImplementationProvider');
    const typedefSpy = vi.spyOn(stub.monaco.languages, 'registerTypeDefinitionProvider');

    registry.addContribution(jsContribution);
    registry.activate(context);

    stub.__createModel('inmemory://j_impl/0', 'javascript');

    await vi.waitFor(() => {
      expect(implSpy).toHaveBeenCalledTimes(2);
    });
    expect(typedefSpy).toHaveBeenCalledTimes(2);

    implSpy.mockRestore();
    typedefSpy.mockRestore();
  });
});

describe('ensureAtaBoot shared across tsContribution and jsContribution', () => {
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

  it('constructs TypeAcquisitionService once when TS activates before JS', async () => {
    registry.addContribution(tsContribution);
    registry.addContribution(jsContribution);
    registry.activate(context);

    stub.__createModel('inmemory://t/0', 'typescript');
    await vi.waitFor(() => {
      expect(ataConstructorCalls).toHaveBeenCalledTimes(1);
    });

    stub.__createModel('inmemory://j/0', 'javascript');
    await vi.waitFor(() => {
      expect(stub.monaco.editor.getModels().length).toBeGreaterThanOrEqual(2);
    });
    expect(ataConstructorCalls).toHaveBeenCalledTimes(1);
  });

  it('constructs TypeAcquisitionService once when JS activates before TS', async () => {
    registry.addContribution(tsContribution);
    registry.addContribution(jsContribution);
    registry.activate(context);

    stub.__createModel('inmemory://j/0', 'javascript');
    await vi.waitFor(() => {
      expect(ataConstructorCalls).toHaveBeenCalledTimes(1);
    });

    stub.__createModel('inmemory://t/0', 'typescript');
    await vi.waitFor(() => {
      expect(stub.monaco.editor.getModels().length).toBeGreaterThanOrEqual(2);
    });
    expect(ataConstructorCalls).toHaveBeenCalledTimes(1);
  });
});
