/**
 * The aggregate tool-result budget of one batch (regression review R4).
 *
 * The LangChain plane let one batch of parallel tool results put at most 200,000 characters into context; past that
 * the largest fresh results were retained on disk and previewed. The session restores the cap: each model response's
 * calls share one {@link HostToolResultBudget}, which the registry spends as results arrive and which the next model
 * request resets. Reservation is synchronous, so concurrent calls cannot both take the last of it.
 *
 * Results are admitted in the order they finish rather than smallest first, so the result that overruns the batch is
 * the one retained. The plane chose the largest; finishing order needs no second pass over results already returned.
 *
 * @module
 */
import type { HostToolResultBudget } from '#waist/ports.js';

/** Characters one batch of tool results may put into context, as on the LangChain plane. @public */
export const toolResultBatchBudget = 200_000;

/**
 * Create one session's batch budget.
 *
 * @param limit - Characters per batch.
 * @returns The budget handed to each call, and a reset for each new model request.
 * @internal
 */
export const createToolResultBatchBudget = (
  limit: number = toolResultBatchBudget,
): Readonly<{ budget: HostToolResultBudget; reset: () => void }> => {
  let used = 0;
  return {
    budget: {
      admit: (characters) => {
        if (used + characters > limit) {
          return false;
        }
        used += characters;
        return true;
      },
      charge: (characters) => {
        used += characters;
      },
    },
    reset: () => {
      used = 0;
    },
  };
};
