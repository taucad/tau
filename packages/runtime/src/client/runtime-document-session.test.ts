import { describe, expect, it, vi } from 'vitest';
import { createChannelClient, createChannelServer, wrapMessagePort } from '@taucad/rpc';
import { SharedPool } from '@taucad/memory';
import type { ChannelContext } from '@taucad/rpc';
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
  it('signals exact native render and export tokens on view supersession and document close', async () => {
    const ports = new MessageChannel();
    const exportCalled = Promise.withResolvers<string>();
    const viewOpened = Promise.withResolvers<{ subscriptionId: string; requestId: string }>();
    const server = createChannelServer<RuntimeDocumentProtocol>({
      port: wrapMessagePort(ports.port1, { label: 'native-abort-server' }),
      sessionKey: 'native-abort-test',
      hello: { server: 'kernel-runtime-worker', runtimeVersion: 'test', protocolVersion },
      protocolSchemas: runtimeDocumentProtocolSchemas,
      impl: {
        async call(_context, name, args) {
          if (name === 'export' && args && typeof args === 'object' && 'operationId' in args) {
            exportCalled.resolve(String(args.operationId));
          }
          return new Promise<never>(() => {
            /* Work remains active until local close. */
          });
        },
        notify(_context, name, args) {
          if (
            name === 'openView' &&
            args &&
            typeof args === 'object' &&
            'subscriptionId' in args &&
            'requestId' in args
          ) {
            viewOpened.resolve({ subscriptionId: String(args.subscriptionId), requestId: String(args.requestId) });
          }
        },
        listen() {
          throw new Error('No streams.');
        },
      },
    });
    const channel = createChannelClient<RuntimeDocumentProtocol>({
      port: wrapMessagePort(ports.port2, { label: 'native-abort-client' }),
      sessionKey: 'native-abort-test',
      protocolSchemas: runtimeDocumentProtocolSchemas,
    });
    await channel.ready;
    const signalAbort = vi.fn(() => true);
    const sessions = new RuntimeDocumentSessionClient(
      channel,
      async (content) => materialiseBinaryContent(content, undefined),
      { signalAbort },
    );
    const document = sessions.open({
      documentId: 'doc',
      file: { path: '/', filename: 'main.ts' },
      parameters: {},
      watch: false,
    });
    try {
      server.notify('evaluating', { documentId: 'doc', intent: 0, evaluationId: '1', transient: false });
      server.notify('evaluated', {
        documentId: 'doc',
        intent: 0,
        id: '1',
        success: true,
        transient: false,
        views: [],
        exports: [],
        issues: [],
      });
      await document.evaluation();
      const view = document.view();
      const { subscriptionId, requestId: firstRequestId } = await viewOpened.promise;
      server.notify('rendering', { subscriptionId, requestId: firstRequestId, evaluationId: '1', intent: 0 });
      server.notify('progress', {
        documentId: 'doc',
        intent: 0,
        evaluationId: '1',
        operationId: `render:${subscriptionId}:1:${firstRequestId}`,
        requestId: firstRequestId,
        phase: 'render',
        detail: { abortSequence: 5, abortGeneration: 7 },
      });
      await nextTurn();
      const updated = view.update({});
      expect(signalAbort).toHaveBeenCalledWith('5', 7, 1);
      const exported = document.export('bom');
      const exportOperationId = await exportCalled.promise;
      server.notify('progress', {
        documentId: 'doc',
        intent: 0,
        evaluationId: '1',
        operationId: exportOperationId,
        phase: 'export',
        detail: { abortSequence: 6, abortGeneration: 8 },
      });
      await nextTurn();
      document.close();
      expect(signalAbort).toHaveBeenCalledWith('6', 8, 1);
      await expect(updated).resolves.toEqual({ superseded: true });
      await expect(exported).rejects.toMatchObject({ name: 'OperationAbortedError' });
    } finally {
      document.close();
      sessions.close();
      channel.close();
      server.dispose();
    }
  });

  it('times out during pooled export materialisation and acknowledges every delivered file', async () => {
    const ports = new MessageChannel();
    const firstBinary = Promise.withResolvers<Uint8Array<ArrayBuffer>>();
    const resolving = Promise.withResolvers<void>();
    const resolvedKeys: string[] = [];
    function call<Name extends keyof RuntimeDocumentProtocol['calls'] & string>(
      _context: ChannelContext,
      name: Name,
    ): Promise<RuntimeDocumentProtocol['calls'][Name]['result']>;
    async function call(_context: ChannelContext, name: string): Promise<unknown> {
      if (name === 'export') {
        return {
          success: true,
          exportId: 'bom',
          evaluationId: 'e1',
          files: [
            { name: 'a.txt', mimeType: 'text/plain', bytes: { delivery: 'pooled', key: 'a' } },
            { name: 'b.txt', mimeType: 'text/plain', bytes: { delivery: 'pooled', key: 'b' } },
          ],
          issues: [],
        };
      }
      throw new Error(`Unexpected call: ${name}`);
    }
    const server = createChannelServer<RuntimeDocumentProtocol>({
      port: wrapMessagePort(ports.port1, { label: 'export-timeout-server' }),
      sessionKey: 'export-timeout-test',
      hello: { server: 'kernel-runtime-worker', runtimeVersion: 'test', protocolVersion },
      protocolSchemas: runtimeDocumentProtocolSchemas,
      impl: {
        call,
        notify() {
          /* Export timeout only needs the RPC result. */
        },
        listen() {
          throw new Error('No streams.');
        },
      },
    });
    const channel = createChannelClient<RuntimeDocumentProtocol>({
      port: wrapMessagePort(ports.port2, { label: 'export-timeout-client' }),
      sessionKey: 'export-timeout-test',
      protocolSchemas: runtimeDocumentProtocolSchemas,
    });
    await channel.ready;
    const onTimeout = vi.fn();
    const sessions = new RuntimeDocumentSessionClient(
      channel,
      async (content) => {
        if (content.delivery !== 'pooled') {
          return materialiseBinaryContent(content, undefined);
        }
        resolvedKeys.push(content.key);
        if (content.key === 'a') {
          resolving.resolve();
          return firstBinary.promise;
        }
        return new TextEncoder().encode('b');
      },
      { operationTimeout: () => 20, onTimeout },
    );
    const document = sessions.open({
      documentId: 'doc',
      file: { path: '/', filename: 'main.ts' },
      parameters: {},
      watch: false,
    });
    try {
      server.notify('evaluating', { documentId: 'doc', intent: 0, evaluationId: 'e1', transient: false });
      server.notify('evaluated', {
        documentId: 'doc',
        intent: 0,
        id: 'e1',
        success: true,
        transient: false,
        views: [],
        exports: [],
        issues: [],
      });
      await document.evaluation();
      const exported = document.export('bom');
      await resolving.promise;
      await expect(exported).rejects.toMatchObject({ name: 'OperationTimeoutError' });
      firstBinary.resolve(new TextEncoder().encode('a'));
      await vi.waitFor(() => {
        expect(resolvedKeys).toEqual(['a', 'b']);
      });
      expect(onTimeout).not.toHaveBeenCalled();
    } finally {
      firstBinary.resolve(new TextEncoder().encode('a'));
      document.close();
      sessions.close();
      channel.close();
      server.dispose();
    }
  });

  it('acknowledges a pooled view frame after its materialisation deadline', async () => {
    const ports = new MessageChannel();
    const opened = Promise.withResolvers<{ subscriptionId: string; requestId: string }>();
    const resolving = Promise.withResolvers<void>();
    const release = Promise.withResolvers<void>();
    const pool = new SharedPool(new SharedArrayBuffer(4096), { maxEntries: 1 });
    expect(pool.publish('timed-frame', new Uint8Array([7]))).toBe(true);
    const server = createChannelServer<RuntimeDocumentProtocol>({
      port: wrapMessagePort(ports.port1, { label: 'view-materialisation-server' }),
      sessionKey: 'view-materialisation-test',
      hello: { server: 'kernel-runtime-worker', runtimeVersion: 'test', protocolVersion },
      protocolSchemas: runtimeDocumentProtocolSchemas,
      impl: {
        async call() {
          throw new Error('No calls.');
        },
        notify(_context, name, args) {
          if (
            name === 'openView' &&
            args &&
            typeof args === 'object' &&
            'subscriptionId' in args &&
            'requestId' in args
          ) {
            opened.resolve({ subscriptionId: String(args.subscriptionId), requestId: String(args.requestId) });
          }
        },
        listen() {
          throw new Error('No streams.');
        },
      },
    });
    const channel = createChannelClient<RuntimeDocumentProtocol>({
      port: wrapMessagePort(ports.port2, { label: 'view-materialisation-client' }),
      sessionKey: 'view-materialisation-test',
      protocolSchemas: runtimeDocumentProtocolSchemas,
    });
    await channel.ready;
    const sessions = new RuntimeDocumentSessionClient(
      channel,
      async (content) => {
        resolving.resolve();
        await release.promise;
        return materialiseBinaryContent(content, pool, (key) => {
          pool.acknowledge(key);
        });
      },
      { operationTimeout: () => 20 },
    );
    const document = sessions.open({
      documentId: 'doc',
      file: { path: '/', filename: 'main.ts' },
      parameters: {},
      watch: false,
    });
    try {
      server.notify('evaluating', { documentId: 'doc', intent: 0, evaluationId: 'e1', transient: false });
      server.notify('evaluated', {
        documentId: 'doc',
        intent: 0,
        id: 'e1',
        success: true,
        transient: false,
        views: [],
        exports: [],
        issues: [],
      });
      await document.evaluation();
      const view = document.view('board');
      const { subscriptionId, requestId } = await opened.promise;
      const rendered = view.rendering();
      server.notify('rendering', { subscriptionId, requestId, evaluationId: 'e1', intent: 0 });
      server.notify('rendered', {
        subscriptionId,
        requestId,
        intent: 0,
        evaluationId: 'e1',
        transient: false,
        success: true,
        view: 'board',
        hash: 'late',
        issues: [],
        artifact: { mimeType: 'application/octet-stream', content: { delivery: 'pooled', key: 'timed-frame' } },
      });
      await resolving.promise;
      await expect(rendered).rejects.toMatchObject({ name: 'OperationTimeoutError' });
      release.resolve();
      await vi.waitFor(() => {
        expect(pool.has('timed-frame')).toBe(false);
      });
      await expect(view.rendering()).rejects.toMatchObject({ name: 'OperationTimeoutError' });
    } finally {
      release.resolve();
      document.close();
      sessions.close();
      channel.close();
      server.dispose();
    }
  });

  it('signals only the current unpinned evaluation generation on update', async () => {
    const ports = new MessageChannel();
    const server = createChannelServer<RuntimeDocumentProtocol>({
      port: wrapMessagePort(ports.port1, { label: 'generation-server' }),
      sessionKey: 'generation-test',
      hello: { server: 'kernel-runtime-worker', runtimeVersion: 'test', protocolVersion },
      protocolSchemas: runtimeDocumentProtocolSchemas,
      impl: {
        async call() {
          return new Promise<never>(() => {
            /* Export remains admitted. */
          });
        },
        notify() {
          /* Admission is observed through the client-side signal callback. */
        },
        listen() {
          throw new Error('No streams.');
        },
      },
    });
    const channel = createChannelClient<RuntimeDocumentProtocol>({
      port: wrapMessagePort(ports.port2, { label: 'generation-client' }),
      sessionKey: 'generation-test',
      protocolSchemas: runtimeDocumentProtocolSchemas,
    });
    await channel.ready;
    const signalAbort = vi.fn(() => true);
    const sessions = new RuntimeDocumentSessionClient(
      channel,
      async (content) => materialiseBinaryContent(content, undefined),
      { signalAbort },
    );
    const open = (documentId: string) =>
      sessions.open({
        documentId,
        file: { path: '/', filename: 'main.ts' },
        parameters: {},
        watch: false,
      });
    const first = open('first');
    const second = open('second');
    const emitStart = (documentId: string, evaluationId: string, generation: number) => {
      server.notify('evaluating', { documentId, intent: 0, evaluationId, transient: false });
      server.notify('progress', {
        documentId,
        intent: 0,
        evaluationId,
        operationId: `evaluate:${documentId}:${evaluationId}`,
        phase: 'evaluate',
        detail: { abortGeneration: generation },
      });
    };
    emitStart('first', 'one', 7);
    await nextTurn();
    const pinnedExport = first.export('bom');
    const pinnedUpdate = first.update({ parameters: { value: 1 } });
    expect(signalAbort).not.toHaveBeenCalled();
    emitStart('second', 'two', 8);
    await nextTurn();
    const ordinaryUpdate = second.update({ parameters: { value: 2 } });
    expect(signalAbort).toHaveBeenCalledExactlyOnceWith('two', 8, 1);
    const beforeProgress = second.update({ parameters: { value: 3 } });
    expect(signalAbort).toHaveBeenCalledTimes(1);
    const early = open('early');
    server.notify('evaluating', { documentId: 'early', intent: 0, evaluationId: 'four', transient: false });
    await nextTurn();
    const earlyUpdate = early.update({ parameters: { value: 4 } });
    expect(signalAbort).toHaveBeenLastCalledWith('four', undefined, 1);
    const closing = open('closing');
    emitStart('closing', 'five', 9);
    await nextTurn();
    closing.close();
    expect(signalAbort).toHaveBeenLastCalledWith('five', 9, 1);
    first.close();
    second.close();
    early.close();
    await expect(pinnedExport).rejects.toMatchObject({ name: 'OperationAbortedError' });
    await expect(pinnedUpdate).resolves.toEqual({ superseded: true });
    await expect(ordinaryUpdate).resolves.toEqual({ superseded: true });
    await expect(beforeProgress).resolves.toEqual({ superseded: true });
    await expect(earlyUpdate).resolves.toEqual({ superseded: true });
    sessions.close();
    channel.close();
    server.dispose();
  });

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
    /* Port messages and timers are separate queues, so one `nextTurn` does not prove the
     * server has seen a notify; wait for the command sent after `from` instead. */
    const commandAfter = async <Name extends keyof RuntimeDocumentProtocol['notifies']>(
      name: Name,
      from: number,
    ): Promise<RuntimeDocumentProtocol['notifies'][Name]['args']> => {
      await vi.waitFor(() => {
        expect(commands.slice(from).some((command) => command.name === name)).toBe(true);
      });
      return commands.slice(from).find((command) => command.name === name)
        ?.args as RuntimeDocumentProtocol['notifies'][Name]['args'];
    };
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
    const staleBinary = Promise.withResolvers<void>();
    const timedOutBinary = Promise.withResolvers<void>();
    const pool = new SharedPool(new SharedArrayBuffer(4096), { maxEntries: 2 });
    expect(pool.publish('old-pool', new Uint8Array([1]))).toBe(true);
    expect(pool.publish('timeout-pool', new Uint8Array([2]))).toBe(true);
    const sessions = new RuntimeDocumentSessionClient(channel, async (content) => {
      if (content.delivery === 'pooled') {
        await (content.key === 'old-pool' ? staleBinary.promise : timedOutBinary.promise);
      }
      return materialiseBinaryContent(content, pool, (key) => {
        pool.acknowledge(key);
      });
    });
    const document = sessions.open({
      documentId: 'document-1',
      file: { path: '/', filename: 'main.ts' },
      parameters: {},
      watch: false,
    });
    await vi.waitFor(() => {
      expect(commands.some((command) => command.name === 'open')).toBe(true);
    });
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

    const staleOpenFrom = commands.length;
    const staleView = document.view('board');
    const staleOpen = await commandAfter('openView', staleOpenFrom);
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
    const newerRequestFrom = commands.length;
    const newerView = staleView.update({ options: { scale: 2 } });
    const newerRequest = await commandAfter('updateView', newerRequestFrom);
    staleBinary.resolve();
    await vi.waitFor(() => {
      expect(pool.has('old-pool')).toBe(false);
    });
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

    const openedViewFrom = commands.length;
    const view = document.view('board');
    const openedView = await commandAfter('openView', openedViewFrom);
    const rendered = view.rendering();
    server.notify('rendering', {
      subscriptionId: openedView.subscriptionId,
      requestId: openedView.requestId,
      evaluationId: 'e2',
      intent: 1,
    });
    server.notify('rendered', {
      subscriptionId: openedView.subscriptionId,
      intent: 1,
      requestId: openedView.requestId,
      evaluationId: 'e2',
      transient: true,
      success: true,
      view: 'board',
      hash: 'timed-out-frame',
      issues: [],
      artifact: { mimeType: 'application/octet-stream', content: { delivery: 'pooled', key: 'timeout-pool' } },
    });
    await nextTurn();
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
    timedOutBinary.resolve();
    await vi.waitFor(() => {
      expect(pool.has('timeout-pool')).toBe(false);
    });
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
