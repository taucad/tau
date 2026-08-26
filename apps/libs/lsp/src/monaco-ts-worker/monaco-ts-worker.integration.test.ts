/** @vitest-environment jsdom */

import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Mock } from 'vitest';

import type * as LanguageFsSyncModule from '@taucad/lsp-fs/sync';

type MonacoTsWorkerEsm = Readonly<{
  TypeScriptWorker: new (context: unknown, createData: unknown) => unknown;
  initialize: Mock;
}>;

let capturedInit: ((context: unknown, createData: unknown) => unknown) | undefined;

const mockState = vi.hoisted(() => ({ initialized: false }));

vi.mock('monaco-editor/esm/vs/language/typescript/ts.worker.js', () => {
  class TypeScriptWorker {
    public readonly _context: unknown;
    public readonly _createData: unknown;

    public constructor(context: unknown, createData: unknown) {
      this._context = context;
      this._createData = createData;
    }

    public _getScriptText(_fileName: string): string | undefined {
      return undefined;
    }

    public getScriptVersion(_fileName: string): string {
      return '';
    }
  }

  // Mirror the bootstrap idempotency check from
  // `monaco-editor/esm/vs/base/common/worker/webWorkerBootstrap.js` so the
  // entry's clobber-then-initialize sequence is exercised end-to-end. The
  // hoisted `mockState` is reset in `beforeEach` so each test starts fresh.
  const initialize = vi.fn((factory: (context: unknown, createData: unknown) => unknown) => {
    if (mockState.initialized) {
      throw new Error('WebWorker already initialized!');
    }
    mockState.initialized = true;
    capturedInit = factory;
  });

  // Mirror the upstream side effect of `ts.worker.js` registering its own
  // `self.onmessage` at module load. The entry must clobber this handler so
  // tau:init/'ignore' don't trigger a default-factory `initialize` race.
  // oxlint-disable-next-line prefer-add-event-listener -- mirrors upstream's `self.onmessage = …` side effect from `ts.worker.js`.
  globalThis.onmessage = (): void => {
    initialize((context, createData) => new TypeScriptWorker(context, createData));
  };

  return Object.fromEntries([
    ['TypeScriptWorker', TypeScriptWorker],
    ['initialize', initialize],
  ]) as unknown as MonacoTsWorkerEsm;
});

const buildClient = vi.fn(() => ({
  readFileText: vi.fn(() => 'from-sync-fs'),
  fileExists: vi.fn(() => false),
  directoryExists: vi.fn(() => false),
  getDirectories: vi.fn(() => []),
  getScriptVersionForPath: vi.fn(() => '1'),
  dispose: vi.fn(),
}));

vi.mock('@taucad/lsp-fs/sync', async (importOriginal) => {
  const actual = await importOriginal<typeof LanguageFsSyncModule>();
  return {
    ...actual,
    createSyncFsClient: buildClient,
  };
});

describe('monaco-ts-worker.entry', () => {
  beforeEach(async () => {
    vi.resetModules();
    capturedInit = undefined;
    buildClient.mockClear();
    // oxlint-disable-next-line prefer-add-event-listener -- resets upstream-style `self.onmessage` between tests.
    globalThis.onmessage = null;
    mockState.initialized = false;
    const monacoTs =
      (await import('monaco-editor/esm/vs/language/typescript/ts.worker.js')) as unknown as MonacoTsWorkerEsm;
    monacoTs.initialize.mockClear();
  });

  it('initializes tau:init before ignore, then boots TauSyncTsWorker with sync FS', async () => {
    await import('#monaco-ts-worker/monaco-ts-worker.entry.js');
    const { TauSyncTsWorker: tauSyncTsWorkerCtor } = await import('#monaco-ts-worker/tau-sync-ts-worker.js');
    const channel = new MessageChannel();
    globalThis.dispatchEvent(
      new MessageEvent('message', {
        data: {
          type: 'tau:init',
          port: channel.port1,
          slotSab: new SharedArrayBuffer(16),
          arenaSab: new SharedArrayBuffer(128),
          workspaceRootAbsolute: '/ws',
        },
      }),
    );

    expect(buildClient).toHaveBeenCalledOnce();

    globalThis.dispatchEvent(new MessageEvent('message', { data: 'ignore' }));

    expect(typeof capturedInit).toBe('function');
    const workerUnknown = capturedInit!({}, {});
    expect(workerUnknown).toBeInstanceOf(tauSyncTsWorkerCtor);

    const scriptText = (workerUnknown as InstanceType<typeof tauSyncTsWorkerCtor>)._getScriptText('file:///lib/foo.ts');
    expect(scriptText).toBe('from-sync-fs');
  });

  it('clobbers the upstream self.onmessage so initialize is only called once', async () => {
    await import('#monaco-ts-worker/monaco-ts-worker.entry.js');
    const monacoTs =
      (await import('monaco-editor/esm/vs/language/typescript/ts.worker.js')) as unknown as MonacoTsWorkerEsm;

    expect(globalThis.onmessage).toBeNull();

    const channel = new MessageChannel();
    expect(() => {
      globalThis.dispatchEvent(
        new MessageEvent('message', {
          data: {
            type: 'tau:init',
            port: channel.port1,
            slotSab: new SharedArrayBuffer(16),
            arenaSab: new SharedArrayBuffer(128),
            workspaceRootAbsolute: '/ws',
          },
        }),
      );
      globalThis.dispatchEvent(new MessageEvent('message', { data: 'ignore' }));
      globalThis.dispatchEvent(new MessageEvent('message', { data: 'ignore' }));
    }).not.toThrow();

    expect(monacoTs.initialize).toHaveBeenCalledOnce();
  });

  it('falls back to stock TypeScriptWorker when tau:init was not received', async () => {
    await import('#monaco-ts-worker/monaco-ts-worker.entry.js');
    const { TauSyncTsWorker: tauSyncTsWorkerCtor } = await import('#monaco-ts-worker/tau-sync-ts-worker.js');
    globalThis.dispatchEvent(new MessageEvent('message', { data: 'ignore' }));

    expect(typeof capturedInit).toBe('function');
    const { TypeScriptWorker: typeScriptWorkerCtor } =
      (await import('monaco-editor/esm/vs/language/typescript/ts.worker.js')) as unknown as MonacoTsWorkerEsm;
    const workerUnknown = capturedInit!({}, {});
    expect(workerUnknown).toBeInstanceOf(typeScriptWorkerCtor);
    expect(workerUnknown).not.toBeInstanceOf(tauSyncTsWorkerCtor);
  });
});
