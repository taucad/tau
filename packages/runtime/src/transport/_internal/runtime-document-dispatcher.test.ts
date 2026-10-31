import { describe, expect, it, vi } from 'vitest';
import { createChannelClient, wrapMessagePort } from '@taucad/rpc';
import type { OnWorkerLog } from '@taucad/types';
import type { KernelWorker } from '#framework/kernel-worker.js';
import { createDocumentWorkerDispatcher } from '#transport/_internal/runtime-document-dispatcher.js';
import type { RuntimeDocumentProtocol } from '#types/runtime-document-protocol.types.js';
import { runtimeDocumentProtocolSchemas } from '#types/runtime-document-protocol.schemas.js';

describe('document worker dispatcher', () => {
  it('dispatches document commands and encodes public rendering/export bytes', async () => {
    const ports = new MessageChannel();
    const open = vi.fn();
    let emitLog: OnWorkerLog | undefined;
    const worker = {
      setTelemetrySend: vi.fn(),
      setObservation: vi.fn(),
      setDevtoolsTelemetryEnabled: vi.fn(),
      setCompiledWasmModules: vi.fn(),
      afterTerminalReply: vi.fn(),
      capabilitiesManifest: { registrations: [], routes: [], renderCapabilities: {} },
      async initialize(input: Parameters<KernelWorker['initialize']>[0]) {
        emitLog = input.callbacks.onLog;
      },
      handleOpenDocument: open,
      async exportDocument() {
        return {
          success: true,
          exportId: 'bom',
          evaluationId: 'e1',
          issues: [],
          files: [{ name: 'bom.csv', mimeType: 'text/csv', bytes: new Uint8Array([1, 2]) }],
        };
      },
      permitComputePublication: vi.fn(),
    } as unknown as KernelWorker;
    const server = createDocumentWorkerDispatcher(worker, wrapMessagePort(ports.port1, { label: 'document-host' }));
    const client = createChannelClient<RuntimeDocumentProtocol>({
      port: wrapMessagePort(ports.port2, { label: 'document-consumer' }),
      sessionKey: 'tau.runtime/v1',
      protocolSchemas: runtimeDocumentProtocolSchemas,
    });
    await client.ready;
    await client.call('initialize', {});
    const delivered: string[] = [];
    client.onNotify('logBatch', () => delivered.push('log'));
    client.onNotify('evaluated', () => delivered.push('evaluated'));
    client.onNotify('rendered', () => delivered.push('rendered'));
    emitLog?.({ level: 'debug', message: 'evaluation stopped' });
    worker.onEvaluated?.({
      documentId: 'd1',
      intent: 0,
      id: 'e1',
      success: true,
      transient: false,
      views: [],
      exports: [],
      issues: [],
    });
    await vi.waitFor(() => {
      expect(delivered).toEqual(['log', 'evaluated']);
    });
    worker.onOperationSettled?.({ operation: 'evaluate', operationId: 'evaluate:d1:e1', outcome: 'succeeded' });
    delivered.length = 0;
    client.notify('open', {
      documentId: 'd1',
      intent: 0,
      file: { path: '/', filename: 'main.ts' },
      parameters: {},
      watch: false,
    });
    await new Promise<void>((resolve) => {
      setTimeout(resolve, 0);
    });
    expect(open).toHaveBeenCalledWith(expect.objectContaining({ documentId: 'd1' }));

    const rendered = Promise.withResolvers<RuntimeDocumentProtocol['notifies']['rendered']['args']>();
    client.onNotify('rendered', rendered.resolve);
    emitLog?.({ level: 'debug', message: 'render stopped' });
    worker.onRendered?.({
      subscriptionId: 'v1',
      intent: 0,
      success: true,
      view: 'preview',
      requestId: 'r1',
      evaluationId: 'e1',
      transient: false,
      issues: [],
      hash: 'h1',
      artifact: { mimeType: 'image/png', content: new Uint8Array([3, 4]) },
    });
    await expect(rendered.promise).resolves.toMatchObject({
      success: true,
      artifact: { content: { delivery: 'inline', bytes: new Uint8Array([3, 4]) } },
    });
    expect(delivered).toEqual(['log', 'rendered']);
    worker.onOperationSettled?.({ operation: 'render', operationId: 'render:v1:e1:r1', outcome: 'succeeded' });
    const exported = await client.call('export', { documentId: 'd1', operationId: 'op1', target: 'bom' });
    expect(exported).toMatchObject({
      success: true,
      exportId: 'bom',
      files: [{ bytes: { delivery: 'inline', bytes: new Uint8Array([1, 2]) } }],
    });
    expect(worker.afterTerminalReply).toHaveBeenCalledTimes(4);
    client.close();
    server.dispose();
  });

  it("should flush an operation's spans only after its terminal reply, whichever comes first", async () => {
    const ports = new MessageChannel();
    const order: string[] = [];
    const worker = {
      setTelemetrySend: vi.fn(),
      setObservation: vi.fn(),
      setDevtoolsTelemetryEnabled: vi.fn(),
      setCompiledWasmModules: vi.fn(),
      afterTerminalReply: vi.fn(() => order.push('flush')),
      capabilitiesManifest: { registrations: [], routes: [], renderCapabilities: {} },
      initialize: vi.fn(async () => undefined),
      async describe() {
        order.push('describe-settled');
        return { success: false, issues: [] };
      },
      permitComputePublication: vi.fn(),
    } as unknown as KernelWorker;
    const server = createDocumentWorkerDispatcher(worker, wrapMessagePort(ports.port1));
    const client = createChannelClient<RuntimeDocumentProtocol>({
      port: wrapMessagePort(ports.port2),
      sessionKey: 'tau.runtime/v1',
      protocolSchemas: runtimeDocumentProtocolSchemas,
    });
    try {
      await client.ready;
      await client.call('initialize', {});
      expect(order).toEqual(['flush']);
      order.length = 0;
      const evaluated = (id: string): void =>
        worker.onEvaluated?.({
          documentId: 'd1',
          intent: 0,
          id,
          success: true,
          transient: false,
          views: [],
          exports: [],
          issues: [],
        });

      // Settled before its reply: the flush waits for the evaluated notify.
      worker.onOperationSettled?.({ operation: 'evaluate', operationId: 'evaluate:d1:e1', outcome: 'succeeded' });
      expect(order).toEqual([]);
      evaluated('e1');
      expect(order).toEqual(['flush']);

      // Replied before it settled: the flush waits for the settlement.
      evaluated('e2');
      expect(order).toEqual(['flush']);
      worker.onOperationSettled?.({ operation: 'evaluate', operationId: 'evaluate:d1:e2', outcome: 'succeeded' });
      expect(order).toEqual(['flush', 'flush']);

      // Abandoned: no reply will come, so the spans leave at settlement.
      worker.onOperationSettled?.({ operation: 'render', operationId: 'render:v1:e3:r1', outcome: 'cancelled' });
      expect(order).toEqual(['flush', 'flush', 'flush']);
      order.length = 0;

      // A call flushes after the channel posts its result.
      await client.call('describe', { file: { path: '/', filename: 'main.ts' } });
      expect(order).toEqual(['describe-settled', 'flush']);
    } finally {
      client.close();
      server.dispose();
    }
  });

  it('should run the after-reply step once per operation when its terminal notify is duplicated', async () => {
    const ports = new MessageChannel();
    const flushed: Array<string | undefined> = [];
    const worker = {
      setTelemetrySend: vi.fn(),
      setObservation: vi.fn(),
      setDevtoolsTelemetryEnabled: vi.fn(),
      setCompiledWasmModules: vi.fn(),
      afterTerminalReply: vi.fn((operationId?: string) => flushed.push(operationId)),
      capabilitiesManifest: { registrations: [], routes: [], renderCapabilities: {} },
      initialize: vi.fn(async () => undefined),
      permitComputePublication: vi.fn(),
    } as unknown as KernelWorker;
    const server = createDocumentWorkerDispatcher(worker, wrapMessagePort(ports.port1));
    const client = createChannelClient<RuntimeDocumentProtocol>({
      port: wrapMessagePort(ports.port2),
      sessionKey: 'tau.runtime/v1',
      protocolSchemas: runtimeDocumentProtocolSchemas,
    });
    try {
      await client.ready;
      const evaluated = (id: string): void =>
        worker.onEvaluated?.({
          documentId: 'd1',
          intent: 0,
          id,
          success: true,
          transient: false,
          views: [],
          exports: [],
          issues: [],
        });
      const failedRender = (requestId: string): void =>
        worker.onRendered?.({
          subscriptionId: 'v1',
          intent: 0,
          evaluationId: 'e3',
          requestId,
          success: false,
          transient: false,
          issues: [],
        } as unknown as Parameters<NonNullable<KernelWorker['onRendered']>>[0]);

      // Duplicated after the settlement: the first notify runs the step, the copy finds nothing waiting.
      worker.onOperationSettled?.({ operation: 'evaluate', operationId: 'evaluate:d1:e1', outcome: 'succeeded' });
      evaluated('e1');
      evaluated('e1');
      // Duplicated before the settlement: both copies wait for the one settlement.
      evaluated('e2');
      evaluated('e2');
      worker.onOperationSettled?.({ operation: 'evaluate', operationId: 'evaluate:d1:e2', outcome: 'succeeded' });
      // A failed render's notify, duplicated around its settlement.
      failedRender('r1');
      worker.onOperationSettled?.({ operation: 'render', operationId: 'render:v1:e3:r1', outcome: 'issue' });
      failedRender('r1');

      expect(flushed).toEqual(['evaluate:d1:e1', 'evaluate:d1:e2', 'render:v1:e3:r1']);
    } finally {
      client.close();
      server.dispose();
    }
  });

  it('rejects duplicate initialization and acknowledges pooled bytes through the host owner', async () => {
    const ports = new MessageChannel();
    const initialize = vi.fn(async () => undefined);
    const acknowledgeBinary = vi.fn();
    const worker = {
      setTelemetrySend: vi.fn(),
      setObservation: vi.fn(),
      setDevtoolsTelemetryEnabled: vi.fn(),
      setCompiledWasmModules: vi.fn(),
      initialize,
      capabilitiesManifest: { registrations: [], routes: [], renderCapabilities: {} },
      permitComputePublication: vi.fn(),
    } as unknown as KernelWorker;
    const server = createDocumentWorkerDispatcher(worker, wrapMessagePort(ports.port1), { acknowledgeBinary });
    const client = createChannelClient<RuntimeDocumentProtocol>({
      port: wrapMessagePort(ports.port2),
      sessionKey: 'tau.runtime/v1',
      protocolSchemas: runtimeDocumentProtocolSchemas,
    });
    try {
      await client.ready;
      await client.call('initialize', {});
      await expect(client.call('initialize', {})).rejects.toMatchObject({ code: 'RUNTIME_ALREADY_INITIALIZED' });
      expect(initialize).toHaveBeenCalledOnce();
      client.notify('binaryMaterialised', { key: 'pool-entry-1' });
      await vi.waitFor(() => {
        expect(acknowledgeBinary).toHaveBeenCalledExactlyOnceWith('pool-entry-1');
      });
    } finally {
      client.close();
      server.dispose();
    }
  });

  it.each([
    { memoryHandle: { computeBindingMode: 'memory', computeMemoryConstrained: true }, mode: 'memory' },
    { memoryHandle: { computeBindingMode: 'durable', computeMemoryConstrained: true }, mode: 'memory' },
    { memoryHandle: { computeBindingMode: 'memory' }, mode: 'memory', unconstrained: true },
  ] as const)('binds a $mode compute facet sized by the device memory class', async (input) => {
    const ports = new MessageChannel();
    const setComputeBinding = vi.fn();
    const worker = {
      setTelemetrySend: vi.fn(),
      setObservation: vi.fn(),
      setDevtoolsTelemetryEnabled: vi.fn(),
      setCompiledWasmModules: vi.fn(),
      setComputeBinding,
      initialize: vi.fn(async () => undefined),
      capabilitiesManifest: { registrations: [], routes: [], renderCapabilities: {} },
      permitComputePublication: vi.fn(),
    } as unknown as KernelWorker;
    const server = createDocumentWorkerDispatcher(worker, wrapMessagePort(ports.port1));
    const client = createChannelClient<RuntimeDocumentProtocol>({
      port: wrapMessagePort(ports.port2),
      sessionKey: 'tau.runtime/v1',
      protocolSchemas: runtimeDocumentProtocolSchemas,
    });
    try {
      await client.ready;
      await client.call('initialize', { memoryHandle: input.memoryHandle });
      expect(setComputeBinding).toHaveBeenCalledExactlyOnceWith(
        'unconstrained' in input ? { mode: input.mode } : { mode: input.mode, memoryConstrained: true },
      );
    } finally {
      client.close();
      server.dispose();
    }
  });

  it('copies direct transcoder output into wire-owned binary and forwards the request signal', async () => {
    const ports = new MessageChannel();
    const source = new Uint8Array([7, 8]);
    const transcode = vi.fn(async () => ({
      success: true,
      data: [{ name: 'part.step', mimeType: 'application/step', bytes: source }],
      issues: [],
    }));
    const worker = {
      setTelemetrySend: vi.fn(),
      setObservation: vi.fn(),
      transcode,
      permitComputePublication: vi.fn(),
    } as unknown as KernelWorker;
    const server = createDocumentWorkerDispatcher(worker, wrapMessagePort(ports.port1));
    const client = createChannelClient<RuntimeDocumentProtocol>({
      port: wrapMessagePort(ports.port2),
      sessionKey: 'tau.runtime/v1',
      protocolSchemas: runtimeDocumentProtocolSchemas,
    });
    try {
      await client.ready;
      const result = await client.call('transcode', {
        from: 'stl',
        to: 'step',
        files: [{ name: 'part.stl', mimeType: 'model/stl', bytes: new Uint8Array([1]) }],
        options: {},
      });
      expect(result).toMatchObject({
        success: true,
        data: [{ name: 'part.step', bytes: { delivery: 'inline', bytes: new Uint8Array([7, 8]) } }],
      });
      expect(transcode).toHaveBeenCalledWith(
        expect.objectContaining({ from: 'stl', to: 'step' }),
        expect.any(AbortSignal),
      );
      expect(source).toEqual(new Uint8Array([7, 8]));
    } finally {
      client.close();
      server.dispose();
    }
  });
});
