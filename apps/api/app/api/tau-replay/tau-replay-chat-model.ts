/* eslint-disable @typescript-eslint/naming-convention -- BaseChatModel's contract mandates underscore-prefixed methods and snake_case usage_metadata/tool_call fields. */
/* oxlint-disable no-await-in-loop -- streaming chunks are emitted sequentially by contract. */
import { AIMessage, AIMessageChunk, ToolMessage } from '@langchain/core/messages';
import type { BaseMessage, UsageMetadata } from '@langchain/core/messages';
import type { ToolCall, ToolCallChunk } from '@langchain/core/messages/tool';
import { BaseChatModel } from '@langchain/core/language_models/chat_models';
import type { CallbackManagerForLLMRun } from '@langchain/core/callbacks/manager';
import { ChatGenerationChunk } from '@langchain/core/outputs';
import type { ChatResult } from '@langchain/core/outputs';
import { toolName } from '@taucad/chat/constants';
import type { ReplayFixture, ReplayTurn } from '#api/tau-replay/replay-fixture.schema.js';

/** The reasoning/text content blocks the `@ai-sdk/langchain` adapter maps to `reasoning`/`text` UI parts. */
type ReplayContentBlock =
  | { readonly type: 'reasoning'; readonly reasoning: string }
  | { readonly type: 'text'; readonly text: string };

/**
 * A deterministic `BaseChatModel` that replays a recorded transcript
 * ({@link ReplayFixture}) turn-by-turn: reasoning + tool calls, then final text,
 * with per-turn `usage_metadata`. It replays the assistant's *decisions* only —
 * the real tools execute (headless memFs + stubs in tests, or the live client in
 * dev). Scripted decisions ignore tool results, except that a terminal success
 * claim is replaced when the latest `test_model` result is red.
 *
 * Streaming (`_streamResponseChunks`) is the primary path: the LangGraph agent
 * streams, and `@ai-sdk/langchain` only extracts reasoning/text from
 * `AIMessageChunk`s — so the reasoning + text blocks must be *streamed*, not
 * returned whole. The step is derived from the message history (count of
 * assistant turns already present), so a single instance is stateless and safe
 * under interleaved runs.
 */
export class TauReplayChatModel extends BaseChatModel {
  private readonly responseMetadata: { model: string; model_provider: string };

  public constructor(
    private readonly fixture: ReplayFixture,
    modelId: string,
  ) {
    super({});
    this.responseMetadata = { model: modelId, model_provider: 'tau' };
  }

  public override _llmType(): string {
    return 'tau-replay';
  }

  public override _combineLLMOutput(): Record<string, unknown> {
    return {};
  }

  // The replay is scripted; tools bound by the agent don't change its output.
  public override bindTools(): this {
    return this;
  }

  public override async *_streamResponseChunks(
    messages: BaseMessage[],
    _options: this['ParsedCallOptions'],
    runManager?: CallbackManagerForLLMRun,
  ): AsyncGenerator<ChatGenerationChunk> {
    const { turn, stepIndex } = this.resolveTurn(messages);

    // Past the script: end the loop with an empty assistant message.
    if (turn === undefined) {
      yield new ChatGenerationChunk({ message: new AIMessageChunk({ content: '' }), text: '' });
      return;
    }

    // Reasoning first (its own chunk so the adapter emits reasoning-start/delta).
    if (turn.reasoning !== undefined) {
      const content: ReplayContentBlock[] = [{ type: 'reasoning', reasoning: turn.reasoning }];
      const chunk = new ChatGenerationChunk({ message: new AIMessageChunk({ content }), text: '' });
      yield chunk;
      await runManager?.handleLLMNewToken('', undefined, undefined, undefined, undefined, { chunk });
    }

    // Tool calls — one chunk each; the adapter turns tool_call_chunks into UI tool parts.
    for (const [index, call] of (turn.toolCalls ?? []).entries()) {
      const toolCallChunks: ToolCallChunk[] = [
        {
          index,
          id: this.toolCallId(stepIndex, index),
          name: call.name,
          args: JSON.stringify(call.args),
          type: 'tool_call_chunk',
        },
      ];
      const chunk = new ChatGenerationChunk({
        message: new AIMessageChunk({ content: '', tool_call_chunks: toolCallChunks }),
        text: '',
      });
      yield chunk;
      await runManager?.handleLLMNewToken('', undefined, undefined, undefined, undefined, { chunk });
    }

    // Final text (terminal turn) — its own chunk so the adapter emits text-delta.
    const text = this.truthfulTerminalText(messages, turn);
    if (text !== undefined) {
      const chunk = new ChatGenerationChunk({ message: new AIMessageChunk({ content: text }), text });
      yield chunk;
      await runManager?.handleLLMNewToken(text, undefined, undefined, undefined, undefined, { chunk });
    }

    // Usage rides on a trailing chunk so the accumulated message carries it.
    yield new ChatGenerationChunk({
      message: new AIMessageChunk({
        content: '',
        usage_metadata: this.usageMetadata(turn),
        response_metadata: this.responseMetadata,
      }),
      text: '',
    });
  }

  public override async _generate(
    messages: BaseMessage[],
    _options: this['ParsedCallOptions'],
    _runManager?: CallbackManagerForLLMRun,
  ): Promise<ChatResult> {
    // Non-streaming fallback (LangChain internals may call this). Builds the whole
    // turn as one AIMessage; the streaming path above is what feeds the UI stream.
    const { turn, stepIndex } = this.resolveTurn(messages);
    if (turn === undefined) {
      return { generations: [{ text: '', message: new AIMessage({ content: '' }) }] };
    }

    const content: ReplayContentBlock[] = [];
    if (turn.reasoning !== undefined) {
      content.push({ type: 'reasoning', reasoning: turn.reasoning });
    }
    const text = this.truthfulTerminalText(messages, turn);
    if (text !== undefined) {
      content.push({ type: 'text', text });
    }
    const toolCalls: ToolCall[] = (turn.toolCalls ?? []).map((call, index) => ({
      name: call.name,
      args: { ...call.args },
      id: this.toolCallId(stepIndex, index),
      type: 'tool_call',
    }));

    const message = new AIMessage({
      content: content.length > 0 ? content : '',
      tool_calls: toolCalls,
      usage_metadata: this.usageMetadata(turn),
      response_metadata: this.responseMetadata,
    });
    return { generations: [{ text: text ?? '', message }] };
  }

  /** The turn this call replays: one per assistant message already in the history. */
  private resolveTurn(messages: BaseMessage[]): { turn: ReplayTurn | undefined; stepIndex: number } {
    // Count prior assistant turns via the string discriminator (robust across
    // class-identity boundaries, unlike `instanceof`).
    const stepIndex = messages.filter((message) => message.type === 'ai').length;
    return { turn: this.fixture.turns[stepIndex], stepIndex };
  }

  private toolCallId(stepIndex: number, index: number): string {
    return `${this.fixture.id}-s${stepIndex}-t${index}`;
  }

  private truthfulTerminalText(messages: BaseMessage[], turn: ReplayTurn): string | undefined {
    if (turn.text === undefined) {
      return undefined;
    }

    for (let index = messages.length - 1; index >= 0; index -= 1) {
      const message = messages[index];
      if (!message || !ToolMessage.isInstance(message) || message.name !== toolName.testModel) {
        continue;
      }
      if (typeof message.content !== 'string') {
        return turn.text;
      }
      try {
        const result = JSON.parse(message.content) as { failures?: unknown; total?: unknown };
        if (Array.isArray(result.failures) && result.failures.length > 0 && typeof result.total === 'number') {
          return `GeoSpec validation failed: ${result.failures.length} of ${result.total} tests failed. The model is not verified; review the test_model failure output and fix the geometry before claiming completion.`;
        }
      } catch {
        // RPC output is schema-validated upstream; leave an opaque result alone.
      }
      return turn.text;
    }
    return turn.text;
  }

  private usageMetadata(turn: ReplayTurn): UsageMetadata {
    const { usage } = turn;
    return {
      input_tokens: usage.inputTokens,
      output_tokens: usage.outputTokens,
      total_tokens: usage.inputTokens + usage.outputTokens,
      input_token_details: { cache_read: usage.cacheReadTokens ?? 0, cache_creation: usage.cacheWriteTokens ?? 0 },
      output_token_details: { reasoning: usage.reasoningTokens ?? 0 },
    };
  }
}
