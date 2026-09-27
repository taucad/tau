/* oxlint-disable new-cap -- NestJS decorators use PascalCase */
import type { IncomingMessage, Server as HttpServer } from 'node:http';
import type { Duplex } from 'node:stream';
import { Injectable, Optional } from '@nestjs/common';
import { ShutdownService } from '#lifecycle/shutdown.service.js';

// oxlint-disable-next-line @typescript-eslint/no-restricted-types -- Node's `upgrade` event hands the handler a Buffer
export type UpgradeHandler = (request: IncomingMessage, socket: Duplex, head: Buffer) => void;

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
  readonly #routes: Array<{ readonly matches: (pathname: string) => boolean; readonly handle: UpgradeHandler }> = [];
  readonly #sockets = new Set<Duplex>();
  #server: HttpServer | undefined;

  public constructor(@Optional() private readonly shutdown: ShutdownService = new ShutdownService()) {}

  /**
   * Routes upgrades whose path `matches` to `handle`.
   *
   * @param server - The API's HTTP server; the first route attaches the listener.
   * @param matches - Whether this route owns a request path.
   * @param handle - Takes over the socket.
   */
  public route(server: HttpServer, matches: (pathname: string) => boolean, handle: UpgradeHandler): void {
    if (this.#server === undefined) {
      this.#server = server;
      server.on('upgrade', this.#dispatch);
    }
    this.#routes.push({ matches, handle });
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

  // oxlint-disable-next-line @typescript-eslint/no-restricted-types -- Node's `upgrade` event hands the handler a Buffer
  readonly #dispatch = (request: IncomingMessage, socket: Duplex, head: Buffer): void => {
    this.#sockets.add(socket);
    socket.once('close', () => {
      this.#sockets.delete(socket);
    });
    if (this.shutdown.signal.aborted) {
      refuse(socket, '503 Service Unavailable');
      return;
    }
    const { pathname } = new URL(request.url ?? '/', 'http://localhost');
    const route = this.#routes.find((candidate) => candidate.matches(pathname));
    if (route === undefined) {
      refuse(socket, '404 Not Found');
      return;
    }
    route.handle(request, socket, head);
  };
}
