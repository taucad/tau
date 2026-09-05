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
