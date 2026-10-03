import type { CadAgentExecution, TauAgentExecution } from '@taucad/chat';

/**
 * Which execution a new chat starts on, and whether a Tau model can start at all.
 *
 * The Lean model `apps/ui/specs/lean/NewChatExecution.lean` specifies both functions and proves the continuity
 * properties; `new-chat-execution.differential.test.ts` checks this file against its goldens.
 */

/** The model catalog as the API last answered it: still asking, failed or empty, or a list of rows. */
export type ModelCatalog =
  | Readonly<{ status: 'loading' }>
  | Readonly<{ status: 'unavailable' }>
  | Readonly<{ status: 'loaded'; models: ReadonlyArray<Readonly<{ id: string; recommended?: boolean }>> }>;

/** Why a Tau model can or cannot start: the reason the picker shows and admission refuses with. */
export type TauModelReadiness = 'ready' | 'checking' | 'catalog-unavailable' | 'not-offered';

/**
 * Whether the catalog backs a Tau model. A Tau turn needs its catalog row (the provider wire), so a model the
 * catalog cannot name cannot run; an empty answer is as unusable as a failed one.
 *
 * @param modelId - The Tau model.
 * @param catalog - The catalog state.
 * @returns The readiness.
 */
export const tauModelReadiness = (modelId: string, catalog: ModelCatalog): TauModelReadiness => {
  if (catalog.status === 'loading') {
    return 'checking';
  }
  if (catalog.status === 'unavailable' || catalog.models.length === 0) {
    return 'catalog-unavailable';
  }
  return catalog.models.some((model) => model.id === modelId) ? 'ready' : 'not-offered';
};

/**
 * Why a Tau model cannot start, in words the person can act on: the picker shows it before send, and admission
 * refuses with it.
 *
 * @param modelId - The Tau model.
 * @param readiness - What the catalog says about it.
 * @returns The reason, or `undefined` while it can start or the catalog is still answering.
 */
export const tauModelRefusal = (modelId: string, readiness: TauModelReadiness): string | undefined =>
  readiness === 'not-offered'
    ? `${modelId} is no longer offered. Pick a different model.`
    : readiness === 'catalog-unavailable'
      ? "Tau can't reach its model list, so it can't start a Tau model. Check your connection, or pick another agent."
      : undefined;

/**
 * The execution a new chat starts on: the last one used, of any kind.
 *
 * An external agent is kept as it was: its availability is its host's to judge. A Tau model the loaded catalog no
 * longer offers moves to the recommended model, keeping host and level; without a usable catalog nothing is rewritten
 * and {@link tauModelReadiness} says why it cannot start.
 *
 * @param input - The last execution used, the last Tau choice (when nothing else was remembered), and the catalog.
 * @returns The new chat's execution.
 */
export const resolveNewChatExecution = (input: {
  readonly last: CadAgentExecution | undefined;
  readonly lastTau: TauAgentExecution;
  readonly catalog: ModelCatalog;
}): CadAgentExecution => {
  const base = input.last ?? input.lastTau;
  if (base.kind !== 'tau' || input.catalog.status !== 'loaded') {
    return base;
  }
  const { models } = input.catalog;
  const fallback = models.find((model) => model.recommended === true) ?? models[0];
  return fallback === undefined || models.some((model) => model.id === base.model)
    ? base
    : { ...base, model: fallback.id };
};
