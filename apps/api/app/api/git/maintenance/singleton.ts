/**
 * The process group the lifecycle jobs run in (charter D21, NI10). Purge, blob
 * collection and restore must run once, not once per replica, so they live in
 * the `revisions-maintenance` command rather than in any module the API boots.
 */
export const maintenanceProcessGroup = 'revisions-maintenance';

/** The group that serves requests. Nothing destructive may run there. */
const requestProcessGroup = 'app';

/**
 * Refuses a maintenance run inside a request-serving replica.
 *
 * Fly names the group it started a Machine as in `FLY_PROCESS_GROUP`, so the
 * check is against the platform's own answer rather than a variable a
 * deployment could forget to set. An absent value is an operator running the
 * command by hand — locally or over `fly ssh console` — which is the intended
 * use and stays permitted; only the positive statement "this is an `app`
 * replica" is refused, because that is the one arrangement D21 forbids.
 */
export const assertSingletonProcessGroup = (
  environment: Readonly<Record<string, string | undefined>> = process.env,
): void => {
  const group = environment['FLY_PROCESS_GROUP'];
  if (group === requestProcessGroup) {
    throw new Error(
      `Refusing to run maintenance in the '${requestProcessGroup}' process group: charter D21 runs purge, blob collection and restore once, in the '${maintenanceProcessGroup}' group.`,
    );
  }
};
