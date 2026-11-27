/**
 * The engine failures a revision port raises, observed for field reporting.
 *
 * A port call that fails in the engine itself (`ENGINE_FAILED`, `ENGINE_UNAVAILABLE`) reaches the caller as it always
 * did; this only tells the host's reporter as well, with git's own words from the error's cause. Every other code is
 * a refusal the product already explains (a remote's status, a missing object, a conflict) and is not reported.
 */

import { RevisionPortError } from '@taucad/revisions';
import type { RevisionPort } from '@taucad/revisions';

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
 * A copy of a port whose every method is `wrap`ped; value members are copied as they are.
 *
 * A copy, not a proxy: a port is frozen, and a proxy may not answer a frozen member with another function. The names
 * come from the port and its prototypes, so a class instance keeps the methods it inherits.
 *
 * @param port - The port to copy.
 * @param wrap - Called once per method call with the bound call itself.
 * @returns The frozen copy.
 */
const wrapPortMethods = (port: RevisionPort, wrap: (call: () => unknown) => unknown): RevisionPort => {
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
  const wrapped = [...names].map((name) => {
    const value: unknown = Reflect.get(port, name, port);
    if (typeof value !== 'function') {
      return [name, value] as const;
    }
    const method = value as (...parameters: unknown[]) => unknown;
    return [name, (...parameters: unknown[]): unknown => wrap(() => Reflect.apply(method, port, parameters))] as const;
  });
  return Object.freeze(Object.fromEntries(wrapped)) as RevisionPort;
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
  return wrapPortMethods(port, (call) => {
    let result: unknown;
    try {
      result = call();
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
  });
};

/** The first wait after an engine that could not start: 5 s (I8). @public */
export const revisionEngineRetryMilliseconds = 5000;

/** The longest wait between two attempts, and the wait at which the engine is said to be unavailable: 5 min (I8). @public */
export const revisionEngineMaxRetryMilliseconds = 300_000;

/** Options for {@link gateRevisionEngine}. @public */
export type RevisionEngineGateOptions = Readonly<{
  /** Called once when the wait reaches its cap: the engine has not started for about five minutes. */
  onUnavailable: () => void;
  /** Called once when an attempt after {@link RevisionEngineGateOptions.onUnavailable} reached the engine again. */
  onAvailable: () => void;
  /** Milliseconds since the epoch; tests pass a step clock. */
  now?: () => number;
}>;

/**
 * The same port, waiting out an engine that could not start instead of asking it again at every caller's pace (I8).
 *
 * After a call rejects with `ENGINE_UNAVAILABLE` (git could not be spawned at all), every call during the next wait
 * rejects at once with the same code and starts nothing; the wait doubles from 5 s to its 5 min cap with each
 * attempt that fails again, and the first call after a wait is a real attempt. When the wait reaches its cap,
 * `onUnavailable` is called once, so the host can show a state instead of a log line every five seconds. Calls that
 * were already running when one failed count as that one attempt. Any real
 * attempt that reaches the engine (it resolves, or git ran and failed) ends the wait, and calls `onAvailable` when the
 * state had been raised. A callback that throws is ignored.
 *
 * Wrap this outside {@link observeRevisionEngineFailures}, so only real attempts are reported.
 *
 * @param port - The port to gate.
 * @param options - The two state callbacks and an optional clock.
 * @returns The gated port.
 */
export const gateRevisionEngine = (port: RevisionPort, options: RevisionEngineGateOptions): RevisionPort => {
  const now = options.now ?? ((): number => Date.now());
  let failures = 0;
  let waitUntil = 0;
  let unavailable = false;
  const tell = (callback: () => void): void => {
    try {
      callback();
    } catch {
      /* A state change is reported; it never fails a call. */
    }
  };
  const reached = (): void => {
    failures = 0;
    waitUntil = 0;
    if (unavailable) {
      unavailable = false;
      tell(options.onAvailable);
    }
  };
  const settle = (error: unknown): void => {
    const failure = revisionEngineFailureOf(error);
    if (failure?.code === 'ENGINE_FAILED') {
      /* Git started and said no: the engine is there. */
      reached();
      return;
    }
    if (failure?.code !== 'ENGINE_UNAVAILABLE') {
      /* A refusal decided before or beside the engine says nothing about it. */
      return;
    }
    if (now() < waitUntil) {
      /* Calls that were already running when another one failed: one attempt, one doubling. */
      return;
    }
    failures += 1;
    const wait = Math.min(revisionEngineRetryMilliseconds * 2 ** (failures - 1), revisionEngineMaxRetryMilliseconds);
    waitUntil = now() + wait;
    if (wait === revisionEngineMaxRetryMilliseconds && !unavailable) {
      unavailable = true;
      tell(options.onUnavailable);
    }
  };
  return wrapPortMethods(port, (call) => {
    if (now() < waitUntil) {
      return Promise.reject(
        new RevisionPortError('ENGINE_UNAVAILABLE', 'Native Git could not start; waiting before trying again.'),
      );
    }
    let result: unknown;
    try {
      result = call();
    } catch (error) {
      settle(error);
      throw error;
    }
    if (result instanceof Promise) {
      return result.then(
        (value: unknown) => {
          reached();
          return value;
        },
        (error: unknown) => {
          settle(error);
          throw error;
        },
      );
    }
    return result;
  });
};
