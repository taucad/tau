import type { EngineeringDiscipline } from '#types/cad.types.js';

export type File = {
  content: Uint8Array<ArrayBuffer>;
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

export type Project = {
  id: string;
  name: string;
  description: string;
  author: {
    name: string;
    avatar: string;
  };
  tags: string[];
  thumbnail: string;
  createdAt: number;
  updatedAt: number;
  forkedFrom?: string;
  deletedAt?: number;
  // Status: 'draft' | 'review' | 'published' | 'completed' | 'archived';
  assets: Partial<Record<EngineeringDiscipline, Asset>>;
};
