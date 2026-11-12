import { z } from 'zod';

/**
 * The five tips of the product tour, in the order they are shown: ask, look, adjust, verify, build.
 *
 * @public
 */
export const tourStepIds = ['ask', 'look', 'adjust', 'verify', 'build'] as const;

/**
 * One of {@link tourStepIds}.
 *
 * @public
 */
export type TourStepId = (typeof tourStepIds)[number];

/**
 * How far setup went, in merge order: a later status never gives way to an earlier one.
 *
 * @public
 */
export const setupStatuses = ['offered', 'skipped', 'completed'] as const;

/**
 * One of {@link setupStatuses}.
 *
 * @public
 */
export type SetupStatus = (typeof setupStatuses)[number];

/**
 * How the guided tour ended, in merge order.
 *
 * @public
 */
export const tourEndings = ['dismissed', 'completed'] as const;

/**
 * One of {@link tourEndings}.
 *
 * @public
 */
export type TourEnding = (typeof tourEndings)[number];

/**
 * The `onboarding` section. It only grows: `seen` gains ids, `ended` is set once, `setup.status` only rises.
 *
 * @public
 */
export const onboardingStateSchema = z.strictObject({
  version: z.literal(1),
  setup: z.strictObject({ status: z.enum(setupStatuses) }).optional(),
  tour: z.strictObject({
    wanted: z.boolean().optional(),
    seen: z.array(z.enum(tourStepIds)).max(tourStepIds.length),
    ended: z.enum(tourEndings).optional(),
  }),
});

/**
 * A parsed `onboarding` section.
 *
 * @public
 */
export type OnboardingState = z.infer<typeof onboardingStateSchema>;

/**
 * Onboarding before setup was offered.
 *
 * @public
 */
export const emptyOnboardingState: OnboardingState = Object.freeze({ version: 1, tour: { seen: [] } });

/**
 * One write to the `onboarding` section: only what this write changes. Account sync sends the same shape.
 *
 * @public
 */
export type OnboardingDelta = Readonly<{
  setupStatus?: SetupStatus;
  seenAdd?: readonly TourStepId[];
  ended?: TourEnding;
  wanted?: boolean;
}>;

const higher = <T extends string>(order: readonly T[], left: T | undefined, right: T | undefined): T | undefined => {
  if (left === undefined) {
    return right;
  }
  if (right === undefined) {
    return left;
  }
  return order.indexOf(right) > order.indexOf(left) ? right : left;
};

/**
 * Merge one write into the stored onboarding state: `setup.status` keeps the higher of offered, skipped and completed;
 * `seen` is the union, in tour order; `ended` keeps the higher of dismissed and completed; `wanted` changes only when
 * the write sets it. A tab holding a stale copy can add to progress and never remove from it.
 *
 * @param stored - The section as stored, read immediately before the write.
 * @param delta - What this write changes.
 * @returns The merged section.
 *
 * @example <caption>A stale tab marks a tip seen</caption>
 * ```typescript
 * import { emptyOnboardingState, mergeOnboarding } from '@taucad/preferences';
 *
 * const next = mergeOnboarding(emptyOnboardingState, { seenAdd: ['ask'] });
 * console.log(next.tour.seen); // ['ask']
 * ```
 *
 * @public
 */
export const mergeOnboarding = (stored: OnboardingState, delta: OnboardingDelta): OnboardingState => {
  const status = higher(setupStatuses, stored.setup?.status, delta.setupStatus);
  const seen = new Set<TourStepId>([...stored.tour.seen, ...(delta.seenAdd ?? [])]);
  const ended = higher(tourEndings, stored.tour.ended, delta.ended);
  const wanted = delta.wanted ?? stored.tour.wanted;
  return {
    version: 1,
    ...(status === undefined ? {} : { setup: { status } }),
    tour: {
      ...(wanted === undefined ? {} : { wanted }),
      seen: tourStepIds.filter((id) => seen.has(id)),
      ...(ended === undefined ? {} : { ended }),
    },
  };
};

/**
 * The write that carries a whole onboarding state, for merging one full copy into another (account sync).
 *
 * @param state - The copy to merge in.
 * @returns A delta that adds everything the copy holds.
 *
 * @public
 */
export const onboardingDeltaOf = (state: OnboardingState): OnboardingDelta => ({
  ...(state.setup === undefined ? {} : { setupStatus: state.setup.status }),
  seenAdd: state.tour.seen,
  ...(state.tour.ended === undefined ? {} : { ended: state.tour.ended }),
  ...(state.tour.wanted === undefined ? {} : { wanted: state.tour.wanted }),
});
