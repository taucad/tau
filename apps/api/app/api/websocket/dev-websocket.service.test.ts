/* oxlint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-argument, @typescript-eslint/no-explicit-any -- vitest mocks lose type safety */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const { mockCreateServer, mockHttpServers, mockWebSocketServers, setListenError } = vi.hoisted(() => {
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
    mockHttpServers.length = 0;
    mockWebSocketServers.length = 0;
    setListenError(undefined);
    vi.clearAllMocks();
  });

  async function createService() {
    // eslint-disable-next-line @typescript-eslint/naming-convention -- class import from dynamic module
    const { DevWebSocketService } = await import('#api/websocket/dev-websocket.service.js');
    return new DevWebSocketService(createMockConfigService() as any);
  }

  describe('ensureStarted', () => {
    it('should reuse the same startup promise for concurrent initialization', async () => {
      const service = await createService();

      await Promise.all([service.ensureStarted(), service.ensureStarted()]);

      expect(mockCreateServer).toHaveBeenCalledOnce();
      expect(mockHttpServers[0]!.listen).toHaveBeenCalledOnce();
    });

    it('should reject listen errors instead of emitting an unhandled server error', async () => {
      const listenError = Object.assign(new Error('address already in use'), { code: 'EADDRINUSE' });
      const service = await createService();
      setListenError(listenError);

      await expect(service.ensureStarted()).rejects.toBe(listenError);
    });
  });

  describe('onModuleDestroy', () => {
    it('should close the raw WebSocket and HTTP servers', async () => {
      const service = await createService();

      await service.ensureStarted();
      await service.onModuleDestroy();

      expect(mockWebSocketServers[0]!.close).toHaveBeenCalledOnce();
      expect(mockHttpServers[0]!.close).toHaveBeenCalledOnce();
      expect(mockHttpServers[0]!.closeAllConnections).toHaveBeenCalledOnce();
    });

    it('should make shutdown idempotent', async () => {
      const service = await createService();

      await service.ensureStarted();
      await service.stop();
      await service.stop();

      expect(mockWebSocketServers[0]!.close).toHaveBeenCalledOnce();
      expect(mockHttpServers[0]!.close).toHaveBeenCalledOnce();
    });
  });
});
