/**
 * Chat RPC Socket React Integration
 *
 * Provides React hooks and context for the ChatRpcSocketService singleton.
 * The service manages a single Socket.IO connection outside of React's lifecycle,
 * while these hooks provide reactive state updates for React components.
 *
 * Key exports:
 * - ChatRpcSocketProvider: Wrap your app to initialize the socket connection
 * - useChatRpcSocket: Access the service instance
 * - useChatRpcConnection: Join a chat and get connection status
 */
import type { ReactNode } from 'react';
import { createContext, useContext, useEffect, useMemo, useState, useCallback, useRef } from 'react';

import type { RpcRequest, RpcResponse } from '@taucad/chat';
import { rpcWireSuccessResponse } from '@taucad/chat';
import { rpcNames } from '@taucad/chat/constants';
import { ChatRpcSocketService } from '#services/chat-rpc-socket.service.js';
import type { ConnectionStatus, RpcRequestHandler } from '#services/chat-rpc-socket.service.js';
import { createRpcHandlers } from '#hooks/rpc-handlers.js';
import type { RpcHandlerDependencies } from '#hooks/rpc-handlers.js';
import { useProject, useResolveGraphicsForFile } from '#hooks/use-project.js';
import { useFileManager } from '#hooks/use-file-manager.js';
import { useImageQuality } from '#hooks/use-image-quality.js';
import { createGeoSpecWorkerRpcClient } from '#workers/geospec-runner.client.js';
import type { GeoSpecWorkerRpcClient } from '#workers/geospec-runner.client.js';
import { ENV } from '#environment.config.js';
import type { UiRuntimeConfigInput } from '#runtime/ui-runtime.config.js';
import { createUiRuntimeConfig } from '#runtime/ui-runtime.config.js';
import type { RuntimeFileSystem } from '@taucad/runtime/filesystem';

type RpcHandlerDepsBase = Omit<RpcHandlerDependencies, 'chatId'>;

type GeoSpecClientCache = {
  fileSystem: RuntimeFileSystem;
  runtimeConfig: UiRuntimeConfigInput;
  client: GeoSpecWorkerRpcClient;
};

const isSameGeoSpecClientCache = (
  cache: GeoSpecClientCache | undefined,
  input: Omit<GeoSpecClientCache, 'client'>,
): boolean =>
  cache !== undefined &&
  cache.fileSystem === input.fileSystem &&
  cache.runtimeConfig.tauApiUrl === input.runtimeConfig.tauApiUrl &&
  cache.runtimeConfig.tauWebSocketUrl === input.runtimeConfig.tauWebSocketUrl;

// -----------------------------------------------------------------------------
// Context
// -----------------------------------------------------------------------------

const ChatRpcSocketContext = createContext<ChatRpcSocketService | undefined>(undefined);

// -----------------------------------------------------------------------------
// Provider
// -----------------------------------------------------------------------------

type ChatRpcSocketProviderProps = {
  readonly children: ReactNode;
};

/**
 * Provider that initializes the Socket.IO connection at app startup.
 * Should be placed near the root of your app.
 */
export function ChatRpcSocketProvider({ children }: ChatRpcSocketProviderProps): React.JSX.Element {
  const service = useMemo(() => ChatRpcSocketService.getInstance(), []);

  useEffect(() => {
    // Connect on mount - the service handles idempotent connection
    service.connect();

    // Note: We intentionally don't disconnect on unmount.
    // The singleton connection should persist for the app's lifetime.
  }, [service]);

  return <ChatRpcSocketContext.Provider value={service}>{children}</ChatRpcSocketContext.Provider>;
}

// -----------------------------------------------------------------------------
// Hooks
// -----------------------------------------------------------------------------

/**
 * Get the ChatRpcSocketService instance.
 * Must be used within a ChatRpcSocketProvider.
 */
export function useChatRpcSocket(): ChatRpcSocketService {
  const service = useContext(ChatRpcSocketContext);

  if (!service) {
    throw new Error('useChatRpcSocket must be used within a ChatRpcSocketProvider');
  }

  return service;
}

/**
 * Subscribe to connection status changes.
 * Returns the current status and error state.
 */
export function useChatRpcStatus(): { status: ConnectionStatus; error: string | undefined } {
  const service = useChatRpcSocket();
  const [status, setStatus] = useState<ConnectionStatus>(service.getStatus());
  const [error, setError] = useState<string | undefined>(service.getError());

  useEffect(() => {
    const unsubscribe = service.subscribe((newStatus, newError) => {
      setStatus(newStatus);
      setError(newError);
    });

    return unsubscribe;
  }, [service]);

  return { status, error };
}

// -----------------------------------------------------------------------------
// Chat Connection Hook (Main API)
// -----------------------------------------------------------------------------

type UseChatRpcConnectionOptions = {
  /** The chat ID to connect for */
  chatId: string | undefined;
  /** Whether the connection is enabled */
  enabled?: boolean;
};

type UseChatRpcConnectionReturn = {
  /** Current connection status */
  status: ConnectionStatus;
  /** Whether connected (shortcut for status === 'connected') */
  isConnected: boolean;
  /** Any error message */
  error: string | undefined;
  /** Manually trigger reconnection */
  reconnect: () => void;
};

/**
 * Join a chat room and handle RPC requests.
 *
 * This hook:
 * 1. Joins the chat room when enabled and chatId is provided
 * 2. Sets up RPC request handling using the current project context
 * 3. Leaves the chat room on cleanup or when disabled
 * 4. Provides reactive connection status updates
 */
export function useChatRpcConnection(options: UseChatRpcConnectionOptions): UseChatRpcConnectionReturn {
  const { chatId, enabled = true } = options;

  const service = useChatRpcSocket();
  const { status, error } = useChatRpcStatus();

  // Get dependencies for RPC handlers
  const { projectRef } = useProject();
  const resolveGraphicsForFile = useResolveGraphicsForFile();
  const fileManager = useFileManager();
  const { quality: screenshotQuality } = useImageQuality();

  // Store dependencies in a ref so handler always uses current values
  // without causing effect re-runs when deps change
  const depsRef = useRef<RpcHandlerDepsBase | undefined>(undefined);
  const geoSpecClientRef = useRef<GeoSpecClientCache | undefined>(undefined);
  depsRef.current = {
    fileManager,
    resolveGraphicsForFile,
    projectRef,
    screenshotQuality,
    createGeoSpecClient() {
      const snapshot = fileManager.fileManagerRef.getSnapshot();
      if (!snapshot.context.openFileSystemBridge) {
        throw new Error('File manager filesystem bridge not available for GeoSpec tests.');
      }

      const runtimeConfig = createUiRuntimeConfig(ENV);
      const cacheInput = {
        fileSystem: fileManager.runtimeFileSystem,
        runtimeConfig,
      };
      const cachedGeoSpecClient = geoSpecClientRef.current;
      if (cachedGeoSpecClient && isSameGeoSpecClientCache(cachedGeoSpecClient, cacheInput)) {
        return cachedGeoSpecClient.client;
      }

      void cachedGeoSpecClient?.client.close();
      const { openFileSystemBridge, rootDirectory } = snapshot.context;
      const client = createGeoSpecWorkerRpcClient({
        openFileSystemBridge: () => openFileSystemBridge(rootDirectory),
        runtimeConfig,
      });
      geoSpecClientRef.current = { ...cacheInput, client };
      return client;
    },
  };

  useEffect(() => {
    return () => {
      void geoSpecClientRef.current?.client.close();
      geoSpecClientRef.current = undefined;
    };
  }, []);

  // Create stable RPC request handler that reads deps from ref
  const handleRpcRequest: RpcRequestHandler = useCallback(
    async (request: RpcRequest): Promise<RpcResponse> => {
      const baseDeps = depsRef.current;
      if (!baseDeps || !chatId) {
        const errorReason = baseDeps ? 'RPC handler requires chatId' : 'RPC handler not initialized';

        return {
          type: 'rpc_response',
          rpcName: request.rpcName,
          requestId: request.requestId,
          toolCallId: request.toolCallId,
          result: undefined,
          error: errorReason,
        };
      }

      const { requestId, toolCallId, rpcName: currentRpcName } = request;

      // Verify this is a valid RPC operation (runtime guard for malformed wire payloads).
      const isValidRpc = rpcNames.includes(currentRpcName);
      if (!isValidRpc) {
        console.warn(`[ChatRpcSocket] Received request for unknown RPC: ${String(currentRpcName)}`);
        return {
          type: 'rpc_response',
          rpcName: currentRpcName,
          requestId,
          toolCallId,
          result: undefined,
          error: `Unknown RPC: ${String(currentRpcName)}`,
        };
      }

      try {
        const handlers = createRpcHandlers({ ...baseDeps, chatId });

        const result = await handlers.executeRpcCall(request);

        return rpcWireSuccessResponse(request, result);
      } catch (execError) {
        return {
          type: 'rpc_response',
          rpcName: request.rpcName,
          requestId: request.requestId,
          toolCallId: request.toolCallId,
          result: undefined,
          error: execError instanceof Error ? execError.message : 'Unknown error',
        };
      }
    },
    [chatId],
  );

  // Join/leave chat room based on enabled and chatId
  // Only re-runs when chatId or enabled changes, NOT when deps change
  useEffect(() => {
    if (!enabled || !chatId) {
      return;
    }

    // Join the chat room with our handler
    service.joinChat(chatId, handleRpcRequest);

    // Leave on cleanup
    return () => {
      service.leaveChat(chatId);
    };
  }, [enabled, chatId, service, handleRpcRequest]);

  const reconnect = useCallback(() => {
    service.reconnect();
  }, [service]);

  return {
    status,
    isConnected: status === 'connected',
    error,
    reconnect,
  };
}
