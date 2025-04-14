/**
 * Missing types for LangGraph, enhanced with a discriminated union of all stream events.
 */
import type { StreamEvent } from '@langchain/core/dist/tracers/event_stream';

/**
 * Events emitted during a chat session with LangGraph.
 */
export const chatEvent = {
  /** Emitted when a chat model starts generating content */
  onChatModelStart: 'on_chat_model_start',
  /** Emitted when a chat model finishes generating content */
  onChatModelEnd: 'on_chat_model_end',
  /** Emitted when a chat model streams a chunk of content */
  onChatModelStream: 'on_chat_model_stream',
  /** Emitted when a tool starts executing */
  onToolStart: 'on_tool_start',
  /** Emitted when a tool finishes executing */
  onToolEnd: 'on_tool_end',
  /** Emitted when a chain starts executing */
  onChainStart: 'on_chain_start',
  /** Emitted when a chain finishes executing */
  onChainEnd: 'on_chain_end',
  /** Emitted when a chain streams content */
  onChainStream: 'on_chain_stream',
} as const satisfies Record<string, string>;

export type ChatEvent = (typeof chatEvent)[keyof typeof chatEvent];

export const contentPartType = {
  text: 'text',
  thinking: 'thinking',
  redactedThinking: 'redacted_thinking',
  toolUse: 'tool_use',
  inputJsonDelta: 'input_json_delta',
} as const satisfies Record<string, string>;

export type ContentPartType = (typeof contentPartType)[keyof typeof contentPartType];

/**
 * Interface for the shape of a content part with data
 */
export type RedactedThinkingPart = {
  type: 'redacted_thinking';
  data: string;
};

/**
 * Interface for the shape of a content part with text
 */
export type TextPart = {
  type: 'text';
  text: string;
};

/**
 * Interface for the shape of a content part with thinking
 */
export type ThinkingPart = {
  type: 'thinking';
  thinking?: string;
  signature?: string;
};

/**
 * Type for tool use part
 */
export type ToolUsePart = {
  type: 'tool_use';
};

/**
 * Type for input json delta part
 */
export type InputJsonDeltaPart = {
  type: 'input_json_delta';
};

/**
 * Union type for all content parts
 */
export type ContentPart = TextPart | ThinkingPart | RedactedThinkingPart | ToolUsePart | InputJsonDeltaPart;

/**
 * Base metadata type that all events share
 */
export type LangGraphMetadata = {
  [key: string]: unknown;
  langgraph_checkpoint_ns: string;
};

/**
 * Type for ChatModelStream event data
 */
export type ChatModelStreamData = {
  chunk: {
    content: string | ContentPart[];
  };
};

/**
 * Type for ChatModelStart event data
 */
export type ChatModelStartData = Record<string, unknown>;

/**
 * Type for ChatModelEnd event data
 */
export type ChatModelEndData = {
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
};

/**
 * Type for ToolStart event data
 */
export type ToolStartData = {
  input: Record<string, unknown>;
};

/**
 * Type for ToolEnd event data
 */
export type ToolEndData = {
  output: {
    content: string;
  };
};

/**
 * Type for ChainStart event data
 */
export type ChainStartData = Record<string, unknown>;

/**
 * Type for ChainEnd event data
 */
export type ChainEndData = Record<string, unknown>;

/**
 * Type for ChainStream event data
 */
export type ChainStreamData = Record<string, unknown>;

/**
 * Discriminated union of all stream events
 */
export type TypedStreamEvent =
  | ChatModelStreamEvent
  | ChatModelStartEvent
  | ChatModelEndEvent
  | ToolStartEvent
  | ToolEndEvent
  | ChainStartEvent
  | ChainEndEvent
  | ChainStreamEvent;

/**
 * ChatModelStream event
 */
export type ChatModelStreamEvent = {
  event: typeof chatEvent.onChatModelStream;
  data: ChatModelStreamData;
  metadata: LangGraphMetadata;
} & Omit<StreamEvent, 'event' | 'data' | 'metadata'>;

/**
 * ChatModelStart event
 */
export type ChatModelStartEvent = {
  event: typeof chatEvent.onChatModelStart;
  data: ChatModelStartData;
  metadata: LangGraphMetadata;
} & Omit<StreamEvent, 'event' | 'data' | 'metadata'>;

/**
 * ChatModelEnd event
 */
export type ChatModelEndEvent = {
  event: typeof chatEvent.onChatModelEnd;
  data: ChatModelEndData;
  metadata: LangGraphMetadata;
} & Omit<StreamEvent, 'event' | 'data' | 'metadata'>;

/**
 * ToolStart event
 */
export type ToolStartEvent = {
  event: typeof chatEvent.onToolStart;
  data: ToolStartData;
  metadata: LangGraphMetadata;
} & Omit<StreamEvent, 'event' | 'data' | 'metadata'>;

/**
 * ToolEnd event
 */
export type ToolEndEvent = {
  event: typeof chatEvent.onToolEnd;
  data: ToolEndData;
  metadata: LangGraphMetadata;
} & Omit<StreamEvent, 'event' | 'data' | 'metadata'>;

/**
 * ChainStart event
 */
export type ChainStartEvent = {
  event: typeof chatEvent.onChainStart;
  data: ChainStartData;
  metadata: LangGraphMetadata;
} & Omit<StreamEvent, 'event' | 'data' | 'metadata'>;

/**
 * ChainEnd event
 */
export type ChainEndEvent = {
  event: typeof chatEvent.onChainEnd;
  data: ChainEndData;
  metadata: LangGraphMetadata;
} & Omit<StreamEvent, 'event' | 'data' | 'metadata'>;

/**
 * ChainStream event
 */
export type ChainStreamEvent = {
  event: typeof chatEvent.onChainStream;
  data: ChainStreamData;
  metadata: LangGraphMetadata;
} & Omit<StreamEvent, 'event' | 'data' | 'metadata'>;
