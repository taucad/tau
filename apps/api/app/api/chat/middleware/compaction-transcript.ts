import type { BaseMessage } from '@langchain/core/messages';
import { isImageBlock } from '#api/chat/utils/image-block.utils.js';
import type { TauRpcBackendFactory } from '#api/chat/tau-rpc-backend.js';
import type { TokenBudgetTriggerReason } from '#api/chat/token-budget.service.js';

export type CompactionTranscriptStatus = 'compacted' | 'failed' | 'overflow_retry_succeeded';

export type CompactionTranscriptCommitInput = {
  readonly chatId: string;
  readonly rpcBackendFactory: TauRpcBackendFactory;
  readonly compactionId: string;
  readonly status: CompactionTranscriptStatus;
  readonly triggerReason: TokenBudgetTriggerReason;
  readonly evictedMessages: readonly BaseMessage[];
  readonly messagesEvicted: number;
  readonly tokensBeforeCompaction: number;
  readonly tokensAfterCompaction: number;
};

export function compactionTranscriptPath(chatId: string): string {
  return `/.tau/transcripts/${chatId}.jsonl`;
}

export async function appendCompactionTranscriptCommit(input: CompactionTranscriptCommitInput): Promise<string> {
  const transcriptFilePath = compactionTranscriptPath(input.chatId);
  const backend = input.rpcBackendFactory.create(input.chatId, 'compaction-commit');
  const timestamp = new Date().toISOString();
  const lines = [
    ...serializeEvictedMessages(input.evictedMessages, timestamp),
    JSON.stringify({
      role: 'compaction',
      compactionId: input.compactionId,
      status: input.status,
      triggerReason: input.triggerReason,
      messagesEvicted: input.messagesEvicted,
      tokensBeforeCompaction: input.tokensBeforeCompaction,
      tokensAfterCompaction: input.tokensAfterCompaction,
      timestamp,
    }),
  ];

  await backend.append(transcriptFilePath, lines.join('\n') + '\n');
  return transcriptFilePath;
}

/**
 * Serializes evicted messages into JSONL transcript lines.
 * Image blocks are replaced with stable markers instead of raw media payloads.
 */
export function serializeEvictedMessages(evictedMessages: readonly BaseMessage[], timestamp: string): string[] {
  const lines: string[] = [];

  for (const message of evictedMessages) {
    const role = message.type === 'human' ? 'user' : message.type === 'ai' ? 'assistant' : message.type;

    if (typeof message.content === 'string') {
      lines.push(JSON.stringify({ role, content: message.content, timestamp }));
      continue;
    }

    if (!Array.isArray(message.content)) {
      continue;
    }

    for (const block of message.content as Array<Record<string, unknown>>) {
      if (isImageBlock(block)) {
        lines.push(JSON.stringify({ role, type: 'image', content: '[user attached image]', timestamp }));
      } else if (block['type'] === 'text' && block['text']) {
        lines.push(JSON.stringify({ role, content: block['text'], timestamp }));
      }
    }
  }

  return lines;
}
