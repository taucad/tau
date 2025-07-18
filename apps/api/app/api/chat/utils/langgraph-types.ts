/**
 * Type definitions for LangGraph events and content parts
 */
import type { StreamEvent as LangchainStreamEvent, StreamEventData } from '@langchain/core/tracers/log_stream';

// ============================================================================
// Content Part Types
// ============================================================================

/**
 * All possible content part types
 */
export type ContentPartType = 'text' | 'thinking' | 'redacted_thinking' | 'tool_use' | 'input_json_delta';

/**
 * Base interface for all content parts
 */
type BaseContentPart<Type extends ContentPartType, Data extends Record<string, unknown>> = {
  type: Type;
} & Data;

/**
 * Content part interfaces
 */
export type TextPart = BaseContentPart<'text', { text: string }>;
export type ThinkingContentPart = BaseContentPart<'thinking', { thinking: string }>;
export type ThinkingSignaturePart = BaseContentPart<'thinking', { signature: string }>;
export type RedactedThinkingPart = BaseContentPart<'redacted_thinking', { data: string }>;
export type ToolUsePart = BaseContentPart<'tool_use', { data: string }>;
export type InputJsonDeltaPart = BaseContentPart<'input_json_delta', { data: string }>;

/**
 * Union of all possible content parts
 */
export type ContentPart =
  | TextPart
  | ThinkingContentPart
  | ThinkingSignaturePart
  | RedactedThinkingPart
  | ToolUsePart
  | InputJsonDeltaPart;

// ============================================================================
// Event Types
// ============================================================================

type LangchainRunnable = 'llm' | 'chat_model' | 'prompt' | 'tool' | 'chain' | 'parser';
type LangchainEvent = 'start' | 'stream' | 'end';
export type LangGraphEventName = `on_${LangchainRunnable}_${LangchainEvent}` | 'on_custom_event';

/**
 * Base metadata type that all events share
 */
export type LangGraphMetadata = {
  [key: string]: unknown;
  langgraph_checkpoint_ns: string;
};

/**
 * Base type for all LangGraph events
 */
type BaseLangGraphEvent<EventType extends LangGraphEventName, DataType extends StreamEventData> = {
  event: EventType;
  data: DataType;
  metadata: LangGraphMetadata;
} & Omit<LangchainStreamEvent, 'event' | 'data' | 'metadata'>;

/**
 * Event type definitions
 */
export type ChatModelStreamEvent = BaseLangGraphEvent<
  'on_chat_model_stream',
  {
    chunk: {
      content: string | ContentPart[];
      tool_calls: Array<{
        id?: string;
        name: string;
        args: string;
        type: 'tool_call';
      }>;
      tool_call_chunks: Array<{
        index: string;
        args: string;
      }>;
    };
  }
>;
export type ChatModelStartEvent = BaseLangGraphEvent<'on_chat_model_start', StreamEventData>;
export type ChatModelEndEvent = BaseLangGraphEvent<
  'on_chat_model_end',
  {
    output: {
      usage_metadata: {
        input_tokens: number;
        output_tokens: number;
        input_token_details?: {
          cache_read?: number;
          cache_creation?: number;
        };
      };
    };
  }
>;
export type ToolStartEvent = BaseLangGraphEvent<
  'on_tool_start',
  {
    input: {
      input: unknown;
    };
  }
>;
export type ToolEndEvent = BaseLangGraphEvent<
  'on_tool_end',
  {
    output: {
      content: string;
    };
  }
>;

/**
 * Maps event names to their corresponding data types.
 *
 * Only known event data types are included.
 */
type EventTypeMapping = {
  on_chat_model_stream: ChatModelStreamEvent;
  on_chat_model_start: ChatModelStartEvent;
  on_chat_model_end: ChatModelEndEvent;
  on_tool_start: ToolStartEvent;
  on_tool_end: ToolEndEvent;
};

type EventTypeMap<T extends LangGraphEventName> = T extends keyof EventTypeMapping
  ? EventTypeMapping[T]
  : BaseLangGraphEvent<T, StreamEventData>;

/**
 * Union of all possible stream events, ensuring coverage of all LangGraphEventName combinations
 */
export type StreamEvent = EventTypeMap<LangGraphEventName>;
