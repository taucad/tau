/**
 * The permission mode an external agent's chat runs in (ruling PR5).
 *
 * One rule for every agent, keyed on the mode ids the agent advertises; the
 * per-agent knowledge is the profile's `defaultModePreference` (best first,
 * `auto` leading). A chat starts in the first preferred mode the agent or its
 * model offers now; a mode that lifts every vendor check ({@link bypassModeIds})
 * is never chosen by Tau, except Grok's {@link grokNoAutoFallback} (PR5 amendment). Plan
 * modes leave the menu.
 * A mode the person picked is kept while the agent still offers it.
 *
 * Names and descriptions stay the adapter's own: this module only filters
 * values and picks one, it never renames them.
 */

import type {
  SessionConfigOption,
  SessionConfigSelectGroup,
  SessionConfigSelectOption,
} from '@agentclientprotocol/sdk';

/** The mode id an agent advertises for classifier-approved autonomy. */
export const autoModeId = 'auto';

/** The mode id every reviewed agent uses for planning without executing (Claude, Codex collaboration, Grok). */
export const planModeId = 'plan';

/**
 * Mode ids that lift every vendor check: Claude `bypassPermissions`, Codex
 * `agent-full-access` and Grok `always-approve` (yolo). Tau never picks one;
 * the person still can.
 */
export const bypassModeIds: ReadonlySet<string> = new Set(['bypassPermissions', 'agent-full-access', 'always-approve']);

/**
 * The mode a Grok chat starts in when Grok does not offer `auto` (Grok reports
 * auto availability late, or not at all): `always-approve`, by operator ruling
 * (PR5 amendment, operator 2026-11-17T03:42Z). It is the only bypass id a
 * default may choose; `'ask'` is the one-line alternative.
 */
export const grokNoAutoFallback: 'always-approve' | 'ask' = 'always-approve';

/* Ids a default never chooses: plan modes, and every bypass but Grok's ruled fallback. */
const excludedFromDefault = (id: string): boolean =>
  id === planModeId || (bypassModeIds.has(id) && id !== grokNoAutoFallback);

type SelectOption = Extract<SessionConfigOption, { readonly type: 'select' }>;

/** A select option's values, with any groups flattened. */
const valuesOf = (option: SelectOption): string[] =>
  option.options.flatMap((entry) => ('options' in entry ? entry.options : [entry])).map((entry) => entry.value);

/**
 * The session's permission-mode select: the option whose category is `mode`.
 *
 * @param options - The session's configuration options.
 * @returns The mode option, or `undefined` when the agent offers none.
 */
export const modeOptionOf = (options: readonly SessionConfigOption[] | undefined): SelectOption | undefined =>
  options?.find((option): option is SelectOption => option.category === 'mode' && option.type === 'select');

/**
 * The mode a chat starts in, from the ids the agent offers now.
 *
 * @param offered - Mode ids the agent offers, in its order.
 * @param preference - The profile's `defaultModePreference`, best first; `[auto]` when absent.
 * @returns The first preferred id offered that is not excluded, else `undefined` (leave the agent's own).
 */
export const defaultModeOf = (
  offered: readonly string[],
  preference: readonly string[] = [autoModeId],
): string | undefined => preference.find((id) => !excludedFromDefault(id) && offered.includes(id));

/** Which mode a turn runs in, and whether Tau chose it. */
export type ModeDecision = {
  readonly configId: string;
  readonly value: string;
  /** `true` when Tau's default chose it; `false` when it is the person's pick. */
  readonly defaulted: boolean;
};

/**
 * The mode one turn runs in.
 *
 * The composer echoes every confirmed value back with each turn, so a
 * requested mode equal to the one Tau last chose by default (`defaulted`) is
 * not a pick, and the default is chosen again — which is how a model switch
 * that brings `auto` back moves a defaulted chat to it. Any other requested
 * mode is the person's and is kept while it is offered; a plan mode, or a
 * pick the agent no longer offers (Claude `auto` on a model without it),
 * falls back to the default.
 *
 * @param input - What the turn asks and what the agent offers.
 * @param input.option - The session's mode option.
 * @param input.offered - Ids the agent offers now; Grok's unverified `auto` is not offered.
 * @param input.requested - The mode the turn's configuration names, if any.
 * @param input.defaulted - The mode Tau last chose by default for this chat; absent when the person picked.
 * @param input.preference - The profile's `defaultModePreference`.
 * @returns The decision, or `undefined` when there is nothing to choose.
 */
export const modeDecisionOf = ({
  option,
  offered,
  requested,
  defaulted,
  preference,
}: {
  readonly option: SelectOption;
  readonly offered: readonly string[];
  readonly requested: unknown;
  readonly defaulted: string | undefined;
  readonly preference: readonly string[] | undefined;
}): ModeDecision | undefined => {
  const configId = option.id;
  if (
    typeof requested === 'string' &&
    requested !== defaulted &&
    requested !== planModeId &&
    offered.includes(requested)
  ) {
    return { configId, value: requested, defaulted: false };
  }
  const value = defaultModeOf(offered, preference);
  if (value !== undefined) {
    return { configId, value, defaulted: true };
  }
  /* No reviewed default is offered: keep the agent's own mode unless it is a plan mode. */
  const current = typeof option.currentValue === 'string' ? option.currentValue : undefined;
  const kept = current === planModeId ? offered.find((id) => !excludedFromDefault(id)) : current;
  return kept === undefined ? undefined : { configId, value: kept, defaulted: true };
};

/**
 * The values of every non-model select a plan value is dropped from, for the menu.
 *
 * A select left with one value, once its plan value is gone (Codex's
 * collaboration mode, Grok's planning), leaves the menu altogether. A plan
 * value the session is in right now stays, so the menu can show it and the
 * person can leave it.
 *
 * @param options - The session's configuration options.
 * @returns The options the menu shows.
 */
export const withoutPlanModes = (options: readonly SessionConfigOption[]): SessionConfigOption[] =>
  options.flatMap((option): SessionConfigOption[] => {
    if (
      option.type !== 'select' ||
      option.category === 'model' ||
      option.currentValue === planModeId ||
      !valuesOf(option).includes(planModeId)
    ) {
      return [option];
    }
    const entries = withoutPlanValues(option.options);
    return valuesOf({ ...option, options: entries }).length <= 1 ? [] : [{ ...option, options: entries }];
  });

/* A select's entries without the plan value, keeping their flat or grouped shape. */
const withoutPlanValues = (entries: SelectOption['options']): SelectOption['options'] => {
  const flat: SessionConfigSelectOption[] = [];
  const groups: SessionConfigSelectGroup[] = [];
  for (const entry of entries) {
    if ('options' in entry) {
      const kept = entry.options.filter((value) => value.value !== planModeId);
      if (kept.length > 0) {
        groups.push({ ...entry, options: kept });
      }
    } else if (entry.value !== planModeId) {
      flat.push(entry);
    }
  }
  return groups.length > 0 ? groups : flat;
};

/**
 * The options a discovery listing shows for a chat that has not started: plan
 * values gone and the mode option set to what the first turn will choose.
 *
 * @param options - The discovery session's options.
 * @param preference - The profile's `defaultModePreference`.
 * @returns The options as a new chat will see them.
 */
export const discoveredModeOptions = (
  options: readonly SessionConfigOption[],
  preference: readonly string[] | undefined,
): SessionConfigOption[] => {
  const mode = modeOptionOf(options);
  /* The first turn's own decision, so a discovery session that opens in plan shows its fallback, not plan. */
  const value =
    mode === undefined
      ? undefined
      : modeDecisionOf({
          option: mode,
          offered: valuesOf(mode),
          requested: undefined,
          defaulted: undefined,
          preference,
        })?.value;
  return withoutPlanModes(
    options.map((option) => (option === mode && value !== undefined ? { ...option, currentValue: value } : option)),
  );
};

/**
 * The ids a mode option offers.
 *
 * @param option - A select option.
 * @returns Its values, groups flattened.
 */
export const modeValuesOf = (option: SelectOption): string[] => valuesOf(option);
