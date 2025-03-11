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

export type MessageContent = TextContent | ImageContent;

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
  createdAt: number;
  updatedAt: number;
}
