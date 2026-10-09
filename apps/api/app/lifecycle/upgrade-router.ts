/* oxlint-disable new-cap -- NestJS decorators use PascalCase */
import type { IncomingMessage, Server as HttpServer } from 'node:http';
import type { Duplex } from 'node:stream';
import { Injectable, Optional } from '@nestjs/common';
import { ShutdownService } from '#lifecycle/shutdown.service.js';
import { MetricsService } from '#telemetry/metrics.js';
import type { WsGateway, WsUpgradeRejection } from '#telemetry/metrics.js';

// oxlint-disable-next-line @typescript-eslint/no-restricted-types -- Node's `upgrade` event hands the handler a Buffer
export type UpgradeHandler = (request: IncomingMessage, socket: Duplex, head: Buffer) => void;

export type UpgradeRoute = {
  /** The `ws.gateway` label for refusals on this route. */
  readonly gateway: WsGateway;
  /** Whether this route owns a request path. Also runs on upgrades refused during shutdown, so it must be cheap and side-effect free. */
  readonly matches: (pathname: string) => boolean;
  /** Takes over the socket. */
  readonly handle: UpgradeHandler;
};

const refuse = (socket: Duplex, status: string): void => {
  socket.end(`HTTP/1.1 ${status}\r\nConnection: close\r\nContent-Length: 0\r\n\r\n`, () => {
    socket.destroy();
  });
};

/**
 * The one `'upgrade'` listener on the API's HTTP server.
 *
 * Node frees an upgraded socket's HTTP parser, so `closeAllConnections()` can
 * no longer reach it, yet `server.close()` waits for it: one socket nobody
 * closes holds a stop open until SIGKILL. Every upgrade therefore passes
 * through here, where it is tracked until it closes and {@link destroyAll}
 * can end it. A path no route claims is refused with 404; with separate
 * listeners that each returned for paths they did not own, such a socket was
 * never closed at all. Upgrades that arrive once the stop has begun are
 * refused with 503.
 */
@Injectable()
export class UpgradeRouter {
  readonly #routes: UpgradeRoute[] = [];
  readonly #sockets = new Set<Duplex>();
  #server: HttpServer | undefined;

  public constructor(
    @Optional() private readonly shutdown: ShutdownService = new ShutdownService(),
    @Optional() private readonly metrics: MetricsService = new MetricsService(),
  ) {}

  /**
   * Routes upgrades whose path `matches` to `handle`.
   *
   * @param server - The API's HTTP server; the first route attaches the listener.
   * @param route - The gateway, path filter and handler.
   */
  public route(server: HttpServer, route: UpgradeRoute): void {
    if (this.#server === undefined) {
      this.#server = server;
      server.on('upgrade', this.#dispatch);
    }
    this.#routes.push(route);
  }

  /**
   * Destroys every upgraded socket still open.
   *
   * @returns How many were destroyed.
   */
  public destroyAll(): number {
    const count = this.#sockets.size;
    for (const socket of this.#sockets) {
      socket.destroy();
    }
    return count;
  }

  /** A URL `new URL` cannot parse is claimed by no route, so it still reaches a clean refusal. */
  #find(request: IncomingMessage): UpgradeRoute | undefined {
    let pathname: string;
    try {
      ({ pathname } = new URL(request.url ?? '/', 'http://localhost'));
    } catch {
      return undefined;
    }
    return this.#routes.find((candidate) => candidate.matches(pathname));
  }

  #reject(gateway: WsUpgradeRejection['ws.gateway'], reason: 'server_shutdown' | 'unknown_route'): void {
    this.metrics.wsUpgradeRejections.add(1, { 'ws.gateway': gateway, reason } satisfies WsUpgradeRejection);
  }

  // oxlint-disable-next-line @typescript-eslint/no-restricted-types -- Node's `upgrade` event hands the handler a Buffer
  readonly #dispatch = (request: IncomingMessage, socket: Duplex, head: Buffer): void => {
    this.#sockets.add(socket);
    socket.once('close', () => {
      this.#sockets.delete(socket);
    });
    const route = this.#find(request);
    if (this.shutdown.signal.aborted) {
      this.#reject(route?.gateway ?? 'none', 'server_shutdown');
      refuse(socket, '503 Service Unavailable');
      return;
    }
    if (route === undefined) {
      this.#reject('none', 'unknown_route');
      refuse(socket, '404 Not Found');
      return;
    }
    route.handle(request, socket, head);
  };
}
