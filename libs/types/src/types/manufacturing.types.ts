import type { icons } from 'lucide-react';
import type { manufacturingMethods } from '#constants/manufacturing.constants.js';

export type ManufacturingMethodConfiguration = {
  name: string;
  slug: string;
  description: string;
  icon: keyof typeof icons;
};

export type ManufacturingMethod = keyof typeof manufacturingMethods;
