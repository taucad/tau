/**
 * How a picker lines up an agent's models and effort levels, from nothing but
 * what the agent itself says: names, descriptions and the value a fresh session
 * starts on. One set of rules serves Tau's catalog and every ACP agent, so a new
 * agent needs no code of its own (`docs/research/chat-agent-picker-parity-blueprint.md`).
 */

/** One value an agent offers: a model or an effort level. */
export type LineupChoice = {
  readonly id: string;
  readonly name: string;
  readonly description?: string | undefined;
};

/**
 * An agent's own text without its "Recommended": the picker says that with a badge.
 *
 * @param text - A label or description as the agent wrote it.
 * @returns The text without the word, and whether the agent recommended the value.
 */
export const withoutRecommended = (text: string): { readonly text: string; readonly isRecommended: boolean } => {
  const stripped = text
    .replaceAll(/\s*\(recommended\)/gi, '')
    // A sentence of its own: "Thorough reasoning and quality. Recommended."
    .replaceAll(/(^|[!.?])\s*recommended\s*[!.]?/gi, '$1')
    // A trailing aside: "High, recommended" or "High - recommended".
    .replace(/\s*[,:;–—-]\s*recommended[!.]?$/i, '')
    .trim();
  return { text: stripped, isRecommended: stripped !== text.trim() };
};

/** A value that stands for "whatever the agent picks": Claude Code's `default` model and effort. */
export const isDefaultChoice = (choice: Pick<LineupChoice, 'id' | 'name'>): boolean =>
  choice.id === 'default' || /^default\b/i.test(choice.name);

/**
 * The real value behind the one a session runs on. A default alias names its
 * target in its description or label ("Default (recommended)", described as
 * "Opus 5.5"), so it resolves to the listed value with that name.
 *
 * @param choices - The values the agent lists, in its order.
 * @param current - The value in force: the user's choice, else the session's `currentValue`.
 * @returns The concrete value, or `current` when it is not an alias.
 */
export const resolveDefaultChoice = (
  choices: readonly LineupChoice[],
  current: string | undefined,
): string | undefined => {
  const alias = choices.find((choice) => choice.id === current);
  if (alias === undefined || !isDefaultChoice(alias)) {
    return current;
  }
  const concrete = choices.filter((choice) => !isDefaultChoice(choice));
  const hint = `${alias.description ?? ''} ${alias.name}`.toLowerCase();
  /* Matched without a "(recommended)" the agent may append to a concrete name. */
  const plain = (choice: LineupChoice): string => (withoutRecommended(choice.name).text || choice.name).toLowerCase();
  // Longest name first, so "Opus 5.5" wins over "Opus 5" in "Opus 5.5".
  const named = concrete
    .toSorted((left, right) => plain(right).length - plain(left).length)
    .find((choice) => hint.includes(plain(choice)));
  return (named ?? concrete[0])?.id ?? current;
};

type ParsedName = { readonly family: string; readonly version: readonly number[] | undefined };

/** Lower case, with runs of anything but letters and digits as one space: "-Sol" and " Sol" are both `sol`. */
const normalise = (text: string): string =>
  text
    .toLowerCase()
    .replaceAll(/[^\da-z]+/g, ' ')
    .trim();

/**
 * A model's family is its name around the version: "GPT-6.2-Sol" is family `gpt|sol` at 6.2, "Opus 5.5" is
 * `opus|` at 5.5, "Grok 4.7 Fast" is `grok|fast` at 4.7. A name with no number is a family of its own.
 */
const parseName = (name: string): ParsedName => {
  const match = /^(.*?)(\d+(?:\.\d+)*)(.*)$/.exec(name);
  if (match === null) {
    return { family: normalise(name), version: undefined };
  }
  return {
    family: `${normalise(match[1] ?? '')}|${normalise(match[3] ?? '')}`,
    version: (match[2] ?? '').split('.').map(Number),
  };
};

const compareVersions = (left: readonly number[], right: readonly number[]): number => {
  for (let index = 0; index < Math.max(left.length, right.length); index++) {
    const difference = (left[index] ?? 0) - (right[index] ?? 0);
    if (difference !== 0) {
      return difference;
    }
  }
  return 0;
};

/**
 * Splits a model list into the newest version of each family and the rest, as
 * Claude Code's picker does: Opus 5.5 at the top, Opus 5 under More models. A
 * variant is a family of its own, so GPT-6.1 Terra stays at the top beside
 * GPT-6.2-Sol while GPT-6.1-Sol goes under More models. Both halves keep the
 * listed order.
 *
 * @param items - The models, in the order to show them.
 * @param nameOf - The display name to parse.
 * @param isKeptOnTop - Rows that stay at the top regardless, such as the model in use.
 * @returns The rows for the top level and the rows for More models.
 */
export const latestInFamily = <T>(
  items: readonly T[],
  nameOf: (item: T) => string,
  isKeptOnTop: (item: T) => boolean = () => false,
): { readonly top: T[]; readonly more: T[] } => {
  const parsed = new Map(items.map((item) => [item, parseName(nameOf(item))]));
  const newest = new Map<string, readonly number[]>();
  for (const { family, version } of parsed.values()) {
    const known = newest.get(family);
    if (version !== undefined && (known === undefined || compareVersions(version, known) > 0)) {
      newest.set(family, version);
    }
  }
  const isTop = (item: T): boolean => {
    const { family, version } = parsed.get(item)!;
    const latest = newest.get(family);
    return isKeptOnTop(item) || version === undefined || latest === undefined || compareVersions(version, latest) === 0;
  };
  return { top: items.filter((item) => isTop(item)), more: items.filter((item) => !isTop(item)) };
};

/** Headed groups of rows, as a picker draws them; `name` is the heading. */
export type ModelGroups<T> = ReadonlyArray<{ readonly name: string | undefined; readonly items: readonly T[] }>;

/** A list in three cuts: every row (what a search covers), the top level, and the rows behind More models. */
export type ModelLineup<T> = {
  readonly all: ModelGroups<T>;
  readonly top: ModelGroups<T>;
  readonly more: ModelGroups<T>;
};

const cutGroups = <T>(groups: ModelGroups<T>, keep: ReadonlySet<T>): ModelGroups<T> =>
  groups
    .map((group) => ({ ...group, items: group.items.filter((item) => keep.has(item)) }))
    .filter((group) => group.items.length > 0);

/**
 * {@link latestInFamily} across grouped rows: each group keeps its heading in both cuts, and empty groups drop.
 *
 * @param all - The groups, in the order to show them.
 * @param nameOf - The display name to parse.
 * @param isKeptOnTop - Rows that never leave the top level.
 * @returns Every group, the top-level cut and the More models cut.
 */
export const lineupOf = <T>(
  all: ModelGroups<T>,
  nameOf: (item: T) => string,
  isKeptOnTop: (item: T) => boolean,
): ModelLineup<T> => {
  const { top, more } = latestInFamily(
    all.flatMap((group) => group.items),
    nameOf,
    isKeptOnTop,
  );
  return { all, top: cutGroups(all, new Set(top)), more: cutGroups(all, new Set(more)) };
};

/**
 * The effort level to badge Recommended.
 *
 * @param levels - The levels the agent offers, the "Default" sentinel included or not.
 * @param defaultValue - The level a fresh session starts on (discovery's `currentValue`), never the user's choice.
 * @returns The level's id, or `undefined` when nothing points to one.
 */
export const recommendedChoice = (
  levels: readonly LineupChoice[],
  defaultValue: string | undefined,
): string | undefined => {
  const concrete = levels.filter((level) => !isDefaultChoice(level));
  const marked = concrete.find(
    (level) =>
      withoutRecommended(level.name).isRecommended || withoutRecommended(level.description ?? '').isRecommended,
  );
  if (marked) {
    return marked.id;
  }
  if (concrete.some((level) => level.id === defaultValue)) {
    return defaultValue;
  }
  // ponytail: an agent whose "Default" names no level (Claude Code) runs medium, as Claude Code's own picker
  // recommends; read the level from the agent once ACP or the adapter publishes it.
  // Only when the agent offers its own "Default": without one, nothing recommends a level.
  return levels.some((level) => isDefaultChoice(level)) && concrete.some((level) => level.id === 'medium')
    ? 'medium'
    : undefined;
};
