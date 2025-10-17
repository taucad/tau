import type { modelFamilies, modelProviders } from '#constants/model.constants.js';

export type ModelProvider = (typeof modelProviders)[number];

export type ModelFamily = (typeof modelFamilies)[number];

export type Model = {
  id: string;
  model: string;
  name: string;
  slug: string;
  description?: string;
  provider: {
    id: ModelProvider;
    name: string;
  };
  contextLength: number;
  details: {
    family: ModelFamily;
    parameterSize: string;
  };
};
