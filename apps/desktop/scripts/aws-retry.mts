/**
 * Retry and timeout settings for the `aws s3api` calls that publish desktop releases to R2.
 *
 * The promote step's server-side `copy-object` of an archive outlasted the CLI's default
 * 60-second read timeout 15 times in two days (2026-11-05 to 2026-11-07, Brain
 * research/ci-throughput-review.md, R-M) and each failure needed a manual rerun. Every
 * call here is idempotent (a get, a put of the same body, or a copy with a fixed
 * destination), so the CLI may retry it. A caller's own `AWS_RETRY_MODE` or
 * `AWS_MAX_ATTEMPTS` wins.
 */

/** Global CLI options placed before `s3api`. Seconds. */
export const awsRetryOptions = ['--cli-read-timeout', '300', '--cli-connect-timeout', '60'] as const;

export function awsRetryEnvironment(environment: NodeJS.ProcessEnv = process.env): NodeJS.ProcessEnv {
  return {
    ...environment,
    // eslint-disable-next-line @typescript-eslint/naming-convention -- environment variables keep their wire names.
    AWS_RETRY_MODE: environment['AWS_RETRY_MODE'] ?? 'standard',
    // eslint-disable-next-line @typescript-eslint/naming-convention -- environment variables keep their wire names.
    AWS_MAX_ATTEMPTS: environment['AWS_MAX_ATTEMPTS'] ?? '5',
  };
}
