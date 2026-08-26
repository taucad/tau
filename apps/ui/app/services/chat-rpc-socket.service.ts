/**
 * Chat RPC Socket Service
 *
 * Singleton service that manages a single Socket.IO connection for chat RPC execution.
 * This service lives outside of React's lifecycle to avoid connection churn from
 * React Strict Mode and effect re-runs.
 *
 * Features:
 * - Single connection per browser tab (singleton pattern)
 * - Room-based routing for multiple chats
 * - Automatic reconnection with exponential backoff
 * - Status subscription for React components
 */
import type { Socket } from 'socket.io-client';
import { io } from 'socket.io-client';
import { chatRpcProtocolErrorCode, chatRpcProtocolVersion } from '@taucad/chat';
import type { ChatRpcJoinAck, ChatRpcJoinMessage, RpcRequest, RpcResponse } from '@taucad/chat';
import { Topic } from '@taucad/events';
import { ENV } from '#environment.config.js';

/** Connection status for UI display */
export type ConnectionStatus =
  | 'connecting'
  | 'connected'
  | 'disconnected'
  | 'reconnecting'
  | 'error'
  | 'unauthenticated';

/** Handler for incoming RPC requests */
export type RpcRequestHandler = (request: RpcRequest) => Promise<RpcResponse>;

/** Listener for connection status changes */
export type StatusListener = (status: ConnectionStatus, error?: string) => void;

/** Socket.IO URL for chat RPC */
const socketUrl = ENV.TAU_WEBSOCKET_URL;
const socketPath = '/v1/chat/rpc';

/**
 * Singleton service for managing Socket.IO chat RPC connection.
 *
 * Maintains a single Socket.IO connection per browser tab that can be joined
 * to multiple chat rooms simultaneously. RPC requests are routed to the
 * appropriate handler based on the chatId in the request.
 *
 * Usage:
 * 1. Get instance: ChatRpcSocketService.getInstance()
 * 2. Connect: service.connect()
 * 3. Join chat: service.joinChat(chatId, onRpcRequest)
 * 4. Leave chat: service.leaveChat(chatId)
 * 5. Subscribe to status: service.subscribe(listener)
 */
export class ChatRpcSocketService {
  private static instance: ChatRpcSocketService | undefined;

  /**
   * Get the singleton instance of the service.
   */
  // eslint-disable-next-line @typescript-eslint/member-ordering -- Singleton pattern requires instance field before getInstance
  public static getInstance(): ChatRpcSocketService {
    ChatRpcSocketService.instance ??= new ChatRpcSocketService();

    return ChatRpcSocketService.instance;
  }

  private socket: Socket | undefined;
  private status: ConnectionStatus = 'disconnected';
  private error: string | undefined;

  /** Map of chatId to RPC request handler - supports multiple active chats */
  private readonly chatHandlers = new Map<string, RpcRequestHandler>();

  /** Connection status change fan-out. */
  private readonly statusTopic = new Topic<{ status: ConnectionStatus; error: string | undefined }>({
    name: 'chat-rpc-status',
  });

  /** Event handler references for cleanup */
  private handleVisibilityChange: (() => void) | undefined;
  private handleOnline: (() => void) | undefined;

  /** Whether connection was rejected due to authentication failure - prevents reconnection attempts */
  private isAuthenticationFailure = false;
  /** Whether connection was rejected due to browser/API protocol skew. */
  private isProtocolVersionMismatch = false;

  /** Private constructor to enforce singleton pattern */
  private constructor() {
    // Singleton - use getInstance()
  }

  /**
   * Connect to the Socket.IO server.
   * Safe to call multiple times - will only connect if not already connected.
   */
  public connect(): void {
    if (this.socket?.connected) {
      return;
    }

    // Reset auth failure flag for new connection attempt (e.g., after user logs in)
    this.isAuthenticationFailure = false;
    this.isProtocolVersionMismatch = false;

    // If we have an existing socket that's not connected, clean it up
    if (this.socket) {
      this.socket.disconnect();
      this.socket = undefined;
    }

    this.setStatus('connecting');

    this.socket = io(socketUrl, {
      path: socketPath,
      transports: ['websocket'],
      reconnection: true,
      reconnectionAttempts: Infinity,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 5000,
      randomizationFactor: 0.5,
      timeout: 20_000,
      withCredentials: true,
    });

    this.setupEventListeners();
    this.setupVisibilityHandlers();
  }

  /**
   * Disconnect from the Socket.IO server.
   */
  public disconnect(): void {
    this.cleanupVisibilityHandlers();

    if (this.socket) {
      this.socket.disconnect();
      this.socket = undefined;
    }

    this.chatHandlers.clear();
    this.setStatus('disconnected');
  }

  /**
   * Join a chat room and register a handler for RPC requests.
   * Multiple chats can be joined simultaneously.
   */
  public joinChat(chatId: string, onRpcRequest: RpcRequestHandler): void {
    // Store/update the handler for this chat
    this.chatHandlers.set(chatId, onRpcRequest);

    if (this.socket?.connected) {
      void this.emitJoinWithRetry(chatId);
    }
  }

  /**
   * Leave a chat room and unregister its handler.
   */
  public leaveChat(chatId: string): void {
    // Remove handler
    this.chatHandlers.delete(chatId);

    // Leave the room on the server
    if (this.socket?.connected) {
      this.socket.emit('leave', { chatId });
    }
  }

  /**
   * Get all active chat IDs.
   */
  public getActiveChatIds(): string[] {
    return [...this.chatHandlers.keys()];
  }

  /**
   * Check if a specific chat is active.
   */
  public isChatActive(chatId: string): boolean {
    return this.chatHandlers.has(chatId);
  }

  /**
   * Subscribe to connection status changes.
   * Returns an unsubscribe function.
   */
  public subscribe(listener: StatusListener): () => void {
    const unsubscribe = this.statusTopic.subscribe(({ status, error }) => {
      listener(status, error);
    });

    // Immediately notify with current status
    listener(this.status, this.error);

    return unsubscribe;
  }

  /**
   * Get the current connection status.
   */
  public getStatus(): ConnectionStatus {
    return this.status;
  }

  /**
   * Get the current error message, if any.
   */
  public getError(): string | undefined {
    return this.error;
  }

  /**
   * Check if connected.
   */
  public isConnected(): boolean {
    return this.status === 'connected';
  }

  /**
   * Manually trigger reconnection.
   */
  public reconnect(): void {
    if (this.isProtocolVersionMismatch) {
      return;
    }

    if (this.socket) {
      this.socket.disconnect();
      this.socket.connect();
    }
  }

  /**
   * Set up Socket.IO event listeners.
   */
  private setupEventListeners(): void {
    const { socket } = this;
    if (!socket) {
      return;
    }

    socket.on('connect', () => {
      this.setStatus('connected');

      for (const chatId of this.chatHandlers.keys()) {
        void this.emitJoinWithRetry(chatId);
      }
    });

    socket.on('disconnect', (reason) => {
      if (this.isAuthenticationFailure || this.isProtocolVersionMismatch) {
        return;
      }

      console.warn(`[ChatRpcSocket] Disconnected (reason: ${reason})`);

      const errorMessages: Record<string, string> = {
        'io server disconnect': 'Server closed connection',
        'io client disconnect': 'Disconnected by client',
        'transport close': 'Connection lost',
        'ping timeout': 'Connection timed out',
        'transport error': 'Transport error',
      };

      const errorMessage = errorMessages[reason];
      if (errorMessage) {
        this.setStatus('disconnected', errorMessage);
      } else {
        this.setStatus('disconnected');
      }

      // Socket.IO disables auto-reconnection for 'io server disconnect'
      // We need to manually reconnect after a delay
      if (reason === 'io server disconnect') {
        console.warn('[ChatRpcSocket] Server disconnected, manually reconnecting...');
        setTimeout(() => {
          if (this.socket && !this.socket.connected) {
            this.socket.connect();
          }
        }, 1000);
      }
    });

    socket.on('connect_error', (connectError) => {
      if (connectError.message === 'UNAUTHENTICATED' || connectError.message === 'AUTH_ERROR') {
        this.isAuthenticationFailure = true;
        this.setStatus('unauthenticated');
        socket.disconnect();
        return;
      }

      this.setStatus('error', connectError.message);
    });

    // Socket.IO manager events for reconnection
    socket.io.on('reconnect_attempt', () => {
      this.setStatus('reconnecting');
    });

    socket.io.on('reconnect_error', (reconnectError) => {
      console.warn('[ChatRpcSocket] Reconnection error:', reconnectError.message);
    });

    socket.io.on('reconnect', () => {
      this.setStatus('connected');

      for (const chatId of this.chatHandlers.keys()) {
        void this.emitJoinWithRetry(chatId);
      }
    });

    socket.io.on('reconnect_failed', () => {
      this.setStatus('error', 'Failed to reconnect');
    });

    socket.on('rpc_request', (request: RpcRequest, ack: (response: RpcResponse) => void) => {
      void this.handleRpcRequest(request, ack);
    });

    // Handle server errors
    socket.on('error', (serverError: { code: string; message: string }) => {
      // Check for authentication-related errors
      if (serverError.code === 'UNAUTHENTICATED' || serverError.code === 'AUTH_ERROR') {
        this.isAuthenticationFailure = true;
        this.setStatus('unauthenticated');

        // Disconnect to stop the Manager's reconnection loop
        // This sets skipReconnect = true in the Manager
        socket.disconnect();
        return;
      }

      if (serverError.code === chatRpcProtocolErrorCode.protocolVersionMismatch) {
        this.isProtocolVersionMismatch = true;
        this.setStatus('error', serverError.message);
        socket.disconnect();
        return;
      }

      this.setError(serverError.message);
    });
  }

  /**
   * Set up visibility and network status handlers.
   * Stores handler references for proper cleanup.
   */
  private setupVisibilityHandlers(): void {
    // Clean up existing listeners first to prevent stacking
    this.cleanupVisibilityHandlers();

    this.handleVisibilityChange = (): void => {
      // Don't attempt reconnection if auth failed
      if (this.isAuthenticationFailure || this.isProtocolVersionMismatch) {
        return;
      }

      if (document.visibilityState === 'visible' && this.socket && !this.socket.connected) {
        this.socket.connect();
      }
    };

    this.handleOnline = (): void => {
      // Don't attempt reconnection if auth failed
      if (this.isAuthenticationFailure || this.isProtocolVersionMismatch) {
        return;
      }

      if (this.socket && !this.socket.connected) {
        this.socket.connect();
      }
    };

    document.addEventListener('visibilitychange', this.handleVisibilityChange);
    globalThis.addEventListener('online', this.handleOnline);
  }

  /**
   * Clean up visibility and network status handlers.
   */
  private cleanupVisibilityHandlers(): void {
    if (this.handleVisibilityChange) {
      document.removeEventListener('visibilitychange', this.handleVisibilityChange);
      this.handleVisibilityChange = undefined;
    }

    if (this.handleOnline) {
      globalThis.removeEventListener('online', this.handleOnline);
      this.handleOnline = undefined;
    }
  }

  /** Milliseconds. */
  private static get joinAckTimeout(): number {
    return 5000;
  }

  private static get joinMaxRetries(): number {
    return 3;
  }

  /**
   * Emit a 'join' event with callback acknowledgment and retry on failure.
   * Retries with linear backoff if the server doesn't ack or returns failure.
   */
  private async emitJoinWithRetry(chatId: string): Promise<void> {
    const { socket } = this;
    if (!socket?.connected) {
      return;
    }

    /* oxlint-disable no-await-in-loop, @typescript-eslint/no-unnecessary-condition -- sequential retries with backoff; socket.connected can change between iterations */
    for (let attempt = 0; attempt <= ChatRpcSocketService.joinMaxRetries; attempt++) {
      if (!socket.connected) {
        return;
      }

      const ack = await new Promise<ChatRpcJoinAck | undefined>((resolve) => {
        const ackTimeoutTimer = setTimeout(() => {
          resolve(undefined);
        }, ChatRpcSocketService.joinAckTimeout);

        const joinMessage: ChatRpcJoinMessage = { chatId, rpcProtocolVersion: chatRpcProtocolVersion };
        socket.emit('join', joinMessage, (response: ChatRpcJoinAck) => {
          clearTimeout(ackTimeoutTimer);
          resolve(response);
        });
      });

      if (ack?.success) {
        return;
      }

      if (ack?.code === chatRpcProtocolErrorCode.protocolVersionMismatch) {
        this.isProtocolVersionMismatch = true;
        this.setStatus('error', ack.message ?? 'Chat RPC protocol changed. Reload this page to reconnect.');
        socket.disconnect();
        return;
      }

      if (attempt < ChatRpcSocketService.joinMaxRetries) {
        await new Promise<void>((resolve) => {
          setTimeout(
            () => {
              resolve();
            },
            1000 * (attempt + 1),
          );
        });
      }
    }
    /* oxlint-enable no-await-in-loop, @typescript-eslint/no-unnecessary-condition */

    console.error(
      `[ChatRpcSocket] Failed to join chat ${chatId} after ${ChatRpcSocketService.joinMaxRetries + 1} attempts`,
    );
  }

  /**
   * Handle an incoming RPC request.
   * Routes to the appropriate handler based on chatId and responds via the ack callback.
   */
  private async handleRpcRequest(request: RpcRequest, ack: (response: RpcResponse) => void): Promise<void> {
    const { chatId } = request;
    const handler = this.chatHandlers.get(chatId);

    if (!handler) {
      console.warn(`[ChatRpcSocket] Received RPC request for unknown chat: ${chatId}`);
      ack({
        type: 'rpc_response',
        rpcName: request.rpcName,
        requestId: request.requestId,
        toolCallId: request.toolCallId,
        result: undefined,
        error: `No handler registered for chat ${chatId}`,
      });
      return;
    }

    const { traceContext } = request;

    try {
      const response = await handler(request);
      ack({ ...response, ...(traceContext ? { traceContext } : {}) });
    } catch (execError) {
      ack({
        type: 'rpc_response',
        rpcName: request.rpcName,
        requestId: request.requestId,
        toolCallId: request.toolCallId,
        result: undefined,
        error: execError instanceof Error ? execError.message : 'Unknown error',
        ...(traceContext ? { traceContext } : {}),
      });
    }
  }

  /**
   * Update status and notify listeners.
   */
  private setStatus(status: ConnectionStatus, errorMessage?: string): void {
    this.status = status;

    if (errorMessage !== undefined) {
      this.error = errorMessage;
    } else if (status === 'connected') {
      // Clear error on successful connection
      this.error = undefined;
    }

    this.statusTopic.emit({ status: this.status, error: this.error });
  }

  /**
   * Set error without changing status.
   */
  private setError(errorMessage: string): void {
    this.error = errorMessage;

    this.statusTopic.emit({ status: this.status, error: this.error });
  }
}
