/* oxlint-disable new-cap, @typescript-eslint/consistent-type-imports -- NestJS decorators are factories and DI metadata needs runtime class imports */
import {
  BadRequestException,
  Body,
  Controller,
  HttpCode,
  HttpException,
  HttpStatus,
  Post,
  Req,
  Res,
} from '@nestjs/common';
import type { FastifyReply, FastifyRequest } from 'fastify';
import { PublicationRateLimiterService } from '#api/publications/publication-rate-limiter.service.js';
import { GitRepositoryService } from '#api/git/git.service.js';

/** The longest receipt this route reads: a `retained` receipt carries no oid list. */
const maximumPostedReceiptLength = 64 * 1024;

/**
 * Posts one address may make per window. tau-storage posts one receipt per
 * compacting sweep, so this is far above any real rate and only bounds what a
 * caller replaying receipts can make the API re-read.
 */
export const receiptPostsPerWindow = 120;

/** The receipt route's window, in seconds. */
export const receiptPostWindowSeconds = 60;

/**
 * The receipt route (DC1): where tau-storage posts a receipt nothing was
 * waiting for, which today is only the `retained` bytes a compacting commit's
 * sweep kept (D18). Every other receipt rides back on the response it follows.
 *
 * It carries no session: the receipt's signature, under a key only
 * tau-storage holds, is the authentication, and `applyReceipt` re-reads the
 * manifest before it changes a row. A forged, stale or replayed receipt is
 * counted and changes nothing; the answer is the same `202` either way, so
 * the route tells a caller nothing about what it holds. It is public, so each
 * client address gets {@link receiptPostsPerWindow} posts a minute before a
 * `429`. `req.body.receipt` is redacted from request logs.
 */
@Controller({ path: 'internal/storage', version: '1' })
export class StorageReceiptsController {
  public constructor(
    private readonly repositories: GitRepositoryService,
    private readonly rateLimiter: PublicationRateLimiterService,
  ) {}

  @Post('receipts')
  @HttpCode(202)
  public async receive(
    @Body() body: unknown,
    @Req() request: FastifyRequest,
    @Res({ passthrough: true }) reply: FastifyReply,
  ): Promise<{ accepted: true }> {
    const budget = await this.rateLimiter.consumeWindowBudget({
      key: `git:receipts:${request.ip}`,
      limit: receiptPostsPerWindow,
      windowSeconds: receiptPostWindowSeconds,
    });
    if (!budget.allowed) {
      void reply.header('retry-after', String(budget.retryAfterSeconds));
      throw new HttpException(
        { code: 'GIT_RECEIPT_RATE_LIMITED', message: 'Too many receipts; retry shortly.' },
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }
    const receipt = (body as { receipt?: unknown } | undefined)?.receipt;
    if (typeof receipt !== 'string' || receipt.length === 0 || receipt.length > maximumPostedReceiptLength) {
      throw new BadRequestException({ code: 'GIT_RECEIPT_MALFORMED', message: 'Post {receipt}.' });
    }
    await this.repositories.applyReceipt(receipt);
    return { accepted: true };
  }
}
