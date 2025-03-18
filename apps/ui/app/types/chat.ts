export type ChatInterfaceProperties = {
  chatId: string;
};

export enum MessageRole {
  User = 'user',
  Assistant = 'assistant',
}

export enum MessageStatus {
  Pending = 'pending',
  Success = 'success',
  Error = 'error',
}

export type SourceOrigin = 'web' | 'notion' | 'history' | 'projects';

// Define content types using discriminated union
export type TextContent = {
  type: 'text';
  text: string;
};

export type ImageContent = {
  type: 'image_url';
  image_url: {
    url: string;
  };
};

export type MessageContent =
  | {
      type: 'text';
      text: string;
      cache_control?: {
        type: 'ephemeral';
      };
    }
  | {
      type: 'image_url';
      image_url: {
        url: string;
      };
    };

// Update Message interface to use the discriminated union
export interface Message {
  id: string;
  threadId?: string;
  role: MessageRole;
  model: string;
  content: MessageContent[];
  thinking?: string;
  status: MessageStatus;
  metadata?: {
    systemHints?: string[];
  };
  toolCalls?: {
    origin: SourceOrigin;
    input: string;
    output: {
      title: string;
      link: string;
      snippet: string;
    }[];
    description: string;
  }[];
  usage?: ChatUsageTokens & ChatUsageCost;
  createdAt: number;
  updatedAt: number;
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
