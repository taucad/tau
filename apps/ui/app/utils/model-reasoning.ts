import { reasoningLevels } from '@taucad/chat/constants';
import type { ReasoningLevel } from '@taucad/chat/constants';
import type { Model } from '#hooks/use-models.js';
import type { AgentHostAdmissionConfig } from '#workers/agent-host.contract.js';

/**
 * What a model is on, and what it lets the person choose.
 *
 * The picker and the admission path read the same three functions, so the
 * level the composer shows can never differ from the level a turn admits.
 */

/** The reasoning controls one admitted Tau turn carries. @public */
export type ModelReasoning = NonNullable<AgentHostAdmissionConfig['model']['reasoning']>;

/**
 * The reasoning a catalog row sends by default, in the host's one shape.
 *
 * The catalog keeps each provider's own field — Anthropic's adaptive thinking
 * and `outputConfig.effort`, Vertex's `thinkingLevel`, everyone else's
 * `reasoning` — because those fields are also what the API's name and commit
 * profiles hand to LangChain. This is the one reader that collapses them.
 *
 * @param model - The catalog row, when the catalog has loaded.
 * @returns The default reasoning, or `undefined` for a model with none.
 * @public
 */
export const modelReasoning = (model: Model | undefined): ModelReasoning | undefined => {
  const configuration = model?.configuration;
  switch (model?.provider.id) {
    case 'anthropic': {
      if (configuration?.thinking?.type === 'enabled') {
        return { budgetTokens: configuration.thinking.budget_tokens };
      }
      if (configuration?.thinking?.type === 'adaptive') {
        return {
          ...(configuration.outputConfig?.effort === undefined ? {} : { effort: configuration.outputConfig.effort }),
          ...(configuration.thinking.display === undefined ? {} : { display: configuration.thinking.display }),
        };
      }
      return undefined;
    }
    case 'vertexai': {
      const effort = configuration?.thinkingLevel?.toLowerCase();
      return effort === 'low' || effort === 'medium' || effort === 'high' ? { effort } : undefined;
    }
    case undefined: {
      return undefined;
    }
    default: {
      return configuration?.reasoning;
    }
  }
};

/**
 * The levels a person can choose for a model, ascending.
 *
 * Empty for a model with no effort to change — a fixed thinking budget, no
 * reasoning at all, or a provider whose wire Tau sends no level on. Empty is
 * the one condition that hides the reasoning control.
 *
 * @param model - The catalog row, when the catalog has loaded.
 * @returns The offered levels, or an empty list.
 * @public
 */
export const offeredReasoningLevels = (model: Model | undefined): readonly ReasoningLevel[] =>
  modelReasoning(model)?.effort === undefined ? [] : (model?.support?.reasoning?.levels ?? []);

/**
 * A chosen level, carried onto a model: the same level when the model offers
 * it, else the highest it offers below it, else its lowest.
 *
 * A level a model does not offer would fail the turn (Vertex refuses anything
 * past `high`), so it never survives a model change.
 *
 * @param model - The model the level is carried onto.
 * @param effort - The chosen level, if any.
 * @returns A level the model accepts, or `undefined` when there is nothing to carry.
 * @public
 */
export const clampEffort = (
  model: Model | undefined,
  effort: ReasoningLevel | undefined,
): ReasoningLevel | undefined => {
  const offered = offeredReasoningLevels(model);
  if (effort === undefined || offered.length === 0) {
    return undefined;
  }
  if (offered.includes(effort)) {
    return effort;
  }
  const rank = reasoningLevels.indexOf(effort);
  return offered.filter((level) => reasoningLevels.indexOf(level) <= rank).at(-1) ?? offered[0];
};

/**
 * The level a chat runs a model at: its own choice, clamped, else the
 * model's default.
 *
 * @param model - The chat's model.
 * @param effort - The chat's chosen level, if any.
 * @returns The level in force, or `undefined` for a model with no levels.
 * @public
 */
export const effectiveEffort = (
  model: Model | undefined,
  effort: ReasoningLevel | undefined,
): ReasoningLevel | undefined => {
  if (offeredReasoningLevels(model).length === 0) {
    return undefined;
  }
  return clampEffort(model, effort) ?? modelReasoning(model)?.effort;
};

/**
 * The reasoning one turn admits: the model's default controls, with the
 * chat's level in place of the default effort.
 *
 * @param model - The chat's model.
 * @param effort - The chat's chosen level, if any.
 * @returns The admitted reasoning, or `undefined` for a model with none.
 * @public
 */
export const admittedReasoning = (
  model: Model | undefined,
  effort: ReasoningLevel | undefined,
): ModelReasoning | undefined => {
  const reasoning = modelReasoning(model);
  const chosen = clampEffort(model, effort);
  return reasoning === undefined || chosen === undefined ? reasoning : { ...reasoning, effort: chosen };
};
