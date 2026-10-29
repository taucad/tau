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
import { maximumPostedReceiptLength } from '#api/git/forwarding/contract/receipt.js';
import { GitRepositoryService } from '#api/git/git.service.js';

/**
 * Posts one address may make per window. tau-storage posts two receipts per
 * compaction it runs after a reply — the compaction's `commit` and its sweep's
 * `retained` — where it posted one per compacting push before compaction
 * moved off the reply, so the budget doubled with it (240 from 120). At the
 * observed 13% of pushes compacting, that is still ~900 pushes a minute from
 * one storage address before a `429`, which the poster waits out
 * (`Retry-After`); it only bounds what a caller replaying receipts can make
 * the API re-read.
 */
export const receiptPostsPerWindow = 240;

/** The receipt route's window, in seconds. */
export const receiptPostWindowSeconds = 60;

/**
 * The receipt route (DC1): where tau-storage posts a receipt nothing was
 * waiting for — a deferred compaction's `commit`, and the `retained` bytes a
 * compacting commit's sweep kept (D18). Every other receipt rides back on the
 * response it follows. A body is at most {@link maximumPostedReceiptLength}.
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
