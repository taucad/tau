import type { Models } from '@kittycad/lib';
import { decode as msgpackDecode, encode as msgpackEncode } from '@msgpack/msgpack';
import { Topic } from '@taucad/events';
import { binaryToUuid } from '#kernels/zoo/binary.utils.js';
import { KclError, KclAuthError, KclConnectionError } from '#kernels/zoo/kcl-errors.js';
import { createZooLogger } from '#kernels/zoo/zoo-logs.js';

/**
 * Request model for Zoo modeling API WebSocket messages.
 * @public
 */
export type WebSocketRequest = Models['WebSocketRequest_type'];
/**
 * Response model for Zoo modeling API WebSocket messages.
 * @public
 */
export type WebSocketResponse = Models['WebSocketResponse_type'];

/**
 * Handlers receive raw bytes suitable for `Context.sendResponse` and the decoded envelope.
 * For binary frames, `raw` is the frame payload; for JSON string frames, `raw` is msgpack of the decoded value.
 * @public
 */
export type ZooTransportMessageHandler = (raw: Uint8Array<ArrayBuffer>, decoded: WebSocketResponse) => void;

type ZooTransportMessageEvent = {
  readonly raw: Uint8Array<ArrayBuffer>;
  readonly decoded: WebSocketResponse;
};

type InitializationContext = {
  resolve: (value: void) => void;
  reject: (error: unknown) => void;
  resolved: boolean;
  authTimeoutId: NodeJS.Timeout | undefined;
};

const authTimeout = 10_000;

const log = createZooLogger('ZooWebSocketTransport');

const getWebSocket = async (): Promise<typeof WebSocket> => {
  if (typeof WebSocket !== 'undefined') {
    return WebSocket;
  }

  try {
    const ws = await import('ws');
    // oxlint-disable-next-line @typescript-eslint/consistent-type-assertions -- ws.WebSocket is API-compatible with browser WebSocket but types differ
    return ws.WebSocket as unknown as typeof WebSocket;
  } catch {
    throw new Error('WebSocket not available. In Node.js, install the "ws" package: npm install ws');
  }
};

/**
 * WebSocket-only layer for the Zoo modeling API: lifecycle, msgpack decode.
 * No WASM Context or KCL execution knowledge.
 *
 * @public
 */
export class ZooWebSocketTransport {
  private websocket: WebSocket | undefined;
  private isConnected = false;
  private readonly pendingEngineMessages: Array<{ raw: Uint8Array<ArrayBuffer>; decoded: WebSocketResponse }> = [];
  private readonly baseUrl: string;
  private initializationContext: InitializationContext | undefined;
  private readonly messageTopic = new Topic<ZooTransportMessageEvent>({
    name: 'zoo-websocket.message',
    onError: (error) => {
      log.warn('Zoo websocket message handler threw', { error });
    },
  });
  private readonly socketClosedTopic = new Topic<void>({
    name: 'zoo-websocket.socket-closed',
    onError: (error) => {
      log.warn('Zoo websocket close handler threw', { error });
    },
  });

  public constructor(optionsReadonly: { baseUrl: string }) {
    this.baseUrl = optionsReadonly.baseUrl;
  }

  /**
   * Whether the auth handshake completed successfully.
   *
   * @returns True when the modeling websocket is authenticated.
   */
  public get connected(): boolean {
    return this.isConnected;
  }

  /**
   * Register a listener for every decoded engine message. Returns unsubscribe.
   *
   * @param handler - Receives raw bytes and the decoded envelope.
   * @returns Unsubscribe function.
   */
  public onMessage(handler: ZooTransportMessageHandler): () => void {
    return this.messageTopic.subscribe(({ raw, decoded }) => {
      handler(raw, decoded);
    });
  }

  /**
   * Fires once when the socket closes or errors after open (including remote close).
   *
   * @param handler - Invoked once after the socket closes or errors post-open.
   * @returns Unsubscribe function.
   */
  public onSocketClosed(handler: () => void): () => void {
    return this.socketClosedTopic.subscribe(handler);
  }

  /**
   * Opens the WebSocket and completes the modeling session handshake (`modeling_session_data`).
   */
  public async initialize(): Promise<void> {
    return new Promise((resolve, reject) => {
      let resolved = false;
      let authTimeoutId: NodeJS.Timeout | undefined;

      const initializeAsync = async (): Promise<void> => {
        try {
          const url = new URL(this.baseUrl);
          url.searchParams.set('video_res_width', '256');
          url.searchParams.set('video_res_height', '256');

          const webSocketImpl = await getWebSocket();
          // oxlint-disable-next-line new-cap -- `WebSocket` implementation is a lowercase-bound constructor variable
          this.websocket = new webSocketImpl(url);
          this.websocket.binaryType = 'arraybuffer';

          authTimeoutId = setTimeout(() => {
            if (!resolved) {
              resolved = true;
              reject(new KclAuthError('Authentication timeout', 408));
            }
          }, authTimeout);

          this.initializationContext = {
            resolve,
            reject,
            resolved: false,
            authTimeoutId,
          };

          this.websocket.addEventListener('open', this.onWebSocketOpen);
          this.websocket.addEventListener('close', this.onWebSocketClose);
          this.websocket.addEventListener('error', this.onWebSocketError);
          this.websocket.addEventListener('message', this.onWebSocketMessage);
        } catch (error) {
          if (!resolved) {
            resolved = true;
            if (authTimeoutId !== undefined) {
              clearTimeout(authTimeoutId);
            }

            reject(KclError.simple({ kind: 'io', message: String(error) }));
          }
        }
      };

      void initializeAsync();
    });
  }

  /**
   * Sends a JSON-serialized WebSocket request frame.
   *
   * @param message - JSON-serializable modeling request frame.
   */
  public sendRaw(message: WebSocketRequest): void {
    log.req(JSON.stringify(message, null, 2));
    const wire = JSON.stringify(message);
    if (this.websocket?.readyState === 1) {
      this.websocket.send(wire);
    } else {
      throw KclError.simple({ kind: 'io', message: 'WebSocket not connected' });
    }
  }

  /**
   * Closes the socket, clears listeners, and rejects pending initialization.
   */
  public dispose(): void {
    this.detachWebSocket();
    const initContext = this.initializationContext;
    if (initContext && !initContext.resolved) {
      initContext.resolved = true;
      if (initContext.authTimeoutId !== undefined) {
        clearTimeout(initContext.authTimeoutId);
      }

      initContext.reject(KclConnectionError.webSocketFailed('Transport disposed'));
      this.initializationContext = undefined;
    }

    this.isConnected = false;
    this.pendingEngineMessages.length = 0;
    this.messageTopic.dispose();
    this.socketClosedTopic.dispose();
  }

  private detachWebSocket(): void {
    if (!this.websocket) {
      return;
    }

    this.websocket.removeEventListener('open', this.onWebSocketOpen);
    this.websocket.removeEventListener('close', this.onWebSocketClose);
    this.websocket.removeEventListener('error', this.onWebSocketError);
    this.websocket.removeEventListener('message', this.onWebSocketMessage);

    // 0 = CONNECTING, 1 = OPEN (browser and ws package)
    if (this.websocket.readyState === 0 || this.websocket.readyState === 1) {
      this.websocket.close();
    }

    this.websocket = undefined;
  }

  private dispatchToHandlers(raw: Uint8Array<ArrayBuffer>, decoded: WebSocketResponse): void {
    this.messageTopic.emit({ raw, decoded });
  }

  private flushPendingEngineMessages(): void {
    for (const pending of this.pendingEngineMessages) {
      this.dispatchToHandlers(pending.raw, pending.decoded);
    }

    this.pendingEngineMessages.length = 0;
  }

  private readonly onWebSocketOpen = (_event: Event): void => {
    log.debug('WebSocket open — awaiting modeling_session_data (auth via Tau API proxy / same-origin)');
  };

  private readonly onWebSocketClose = (event: CloseEvent): void => {
    log.debug('WebSocket disconnected', {
      code: event.code,
      reason: event.reason,
    });
    this.isConnected = false;
    this.pendingEngineMessages.length = 0;

    const initContext = this.initializationContext;
    if (initContext && !initContext.resolved) {
      initContext.resolved = true;
      if (initContext.authTimeoutId !== undefined) {
        clearTimeout(initContext.authTimeoutId);
      }

      initContext.reject(this.createConnectionError(event.code, event.reason));
      this.initializationContext = undefined;
    }

    this.detachWebSocket();
    this.socketClosedTopic.emit();
  };

  private createConnectionError(code: number, reason: string): KclError {
    // Tau billing gate codes (apps/api billing.constants.ts `zooCloseCodes`).
    // The wire reasons are enum-like markers — replace with user-facing copy.
    if (code === 4401) {
      return new KclAuthError('Sign in to Tau to use the Zoo kernel.', 401);
    }

    if (code === 4402) {
      return new KclAuthError(
        "You're out of Tau credits — add credits in Plans & Billing to keep modeling with Zoo.",
        402,
      );
    }

    if (code === 4403) {
      return new KclAuthError(
        'The Zoo kernel requires a Tau Pro subscription. Upgrade in Plans & Billing to continue.',
        403,
      );
    }

    if (code === 1006) {
      return KclConnectionError.apiUnavailable(
        'The connection was closed unexpectedly. Please check your network connection and try again.',
      );
    }

    if (code === 1001 || code === 1011) {
      return KclConnectionError.apiUnavailable(reason || 'The server is temporarily unavailable.');
    }

    if (code === 1008 || code === 1002) {
      return new KclAuthError(reason || 'Invalid Zoo API key. Please check that your Zoo API key is correct.', 401);
    }

    if (code === 1000) {
      return new KclAuthError('Invalid Zoo API key. Please check that your Zoo API key is correct.', 401);
    }

    return KclConnectionError.webSocketFailed(
      reason || `Connection closed with code ${code}. Please check your network and try again.`,
    );
  }

  private readonly onWebSocketError = (event: Event): void => {
    log.error('WebSocket error:', event);

    const initContext = this.initializationContext;
    if (initContext && !initContext.resolved) {
      initContext.resolved = true;
      if (initContext.authTimeoutId !== undefined) {
        clearTimeout(initContext.authTimeoutId);
      }

      if (event.target instanceof WebSocket) {
        const { readyState } = event.target;
        if (readyState === 0) {
          initContext.reject(
            KclConnectionError.apiUnavailable(
              'Unable to connect to the Zoo CAD API. Please check your network connection and ensure the service is accessible.',
            ),
          );
        } else {
          const readyStateText = ['CONNECTING', 'OPEN', 'CLOSING', 'CLOSED'][readyState] ?? 'UNKNOWN';
          initContext.reject(
            KclConnectionError.webSocketFailed(`Connection error occurred in state: ${readyStateText}`),
          );
        }
      } else {
        initContext.reject(
          KclConnectionError.apiUnavailable(
            'Failed to establish a WebSocket connection. The Zoo CAD API may be unavailable.',
          ),
        );
      }

      this.initializationContext = undefined;
    }
  };

  private decodeIncomingWebSocketFrame(
    event: MessageEvent,
  ): { raw: Uint8Array<ArrayBuffer>; decoded: WebSocketResponse } | undefined {
    if (event.data instanceof ArrayBuffer) {
      const raw = new Uint8Array(event.data);
      const decoded = msgpackDecode(raw) as WebSocketResponse;
      if (decoded.request_id !== undefined) {
        decoded.request_id = binaryToUuid(decoded.request_id);
      }

      log.debug('Received binary msgpack message, deserialized successfully');
      return { raw, decoded };
    }

    if (typeof event.data === 'string') {
      const decoded = JSON.parse(event.data) as WebSocketResponse;
      const raw = new Uint8Array(msgpackEncode(decoded));
      return { raw, decoded };
    }

    log.warn('Received unknown message type:', typeof event.data);
    return undefined;
  }

  private tryCompleteAuthHandshake(decoded: WebSocketResponse): boolean {
    const initContext = this.initializationContext;
    if (
      !initContext ||
      initContext.resolved ||
      !('success' in decoded) ||
      !decoded.success ||
      decoded.resp.type !== 'modeling_session_data'
    ) {
      return false;
    }

    log.debug('Authentication successful');
    initContext.resolved = true;
    this.isConnected = true;
    if (initContext.authTimeoutId !== undefined) {
      clearTimeout(initContext.authTimeoutId);
    }

    initContext.resolve();
    this.initializationContext = undefined;
    return true;
  }

  private dispatchDecodedMessage(
    raw: Uint8Array<ArrayBuffer>,
    decoded: WebSocketResponse,
    becameConnected: boolean,
  ): void {
    if (becameConnected) {
      this.dispatchToHandlers(raw, decoded);
      this.flushPendingEngineMessages();
      return;
    }

    if (this.isConnected) {
      this.dispatchToHandlers(raw, decoded);
      return;
    }

    this.pendingEngineMessages.push({ raw, decoded });
  }

  private readonly onWebSocketMessage = (event: MessageEvent): void => {
    const parsed = this.decodeIncomingWebSocketFrame(event);
    if (!parsed) {
      return;
    }

    const { raw, decoded } = parsed;
    log.res('Received message:', decoded.request_id);
    const becameConnected = this.tryCompleteAuthHandshake(decoded);
    this.dispatchDecodedMessage(raw, decoded, becameConnected);

    if (!decoded.success && decoded.errors[0]?.error_code === 'auth_token_missing') {
      log.debug('Received auth_token_missing - ignoring as auth may succeed later');
    }
  };
}
