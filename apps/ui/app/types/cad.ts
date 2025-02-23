import { Cog, Zap, Cpu } from 'lucide-react';

export const CAD_PROVIDERS = ['replicad', 'openscad', 'kicad', 'kcl', 'cpp'] as const;
export type CadProvider = (typeof CAD_PROVIDERS)[number];

export const MODEL_PROVIDERS = ['sambanova', 'openai', 'anthropic', 'ollama'] as const;
export type ModelProvider = (typeof MODEL_PROVIDERS)[number];

export const CATEGORIES = {
  mechanical: { icon: Cog, color: 'text-blue' },
  electrical: { icon: Zap, color: 'text-yellow' },
  firmware: { icon: Cpu, color: 'text-purple' },
} as const;
export type Category = keyof typeof CATEGORIES;
