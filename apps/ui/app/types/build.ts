import type { CadLanguage, Category } from './cad';
import type { Message } from './chat';

type File = {
  content: string;
};

export interface Build {
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
  // status: 'draft' | 'review' | 'published' | 'completed' | 'archived';
  assets: {
    [key in Category]?: {
      files: Record<string, File>;
      main: string;
      language: CadLanguage;
    };
  };
}
