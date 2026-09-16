/* oxlint-disable new-cap -- NestJS decorators are factories */
import { Catch, HttpException, Logger } from '@nestjs/common';
import type { ArgumentsHost } from '@nestjs/common';
import type { FastifyReply, FastifyRequest } from 'fastify';
import { HttpExceptionFilter } from '#filters/http-exception.filter.js';

/**
 * The one refusal shape stock git reads (N6).
 *
 * git prints the body of a failed HTTP request only when it is `text/plain`
 * (`show_http_message`), measured against git 2.55: the identical bytes under
 * `application/json` are discarded and the user is left with
 * `error: 403`. So an entitlement refusal, a quota refusal, a 404 and the three
 * busy 503s all reached a CLI user as a bare status code (review C7).
 *
 * A browser is told apart by `Origin`, which stock git never sends and a
 * `fetch` from the workspace always does: with it the caller keeps the JSON
 * envelope every other route answers, and the global filter is what writes it.
 *
 * Applied per route rather than to the whole controller, because git-lfs is
 * *not* stock git: it sends no `Origin` either, but it parses
 * `application/vnd.git-lfs+json` error bodies, and rewriting those as
 * `text/plain` would delete the sentence it already shows (`git-lfs.service.ts`
 * answers the over-quota batch in git-lfs's own shape with the D16 file list).
 */
@Catch()
export class GitProtocolExceptionFilter extends HttpExceptionFilter {
  readonly #logger = new Logger(GitProtocolExceptionFilter.name);

  /**
   * Answer a git-protocol refusal in the media type git will print.
   *
   * @param exception - The refusal to render.
   * @param host - The Nest arguments host for this request.
   * @returns Nothing.
   */
  public override catch(exception: unknown, host: ArgumentsHost): void {
    const context = host.switchToHttp();
    const request = context.getRequest<FastifyRequest>();
    const reply = context.getResponse<FastifyReply>();
    if (request.headers.origin !== undefined || !(exception instanceof HttpException) || reply.sent) {
      super.catch(exception, host);
      return;
    }

    const status = exception.getStatus();
    const body = exception.getResponse();
    const stated = typeof body === 'object' ? (body as { message?: unknown }).message : body;
    const message = typeof stated === 'string' ? stated : exception.message;
    this.#logger.warn({ status, message }, 'Git protocol refusal');
    void reply.status(status).header('content-type', 'text/plain; charset=utf-8').send(`${message}\n`);
  }
}
