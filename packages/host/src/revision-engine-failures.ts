/**
 * The engine failures a revision port raises, observed for field reporting.
 *
 * A port call that fails in the engine itself (`ENGINE_FAILED`, `ENGINE_UNAVAILABLE`) reaches the caller as it always
 * did; this only tells the host's reporter as well, with git's own words from the error's cause. Every other code is
 * a refusal the product already explains (a remote's status, a missing object, a conflict) and is not reported.
 */

import type { RevisionPort, RevisionPortError } from '@taucad/revisions';

/** The codes that mean the engine itself failed, not that a remote or the graph refused. @public */
export type RevisionEngineFailureCode = Extract<RevisionPortError['code'], 'ENGINE_FAILED' | 'ENGINE_UNAVAILABLE'>;

/**
 * One engine failure, before any redaction: the reporter that sends it off the machine redacts it.
 *
 * @public
 */
export type RevisionEngineFailure = Readonly<{
  code: RevisionEngineFailureCode;
  /** The port's own sentence, such as `Native Git failed worktree.` */
  message: string;
  /** The cause's message, which for a git command is everything it wrote to stderr. */
  detail?: string;
}>;

const engineFailureCodes: ReadonlySet<string> = new Set<RevisionEngineFailureCode>([
  'ENGINE_FAILED',
  'ENGINE_UNAVAILABLE',
]);

/**
 * The engine failure an error is, when it is one.
 *
 * Read structurally rather than with `instanceof`, so a port built against another copy of the package is read too.
 *
 * @param error - What a port call rejected with.
 * @returns The failure, or `undefined` for any other error.
 */
export const revisionEngineFailureOf = (error: unknown): RevisionEngineFailure | undefined => {
  if (!(error instanceof Error)) {
    return undefined;
  }
  const { code } = error as Error & { code?: unknown };
  if (typeof code !== 'string' || !engineFailureCodes.has(code)) {
    return undefined;
  }
  const { cause } = error;
  const detail = cause instanceof Error ? cause.message : typeof cause === 'string' ? cause : undefined;
  return {
    code: code as RevisionEngineFailureCode,
    message: error.message,
    ...(detail === undefined || detail.trim() === '' ? {} : { detail }),
  };
};

/**
 * The same port, telling `report` about each engine failure one of its calls raises.
 *
 * The call still rejects with the same error, and a reporter that throws is ignored: reporting never fails a call.
 *
 * @param port - The port to observe.
 * @param report - Called once per failed call.
 * @returns The observed port.
 */
export const observeRevisionEngineFailures = (
  port: RevisionPort,
  report: (failure: RevisionEngineFailure) => void,
): RevisionPort => {
  const observe = (error: unknown): void => {
    const failure = revisionEngineFailureOf(error);
    if (failure === undefined) {
      return;
    }
    try {
      report(failure);
    } catch {
      /* Reporting only. */
    }
  };
  /*
   * A copy, not a proxy: a port is frozen, and a proxy may not answer a frozen member with another function. The names
   * come from the port and its prototypes, so a class instance keeps the methods it inherits.
   */
  const names = new Set<string>();
  const owners: unknown[] = [port];
  for (
    let owner: unknown = Object.getPrototypeOf(port);
    owner !== Object.prototype && owner instanceof Object;
    owner = Object.getPrototypeOf(owner)
  ) {
    owners.push(owner);
  }
  for (const owner of owners) {
    for (const name of Object.getOwnPropertyNames(owner)) {
      if (name !== 'constructor') {
        names.add(name);
      }
    }
  }
  const observed = [...names].map((name) => {
    const value: unknown = Reflect.get(port, name, port);
    if (typeof value !== 'function') {
      return [name, value] as const;
    }
    const method = value as (...parameters: unknown[]) => unknown;
    return [
      name,
      (...parameters: unknown[]): unknown => {
        let result: unknown;
        try {
          result = Reflect.apply(method, port, parameters);
        } catch (error) {
          observe(error);
          throw error;
        }
        if (result instanceof Promise) {
          return result.catch((error: unknown) => {
            observe(error);
            throw error;
          });
        }
        return result;
      },
    ] as const;
  });
  return Object.freeze(Object.fromEntries(observed)) as RevisionPort;
};
