import type { IncomingMessage, ServerResponse } from 'node:http';
import { pipeline } from 'node:stream/promises';
import { BadRequestException, HttpException, PayloadTooLargeException } from '@nestjs/common';
import { z } from 'zod';
import type { MetricsService } from '#telemetry/metrics.js';
import {
  encodeReceiptPrefix,
  framingHeader,
  outcomeHeader,
  receiptPrefixed,
  refusedOutcome,
} from '#api/git/forwarding/contract/framing.js';
import {
  dialectPath,
  grantHeader,
  memberHeader,
  membersPath,
  storageOperations,
  storagePath,
  verifyGrant,
} from '#api/git/forwarding/contract/grant.js';
import type { GrantRejection, StorageGrant, StorageOperation } from '#api/git/forwarding/contract/grant.js';
import type { VerificationKeys } from '#api/git/forwarding/contract/keys.js';
import { ReplayGuard } from '#api/git/forwarding/contract/replay-guard.js';
import type { StorageGitService } from '#api/git/worker/storage-git.service.js';
import { projectPreviewMaximumBytes } from '#api/projects/project-preview-key.js';

/**
 * The HTTP surface of tau-storage (DC1): one route per storage operation and two
 * health routes, on plain `node:http` so the worker's module graph holds no
 * Nest application, no database and no Redis (Z1).
 *
 * The grant is verified from the headers alone, before a byte of the body is
 * read (W9 Finding 2): a refused grant is answered `401` with an empty body
 * and the connection closed, so an unauthorised caller cannot make this
 * process buffer, hydrate or spawn anything.
 */

/** The API's `withLease` handle a git read's session is named by (review S1). */
const readSessionSchema = z.string().min(1).max(128);

/**
 * A git read's body: its command, the stdin `cat-file --batch` takes, the
 * generation it reads at and the session it joins; or the end of a session.
 */
const gitReadSchema = z.union([
  z.object({
    args: z.array(z.string().max(1024)).min(1).max(10_000),
    stdin: z
      .string()
      .max(8 * 1024 * 1024)
      .optional(),
    generation: z.number().int().nonnegative(),
    session: readSessionSchema.optional(),
  }),
  z.object({ session: readSessionSchema, end: z.literal(true) }),
]);

/** Room for a `cat-file --batch` list of every object a 50 MB publication can name. */
const gitReadBodyLimitBytes = 9 * 1024 * 1024;

/** A catalog preview's ceiling (`projectPreviewMaximumBytes`), read before the body is trusted. */
const previewBodyLimitBytes = projectPreviewMaximumBytes;

/**
 * Reads a small JSON body whole, refusing one past its bound.
 *
 * @param request - The request.
 * @param limit - The most bytes accepted.
 * @returns The body.
 */
const readBounded = async (request: IncomingMessage, limit: number): Promise<Uint8Array<ArrayBuffer>> => {
  const chunks: Array<Uint8Array<ArrayBuffer>> = [];
  let total = 0;
  for await (const chunk of request) {
    const bytes = chunk as Uint8Array<ArrayBuffer>;
    total += bytes.byteLength;
    if (total > limit) {
      throw new PayloadTooLargeException({ code: 'GIT_READ_REFUSED', message: 'The request body is too large.' });
    }
    chunks.push(bytes);
  }
  return new Uint8Array(Buffer.concat(chunks));
};

const parseJson = (raw: string): unknown => {
  try {
    return JSON.parse(raw) as unknown;
  } catch {
    return undefined;
  }
};

const routePattern = new RegExp(`^/v1/storage/([^/]+)/(${storageOperations.join('|')})$`, 'u');

/** What the handler needs. */
export type StorageServerOptions = {
  readonly service: StorageGitService;
  /** The API's grant verification keys (`TAU_STORAGE_GRANT_PUBLIC_KEYS`). */
  readonly grantKeys: VerificationKeys;
  readonly metrics: MetricsService;
  readonly logger: {
    warn(fields: Record<string, unknown>, message: string): void;
    error(fields: Record<string, unknown>, message: string): void;
  };
  /** Whether the process is stopping; readiness fails first so the proxy stops routing here. */
  readonly stopping: () => boolean;
  /**
   * The installed git's version, or `undefined` when this Machine has none
   * (DC3: the git probe lives here, not on tau-api). Readiness refuses
   * without it. Absent, readiness does not probe.
   */
  readonly gitVersion?: () => Promise<string | undefined>;
  /** This Machine's id (`FLY_MACHINE_ID`), sent on every response so tau-api knows who answered (DC2). */
  readonly member?: string;
  /** The deployed members tau-api ranks over (DC2), answered on `GET /v1/members`. */
  readonly members?: () => Promise<readonly string[]>;
  /** The grant contract version this build verifies; defaults to the current one. Tests set the mixed-fleet cases. */
  readonly grantVersion?: number;
  readonly replay?: ReplayGuard;
  readonly now?: () => number;
};

const refuse = (response: ServerResponse, error: unknown, logger: StorageServerOptions['logger']): void => {
  if (response.headersSent) {
    response.destroy();
    return;
  }
  if (error instanceof HttpException) {
    const body = error.getResponse();
    response.writeHead(error.getStatus(), {
      'content-type': 'application/json',
      [outcomeHeader]: refusedOutcome,
    });
    response.end(JSON.stringify(typeof body === 'string' ? { message: body } : body));
    return;
  }
  logger.error({ err: error }, 'A storage request failed');
  response.writeHead(500, { 'content-type': 'application/json', [outcomeHeader]: refusedOutcome });
  response.end(JSON.stringify({ code: 'GIT_STORAGE_ERROR', message: 'The storage service failed this request.' }));
};

/**
 * Builds the request handler.
 *
 * @param options - The service, the keys and the process's signals.
 * @returns A `node:http` request listener.
 */
export const createStorageRequestHandler = (
  options: StorageServerOptions,
): ((request: IncomingMessage, response: ServerResponse) => void) => {
  const replay = options.replay ?? new ReplayGuard();
  const now = options.now ?? Date.now;

  const serve = async ({
    request,
    response,
    grant,
    operation,
  }: {
    readonly request: IncomingMessage;
    readonly response: ServerResponse;
    readonly grant: StorageGrant;
    readonly operation: StorageOperation;
  }): Promise<void> => {
    const abort = new AbortController();
    response.once('close', () => {
      if (!response.writableFinished) {
        abort.abort();
      }
    });
    options.service.assertServable(grant);
    const gzipped = request.headers['content-encoding'] === 'gzip';
    switch (operation) {
      case 'git-upload-pack': {
        const result = await options.service.uploadPack({ grant, body: request, gzipped, abort: abort.signal });
        response.writeHead(200, {
          'content-type': 'application/x-git-upload-pack-result',
          'cache-control': 'no-cache',
          [framingHeader]: receiptPrefixed,
        });
        response.write(encodeReceiptPrefix(result.receipt));
        await pipeline(result.output, response);
        return;
      }
      case 'git-receive-pack': {
        const result = await options.service.receivePack({ grant, body: request, gzipped, abort: abort.signal });
        response.writeHead(200, {
          'content-type': 'application/x-git-receive-pack-result',
          'cache-control': 'no-cache',
          [framingHeader]: receiptPrefixed,
          'tau-storage-body-bytes': String(result.bodyBytes),
        });
        response.end(Buffer.concat([encodeReceiptPrefix(result.receipt), result.report]));
        return;
      }
      case 'remove-ref': {
        request.resume();
        const result = await options.service.removeRef(grant);
        response.writeHead(200, { 'content-type': 'application/json' });
        response.end(JSON.stringify(result));
        return;
      }
      case 'preview': {
        const bytes = await readBounded(request, previewBodyLimitBytes);
        const result = await options.service.putPreview(grant, bytes);
        response.writeHead(200, { 'content-type': 'application/json' });
        response.end(JSON.stringify(result));
        return;
      }
      case 'tombstone': {
        request.resume();
        const result = await options.service.tombstone(grant);
        response.writeHead(200, { 'content-type': 'application/json' });
        response.end(JSON.stringify(result));
        return;
      }
      case 'derive': {
        request.resume();
        const result = await options.service.derive(grant);
        response.writeHead(200, { 'content-type': 'application/json' });
        response.end(JSON.stringify(result));
        return;
      }
      case 'git-read': {
        const body = await readBounded(request, gitReadBodyLimitBytes);
        const parsed = gitReadSchema.safeParse(parseJson(new TextDecoder().decode(body)));
        if (!parsed.success) {
          throw new BadRequestException({
            code: 'GIT_READ_REFUSED',
            message: 'A git read names its arguments and generation.',
          });
        }
        if ('end' in parsed.data) {
          options.service.endReadSession(grant, parsed.data.session);
          response.writeHead(200, { 'content-type': 'application/octet-stream' });
          response.end();
          return;
        }
        const output = await options.service.gitRead(grant, parsed.data);
        response.writeHead(200, { 'content-type': 'application/octet-stream' });
        response.end(output);
      }
    }
  };

  /* A stopping process fails readiness first, so the proxy stops routing here;
     a Machine without git is drained by name rather than failing every RPC. */
  const serveReadiness = async (response: ServerResponse): Promise<void> => {
    const plain = { 'content-type': 'text/plain' };
    if (options.stopping()) {
      response.writeHead(503, plain).end('stopping');
      return;
    }
    if (options.gitVersion !== undefined) {
      /* A probe that threw is no evidence of git: not ready, never unanswered. */
      const git = await options.gitVersion().catch(() => undefined);
      if (git === undefined) {
        response.writeHead(503, plain).end('git is not installed');
        return;
      }
    }
    response.writeHead(200, plain).end('ok');
  };

  /* No grant: the dialect is what any git client reads from info/refs anyway. */
  const serveDialect = async (response: ServerResponse): Promise<void> => {
    try {
      const dialect = await options.service.dialect();
      response.writeHead(200, { 'content-type': 'application/json' }).end(JSON.stringify(dialect));
    } catch (error) {
      refuse(response, error, options.logger);
    }
  };

  const serveGranted = async (args: Parameters<typeof serve>[0]): Promise<void> => {
    try {
      await serve(args);
    } catch (error) {
      refuse(args.response, error, options.logger);
    }
  };

  const serveMembers = async (response: ServerResponse): Promise<void> => {
    try {
      const members = (await options.members?.()) ?? [];
      response.writeHead(200, { 'content-type': 'application/json' }).end(JSON.stringify({ members }));
    } catch (error) {
      refuse(response, error, options.logger);
    }
  };

  return (request, response) => {
    if (options.member !== undefined) {
      response.setHeader(memberHeader, options.member);
    }
    const { pathname } = new URL(request.url ?? '/', 'http://storage.internal');
    if (request.method === 'GET' && pathname === '/health/live') {
      response.writeHead(200, { 'content-type': 'text/plain' }).end('ok');
      return;
    }
    if (request.method === 'GET' && pathname === '/health/ready') {
      void serveReadiness(response);
      return;
    }
    if (request.method === 'GET' && pathname === membersPath) {
      void serveMembers(response);
      return;
    }
    if (request.method === 'GET' && pathname === dialectPath) {
      void serveDialect(response);
      return;
    }
    const match = routePattern.exec(pathname);
    if (match === null) {
      response.writeHead(404, { connection: 'close', 'content-length': '0' }).end();
      return;
    }
    const operation = match[2] as StorageOperation;
    const header = request.headers[grantHeader];
    const verified =
      typeof header === 'string'
        ? verifyGrant(header, {
            keys: options.grantKeys,
            method: request.method ?? '',
            path: pathname,
            now: now(),
            replay,
            ...(options.grantVersion === undefined ? {} : { version: options.grantVersion }),
          })
        : ({ ok: false, reason: 'malformed' } as const);
    /* The path the grant names must also be the one its own project builds,
       so a grant cannot carry facts for one project to another's path. */
    const crossed: GrantRejection = 'path';
    const reason = verified.ok
      ? storagePath(verified.grant.project, operation) === pathname
        ? undefined
        : crossed
      : verified.reason;
    if (!verified.ok || reason !== undefined) {
      options.metrics.gitGrantsRejected.add(1, { reason: reason ?? 'malformed' });
      options.logger.warn({ reason, operation }, 'A storage grant was refused before its body was read');
      response.writeHead(401, { connection: 'close', 'content-length': '0' }).end();
      return;
    }
    void serveGranted({ request, response, grant: verified.grant, operation });
  };
};
