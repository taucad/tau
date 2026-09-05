import { Injectable, Logger } from '@nestjs/common';
import { openai } from '@ai-sdk/openai';
import { streamText } from 'ai';
import type { ModelMessage } from 'ai';
import { ConfigService } from '@nestjs/config';
import type { Environment } from '#config/environment.config.js';
import { ModelService } from '#api/models/model.service.js';
import { computeUserChargedCostMicro } from '#api/billing/credit-estimator.js';
import { CreditLedgerService } from '#api/billing/credit-ledger.service.js';
import { MetricsService } from '#telemetry/metrics.js';
import { commitMessageGenerationSystemPrompt, projectNameGenerationSystemPrompt } from '@taucad/chat/prompts';

/**
 * Secondary chat surfaces that still run on the API: the project-name and
 * commit-message generators. The CAD agent itself was deleted with W3-CUT —
 * it runs in the browser agent host (`@taucad/agent-host`).
 */
@Injectable()
export class ChatService {
  private readonly logger = new Logger(ChatService.name);

  public constructor(
    private readonly modelService: ModelService,
    private readonly metricsService: MetricsService,
    private readonly creditLedgerService: CreditLedgerService,
    private readonly configService: ConfigService<Environment, true>,
  ) {}

  public getBuildNameGenerator(coreMessages: ModelMessage[], userId: string): ReturnType<typeof streamText> {
    return streamText({
      model: openai('gpt-4o-mini'),
      messages: coreMessages,
      system: projectNameGenerationSystemPrompt,
      onFinish: ({ totalUsage }) => {
        void this.debitGeneratorUsage(userId, totalUsage, 'name-generator');
      },
    });
  }

  public getCommitMessageGenerator(coreMessages: ModelMessage[], userId: string): ReturnType<typeof streamText> {
    return streamText({
      model: openai('gpt-4o-mini'),
      messages: coreMessages,
      system: commitMessageGenerationSystemPrompt,
      onFinish: ({ totalUsage }) => {
        void this.debitGeneratorUsage(userId, totalUsage, 'commit-generator');
      },
    });
  }

  /**
   * Secondary-surface metering (AD14): the generators are single bounded
   * gpt-4o-mini calls (~60 µ$), so they debit actuals post-fact with no
   * reservation — the hold machinery would cost more than the exposure
   * (ponytail: reservation-less by design; revisit if generators grow).
   */
  private async debitGeneratorUsage(
    userId: string,
    totalUsage: {
      inputTokens?: number | undefined;
      outputTokens?: number | undefined;
      cachedInputTokens?: number | undefined;
    },
    note: string,
  ): Promise<void> {
    const model = this.modelService.models.find((entry) => entry.id === 'openai-gpt-4o-mini');
    if (!model) {
      this.logger.warn('Generator metering entry openai-gpt-4o-mini missing from the catalog');
      return;
    }
    const cachedInputTokens = totalUsage.cachedInputTokens ?? 0;
    const amountMicro = computeUserChargedCostMicro({
      model,
      usage: {
        inputTokens: Math.max((totalUsage.inputTokens ?? 0) - cachedInputTokens, 0),
        outputTokens: totalUsage.outputTokens ?? 0,
        reasoningTokens: 0,
        cacheReadTokens: cachedInputTokens,
        cacheWriteTokens: 0,
      },
      markupFraction: this.configService.get('TAU_CREDIT_MARKUP_FRACTION', { infer: true }),
    });
    if (amountMicro <= 0n) {
      return;
    }
    const billingAttributes = Object.fromEntries([['tau.billing.category', 'llm']]);
    try {
      await this.creditLedgerService.debit({ userId, amountMicro, category: 'llm', modelId: model.id, note });
      this.metricsService.billingCreditCommitted.add(Number(amountMicro), billingAttributes);
    } catch (error) {
      this.metricsService.billingCommitFailures.add(1, billingAttributes);
      this.logger.error(`Generator usage debit failed for ${userId}: ${String(error)}`);
    }
  }
}
