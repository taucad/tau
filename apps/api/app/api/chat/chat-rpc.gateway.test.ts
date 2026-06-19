/* oxlint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-argument, @typescript-eslint/no-explicit-any -- vitest mocks lose type safety */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { chatRpcProtocolVersion } from '@taucad/chat';

vi.mock('better-auth/node', () => ({
  fromNodeHeaders: vi.fn(),
}));

function createMockSocketIoServer() {
  return { use: vi.fn(), on: vi.fn() };
}

function createMockDevWebSocketService(io = createMockSocketIoServer()) {
  return {
    ensureSocketIoServer: vi.fn<() => Promise<ReturnType<typeof createMockSocketIoServer>>>().mockResolvedValue(io),
    getPort: vi.fn(() => 3002),
  };
}

function createMockChatRpcService() {
  return {
    registerConnection: vi.fn(),
    unregisterConnection: vi.fn(),
    handleSocketDisconnect: vi.fn(),
  };
}

function createMockAuth() {
  return { api: { getSession: vi.fn() } };
}

describe('ChatRpcGateway', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  async function createGateway(overrides?: { io?: ReturnType<typeof createMockSocketIoServer> }) {
    const io = overrides?.io ?? createMockSocketIoServer();
    const devWebSocketService = createMockDevWebSocketService(io);
    const chatRpcService = createMockChatRpcService();
    const auth = createMockAuth();

    // eslint-disable-next-line @typescript-eslint/naming-convention -- class import from dynamic module
    const { ChatRpcGateway } = await import('#api/chat/chat-rpc.gateway.js');
    const metricsService = { wsActiveConnections: { add: vi.fn() }, wsDisconnections: { add: vi.fn() } };
    const gateway = new ChatRpcGateway(
      chatRpcService as any,
      devWebSocketService as any,
      auth as any,
      metricsService as any,
    );

    return { gateway, io, devWebSocketService, chatRpcService };
  }

  describe('initDevSocketIo (connection metrics)', () => {
    it('should bind connection metrics before setting up auth middleware', async () => {
      const { gateway, io } = await createGateway();
      const callOrder: string[] = [];

      io.on.mockImplementation(() => {
        callOrder.push('connection-listener');
      });
      io.use.mockImplementation(() => {
        callOrder.push('middleware');
      });

      await gateway.onModuleInit();

      expect(io.on).toHaveBeenCalledWith('connection', expect.any(Function));
      expect(callOrder[0]).toBe('connection-listener');
    }, 30_000);
  });

  describe('handleJoinMessage', () => {
    it('should reject a mismatched chat RPC protocol before registering the socket', async () => {
      const { gateway, chatRpcService } = await createGateway();
      const socket = {
        id: 'socket_1',
        data: { userId: 'user_1' },
        join: vi.fn(),
      };

      const result = await (gateway as any).handleJoinMessage(socket, {
        chatId: 'chat_1',
        rpcProtocolVersion: 'stale-protocol-version',
      });

      expect(result).toMatchObject({
        success: false,
        code: 'PROTOCOL_VERSION_MISMATCH',
        receivedProtocolVersion: 'stale-protocol-version',
        expectedProtocolVersion: expect.any(String),
      });
      expect(chatRpcService.registerConnection).not.toHaveBeenCalled();
      expect(socket.join).not.toHaveBeenCalled();
    });

    it('should register and join a socket when the protocol version matches', async () => {
      const { gateway, chatRpcService } = await createGateway();
      chatRpcService.registerConnection.mockReturnValue(true);
      const socket = {
        id: 'socket_1',
        data: { userId: 'user_1' },
        join: vi.fn().mockResolvedValue(undefined),
      };

      const result = await (gateway as any).handleJoinMessage(socket, {
        chatId: 'chat_1',
        rpcProtocolVersion: chatRpcProtocolVersion,
      });

      expect(result).toEqual({ success: true, rpcProtocolVersion: chatRpcProtocolVersion });
      expect(chatRpcService.registerConnection).toHaveBeenCalledWith('chat_1', socket, 'user_1');
      expect(socket.join).toHaveBeenCalledWith('chat_1');
    });
  });
});
