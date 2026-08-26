/* oxlint-disable no-barrel-files/no-barrel-files -- public Node-only subpath barrel */

/**
 * Node-only remote host entry — `@taucad/runtime/transport/websocket-host`.
 *
 * Serves one kernel per connection over a `ws` server. The client half
 * lives at `@taucad/runtime/transport/websocket`; this subpath statically
 * imports `ws` and `node:http`, so a browser bundle must never touch it —
 * the same split as `/transport/web` ↔ `/transport/node`.
 *
 * Two routes, never multiplexed onto one socket (`pathPrefix` moves both):
 *
 *   - `/runtime?session=…` — the runtime wire;
 *   - `/fs?session=…` — the client's own filesystem, served *by the client*
 *     (inverted RPC roles) and consumed here as a bridge proxy. Only used
 *     when this host was started without a `fileSystem` of its own.
 *
 * @public
 */

import { createServer } from 'node:http';
import type { IncomingMessage, Server as HttpServer } from 'node:http';
import type { Duplex } from 'node:stream';
import { WebSocketServer } from 'ws';
import type { WebSocket } from 'ws';

import { wrapWebSocket } from '@taucad/rpc';
import type { ChannelServerHandle, Port } from '@taucad/rpc';
import { msgpackCodec } from '@taucad/rpc/codec/msgpack';

import type { KernelWorker } from '#framework/kernel-worker.js';
import type { RuntimeFileSystem } from '#filesystem/runtime-filesystem.js';
import type { RuntimeFileSystemBase } from '#types/runtime-kernel.types.js';
import type { RuntimeProtocol } from '#types/runtime-protocol.types.js';
import { createWorkerDispatcher } from '#transport/_internal/runtime-worker-dispatcher.js';
import { createWorkerFileSystemProxy } from '#transport/_internal/worker-filesystem-proxy.js';
import type { WorkerFileSystemProxy } from '#transport/_internal/worker-filesystem-proxy.js';
import { extractInlineFileSystem } from '#transport/_internal/runtime-filesystem-handle.js';
import { encodeGeometryAsOwnedCopy } from '#transport/_internal/owned-transfer-bytes.js';
import { installWorkerCrashTrap } from '#transport/_internal/worker-crash-trap.js';
import {
  createSessionPairing,
  fileSystemSocketLostCloseReason,
  isOriginAllowed,
  pairingTimeoutCloseReason,
  routeOf,
  unexpectedFileSystemSocketCloseReason,
  webSocketCloseCode,
} from '#transport/_internal/web-socket-wire.js';
import type { WebSocketRoute } from '#transport/_internal/web-socket-wire.js';

/* Upgrade-guard and close-classification helpers, re-exported for a consumer
 * (the `tau-agent` daemon) writing its own upgrade handler beside this host. */
export { closeCauseFor, isOriginAllowed } from '#transport/_internal/web-socket-wire.js';

/** How long a socket has to answer the host's close frame before it is destroyed. Milliseconds. */
const closeGrace = 1000;

/** Floor for the heartbeat interval — `0` would be a ping storm. Milliseconds. */
const minimumHeartbeat = 1000;

/** Refuse an upgrade without upgrading it. */
const refuseUpgrade = (socket: Duplex, status: string): void => {
  socket.write(`HTTP/1.1 ${status}\r\nConnection: close\r\nContent-Length: 0\r\n\r\n`);
  socket.destroy();
};

/**
 * Options accepted by {@link webSocketHost}.
 *
 * @public
 */
export type WebSocketHostOptions = {
  /**
   * Kernel worker factory, invoked **once per connection**. `initialize` is
   * one-shot per worker, so a shared instance would serve exactly one client.
   */
  readonly worker: () => KernelWorker;
  /**
   * Filesystem this host owns and exposes as runtime `/`. Its handle's
   * `create()` runs once **per connection**, so every client gets a fresh
   * adapter instance (`fromNodeFs` clients still share the one directory,
   * `fromMemoryFs` clients do not share stores). Omit to let each client serve
   * its own filesystem over the `/fs` socket.
   */
  readonly fileSystem?: RuntimeFileSystem;
  /**
   * Exact-match browser origin allowlist. A request carrying an `Origin`
   * header must match one; a request without one (any Node client) is
   * admitted. The default `[]` therefore denies every browser.
   */
  readonly allowedOrigins?: readonly string[];
  /**
   * Attach to an existing HTTP server instead of creating one. On a server it
   * does not own the host only answers its own two paths and **ignores** every
   * other upgrade, so another `WebSocketServer` on the same server can take it.
   */
  readonly server?: HttpServer;
  /**
   * Path the two routes are mounted under: `${pathPrefix}/runtime` and
   * `${pathPrefix}/fs`, matched exactly. Defaults to `'/'` (so `/runtime` and
   * `/fs`); leading and trailing slashes are normalised away.
   */
  readonly pathPrefix?: string;
  /**
   * Admission hook run after the origin check and before the upgrade, for a
   * host co-hosted behind someone else's credential (a pairing token on the
   * URL query, a `Sec-WebSocket-Protocol` value). `false` or a throw refuses
   * the upgrade with a raw `401`; there is no client→server hello frame.
   */
  readonly authorize?: (request: IncomingMessage) => boolean | Promise<boolean>;
  /**
   * Largest inbound frame, in bytes. Defaults to `ws`'s 100 MiB; a frame over
   * the ceiling closes the socket with `1009` rather than delivering it. There
   * is no chunking sub-protocol, so this bounds a single `readFile` result.
   */
  readonly maxPayload?: number;
  /** Port to listen on when this host owns its server. Defaults to `0` (ephemeral). */
  readonly port?: number;
  /** Interface to bind when this host owns its server. Defaults to `127.0.0.1`. */
  readonly host?: string;
  /** How long a `/runtime` socket waits for its `/fs` peer. Milliseconds; defaults to 10 s. */
  readonly pairingTimeout?: number;
  /** Ping interval used to detect silently dead peers. Milliseconds; defaults to 25 s. */
  readonly heartbeat?: number;
};

/**
 * Handle returned by {@link webSocketHost}.
 *
 * @public
 */
export type WebSocketHostHandle = {
  /** Resolves once the server is listening. */
  readonly ready: Promise<void>;
  /** Bound address; throws until `ready` resolves. */
  address(): { readonly port: number; readonly host: string };
  /** Close every connection with `1001`, then stop the server. */
  close(): Promise<void>;
};

/** One `/fs` socket parked for its `/runtime` peer. */
type PairedFileSystemSocket = {
  readonly socket: WebSocket;
  readonly port: Port<unknown>;
};

/**
 * Serve a kernel runtime over WebSockets, one worker per connection.
 *
 * @param options - Host options; see {@link WebSocketHostOptions}.
 * @returns The {@link WebSocketHostHandle} for address lookup and shutdown.
 * @public
 *
 * @example <caption>Serve a runtime on an ephemeral localhost port</caption>
 * ```typescript
 * import type { AnyRuntimeDefinition } from '@taucad/runtime/worker';
 * import { createRuntimeWorker } from '@taucad/runtime/worker';
 * import { fromNodeFs } from '@taucad/runtime/filesystem/node';
 * import { webSocketHost } from '@taucad/runtime/transport/websocket-host';
 *
 * declare const runtime: AnyRuntimeDefinition;
 *
 * const host = webSocketHost({
 *   worker: () => createRuntimeWorker({ runtime }),
 *   fileSystem: fromNodeFs(process.cwd()),
 * });
 * await host.ready;
 * ```
 */
export const webSocketHost = (options: WebSocketHostOptions): WebSocketHostHandle => {
  const ownsServer = options.server === undefined;
  const httpServer = options.server ?? createServer();
  /* `ws` spreads the caller's options over its defaults, so an explicit
   * `maxPayload: undefined` would clobber the 100 MiB default with "unlimited". */
  const socketServer = new WebSocketServer(
    options.maxPayload === undefined ? { noServer: true } : { noServer: true, maxPayload: options.maxPayload },
  );
  const allowedOrigins = options.allowedOrigins ?? [];
  const pairingTimeout = options.pairingTimeout ?? 10_000;
  const pairing = createSessionPairing<PairedFileSystemSocket>(pairingTimeout);

  /** Live sockets and their heartbeat liveness flag. */
  const liveness = new Map<WebSocket, { alive: boolean }>();
  const dispatchers = new Set<ChannelServerHandle<RuntimeProtocol>>();
  /** In-flight per-connection teardowns, so `close()` can await them. */
  const teardowns = new Set<Promise<void>>();

  /**
   * Run a connection teardown so host `close()` can await it, then forget it.
   *
   * @param teardown - The connection's disposer.
   */
  const trackTeardown = (teardown: () => Promise<void>): void => {
    const run = async (): Promise<void> => {
      try {
        await teardown();
      } finally {
        teardowns.delete(tracked);
      }
    };
    const tracked = run();
    teardowns.add(tracked);
  };

  // oxlint-disable-next-line capitalized-comments -- Ponytail debt markers intentionally use the lowercase `ponytail:` tag.
  /* ponytail: one process-level crash trap for the whole host, disposing
   * every live dispatcher — per-connection traps would add a pair of
   * `process` listeners per client and trip Node's max-listeners warning. */
  const removeCrashTrap = installWorkerCrashTrap({
    dispose(reason?: string): void {
      for (const dispatcher of dispatchers) {
        dispatcher.dispose(reason);
      }
    },
  });

  const track = (socket: WebSocket): void => {
    liveness.set(socket, { alive: true });
    socket.on('pong', () => {
      const state = liveness.get(socket);
      if (state) {
        state.alive = true;
      }
    });
    /* `ws` sockets are EventEmitters: an unlistened `'error'` (one malformed
     * frame is enough) throws out of the event loop, where the process-level
     * crash trap would tear down *every* session. Kill this socket only.
     *
     * Exception: an over-`maxPayload` frame. `ws` has already sent a `1009`
     * close frame from its own receiver error handler and armed its close
     * timer, so `terminate()` here would only race the flush and leave the
     * peer with a bare `1006`. */
    socket.on('error', (error: Error & { code?: string }) => {
      if (error.code === 'WS_ERR_UNSUPPORTED_MESSAGE_LENGTH') {
        return;
      }
      socket.terminate();
    });
    socket.on('close', () => {
      liveness.delete(socket);
    });
  };

  /* A silently dead TCP peer never emits `close`; ping it and destroy the
   * ones that stopped answering (websocket-resilience.md). */
  const heartbeatTimer = setInterval(
    () => {
      for (const [socket, state] of liveness) {
        if (!state.alive) {
          socket.terminate();
          continue;
        }
        state.alive = false;
        socket.ping();
      }
    },
    Math.max(options.heartbeat ?? 25_000, minimumHeartbeat),
  );
  heartbeatTimer.unref();

  const serveFileSystemSocket = (session: string, socket: WebSocket): void => {
    track(socket);
    if (options.fileSystem) {
      socket.close(webSocketCloseCode.policyViolation, unexpectedFileSystemSocketCloseReason);
      return;
    }
    /* A parked socket that dies must not be handed to a later `/runtime`
     * connection — its bridge hello would never arrive and the connection
     * would wedge. */
    socket.on('close', () => {
      pairing.revoke(session);
    });
    /* Wrapped on arrival, not on claim: the client's bridge server posts its
     * hello during construction, and `wrapWebSocket` only buffers from wrap
     * time. */
    pairing.offer(session, { socket, port: wrapWebSocket<unknown>(socket, msgpackCodec) });
  };

  /** Never rejects: every failure closes this one connection, never the host. */
  const serveRuntimeSocket = async (session: string, socket: WebSocket): Promise<void> => {
    track(socket);
    /* Checked after every await. A socket that dies while we are pairing must
     * not leave a worker and dispatcher behind on a dead wire; `readyState` is
     * the socket's own truth, so no extra listener is needed to see it. */
    const isDead = (): boolean => socket.readyState !== socket.OPEN;
    const port = wrapWebSocket<unknown>(socket, msgpackCodec);

    let fileSystemProxy: WorkerFileSystemProxy | undefined;
    let pairedSocket: WebSocket | undefined;

    /** Give up on this connection before any worker exists. */
    const abandon = (code: number, reason: string): void => {
      try {
        fileSystemProxy?.dispose();
      } catch {
        /* Best-effort */
      }
      pairedSocket?.close(webSocketCloseCode.goingAway, reason);
      if (!isDead()) {
        socket.close(code, reason);
      }
    };

    try {
      let inlineFileSystem: RuntimeFileSystemBase;
      /* Minted per connection, so two clients never share mutable FS state. */
      const hostFileSystem = extractInlineFileSystem(options.fileSystem);
      if (hostFileSystem) {
        inlineFileSystem = hostFileSystem;
      } else {
        let paired: PairedFileSystemSocket;
        try {
          paired = await pairing.claim(session);
        } catch {
          abandon(webSocketCloseCode.policyViolation, pairingTimeoutCloseReason);
          return;
        }
        pairedSocket = paired.socket;
        if (isDead() || paired.socket.readyState !== paired.socket.OPEN) {
          // Either socket may already be gone by the time the pair resolves.
          abandon(webSocketCloseCode.goingAway, 'runtime socket closed');
          return;
        }
        /* The `/fs` socket can die on its own while the runtime wire stays up.
         * `Port` carries no close notification, so nothing else would ever
         * settle the bridge's in-flight calls or its watch streams and the
         * kernel would wedge on its next filesystem call. Disposing the proxy
         * rejects them, which is what surfaces as a render error. */
        paired.socket.once('close', () => {
          fileSystemProxy?.dispose();
        });
        /* The paired peer can die, or never serve its hello, between the pair
         * and the bridge handshake; bound the wait the same way pairing is. */
        const abandoned = new Promise<'abandoned'>((resolve) => {
          const timer = setTimeout(() => {
            resolve('abandoned');
          }, pairingTimeout);
          timer.unref();
          paired.socket.once('close', () => {
            resolve('abandoned');
          });
        });
        const proxyPromise = createWorkerFileSystemProxy({
          port: paired.port,
          dispose: () => {
            paired.socket.close();
          },
        });
        const outcome = await Promise.race([abandoned, proxyPromise]);
        if (outcome === 'abandoned') {
          // A proxy that resolves after the race lost is disposed, not leaked.
          trackTeardown(async () => {
            try {
              const lateProxy = await proxyPromise;
              lateProxy.dispose();
            } catch {
              /* Never settled or rejected: nothing to dispose. */
            }
          });
          abandon(webSocketCloseCode.policyViolation, fileSystemSocketLostCloseReason);
          return;
        }
        fileSystemProxy = outcome;
        inlineFileSystem = fileSystemProxy;
      }

      if (isDead()) {
        abandon(webSocketCloseCode.goingAway, 'runtime socket closed');
        return;
      }

      const worker = options.worker();
      const dispatcher = createWorkerDispatcher(worker, port, {
        inlineFileSystem,
        encodeGeometry: encodeGeometryAsOwnedCopy,
      });
      dispatchers.add(dispatcher);

      /** Drop this connection's dispatcher, filesystem proxy, paired socket and worker. */
      const disposeConnection = async (): Promise<void> => {
        dispatchers.delete(dispatcher);
        try {
          dispatcher.dispose('web-socket connection closed');
        } catch {
          /* Best-effort */
        }
        try {
          fileSystemProxy?.dispose();
        } catch {
          /* Best-effort */
        }
        try {
          pairedSocket?.close(webSocketCloseCode.goingAway, 'runtime socket closed');
        } catch {
          /* Best-effort */
        }
        try {
          await worker.cleanup();
        } catch {
          /* Best-effort */
        }
      };

      if (isDead()) {
        trackTeardown(disposeConnection);
        return;
      }
      socket.on('close', () => {
        trackTeardown(disposeConnection);
      });
    } catch (error) {
      /* A bad host filesystem handle, a throwing `worker()`, or an unavailable
       * bridge root: this connection dies, the rest of the host does not. */
      abandon(webSocketCloseCode.internalError, error instanceof Error ? error.message : String(error));
    }
  };

  /** An upgrade that passed routing, origin and session checks. */
  type RoutedUpgrade = {
    readonly request: IncomingMessage;
    readonly socket: Duplex;
    readonly head: Parameters<WebSocketServer['handleUpgrade']>[2];
    readonly route: WebSocketRoute;
    readonly session: string;
  };

  /** Hand a routed upgrade to `ws` and serve whichever route it named. */
  const acceptUpgrade = ({ request, socket, head, route, session }: RoutedUpgrade): void => {
    socketServer.handleUpgrade(request, socket, head, (accepted) => {
      if (route === 'fs') {
        serveFileSystemSocket(session, accepted);
        return;
      }
      void serveRuntimeSocket(session, accepted);
    });
  };

  /**
   * Run the `authorize` hook, then accept or refuse. Never rejects.
   *
   * @param upgrade - The routed upgrade awaiting admission.
   * @param authorize - The consumer's hook.
   */
  const authorizeUpgrade = async (
    upgrade: RoutedUpgrade,
    authorize: NonNullable<WebSocketHostOptions['authorize']>,
  ): Promise<void> => {
    let admitted = false;
    try {
      admitted = await authorize(upgrade.request);
    } catch {
      /* A throwing hook denies, exactly like `false`. */
    }
    if (admitted) {
      acceptUpgrade(upgrade);
      return;
    }
    refuseUpgrade(upgrade.socket, '401 Unauthorized');
  };

  /**
   * Route one HTTP upgrade onto the runtime or filesystem socket.
   *
   * A path that is not `${pathPrefix}/runtime` or `${pathPrefix}/fs` is 404ed
   * on a server this host owns, and **ignored** — not written to, not
   * destroyed — on a shared one, so a foreign `WebSocketServer` registered in
   * either order still gets its own upgrades.
   *
   * @param request - The upgrade request.
   * @param socket - The raw TCP socket being upgraded.
   * @param head - First bytes of the upgraded stream (`ws` owns them).
   */
  const onUpgrade = (
    request: IncomingMessage,
    socket: Duplex,
    head: Parameters<WebSocketServer['handleUpgrade']>[2],
  ): void => {
    const url = new URL(request.url ?? '/', 'http://localhost');
    const route = routeOf(url.pathname, options.pathPrefix);
    if (!route) {
      if (ownsServer) {
        refuseUpgrade(socket, '404 Not Found');
      }
      return;
    }
    if (!isOriginAllowed(request.headers.origin, allowedOrigins)) {
      refuseUpgrade(socket, '403 Forbidden');
      return;
    }
    const session = url.searchParams.get('session') ?? '';
    /* Every socket that will be paired needs an id. A `/runtime` socket on a
     * host that owns its filesystem never pairs, so it may omit one. */
    if (session === '' && (route === 'fs' || !options.fileSystem)) {
      refuseUpgrade(socket, '400 Bad Request');
      return;
    }
    const { authorize } = options;
    if (authorize) {
      void authorizeUpgrade({ request, socket, head, route, session }, authorize);
      return;
    }
    acceptUpgrade({ request, socket, head, route, session });
  };

  httpServer.on('upgrade', onUpgrade);

  const ready = new Promise<void>((resolve, reject) => {
    if (!ownsServer) {
      if (httpServer.listening) {
        resolve();
        return;
      }
      httpServer.once('listening', () => {
        resolve();
      });
      httpServer.once('error', reject);
      return;
    }
    httpServer.once('error', reject);
    /* Node rethrows an unlistened `'error'`; `ready` only covers the listen
     * attempt, so keep a persistent listener for post-listen socket errors. */
    httpServer.on('error', () => undefined);
    httpServer.listen(options.port ?? 0, options.host ?? '127.0.0.1', () => {
      resolve();
    });
  });

  const closeSocket = async (socket: WebSocket): Promise<void> => {
    if (socket.readyState === socket.CLOSED) {
      return;
    }
    await new Promise<void>((resolve) => {
      const timer = setTimeout(() => {
        socket.terminate();
        resolve();
      }, closeGrace);
      socket.once('close', () => {
        clearTimeout(timer);
        resolve();
      });
      socket.close(webSocketCloseCode.goingAway, 'host closing');
    });
  };

  let closePromise: Promise<void> | undefined;

  return {
    address() {
      const bound = httpServer.address();
      if (bound === null || typeof bound === 'string') {
        throw new Error('webSocketHost: server is not listening on a TCP port (await `ready` first)');
      }
      return { port: bound.port, host: bound.address };
    },
    async close(): Promise<void> {
      closePromise ??= (async () => {
        clearInterval(heartbeatTimer);
        removeCrashTrap();
        pairing.dispose();
        httpServer.off('upgrade', onUpgrade);
        await Promise.all([...liveness.keys()].map(async (socket) => closeSocket(socket)));
        /* Each socket close queues its connection's teardown; drain them so
         * `close()` really means "no worker, dispatcher or watcher is left". */
        await Promise.all(teardowns);
        await new Promise<void>((resolve) => {
          socketServer.close(() => {
            resolve();
          });
        });
        if (ownsServer && httpServer.listening) {
          await new Promise<void>((resolve) => {
            httpServer.close(() => {
              resolve();
            });
          });
        }
      })();
      return closePromise;
    },
    ready,
  };
};
