/**
 * Grok's own model-list push, `_x.ai/models/update`, read as a model config option refresh.
 *
 * Grok never sends ACP's `config_option_update` for its models. After `session/new` it sends this
 * notification instead, carrying the shape of ACP's unstable `SessionModelState`. A CLI that started
 * on an expired but renewable sign-in answers `session/new` with its built-in models only, and the
 * full list arrives here, so dropping it leaves the selector short until the next restart.
 */
import { z } from 'zod';
import type { SessionConfigOption } from '@agentclientprotocol/sdk';

/** Validate the pushed model state before it reaches the session. @internal */
export const grokModelsSchema = z.object({
  currentModelId: z.string().min(1),
  availableModels: z
    .array(
      z.object({
        modelId: z.string().min(1),
        name: z.string().min(1),
        description: z.string().nullish(),
      }),
    )
    .min(1),
});

/** One validated `_x.ai/models/update`. @internal */
export type GrokModels = z.infer<typeof grokModelsSchema>;

/**
 * The session's options with the pushed list as its model choice.
 *
 * Replaces the `category: 'model'` select's choices and current value, as a `config_option_update`
 * re-listing that option would, and keeps its id so `session/set_config_option` still names it.
 *
 * @param options - The options the session last reported.
 * @param models - The pushed model state.
 * @returns The refreshed options, or `undefined` while the session offers no model select to refresh.
 * @internal
 */
export const withGrokModels = (
  options: readonly SessionConfigOption[] | undefined,
  models: GrokModels,
): SessionConfigOption[] | undefined => {
  const index = options?.findIndex((option) => option.category === 'model' && option.type === 'select') ?? -1;
  const option = options?.[index];
  if (!options || option?.type !== 'select') {
    return undefined;
  }
  const refreshed: SessionConfigOption = {
    ...option,
    currentValue: models.currentModelId,
    options: models.availableModels.map((model) => ({
      value: model.modelId,
      name: model.name,
      ...(typeof model.description === 'string' ? { description: model.description } : {}),
    })),
  };
  return options.map((candidate, position) => (position === index ? refreshed : candidate));
};
