/**
 * Environment allowlist for forked utility processes (work item E2).
 *
 * `examples/electron` passes `{ ...process.env }` wholesale, which is fine for
 * an example and wrong for the app: a utility inherits the developer's shell,
 * every provider key in it, and — worse — `NODE_OPTIONS` and
 * `ELECTRON_RUN_AS_NODE`, either of which changes what the child *is*. This
 * mirrors the daemon's `minimalEnvironment` discipline
 * (`packages/host/src/runtime-child-supervisor.ts`): name what a child needs,
 * and nothing else reaches it.
 */

/**
 * The only names copied from main's own environment.
 *
 * `PATH` and the temp-directory trio are what Node itself needs; the locale
 * pair keeps kernel output deterministic across shells; `NODE_ENV` selects
 * production builds of the bundled dependencies.
 */
export const utilityEnvironmentNames = [
  'PATH',
  'TMPDIR',
  'TEMP',
  'TMP',
  'SystemRoot',
  'WINDIR',
  'LANG',
  'LC_ALL',
  'NODE_ENV',
  /* Opt-in frame tracing across every Tau process; absent unless the operator sets it. */
  'TAU_ELECTRON_DEBUG',
  'TAU_BUILD123D_RESOURCE_ROOT',
  'TAU_PICOGK_RESOURCE_ROOT',
] as const;

/**
 * Build the base environment every utility fork starts from.
 *
 * @param source - Environment to copy from. Defaults to main's own.
 * @param additions - Names this fork additionally needs, merged last.
 * @returns A fresh environment carrying only allowlisted names.
 */
export const utilityEnvironment = (
  source: NodeJS.ProcessEnv = process.env,
  additions: Readonly<Record<string, string>> = {},
): NodeJS.ProcessEnv => {
  const environment: NodeJS.ProcessEnv = {};
  for (const name of utilityEnvironmentNames) {
    const value = source[name];
    if (value !== undefined) {
      environment[name] = value;
    }
  }
  return Object.assign(environment, additions);
};
