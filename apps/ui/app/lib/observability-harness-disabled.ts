/** Production reporter seams have no harness behavior or query parsing. */
export const isObservabilityHarnessEnabled = (): boolean => false;
export const isObservabilityHarnessDirect = (): boolean => false;
export const observabilityHarnessTags = (): Readonly<Record<string, string>> => ({});
