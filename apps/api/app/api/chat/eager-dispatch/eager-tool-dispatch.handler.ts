/* eslint-disable @typescript-eslint/naming-convention, @typescript-eslint/explicit-member-accessibility -- mirrors LangChain BaseCallbackHandler API (`handleLLMNewToken`, `lc_prefer_streaming`). */
/* oxlint-disable @typescript-eslint/class-literal-property-style, max-params -- LangChain mandates the 6-arg `handleLLMNewToken` signature and literal `lc_prefer_streaming` flag. */

import type { HandleLLMNewTokenCallbackFields, NewTokenIndices } from '@langchain/core/callbacks/base';
import { BaseCallbackHandler } from '@langchain/core/callbacks/base';
import type { LLMResult } from '@langchain/core/outputs';
import type { ToolCall } from '@langchain/core/messages';
import { AIMessage, AIMessageChunk, ToolMessage } from '@langchain/core/messages';
import type { StructuredToolInterface } from '@langchain/core/tools';
import type { RunnableConfig } from '@langchain/core/runnables';
import { isCommand } from '@langchain/langgraph';
import type { Command } from '@langchain/langgraph';
import { toolName as chatToolName } from '@taucad/chat/constants';
import { normalizeGeoSpecRunFilterInputAliases } from '@taucad/chat/schemas/tools/test-model-input-normalizer';
import type { EagerToolEntry } from '#api/chat/eager-dispatch/state.js';
import type { WriterAttachableCallbackHandler } from '#api/chat/eager-dispatch/writer-capable-handler.js';

type ChunkSlot = {
  /** Tool call identifier (canonical across providers). */
  id: string;
  /** Tool name from the streamed tool block header. */
  name: string;
  /** Concatenated JSON fragments for this tool-call input. */
  args: string;
};

function normalizeInvokeYield(toolName: string, toolCallId: string, raw: unknown): ToolMessage | Command {
  return ToolMessage.isInstance(raw) || isCommand(raw)
    ? raw
    : new ToolMessage({
        name: toolName,
        content: typeof raw === 'string' ? raw : JSON.stringify(raw),
        tool_call_id: toolCallId,
      });
}

function toolResultToWireOutput(toolName: string, result: ToolMessage | Command): unknown {
  if (ToolMessage.isInstance(result)) {
    return result.content;
  }

  return `[Command:${toolName}]`;
}

type ToolInputNormalizer = typeof normalizeGeoSpecRunFilterInputAliases;

const toolInputNormalizers: Partial<Record<string, ToolInputNormalizer>> = {
  [chatToolName.testModel]: normalizeGeoSpecRunFilterInputAliases,
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function normalizeToolInput(toolName: string, args: Record<string, unknown>): Record<string, unknown> {
  const normalizer = toolInputNormalizers[toolName];
  if (!normalizer) {
    return args;
  }

  const normalized = normalizer(args);
  if (!normalized.changed || !isRecord(normalized.input)) {
    return args;
  }

  return normalized.input;
}

/**
 * Eagerly dispatches `StructuredTool.invoke` once per tool call when streamed args are sealed (opening a
 * new Anthropic-style tool block implies prior blocks are stopped) or on `handleLLMEnd` terminal
 * {@link AIMessage.tool_calls}. Emits `tau-eager-tool-{input|output}-available` through LangGraph
 * {@link RunnableConfig.writer} (`custom` stream). Results tee into {@link createEagerDispatchMiddleware}.
 */
export class EagerToolDispatchHandler extends BaseCallbackHandler implements WriterAttachableCallbackHandler {
  public override name = 'EagerToolDispatch';

  public readonly lc_prefer_streaming = true;

  public readonly entries = new Map<string, EagerToolEntry>();

  private readonly toolsByName: Map<string, StructuredToolInterface>;

  private readonly runnableConfigBaseline: RunnableConfig;

  private readonly perId = new Map<string, ChunkSlot>();

  /** Routes args-only deltas (index without id) onto the canonical tool-call id — Anthropic emits id on `tool_use` start only. */
  private readonly idByIndex = new Map<number, string>();

  /**
   * Tool-call ids whose strict-args parse failed at a seal point — avoids re-running `JSON.parse` on each
   * subsequent block-open; terminal `tool_calls[]` resolves them.
   */
  private readonly sealedAttemptedParseFailedIds = new Set<string>();

  private writer: ((payload: unknown) => void) | undefined;

  public constructor(options: { runnableConfigBaseline: RunnableConfig }) {
    super();
    this.runnableConfigBaseline = options.runnableConfigBaseline;
    this.toolsByName = new Map();
  }

  /** Invoked from `{@link ChatService.createAgent}` once the live tool registry is known — `createAgent` closes over middleware before tools are enumerated. */
  public bindTools(tools: StructuredToolInterface[]): void {
    this.toolsByName.clear();
    for (const registeredTool of tools) {
      this.toolsByName.set(registeredTool.name, registeredTool);
    }
  }

  public setWriter(writer: ((payload: unknown) => void) | undefined): void {
    this.writer = writer;
  }

  override handleLLMNewToken(
    _token: string,
    _index: NewTokenIndices,
    _runId: string,
    _parentRunId?: string,
    _tags?: string[],
    fields?: HandleLLMNewTokenCallbackFields,
  ): void {
    const envelope = fields?.chunk;
    if (!envelope || !('message' in envelope)) {
      return;
    }

    const message = envelope.message as AIMessageChunk;
    const chunks = message.tool_call_chunks ?? [];
    if (chunks.length === 0) {
      return;
    }

    for (const tcc of chunks) {
      const resolvedId = tcc.id ?? (typeof tcc.index === 'number' ? this.idByIndex.get(tcc.index) : undefined);
      if (!resolvedId) {
        continue;
      }

      const isNewToolCallId = !this.perId.has(resolvedId);
      if (isNewToolCallId) {
        this.perId.set(resolvedId, { id: resolvedId, name: tcc.name ?? '', args: '' });
        if (typeof tcc.index === 'number') {
          this.idByIndex.set(tcc.index, resolvedId);
        }

        this.maybeSealAllExcept(resolvedId);
      }

      const slot = this.perId.get(resolvedId);
      if (!slot) {
        continue;
      }

      if (tcc.name) {
        slot.name = slot.name === '' ? tcc.name : slot.name;
      }

      slot.args += tcc.args ?? '';
    }
  }

  override handleLLMEnd(output: LLMResult): void {
    const generation = output.generations[0]?.[0];
    if (!generation || !('message' in generation)) {
      return;
    }

    const terminalMessage = generation.message;
    let toolCalls: ToolCall[];

    if (AIMessageChunk.isInstance(terminalMessage)) {
      toolCalls = terminalMessage.tool_calls ?? [];
    } else if (AIMessage.isInstance(terminalMessage)) {
      toolCalls = terminalMessage.tool_calls ?? [];
    } else {
      return;
    }

    for (const call of toolCalls) {
      if (!call.id || !call.name) {
        continue;
      }

      if (this.entries.has(call.id)) {
        continue;
      }

      const canonicalArgs =
        typeof call.args === 'object' && !Array.isArray(call.args)
          ? (structuredClone(call.args) as Record<string, unknown>)
          : {};

      this.dispatchToolCall(call.id, call.name, canonicalArgs);
    }
  }

  /**
   * When Anthropic opens a subsequent `tool_use` block, streaming for every prior tool block has finished —
   * strict-parse accumulated args once and dispatch eagerly, or defer to `handleLLMEnd` terminal `tool_calls`.
   */
  private maybeSealAllExcept(currentToolCallId: string): void {
    for (const [toolCallId, slot] of this.perId.entries()) {
      if (toolCallId === currentToolCallId) {
        continue;
      }

      if (this.entries.has(toolCallId)) {
        continue;
      }

      if (this.sealedAttemptedParseFailedIds.has(toolCallId)) {
        continue;
      }

      if (!slot.name) {
        continue;
      }

      const argsString = slot.args.trim();
      if (argsString.length === 0) {
        continue;
      }

      let parsedUnknown: unknown;
      try {
        parsedUnknown = JSON.parse(argsString) as unknown;
        if (parsedUnknown === null || typeof parsedUnknown !== 'object' || Array.isArray(parsedUnknown)) {
          this.sealedAttemptedParseFailedIds.add(toolCallId);
          continue;
        }
      } catch {
        this.sealedAttemptedParseFailedIds.add(toolCallId);
        continue;
      }

      this.dispatchToolCall(toolCallId, slot.name, parsedUnknown as Record<string, unknown>);
    }
  }

  private dispatchToolCall(toolCallId: string, toolName: string, args: Record<string, unknown>): void {
    if (this.entries.has(toolCallId)) {
      return;
    }

    if (!toolCallId || !toolName) {
      return;
    }

    const targetTool = this.toolsByName.get(toolName);
    if (!targetTool) {
      return;
    }

    const normalizedArgs = normalizeToolInput(toolName, args);

    this.writer?.({
      type: 'tau-eager-tool-input-available',
      toolCallId,
      toolName,
      input: normalizedArgs,
    });

    const invokePromise = targetTool.invoke(
      { name: toolName, args: normalizedArgs, id: toolCallId, type: 'tool_call' },
      {
        ...this.runnableConfigBaseline,
        config: this.runnableConfigBaseline,
        toolCallId,
        signal: this.runnableConfigBaseline.signal,
      },
    ) as Promise<unknown>;

    const settledPromise = this.finalizeToolInvocation(toolCallId, toolName, invokePromise);

    this.entries.set(toolCallId, { toolCallId, toolName, invokePromise: settledPromise });
  }

  private async finalizeToolInvocation(
    toolCallId: string,
    toolName: string,
    invokePromise: Promise<unknown>,
  ): Promise<ToolMessage | Command | undefined> {
    try {
      const rawYield = await invokePromise;
      const normalisedYield = normalizeInvokeYield(toolName, toolCallId, rawYield);
      const gate = this.entries.get(toolCallId);
      if (gate) {
        gate.result = normalisedYield;
      }

      this.writer?.({
        type: 'tau-eager-tool-output-available',
        toolCallId,
        output: toolResultToWireOutput(toolName, normalisedYield),
      });

      return normalisedYield;
    } catch {
      /* Authoritative failure path rides ToolNode / `tool-error-handler.middleware` */

      return undefined;
    }
  }
}
