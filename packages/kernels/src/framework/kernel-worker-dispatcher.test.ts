import process from 'node:process';
import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';
import { createWorkerDispatcher } from '#framework/kernel-worker-dispatcher.js';
import type { KernelWorker } from '#framework/kernel-worker.js';
import type { KernelMessagePort } from '#framework/kernel-message-adapter.js';
import type { KernelCommand, KernelResponse } from '#types/kernel-protocol.types.js';

type MessageHandler = (data: KernelCommand | KernelResponse) => void;

function createMockPort(): KernelMessagePort & {
  simulateMessage: (command: KernelCommand) => void;
  sentMessages: KernelResponse[];
} {
  let handler: MessageHandler | undefined;
  const sentMessages: KernelResponse[] = [];

  return {
    postMessage(message: KernelCommand | KernelResponse) {
      sentMessages.push(message as KernelResponse);
    },
    onMessage(callback: MessageHandler) {
      handler = callback;
    },
    close: vi.fn(),
    simulateMessage(command: KernelCommand) {
      handler?.(command);
    },
    sentMessages,
  };
}

function createMockWorker(overrides?: Partial<KernelWorker>): KernelWorker {
  return {
    initialize: vi.fn<() => Promise<void>>().mockResolvedValue(undefined),
    render: vi.fn<() => Promise<{ success: true; data: [] }>>().mockResolvedValue({ success: true, data: [] }),
    exportGeometry: vi.fn<() => Promise<{ success: true; data: [] }>>().mockResolvedValue({ success: true, data: [] }),
    cleanup: vi.fn<() => Promise<void>>().mockResolvedValue(undefined),
    notifyFileChanged: vi.fn<() => Promise<void>>().mockResolvedValue(undefined),
    configureMiddleware: vi.fn<() => Promise<void>>().mockResolvedValue(undefined),
    ensureLoadedBundler: vi.fn<() => Promise<void>>().mockResolvedValue(undefined),
    setTelemetrySend: vi.fn(),
    flushTelemetry: vi.fn(),
    ...overrides,
  } as unknown as KernelWorker;
}

async function waitForMicrotasks(): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, 10);
  });
}

describe('createWorkerDispatcher', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('normal operation', () => {
    it('responds with initialized on successful init', async () => {
      const worker = createMockWorker();
      const port = createMockPort();
      createWorkerDispatcher(worker, port);

      port.simulateMessage({
        type: 'initialize',
        requestId: '1',
        options: {},
        middlewareEntries: [],
      });

      await waitForMicrotasks();
      const response = port.sentMessages.find((m) => m.type === 'initialized');
      expect(response).toEqual({ type: 'initialized', requestId: '1' });
    });

    it('responds with error when init throws', async () => {
      const worker = createMockWorker({
        initialize: vi.fn().mockRejectedValue(new Error('WASM load failed')),
      });
      const port = createMockPort();
      createWorkerDispatcher(worker, port);

      port.simulateMessage({
        type: 'initialize',
        requestId: '2',
        options: {},
        middlewareEntries: [],
      });

      await waitForMicrotasks();
      const response = port.sentMessages.find((m) => m.type === 'error');
      expect(response).toBeDefined();
      expect(response!.type).toBe('error');
      expect((response as { issues: Array<{ message: string }> }).issues[0]!.message).toContain('WASM load failed');
    });

    it('responds with exported on successful export', async () => {
      const worker = createMockWorker();
      const port = createMockPort();
      createWorkerDispatcher(worker, port);

      port.simulateMessage({
        type: 'export',
        requestId: '3',
        format: 'stl',
      });

      await waitForMicrotasks();
      const response = port.sentMessages.find((m) => m.type === 'exported');
      expect(response).toBeDefined();
    });
  });

  describe('unhandled rejection trap', () => {
    let originalListenerCount: number;

    beforeEach(() => {
      originalListenerCount = process.listenerCount('unhandledRejection');
    });

    afterEach(() => {
      // Verify no listeners leaked
      const currentCount = process.listenerCount('unhandledRejection');
      expect(currentCount).toBeLessThanOrEqual(originalListenerCount + 1);
    });

    it('catches unhandled rejections during init and sends error response', async () => {
      const worker = createMockWorker({
        initialize: vi.fn().mockImplementation(
          async () =>
            new Promise<void>(() => {
              // Simulates Emscripten's pthread init: throws in a fire-and-forget promise
              void Promise.reject(new Error('SharedArrayBuffer transfer requires self.crossOriginIsolated'));
            }),
        ),
      });
      const port = createMockPort();
      createWorkerDispatcher(worker, port);

      port.simulateMessage({
        type: 'initialize',
        requestId: '10',
        options: {},
        middlewareEntries: [],
      });

      await waitForMicrotasks();
      const errorResponse = port.sentMessages.find((m) => m.type === 'error');
      expect(errorResponse).toBeDefined();
      expect((errorResponse as { issues: Array<{ message: string }> }).issues[0]!.message).toContain(
        'crossOriginIsolated',
      );
    });

    it('catches unhandled rejections during render and sends error response', async () => {
      const worker = createMockWorker({
        render: vi.fn().mockImplementation(
          async () =>
            new Promise(() => {
              void Promise.reject(new Error('WASM worker crash'));
            }),
        ),
      });
      const port = createMockPort();
      createWorkerDispatcher(worker, port);

      port.simulateMessage({
        type: 'render',
        requestId: '11',
        file: { path: '/', filename: 'test.ts' },
        params: {},
      });

      await waitForMicrotasks();
      const errorResponse = port.sentMessages.find((m) => m.type === 'error');
      expect(errorResponse).toBeDefined();
      expect((errorResponse as { issues: Array<{ message: string }> }).issues[0]!.message).toContain(
        'WASM worker crash',
      );
    });

    it('catches unhandled rejections during export and sends error response', async () => {
      const worker = createMockWorker({
        exportGeometry: vi.fn().mockImplementation(
          async () =>
            new Promise(() => {
              void Promise.reject(new Error('export worker failure'));
            }),
        ),
      });
      const port = createMockPort();
      createWorkerDispatcher(worker, port);

      port.simulateMessage({
        type: 'export',
        requestId: '12',
        format: 'stl',
      });

      await waitForMicrotasks();
      const errorResponse = port.sentMessages.find((m) => m.type === 'error');
      expect(errorResponse).toBeDefined();
      expect((errorResponse as { issues: Array<{ message: string }> }).issues[0]!.message).toContain(
        'export worker failure',
      );
    });

    it('cleans up the listener after successful operation', async () => {
      const worker = createMockWorker();
      const port = createMockPort();
      createWorkerDispatcher(worker, port);

      port.simulateMessage({
        type: 'initialize',
        requestId: '20',
        options: {},
        middlewareEntries: [],
      });

      await waitForMicrotasks();

      const currentCount = process.listenerCount('unhandledRejection');
      expect(currentCount).toBe(originalListenerCount);
    });

    it('cleans up the listener after failed operation', async () => {
      const worker = createMockWorker({
        initialize: vi.fn().mockRejectedValue(new Error('fail')),
      });
      const port = createMockPort();
      createWorkerDispatcher(worker, port);

      port.simulateMessage({
        type: 'initialize',
        requestId: '21',
        options: {},
        middlewareEntries: [],
      });

      await waitForMicrotasks();

      const currentCount = process.listenerCount('unhandledRejection');
      expect(currentCount).toBe(originalListenerCount);
    });

    it('handles non-Error rejection reasons gracefully', async () => {
      const worker = createMockWorker({
        initialize: vi.fn().mockImplementation(
          async () =>
            new Promise<void>(() => {
              void Promise.reject('plain string rejection');
            }),
        ),
      });
      const port = createMockPort();
      createWorkerDispatcher(worker, port);

      port.simulateMessage({
        type: 'initialize',
        requestId: '30',
        options: {},
        middlewareEntries: [],
      });

      await waitForMicrotasks();
      const errorResponse = port.sentMessages.find((m) => m.type === 'error');
      expect(errorResponse).toBeDefined();
      expect((errorResponse as { issues: Array<{ message: string }> }).issues[0]!.message).toContain(
        'plain string rejection',
      );
    });
  });
});
