/* oxlint-disable new-cap -- NestJS decorators are factories */
import type { IncomingMessage, ServerResponse } from 'node:http';
import { Inject, Injectable } from '@nestjs/common';
import type { NestMiddleware } from '@nestjs/common';
import type { FastifyInstance } from 'fastify';
import { attachHostDevice } from '#auth/auth.guard.js';
import { DatabaseService } from '#database/database.service.js';
import { projectIdFromRepository } from '#api/git/git.constants.js';
import { hostGitCredentialPrefix, resolveHostGitCredential } from '#api/hosts/host-git-credential.js';

/**
 * Content types that stock git POSTs. Fastify refuses a body it has no parser for,
 * so the git module registers a pass-through: the handler wants the raw stream,
 * not a parsed body (a pack is hundreds of megabytes and goes straight into the
 * child's stdin). An LFS object PUT through the proxy relay is the same kind of
 * stream (D44).
 */
const gitRequestContentTypes = [
  'application/x-git-upload-pack-request',
  'application/x-git-receive-pack-request',
  'application/octet-stream',
] as const;

/** Git-lfs's own media type for the batch and verify requests. */
const lfsContentType = 'application/vnd.git-lfs+json';

export const registerGitContentTypeParsers = (fastify: FastifyInstance): void => {
  for (const contentType of gitRequestContentTypes) {
    if (fastify.hasContentTypeParser(contentType)) {
      continue;
    }
    fastify.addContentTypeParser(contentType, (_request, payload, done) => {
      done(null, payload);
    });
  }
  // Git-lfs POSTs its batch API as `application/vnd.git-lfs+json`, which is
  // JSON by another name; Fastify's own JSON parser reads it.
  if (!fastify.hasContentTypeParser(lfsContentType)) {
    fastify.addContentTypeParser(
      lfsContentType,
      { parseAs: 'string' },
      fastify.getDefaultJsonParser('ignore', 'ignore'),
    );
  }
};

/** `sk_…` is an API key; anything else is a session token (better-auth bearer). */
const apiKeyPrefix = 'sk_';

/**
 * What a cloud host's push credential may reach (D21): the read and write
 * halves of smart HTTP and git-lfs, which is `write` and never `owner` (I10).
 * An allowlist, so a verb added to the controller later — the audited ref
 * removal is the one today — refuses a host until it is named here.
 */
const hostGitEndpoints: ReadonlySet<string> = new Set([
  'GET info/refs',
  'POST git-upload-pack',
  'POST git-receive-pack',
  'POST info/lfs/objects/batch',
  'POST info/lfs/objects/verify',
]);

/** `/v1/git/<repository>/<endpoint>`, the only shape of path this middleware fronts. */
const gitRoutePattern = /\/git\/(?<repository>[^/]+)\/(?<endpoint>.+)$/u;

/**
 * Stock git speaks HTTP Basic and nothing else. It sends no credential at all
 * on the first request and only asks its credential helper after a `401` that
 * carries a `WWW-Authenticate` challenge. This middleware is the whole of that
 * translation: the Basic password becomes the bearer token (or the API key
 * header) the existing `AuthGuard` already resolves, so the git endpoints add
 * no second auth path.
 *
 * A browser client authenticates with the Tau session cookie and never sees
 * the challenge.
 *
 * It also resolves the third credential kind (D21): a cloud host's
 * repository-scoped push credential. Nothing but this middleware reads it, and
 * this middleware fronts the git routes alone, so every other route refuses it
 * (better-auth does not know the format). Here it is matched to the project in
 * the path — another project is `404`, as it is for a stranger — and to the
 * write endpoints, then handed to `AuthGuard` as the owner acting via that
 * device (EQ5). A revoked device resolves to nobody: `401`.
 */
@Injectable()
export class GitBasicAuthMiddleware implements NestMiddleware {
  public constructor(@Inject(DatabaseService) private readonly databaseService: DatabaseService) {}

  public async use(request: IncomingMessage, response: ServerResponse, next: () => void): Promise<void> {
    if (request.method === 'OPTIONS') {
      next();
      return;
    }

    const { authorization } = request.headers;
    if (authorization === undefined) {
      /* This 401 is written straight to the raw `ServerResponse`, so neither
         `@fastify/cors` nor `@fastify/helmet` runs on it — a signed-out browser
         `fetch` saw an opaque network failure rather than a readable 401 and
         could not tell "sign in again" from "the API is down" (review C8).
         Stock git never sends `Origin`, and it is the only client that needs
         the challenge at all, so a request that carries one goes to the guard,
         which answers through the whole chain. */
      if (request.headers.cookie !== undefined || request.headers.origin !== undefined) {
        next();
        return;
      }
      response.statusCode = 401;
      response.setHeader('www-authenticate', 'Basic realm="Tau"');
      response.setHeader('content-type', 'application/json; charset=utf-8');
      response.end(
        JSON.stringify({
          code: 'UNAUTHORIZED',
          message: 'Authentication required',
        }),
      );
      return;
    }

    if (authorization.slice(0, 6).toLowerCase() === 'basic ') {
      const decoded = Buffer.from(authorization.slice(6), 'base64').toString('utf8');
      const separator = decoded.indexOf(':');
      const password = separator === -1 ? '' : decoded.slice(separator + 1);
      if (password.length > 0) {
        if (password.startsWith(apiKeyPrefix)) {
          request.headers['x-api-key'] = password;
          delete request.headers.authorization;
        } else {
          request.headers.authorization = `Bearer ${password}`;
        }
      }
    }

    /* The header is left as it is: the LFS batch echoes it on the `verify`
     * action, and a host's verify is a git route like the rest. */
    const bearer = request.headers.authorization?.startsWith('Bearer ')
      ? request.headers.authorization.slice('Bearer '.length)
      : undefined;
    if (bearer?.startsWith(hostGitCredentialPrefix)) {
      /* Written raw, like the challenge above: an exception thrown from a
         Fastify middleware reaches the exception filter with the bare
         `ServerResponse`, which it cannot answer on, and the request hangs.
         That includes the lookup failing (RV-W10 F4): a database blip is a
         retryable 503, never a hung push. */
      const refusal = await this.admitHostDevice(request, bearer).catch(() => ({
        status: 503,
        retryAfterSeconds: 5,
        body: { code: 'SERVICE_UNAVAILABLE', message: 'Tau Cloud could not check this credential; retry shortly.' },
      }));
      if (refusal !== undefined) {
        response.statusCode = refusal.status;
        response.setHeader('content-type', 'application/json; charset=utf-8');
        if ('retryAfterSeconds' in refusal) {
          response.setHeader('retry-after', String(refusal.retryAfterSeconds));
        }
        response.end(JSON.stringify(refusal.body));
        return;
      }
    }

    next();
  }

  /**
   * Admit one request on a cloud host's push credential, or refuse it.
   *
   * @param request - The raw request, which carries the admission to `AuthGuard`.
   * @param credential - The presented credential.
   * @returns Nothing once admitted; otherwise the refusal: `401` for an unknown
   *   credential or a revoked device, `404` for any project but the host's own,
   *   `403` for an endpoint that needs more than `write`.
   */
  private async admitHostDevice(
    request: IncomingMessage,
    credential: string,
  ): Promise<{ status: number; body: { code: string; message: string } } | undefined> {
    const principal = await resolveHostGitCredential(this.databaseService, credential);
    if (principal === undefined) {
      return { status: 401, body: { code: 'UNAUTHORIZED', message: 'This credential is not valid.' } };
    }
    /* `originalUrl`: middie strips the path the middleware was mounted on from `url`. */
    const { originalUrl = request.url ?? '/' } = request as IncomingMessage & { originalUrl?: string };
    const route = gitRoutePattern.exec(new URL(originalUrl, 'http://api.invalid').pathname)?.groups;
    if (route?.['repository'] === undefined || projectIdFromRepository(route['repository']) !== principal.projectId) {
      /* The same answer a stranger gets from `ProjectAccessService`: a sibling
       * project's existence is not this credential's to learn. */
      return { status: 404, body: { code: 'PROJECT_NOT_FOUND', message: 'Project not found' } };
    }
    if (!hostGitEndpoints.has(`${request.method ?? ''} ${route['endpoint'] ?? ''}`)) {
      return { status: 403, body: { code: 'PROJECT_ROLE_INSUFFICIENT', message: 'This project needs owner access.' } };
    }
    attachHostDevice(request, principal);
    return undefined;
  }
}
