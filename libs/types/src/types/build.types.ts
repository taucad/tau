import type { EngineeringDiscipline } from '#types/cad.types.js';

export type File = {
  content: Uint8Array;
  // Could add metadata in the future
  lastModified?: number;
  size?: number;
};

// Individual asset structure for a specific category
export type Asset = {
  main: string; // Points to the main entry file
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
  lastChatId?: string; // Reference to the last active chat
  createdAt: number;
  updatedAt: number;
  forkedFrom?: string;
  deletedAt?: number;
  // Status: 'draft' | 'review' | 'published' | 'completed' | 'archived';
  assets: Partial<Record<EngineeringDiscipline, Asset>>;
};
