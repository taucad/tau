/* oxlint-disable new-cap -- NestJS Header is a decorator factory */
import { Controller, Get, Header, Param, Query, UseGuards } from '@nestjs/common';
import type { attemptReceiptSchema } from '@taucad/agent-host/wire';
import type { WireOperationReceipt } from '@taucad/billing';
import type { z } from 'zod';
import { BillingUsageService } from '#api/billing/billing-usage.service.js';
import { billingAccountClosedError, isBillingAccountClosed } from '#api/llm/llm-gateway.error.js';
import { LlmGatewayAuthGuard, LlmGatewayPrincipal } from '#api/llm/llm-gateway.guard.js';

/** The attempt route's answer: a receipt, or a key the lookup voided (GI-R3). */
export type AttemptLookupAnswer = WireOperationReceipt | { readonly state: 'not_found'; readonly voided: true };

/**
 * The owner-scoped attempt lookup, signed in as the model gateway is (RV5-F2): a paired daemon resolves the attempts
 * it sent with its device credential, and a browser with its session.
 */
@Controller({ path: 'billing', version: '1' })
@UseGuards(LlmGatewayAuthGuard)
export class BillingAttemptController {
  public constructor(private readonly usageService: BillingUsageService) {}

  @Get('attempts/:surface/:attemptKey')
  @Header('Cache-Control', 'private, no-store')
  public async getAttemptReceipt(
    @LlmGatewayPrincipal() principalId: string,
    @Param() params: { surface: string; attemptKey: string },
    @Query() rawQuery: unknown,
  ): Promise<AttemptLookupAnswer> {
    let answer: AttemptLookupAnswer;
    try {
      answer = await this.usageService.getAttemptReceipt({
        authUserId: principalId,
        surface: params.surface,
        attemptKey: params.attemptKey,
        rawQuery,
      });
    } catch (error) {
      // The host reads the gateway envelope; a closed account is not a sign-in failure (W11 review, item 6).
      if (isBillingAccountClosed(error)) {
        throw billingAccountClosedError();
      }
      throw error;
    }
    // D11: the host parses this answer; a renamed or dropped field fails this typecheck, not a resume.
    return answer satisfies z.input<typeof attemptReceiptSchema>;
  }
}
