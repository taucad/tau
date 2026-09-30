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
      setDevtoolsTelemetryEnabled: vi.fn(),
      setCompiledWasmModules: vi.fn(),
      flushTelemetry: vi.fn(),
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
    const exported = await client.call('export', { documentId: 'd1', operationId: 'op1', target: 'bom' });
    expect(exported).toMatchObject({
      success: true,
      exportId: 'bom',
      files: [{ bytes: { delivery: 'inline', bytes: new Uint8Array([1, 2]) } }],
    });
    expect(worker.flushTelemetry).toHaveBeenCalledTimes(3);
    client.close();
    server.dispose();
  });
});
