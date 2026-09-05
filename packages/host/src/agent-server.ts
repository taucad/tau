/**
 * The daemon's third channel concern: `${pathPrefix}/agent`.
 *
 * `/runtime` and `/fs` already exist on the runtime child's `webSocketHost`,
 * each on its own socket — the two-sockets-per-concern ruling. The agent wire
 * is a third concern with its own socket, never multiplexed onto either, and it
 * is served here rather than inside `webSocketHost` because the agent host
 * lives in the daemon parent (it owns the workspace root and the paired
 * credential) while the runtime host lives in a permission-limited child.
 * `@taucad/runtime/transport/websocket-host` sanctions exactly this shape: it
 * re-exports its upgrade guards "for a consumer writing its own upgrade handler
 * beside this host".
 *
 * The wire is a `@taucad/rpc` channel with the msgpack codec carrying the T0
 * event-log vocabulary — byte-identical to what the browser worker speaks over
 * a MessagePort, so a client projection cannot tell the two apart.
 *
 * Nothing here owns run lifetime. A socket close tears down one channel and
 * leaves every run executing; a later client re-attaches with a cursor.
 */

import { timingSafeEqual } from 'node:crypto';
import { createServer } from 'node:http';
import type { IncomingMessage, Server as HttpServer, ServerResponse } from 'node:http';
import { hostname } from 'node:os';
import process from 'node:process';
import type { Duplex } from 'node:stream';

import { WebSocketServer } from 'ws';
import type { WebSocket } from 'ws';

import { isOriginAllowed } from '@taucad/runtime/transport/websocket-host';
import { serveAgentChannel } from '@taucad/agent-host/node-launcher';
import type { NodeAgentLauncher } from '@taucad/agent-host/node-launcher';

import { isolationHeaders, serveStaticUi } from '#static-ui.js';
import type { StaticUiHandler } from '#static-ui.js';

/** Cookie the daemon-served UI presents on its same-origin upgrade. @public */
export const hostSessionCookieName = 'tau_host_session';

/**
 * Same-origin discovery for rung 1.
 *
 * A page served by this daemon fetches this one path to learn that its own
 * origin is an agent host and which directory that host owns. It carries no
 * secret — admission still rides the `HttpOnly` session cookie — and it is
 * answered before the static UI, because a UI build has no such file and the
 * SPA fallback would otherwise hand the discovery fetch an HTML shell.
 *
 * @public
 */
export const hostDescriptorPath = '/.well-known/tau-host';

/** Milliseconds a socket has to answer the server's close frame. */
const closeGrace = 1000;

const refuseUpgrade = (socket: Duplex, status: string): void => {
  socket.write(`HTTP/1.1 ${status}\r\nConnection: close\r\nContent-Length: 0\r\n\r\n`);
  socket.destroy();
};

const constantTimeEquals = (supplied: string, expected: string): boolean => {
  const suppliedBytes = Buffer.from(supplied);
  const expectedBytes = Buffer.from(expected);
  return suppliedBytes.byteLength === expectedBytes.byteLength && timingSafeEqual(suppliedBytes, expectedBytes);
};

const bearerOf = (authorization: string | undefined): string =>
  authorization?.startsWith('Bearer ') ? authorization.slice('Bearer '.length) : '';

const cookieOf = (cookieHeader: string | undefined, name: string): string => {
  for (const part of cookieHeader?.split(';') ?? []) {
    const separator = part.indexOf('=');
    if (separator !== -1 && part.slice(0, separator).trim() === name) {
      return part.slice(separator + 1).trim();
    }
  }
  return '';
};

/** Options for {@link startAgentServer}. @public */
export type AgentServerOptions = {
  /** The always-on host answering the T0 vocabulary. */
  readonly launcher: NodeAgentLauncher;
  /**
   * Shared secret admitting an upgrade, as `Authorization: Bearer` (a Node
   * client, including the daemon's own relay splice) or as the
   * `tau_host_session` cookie the served UI was handed on its first HTML
   * response. At least 32 characters.
   */
  readonly token: string;
  /** Absolute workspace root this host owns; published on {@link hostDescriptorPath}. */
  readonly workspaceRoot: string;
  /** Human-readable name for this host. Defaults to the machine hostname. */
  readonly label?: string | undefined;
  /** Port to listen on. Defaults to `0` (ephemeral). */
  readonly port?: number | undefined;
  /**
   * Interface to bind. Defaults to `127.0.0.1` — a daemon is loopback-only.
   *
   * `TAU_HOST_AGENT_BIND` overrides the default for a caller that cannot pass
   * this option, which today is exactly one: a containerised host being driven
   * *directly* by a test on the machine outside it, with no relay in between. A
   * real cloud host never needs it — it reaches Tau by dialling out — so the
   * variable is deliberately absent from the image's own environment.
   */
  readonly host?: string | undefined;
  /** Path the route is mounted under: `${pathPrefix}/agent`. Defaults to `/`. */
  readonly pathPrefix?: string | undefined;
  /**
   * Extra exact-match browser origins. This server's *own* origins are always
   * admitted, so the rung-1 same-origin UI needs no configuration; a
   * cross-origin browser (rung 5, behind Local Network Access) must be listed.
   */
  readonly allowedOrigins?: readonly string[] | undefined;
  /** Absolute directory of a prebuilt Tau UI to serve at `/`. */
  readonly uiRoot?: string | undefined;
  /**
   * Host-local Tau MCP endpoint served at `${pathPrefix}/mcp` (X4).
   *
   * Answered ahead of the static UI, and admitted by its *own* run-scoped
   * capability rather than {@link AgentServerOptions.token}: this route's
   * secret travels into a vendor adapter's process.
   */
  readonly mcp?: { handle(request: IncomingMessage, response: ServerResponse): Promise<void> } | undefined;
  /** External ACP agents this daemon can start; published on {@link hostDescriptorPath}. */
  readonly externalAgents?: readonly string[] | undefined;
};

/** Handle returned by {@link startAgentServer}. @public */
export type AgentServerHandle = {
  readonly ready: Promise<void>;
  /** Bound address; throws until `ready` resolves. */
  address(): { readonly port: number; readonly host: string };
  /** `http://<host>:<port>` — the origin the served UI runs on. */
  url(): URL;
  close(): Promise<void>;
};

const routeOfPath = (pathname: string, pathPrefix: string): string | undefined => {
  const trimmed = pathPrefix.replaceAll(/^\/+|\/+$/gu, '');
  const base = trimmed === '' ? '/' : `/${trimmed}/`;
  return pathname.startsWith(base) ? pathname.slice(base.length) : undefined;
};

/**
 * Serve the agent channel — and optionally a prebuilt UI — on one loopback port.
 *
 * @param options - Launcher, admission secret, binding, and optional UI root.
 * @returns The {@link AgentServerHandle}.
 * @public
 *
 * @example <caption>Serve the agent channel on an ephemeral loopback port</caption>
 * ```typescript
 * import { randomBytes } from 'node:crypto';
 * import { startAgentServer } from '@taucad/host';
 * import type { NodeAgentLauncher } from '@taucad/agent-host/node-launcher';
 *
 * declare const launcher: NodeAgentLauncher;
 * const server = startAgentServer({
 *   launcher,
 *   token: randomBytes(32).toString('base64url'),
 *   workspaceRoot: process.cwd(),
 * });
 * await server.ready;
 * await server.close();
 * ```
 */
export const startAgentServer = (options: AgentServerOptions): AgentServerHandle => {
  if (options.token.length < 32) {
    throw new TypeError('startAgentServer: token must contain at least 32 characters');
  }
  const pathPrefix = options.pathPrefix ?? '/';
  const httpServer: HttpServer = createServer();
  const socketServer = new WebSocketServer({ noServer: true });
  const channels = new Set<ReturnType<typeof serveAgentChannel>>();
  const sockets = new Set<WebSocket>();
  const staticUi: StaticUiHandler | undefined = options.uiRoot
    ? serveStaticUi({ root: options.uiRoot, cookieName: hostSessionCookieName, cookieValue: options.token })
    : undefined;

  const ownOrigins = (): readonly string[] => {
    const bound = httpServer.address();
    if (bound === null || typeof bound === 'string') {
      return [];
    }
    const port = String(bound.port);
    return [`http://127.0.0.1:${port}`, `http://localhost:${port}`, `http://[::1]:${port}`];
  };

  const isAdmitted = (request: IncomingMessage): boolean => {
    const supplied = bearerOf(request.headers.authorization) || cookieOf(request.headers.cookie, hostSessionCookieName);
    return supplied !== '' && constantTimeEquals(supplied, options.token);
  };

  const serveAgentSocket = (socket: WebSocket): void => {
    sockets.add(socket);
    /* `ws` sockets are EventEmitters: an unlistened `'error'` throws out of the
     * event loop. Kill this socket only — never the daemon, and never a run. */
    socket.on('error', () => {
      socket.terminate();
    });
    /* The binding lives in the launcher, not here: the Electron services
     * utility hands the same launcher a `MessagePortMain` and gets the same
     * channel, so launcher 2 consumes this host rather than forking it. */
    const channel = serveAgentChannel(socket, options.launcher);
    channels.add(channel);
    socket.on('close', () => {
      sockets.delete(socket);
      channels.delete(channel);
      /* Disposing the channel ends this client's streams. The runs it started
       * keep executing: always-on lives in the launcher, not on this socket. */
      channel.dispose('agent socket closed');
    });
  };

  const onUpgrade = (
    request: IncomingMessage,
    socket: Duplex,
    head: Parameters<WebSocketServer['handleUpgrade']>[2],
  ): void => {
    const url = new URL(request.url ?? '/', 'http://localhost');
    if (routeOfPath(url.pathname, pathPrefix) !== 'agent') {
      refuseUpgrade(socket, '404 Not Found');
      return;
    }
    if (!isOriginAllowed(request.headers.origin, [...ownOrigins(), ...(options.allowedOrigins ?? [])])) {
      refuseUpgrade(socket, '403 Forbidden');
      return;
    }
    if (!isAdmitted(request)) {
      refuseUpgrade(socket, '401 Unauthorized');
      return;
    }
    socketServer.handleUpgrade(request, socket, head, (accepted) => {
      serveAgentSocket(accepted);
    });
  };

  const serveDescriptor = (request: IncomingMessage, response: ServerResponse): void => {
    if (request.method !== 'GET' && request.method !== 'HEAD') {
      response.writeHead(405, { ...isolationHeaders, allow: 'GET, HEAD' });
      response.end();
      return;
    }
    const body = JSON.stringify({
      v: 1,
      agent: true,
      label: options.label ?? hostname(),
      workspaceRoot: options.workspaceRoot,
      ...(options.externalAgents?.length ? { externalAgents: [...options.externalAgents] } : {}),
    });
    response.writeHead(200, {
      ...isolationHeaders,
      'content-type': 'application/json',
      'cache-control': 'no-store',
      'content-length': String(Buffer.byteLength(body)),
    });
    response.end(request.method === 'HEAD' ? undefined : body);
  };

  const onRequest = (request: IncomingMessage, response: ServerResponse): void => {
    /* Ahead of the static UI: the SPA fallback answers every extension-less path
     * with the shell, which would turn discovery into an HTML parse error, and
     * an MCP POST into a 200 nobody can parse. */
    const { pathname } = new URL(request.url ?? '/', 'http://localhost');
    if (pathname === hostDescriptorPath) {
      serveDescriptor(request, response);
      return;
    }
    const { mcp } = options;
    if (mcp && routeOfPath(pathname, pathPrefix) === 'mcp') {
      /* async-iife: bootstrap. The endpoint owns its own refusals; a throw here
       * would take the daemon down over one adapter's malformed frame. */
      const answer = async (): Promise<void> => {
        try {
          await mcp.handle(request, response);
        } catch {
          if (!response.headersSent) {
            response.writeHead(500, { 'content-type': 'application/json' });
          }
          response.end();
        }
      };
      void answer();
      return;
    }
    if (staticUi) {
      staticUi.handle(request, response);
      return;
    }
    response.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' });
    response.end('Tau Host serves only the /agent channel; start it with --ui to serve a UI.\n');
  };

  httpServer.on('upgrade', onUpgrade);
  httpServer.on('request', onRequest);

  const ready = new Promise<void>((resolve, reject) => {
    httpServer.once('error', reject);
    /* Node rethrows an unlistened `'error'`; `ready` only covers the listen
     * attempt, so keep a persistent listener for post-listen socket errors. */
    httpServer.on('error', () => undefined);
    httpServer.listen(options.port ?? 0, options.host ?? process.env['TAU_HOST_AGENT_BIND'] ?? '127.0.0.1', () => {
      resolve();
    });
  });

  const address = (): { readonly port: number; readonly host: string } => {
    const bound = httpServer.address();
    if (bound === null || typeof bound === 'string') {
      throw new Error('startAgentServer: server is not listening on a TCP port (await `ready` first)');
    }
    return { port: bound.port, host: bound.address };
  };

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
      socket.close(1001, 'host stopping');
    });
  };

  let closePromise: Promise<void> | undefined;

  return {
    ready,
    address,
    url: () => {
      const bound = address();
      const host = bound.host === '::' || bound.host === '0.0.0.0' ? '127.0.0.1' : bound.host;
      return new URL(`http://${host.includes(':') ? `[${host}]` : host}:${String(bound.port)}`);
    },
    async close(): Promise<void> {
      closePromise ??= (async () => {
        httpServer.off('upgrade', onUpgrade);
        httpServer.off('request', onRequest);
        await Promise.all([...sockets].map(async (socket) => closeSocket(socket)));
        await new Promise<void>((resolve) => {
          socketServer.close(() => {
            resolve();
          });
        });
        if (httpServer.listening) {
          await new Promise<void>((resolve) => {
            httpServer.close(() => {
              resolve();
            });
          });
        }
      })();
      return closePromise;
    },
  };
};
