// @vitest-environment jsdom
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, renderHook } from '@testing-library/react';
import type { ReactNode } from 'react';
import { rpcName } from '@taucad/chat/constants';
import type { RpcRequest } from '@taucad/chat';
import type { RpcRequestHandler } from '#services/chat-rpc-socket.service.js';
import { ChatRpcSocketProvider, useChatRpcConnection, useChatRpcSocket } from '#hooks/use-chat-rpc-socket.js';
import { ChatRpcSocketService } from '#services/chat-rpc-socket.service.js';

const hookMocks = vi.hoisted(() => {
  const worker = { postMessage: vi.fn(), terminate: vi.fn() };
  const fileManager = {
    fileManagerRef: {
      getSnapshot: vi.fn(),
    },
    openFileSystemBridge: vi.fn(),
    readFile: vi.fn(),
    writeFile: vi.fn(),
    deleteFile: vi.fn(),
    stat: vi.fn(),
    whenServicesReady: vi.fn(),
  };
  const createGeoSpecWorkerRpcClient = vi.fn();
  return {
    worker,
    fileManager,
    createGeoSpecWorkerRpcClient,
  };
});

vi.mock('#services/chat-rpc-socket.service.js', () => {
  const mockService = {
    connect: vi.fn(),
    disconnect: vi.fn(),
    getStatus: vi.fn().mockReturnValue('disconnected'),
    getError: vi.fn(),
    subscribe: vi.fn().mockReturnValue(vi.fn()),
    joinChat: vi.fn(),
    leaveChat: vi.fn(),
    reconnect: vi.fn(),
  };

  return {
    ChatRpcSocketService: {
      getInstance: vi.fn().mockReturnValue(mockService),
    },
  };
});

vi.mock('#hooks/use-project.js', () => ({
  useProject: () => ({ projectRef: { getSnapshot: vi.fn(), send: vi.fn() } }),
  useResolveGraphicsForFile: () => undefined,
}));

vi.mock('#hooks/use-file-manager.js', () => ({
  useFileManager: () => hookMocks.fileManager,
}));

vi.mock('#hooks/use-image-quality.js', () => ({
  useImageQuality: () => ({ quality: 1 }),
}));

vi.mock('#workers/geospec-runner.client.js', () => ({
  createGeoSpecWorkerRpcClient: hookMocks.createGeoSpecWorkerRpcClient,
}));

const environmentMock = vi.hoisted(() => {
  const exportName = 'ENV';
  const apiUrlKey = 'TAU_API_URL';
  const websocketUrlKey = 'TAU_WEBSOCKET_URL';
  return {
    exportName,
    environment: {
      [apiUrlKey]: 'https://api.tau.test',
      [websocketUrlKey]: 'wss://api.tau.test',
    },
  };
});

vi.mock('#environment.config.js', () => ({
  [environmentMock.exportName]: environmentMock.environment,
}));

vi.mock('#runtime/ui-runtime.config.js', () => ({
  createUiRuntimeConfig: () => ({
    tauApiUrl: 'https://api.tau.test',
    tauWebSocketUrl: 'wss://api.tau.test',
  }),
}));

const createGeoSpecRpcRequest = (requestId: string): RpcRequest<typeof rpcName.runGeoSpecTests> => ({
  type: 'rpc_request',
  chatId: 'chat-1',
  requestId,
  toolCallId: `tool-${requestId}`,
  rpcName: rpcName.runGeoSpecTests,
  args: { files: ['main.geospec.ts'] },
});

const getRegisteredRpcHandler = (): RpcRequestHandler => {
  const service = ChatRpcSocketService.getInstance() as unknown as {
    joinChat: ReturnType<typeof vi.fn<(chatId: string, handler: RpcRequestHandler) => void>>;
  };
  const handler = service.joinChat.mock.calls[0]?.[1];
  if (typeof handler !== 'function') {
    throw new TypeError('Expected chat RPC handler registration.');
  }
  return handler;
};

describe('ChatRpcSocketProvider', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    hookMocks.fileManager.fileManagerRef.getSnapshot.mockReturnValue({
      context: {
        worker: hookMocks.worker,
        openFileSystemBridge: hookMocks.fileManager.openFileSystemBridge,
        rootDirectory: '/projects/proj-a',
        filePoolBuffer: new SharedArrayBuffer(8),
      },
    });
  });

  it('should call connect when ChatRpcSocketProvider mounts', () => {
    const mockService = ChatRpcSocketService.getInstance();

    render(
      <ChatRpcSocketProvider>
        <div>test</div>
      </ChatRpcSocketProvider>,
    );

    expect(mockService.connect).toHaveBeenCalledOnce();
  });

  it('should throw when useChatRpcSocket is used outside provider', () => {
    expect(() => {
      renderHook(() => useChatRpcSocket());
    }).toThrow('useChatRpcSocket must be used within a ChatRpcSocketProvider');
  });

  it('should return the service instance when used within provider', () => {
    const wrapper = ({ children }: { readonly children: ReactNode }) => (
      <ChatRpcSocketProvider>{children}</ChatRpcSocketProvider>
    );

    const { result } = renderHook(() => useChatRpcSocket(), { wrapper });

    expect(result.current).toBe(ChatRpcSocketService.getInstance());
  });

  it('should reuse one GeoSpec worker client for repeated RPC calls with the same project identity', async () => {
    const runTests = vi.fn().mockResolvedValue({
      success: true,
      failures: [],
      passes: [],
      passed: 0,
      total: 0,
    });
    const close = vi.fn().mockResolvedValue(undefined);
    hookMocks.createGeoSpecWorkerRpcClient.mockReturnValue({ runTests, close });
    const wrapper = ({ children }: { readonly children: ReactNode }) => (
      <ChatRpcSocketProvider>{children}</ChatRpcSocketProvider>
    );

    const { unmount } = renderHook(() => useChatRpcConnection({ chatId: 'chat-1' }), { wrapper });
    const handler = getRegisteredRpcHandler();

    await handler(createGeoSpecRpcRequest('request-1'));
    await handler(createGeoSpecRpcRequest('request-2'));

    expect(hookMocks.createGeoSpecWorkerRpcClient).toHaveBeenCalledTimes(1);
    expect(runTests).toHaveBeenCalledTimes(2);
    expect(close).not.toHaveBeenCalled();

    unmount();
    expect(close).toHaveBeenCalledTimes(1);
  });

  it('should close the old GeoSpec worker client when the project identity changes', async () => {
    const firstClient = {
      runTests: vi.fn().mockResolvedValue({ success: true, failures: [], passes: [], passed: 0, total: 0 }),
      close: vi.fn().mockResolvedValue(undefined),
    };
    const secondClient = {
      runTests: vi.fn().mockResolvedValue({ success: true, failures: [], passes: [], passed: 0, total: 0 }),
      close: vi.fn().mockResolvedValue(undefined),
    };
    hookMocks.createGeoSpecWorkerRpcClient.mockReturnValueOnce(firstClient).mockReturnValueOnce(secondClient);
    const wrapper = ({ children }: { readonly children: ReactNode }) => (
      <ChatRpcSocketProvider>{children}</ChatRpcSocketProvider>
    );

    const { unmount } = renderHook(() => useChatRpcConnection({ chatId: 'chat-1' }), { wrapper });
    const handler = getRegisteredRpcHandler();

    await handler(createGeoSpecRpcRequest('request-1'));
    hookMocks.fileManager.fileManagerRef.getSnapshot.mockReturnValueOnce({
      context: {
        worker: hookMocks.worker,
        openFileSystemBridge: hookMocks.fileManager.openFileSystemBridge,
        rootDirectory: '/projects/proj-b',
        filePoolBuffer: new SharedArrayBuffer(8),
      },
    });
    await handler(createGeoSpecRpcRequest('request-2'));

    expect(hookMocks.createGeoSpecWorkerRpcClient).toHaveBeenCalledTimes(2);
    expect(firstClient.close).toHaveBeenCalledTimes(1);
    expect(secondClient.close).not.toHaveBeenCalled();

    unmount();
    expect(secondClient.close).toHaveBeenCalledTimes(1);
  });
});
