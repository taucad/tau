/* oxlint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-argument, @typescript-eslint/no-explicit-any -- vitest mocks lose type safety */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const {
  mockCreateAdapter,
  mockSocketIoAdapter,
  mockSocketIoClose,
  mockSocketIoDisconnectSockets,
  mockSocketIoOn,
  mockCreateServer,
  mockHttpServers,
  mockWebSocketServers,
  setListenError,
} = vi.hoisted(() => {
  type Listener = (...args: unknown[]) => void;

  let listenError: Error | undefined;

  class MockHttpServer {
    public listening = false;
    public readonly close = vi.fn((callback?: (error?: Error) => void) => {
      this.listening = false;
      callback?.();
      return this;
    });
    public readonly closeAllConnections = vi.fn();
    public readonly listen = vi.fn((_port: number, callback?: () => void) => {
      if (listenError) {
        this.emit('error', listenError);
        return this;
      }

      this.listening = true;
      callback?.();
      return this;
    });

    private readonly listeners = new Map<string, Listener[]>();

    public on(event: string, listener: Listener) {
      this.listeners.set(event, [...(this.listeners.get(event) ?? []), listener]);
      return this;
    }

    public once(event: string, listener: Listener) {
      const onceListener: Listener = (...args) => {
        this.off(event, onceListener);
        listener(...args);
      };

      return this.on(event, onceListener);
    }

    public off(event: string, listener: Listener) {
      this.listeners.set(
        event,
        (this.listeners.get(event) ?? []).filter((candidate) => candidate !== listener),
      );
      return this;
    }

    public emit(event: string, ...args: unknown[]) {
      for (const listener of this.listeners.get(event) ?? []) {
        listener(...args);
      }
    }
  }

  class MockWebSocketServer {
    public readonly clients = new Set<{ terminate: () => void }>();
    public readonly close = vi.fn((callback?: (error?: Error) => void) => {
      callback?.();
    });
    public readonly emit = vi.fn();
    public readonly handleUpgrade = vi.fn();
  }

  const mockHttpServers: MockHttpServer[] = [];
  const mockWebSocketServers: MockWebSocketServer[] = [];

  return {
    mockCreateAdapter: vi.fn(() => 'mock-adapter-constructor'),
    mockSocketIoAdapter: vi.fn(),
    mockSocketIoClose: vi.fn(async (callback?: (error?: Error) => void) => {
      callback?.();
    }),
    mockSocketIoDisconnectSockets: vi.fn(),
    mockSocketIoOn: vi.fn(),
    mockCreateServer: vi.fn(() => {
      const server = new MockHttpServer();
      mockHttpServers.push(server);
      return server;
    }),
    mockHttpServers,
    mockWebSocketServers,
    setListenError: (error: Error | undefined) => {
      listenError = error;
    },
  };
});

let capturedSocketIoOptions: Record<string, unknown> | undefined;

vi.mock('@socket.io/redis-streams-adapter', () => ({
  createAdapter: mockCreateAdapter,
}));

vi.mock('socket.io', () => {
  class MockServer {
    public adapter = mockSocketIoAdapter;
    public close = mockSocketIoClose;
    public disconnectSockets = mockSocketIoDisconnectSockets;
    public on = mockSocketIoOn;
    public constructor(_httpServer: unknown, options: Record<string, unknown>) {
      capturedSocketIoOptions = options;
    }
  }

  return {
    // eslint-disable-next-line @typescript-eslint/naming-convention -- socket.io class name
    Server: MockServer,
  };
});

vi.mock('node:http', () => ({
  createServer: mockCreateServer,
}));

vi.mock('ws', () => {
  return {
    // eslint-disable-next-line @typescript-eslint/naming-convention -- ws class name
    WebSocketServer: class {
      public readonly clients = new Set<{ terminate: () => void }>();
      public readonly close = vi.fn((callback?: (error?: Error) => void) => {
        callback?.();
      });
      public readonly emit = vi.fn();
      public readonly handleUpgrade = vi.fn();
      public constructor() {
        mockWebSocketServers.push(this);
      }
    },
    // eslint-disable-next-line @typescript-eslint/naming-convention -- ws class name
    WebSocket: { OPEN: 1 },
  };
});

function createMockDuplicateClient() {
  return {
    on: vi.fn(),
    connect: vi.fn<() => Promise<void>>().mockResolvedValue(undefined),
    quit: vi.fn<() => Promise<string>>().mockResolvedValue('OK'),
  };
}

function createMockRedisService(duplicateClient = createMockDuplicateClient()) {
  return { createDuplicateClient: vi.fn(() => duplicateClient) };
}

function createMockConfigService() {
  return {
    get: vi.fn((key: string) => {
      if (key === 'PORT') {
        return '3001';
      }
      if (key === 'TAU_FRONTEND_URL') {
        return 'http://localhost:3000';
      }
      return undefined;
    }),
  };
}

describe('DevWebSocketService', () => {
  beforeEach(() => {
    capturedSocketIoOptions = undefined;
    mockHttpServers.length = 0;
    mockWebSocketServers.length = 0;
    setListenError(undefined);
    vi.clearAllMocks();
  });

  async function createService(overrides?: { duplicateClient?: ReturnType<typeof createMockDuplicateClient> }) {
    const duplicateClient = overrides?.duplicateClient ?? createMockDuplicateClient();
    const redisService = createMockRedisService(duplicateClient);
    const configService = createMockConfigService();

    // eslint-disable-next-line @typescript-eslint/naming-convention -- class import from dynamic module
    const { DevWebSocketService } = await import('#api/websocket/dev-websocket.service.js');
    const service = new DevWebSocketService(configService as any, redisService as any);

    return { service, redisService, configService, duplicateClient };
  }

  describe('onModuleInit (Redis Streams adapter)', () => {
    it('should create a duplicate Redis client and build the Streams adapter', async () => {
      const { service, redisService, duplicateClient } = await createService();

      await service.onModuleInit();

      expect(redisService.createDuplicateClient).toHaveBeenCalledOnce();
      expect(duplicateClient.connect).toHaveBeenCalledOnce();
      expect(mockCreateAdapter).toHaveBeenCalledWith(duplicateClient, {
        streamName: 'tau:socketio',
        maxLen: 10_000,
      });
    });

    it('should register error/connect/close listeners on the adapter client', async () => {
      const { service, duplicateClient } = await createService();

      await service.onModuleInit();

      expect(duplicateClient.on).toHaveBeenCalledWith('error', expect.any(Function));
      expect(duplicateClient.on).toHaveBeenCalledWith('connect', expect.any(Function));
      expect(duplicateClient.on).toHaveBeenCalledWith('close', expect.any(Function));
    });

    it('should fall back to in-memory adapter if Redis connection fails', async () => {
      const duplicateClient = createMockDuplicateClient();
      duplicateClient.connect.mockRejectedValue(new Error('Redis unavailable'));

      const { service } = await createService({ duplicateClient });

      await service.onModuleInit();

      expect(mockCreateAdapter).not.toHaveBeenCalled();
    });
  });

  describe('initServer (adapter application)', () => {
    it('should apply the Redis Streams adapter to the Socket.IO server', async () => {
      const { service } = await createService();

      await service.onModuleInit();
      await service.ensureSocketIoServer();

      expect(mockSocketIoAdapter).toHaveBeenCalledWith('mock-adapter-constructor');
    });

    it('should not apply adapter if Redis initialization failed', async () => {
      const duplicateClient = createMockDuplicateClient();
      duplicateClient.connect.mockRejectedValue(new Error('Redis unavailable'));

      const { service } = await createService({ duplicateClient });

      await service.onModuleInit();
      await service.ensureSocketIoServer();

      expect(mockSocketIoAdapter).not.toHaveBeenCalled();
    });

    it('should reuse the same startup promise for concurrent initialization', async () => {
      const { service } = await createService();

      await Promise.all([service.ensureSocketIoServer(), service.ensureSocketIoServer()]);

      expect(mockCreateServer).toHaveBeenCalledOnce();
      expect(mockHttpServers[0]!.listen).toHaveBeenCalledOnce();
    });

    it('should reject listen errors instead of emitting an unhandled server error', async () => {
      const listenError = Object.assign(new Error('address already in use'), { code: 'EADDRINUSE' });
      const { service } = await createService();
      setListenError(listenError);

      await expect(service.ensureSocketIoServer()).rejects.toBe(listenError);
    });
  });

  describe('CORS origin', () => {
    it('should use TAU_FRONTEND_URL as CORS origin instead of true', async () => {
      const { service } = await createService();

      await service.onModuleInit();
      await service.ensureSocketIoServer();

      expect(capturedSocketIoOptions).toBeDefined();
      const cors = capturedSocketIoOptions!['cors'] as { origin: string; credentials: boolean };
      expect(cors.origin).toBe('http://localhost:3000');
      expect(cors.credentials).toBe(true);
    });
  });

  describe('onModuleDestroy (adapter cleanup)', () => {
    it('should quit the adapter Redis client on destroy', async () => {
      const { service, duplicateClient } = await createService();

      await service.onModuleInit();
      await service.ensureSocketIoServer();
      await service.onModuleDestroy();

      expect(duplicateClient.quit).toHaveBeenCalledOnce();
    });

    it('should not fail if adapter was never initialized', async () => {
      const duplicateClient = createMockDuplicateClient();
      duplicateClient.connect.mockRejectedValue(new Error('Redis unavailable'));

      const { service } = await createService({ duplicateClient });

      await service.onModuleInit();
      await service.onModuleDestroy();

      expect(duplicateClient.quit).not.toHaveBeenCalled();
    });

    it('should close Socket.IO, raw WebSocket, HTTP, and Redis resources', async () => {
      const { service, duplicateClient } = await createService();

      await service.onModuleInit();
      await service.ensureSocketIoServer();
      await service.onModuleDestroy();

      expect(mockSocketIoDisconnectSockets).toHaveBeenCalledWith(true);
      expect(mockSocketIoClose).toHaveBeenCalledOnce();
      expect(mockWebSocketServers[0]!.close).toHaveBeenCalledOnce();
      expect(mockHttpServers[0]!.close).toHaveBeenCalledOnce();
      expect(mockHttpServers[0]!.closeAllConnections).toHaveBeenCalledOnce();
      expect(duplicateClient.quit).toHaveBeenCalledOnce();
    });

    it('should make shutdown idempotent', async () => {
      const { service } = await createService();

      await service.ensureSocketIoServer();
      await service.stop();
      await service.stop();

      expect(mockSocketIoClose).toHaveBeenCalledOnce();
      expect(mockWebSocketServers[0]!.close).toHaveBeenCalledOnce();
      expect(mockHttpServers[0]!.close).toHaveBeenCalledOnce();
    });
  });
});
