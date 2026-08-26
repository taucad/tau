/* oxlint-disable @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-assignment -- dynamic import via await import() loses type safety */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { Socket, Manager } from 'socket.io-client';

type SocketEventHandler = (...args: unknown[]) => void;
type ManagerEventHandler = (...args: unknown[]) => void;

const socketHandlers = new Map<string, SocketEventHandler[]>();
const managerHandlers = new Map<string, ManagerEventHandler[]>();

const mockSocket = {
  connected: false,
  on: vi.fn((event: string, handler: SocketEventHandler) => {
    const handlers = socketHandlers.get(event) ?? [];
    handlers.push(handler);
    socketHandlers.set(event, handlers);
  }),
  emit: vi.fn(),
  disconnect: vi.fn(),
  connect: vi.fn(),
  io: {
    on: vi.fn((event: string, handler: ManagerEventHandler) => {
      const handlers = managerHandlers.get(event) ?? [];
      handlers.push(handler);
      managerHandlers.set(event, handlers);
    }),
  } as unknown as Manager,
} as unknown as Socket;

let capturedOptions: Record<string, unknown> | undefined;

vi.mock('socket.io-client', () => ({
  io: (_url: string, options: Record<string, unknown>) => {
    capturedOptions = options;
    return mockSocket;
  },
}));

vi.mock('#environment.config.js', () => {
  /* eslint-disable @typescript-eslint/naming-convention -- mock env object shape */
  const mock = {
    ENV: {
      TAU_WEBSOCKET_URL: 'http://localhost:3001',
    },
  };
  /* eslint-enable @typescript-eslint/naming-convention -- mock env object shape */
  return mock;
});

// eslint-disable-next-line @typescript-eslint/naming-convention -- destructures exported class
const { ChatRpcSocketService } = await import('#services/chat-rpc-socket.service.js');

function emitSocketEvent(event: string, ...args: unknown[]): void {
  const handlers = socketHandlers.get(event);
  if (handlers) {
    for (const handler of handlers) {
      handler(...args);
    }
  }
}

function emitManagerEvent(event: string, ...args: unknown[]): void {
  const handlers = managerHandlers.get(event);
  if (handlers) {
    for (const handler of handlers) {
      handler(...args);
    }
  }
}

describe('ChatRpcSocketService', () => {
  let service: ReturnType<typeof ChatRpcSocketService.getInstance>;

  beforeEach(() => {
    socketHandlers.clear();
    managerHandlers.clear();
    vi.clearAllMocks();
    mockSocket.emit = vi.fn() as unknown as Socket['emit'];
    mockSocket.connected = false;
    capturedOptions = undefined;

    // Reset singleton for each test
    // @ts-expect-error -- accessing private static for test isolation
    ChatRpcSocketService.instance = undefined;
    service = ChatRpcSocketService.getInstance();
  });

  afterEach(() => {
    service.disconnect();
  });

  describe('configuration', () => {
    it('should set reconnectionDelayMax to 5000ms', () => {
      service.connect();
      expect(capturedOptions?.['reconnectionDelayMax']).toBe(5000);
    });

    it('should use websocket transport only', () => {
      service.connect();
      expect(capturedOptions?.['transports']).toEqual(['websocket']);
    });

    it('should enable infinite reconnection attempts', () => {
      service.connect();
      expect(capturedOptions?.['reconnectionAttempts']).toBe(Infinity);
    });
  });

  describe('disconnect reason logging', () => {
    it('should log disconnect reason via console.warn', () => {
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(vi.fn());
      service.connect();

      emitSocketEvent('disconnect', 'transport close');

      expect(warnSpy).toHaveBeenCalledWith('[ChatRpcSocket] Disconnected (reason: transport close)');
      warnSpy.mockRestore();
    });

    it('should log ping timeout disconnect reason', () => {
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(vi.fn());
      service.connect();

      emitSocketEvent('disconnect', 'ping timeout');

      expect(warnSpy).toHaveBeenCalledWith('[ChatRpcSocket] Disconnected (reason: ping timeout)');
      warnSpy.mockRestore();
    });

    it('should set status to disconnected with mapped error message', () => {
      service.connect();
      const listener = vi.fn();
      service.subscribe(listener);

      emitSocketEvent('disconnect', 'transport close');

      expect(listener).toHaveBeenCalledWith('disconnected', 'Connection lost');
    });

    it('should not log when disconnect is due to auth failure', () => {
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(vi.fn());
      service.connect();

      // Simulate auth failure first
      emitSocketEvent('connect_error', new Error('UNAUTHENTICATED'));

      warnSpy.mockClear();

      // Disconnect after auth failure should be silent
      emitSocketEvent('disconnect', 'io client disconnect');

      expect(warnSpy).not.toHaveBeenCalledWith(expect.stringContaining('[ChatRpcSocket] Disconnected'));
      warnSpy.mockRestore();
    });
  });

  describe('join with retry', () => {
    it('should emit join with callback ack on connect', () => {
      service.connect();
      const handler = vi.fn();
      service.joinChat('chat_1', handler);

      mockSocket.connected = true;
      emitSocketEvent('connect');

      expect(mockSocket.emit).toHaveBeenCalledWith(
        'join',
        expect.objectContaining({ chatId: 'chat_1', rpcProtocolVersion: expect.any(String) }),
        expect.any(Function),
      );
    });

    it('should emit join with callback ack on reconnect', () => {
      service.connect();
      const handler = vi.fn();
      service.joinChat('chat_1', handler);

      // Simulate reconnect
      mockSocket.connected = true;
      emitManagerEvent('reconnect');

      expect(mockSocket.emit).toHaveBeenCalledWith(
        'join',
        expect.objectContaining({ chatId: 'chat_1', rpcProtocolVersion: expect.any(String) }),
        expect.any(Function),
      );
    });

    it('should emit join with callback when joinChat is called while connected', () => {
      service.connect();
      mockSocket.connected = true;

      service.joinChat('chat_new', vi.fn());

      expect(mockSocket.emit).toHaveBeenCalledWith(
        'join',
        expect.objectContaining({ chatId: 'chat_new', rpcProtocolVersion: expect.any(String) }),
        expect.any(Function),
      );
    });

    it('should stop retrying and disconnect when join reports protocol mismatch', async () => {
      service.connect();
      const listener = vi.fn();
      service.subscribe(listener);
      mockSocket.connected = true;
      mockSocket.emit = vi.fn((_event: string, _payload: unknown, callback: (ack: unknown) => void) => {
        callback({
          success: false,
          code: 'PROTOCOL_VERSION_MISMATCH',
          message: 'Chat RPC protocol changed. Reload this page to reconnect.',
        });
      }) as unknown as Socket['emit'];

      service.joinChat('chat_1', vi.fn());

      await vi.waitFor(() => {
        expect(listener).toHaveBeenCalledWith('error', 'Chat RPC protocol changed. Reload this page to reconnect.');
      });

      expect(mockSocket.emit).toHaveBeenCalledTimes(1);
      expect(mockSocket.disconnect).toHaveBeenCalled();
    });
  });

  describe('rpc_request handling with ack', () => {
    it('should call ack with handler result for known chat', async () => {
      service.connect();
      const handler = vi.fn().mockResolvedValue({
        type: 'rpc_response',
        rpcName: 'read_file',
        requestId: 'req_1',
        toolCallId: 'tc_1',
        result: { content: 'ok' },
      });
      service.joinChat('chat_1', handler);

      const ack = vi.fn();
      const request = {
        type: 'rpc_request',
        chatId: 'chat_1',
        requestId: 'req_1',
        toolCallId: 'tc_1',
        rpcName: 'read_file',
        args: { targetFile: '/fixture.txt' },
      };

      emitSocketEvent('rpc_request', request, ack);

      await vi.waitFor(() => {
        expect(ack).toHaveBeenCalled();
      });

      expect(ack).toHaveBeenCalledWith(expect.objectContaining({ type: 'rpc_response', result: { content: 'ok' } }));
    });

    it('should call ack with error for unknown chat', async () => {
      service.connect();

      const ack = vi.fn();
      const request = {
        type: 'rpc_request',
        chatId: 'unknown_chat',
        requestId: 'req_1',
        toolCallId: 'tc_1',
        rpcName: 'read_file',
        args: { targetFile: '/fixture.txt' },
      };

      emitSocketEvent('rpc_request', request, ack);

      await vi.waitFor(() => {
        expect(ack).toHaveBeenCalled();
      });

      expect(ack).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'rpc_response',
          rpcName: 'read_file',
          error: expect.stringContaining('No handler registered'),
        }),
      );
    });

    it('should call ack with error when handler throws', async () => {
      service.connect();
      const handler = vi.fn().mockRejectedValue(new Error('handler crashed'));
      service.joinChat('chat_1', handler);

      const ack = vi.fn();
      const request = {
        type: 'rpc_request',
        chatId: 'chat_1',
        requestId: 'req_1',
        toolCallId: 'tc_1',
        rpcName: 'read_file',
        args: { targetFile: '/fixture.txt' },
      };

      emitSocketEvent('rpc_request', request, ack);

      await vi.waitFor(() => {
        expect(ack).toHaveBeenCalled();
      });

      expect(ack).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'rpc_response',
          rpcName: 'read_file',
          error: 'handler crashed',
        }),
      );
    });
  });
});
