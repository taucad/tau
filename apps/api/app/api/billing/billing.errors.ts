import { HttpException, HttpStatus } from '@nestjs/common';
import { formatMicroUsd } from '@taucad/billing';

/**
 * Billing enforcement errors. All spend-blocking errors use HTTP 402 (mapped
 * to the `credits` chat-error category) so the landed resume UX renders; the
 * daily turn cap uses 429 → `rate_limit` (it is pacing, not balance).
 *
 * The INSUFFICIENT_CREDITS message doubles as the MID-STREAM carrier: the
 * agent stream's error transform only preserves `error.message`
 * (`toUIMessageStream` → `errorText`), so the µ$ amounts ride inside the
 * marker string and `error-normalizer.ts` re-extracts them — the same pattern
 * as `CONTEXT_COMPACTION_FAILED`.
 */
export class InsufficientCreditsError extends HttpException {
  public constructor(input: { balanceMicro: bigint; requiredMicro: bigint; chatId?: string }) {
    super(
      {
        message: `INSUFFICIENT_CREDITS: Your credit balance is $${formatMicroUsd(input.balanceMicro)} and this request needs about $${formatMicroUsd(input.requiredMicro)}. Add credits to continue. balanceMicro=${input.balanceMicro.toString()} requiredMicro=${input.requiredMicro.toString()}`,
        code: 'INSUFFICIENT_CREDITS',
        balanceMicro: input.balanceMicro.toString(),
        requiredMicro: input.requiredMicro.toString(),
        ...(input.chatId === undefined ? {} : { chatId: input.chatId }),
      },
      HttpStatus.PAYMENT_REQUIRED,
    );
  }
}

/**
 * AD19 kill switch: Free-tier AI is operationally disabled. Paid tiers are
 * never affected.
 */
export class FreeTierAiDisabledError extends HttpException {
  public constructor() {
    super(
      {
        message: 'AI features are temporarily unavailable on the Free plan. Upgrade to Pro for uninterrupted credits.',
        code: 'FREE_TIER_AI_DISABLED',
      },
      HttpStatus.PAYMENT_REQUIRED,
    );
  }
}

/**
 * Q1: the Free tier's 10-turn/day soft cap — pacing, not balance, hence 429.
 */
export class DailyTurnCapExceededError extends HttpException {
  public constructor(input: { cap: number }) {
    super(
      {
        message: `You've reached the Free plan's ${input.cap} chats for today. Come back tomorrow or upgrade to Pro for uncapped daily usage.`,
        code: 'FREE_TIER_DAILY_CAP',
        cap: input.cap,
      },
      HttpStatus.TOO_MANY_REQUESTS,
    );
  }
}
