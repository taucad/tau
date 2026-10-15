/* eslint-disable @typescript-eslint/naming-convention -- langchain naming */
/**
 * Guards OpenAI Responses `summary_index` boundaries crossing V1 {@link AIMessageChunk}
 * `contentBlocks`: each new index must prepend `\n\n` to the streamed `reasoning-delta`
 * (see patched `peekReasoningSummaryIndex` in `tools/pnpm/patches/@ai-sdk__langchain@2.0.147.patch`).
 *
 * Mirrors the synthetic tuple-stream pattern used in {@link aisdk-langchain-values-reasoning-leak.test.ts}.
 */
import { describe, expect, it } from 'vitest';
import { AIMessageChunk } from '@langchain/core/messages';
import { toUIMessageStream } from '@ai-sdk/langchain';
import type { UIMessageChunk } from 'ai';

const langgraphStepMeta = { langgraph_step: 0 };

async function collectUiMessageChunks(stream: ReadableStream<UIMessageChunk>): Promise<UIMessageChunk[]> {
  const out: UIMessageChunk[] = [];
  const reader = stream.getReader();
  try {
    // oxlint-disable-next-line @typescript-eslint/no-unnecessary-condition -- read loop terminator
    while (true) {
      // oxlint-disable-next-line no-await-in-loop -- sequential ReadableStream drain
      const { done, value } = await reader.read();
      if (done) {
        break;
      }

      out.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  return out;
}

function reasoningDeltasJoined(chunks: UIMessageChunk[]): string {
  return chunks
    .filter((chunk): chunk is UIMessageChunk & { type: 'reasoning-delta'; delta: string } => {
      return chunk.type === 'reasoning-delta' && typeof (chunk as { delta?: unknown }).delta === 'string';
    })
    .map((chunk) => chunk.delta)
    .join('');
}

/** GPT-5 streaming chunk: reasoning text lives both in `content` (→ V1 reasoning block) and `additional_kwargs.reasoning.summary` (carries `index`). */
function openAiStyleReasoningChunk(options: {
  readonly messageId: string;
  readonly reasoningId: string;
  readonly reasoningTextDelta: string;
  readonly summaryIndex: number;
}): AIMessageChunk {
  return new AIMessageChunk({
    id: options.messageId,
    content: [{ type: 'reasoning', reasoning: options.reasoningTextDelta }],
    additional_kwargs: {
      reasoning: {
        id: options.reasoningId,
        type: 'reasoning',
        summary: [{ text: options.reasoningTextDelta, index: options.summaryIndex, type: 'summary_text' }],
      },
    },
  });
}

/** End reasoning before visible assistant text (`toUIMessageStream` closes reasoning on first text delta). */
function visibleTextChunk(options: { readonly messageId: string; readonly text: string }): AIMessageChunk {
  return new AIMessageChunk({
    id: options.messageId,
    content: [{ type: 'text', text: options.text }],
  });
}

describe('@ai-sdk/langchain GPT-5 summary_index boundary', () => {
  it(String.raw`prepends "\n\n" when summary_index increments across V1 reasoning chunks`, async () => {
    async function* fakeStream(): AsyncIterable<readonly unknown[]> {
      yield [
        'messages',
        [
          openAiStyleReasoningChunk({
            messageId: 'lc_gpt_boundary',
            reasoningId: 'rs_boundary',
            reasoningTextDelta: 'gather more clarity.',
            summaryIndex: 0,
          }),
          langgraphStepMeta,
        ],
      ];
      yield [
        'messages',
        [
          openAiStyleReasoningChunk({
            messageId: 'lc_gpt_boundary',
            reasoningId: 'rs_boundary',
            reasoningTextDelta: '\n\n**Exploring cactus design options**',
            summaryIndex: 1,
          }),
          langgraphStepMeta,
        ],
      ];
      yield ['messages', [visibleTextChunk({ messageId: 'lc_gpt_boundary', text: 'Answer.' }), langgraphStepMeta]];
    }

    const chunks = await collectUiMessageChunks(toUIMessageStream(fakeStream() as AsyncIterable<AIMessageChunk>));

    expect(reasoningDeltasJoined(chunks)).toBe('gather more clarity.\n\n\n\n**Exploring cactus design options**');
  });

  it(String.raw`does not inject extra "\n\n" when summary_index repeats`, async () => {
    async function* fakeStream(): AsyncIterable<readonly unknown[]> {
      yield [
        'messages',
        [
          openAiStyleReasoningChunk({
            messageId: 'lc_same_idx',
            reasoningId: 'rs_same_idx',
            reasoningTextDelta: 'Part ',
            summaryIndex: 0,
          }),
          langgraphStepMeta,
        ],
      ];
      yield [
        'messages',
        [
          openAiStyleReasoningChunk({
            messageId: 'lc_same_idx',
            reasoningId: 'rs_same_idx',
            reasoningTextDelta: 'two.',
            summaryIndex: 0,
          }),
          langgraphStepMeta,
        ],
      ];
      yield ['messages', [visibleTextChunk({ messageId: 'lc_same_idx', text: 'Done.' }), langgraphStepMeta]];
    }

    const chunks = await collectUiMessageChunks(toUIMessageStream(fakeStream() as AsyncIterable<AIMessageChunk>));

    expect(reasoningDeltasJoined(chunks)).toBe('Part two.');
  });

  it(String.raw`joins multiple reasoning blocks in one chunk with one "\n\n" separator`, async () => {
    async function* fakeStream(): AsyncIterable<readonly unknown[]> {
      const multi = new AIMessageChunk({
        id: 'lc_multi_block',
        content: [
          { type: 'reasoning', reasoning: 'Thought A.' },
          { type: 'reasoning', reasoning: 'Thought B.' },
        ],
      });
      yield ['messages', [multi, langgraphStepMeta]];
      yield ['messages', [visibleTextChunk({ messageId: 'lc_multi_block', text: 'Answer.' }), langgraphStepMeta]];
    }

    const chunks = await collectUiMessageChunks(toUIMessageStream(fakeStream() as AsyncIterable<AIMessageChunk>));

    expect(reasoningDeltasJoined(chunks)).toBe('Thought A.\n\nThought B.');
  });

  it('handles Anthropic-shaped thinking chunks without GPT-5 summary index', async () => {
    async function* fakeStream(): AsyncIterable<readonly unknown[]> {
      const thinkingChunk = new AIMessageChunk({
        id: 'lc_think',
        content: [{ type: 'thinking', thinking: 'Brief plan.', signature: 'sig-stub-boundary-test' }],
      });
      yield ['messages', [thinkingChunk, langgraphStepMeta]];
      yield ['messages', [visibleTextChunk({ messageId: 'lc_think', text: 'Hi.' }), langgraphStepMeta]];
    }

    const chunks = await collectUiMessageChunks(toUIMessageStream(fakeStream() as AsyncIterable<AIMessageChunk>));

    expect(reasoningDeltasJoined(chunks)).toBe('Brief plan.');
  });
});
