import type { UIMessage } from 'ai';
import type { ConstantRecord } from '~/types/constant.types.js';
import type { KernelProvider } from '~/types/kernel.types.js';

export const messageRole = {
  user: 'user',
  assistant: 'assistant',
} as const;

export type MessageRole = ConstantRecord<typeof messageRole>;

export const messageStatus = {
  pending: 'pending',
  success: 'success',
  error: 'error',
  cancelled: 'cancelled',
} as const;

export type MessageStatus = ConstantRecord<typeof messageStatus>;

export type SourceOrigin = 'web' | 'notion' | 'history' | 'projects';

export type MessagePart = UIMessage['parts'][number];

export type MessageAnnotation = {
  type: 'usage';
  usageTokens: ChatUsageTokens;
  usageCost: ChatUsageCost;
  model: string;
};

declare module '@ai-sdk/react' {
  // eslint-disable-next-line @typescript-eslint/consistent-type-definitions -- interface is necessary to augment the Message type
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
      toolChoice?: 'web_search' | 'none' | 'auto' | 'any';
      /**
       * The CAD kernel to use for code generation and tool operations.
       *
       * @default 'replicad'
       */
      kernel?: KernelProvider;
    };
    /**
     * The annotations of the message.
     */
    // The AI SDK doesn't have valid support for module augmentation of MessageAnnotation.
    // @ts-expect-error -- Subsequent property declarations must have the same type.  Property 'annotations' must be of type 'JSONValue[] | undefined', but here has type 'MessageAnnotation[] | undefined'.
    annotations?: MessageAnnotation[];
  }
}

export type ChatUsageTokens = {
  inputTokens: number;
  outputTokens: number;
  cachedReadTokens: number;
  cachedWriteTokens: number;
};

export type ChatUsageCost = {
  inputTokensCost: number;
  outputTokensCost: number;
  cachedReadTokensCost: number;
  cachedWriteTokensCost: number;
  totalCost: number;
};
