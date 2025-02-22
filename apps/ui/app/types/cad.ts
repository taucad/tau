import { Cog, Zap, Cpu } from 'lucide-react';

export const CAD_LANGUAGES = ['replicad', 'openscad', 'kicad', 'kcl', 'cpp'] as const;
export type CadLanguage = (typeof CAD_LANGUAGES)[number];

export const CATEGORIES = {
  mechanical: { icon: Cog, color: 'text-blue' },
  electrical: { icon: Zap, color: 'text-yellow' },
  firmware: { icon: Cpu, color: 'text-purple' },
} as const;
export type Category = keyof typeof CATEGORIES;
