/**
 * "First brought": the one definition (blueprint I2, D1).
 *
 * The commits a push first brought are those its new branch and tag tips reach
 * and no branch or tag tip before it reached. Record refs (`refs/tau/*`) and
 * every other namespace take no part, the same rule the storage worker's
 * first-backup flag uses (R3-1).
 */

import type { Refs } from '#provenance/types.js';

const historyRef = /^refs\/(?:heads|tags)\//u;
const zeroId = /^0+$/u;

const historyTips = (references: Refs): Set<string> =>
  new Set(
    Object.entries(references)
      .filter(([name, id]) => historyRef.test(name) && id !== '' && !zeroId.test(id))
      .map(([, id]) => id),
  );

/**
 * The `git rev-list` arguments that list what a push first brought:
 * `<new branch and tag tips> --not <every branch and tag tip before>`.
 *
 * @param before - The repository's refs before the push.
 * @param after - Its refs after the push.
 * @returns The arguments, sorted for a stable command line; empty when the push brought no new tip.
 * @public
 */
export const historyNewArguments = (before: Refs, after: Refs): readonly string[] => {
  const old = historyTips(before);
  const tips = [...historyTips(after)].filter((id) => !old.has(id)).toSorted();
  if (tips.length === 0) {
    return Object.freeze([]);
  }
  return Object.freeze([...tips, '--not', ...[...old].toSorted()]);
};
