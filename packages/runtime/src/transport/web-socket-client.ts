/**
 * WebSocket transport — client factory (browser-safe).
 *
 * Dials a {@link webSocketHost} over two sockets: `/runtime` carries the
 * runtime wire, and `/fs` carries the consumer's own filesystem served back
 * to the remote kernel (W2). There is no multiplexer: `sessionKey` never
 * crosses the wire, so two channels on one socket would consume each
 * other's frames — the two sockets are correlated by a transport-private
 * `session` query id instead.
 *
 * The transport owns socket construction. A public `{ socket }` option is
 * Antipattern 5 (`docs/policy/library-api-policy.md`), and it is also
 * unimplementable: `wrapWebSocket` must attach its listener before the
 * server's hello lands, which only the dialer can guarantee.
 *
 * @public
 */

import { createChannelClient, wrapMessagePort, wrapWebSocket } from '@taucad/rpc';
import type { Channel, Port, WebSocketLike } from '@taucad/rpc';
import { msgpackCodec } from '@taucad/rpc/codec/msgpack';
import type { Geometry } from '@taucad/types';

import { runtimeProtocolSchemas } from '#types/runtime-protocol.schemas.js';
import type {
  GeometryTransport,
  RuntimeExportResultTransport,
  RuntimeInitializeResult,
  RuntimeProtocol,
} from '#types/runtime-protocol.types.js';
import type {
  RuntimeInitializeMemoryHandle,
  RuntimeInitializePayload,
  RuntimeTransportClient,
  RuntimeTransportCloseResult,
  TransportClientReady,
} from '#transport/runtime-transport.types.js';
import type { TransportDescriptor } from '#transport/runtime-transport-descriptor.types.js';
import { buildFileSystemBridge } from '#transport/_internal/file-system-bridge.js';
import { materialiseGeometry } from '#transport/_internal/geometry-materialiser.js';
import { materialiseExportResult } from '#transport/_internal/export-materialiser.js';
import { triggerRenderTimeout } from '#transport/_internal/abort-channel.js';
import { runtimeChannelSessionKey } from '#transport/_internal/runtime-worker-dispatcher.js';
import {
  buildSocketUrl,
  closeCauseFor,
  randomSessionId,
  webSocketCloseCode,
  webSocketId,
} from '#transport/_internal/web-socket-wire.js';
import type { WebSocketId } from '#transport/_internal/web-socket-wire.js';
import type { WebSocketTransportOptions } from '#transport/web-socket-transport.schemas.js';

type WebSocketConstructorLike = new (url: string) => WebSocketLike;

const noSocketImplementationMessage =
  'webSocketTransport: no WebSocket implementation available — pass `createSocket`, or install `ws` (Node < 22)';

/**
 * Non-literal specifier so browser bundlers never resolve `ws` into the
 * client graph; `testing/browser-import-graph.test.ts` pins that.
 */
const importOptionalModule = async (specifier: string): Promise<unknown> =>
  import(/* webpackIgnore: true */ /* @vite-ignore */ specifier);

const resolveSocketFactory = async (options: WebSocketTransportOptions): Promise<(url: string) => WebSocketLike> => {
  if (options.createSocket) {
    return options.createSocket;
  }
  /* The Zoo transport's constructor pick: global `WebSocket` (every browser,
   * Node >= 22) else the `ws` package. */
  const constructor =
    typeof WebSocket === 'undefined'
      ? ((await importOptionalModule('ws')) as { readonly WebSocket?: WebSocketConstructorLike }).WebSocket
      : (WebSocket as unknown as WebSocketConstructorLike);
  if (typeof constructor !== 'function') {
    throw new TypeError(noSocketImplementationMessage);
  }
  return (url) => Reflect.construct(constructor, [url]);
};

/**
 * Pure descriptor for WebSocket client options — no socket is dialled.
 *
 * @param options - Client options; same shape as {@link webSocketClient}.
 * @returns Diagnostic {@link TransportDescriptor}.
 * @public
 */
export const webSocketClientDescribe = (options: WebSocketTransportOptions): TransportDescriptor<WebSocketId> => ({
  id: webSocketId,
  wire: 'remote',
  memory: {
    geometryDelivery: 'copy',
    abortSignal: 'wire-notify',
  },
  fileSystem: options.fileSystem ? 'bridged' : 'host-local',
});

/**
 * Standalone client factory for the WebSocket transport. Compose into
 * {@link defineRuntimeTransport} via `web-socket-transport.ts`.
 *
 * @param options - Transport options; see {@link WebSocketTransportOptions}.
 * @returns The {@link RuntimeTransportClient} fat handle for the remote wire.
 * @public
 */
export const webSocketClient = (
  options: WebSocketTransportOptions,
): RuntimeTransportClient<RuntimeProtocol, Readonly<Record<never, never>>, WebSocketId> => {
  let openPromise: Promise<TransportClientReady> | undefined;
  let channel: Channel<RuntimeProtocol> | undefined;
  let runtimePort: Port<unknown> | undefined;
  let fileSystemPort: Port<unknown> | undefined;
  let fileSystemBridge: ReturnType<typeof buildFileSystemBridge>;
  let disposeFileSystemRelay: (() => void) | undefined;
  let isClosed = false;

  let resolveClosed: ((result: RuntimeTransportCloseResult) => void) | undefined;
  const closed = new Promise<RuntimeTransportCloseResult>((resolve) => {
    resolveClosed = resolve;
  });

  const finish = async (result: RuntimeTransportCloseResult): Promise<void> => {
    if (isClosed) {
      return;
    }
    isClosed = true;
    try {
      channel?.close(result.cause);
    } catch {
      /* Best-effort */
    }
    disposeFileSystemRelay?.();
    disposeFileSystemRelay = undefined;
    /* The `/fs` socket dies with the runtime socket; the reverse is not true
     * — a lone `/fs` failure leaves `closed` unsettled and surfaces as
     * rejected filesystem calls inside the remote kernel. */
    try {
      fileSystemPort?.close();
    } catch {
      /* Best-effort */
    }
    try {
      runtimePort?.close();
    } catch {
      /* Best-effort */
    }
    resolveClosed?.(result);
  };

  /** First cause wins: `finish` is guarded, so a late `close()` cannot overwrite. */
  const watchRuntimeSocket = (socket: WebSocketLike): void => {
    socket.addEventListener('close', (event: { readonly code?: number; readonly reason?: string }) => {
      void finish(closeCauseFor(event.code, event.reason));
    });
    socket.addEventListener('error', (event: { readonly error?: unknown; readonly message?: string }) => {
      const error =
        event.error instanceof Error ? event.error : new Error(event.message ?? 'web-socket transport failed');
      void finish({ cause: 'wire-failure', error });
    });
  };

  /**
   * The `/fs` socket has its own failure modes, and neither may throw out of a
   * socket listener (`ws` rethrows an unlistened `'error'`).
   *
   * A `1008` close is the host saying it owns its own filesystem while this
   * client advertises `bridged` — a topology mismatch the consumer must see, so
   * it settles the whole transport. Any other `/fs` death deliberately leaves
   * `closed` unsettled: the remote kernel's filesystem calls reject and the
   * failure surfaces as a render error while the runtime wire stays up.
   */
  const watchFileSystemSocket = (socket: WebSocketLike): void => {
    socket.addEventListener('close', (event: { readonly code?: number; readonly reason?: string }) => {
      disposeFileSystemRelay?.();
      disposeFileSystemRelay = undefined;
      if (event.code !== webSocketCloseCode.policyViolation) {
        return;
      }
      void finish({
        cause: 'wire-failure',
        error: new Error(
          `webSocketTransport: host rejected the filesystem socket (${event.reason ?? 'policy violation'}) — it serves its own filesystem, so this client must not pass \`fileSystem\``,
        ),
      });
    });
    socket.addEventListener('error', () => {
      disposeFileSystemRelay?.();
      disposeFileSystemRelay = undefined;
      try {
        fileSystemPort?.close();
      } catch {
        /* Best-effort */
      }
    });
  };

  const open = async (): Promise<TransportClientReady> => {
    if (openPromise) {
      return openPromise;
    }
    openPromise = (async () => {
      if (isClosed) {
        throw new Error('webSocketTransport: closed before open()');
      }
      const createSocket = await resolveSocketFactory(options);
      /* Minted here, not at materialisation: `crypto.randomUUID` throws in a
       * browser insecure context, and a `host-local` client that never dials
       * `/fs` should not pay for that at construction. */
      const session = randomSessionId();

      /* Both sockets are wrapped the moment they exist and before either
       * channel is constructed: `wrapWebSocket` buffers from wrap time, and
       * a frame that lands before the wrap is lost at the socket level. */
      const runtimeSocket = createSocket(buildSocketUrl(options.url, 'runtime', session));
      runtimePort = wrapWebSocket<unknown>(runtimeSocket, msgpackCodec);
      watchRuntimeSocket(runtimeSocket);

      fileSystemBridge = buildFileSystemBridge(options.fileSystem);
      if (fileSystemBridge) {
        const fileSystemSocket = createSocket(buildSocketUrl(options.url, 'fs', session));
        fileSystemPort = wrapWebSocket<unknown>(fileSystemSocket, msgpackCodec);
        watchFileSystemSocket(fileSystemSocket);
        const bridgePort = wrapMessagePort<unknown>(fileSystemBridge.port, { label: 'web-socket:filesystem' });
        const stopBridgeToSocket = bridgePort.onMessage((message) => {
          fileSystemPort?.postMessage(message);
        });
        const stopSocketToBridge = fileSystemPort.onMessage((message) => {
          bridgePort.postMessage(message);
        });
        bridgePort.start?.();
        let isRelayDisposed = false;
        disposeFileSystemRelay = () => {
          if (isRelayDisposed) {
            return;
          }
          isRelayDisposed = true;
          stopBridgeToSocket();
          stopSocketToBridge();
          fileSystemBridge?.dispose();
          fileSystemBridge = undefined;
        };
      }

      channel = createChannelClient<RuntimeProtocol>({
        port: runtimePort,
        sessionKey: runtimeChannelSessionKey,
        protocolSchemas: runtimeProtocolSchemas,
      });
      return { channel };
    })();
    return openPromise;
  };

  return {
    id: webSocketId,
    reservePreview() {
      return {};
    },
    renderTimeoutRecovery: {
      kind: 'terminable',
      abortRender(target): void {
        if (!channel) {
          return;
        }
        /* No SAB across a socket — wire notify only. */
        triggerRenderTimeout(channel, undefined, target);
      },
      async terminate(): Promise<void> {
        await finish({ cause: 'render-timeout' });
      },
    },
    describe(): TransportDescriptor<WebSocketId> {
      return webSocketClientDescribe(options);
    },
    open,
    async initialize(input: RuntimeInitializePayload): Promise<RuntimeInitializeResult> {
      if (!channel) {
        await open();
      }
      if (!channel) {
        throw new Error('webSocketTransport: channel unavailable after open()');
      }
      /* `memoryHandle.fileSystemPort` is a transferable wire field and cannot
       * cross a socket; the host binds the filesystem from the `/fs` socket. */
      const memoryHandle: RuntimeInitializeMemoryHandle = {};
      return channel.call('initialize', { ...input, memoryHandle });
    },
    async resolveGeometry(transport: GeometryTransport): Promise<Geometry> {
      return materialiseGeometry(transport, undefined);
    },
    async resolveExport(transport: RuntimeExportResultTransport) {
      return materialiseExportResult(transport, undefined);
    },
    async close(): Promise<void> {
      await finish({ cause: 'requested' });
    },
    closed,
  };
};

webSocketClient.describe = webSocketClientDescribe;
