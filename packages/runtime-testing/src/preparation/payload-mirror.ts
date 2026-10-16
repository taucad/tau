// A loopback payload mirror over a seed directory: the one `node:http` server a surface's mirror test starts. It serves
// the seed layout (`blobs/sha256/<hex>`, `tau-seed.json`) on `127.0.0.1:0`, records every request, and can answer a
// path with a redirect or an error, so mirror order, no-fallback and redirect handling are observable from outside the
// process under test. Point `TAU_PAYLOAD_MIRROR` (or a host's `mirror.baseUrl`) at `url`, and put `127.0.0.1` in
// `NO_PROXY`: a runner's proxy would otherwise carry the loopback request.
import { createReadStream } from 'node:fs';
import { stat } from 'node:fs/promises';
import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import { join } from 'node:path';

/**
 * One request the mirror answered.
 * @public
 */
export type MirrorRequest = {
  readonly method: string;
  /** Mirror-relative path, such as `blobs/sha256/<hex>`. */
  readonly path: string;
  readonly status: number;
};

/**
 * How a path is answered instead of from the seed.
 * @public
 */
export type MirrorOverride =
  | { readonly status: number }
  | { readonly redirect: string; readonly status?: 301 | 302 | 307 | 308 };

/**
 * A running loopback mirror.
 * @public
 */
export type PayloadMirror = {
  /** Base URL with a trailing slash, such as `http://127.0.0.1:53124/`. */
  readonly url: string;
  /** Every request, in arrival order. */
  readonly requests: readonly MirrorRequest[];
  /**
   * Answer one mirror-relative path with a status or a redirect from now on.
   * @param path - Mirror-relative path, such as `blobs/sha256/<hex>`.
   * @param override - The answer.
   */
  override(path: string, override: MirrorOverride): void;
  /** Stop listening and drop open connections. */
  close(): Promise<void>;
  [Symbol.asyncDispose](): Promise<void>;
};

const servedPath = /^(?:blobs\/sha256\/[\da-f]{64}|tau-seed\.json)$/u;

/**
 * Start a loopback mirror over a seed directory (see `writeSeedDirectory`).
 * @param seed - Seed root it serves.
 * @returns The running mirror; close it in `afterEach` or with `await using`.
 * @public
 */
export const startPayloadMirror = async (seed: string): Promise<PayloadMirror> => {
  const requests: MirrorRequest[] = [];
  const overrides = new Map<string, MirrorOverride>();
  const answer = (method: string, path: string, status: number): number => {
    requests.push({ method, path, status });
    return status;
  };
  const server = createServer((request, response) => {
    const method = request.method ?? 'GET';
    const path = decodeURIComponent(new URL(request.url ?? '/', 'http://mirror.invalid').pathname.slice(1));
    const override = overrides.get(path);
    if (override !== undefined) {
      if ('redirect' in override) {
        response.writeHead(answer(method, path, override.status ?? 302), { location: override.redirect }).end();
      } else {
        response.writeHead(answer(method, path, override.status)).end();
      }
      return;
    }
    if (!servedPath.test(path) || (method !== 'GET' && method !== 'HEAD')) {
      response.writeHead(answer(method, path, 404)).end();
      return;
    }
    const file = join(seed, path);
    const serve = async (): Promise<void> => {
      let size: number;
      try {
        ({ size } = await stat(file));
      } catch {
        response.writeHead(answer(method, path, 404)).end();
        return;
      }
      response.writeHead(answer(method, path, 200), {
        'content-type': 'application/octet-stream',
        'content-length': String(size),
      });
      if (method === 'HEAD') {
        response.end();
        return;
      }
      createReadStream(file).pipe(response);
    };
    void serve();
  });
  await new Promise<void>((resolve) => {
    server.listen(0, '127.0.0.1', resolve);
  });
  const { port } = server.address() as AddressInfo;
  const close = async (): Promise<void> => {
    if (!server.listening) {
      return;
    }
    server.closeAllConnections();
    await new Promise<void>((resolve) => {
      server.close(() => {
        resolve();
      });
    });
  };
  return {
    url: `http://127.0.0.1:${String(port)}/`,
    requests,
    override(path, value) {
      overrides.set(path, value);
    },
    close,
    [Symbol.asyncDispose]: close,
  };
};
