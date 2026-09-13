/**
 * A real git smart-HTTP server with an LFS batch endpoint, for the two legs to
 * prove their transport against.
 *
 * Both W11 lanes prove their own side against this rather than against each
 * other (P16, D27): it is `git http-backend` — the same CGI the Tau API will
 * spawn — behind a little `node:http`, so a push that works here is a push that
 * speaks the protocol, not one that agrees with a Tau stub. The LFS half is the
 * batch API's own shape (`basic` transfers, presigned-style hrefs), which is
 * what makes "one upload per object, before the ref that names it" observable
 * rather than asserted.
 *
 * Test support only: never bundled, and it spawns `git` in a `mktemp`
 * directory the caller owns.
 */

/* eslint-disable @typescript-eslint/naming-convention -- CGI environment variables and HTTP header names are SCREAMING_SNAKE_CASE and Train-Case by their own specifications, not by ours. */

import { spawn } from 'node:child_process';
import { chmod, mkdir, writeFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import type { IncomingMessage, Server, ServerResponse } from 'node:http';
import { join } from 'node:path';
import type { AddressInfo } from 'node:net';

const decoder = new TextDecoder();

/** One running fixture. @public */
export type GitHttpBackendFixture = Readonly<{
  /** The URL a client clones, fetches and pushes: `http://127.0.0.1:<port>/<name>.git`. */
  url: string;
  /** The bare repository on disk, for assertions a client cannot make. */
  repositoryPath: string;
  /** Run `git` in the bare repository and return its trimmed stdout. */
  git: (args: readonly string[]) => Promise<string>;
  /** Large objects this server holds, by oid. */
  objects: ReadonlyMap<string, Uint8Array<ArrayBuffer>>;
  /** How many object *transfers* it has accepted, which is not how many were offered. */
  uploadCount: () => number;
  /** Every request path it served, in order — the evidence for "objects before refs". */
  trail: () => readonly string[];
  /** Every `Authorization` header value it saw, to prove the credential is a header. */
  authorizations: () => readonly string[];
  /** Object ids a client verified, which is what the server counts against a plan (W11a §9.6). */
  verified: () => readonly string[];
  close: () => Promise<void>;
}>;

/** How one fixture is created. @public */
export type GitHttpBackendOptions = Readonly<{
  /** A `mktemp` directory this fixture may create its repository in. */
  root: string;
  /** Repository name without `.git`. Defaults to `project`. */
  name?: string;
  /**
   * A fully-qualified ref the `update` hook refuses.
   *
   * Per ref, not per push: `pre-receive` refuses the whole push, and the thing
   * the design needs to survive is one ref being refused while the rest land
   * (A39). A server refuses for its own reasons — entitlement, quota, the ref
   * allow-list — and this is how that reaches a client.
   */
  refusedRef?: string;
  /**
   * Set, the LFS batch endpoint answers `413` instead of issuing transfers.
   *
   * The object list is filled from the request, exactly as the Tau API does:
   * the server speaks in object ids because that is all the batch endpoint
   * knows (W11a §9.4/§9.5).
   */
  quotaRefusal?: Readonly<{ message: string; shortfallBytes: number; remainingBytes: number }>;
  /**
   * Hold every git request open without answering, until the client gives up.
   *
   * A remote that is *slow* is not a remote that is down, and it is the only way
   * to exercise a caller's own deadline: the socket stays open and the client's
   * abort is what ends it (W13 review 2 P36).
   */
  hold?: boolean;
  /**
   * Set, every git request without exactly this `Authorization` value is `401`.
   *
   * What makes "the session travels as a header" demonstrable rather than
   * asserted: a leg that does not carry it cannot push at all (P40).
   */
  requireAuthorization?: string;
}>;

const run = async (args: readonly string[], cwd: string): Promise<string> =>
  new Promise((resolve, reject) => {
    const child = spawn('git', [...args], { cwd, stdio: ['ignore', 'pipe', 'pipe'] });
    const out: Array<Uint8Array<ArrayBuffer>> = [];
    const error: Array<Uint8Array<ArrayBuffer>> = [];
    child.stdout.on('data', (chunk: Uint8Array<ArrayBuffer>) => out.push(chunk));
    child.stderr.on('data', (chunk: Uint8Array<ArrayBuffer>) => error.push(chunk));
    child.on('error', reject);
    child.on('close', (code) => {
      if (code === 0) {
        resolve(decoder.decode(Buffer.concat(out)).trim());
        return;
      }
      reject(new Error(`git ${args.join(' ')} failed: ${decoder.decode(Buffer.concat(error))}`));
    });
  });

/* Where the CGI header block ends: the first CRLF CRLF in the bytes. */
const headerEnd = (payload: Uint8Array<ArrayBuffer>): number => {
  for (let index = 0; index + 3 < payload.length; index += 1) {
    if (payload[index] === 13 && payload[index + 1] === 10 && payload[index + 2] === 13 && payload[index + 3] === 10) {
      return index;
    }
  }
  return -1;
};

/* `git http-backend` is a CGI program: headers, a blank line, then the body. */
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

const readBody = async (request: IncomingMessage): Promise<Uint8Array<ArrayBuffer>> => {
  const chunks: Array<Uint8Array<ArrayBuffer>> = [];
  let length = 0;
  for await (const chunk of request) {
    const bytes = chunk as Uint8Array<ArrayBuffer>;
    chunks.push(bytes);
    length += bytes.byteLength;
  }
  const body = new Uint8Array(new ArrayBuffer(length));
  let offset = 0;
  for (const chunk of chunks) {
    body.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return body;
};

/**
 * Start a `git http-backend` server over a fresh bare repository.
 *
 * @param options - Where to create it, its name, the ref its hook refuses and a quota refusal.
 * @returns The fixture, with the URL a client uses.
 * @public
 */
export const startGitHttpBackend = async (options: GitHttpBackendOptions): Promise<GitHttpBackendFixture> => {
  const name = options.name ?? 'project';
  const repositoryPath = join(options.root, `${name}.git`);
  await mkdir(options.root, { recursive: true });
  await run(['init', '--bare', '--initial-branch=main', repositoryPath], options.root);
  await run(['config', 'http.receivepack', 'true'], repositoryPath);
  /* A bare repository refuses a push to the branch its own HEAD names unless
   * told otherwise; this one has no work tree to protect. */
  await run(['config', 'receive.denyCurrentBranch', 'ignore'], repositoryPath);
  if (options.refusedRef !== undefined) {
    const hook = join(repositoryPath, 'hooks', 'update');
    await writeFile(
      hook,
      [
        '#!/bin/sh',
        `if [ "$1" = "${options.refusedRef}" ]; then`,
        '  echo "not allowed here" >&2',
        '  exit 1',
        'fi',
        'exit 0',
        '',
      ].join('\n'),
    );
    await chmod(hook, 0o755);
  }

  const objects = new Map<string, Uint8Array<ArrayBuffer>>();
  const trail: string[] = [];
  const authorizations: string[] = [];
  const verifiedOids: string[] = [];
  /* Per-fixture nonces: a client that echoes what the batch issued gets them
   * right, and a client that invents its own headers cannot. */
  const transferToken = `transfer-${String(Date.now())}`;
  const verifyToken = `verify-${String(Date.now())}`;
  let uploads = 0;
  let origin = '';

  const serveLfs = async (request: IncomingMessage, response: ServerResponse, pathname: string): Promise<boolean> => {
    if (pathname === `/${name}.git/info/lfs/objects/batch`) {
      const requested = await readBody(request);
      const body = JSON.parse(decoder.decode(requested)) as Readonly<{
        operation: 'upload' | 'download';
        objects: ReadonlyArray<Readonly<{ oid: string; size: number }>>;
      }>;
      if (options.quotaRefusal !== undefined && body.operation === 'upload') {
        response.writeHead(413, { 'Content-Type': 'application/vnd.git-lfs+json' });
        response.end(
          JSON.stringify({
            ...options.quotaRefusal,
            code: 'GIT_LFS_QUOTA_EXCEEDED',
            files: body.objects.map((object) => ({ oid: object.oid, size: object.size })),
          }),
        );
        return true;
      }
      response.writeHead(200, { 'Content-Type': 'application/vnd.git-lfs+json' });
      response.end(
        JSON.stringify({
          transfer: 'basic',
          objects: body.objects.map((object) => {
            const held = objects.has(object.oid);
            /* An object the store already holds gets no action at all, which is
             * how git-lfs makes a repeat upload cost one round trip and no
             * bytes — and how Tau proves "one upload per object". */
            if (body.operation === 'upload' && held) {
              return { oid: object.oid, size: object.size };
            }
            return {
              oid: object.oid,
              size: object.size,
              actions: {
                [body.operation]: {
                  href: `${origin}/lfs/${object.oid}`,
                  header: { 'X-Tau-Transfer': transferToken },
                },
                /* The verify action carries a header of its own, exactly as the
                 * Tau API's batch does for a bearer caller — a client that drops
                 * `verify.header` is refused below rather than silently passing. */
                ...(body.operation === 'upload'
                  ? { verify: { href: `${origin}/lfs/verify`, header: { 'X-Tau-Verify': verifyToken } } }
                  : {}),
              },
            };
          }),
        }),
      );
      return true;
    }
    if (pathname === '/lfs/verify') {
      /* The git-lfs accounting call: the server counts an object when the
       * client says it landed (W11a §9.6). It is a *Tau* route, not a presigned
       * one, so it is authenticated twice over — the session credential the
       * batch call carried, and the header the batch issued for this transfer.
       * W11a's route is inside an `@UseAuth()` controller, so a client that
       * sends the verify POST through a bare `fetch` is refused there too. */
      const verifying = await readBody(request);
      if (request.headers.authorization === undefined || request.headers['x-tau-verify'] !== verifyToken) {
        response.writeHead(401, { 'Content-Type': 'application/vnd.git-lfs+json' });
        response.end(JSON.stringify({ message: 'The verify call carried no Tau credential.' }));
        return true;
      }
      const { oid } = JSON.parse(decoder.decode(verifying)) as Readonly<{ oid: string }>;
      verifiedOids.push(oid);
      response.writeHead(200);
      response.end();
      return true;
    }
    const transfer = /^\/lfs\/(?<oid>[\da-f]{64})$/u.exec(pathname)?.groups?.['oid'];
    if (transfer === undefined) {
      return false;
    }
    if (request.method === 'PUT') {
      const body = await readBody(request);
      /* The presigned transfer is signed for exactly the headers the batch
       * issued; a client that drops them is not the client that was signed for. */
      if (request.headers['x-tau-transfer'] !== transferToken) {
        response.writeHead(400);
        response.end();
        return true;
      }
      const copied = new Uint8Array(new ArrayBuffer(body.byteLength));
      copied.set(body);
      objects.set(transfer, copied);
      uploads += 1;
      response.writeHead(200);
      response.end();
      return true;
    }
    const held = objects.get(transfer);
    if (held === undefined) {
      response.writeHead(404);
      response.end();
      return true;
    }
    response.writeHead(200, { 'Content-Type': 'application/octet-stream' });
    response.end(Buffer.from(held));
    return true;
  };

  const handle = async (request: IncomingMessage, response: ServerResponse): Promise<void> => {
    const requested = new URL(request.url ?? '/', 'http://127.0.0.1');
    trail.push(`${request.method ?? 'GET'} ${requested.pathname}`);
    const { authorization } = request.headers;
    if (authorization !== undefined) {
      authorizations.push(authorization);
    }
    if (options.requireAuthorization !== undefined && authorization !== options.requireAuthorization) {
      response.writeHead(401, { 'Content-Type': 'text/plain' });
      response.end('unauthorized');
      return;
    }
    if (await serveLfs(request, response, requested.pathname)) {
      return;
    }
    if (options.hold === true) {
      /* Answer nothing, ever: the request ends when the client aborts it, or
       * when this server is closed. */
      request.resume();
      await new Promise<void>((resolve) => {
        request.on('close', resolve);
        response.on('close', resolve);
      });
      return;
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
      },
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    const chunks: Array<Uint8Array<ArrayBuffer>> = [];
    child.stdout.on('data', (chunk: Uint8Array<ArrayBuffer>) => chunks.push(chunk));
    child.on('close', () => {
      const payload = new Uint8Array(new ArrayBuffer(chunks.reduce((total, chunk) => total + chunk.byteLength, 0)));
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

  const server: Server = createServer((request, response) => {
    // async-iife: bootstrap -- `node:http` hands this callback a sync signature.
    void (async (): Promise<void> => {
      try {
        await handle(request, response);
      } catch {
        response.writeHead(500);
        response.end();
      }
    })();
  });
  await new Promise<void>((resolve) => {
    server.listen(0, '127.0.0.1', resolve);
  });
  const { port } = server.address() as AddressInfo;
  origin = `http://127.0.0.1:${String(port)}`;
  return Object.freeze({
    url: `${origin}/${name}.git`,
    repositoryPath,
    git: async (args: readonly string[]) => run(args, repositoryPath),
    objects,
    uploadCount: () => uploads,
    trail: () => [...trail],
    authorizations: () => [...authorizations],
    verified: () => [...verifiedOids],
    close: async () =>
      new Promise<void>((resolve) => {
        server.close(() => {
          resolve();
        });
        server.closeAllConnections();
      }),
  });
};
