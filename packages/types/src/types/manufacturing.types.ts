import type { manufacturingMethodConfigurations } from '#constants/manufacturing.constants.js';

export type { ManufacturingMethodConfiguration } from '#constants/manufacturing.constants.js';

export type ManufacturingMethod = keyof typeof manufacturingMethodConfigurations;
