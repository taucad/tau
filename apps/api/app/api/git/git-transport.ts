/* oxlint-disable new-cap -- NestJS decorators are factories */
import type { IncomingMessage, ServerResponse } from 'node:http';
import { Injectable } from '@nestjs/common';
import type { NestMiddleware } from '@nestjs/common';
import type { FastifyInstance } from 'fastify';

/**
 * Content types that stock git POSTs. Fastify refuses a body it has no parser for,
 * so the git module registers a pass-through: the handler wants the raw stream,
 * not a parsed body (a pack is hundreds of megabytes and goes straight into the
 * child's stdin).
 */
const gitRequestContentTypes = [
  'application/x-git-upload-pack-request',
  'application/x-git-receive-pack-request',
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
 * Stock git speaks HTTP Basic and nothing else. It sends no credential at all
 * on the first request and only asks its credential helper after a `401` that
 * carries a `WWW-Authenticate` challenge. This middleware is the whole of that
 * translation: the Basic password becomes the bearer token (or the API key
 * header) the existing `AuthGuard` already resolves, so the git endpoints add
 * no second auth path.
 *
 * A browser client authenticates with the Tau session cookie and never sees
 * the challenge.
 */
@Injectable()
export class GitBasicAuthMiddleware implements NestMiddleware {
  public use(request: IncomingMessage, response: ServerResponse, next: () => void): void {
    if (request.method === 'OPTIONS') {
      next();
      return;
    }

    const { authorization } = request.headers;
    if (authorization === undefined) {
      if (request.headers.cookie !== undefined) {
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

    next();
  }
}
