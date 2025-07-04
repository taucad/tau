import type { Message } from '@ai-sdk/react';
import type { Category } from '~/types/cad.types.js';
import type { KernelProvider } from '~/types/kernel.types.js';

type File = {
  content: string;
  // Could add metadata in the future
  lastModified?: number;
  size?: number;
};

export type Chat = {
  id: string;
  name: string;
  messages: Message[];
  createdAt: number;
  updatedAt: number;
};

// Individual asset structure for a specific category
export type Asset = {
  files: Record<string, File>;
  main: string; // Points to the main entry file
  language: KernelProvider;
  parameters: Record<string, unknown>;
  // Could add additional metadata
  version?: string;
  dependencies?: string[];
};

export type Build = {
  id: string;
  name: string;
  description: string;
  stars: number;
  forks: number;
  author: {
    name: string;
    avatar: string;
  };
  tags: string[];
  thumbnail: string;
  chats: Chat[];
  lastChatId?: string; // Reference to the last active chat
  createdAt: number;
  updatedAt: number;
  forkedFrom?: string;
  deletedAt?: number;
  // Status: 'draft' | 'review' | 'published' | 'completed' | 'archived';
  assets: Partial<Record<Category, Asset>>;
};
