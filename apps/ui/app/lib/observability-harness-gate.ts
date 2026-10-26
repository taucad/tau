/** Only explicitly opted-in staging builds contain the failure harness. */
export const isObservabilityHarnessBuild = (environment: Readonly<Record<string, string | undefined>>): boolean =>
  /^(1|true)$/iu.test(environment['TAU_DEBUG'] ?? '') && environment['SENTRY_ENVIRONMENT'] === 'staging';
