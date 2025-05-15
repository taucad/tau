import type { Message } from '@ai-sdk/react';
import type { CadKernelProvider, Category } from '~/types/cad.js';

type File = {
  content: string;
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
  messages: Message[];
  createdAt: number;
  updatedAt: number;
  forkedFrom?: string;
  deletedAt?: number;
  // Status: 'draft' | 'review' | 'published' | 'completed' | 'archived';
  assets: Partial<
    Record<
      Category,
      {
        files: Record<string, File>;
        main: string;
        language: CadKernelProvider;
        parameters: Record<string, unknown>;
      }
    >
  >;
};
