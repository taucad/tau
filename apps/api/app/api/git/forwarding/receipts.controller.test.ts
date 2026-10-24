import { describe, expect, it, vi } from 'vitest';
import { HttpException } from '@nestjs/common';
import type { FastifyReply, FastifyRequest } from 'fastify';
import type { PublicationRateLimiterService } from '#api/publications/publication-rate-limiter.service.js';
import {
  StorageReceiptsController,
  receiptPostWindowSeconds,
  receiptPostsPerWindow,
} from '#api/git/forwarding/receipts.controller.js';
import type { GitRepositoryService } from '#api/git/git.service.js';

/** The public receipt route is rate limited per client address (DC1 review nit). */
describe('storage receipt route', () => {
  const build = (
    allowed: boolean,
  ): {
    controller: StorageReceiptsController;
    applyReceipt: ReturnType<typeof vi.fn>;
    consume: ReturnType<typeof vi.fn>;
    header: ReturnType<typeof vi.fn>;
    reply: FastifyReply;
  } => {
    const applyReceipt = vi.fn(async () => 'rejected');
    const consume = vi.fn(async () => ({ allowed, count: 1, retryAfterSeconds: 17 }));
    const header = vi.fn();
    const controller = new StorageReceiptsController(
      { applyReceipt } as unknown as GitRepositoryService,
      { consumeWindowBudget: consume } as unknown as PublicationRateLimiterService,
    );
    return { controller, applyReceipt, consume, header, reply: { header } as unknown as FastifyReply };
  };
  const request = { ip: '203.0.113.9' } as unknown as FastifyRequest;

  it('should apply a posted receipt within the address’s budget', async () => {
    const { controller, applyReceipt, consume, reply } = build(true);

    await expect(controller.receive({ receipt: 'r' }, request, reply)).resolves.toEqual({ accepted: true });
    expect(consume).toHaveBeenCalledWith({
      key: 'git:receipts:203.0.113.9',
      limit: receiptPostsPerWindow,
      windowSeconds: receiptPostWindowSeconds,
    });
    expect(applyReceipt).toHaveBeenCalledWith('r');
  });

  it('should answer 429 with Retry-After past the budget and read nothing', async () => {
    const { controller, applyReceipt, header, reply } = build(false);

    const refused = await controller.receive({ receipt: 'r' }, request, reply).catch((error: unknown) => error);
    expect(refused).toBeInstanceOf(HttpException);
    expect((refused as HttpException).getStatus()).toBe(429);
    expect(header).toHaveBeenCalledWith('retry-after', '17');
    expect(applyReceipt).not.toHaveBeenCalled();
  });
});
