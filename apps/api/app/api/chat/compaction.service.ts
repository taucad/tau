import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { BaseMessage } from '@langchain/core/messages';
import { HumanMessage } from '@langchain/core/messages';
import type { Environment } from '#config/environment.config.js';
import { countImageBlocks } from '#api/chat/utils/image-block.utils.js';
import { renderCompactionTranscript } from '#api/chat/utils/compaction-renderer.js';
import {
  MorphCompactionContractError,
  MorphCompactionHttpError,
  MorphCompactionTransportError,
} from '#api/chat/utils/compaction-errors.js';

const morphCompressionRatio = 0.35;
const morphPreserveRecent = 0;

/**
 * Statistics from a compaction operation.
 */
export type CompactionStats = {
  tokensBeforeCompaction: number;
  tokensAfterCompaction: number;
  compressionRatio: number;
  messagesEvicted: number;
};

/**
 * NestJS injectable service for context compaction.
 * Currently backed by the Morph Compact API for verbatim compression.
 */
@Injectable()
export class CompactionService {
  private readonly logger = new Logger(CompactionService.name);
  private readonly apiKey: string;
  private get apiUrl() {
    return 'https://api.morphllm.com/v1/compact';
  }

  public constructor(private readonly configService: ConfigService<Environment, true>) {
    const morphApiKey = this.configService.get<string>('MORPH_API_KEY', { infer: true });
    if (!morphApiKey) {
      throw new Error('MORPH_API_KEY is required for context compaction functionality');
    }
    this.apiKey = morphApiKey;
  }

  /**
   * Compact messages using Morph's verbatim compaction API.
   * Morph preserves exact content (no paraphrasing) while removing redundant context.
   */
  public async compact(options: {
    messages: BaseMessage[];
    query: string;
    keepContextTags?: string[];
  }): Promise<{ compactedMessages: BaseMessage[]; stats: CompactionStats }> {
    const { messages, query, keepContextTags = [] } = options;

    const input = renderCompactionTranscript(messages, { keepContextTags });
    const inputTokenEstimate = this.estimateTokens(input);

    let response: Response;
    try {
      response = await fetch(this.apiUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          // eslint-disable-next-line @typescript-eslint/naming-convention -- HTTP header name
          Authorization: `Bearer ${this.apiKey}`,
        },
        body: JSON.stringify({
          input,
          query,
          // eslint-disable-next-line @typescript-eslint/naming-convention -- Morph native API uses snake_case.
          compression_ratio: morphCompressionRatio,
          // eslint-disable-next-line @typescript-eslint/naming-convention -- Morph native API uses snake_case.
          preserve_recent: morphPreserveRecent,
        }),
      });
    } catch (error) {
      this.logger.error(`Morph compact transport error: ${error instanceof Error ? error.message : String(error)}`);
      throw new MorphCompactionTransportError('Morph compact request failed', { cause: error });
    }

    if (!response.ok) {
      const errorText = await response.text();
      this.logger.error(`Morph compact API error: ${response.status} ${errorText}`);
      throw new MorphCompactionHttpError(response.status, errorText);
    }

    const data = await this.parseJsonResponse(response);
    const compactedContent = this.parseNativeCompactOutput(data);

    const evictedImageCount = countImageBlocks(messages);
    const compactedMessages = this.parseCompactedOutput(compactedContent, evictedImageCount);
    const outputTokenEstimate = this.estimateTokens(compactedContent);

    const stats: CompactionStats = {
      tokensBeforeCompaction: inputTokenEstimate,
      tokensAfterCompaction: outputTokenEstimate,
      compressionRatio: inputTokenEstimate > 0 ? outputTokenEstimate / inputTokenEstimate : 1,
      messagesEvicted: messages.length - compactedMessages.length,
    };

    this.logger.log(
      `Compacted ${messages.length} messages → ${compactedMessages.length} ` +
        `(${stats.tokensBeforeCompaction} → ${stats.tokensAfterCompaction} tokens, ` +
        `${((1 - stats.compressionRatio) * 100).toFixed(1)}% reduction)`,
    );

    return { compactedMessages, stats };
  }

  private async parseJsonResponse(response: Response): Promise<unknown> {
    try {
      return await response.json();
    } catch (error) {
      throw new MorphCompactionContractError(
        `Morph compact response was not valid JSON: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  private parseNativeCompactOutput(data: unknown): string {
    if (!isRecord(data)) {
      throw new MorphCompactionContractError('Morph compact response must be a JSON object');
    }

    const { output } = data;
    if (typeof output !== 'string') {
      throw new MorphCompactionContractError('Morph compact response missing string field "output"');
    }

    if (!output.trim()) {
      throw new MorphCompactionContractError('Morph compact response field "output" was empty');
    }

    return output;
  }

  private parseCompactedOutput(content: string, evictedImageCount: number): BaseMessage[] {
    if (!content.trim()) {
      return [];
    }

    const imageNote = evictedImageCount > 0 ? ` — ${evictedImageCount} image(s) from prior context omitted` : '';
    return [new HumanMessage(`[Compacted conversation history${imageNote}]\n${content}`)];
  }

  private estimateTokens(content: string): number {
    // ~4 characters per token is a conservative estimate
    return Math.ceil(content.length / 4);
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
