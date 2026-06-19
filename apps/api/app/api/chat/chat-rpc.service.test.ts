import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { mock } from 'vitest-mock-extended';
import type { Socket } from 'socket.io';
import { ChatRpcService, rpcExecutionTimeout, abortCleanupDelay } from '#api/chat/chat-rpc.service.js';
import { MetricsService } from '#telemetry/metrics.js';

const mockMetricsService = new MetricsService();

let requestIdCounter = 0;
const chatModuleMock = vi.hoisted(() => {
  const readFileResultSafeParse = vi.fn(() => ({ success: true, data: { content: 'hello' } }));

  return {
    readFileResultSafeParse,
    rpcSchemasRegistry: {
      // eslint-disable-next-line @typescript-eslint/naming-convention -- Tool name uses snake_case
      read_file: {
        inputSchema: { safeParse: vi.fn(() => ({ success: true, data: {} })) },
        resultSchema: { safeParse: readFileResultSafeParse },
      },
    },
  };
});

vi.mock('@taucad/utils/id', () => ({
  generatePrefixedId: vi.fn(() => `req_test_${String(++requestIdCounter)}`),
}));

vi.mock('@taucad/chat', () => ({
  rpcSchemasRegistry: chatModuleMock.rpcSchemasRegistry,
}));

const defaultUserId = 'user_owner';

function createMockSocket(id: string, connected = true): Socket {
  const emitWithAck = vi.fn();
  const timeoutFunction = vi.fn(() => ({ emitWithAck }));
  const socket = mock<Socket>({ id, connected, emit: vi.fn() });
  // oxlint-disable-next-line @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-assignment -- vitest mock for timeout().emitWithAck chain
  socket.timeout = timeoutFunction as any;
  Object.defineProperty(socket, '_emitWithAck', { value: emitWithAck });
  return socket;
}

function getEmitWithAck(socket: Socket): ReturnType<typeof vi.fn> {
  // oxlint-disable-next-line @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-return -- accessing private mock property
  return (socket as any)._emitWithAck;
}

function createDeferred<T>(): { promise: Promise<T>; resolve: (value: T) => void; reject: (reason?: unknown) => void } {
  let fulfill!: (value: T) => void;
  let fail!: (reason?: unknown) => void;
  const promise = new Promise<T>((resolve, reject) => {
    fulfill = resolve;
    fail = reject;
  });
  return { promise, resolve: fulfill, reject: fail };
}

describe('ChatRpcService', () => {
  let service: ChatRpcService;

  beforeEach(() => {
    vi.useFakeTimers();
    requestIdCounter = 0;
    service = new ChatRpcService(mockMetricsService);
  });

  afterEach(() => {
    service.onModuleDestroy();
    vi.useRealTimers();
  });

  // ---------------------------------------------------------------------------
  // sendRpcRequest
  // ---------------------------------------------------------------------------
  describe('sendRpcRequest', () => {
    it('should return NO_CONNECTION RPC error when no socket is registered', async () => {
      const result = await service.sendRpcRequest({
        chatId: 'chat_123',
        toolCallId: 'call_1',
        rpcName: 'read_file',
        args: { targetFile: 'test.txt' },
      });

      expect(result).toEqual({
        errorCode: 'NO_CONNECTION',
        // oxlint-disable-next-line @typescript-eslint/no-unsafe-assignment -- Vitest assertion
        message: expect.stringContaining('No WebSocket connection to the browser'),
        rpcName: 'read_file',
      });
    });

    it('should return NO_CONNECTION RPC error when socket is disconnected', async () => {
      service.registerConnection('chat_123', createMockSocket('s1', false), defaultUserId);

      const result = await service.sendRpcRequest({
        chatId: 'chat_123',
        toolCallId: 'call_1',
        rpcName: 'read_file',
        args: { targetFile: 'test.txt' },
      });

      expect(result).toEqual({
        errorCode: 'NO_CONNECTION',
        // oxlint-disable-next-line @typescript-eslint/no-unsafe-assignment -- Vitest assertion
        message: expect.stringContaining('No WebSocket connection to the browser'),
        rpcName: 'read_file',
      });
    });

    it('should include rpcName in error metadata', async () => {
      const result = await service.sendRpcRequest({
        chatId: 'chat_456',
        toolCallId: 'call_2',
        rpcName: 'read_file',
        args: { targetFile: 'another.txt' },
      });

      expect(result).toMatchObject({
        errorCode: 'NO_CONNECTION',
        rpcName: 'read_file',
      });
    });

    it('should call emitWithAck on connected socket', async () => {
      const socket = createMockSocket('s1');
      service.registerConnection('chat_1', socket, defaultUserId);

      const ack = getEmitWithAck(socket);
      ack.mockResolvedValueOnce({
        type: 'rpc_response',
        rpcName: 'read_file',
        requestId: 'req_test_1',
        toolCallId: 'call_1',
        result: { content: 'hello' },
      });

      await service.sendRpcRequest({
        chatId: 'chat_1',
        toolCallId: 'call_1',
        rpcName: 'read_file',
        args: { targetFile: 'a.txt' },
      });

      expect(socket.timeout).toHaveBeenCalledWith(rpcExecutionTimeout);
      expect(ack).toHaveBeenCalledWith(
        'rpc_request',
        expect.objectContaining({ rpcName: 'read_file', chatId: 'chat_1' }),
      );
    });
  });

  // ---------------------------------------------------------------------------
  // RPC timeout
  // ---------------------------------------------------------------------------
  describe('RPC timeout', () => {
    it('should resolve with TIMEOUT error when emitWithAck rejects (socket still connected)', async () => {
      const socket = createMockSocket('s1');
      service.registerConnection('chat_1', socket, defaultUserId);

      const ack = getEmitWithAck(socket);
      ack.mockRejectedValueOnce(new Error('operation has timed out'));

      const result = await service.sendRpcRequest({
        chatId: 'chat_1',
        toolCallId: 'call_1',
        rpcName: 'read_file',
        args: { targetFile: 'a.txt' },
      });

      expect(result).toMatchObject({
        errorCode: 'TIMEOUT',
        rpcName: 'read_file',
      });
    });

    it('should resolve with CLIENT_DISCONNECTED when emitWithAck rejects and socket is disconnected', async () => {
      const socket = createMockSocket('s1');
      service.registerConnection('chat_1', socket, defaultUserId);

      const ack = getEmitWithAck(socket);
      ack.mockImplementationOnce(async () => {
        Object.defineProperty(socket, 'connected', { value: false, configurable: true });
        throw new Error('socket disconnected');
      });

      const result = await service.sendRpcRequest({
        chatId: 'chat_1',
        toolCallId: 'call_1',
        rpcName: 'read_file',
        args: { targetFile: 'a.txt' },
      });

      expect(result).toMatchObject({
        errorCode: 'CLIENT_DISCONNECTED',
        rpcName: 'read_file',
      });
    });

    it('should resolve with validated result when emitWithAck succeeds', async () => {
      const socket = createMockSocket('s1');
      service.registerConnection('chat_1', socket, defaultUserId);

      const ack = getEmitWithAck(socket);
      ack.mockResolvedValueOnce({
        type: 'rpc_response',
        rpcName: 'read_file',
        requestId: 'req_test_1',
        toolCallId: 'call_1',
        result: { content: 'hello' },
      });

      const result = await service.sendRpcRequest({
        chatId: 'chat_1',
        toolCallId: 'call_1',
        rpcName: 'read_file',
        args: { targetFile: 'a.txt' },
      });

      expect(result).toEqual({ content: 'hello' });
    });

    it('should return OUTPUT_VALIDATION_FAILED with raw output when client result is malformed', async () => {
      chatModuleMock.readFileResultSafeParse.mockReturnValueOnce({
        success: false,
        error: { issues: [{ path: ['content'], message: 'Required' }] },
      });
      const socket = createMockSocket('s1');
      service.registerConnection('chat_1', socket, defaultUserId);
      const rawOutput = { wrong: 'shape' };

      const ack = getEmitWithAck(socket);
      ack.mockResolvedValueOnce({
        type: 'rpc_response',
        rpcName: 'read_file',
        requestId: 'req_test_1',
        toolCallId: 'call_1',
        result: rawOutput,
      });

      const result = await service.sendRpcRequest({
        chatId: 'chat_1',
        toolCallId: 'call_1',
        rpcName: 'read_file',
        args: { targetFile: 'a.txt' },
      });

      expect(result).toMatchObject({
        errorCode: 'OUTPUT_VALIDATION_FAILED',
        rpcName: 'read_file',
        validationErrors: [{ path: 'content', message: 'Required' }],
        rawOutput,
      });
      expect(result.message).toContain('returned invalid result');
    });
  });

  // ---------------------------------------------------------------------------
  // registerConnection
  // ---------------------------------------------------------------------------
  describe('registerConnection', () => {
    it('should register a socket connection and return true', () => {
      const result = service.registerConnection('chat_123', createMockSocket('s1'), 'user_a');
      expect(result).toBe(true);
    });

    it('should allow same user to register from multiple sockets', () => {
      const s1 = createMockSocket('s1');
      const s2 = createMockSocket('s2');
      expect(service.registerConnection('chat_1', s1, 'user_a')).toBe(true);
      expect(service.registerConnection('chat_1', s2, 'user_a')).toBe(true);
    });

    it('should reject a different user from joining an owned chat', () => {
      const s1 = createMockSocket('s1');
      const s2 = createMockSocket('s2');
      expect(service.registerConnection('chat_1', s1, 'user_a')).toBe(true);
      expect(service.registerConnection('chat_1', s2, 'user_b')).toBe(false);
    });

    it('should clear ownership when last socket disconnects', () => {
      const s1 = createMockSocket('s1');
      service.registerConnection('chat_1', s1, 'user_a');
      service.handleSocketDisconnect(s1);

      const s2 = createMockSocket('s2');
      expect(service.registerConnection('chat_1', s2, 'user_b')).toBe(true);
    });

    it('should clear ownership when last socket unregisters', () => {
      const s1 = createMockSocket('s1');
      service.registerConnection('chat_1', s1, 'user_a');
      service.unregisterConnection('chat_1', s1);

      const s2 = createMockSocket('s2');
      expect(service.registerConnection('chat_1', s2, 'user_b')).toBe(true);
    });

    it('should not clear ownership when a non-last socket disconnects', () => {
      const s1 = createMockSocket('s1');
      const s2 = createMockSocket('s2');
      service.registerConnection('chat_1', s1, 'user_a');
      service.registerConnection('chat_1', s2, 'user_a');
      service.unregisterConnection('chat_1', s1);

      const s3 = createMockSocket('s3');
      expect(service.registerConnection('chat_1', s3, 'user_b')).toBe(false);
    });

    it('should clear ownership on onModuleDestroy', () => {
      const s1 = createMockSocket('s1');
      service.registerConnection('chat_1', s1, 'user_a');
      service.onModuleDestroy();

      const service2 = new ChatRpcService(mockMetricsService);
      const s2 = createMockSocket('s2');
      expect(service2.registerConnection('chat_1', s2, 'user_b')).toBe(true);
      service2.onModuleDestroy();
    });
  });

  // ---------------------------------------------------------------------------
  // isConnected
  // ---------------------------------------------------------------------------
  describe('isConnected', () => {
    it('should return false when no socket is registered', () => {
      expect(service.isConnected('chat_123')).toBe(false);
    });

    it('should return false when socket is disconnected', () => {
      service.registerConnection('chat_123', createMockSocket('s1', false), defaultUserId);
      expect(service.isConnected('chat_123')).toBe(false);
    });

    it('should return true when socket is connected', () => {
      service.registerConnection('chat_123', createMockSocket('s1'), defaultUserId);
      expect(service.isConnected('chat_123')).toBe(true);
    });
  });

  // ---------------------------------------------------------------------------
  // emitWithAck response handling
  // ---------------------------------------------------------------------------
  describe('emitWithAck response handling', () => {
    it('should resolve with UNHANDLED_CLIENT_ERROR when client reports error via ack', async () => {
      const socket = createMockSocket('s1');
      service.registerConnection('chat_1', socket, defaultUserId);

      const ack = getEmitWithAck(socket);
      ack.mockResolvedValueOnce({
        type: 'rpc_response',
        rpcName: 'read_file',
        requestId: 'req_test_1',
        toolCallId: 'call_1',
        result: undefined,
        error: 'Something went wrong on the client',
      });

      const result = await service.sendRpcRequest({
        chatId: 'chat_1',
        toolCallId: 'call_1',
        rpcName: 'read_file',
        args: { targetFile: 'a.txt' },
      });

      expect(result).toMatchObject({
        errorCode: 'UNHANDLED_CLIENT_ERROR',
        message: 'Something went wrong on the client',
        rpcName: 'read_file',
      });
    });

    it('should return OUTPUT_VALIDATION_FAILED when ack rpcName mismatches the request', async () => {
      const socket = createMockSocket('s1');
      service.registerConnection('chat_1', socket, defaultUserId);

      const ack = getEmitWithAck(socket);
      ack.mockResolvedValueOnce({
        type: 'rpc_response',
        rpcName: 'grep',
        requestId: 'req_test_1',
        toolCallId: 'call_1',
        result: { matches: [] },
      });

      const result = await service.sendRpcRequest({
        chatId: 'chat_1',
        toolCallId: 'call_1',
        rpcName: 'read_file',
        args: { targetFile: 'a.txt' },
      });

      expect(result).toMatchObject({
        errorCode: 'OUTPUT_VALIDATION_FAILED',
        rpcName: 'read_file',
      });
    });
  });

  // ---------------------------------------------------------------------------
  // registerAbortSignal
  // ---------------------------------------------------------------------------
  describe('registerAbortSignal', () => {
    it('should add chatId to abortedChats when signal is already aborted', async () => {
      const controller = new AbortController();
      controller.abort();

      service.registerAbortSignal('chat_123', controller.signal);

      const result = await service.sendRpcRequest({
        chatId: 'chat_123',
        toolCallId: 'call_1',
        rpcName: 'read_file',
        args: { targetFile: 'test.txt' },
      });

      expect(result).toMatchObject({
        errorCode: 'CLIENT_DISCONNECTED',
        rpcName: 'read_file',
      });
    });

    it('should clean up abortedChats entry after delay for early-aborted signal', async () => {
      const controller = new AbortController();
      controller.abort();

      service.registerAbortSignal('chat_123', controller.signal);

      const resultBeforeCleanup = await service.sendRpcRequest({
        chatId: 'chat_123',
        toolCallId: 'call_1',
        rpcName: 'read_file',
        args: { targetFile: 'test.txt' },
      });

      expect(resultBeforeCleanup).toMatchObject({
        errorCode: 'CLIENT_DISCONNECTED',
      });

      vi.advanceTimersByTime(abortCleanupDelay);

      const socket = createMockSocket('s1');
      service.registerConnection('chat_123', socket, defaultUserId);

      const ack = getEmitWithAck(socket);
      ack.mockResolvedValueOnce({
        type: 'rpc_response',
        rpcName: 'read_file',
        requestId: 'req_test_2',
        toolCallId: 'call_2',
        result: { content: 'hello' },
      });

      void service.sendRpcRequest({
        chatId: 'chat_123',
        toolCallId: 'call_2',
        rpcName: 'read_file',
        args: { targetFile: 'test.txt' },
      });

      expect(ack).toHaveBeenCalledWith('rpc_request', expect.objectContaining({ rpcName: 'read_file' }));
    });

    it('should clear stale abort entry when a new signal is registered for the same chat', async () => {
      const socket = createMockSocket('s1');
      service.registerConnection('chat_123', socket, defaultUserId);

      const controllerA = new AbortController();
      service.registerAbortSignal('chat_123', controllerA.signal);
      controllerA.abort();

      const blockedResult = await service.sendRpcRequest({
        chatId: 'chat_123',
        toolCallId: 'call_1',
        rpcName: 'read_file',
        args: { targetFile: 'test.txt' },
      });

      expect(blockedResult).toMatchObject({
        errorCode: 'CLIENT_DISCONNECTED',
      });

      const controllerB = new AbortController();
      service.registerAbortSignal('chat_123', controllerB.signal);

      const ack = getEmitWithAck(socket);
      ack.mockResolvedValueOnce({
        type: 'rpc_response',
        rpcName: 'read_file',
        requestId: 'req_test_2',
        toolCallId: 'call_2',
        result: { content: 'hello' },
      });

      void service.sendRpcRequest({
        chatId: 'chat_123',
        toolCallId: 'call_2',
        rpcName: 'read_file',
        args: { targetFile: 'test.txt' },
      });

      expect(ack).toHaveBeenCalledWith('rpc_request', expect.objectContaining({ rpcName: 'read_file' }));
    });

    it('should reject RPCs after abort and accept them after re-registration', async () => {
      const socket = createMockSocket('s1');
      service.registerConnection('chat_123', socket, defaultUserId);

      const controllerA = new AbortController();
      service.registerAbortSignal('chat_123', controllerA.signal);
      controllerA.abort();

      const blockedResult = await service.sendRpcRequest({
        chatId: 'chat_123',
        toolCallId: 'call_1',
        rpcName: 'read_file',
        args: { targetFile: 'test.txt' },
      });

      expect(blockedResult).toMatchObject({
        errorCode: 'CLIENT_DISCONNECTED',
      });

      const controllerB = new AbortController();
      service.registerAbortSignal('chat_123', controllerB.signal);

      const ack = getEmitWithAck(socket);
      ack.mockResolvedValueOnce({
        type: 'rpc_response',
        rpcName: 'read_file',
        requestId: 'req_test_2',
        toolCallId: 'call_2',
        result: { content: 'hello' },
      });

      void service.sendRpcRequest({
        chatId: 'chat_123',
        toolCallId: 'call_2',
        rpcName: 'read_file',
        args: { targetFile: 'test.txt' },
      });

      expect(ack).toHaveBeenCalledWith('rpc_request', expect.objectContaining({ rpcName: 'read_file' }));
    });

    it('should reject new RPCs after abort signal fires', async () => {
      const socket = createMockSocket('s1');
      service.registerConnection('chat_1', socket, defaultUserId);

      const controller = new AbortController();
      service.registerAbortSignal('chat_1', controller.signal);
      controller.abort();

      const result = await service.sendRpcRequest({
        chatId: 'chat_1',
        toolCallId: 'call_1',
        rpcName: 'read_file',
        args: { targetFile: 'a.txt' },
      });

      expect(result).toMatchObject({
        errorCode: 'CLIENT_DISCONNECTED',
        rpcName: 'read_file',
      });
    });

    it('should resolve in-flight RPCs immediately when abort signal fires', async () => {
      const socket = createMockSocket('s1');
      service.registerConnection('chat_1', socket, defaultUserId);

      const controller = new AbortController();
      service.registerAbortSignal('chat_1', controller.signal);

      const ack = getEmitWithAck(socket);
      const ackDeferred = createDeferred<unknown>();
      ack.mockReturnValueOnce(ackDeferred.promise);

      const resultPromise = service.sendRpcRequest({
        chatId: 'chat_1',
        toolCallId: 'call_1',
        rpcName: 'read_file',
        args: { targetFile: 'a.txt' },
      });

      expect(ack).toHaveBeenCalledWith('rpc_request', expect.objectContaining({ rpcName: 'read_file' }));

      controller.abort();

      await expect(resultPromise).resolves.toMatchObject({
        errorCode: 'CLIENT_DISCONNECTED',
        message: 'Chat request was cancelled.',
        rpcName: 'read_file',
      });

      ackDeferred.resolve({
        type: 'rpc_response',
        rpcName: 'read_file',
        requestId: 'req_test_1',
        toolCallId: 'call_1',
        result: { content: 'late success' },
      });
      await Promise.resolve();
    });

    it('should decrement active RPC metrics once when late ack arrives after abort', async () => {
      const activeCallsAdd = vi.fn();
      const localService = new ChatRpcService({
        rpcActiveCalls: { add: activeCallsAdd },
        rpcCallDuration: { record: vi.fn() },
        wsMessageSize: { record: vi.fn() },
      } as unknown as MetricsService);
      const socket = createMockSocket('s1');
      localService.registerConnection('chat_1', socket, defaultUserId);

      const controller = new AbortController();
      localService.registerAbortSignal('chat_1', controller.signal);

      const ack = getEmitWithAck(socket);
      const ackDeferred = createDeferred<unknown>();
      ack.mockReturnValueOnce(ackDeferred.promise);

      const resultPromise = localService.sendRpcRequest({
        chatId: 'chat_1',
        toolCallId: 'call_1',
        rpcName: 'read_file',
        args: { targetFile: 'a.txt' },
      });

      controller.abort();
      await expect(resultPromise).resolves.toMatchObject({ errorCode: 'CLIENT_DISCONNECTED' });

      const decrementCallsBeforeLateAck = activeCallsAdd.mock.calls.filter(([delta]) => delta === -1);
      expect(decrementCallsBeforeLateAck).toHaveLength(1);

      ackDeferred.resolve({
        type: 'rpc_response',
        rpcName: 'read_file',
        requestId: 'req_test_1',
        toolCallId: 'call_1',
        result: { content: 'late success' },
      });
      await Promise.resolve();

      const decrementCallsAfterLateAck = activeCallsAdd.mock.calls.filter(([delta]) => delta === -1);
      expect(decrementCallsAfterLateAck).toHaveLength(1);

      localService.onModuleDestroy();
    });

    it('should remove old abort listener when re-registering so it does not fire', async () => {
      const socket = createMockSocket('s1');
      service.registerConnection('chat_1', socket, defaultUserId);

      const controllerA = new AbortController();
      service.registerAbortSignal('chat_1', controllerA.signal);

      const controllerB = new AbortController();
      service.registerAbortSignal('chat_1', controllerB.signal);

      // Abort signal A — should NOT block RPCs since listener was detached
      controllerA.abort();

      const ack = getEmitWithAck(socket);
      ack.mockResolvedValueOnce({
        type: 'rpc_response',
        rpcName: 'read_file',
        requestId: 'req_test_1',
        toolCallId: 'call_1',
        result: { content: 'success' },
      });

      const result = await service.sendRpcRequest({
        chatId: 'chat_1',
        toolCallId: 'call_1',
        rpcName: 'read_file',
        args: { targetFile: 'a.txt' },
      });

      expect(result).toEqual({ content: 'hello' });
    });
  });

  // ---------------------------------------------------------------------------
  // Timer management (stale timer bug fix)
  // ---------------------------------------------------------------------------
  describe('timer management', () => {
    it('should cancel stale cleanup timer when a new signal is registered', async () => {
      const socket = createMockSocket('s1');
      service.registerConnection('chat_1', socket, defaultUserId);

      // Abort request A — schedules Timer A (5s)
      const controllerA = new AbortController();
      service.registerAbortSignal('chat_1', controllerA.signal);
      controllerA.abort();

      // Register request B within the 5s window — should cancel Timer A
      const controllerB = new AbortController();
      service.registerAbortSignal('chat_1', controllerB.signal);

      // Abort request B — schedules Timer B (5s)
      controllerB.abort();

      // Advance 3 seconds — Timer A would have been at t=5s, we're at t=3s
      // If Timer A was NOT cancelled, it would fire at t=5s and clear the entry
      vi.advanceTimersByTime(3000);

      // RPCs should still be blocked because Timer A was cancelled
      const result = await service.sendRpcRequest({
        chatId: 'chat_1',
        toolCallId: 'call_1',
        rpcName: 'read_file',
        args: { targetFile: 'a.txt' },
      });
      expect(result).toMatchObject({ errorCode: 'CLIENT_DISCONNECTED' });
    });

    it('should not prematurely clear abort entry when stale timer fires', async () => {
      const socket = createMockSocket('s1');
      service.registerConnection('chat_1', socket, defaultUserId);

      // Abort request A at t=0 → Timer A fires at t=5s
      const controllerA = new AbortController();
      service.registerAbortSignal('chat_1', controllerA.signal);
      controllerA.abort();

      // At t=2s, register request B
      vi.advanceTimersByTime(2000);
      const controllerB = new AbortController();
      service.registerAbortSignal('chat_1', controllerB.signal);

      // At t=3s, abort request B → Timer B fires at t=8s
      vi.advanceTimersByTime(1000);
      controllerB.abort();

      // At t=5s — if Timer A was not cancelled, it would fire here and delete
      // the abort entry prematurely. With the fix, Timer A was cancelled.
      vi.advanceTimersByTime(2000);

      // RPCs should still be blocked (Timer B hasn't fired yet at t=5s)
      const result = await service.sendRpcRequest({
        chatId: 'chat_1',
        toolCallId: 'call_1',
        rpcName: 'read_file',
        args: { targetFile: 'a.txt' },
      });
      expect(result).toMatchObject({ errorCode: 'CLIENT_DISCONNECTED' });

      // At t=8s — Timer B fires, abort entry is cleaned up
      vi.advanceTimersByTime(3000);

      const ack = getEmitWithAck(socket);
      ack.mockResolvedValueOnce({
        type: 'rpc_response',
        rpcName: 'read_file',
        requestId: 'req_test_2',
        toolCallId: 'call_2',
        result: { content: 'hello' },
      });

      void service.sendRpcRequest({
        chatId: 'chat_1',
        toolCallId: 'call_2',
        rpcName: 'read_file',
        args: { targetFile: 'a.txt' },
      });
      expect(ack).toHaveBeenCalledWith('rpc_request', expect.objectContaining({ rpcName: 'read_file' }));
    });

    it('should handle rapid abort-register-abort cycles without timer interference', async () => {
      const socket = createMockSocket('s1');
      service.registerConnection('chat_1', socket, defaultUserId);

      // Cycle 1: register + abort
      const c1 = new AbortController();
      service.registerAbortSignal('chat_1', c1.signal);
      c1.abort();

      // Cycle 2: register + abort (within 1s of cycle 1)
      vi.advanceTimersByTime(500);
      const c2 = new AbortController();
      service.registerAbortSignal('chat_1', c2.signal);
      c2.abort();

      // Cycle 3: register + abort (within 1s of cycle 2)
      vi.advanceTimersByTime(500);
      const c3 = new AbortController();
      service.registerAbortSignal('chat_1', c3.signal);
      c3.abort();

      // At this point, only Timer C3 should be active (fires at t=1s + 5s = t=6s from start)
      // Advance 4s from current position (t=1s) → t=5s total
      vi.advanceTimersByTime(4000);

      // Still blocked (Timer C3 hasn't fired yet)
      const result = await service.sendRpcRequest({
        chatId: 'chat_1',
        toolCallId: 'call_1',
        rpcName: 'read_file',
        args: { targetFile: 'a.txt' },
      });
      expect(result).toMatchObject({ errorCode: 'CLIENT_DISCONNECTED' });

      // Advance past Timer C3 (1 more second → t=6s total)
      vi.advanceTimersByTime(1000);

      const ack = getEmitWithAck(socket);
      ack.mockResolvedValueOnce({
        type: 'rpc_response',
        rpcName: 'read_file',
        requestId: 'req_test_2',
        toolCallId: 'call_2',
        result: { content: 'hello' },
      });

      void service.sendRpcRequest({
        chatId: 'chat_1',
        toolCallId: 'call_2',
        rpcName: 'read_file',
        args: { targetFile: 'a.txt' },
      });
      expect(ack).toHaveBeenCalledWith('rpc_request', expect.objectContaining({ rpcName: 'read_file' }));
    });

    it('should cancel previous cleanup timer when scheduling a new one for the same chatId', async () => {
      const socket = createMockSocket('s1');
      service.registerConnection('chat_1', socket, defaultUserId);

      const c1 = new AbortController();
      c1.abort();
      service.registerAbortSignal('chat_1', c1.signal);

      vi.advanceTimersByTime(2000);

      const c2 = new AbortController();
      c2.abort();
      service.registerAbortSignal('chat_1', c2.signal);

      // At t=5s — original Timer A would fire here if not properly cancelled,
      // prematurely clearing the abort entry. Timer B should still be active.
      vi.advanceTimersByTime(3000);

      const result = await service.sendRpcRequest({
        chatId: 'chat_1',
        toolCallId: 'call_1',
        rpcName: 'read_file',
        args: { targetFile: 'a.txt' },
      });
      expect(result).toMatchObject({ errorCode: 'CLIENT_DISCONNECTED' });

      // At t=7s — Timer B fires (5s after t=2s registration)
      vi.advanceTimersByTime(2000);

      const ack = getEmitWithAck(socket);
      ack.mockResolvedValueOnce({
        type: 'rpc_response',
        rpcName: 'read_file',
        requestId: 'req_test_2',
        toolCallId: 'call_2',
        result: { content: 'hello' },
      });

      void service.sendRpcRequest({
        chatId: 'chat_1',
        toolCallId: 'call_2',
        rpcName: 'read_file',
        args: { targetFile: 'a.txt' },
      });
      expect(ack).toHaveBeenCalledWith('rpc_request', expect.objectContaining({ rpcName: 'read_file' }));
    });
  });

  // ---------------------------------------------------------------------------
  // Disconnect handling
  // ---------------------------------------------------------------------------
  describe('disconnect handling', () => {
    it('should return NO_CONNECTION after last socket unregisters', async () => {
      const socket = createMockSocket('s1');
      service.registerConnection('chat_1', socket, defaultUserId);
      service.unregisterConnection('chat_1', socket);

      const result = await service.sendRpcRequest({
        chatId: 'chat_1',
        toolCallId: 'call_1',
        rpcName: 'read_file',
        args: { targetFile: 'a.txt' },
      });

      expect(result).toMatchObject({
        errorCode: 'NO_CONNECTION',
        rpcName: 'read_file',
      });
    });

    it('should not lose connection when a non-last socket disconnects', () => {
      const socket1 = createMockSocket('s1');
      const socket2 = createMockSocket('s2');
      service.registerConnection('chat_1', socket1, defaultUserId);
      service.registerConnection('chat_1', socket2, defaultUserId);

      service.unregisterConnection('chat_1', socket1);

      expect(service.isConnected('chat_1')).toBe(true);
    });

    it('should return NO_CONNECTION after handleSocketDisconnect removes last socket', async () => {
      const socket = createMockSocket('s1');
      service.registerConnection('chat_1', socket, defaultUserId);
      service.handleSocketDisconnect(socket);

      const result = await service.sendRpcRequest({
        chatId: 'chat_1',
        toolCallId: 'call_1',
        rpcName: 'read_file',
        args: { targetFile: 'a.txt' },
      });

      expect(result).toMatchObject({
        errorCode: 'NO_CONNECTION',
        rpcName: 'read_file',
      });
    });

    it('should not affect other chats when one chat socket disconnects', () => {
      const socket1 = createMockSocket('s1');
      const socket2 = createMockSocket('s2');
      service.registerConnection('chat_1', socket1, defaultUserId);
      service.registerConnection('chat_2', socket2, defaultUserId);

      service.handleSocketDisconnect(socket1);

      expect(service.isConnected('chat_1')).toBe(false);
      expect(service.isConnected('chat_2')).toBe(true);
    });

    it('should clean up socket from multiple chat rooms on disconnect', () => {
      const socket = createMockSocket('s1');
      service.registerConnection('chat_1', socket, defaultUserId);
      service.registerConnection('chat_2', socket, defaultUserId);

      service.handleSocketDisconnect(socket);

      expect(service.isConnected('chat_1')).toBe(false);
      expect(service.isConnected('chat_2')).toBe(false);
    });
  });

  // ---------------------------------------------------------------------------
  // onModuleDestroy
  // ---------------------------------------------------------------------------
  describe('onModuleDestroy', () => {
    it('should clear connections so subsequent RPCs get NO_CONNECTION', async () => {
      const socket = createMockSocket('s1');
      service.registerConnection('chat_1', socket, defaultUserId);

      service.onModuleDestroy();

      const result = await service.sendRpcRequest({
        chatId: 'chat_1',
        toolCallId: 'call_1',
        rpcName: 'read_file',
        args: { targetFile: 'a.txt' },
      });

      expect(result).toMatchObject({ errorCode: 'NO_CONNECTION' });
    });

    it('should clear all abort cleanup timers so none fire after destroy', async () => {
      const socket = createMockSocket('s1');
      service.registerConnection('chat_1', socket, defaultUserId);

      // Abort to schedule a 5s cleanup timer
      const controller = new AbortController();
      service.registerAbortSignal('chat_1', controller.signal);
      controller.abort();

      // Destroy the service (should cancel timers)
      service.onModuleDestroy();

      // Re-create the service and register a new connection
      const service2 = new ChatRpcService(mockMetricsService);
      const socket2 = createMockSocket('s2');
      service2.registerConnection('chat_1', socket2, defaultUserId);

      // Advance past the cleanup window — the old timer should NOT fire
      // (it would have called abortedChats.delete on the OLD service, but we
      // verify no errors occur)
      vi.advanceTimersByTime(abortCleanupDelay);

      const ack2 = getEmitWithAck(socket2);
      ack2.mockResolvedValueOnce({
        type: 'rpc_response',
        rpcName: 'read_file',
        requestId: 'req_test_1',
        toolCallId: 'call_1',
        result: { content: 'hello' },
      });

      void service2.sendRpcRequest({
        chatId: 'chat_1',
        toolCallId: 'call_1',
        rpcName: 'read_file',
        args: { targetFile: 'a.txt' },
      });
      expect(ack2).toHaveBeenCalledWith('rpc_request', expect.objectContaining({ rpcName: 'read_file' }));

      service2.onModuleDestroy();
    });

    it('should resolve pending RPCs as disconnected on destroy', async () => {
      const socket = createMockSocket('s1');
      service.registerConnection('chat_1', socket, defaultUserId);

      const ack = getEmitWithAck(socket);
      const ackDeferred = createDeferred<unknown>();
      ack.mockReturnValueOnce(ackDeferred.promise);

      const resultPromise = service.sendRpcRequest({
        chatId: 'chat_1',
        toolCallId: 'call_1',
        rpcName: 'read_file',
        args: { targetFile: 'a.txt' },
      });

      service.onModuleDestroy();

      await expect(resultPromise).resolves.toMatchObject({
        errorCode: 'CLIENT_DISCONNECTED',
        message: 'RPC service shut down before RPC execution completed.',
        rpcName: 'read_file',
      });

      ackDeferred.resolve({
        type: 'rpc_response',
        rpcName: 'read_file',
        requestId: 'req_test_1',
        toolCallId: 'call_1',
        result: { content: 'late success' },
      });
      await Promise.resolve();
    });

    it('should not crash when called with no pending state', () => {
      expect(() => {
        service.onModuleDestroy();
      }).not.toThrow();
    });

    it('should clean up active abort listeners on destroy', () => {
      const controller = new AbortController();
      const removeSpy = vi.spyOn(controller.signal, 'removeEventListener');

      service.registerAbortSignal('chat_1', controller.signal);
      service.onModuleDestroy();

      expect(removeSpy).toHaveBeenCalledWith('abort', expect.any(Function));
    });
  });
});
