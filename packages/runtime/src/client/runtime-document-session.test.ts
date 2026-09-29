import { describe, expect, it } from 'vitest';
import { createChannelClient, createChannelServer, wrapMessagePort } from '@taucad/rpc';
import { materialiseBinaryContent } from '#transport/_internal/export-materialiser.js';
import { RuntimeDocumentSessionClient } from '#client/runtime-document-session.js';
import { openDeferredDocument } from '#client/runtime-document-deferred.js';
import { runtimeDocumentProtocolSchemas } from '#types/runtime-document-protocol.schemas.js';
import type { RuntimeDocumentProtocol } from '#types/runtime-document-protocol.types.js';
import { protocolVersion } from '#types/protocol-header.types.js';

const nextTurn = async (): Promise<void> => {
  await new Promise<void>((resolve) => {
    setTimeout(resolve, 0);
  });
};

describe('document channel session', () => {
  it('keeps the dispatched deadline when admission arrives after the timeout setting changes', async () => {
    const ports = new MessageChannel();
    const server = createChannelServer<RuntimeDocumentProtocol>({
      port: wrapMessagePort(ports.port1, { label: 'budget-server' }),
      sessionKey: 'budget-test',
      hello: { server: 'kernel-runtime-worker', runtimeVersion: 'test', protocolVersion },
      protocolSchemas: runtimeDocumentProtocolSchemas,
      impl: {
        async call() {
          return new Promise<never>(() => {
            /* Intentionally pending. */
          });
        },
        notify() {
          /* No document command is handled by this deadline fixture. */
        },
        listen() {
          throw new Error('No streams.');
        },
      },
    });
    const channel = createChannelClient<RuntimeDocumentProtocol>({
      port: wrapMessagePort(ports.port2, { label: 'budget-client' }),
      sessionKey: 'budget-test',
      protocolSchemas: runtimeDocumentProtocolSchemas,
    });
    await channel.ready;
    let evaluationTimeout = 25;
    const sessions = new RuntimeDocumentSessionClient(
      channel,
      async (content) => materialiseBinaryContent(content, undefined),
      { operationTimeout: () => evaluationTimeout },
    );
    const document = sessions.open({
      documentId: 'budget',
      file: { path: '/', filename: 'main.ts' },
      parameters: {},
      watch: false,
    });
    const read = document.evaluation();
    evaluationTimeout = 250;
    server.notify('evaluating', { documentId: 'budget', intent: 0, evaluationId: 'late-admission', transient: false });
    const result = await Promise.race([
      read.then(
        () => 'resolved',
        (error: unknown) => (error instanceof Error ? error.name : 'unknown'),
      ),
      new Promise<string>((resolve) => {
        setTimeout(() => {
          resolve('deadline-reset');
        }, 75);
      }),
    ]);
    expect(result).toBe('OperationTimeoutError');
    document.close();
    sessions.close();
    channel.close();
    server.dispose();
  });

  it('times out one evaluation by unique ID and ignores its late result before a watched successor', async () => {
    const ports = new MessageChannel();
    const commands: Array<{ name: string; args: unknown }> = [];
    const server = createChannelServer<RuntimeDocumentProtocol>({
      port: wrapMessagePort(ports.port1, { label: 'deadline-server' }),
      sessionKey: 'deadline-test',
      hello: { server: 'kernel-runtime-worker', runtimeVersion: 'test', protocolVersion },
      protocolSchemas: runtimeDocumentProtocolSchemas,
      impl: {
        async call() {
          return new Promise<never>(() => {
            /* Intentionally pending. */
          });
        },
        notify(_context, name, args) {
          commands.push({ name, args });
        },
        listen() {
          throw new Error('No streams.');
        },
      },
    });
    const channel = createChannelClient<RuntimeDocumentProtocol>({
      port: wrapMessagePort(ports.port2, { label: 'deadline-client' }),
      sessionKey: 'deadline-test',
      protocolSchemas: runtimeDocumentProtocolSchemas,
    });
    await channel.ready;
    const sessions = new RuntimeDocumentSessionClient(
      channel,
      async (content) => materialiseBinaryContent(content, undefined),
      { operationTimeout: () => 20 },
    );
    const document = sessions.open({
      documentId: 'watched',
      file: { path: '/', filename: 'main.ts' },
      parameters: {},
      watch: true,
    });
    server.notify('evaluating', { documentId: document.id, intent: 0, evaluationId: 'e1', transient: false });
    await expect(document.evaluation()).rejects.toMatchObject({ name: 'OperationTimeoutError', phase: 'evaluate' });
    await nextTurn();
    expect(commands).toContainEqual({ name: 'abort', args: { operationId: 'evaluate:watched:e1', reason: 2 } });
    server.notify('evaluated', {
      documentId: document.id,
      intent: 0,
      id: 'e1',
      success: true,
      transient: false,
      views: [],
      exports: [],
      issues: [],
    });
    await nextTurn();
    await expect(document.evaluation()).rejects.toMatchObject({ name: 'OperationTimeoutError' });
    server.notify('evaluating', { documentId: document.id, intent: 0, evaluationId: 'e2', transient: false });
    server.notify('evaluated', {
      documentId: document.id,
      intent: 0,
      id: 'e2',
      success: true,
      transient: false,
      views: [],
      exports: [],
      issues: [],
    });
    await nextTurn();
    await expect(document.evaluation()).resolves.toMatchObject({ superseded: false, evaluation: { id: 'e2' } });
    document.close();
    sessions.close();
    channel.close();
    server.dispose();
  });

  it('settles local work while a lazy transport never connects', async () => {
    const never = new Promise<RuntimeDocumentSessionClient>(() => {
      /* Intentionally pending. */
    });
    const document = openDeferredDocument(
      { file: { path: '/', filename: 'main.ts' }, parameters: {}, watch: false },
      async () => never,
    );
    const controller = new AbortController();
    const abortedRead = document.evaluation({ signal: controller.signal });
    controller.abort();
    await expect(abortedRead).rejects.toMatchObject({ name: 'OperationAbortedError' });
    const update = document.update({ parameters: { count: 2 } });
    const read = document.evaluation();
    const exported = document.export('bom');
    const view = document.view('board');
    const viewRead = view.rendering();
    const viewUpdate = view.update({ options: { scale: 2 } });
    document.close();
    await expect(viewRead).rejects.toMatchObject({ name: 'OperationAbortedError' });
    await expect(viewUpdate).resolves.toEqual({ superseded: true });
    await expect(update).resolves.toEqual({ superseded: true });
    await expect(read).rejects.toMatchObject({ name: 'OperationAbortedError' });
    await expect(exported).rejects.toMatchObject({ name: 'OperationAbortedError' });
  });

  it('reports lazy connection failure to status observers and pending pulls', async () => {
    const failure = new Error('transport unavailable');
    const pending = Promise.withResolvers<RuntimeDocumentSessionClient>();
    const document = openDeferredDocument(
      { file: { path: '/', filename: 'main.ts' }, parameters: {}, watch: false },
      async () => pending.promise,
    );
    const statuses: string[] = [];
    document.on('status', (status) => {
      statuses.push(status);
    });
    const read = document.evaluation();
    pending.reject(failure);
    await expect(read).rejects.toBe(failure);
    await nextTurn();
    expect(statuses).toEqual(['error']);
    document.close();
  });

  it('keeps transient evaluation current and rejects only the matching view operation', async () => {
    const ports = new MessageChannel();
    const commands: Array<{ name: string; args: unknown }> = [];
    const server = createChannelServer<RuntimeDocumentProtocol>({
      port: wrapMessagePort(ports.port1, { label: 'document-server' }),
      sessionKey: 'document-session-test',
      hello: { server: 'kernel-runtime-worker', runtimeVersion: 'test', protocolVersion },
      protocolSchemas: runtimeDocumentProtocolSchemas,
      impl: {
        async call() {
          return new Promise<never>(() => {
            /* Intentionally pending. */
          });
        },
        notify(_context, name, args) {
          commands.push({ name, args });
        },
        listen() {
          throw new Error('No streams in this test.');
        },
      },
    });
    const channel = createChannelClient<RuntimeDocumentProtocol>({
      port: wrapMessagePort(ports.port2, { label: 'document-client' }),
      sessionKey: 'document-session-test',
      protocolSchemas: runtimeDocumentProtocolSchemas,
    });
    await channel.ready;
    const staleBinary = Promise.withResolvers<Uint8Array<ArrayBuffer>>();
    const sessions = new RuntimeDocumentSessionClient(channel, async (content) =>
      content.delivery === 'pooled' ? staleBinary.promise : materialiseBinaryContent(content, undefined),
    );
    const document = sessions.open({
      documentId: 'document-1',
      file: { path: '/', filename: 'main.ts' },
      parameters: {},
      watch: false,
    });
    await nextTurn();
    const opened = commands.find((command) => command.name === 'open')
      ?.args as RuntimeDocumentProtocol['notifies']['open']['args'];
    expect(opened.documentId).toBe(document.id);
    server.notify('evaluating', { documentId: document.id, intent: 0, evaluationId: 'e1', transient: false });
    server.notify('evaluated', {
      documentId: document.id,
      intent: 0,
      id: 'e1',
      success: true,
      transient: false,
      views: [],
      exports: [],
      issues: [],
    });
    expect(await document.evaluation()).toMatchObject({ superseded: false, evaluation: { id: 'e1' } });
    server.notify('described', {
      documentId: document.id,
      intent: 0,
      evaluationId: 'e1',
      success: false,
      kernelId: 'test',
      issues: [],
    });
    await nextTurn();
    const replayed: string[] = [];
    const unsubscribe = document.on('described', (value) => replayed.push(value.kernelId ?? 'none'));
    unsubscribe();
    await nextTurn();
    expect(replayed).toEqual([]);
    document.on('described', (value) => replayed.push(value.kernelId ?? 'none'));
    await nextTurn();
    expect(replayed).toEqual(['test']);

    await expect(
      document.update({ transient: true, stage: { 'main.ts': 'forbidden' } } as unknown as Parameters<
        typeof document.update
      >[0]),
    ).rejects.toThrow('cannot stage files');

    const updated = document.update({ transient: true, parameters: { count: 2 } });
    server.notify('evaluating', { documentId: document.id, intent: 1, evaluationId: 'e2', transient: true });
    server.notify('evaluated', {
      documentId: document.id,
      intent: 1,
      id: 'e2',
      success: true,
      transient: true,
      views: [],
      exports: [],
      issues: [],
    });
    expect(await updated).toMatchObject({ superseded: false, evaluation: { id: 'e2', transient: true } });
    expect(await document.evaluation()).toMatchObject({ superseded: false, evaluation: { id: 'e2', transient: true } });

    const staleView = document.view('board');
    await nextTurn();
    const staleOpen = commands.find((command) => command.name === 'openView')
      ?.args as RuntimeDocumentProtocol['notifies']['openView']['args'];
    server.notify('rendered', {
      subscriptionId: staleOpen.subscriptionId,
      intent: 1,
      requestId: staleOpen.requestId,
      evaluationId: 'e2',
      transient: true,
      success: true,
      view: 'board',
      hash: 'stale',
      issues: [],
      artifact: { mimeType: 'application/octet-stream', content: { delivery: 'pooled', key: 'old-pool' } },
    });
    await nextTurn();
    const newerView = staleView.update({ options: { scale: 2 } });
    await nextTurn();
    const newerRequest = commands.findLast((command) => command.name === 'updateView')
      ?.args as RuntimeDocumentProtocol['notifies']['updateView']['args'];
    staleBinary.reject(new Error('old bytes unavailable'));
    await nextTurn();
    server.notify('rendered', {
      subscriptionId: staleOpen.subscriptionId,
      intent: 1,
      requestId: newerRequest.requestId,
      evaluationId: 'e2',
      transient: true,
      success: true,
      view: 'board',
      hash: 'new',
      issues: [],
      artifact: { mimeType: 'image/svg+xml', content: '<svg></svg>' },
    });
    await expect(newerView).resolves.toMatchObject({ superseded: false, rendering: { hash: 'new' } });
    staleView.close();

    const view = document.view('board');
    await nextTurn();
    const openedView = commands.findLast((command) => command.name === 'openView')
      ?.args as RuntimeDocumentProtocol['notifies']['openView']['args'];
    const rendered = view.rendering();
    server.notify('rendering', {
      subscriptionId: openedView.subscriptionId,
      requestId: openedView.requestId,
      evaluationId: 'e2',
      intent: 1,
    });
    server.notify('errorEvent', {
      scope: 'operation',
      documentId: document.id,
      intent: 1,
      evaluationId: 'e2',
      operationId: `render:${openedView.subscriptionId}:e2:${openedView.requestId}`,
      subscriptionId: openedView.subscriptionId,
      requestId: openedView.requestId,
      code: 'OPERATION_TIMEOUT',
      phase: 'render',
      message: 'Timed out.',
    });
    await expect(rendered).rejects.toMatchObject({ name: 'OperationTimeoutError' });
    await expect(view.rendering()).rejects.toMatchObject({ name: 'OperationTimeoutError' });
    expect(await document.evaluation()).toMatchObject({ superseded: false, evaluation: { id: 'e2' } });
    const waitingView = view.rendering();
    view.close();
    await expect(waitingView).rejects.toMatchObject({ name: 'OperationTimeoutError' });
    server.notify('errorEvent', {
      scope: 'operation',
      documentId: document.id,
      intent: 1,
      evaluationId: 'e2',
      operationId: `evaluate:${document.id}:e2`,
      code: 'OPERATION_TIMEOUT',
      phase: 'evaluate',
      message: 'Evaluation timed out.',
    });
    await nextTurn();
    await expect(document.evaluation()).resolves.toMatchObject({ superseded: false, evaluation: { id: 'e2' } });
    const pendingUpdate = document.update({ parameters: { count: 3 } });
    const waitingEvaluation = document.evaluation();
    const pendingExport = document.export('bom');
    document.close();
    await expect(pendingUpdate).resolves.toEqual({ superseded: true });
    await expect(waitingEvaluation).rejects.toMatchObject({ name: 'OperationAbortedError' });
    await expect(pendingExport).rejects.toMatchObject({ name: 'OperationAbortedError' });
    sessions.close();
    channel.close();
    server.dispose();
  });
});
