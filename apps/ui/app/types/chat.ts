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

export interface Message {
  id: string;
  threadId?: string;
  role: MessageRole;
  model: string;
  content: string;
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
