import { UIMessage } from 'ai';

export enum MessageRole {
  User = 'user',
  Assistant = 'assistant',
}

export enum MessageStatus {
  Pending = 'pending',
  Success = 'success',
  Error = 'error',
  Cancelled = 'cancelled',
}

export type SourceOrigin = 'web' | 'notion' | 'history' | 'projects';

export type MessagePart = UIMessage['parts'][number];

export type MessageAnnotation = {
  type: 'usage';
  usageTokens: ChatUsageTokens;
  usageCost: ChatUsageCost;
  model: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- This is a workaround to allow any key-value pairs
  [key: string]: any;
};

declare module '@ai-sdk/react' {
  interface Message {
    /**
     * The model that should be used to generate the message.
     */
    model: string;
    /**
     * The status of the message.
     */
    status: MessageStatus;
    /**
     * The metadata of the message.
     */
    metadata?: {
      /**
       * The tools that should be used to generate the message.
       *
       * - `web`: Use the web tool.
       * - `none`: Forcibly not use any tools.
       * - `auto`: Use the best tool available.
       * - `any`: Forcibly use any tool available.
       *
       * @default 'auto'
       */
      toolChoice?: 'web' | 'none' | 'auto' | 'any';
    };
    /**
     * The annotations of the message.
     */
    // The AI SDK doesn't have valid support for module augmentation of MessageAnnotation.
    // @ts-expect-error -- Subsequent property declarations must have the same type.  Property 'annotations' must be of type 'JSONValue[] | undefined', but here has type 'MessageAnnotation[] | undefined'.
    annotations?: MessageAnnotation[];
  }
}

export interface ChatUsageTokens {
  inputTokens: number;
  outputTokens: number;
  cachedReadTokens: number;
  cachedWriteTokens: number;
}

export interface ChatUsageCost {
  inputTokensCost: number;
  outputTokensCost: number;
  cachedReadTokensCost: number;
  cachedWriteTokensCost: number;
  totalCost: number;
}
