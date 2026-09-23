/** The self-host build prices nothing, so its models are one list. */
export const groupModelsByTier = <T>(models: readonly T[]): Array<{ name: string; items: T[] }> =>
  models.length === 0 ? [] : [{ name: 'Models', items: [...models] }];
