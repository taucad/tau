/**
 * The composition of `deployment`, the display mode's owner (adaptive app deployment mode charter D2, D4, D7, I2, I9):
 * the record this install keeps per API origin, the ask and its classification, and the factory that provides them
 * to the machine. Reached only from the adaptive ceiling (`#cloud/deployment-mode.adaptive.ts`), so neither pinned
 * build contains it (I10).
 */
import { createAsyncLogic, createCallbackLogic } from 'xstate';
import type { EventObject } from 'xstate';
import { deploymentAnswerPath, parseDeploymentAnswer } from '@taucad/types/deployment';
import type { DeploymentAnswer } from '@taucad/types/deployment';
import { deploymentModeDefaults } from '@taucad/utils/deployment-mode';
import { boundMaxAge, requestAnswer } from '@taucad/utils/origin-answer';
import type { AnswerStorage } from '@taucad/utils/origin-answer';
import { deploymentMachine } from '#runtime/deployment.machine.js';
import type { DeploymentAskOutcome, DeploymentRecord } from '#runtime/deployment.machine.js';

/**
 * The billing environments this build knows (D7). A funded answer naming another is `unsupported`. Kept equal to
 * `financialEnvironmentSchema` of `@taucad/billing` by a test, without importing the wire schema into the page.
 *
 * @public
 */
export const knownBillingEnvironments: readonly string[] = ['development', 'staging', 'prod-us', 'prod-eu'];

/**
 * The record's key prefix; the exact origin follows it (I9). No host reads it: the hosts' answer cache uses
 * `tau-deployment-answer:`, and the two never share an entry.
 *
 * @public
 */
export const deploymentRecordKeyPrefix = 'tau-ui-deployment-mode:';

/**
 * The record's key for an origin.
 *
 * @param origin - The exact API origin.
 * @returns The storage key.
 * @public
 */
export const deploymentRecordKey = (origin: string): string => `${deploymentRecordKeyPrefix}${origin}`;

const isKnownEnvironment = (environment: unknown): environment is string =>
  typeof environment === 'string' && knownBillingEnvironments.includes(environment);

/**
 * Read a stored value as a record. Anything else (another shape, an unknown environment, a non-finite time) is no
 * record (BA1).
 *
 * @param value - The parsed JSON.
 * @returns The record, or `undefined`.
 * @public
 */
export const parseDeploymentRecord = (value: unknown): DeploymentRecord | undefined => {
  if (typeof value !== 'object' || value === null || !('version' in value) || value.version !== 1) {
    return undefined;
  }
  const confirmedAt = 'confirmedAt' in value ? value.confirmedAt : undefined;
  if (typeof confirmedAt !== 'number' || !Number.isFinite(confirmedAt)) {
    return undefined;
  }
  const state = 'state' in value ? value.state : undefined;
  if (state === 'unfunded') {
    return { state, confirmedAt };
  }
  const environment = 'environment' in value ? value.environment : undefined;
  return state === 'funded' && isKnownEnvironment(environment) ? { state, environment, confirmedAt } : undefined;
};

/** One origin's record in Web Storage. Never throws: a blocked, full or corrupt store reads as none (BA1). @public */
export type DeploymentRecordStore = Readonly<{
  read: () => DeploymentRecord | undefined;
  write: (record: DeploymentRecord) => void;
  /** Drop the stored record if it is still the one confirmed at `confirmedAt`; a newer one stays. */
  drop: (confirmedAt: number) => void;
}>;

/**
 * The record store for one origin.
 *
 * @param storage - The storage accessor (the page's `localStorage`); `undefined` or a throw reads as none.
 * @param origin - The exact API origin.
 * @returns The store.
 * @public
 */
export const createDeploymentRecordStore = (
  storage: () => (AnswerStorage & Readonly<{ removeItem: (key: string) => void }>) | undefined,
  origin: string,
): DeploymentRecordStore => {
  const key = deploymentRecordKey(origin);
  return {
    read: () => {
      try {
        const raw = storage()?.getItem(key);
        return typeof raw === 'string' ? parseDeploymentRecord(JSON.parse(raw) as unknown) : undefined;
      } catch {
        return undefined;
      }
    },
    write: (record) => {
      try {
        storage()?.setItem(key, JSON.stringify({ version: 1, ...record }));
      } catch {
        /* Best effort: the page keeps its own copy, and the next page load asks again. */
      }
    },
    drop: (confirmedAt) => {
      try {
        const raw = storage()?.getItem(key);
        const current = typeof raw === 'string' ? parseDeploymentRecord(JSON.parse(raw) as unknown) : undefined;
        if (current !== undefined && current.confirmedAt !== confirmedAt) {
          return; // Another tab confirmed since this one read the record: its answer is newer than this 404.
        }
        storage()?.removeItem(key);
      } catch {
        /* Best effort, as above. */
      }
    },
  };
};

/**
 * Classify a deployment answer for display (D7): funded with a known environment, funded naming an unknown one
 * (`unsupported`), funded naming none (`misconfigured`), or unfunded. The revalidation is the answer's `maxAge` inside
 * the hosts' shared bounds.
 *
 * @param answer - A valid answer.
 * @param at - When it arrived, epoch milliseconds.
 * @returns The outcome.
 * @public
 */
export const classifyDeploymentAnswer = (answer: DeploymentAnswer, at: number): DeploymentAskOutcome => {
  const revalidateMilliseconds = boundMaxAge(answer.maxAgeSeconds, deploymentModeDefaults.maxAgeBounds) * 1000;
  if (!answer.billing.funded) {
    return { kind: 'unfunded', revalidateMilliseconds, at };
  }
  const { environment } = answer.billing;
  if (environment === undefined) {
    return { kind: 'misconfigured', revalidateMilliseconds, at };
  }
  return isKnownEnvironment(environment)
    ? { kind: 'funded', environment, revalidateMilliseconds, at }
    : { kind: 'unsupported', revalidateMilliseconds, at };
};

const parseAnswer = (body: unknown): DeploymentAnswer | undefined => {
  const parsed = parseDeploymentAnswer(body);
  return parsed.status === 'valid' ? parsed.answer : undefined;
};

/** What the owner reads from its page. @public */
export type DeploymentOwnerPorts = Readonly<{
  /** The page's API URL (`TAU_API_URL`); only its origin is used. */
  apiUrl: string | undefined;
  fetch?: typeof globalThis.fetch;
  /** The page's `localStorage`; `undefined` or a throw reads as none. */
  storage?: () => (AnswerStorage & Readonly<{ removeItem: (key: string) => void }>) | undefined;
  /** The runtime's clock, epoch milliseconds. */
  now?: () => number;
  /** Subscribe to the browser's `online` event. */
  onOnline?: (listener: () => void) => () => void;
}>;

const originOf = (url: string | undefined): string | undefined => {
  if (url === undefined || url === '') {
    return undefined;
  }
  try {
    const { origin } = new URL(url);
    return origin === 'null' ? undefined : origin;
  } catch {
    return undefined;
  }
};

const browserStorage = (): (AnswerStorage & Readonly<{ removeItem: (key: string) => void }>) | undefined =>
  globalThis.localStorage;

const browserOnline = (listener: () => void): (() => void) => {
  globalThis.addEventListener('online', listener);
  return () => {
    globalThis.removeEventListener('online', listener);
  };
};

/**
 * Provide the machine with this page's record, ask and listener. An API URL with no origin reads no record and asks
 * nothing: every ask fails, so the mode stays `unknown` (I2).
 *
 * @param ports - The page's API URL, fetch, storage, clock and `online` subscription.
 * @returns The machine the runtime invokes as its `deployment` child.
 * @public
 */
export const createDeploymentOwner = ({
  apiUrl,
  fetch = globalThis.fetch.bind(globalThis),
  storage = browserStorage,
  now = Date.now,
  onOnline = browserOnline,
}: DeploymentOwnerPorts): typeof deploymentMachine => {
  const origin = originOf(apiUrl);
  const store = origin === undefined ? undefined : createDeploymentRecordStore(storage, origin);
  return deploymentMachine.provide({
    actors: {
      recall: createAsyncLogic<DeploymentRecord | undefined>({ run: async () => store?.read() }),
      ask: createAsyncLogic<DeploymentAskOutcome>({
        run: async ({ signal }) => {
          if (origin === undefined) {
            return { kind: 'failed', reason: 'network', at: now() };
          }
          /* BA7: never from the HTTP cache. A simple GET with no credentials and no header: no preflight. */
          const response = await requestAnswer({
            fetch,
            url: new URL(deploymentAnswerPath, origin).href,
            parse: parseAnswer,
            /* The machine's `askDeadline` owns the deadline: leaving `asking` aborts `signal`. */
            cache: 'no-store',
            signal,
          });
          const at = now();
          switch (response.kind) {
            case 'answer': {
              return classifyDeploymentAnswer(response.body, at);
            }
            case 'absent': {
              return {
                kind: 'absent',
                revalidateMilliseconds: deploymentModeDefaults.maxAgeBounds.minimum * 1000,
                at,
              };
            }
            case 'failed': {
              return { kind: 'failed', reason: response.reason, at };
            }
          }
        },
      }),
      connectivity: createCallbackLogic<EventObject>(({ sendBack }) =>
        onOnline(() => {
          sendBack({ type: 'online' });
        }),
      ),
    },
    actions: {
      writeRecord: ({ record }) => {
        store?.write(record);
      },
      dropRecord: ({ confirmedAt }) => {
        store?.drop(confirmedAt);
      },
    },
  });
};

/** The machine the runtime invokes in an adaptive build. @public */
export type DeploymentOwnerLogic = ReturnType<typeof createDeploymentOwner>;
