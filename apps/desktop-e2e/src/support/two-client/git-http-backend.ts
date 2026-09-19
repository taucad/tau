/**
 * A real third-party git remote for the W18 round-trip: `git http-backend`
 * behind a small `node:http`, over a bare repository in a caller-owned
 * `mktemp` directory.
 *
 * Not the same fixture as `packages/revisions/src/test/git-http-backend.ts`,
 * and deliberately so: that one proves the *transport* (LFS batch, refused
 * refs, held sockets) inside the package, and this one proves the *product*
 * round-trip AC18 names — `git update-server-info` on every push so the dumb
 * HTTP URL clones with stock git, and CORS so a real browser page can reach it
 * at all. The Tau API's own proxy cannot stand in here: `GitProxyController`
 * refuses `http:` and every loopback and private address by design, so the
 * browser leg against a local remote is direct and the proxy hop is the
 * env-gated GitHub run.
 *
 * Test support only. It spawns `git` in the directory the caller hands it and
 * never writes anywhere else; the repository it creates is a fixture, not a
 * checkout of anything in this workspace.
 */

/* eslint-disable @typescript-eslint/naming-convention -- CGI environment variables and HTTP header names carry their own casing. */

import { spawn } from 'node:child_process';
import { chmod, mkdir, writeFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import type { IncomingMessage, Server, ServerResponse } from 'node:http';
import { join } from 'node:path';
import type { AddressInfo } from 'node:net';
import process from 'node:process';

const decoder = new TextDecoder();

/** One running third-party remote. */
export type GitHttpBackendFixture = Readonly<{
  /** The smart-HTTP URL a client pushes and fetches: `http://127.0.0.1:<port>/<name>.git`. */
  url: string;
  /** The bare repository on disk, for the assertions a client cannot make. */
  repositoryPath: string;
  /** Run `git` inside the bare repository and return its trimmed stdout. */
  git: (args: readonly string[]) => Promise<string>;
  /** Every request line it served, in order. */
  trail: () => readonly string[];
  /** Every `Authorization` value it saw — the credential must travel as a header. */
  authorizations: () => readonly string[];
  /** Every `x-tau-proxy-authorization` value it saw, if a proxy forwarded one. */
  proxyAuthorizations: () => readonly string[];
  close: () => Promise<void>;
}>;

/** How one remote is created. */
export type GitHttpBackendOptions = Readonly<{
  /** A `mktemp` directory this fixture may create its repository in. */
  root: string;
  /** Repository name without `.git`. Defaults to `remote`. */
  name?: string;
  /** Answer CORS preflights and echo the origin, so a browser page can reach it directly. */
  cors?: boolean;
}>;

const run = async (args: readonly string[], cwd: string): Promise<string> =>
  new Promise((resolve, reject) => {
    const child = spawn('git', [...args], { cwd, stdio: ['ignore', 'pipe', 'pipe'] });
    const out: Array<Uint8Array<ArrayBuffer>> = [];
    const failure: Array<Uint8Array<ArrayBuffer>> = [];
    child.stdout.on('data', (chunk: Uint8Array<ArrayBuffer>) => out.push(chunk));
    child.stderr.on('data', (chunk: Uint8Array<ArrayBuffer>) => failure.push(chunk));
    child.on('error', reject);
    child.on('close', (code) => {
      if (code === 0) {
        resolve(decoder.decode(Buffer.concat(out)).trim());
        return;
      }
      reject(new Error(`git ${args.join(' ')} failed: ${decoder.decode(Buffer.concat(failure))}`));
    });
  });

/** Where the CGI header block ends: the first CRLF CRLF in the bytes. */
const headerEnd = (payload: Uint8Array<ArrayBuffer>): number => {
  for (let index = 0; index + 3 < payload.length; index += 1) {
    if (payload[index] === 13 && payload[index + 1] === 10 && payload[index + 2] === 13 && payload[index + 3] === 10) {
      return index;
    }
  }
  return -1;
};

/** `git http-backend` is a CGI program: headers, a blank line, then the body. */
const respondCgi = (response: ServerResponse, payload: Uint8Array<ArrayBuffer>): void => {
  const separator = headerEnd(payload);
  const head = separator === -1 ? '' : decoder.decode(payload.subarray(0, separator));
  const body = separator === -1 ? payload : payload.subarray(separator + 4);
  let status = 200;
  for (const line of head.split('\r\n')) {
    const colon = line.indexOf(':');
    if (colon === -1) {
      continue;
    }
    const name = line.slice(0, colon).trim();
    const value = line.slice(colon + 1).trim();
    if (name.toLowerCase() === 'status') {
      status = Number.parseInt(value, 10);
      continue;
    }
    response.setHeader(name, value);
  }
  response.writeHead(status);
  response.end(body);
};

/**
 * Start a third-party git remote over a fresh bare repository.
 *
 * @param options - The `mktemp` root, the repository name and whether a browser must reach it.
 * @returns The running fixture.
 */
export const startGitHttpBackend = async (options: GitHttpBackendOptions): Promise<GitHttpBackendFixture> => {
  const name = options.name ?? 'remote';
  const repositoryPath = join(options.root, `${name}.git`);
  await mkdir(options.root, { recursive: true });
  await run(['init', '--bare', '--initial-branch=main', repositoryPath], options.root);
  await run(['config', 'http.receivepack', 'true'], repositoryPath);
  /* A bare repository refuses a push to the branch its own HEAD names unless
   * told otherwise; this one has no work tree to protect. */
  await run(['config', 'receive.denyCurrentBranch', 'ignore'], repositoryPath);
  /* AC18's second clause is a *stock* clone of the dumb-HTTP URL, and the dumb
   * protocol reads `info/refs` and `objects/info/packs` off disk. Git ships
   * exactly this hook for exactly this reason; running it once at creation is
   * not enough, because every push rewrites the refs it lists. */
  const postUpdate = join(repositoryPath, 'hooks', 'post-update');
  await writeFile(postUpdate, '#!/bin/sh\nexec git update-server-info\n');
  await chmod(postUpdate, 0o755);
  await run(['update-server-info'], repositoryPath);

  const trail: string[] = [];
  const authorizations: string[] = [];
  const proxyAuthorizations: string[] = [];

  const handle = (request: IncomingMessage, response: ServerResponse): void => {
    const requested = new URL(request.url ?? '/', 'http://127.0.0.1');
    trail.push(`${request.method ?? 'GET'} ${requested.pathname}`);
    const { authorization } = request.headers;
    if (authorization !== undefined) {
      authorizations.push(authorization);
    }
    const proxied = request.headers['x-tau-proxy-authorization'];
    if (typeof proxied === 'string') {
      proxyAuthorizations.push(proxied);
    }
    if (options.cors === true) {
      response.setHeader('access-control-allow-origin', request.headers.origin ?? '*');
      response.setHeader('access-control-allow-credentials', 'true');
      /* `git-protocol` is the one `isomorphic-git` adds for protocol v2, and it
       * is not CORS-safelisted: a remote that omits it from this list is
       * unreachable from any real browser page, preflight and all. */
      response.setHeader(
        'access-control-allow-headers',
        'authorization,content-type,git-protocol,x-tau-proxy-authorization',
      );
      response.setHeader('access-control-allow-methods', 'GET,POST,OPTIONS');
      response.setHeader(
        'access-control-expose-headers',
        'content-type,content-length,www-authenticate,cache-control,expires,pragma',
      );
      if (request.method === 'OPTIONS') {
        response.writeHead(204);
        response.end();
        return;
      }
    }
    const child = spawn('git', ['http-backend'], {
      cwd: options.root,
      env: {
        ...process.env,
        GIT_PROJECT_ROOT: options.root,
        GIT_HTTP_EXPORT_ALL: '1',
        PATH_INFO: requested.pathname,
        QUERY_STRING: requested.search.replace(/^\?/u, ''),
        REQUEST_METHOD: request.method ?? 'GET',
        REMOTE_USER: 'tau',
        REMOTE_ADDR: '127.0.0.1',
        ...(request.headers['content-type'] === undefined ? {} : { CONTENT_TYPE: request.headers['content-type'] }),
        ...(request.headers['content-length'] === undefined
          ? {}
          : { CONTENT_LENGTH: request.headers['content-length'] }),
        ...(request.headers['content-encoding'] === undefined
          ? {}
          : { HTTP_CONTENT_ENCODING: request.headers['content-encoding'] }),
      },
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    const chunks: Array<Uint8Array<ArrayBuffer>> = [];
    child.stdout.on('data', (chunk: Uint8Array<ArrayBuffer>) => chunks.push(chunk));
    child.on('close', () => {
      const total = chunks.reduce((sum, chunk) => sum + chunk.byteLength, 0);
      const payload = new Uint8Array(new ArrayBuffer(total));
      let offset = 0;
      for (const chunk of chunks) {
        payload.set(chunk, offset);
        offset += chunk.byteLength;
      }
      respondCgi(response, payload);
    });
    child.on('error', () => {
      response.writeHead(500);
      response.end();
    });
    request.pipe(child.stdin);
  };

  const server: Server = createServer(handle);
  await new Promise<void>((resolve) => {
    server.listen(0, '127.0.0.1', resolve);
  });
  const { port } = server.address() as AddressInfo;
  return Object.freeze({
    url: `http://127.0.0.1:${String(port)}/${name}.git`,
    repositoryPath,
    git: async (args: readonly string[]) => run(args, repositoryPath),
    trail: () => [...trail],
    authorizations: () => [...authorizations],
    proxyAuthorizations: () => [...proxyAuthorizations],
    close: async () =>
      new Promise<void>((resolve) => {
        server.close(() => {
          resolve();
        });
        server.closeAllConnections();
      }),
  });
};
