/**
 * What a person makes, as the agent is told it. These are setup's goals except "Just exploring", which tells the
 * agent nothing it can use and is never sent.
 *
 * @public
 */
export const personGoals = ['printing', 'mechanical', 'electronics', 'product', 'art'] as const;

/** One of {@link personGoals}. @public */
export type PersonGoal = (typeof personGoals)[number];

/**
 * The languages a person reads, as the agent is told them. `none` is "I'd rather not write code".
 *
 * @public
 */
export const personLanguages = ['typescript', 'python', 'openscad', 'csharp', 'none'] as const;

/** One of {@link personLanguages}. @public */
export type PersonLanguage = (typeof personLanguages)[number];
