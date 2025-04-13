import { Cog, Zap, Cpu } from 'lucide-react';

export const cadProviders = ['replicad', 'openscad', 'kicad', 'kcl', 'cpp'] as const;
export type CadProvider = (typeof cadProviders)[number];

export const modelProviders = ['sambanova', 'openai', 'anthropic', 'ollama'] as const;
export type ModelProvider = (typeof modelProviders)[number];

export const categories = {
  mechanical: { icon: Cog, color: 'text-blue' },
  electrical: { icon: Zap, color: 'text-yellow' },
  firmware: { icon: Cpu, color: 'text-purple' },
} as const;
export type Category = keyof typeof categories;
