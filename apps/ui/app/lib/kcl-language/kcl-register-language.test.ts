import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { codeLanguages } from '@taucad/types/constants';
import type { FileTreeService } from '@taucad/fs-client/file-tree-service';
import type { ActivationContext } from '#lib/monaco-language-registry.js';
import type { MonacoTestStub } from '#lib/testing/monaco-language-stub.js';
import { createMonacoTestStub } from '#lib/testing/monaco-language-stub.js';

/* eslint-disable @typescript-eslint/naming-convention -- mocks must mirror PascalCase / wasm-snake_case exports from the real module surface */

// Track KclLspClient constructor calls. The mock returns an object with the
// API surface `initializeLsp` reads off the client, but never spawns a Worker
// or imports WASM.
const lspConstructorCalls = vi.fn();
// oxlint-disable-next-line func-names -- vi.fn() spies use named function expressions to keep mock factories `new`-able
vi.mock('#lib/kcl-language/lsp/kcl-lsp-client.js', () => ({
  KclLspClient: vi.fn(function MockKclLspClient(this: Record<string, unknown>, ...args: unknown[]) {
    lspConstructorCalls(...args);
    const state = { ready: false };
    Object.defineProperty(this, 'ready', {
      configurable: true,
      enumerable: true,
      get(): boolean {
        return state.ready;
      },
    });
    Object.assign(this, {
      initialize: vi.fn(async () => {
        state.ready = true;
      }),
      waitForReady: vi.fn(async () => {
        state.ready = true;
      }),
      setCurrentDocumentUri: vi.fn(),
      /** Escape hatch for tests: `initializeLsp` awaits a real-shaped client; this sets `ready` for `notifyDocumentOpen`. */
      __testSetLspReady: () => {
        state.ready = true;
      },
      textDocumentDidOpen: vi.fn(),
      textDocumentDidChange: vi.fn(),
      textDocumentDidClose: vi.fn(),
      getFileManager: vi.fn(() => ({ readFile: vi.fn(async () => new Uint8Array()) })),
      dispose: vi.fn(),
    });
  }),
}));

// Avoid loading the real WASM module — `initializeSymbolServiceWasm` calls
// `import('@taucad/kcl-wasm-lib')` at runtime, which is heavy and irrelevant
// to the activation contract.
vi.mock('@taucad/kcl-wasm-lib', () => ({
  default: vi.fn(async () => undefined),
  parse_wasm: vi.fn(() => [{}, []]),
  Context: vi.fn().mockImplementation(() => ({ executeMock: vi.fn(async () => ({ variables: {}, errors: [] })) })),
}));
vi.mock('@taucad/kcl-wasm-lib/kcl.wasm?url', () => ({ default: 'mock://wasm' }));
vi.mock('@taucad/runtime/kernels/zoo/engine-connection', () => ({
  MockEngineConnection: vi.fn().mockImplementation(() => ({})),
}));

/* eslint-enable @typescript-eslint/naming-convention -- end of mock declarations */

function createMockContext(stub: MonacoTestStub): ActivationContext {
  const readFile = vi.fn(async () => new Uint8Array());
  // oxlint-disable-next-line @typescript-eslint/consistent-type-assertions -- minimal context exercised by kclContribution.activate
  return {
    monaco: stub.monaco,
    modelService: {
      getOrEnsureModel: vi.fn(),
    },
    markerService: {
      clearOwnerEverywhere: vi.fn(),
    },
    fileManager: {
      readFile,
      exists: vi.fn(async () => false),
      readdir: vi.fn(async () => []),
      getDirectoryStat: vi.fn(),
    },
    treeService: {
      stat: vi.fn(),
      listDirectory: vi.fn(),
    } as unknown as FileTreeService,
    fileManagerRef: {
      getSnapshot: () => ({
        context: {
          proxy: { searchFiles: vi.fn().mockReturnValue([]), dispose: vi.fn() },
          rootDirectory: '/workspace',
          filePoolBuffer: undefined,
        },
      }),
    },
  } as unknown as ActivationContext;
}

describe('kclContribution', () => {
  let stub: MonacoTestStub;

  beforeEach(() => {
    stub = createMonacoTestStub();
    lspConstructorCalls.mockClear();
  });

  afterEach(async () => {
    const { kclContribution, disposeKclLsp } = await import('#lib/kcl-language/kcl-register-language.js');
    kclContribution.dispose();
    disposeKclLsp();
    stub.__reset();
    vi.clearAllMocks();
  });

  it('should set kclContribution.activationLanguageIds to ["kcl"]', async () => {
    const { kclContribution } = await import('#lib/kcl-language/kcl-register-language.js');
    expect(kclContribution.activationLanguageIds).toEqual(['kcl']);
  });

  it('should call monaco.languages.register({ id: "kcl", extensions: [".kcl"] }) during register()', async () => {
    const { kclContribution } = await import('#lib/kcl-language/kcl-register-language.js');
    const registerSpy = vi.spyOn(stub.monaco.languages, 'register');

    kclContribution.register(stub.monaco);

    expect(registerSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        id: codeLanguages.kcl,
        extensions: ['.kcl'],
      }),
    );
  });

  it('should not construct a KclLspClient when register() runs without activate()', async () => {
    const { kclContribution } = await import('#lib/kcl-language/kcl-register-language.js');

    kclContribution.register(stub.monaco);

    // Flush any pending microtasks to confirm nothing slipped through.
    await Promise.resolve();
    await Promise.resolve();

    expect(lspConstructorCalls).not.toHaveBeenCalled();
  });

  it('should return synchronously from activate() before constructing a KclLspClient', async () => {
    const { kclContribution } = await import('#lib/kcl-language/kcl-register-language.js');
    const context = createMockContext(stub);

    kclContribution.register(stub.monaco);
    const result = kclContribution.activate(context);

    // Activate returns synchronously; KclLspClient is queued in a microtask
    expect(result).toBeDefined();
    expect(result.disposables.length).toBeGreaterThan(0);
    expect(lspConstructorCalls).not.toHaveBeenCalled();
  });

  it('should construct exactly one KclLspClient after the microtask flushes', async () => {
    const { kclContribution } = await import('#lib/kcl-language/kcl-register-language.js');
    const context = createMockContext(stub);

    kclContribution.register(stub.monaco);
    kclContribution.activate(context);

    // Flush the queueMicrotask scheduled inside activate()
    await Promise.resolve();

    expect(lspConstructorCalls).toHaveBeenCalledTimes(1);
  });

  it('should pass ActivationContext file bridge into KclLspClient when the activate microtask runs', async () => {
    const { kclContribution, getKclLspClient } = await import('#lib/kcl-language/kcl-register-language.js');
    const context = createMockContext(stub);

    kclContribution.register(stub.monaco);
    kclContribution.activate(context);
    await Promise.resolve();

    const ctorArgument = lspConstructorCalls.mock.calls[0]?.[0] as
      | { fs?: { fileManager?: { readFile: (path: string) => Promise<Uint8Array<ArrayBuffer>> } } }
      | undefined;
    expect(ctorArgument?.fs?.fileManager).toBeDefined();
    expect(ctorArgument?.fs?.fileManager?.readFile).toBeTypeOf('function');

    await ctorArgument!.fs!.fileManager!.readFile('projects/p/child.kcl');
    expect(context.fileManager.readFile).toHaveBeenCalledWith('projects/p/child.kcl');

    const client = getKclLspClient();
    expect(client).toBeDefined();
  });

  it('calls setCurrentDocumentUri before textDocumentDidOpen in notifyDocumentOpen', async () => {
    // oxlint-disable-next-line @typescript-eslint/no-deprecated -- exercises legacy notifyDocumentOpen helper
    const { kclContribution, getKclLspClient, notifyDocumentOpen } =
      await import('#lib/kcl-language/kcl-register-language.js');
    const context = createMockContext(stub);

    kclContribution.register(stub.monaco);
    kclContribution.activate(context);

    await Promise.resolve();
    await Promise.resolve();

    const rawClient = getKclLspClient();
    expect(rawClient).toBeDefined();
    const client = rawClient as unknown as {
      readonly ready: boolean;
      __testSetLspReady: () => void;
      setCurrentDocumentUri: ReturnType<typeof vi.fn>;
      textDocumentDidOpen: ReturnType<typeof vi.fn>;
    };
    client.__testSetLspReady();
    expect(client.ready).toBe(true);

    // Ensure we hit the didOpen path (not already-opened / didChange only).
    const { onProjectSessionChange } = kclContribution;
    expect(onProjectSessionChange).toBeDefined();
    if (onProjectSessionChange === undefined) {
      return;
    }
    onProjectSessionChange('test-build-id');

    const testUri = 'file:///public/kcl-samples/axial-fan/main-current-dir-contract.kcl';
    client.setCurrentDocumentUri.mockClear();
    client.textDocumentDidOpen.mockClear();
    // oxlint-disable-next-line @typescript-eslint/no-deprecated -- legacy helper under test
    notifyDocumentOpen(testUri, 'import "fan-housing.kcl"');

    expect(client.setCurrentDocumentUri).toHaveBeenCalledWith(testUri);
    expect(client.textDocumentDidOpen).toHaveBeenCalledTimes(1);
    expect(client.setCurrentDocumentUri.mock.invocationCallOrder[0]).toBeLessThan(
      client.textDocumentDidOpen.mock.invocationCallOrder[0]!,
    );
  });
});
