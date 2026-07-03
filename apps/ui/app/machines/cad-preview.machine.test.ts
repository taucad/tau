// @vitest-environment node
/* eslint-disable @typescript-eslint/naming-convention -- test data uses filenames as object keys */
import { describe, it, expect, vi, afterEach } from 'vitest';
import { createActor, waitFor } from 'xstate';
import { mock } from 'vitest-mock-extended';
import { createMockRuntimeClient } from '@taucad/runtime/testing';
import { fromSafeAsync } from '#lib/xstate.lib.js';
import { stopRootWithRehydration } from '#lib/xstate-test.utils.js';
import { cadMachine } from '#machines/cad.machine.js';
import { cadPreviewMachine } from '#machines/cad-preview.machine.js';
import type { PrepareFilesInput } from '#machines/cad-preview.machine.js';
import type { AppRuntimeClient, KernelOptionsFactory, LazyKernelOptionsFactory } from '#types/runtime-client.alias.js';

const createKernelOptionsFactory = (): LazyKernelOptionsFactory => async () => () =>
  mock<ReturnType<KernelOptionsFactory>>({
    config: {
      tauApiUrl: 'https://api.test',
      tauWebSocketUrl: 'wss://api.test',
    },
  });

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('cadPreviewMachine + cadMachine integration', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('should send initializeModel to cadRef after prepareFiles completes', async () => {
    const mockClient = createMockRuntimeClient() as AppRuntimeClient;

    const providedCadMachine = cadMachine.provide({
      actors: {
        connectKernelActor: fromSafeAsync(async () => {
          return {
            type: 'kernelConnected',
            client: mockClient,
            cleanups: [] as Array<() => void>,
          };
        }),
      },
    });

    const cadRef = createActor(providedCadMachine, {
      input: {
        shouldInitializeKernelOnStart: false,
        kernelOptionsFactory: createKernelOptionsFactory(),
      },
    });

    const prepareFilesFunction = vi.fn().mockResolvedValue(undefined);

    const providedPreviewMachine = cadPreviewMachine.provide({
      actors: {
        prepareFiles: fromSafeAsync(prepareFilesFunction),
      },
    });

    const previewRef = createActor(providedPreviewMachine, {
      input: {
        cadRef,
        projectId: 'proj_test',
        mainFile: 'main.ts',
        files: { 'main.ts': { content: new Uint8Array([1, 2, 3]) } },
        parameters: { width: 42 },
      },
    });

    cadRef.start();
    previewRef.start();
    previewRef.send({ type: 'start' });

    await waitFor(previewRef, (s) => s.value === 'active');
    await waitFor(cadRef, (s) => s.value === 'idle');
    await new Promise((resolve) => {
      setTimeout(resolve, 0);
    });

    expect(mockClient.render).toHaveBeenCalledWith({
      source: { path: { path: '/projects/proj_test', filename: 'main.ts' } },
      parameters: { width: 42 },
    });
    expect(mockClient.updateParameters).toHaveBeenCalledWith({ width: 42 });

    cadRef.stop();
    previewRef.stop();
  });

  it('should send initializeModel after Strict Mode stopRootWithRehydration cycle', async () => {
    const mockClient = createMockRuntimeClient() as AppRuntimeClient;
    let connectDelay = 50;

    const providedCadMachine = cadMachine.provide({
      actors: {
        connectKernelActor: fromSafeAsync(async () => {
          await new Promise((resolve) => {
            setTimeout(resolve, connectDelay);
          });
          return {
            type: 'kernelConnected',
            client: mockClient,
            cleanups: [] as Array<() => void>,
          };
        }),
      },
    });

    const cadRef = createActor(providedCadMachine, {
      input: {
        shouldInitializeKernelOnStart: false,
        kernelOptionsFactory: createKernelOptionsFactory(),
      },
    });

    const prepareFilesFunction = vi.fn().mockResolvedValue(undefined);

    const providedPreviewMachine = cadPreviewMachine.provide({
      actors: {
        prepareFiles: fromSafeAsync(prepareFilesFunction),
      },
    });

    const previewRef = createActor(providedPreviewMachine, {
      input: {
        cadRef,
        projectId: 'proj_test',
        mainFile: 'main.ts',
        files: { 'main.ts': { content: new Uint8Array([1, 2, 3]) } },
        parameters: { width: 42 },
      },
    });

    // --- Mount phase ---
    cadRef.start();
    previewRef.start();
    previewRef.send({ type: 'start' });

    // Let async work begin
    await new Promise((resolve) => {
      setTimeout(resolve, 10);
    });

    // --- Strict Mode cleanup phase (same order as React useEffect cleanup) ---
    stopRootWithRehydration(cadRef);
    stopRootWithRehydration(previewRef);

    // --- Strict Mode re-mount phase ---
    connectDelay = 50; // Fresh connection delay for the restart
    cadRef.start();
    previewRef.start();
    previewRef.send({ type: 'start' }); // Ignored since we're in preparingFiles

    // --- Verify the system recovers ---
    await waitFor(cadRef, (s) => s.value === 'idle', { timeout: 5000 });
    await waitFor(previewRef, (s) => s.value === 'active', { timeout: 5000 });
    await new Promise((resolve) => {
      setTimeout(resolve, 0);
    });

    const cadSnapshot = cadRef.getSnapshot();
    expect(cadSnapshot.value).toBe('idle');
    expect(cadSnapshot.context.file).toEqual({ path: '/projects/proj_test', filename: 'main.ts' });
    expect(mockClient.render).toHaveBeenCalledWith({
      source: { path: { path: '/projects/proj_test', filename: 'main.ts' } },
      parameters: { width: 42 },
    });
    expect(mockClient.updateParameters).toHaveBeenCalledWith({ width: 42 });

    cadRef.stop();
    previewRef.stop();
  });

  it('should handle prepareFiles completing after cadRef connects', async () => {
    const mockClient = createMockRuntimeClient() as AppRuntimeClient;

    const providedCadMachine = cadMachine.provide({
      actors: {
        connectKernelActor: fromSafeAsync(async () => {
          return {
            type: 'kernelConnected',
            client: mockClient,
            cleanups: [] as Array<() => void>,
          };
        }),
      },
    });

    const cadRef = createActor(providedCadMachine, {
      input: {
        shouldInitializeKernelOnStart: false,
        kernelOptionsFactory: createKernelOptionsFactory(),
      },
    });

    let resolvePrepareFiles!: () => void;
    const prepareFilesFunction = vi.fn(
      async () =>
        new Promise<void>((resolve) => {
          resolvePrepareFiles = resolve;
        }),
    );

    const providedPreviewMachine = cadPreviewMachine.provide({
      actors: {
        prepareFiles: fromSafeAsync(prepareFilesFunction),
      },
    });

    const previewRef = createActor(providedPreviewMachine, {
      input: {
        cadRef,
        projectId: 'proj_test',
        mainFile: 'main.ts',
        files: { 'main.ts': { content: new Uint8Array([1, 2, 3]) } },
      },
    });

    // --- Strict Mode: mount → cleanup → remount ---
    cadRef.start();
    previewRef.start();
    previewRef.send({ type: 'start' });

    await new Promise((resolve) => {
      setTimeout(resolve, 10);
    });

    stopRootWithRehydration(cadRef);
    stopRootWithRehydration(previewRef);

    cadRef.start();
    previewRef.start();
    previewRef.send({ type: 'start' });

    // CadRef connects first (fast mock)
    await waitFor(cadRef, (s) => s.value === 'idle', { timeout: 5000 });
    expect(cadRef.getSnapshot().context.file).toBeUndefined();

    // Then prepareFiles completes
    resolvePrepareFiles();
    await waitFor(previewRef, (s) => s.value === 'active', { timeout: 5000 });

    // InitializeModel should have been sent to cadRef (now in idle)
    expect(mockClient.render).toHaveBeenCalledWith({
      source: { path: { path: '/projects/proj_test', filename: 'main.ts' } },
      parameters: {},
    });

    cadRef.stop();
    previewRef.stop();
  });

  it('should handle slow prepareFiles with abort during Strict Mode', async () => {
    const mockClient = createMockRuntimeClient() as AppRuntimeClient;
    let connectDelay = 100;

    const providedCadMachine = cadMachine.provide({
      actors: {
        connectKernelActor: fromSafeAsync(async () => {
          await new Promise((resolve) => {
            setTimeout(resolve, connectDelay);
          });
          return {
            type: 'kernelConnected',
            client: mockClient,
            cleanups: [] as Array<() => void>,
          };
        }),
      },
    });

    const cadRef = createActor(providedCadMachine, {
      input: {
        shouldInitializeKernelOnStart: false,
        kernelOptionsFactory: createKernelOptionsFactory(),
      },
    });

    // Simulate slow filesystem ops — fromSafeAsync handles abort natively
    // via the closed guard + AbortController, no manual never-settle needed
    const prepareFilesFunction = vi.fn(async ({ signal }: { signal: AbortSignal }) => {
      await new Promise<void>((resolve, reject) => {
        const timer = setTimeout(resolve, 150);
        signal.addEventListener('abort', () => {
          clearTimeout(timer);
          reject(new DOMException('The operation was aborted.', 'AbortError'));
        });
      });
    });

    const providedPreviewMachine = cadPreviewMachine.provide({
      actors: {
        prepareFiles: fromSafeAsync(prepareFilesFunction),
      },
    });

    const previewRef = createActor(providedPreviewMachine, {
      input: {
        cadRef,
        projectId: 'proj_test',
        mainFile: 'main.ts',
        files: { 'main.ts': { content: new Uint8Array([1, 2, 3]) } },
        parameters: { width: 42 },
      },
    });

    // --- Mount ---
    cadRef.start();
    previewRef.start();
    previewRef.send({ type: 'start' });

    // Let prepareFiles start but not finish (150ms delay, wait only 20ms)
    await new Promise((resolve) => {
      setTimeout(resolve, 20);
    });
    expect(previewRef.getSnapshot().value).toBe('preparingFiles');

    // --- Strict Mode cleanup (cadRef first, then previewRef — same as React) ---
    stopRootWithRehydration(cadRef);
    stopRootWithRehydration(previewRef);

    // --- Re-mount ---
    connectDelay = 100;
    cadRef.start();
    previewRef.start();
    previewRef.send({ type: 'start' });

    // Wait for both to complete
    await waitFor(cadRef, (s) => s.value === 'idle', { timeout: 5000 });
    await waitFor(previewRef, (s) => s.value === 'active', { timeout: 5000 });
    await new Promise((resolve) => {
      setTimeout(resolve, 0);
    });

    const cadSnapshot = cadRef.getSnapshot();
    expect(cadSnapshot.value).toBe('idle');
    expect(cadSnapshot.context.file).toEqual({ path: '/projects/proj_test', filename: 'main.ts' });
    expect(mockClient.render).toHaveBeenCalledWith({
      source: { path: { path: '/projects/proj_test', filename: 'main.ts' } },
      parameters: { width: 42 },
    });
    expect(mockClient.updateParameters).toHaveBeenCalledWith({ width: 42 });

    cadRef.stop();
    previewRef.stop();
  });

  it('should not fail with detached ArrayBuffer when zombie prepareFiles transfers file content', async () => {
    const mockClient = createMockRuntimeClient() as AppRuntimeClient;
    let connectDelay = 100;

    const providedCadMachine = cadMachine.provide({
      actors: {
        connectKernelActor: fromSafeAsync(async () => {
          await new Promise((resolve) => {
            setTimeout(resolve, connectDelay);
          });
          return {
            type: 'kernelConnected',
            client: mockClient,
            cleanups: [] as Array<() => void>,
          };
        }),
      },
    });

    const cadRef = createActor(providedCadMachine, {
      input: {
        shouldInitializeKernelOnStart: false,
        kernelOptionsFactory: createKernelOptionsFactory(),
      },
    });

    /**
     * Simulates the production prepareFiles behavior where:
     * 1. exists() checks if the file is already written (async RPC via MessagePort)
     * 2. writeFiles() sends content through BridgeProxy → postMessage with transferables
     * 3. postMessage(msg, transferables) detaches the ArrayBuffers on the sender side
     *
     * With fromSafeAsync, zombie prevention is handled natively:
     * - The closed guard silences post-unsubscribe emissions
     * - The AbortController aborts the signal on unsubscribe
     * - signal.throwIfAborted() checkpoints catch aborted operations
     * - Cloning file content before "transfer" prevents shared buffer detachment
     */
    const prepareFilesFunction = vi.fn(async ({ input, signal }: { input: PrepareFilesInput; signal: AbortSignal }) => {
      if (input.files) {
        signal.throwIfAborted();

        await new Promise((resolve) => {
          setTimeout(resolve, 30);
        });

        signal.throwIfAborted();

        for (const file of Object.values(input.files)) {
          const cloned = new Uint8Array(file.content);
          const { buffer } = cloned;
          if (buffer.byteLength === 0) {
            throw new DOMException(
              "Failed to execute 'postMessage' on 'MessagePort': ArrayBuffer at index 0 is already detached.",
              'DataCloneError',
            );
          }
          buffer.transfer();
        }
      }
    });

    const providedPreviewMachine = cadPreviewMachine.provide({
      actors: {
        prepareFiles: fromSafeAsync(prepareFilesFunction),
      },
    });

    const files = { 'main.ts': { content: new Uint8Array([1, 2, 3]) } };

    const previewRef = createActor(providedPreviewMachine, {
      input: {
        cadRef,
        projectId: 'proj_test',
        mainFile: 'main.ts',
        files,
        parameters: { width: 42 },
      },
    });

    // --- Mount ---
    cadRef.start();
    previewRef.start();
    previewRef.send({ type: 'start' });

    // Let P1's exists() start but don't wait for it to complete
    await new Promise((resolve) => {
      setTimeout(resolve, 10);
    });

    // --- Strict Mode cleanup ---
    // Signal is aborted, but P1 is still awaiting exists() (needs 30ms, only 10ms passed)
    stopRootWithRehydration(cadRef);
    stopRootWithRehydration(previewRef);

    // --- Re-mount ---
    connectDelay = 100;
    cadRef.start();
    previewRef.start();
    previewRef.send({ type: 'start' });

    // P1 (zombie) resumes after exists(), signal IS aborted but:
    // - Current code has NO signal.throwIfAborted() before writeFiles
    // - P1 calls writeFiles → transfers ArrayBuffer → detached
    // - P2 calls exists() → not found → calls writeFiles → DataCloneError!
    //
    // With the fix (signal.throwIfAborted + clone), P1 aborts before transfer,
    // P2 clones content before transfer, both work correctly.
    await waitFor(cadRef, (s) => s.value === 'idle', { timeout: 5000 });
    await waitFor(previewRef, (s) => s.value === 'active', { timeout: 5000 });
    await new Promise((resolve) => {
      setTimeout(resolve, 0);
    });

    // Preview machine should be active, NOT in error state
    expect(previewRef.getSnapshot().value).toBe('active');
    expect(previewRef.getSnapshot().context.initError).toBeUndefined();

    // CadRef should have the file and parameters sent directly to kernel
    expect(cadRef.getSnapshot().context.file).toEqual({ path: '/projects/proj_test', filename: 'main.ts' });
    expect(mockClient.render).toHaveBeenCalledWith({
      source: { path: { path: '/projects/proj_test', filename: 'main.ts' } },
      parameters: { width: 42 },
    });
    expect(mockClient.updateParameters).toHaveBeenCalledWith({ width: 42 });

    cadRef.stop();
    previewRef.stop();
  });

  it('should handle zombie prepareFiles natively with fromSafeAsync (no manual abort handling needed)', async () => {
    const mockClient = createMockRuntimeClient() as AppRuntimeClient;

    const providedCadMachine = cadMachine.provide({
      actors: {
        connectKernelActor: fromSafeAsync(async () => {
          return {
            type: 'kernelConnected',
            client: mockClient,
            cleanups: [] as Array<() => void>,
          };
        }),
      },
    });

    const cadRef = createActor(providedCadMachine, {
      input: {
        shouldInitializeKernelOnStart: false,
        kernelOptionsFactory: createKernelOptionsFactory(),
      },
    });

    // PrepareFiles that does NOT handle abort — fromSafeAsync handles zombie
    // prevention natively via the closed guard + unsubscribe
    let zombieResolved = false;
    const unprotectedPrepareFiles = vi.fn(async () => {
      await new Promise((resolve) => {
        setTimeout(resolve, 200);
      });
      zombieResolved = true;
    });

    const providedPreviewMachine = cadPreviewMachine.provide({
      actors: {
        prepareFiles: fromSafeAsync(unprotectedPrepareFiles),
      },
    });

    const previewRef = createActor(providedPreviewMachine, {
      input: {
        cadRef,
        projectId: 'proj_test',
        mainFile: 'main.ts',
        files: { 'main.ts': { content: new Uint8Array([1, 2, 3]) } },
        parameters: { width: 42 },
      },
    });

    // --- Mount ---
    cadRef.start();
    previewRef.start();
    previewRef.send({ type: 'start' });

    await new Promise((resolve) => {
      setTimeout(resolve, 10);
    });

    // --- Strict Mode cleanup ---
    stopRootWithRehydration(cadRef);
    stopRootWithRehydration(previewRef);

    // --- Re-mount ---
    cadRef.start();
    previewRef.start();
    previewRef.send({ type: 'start' });

    // Wait for everything to settle
    await waitFor(cadRef, (s) => s.value === 'idle', { timeout: 5000 });

    // Give the zombie enough time to resolve
    await new Promise((resolve) => {
      setTimeout(resolve, 300);
    });

    // The zombie DID resolve (it doesn't handle abort), but we verify
    // that initializeModel was eventually sent by checking cadRef has the file.
    // The real fix ensures prepareFiles handles abort, preventing the zombie.
    expect(zombieResolved).toBe(true);

    // After Strict Mode, cadRef should have the file (from the re-mounted prepareFiles)
    await waitFor(previewRef, (s) => s.value === 'active', { timeout: 5000 });
    expect(cadRef.getSnapshot().context.file).toEqual({ path: '/projects/proj_test', filename: 'main.ts' });

    cadRef.stop();
    previewRef.stop();
  });
});
