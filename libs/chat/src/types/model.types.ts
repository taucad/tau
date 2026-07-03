import type { modelFamilies, modelProviders } from '#constants/model.constants.js';

/** @public */
export type ModelProvider = (typeof modelProviders)[number];

/** @public */
export type ModelFamily = (typeof modelFamilies)[number];

/** @public */
export type ModelInputModality = 'text' | 'image';

/** @public */
export type ModelOutputModality = 'text';

/** @public */
export type ModelModalities = {
  input: ModelInputModality[];
  output: ModelOutputModality[];
};

/** @public */
export type ModelSupport = {
  tools?: boolean;
  toolChoice?: boolean;
  modalities?: ModelModalities;
};

/** @public */
export const getModelInputModalities = (support?: ModelSupport): ModelInputModality[] =>
  support?.modalities?.input ?? ['text'];

/** @public */
export const modelSupportsInput = (support: ModelSupport | undefined, modality: ModelInputModality): boolean =>
  getModelInputModalities(support).includes(modality);

/** @public */
export const modelSupportsTools = (support?: ModelSupport): boolean => support?.tools !== false;

/** @public */
export type Model = {
  id: string;
  model: string;
  name: string;
  slug: string;
  description?: string;
  recommended?: boolean;
  provider: {
    id: ModelProvider;
    name: string;
  };
  contextLength?: number;
  details: {
    family: ModelFamily;
    families?: string[];
    parameterSize?: string;
    contextWindow?: number;
    maxTokens?: number;
    knowledgeCutoff?: string;
    cost?: {
      inputTokens: number;
      outputTokens: number;
      cacheReadTokens: number;
      cacheWriteTokens: number;
    };
  };
  configuration?: Record<string, unknown>;
  support?: ModelSupport;
};
