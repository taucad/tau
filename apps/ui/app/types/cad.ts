import { Cog, Zap, Cpu } from 'lucide-react';

export const cadKernelProviders = ['replicad', 'openscad', 'kicad', 'kcl', 'cpp'] as const;
export type CadKernelProvider = (typeof cadKernelProviders)[number];

export const modelProviders = ['sambanova', 'openai', 'anthropic', 'ollama'] as const;
export type ModelProvider = (typeof modelProviders)[number];

export const categories = {
  mechanical: { icon: Cog, color: 'text-blue' },
  electrical: { icon: Zap, color: 'text-yellow' },
  firmware: { icon: Cpu, color: 'text-purple' },
} as const;
export type Category = keyof typeof categories;
