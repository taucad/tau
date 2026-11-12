import { isKernelId, resolveKernel } from '@taucad/types/constants';
import type { KernelId, KernelPreference } from '@taucad/types/constants';
import type { ChatExample, ExampleGoal } from '#constants/chat-prompt-examples.js';

/**
 * A goal the person can have stored: an example goal other than `general`, or "Just exploring", which picks the same
 * suggestions as no goal at all.
 *
 * @public
 */
export type SuggestionGoal = Exclude<ExampleGoal, 'general'> | 'exploring';

/** A polynomial string hash modulo a prime below 2^31, the seed of {@link seededOrder}. */
const hash = (text: string): number => {
  let value = 7;
  for (const character of text) {
    value = (value * 131 + (character.codePointAt(0) ?? 0)) % 2_147_483_629;
  }
  return value;
};

/** The examples in an order fixed by the seed: each one ranked by a hash of the seed and its id. */
const seededOrder = (examples: readonly ChatExample[], seed: string): ChatExample[] =>
  examples
    .map((example) => ({ example, rank: hash(`${seed}:${example.id}`) }))
    .sort((left, right) => left.rank - right.rank || left.example.id.localeCompare(right.example.id))
    .map(({ example }) => example);

/**
 * Whether an example can be shown with this selection on this host. An example with no `needs` always can. One with
 * `needs` can only when an entitled kernel provides that representation, and, under a manual pick, only when the
 * picked kernel provides it.
 */
const isEligible = (example: ChatExample, selection: KernelPreference, entitled: readonly KernelId[]): boolean => {
  const { needs } = example;
  if (needs === undefined) {
    return true;
  }
  const provides = (kernel: KernelId): boolean => resolveKernel(kernel).representation === needs;
  if (!entitled.some((kernel) => provides(kernel))) {
    return false;
  }
  return selection === 'auto' || (isKernelId(selection) && provides(selection));
};

/**
 * Choose the suggestions to show. With goals, every suggestion carries one of them and each goal gets one before any
 * goal gets a second, goals taken in the order given. With no goals, or only "Just exploring", they are `general`
 * examples. The same arguments always give the same suggestions in the same order, so a page that keeps its seed for a
 * load keeps its row.
 *
 * @param examples - The examples to choose from.
 * @param goals - The person's stored goals.
 * @param selection - The kernel preference: `auto`, or the kernel the person picked.
 * @param entitled - The kernels this host may run for the person.
 * @param seed - Fixes the order; keep one per page load.
 * @param count - At most how many to return.
 * @returns The suggestions, in display order.
 * @public
 */
// oxlint-disable-next-line max-params -- the five inputs the suggestions depend on, plus the count
export const pickSuggestions = (
  examples: readonly ChatExample[],
  goals: readonly SuggestionGoal[],
  selection: KernelPreference,
  entitled: readonly KernelId[],
  seed: string,
  count = 4,
): ChatExample[] => {
  const pool = seededOrder(
    examples.filter((example) => isEligible(example, selection, entitled)),
    seed,
  );
  const chosen = [...new Set(goals)].filter((goal): goal is Exclude<ExampleGoal, 'general'> => goal !== 'exploring');
  if (chosen.length === 0) {
    return pool.filter((example) => example.goals.includes('general')).slice(0, count);
  }
  const queues = chosen.map((goal) => pool.filter((example) => example.goals.includes(goal)));
  const picked: ChatExample[] = [];
  const taken = new Set<string>();
  let isProgressing = true;
  while (picked.length < count && isProgressing) {
    isProgressing = false;
    for (const queue of queues) {
      const next = queue.find((example) => !taken.has(example.id));
      if (next !== undefined && picked.length < count) {
        picked.push(next);
        taken.add(next.id);
        isProgressing = true;
      }
    }
  }
  return picked;
};
