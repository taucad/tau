/**
 * The display mode's owner (adaptive app deployment mode charter W1): one test per row of the transition table, with
 * every delay on the injected clock, and the brick audit rows T-BA1 to T-BA7, T-BA9 and T-BA21.
 *
 * Path table (the machine's states, reached from `starting`):
 * 1. starting → idle (safe mode)
 * 2. starting → recalling → asking → fresh (an answer) → asking (revalidation while visible)
 * 3. fresh → due (revalidation while hidden) → asking (visible again)
 * 4. asking → backoff (a failure, a timeout, a trusted 404) → asking (backoff, online, focus, Retry)
 * 5. backoff → stalled (the backoff ends on a hidden page) → asking (visible, online, focus, Retry)
 */
import { StepClock, flush } from '@taucad/xstate-testing/clock';
import { guardActors } from '@taucad/xstate-testing/inspect';
import { unansweredEvents, unreachedStates } from '@taucad/xstate-testing/paths';
import { afterEach, describe, expect, it } from 'vitest';
import { createActor, createCallbackLogic } from 'xstate';
import type { Actor, AnyEventObject, AnyMachineSnapshot } from 'xstate';
import { financialEnvironmentSchema } from '@taucad/billing';
import {
  deploymentAskDeadlineMilliseconds,
  deploymentBackoffMilliseconds,
  deploymentEventTypes,
  deploymentFundedRecordTrustMilliseconds,
  deploymentIgnoredEvents,
  deploymentMachine,
  foldAskOutcome,
} from '#runtime/deployment.machine.js';
import type { DeploymentChangedReport, DeploymentRecord } from '#runtime/deployment.machine.js';
import {
  classifyDeploymentAnswer,
  createDeploymentOwner,
  deploymentRecordKey,
  deploymentRecordKeyPrefix,
  knownBillingEnvironments,
  parseDeploymentRecord,
} from '#runtime/deployment.js';
import { deploymentAnswerKeyPrefix } from '@taucad/utils/deployment-mode';

const origin = 'https://api.test';
const day = 24 * 60 * 60 * 1000;
const start = Date.UTC(2026, 10, 19);

const funded = (environment: string | false = 'staging', maxAgeSeconds = 300): Response =>
  Response.json({
    version: 1,
    edition: 'cloud',
    billing: environment === false ? { funded: true } : { funded: true, environment },
    maxAgeSeconds,
  });
const unfunded = (): Response =>
  Response.json({ version: 1, edition: 'self-host', billing: { funded: false }, maxAgeSeconds: 300 });
const absent = (): Response => new Response('', { status: 404 });

type Reply = Response | Error | 'hang';

/** A `localStorage` stand-in that can be blocked or full. */
const memoryStorage = (initial: Record<string, string> = {}) => {
  const items = new Map(Object.entries(initial));
  const state = { blocked: false, full: false };
  return {
    items,
    state,
    storage: () => {
      if (state.blocked) {
        throw new DOMException('blocked', 'SecurityError');
      }
      return {
        getItem: (key: string) => items.get(key) ?? null,
        setItem: (key: string, value: string) => {
          if (state.full) {
            throw new DOMException('full', 'QuotaExceededError');
          }
          items.set(key, value);
        },
        removeItem: (key: string) => {
          items.delete(key);
        },
      };
    },
  };
};

const recordOf = (record: DeploymentRecord): string => JSON.stringify({ version: 1, ...record });

const running: Array<Actor<typeof deploymentMachine>> = [];
afterEach(() => {
  for (const actor of running.splice(0)) {
    actor.stop();
  }
});

/** The owner over a scripted fetch, a memory storage and the step clock, with a parent that records its reports. */
const harness = (
  options: Readonly<{
    replies?: Reply[];
    stored?: Record<string, string>;
    apiUrl?: string;
    safeMode?: boolean;
    visible?: boolean;
    now?: number;
  }> = {},
) => {
  const clock = new StepClock();
  clock.set(options.now ?? start);
  const replies = [...(options.replies ?? [])];
  const requests: Array<{ url: string; init: RequestInit | undefined }> = [];
  const fetch = (async (url: string, init?: RequestInit) => {
    requests.push({ url, init });
    const reply = replies.shift() ?? 'hang';
    if (reply === 'hang') {
      return new Promise<Response>((_resolve, reject) => {
        init?.signal?.addEventListener('abort', () => {
          reject(new DOMException('aborted', 'AbortError'));
        });
      });
    }
    if (reply instanceof Error) {
      throw reply;
    }
    return reply;
  }) as typeof globalThis.fetch;
  const storage = memoryStorage(options.stored);
  let online: (() => void) | undefined;
  const reports: DeploymentChangedReport[] = [];
  const parent = createActor(
    createCallbackLogic<AnyEventObject>(({ receive }) => {
      receive((event) => {
        reports.push(event as DeploymentChangedReport);
      });
    }),
  ).start();
  const guard = guardActors({ ignore: { deployment: deploymentIgnoredEvents } });
  const logic = createDeploymentOwner({
    apiUrl: options.apiUrl ?? `${origin}/v1`,
    fetch,
    storage: storage.storage,
    now: () => clock.now(),
    onOnline: (listener) => {
      online = listener;
      return () => {
        online = undefined;
      };
    },
  });
  const actor = createActor(logic, {
    clock,
    inspect: guard.inspect,
    input: { parentRef: parent, safeMode: options.safeMode ?? false, visible: options.visible ?? true },
  });
  running.push(actor);
  const mode = () => actor.getSnapshot().context.mode;
  const state = () => actor.getSnapshot().value;
  const reply = (...next: Reply[]) => {
    replies.push(...next);
  };
  return { actor, clock, requests, storage, reports, mode, state, reply, online: () => online?.(), guard };
};

const started = async (h: ReturnType<typeof harness>) => {
  h.actor.start();
  await flush();
  await flush();
  return h;
};

describe('deployment: start', () => {
  it('should go idle in safe mode, read no record and ask nothing (D10, T-BA17 at the owner)', async () => {
    const h = await started(
      harness({
        safeMode: true,
        stored: {
          [deploymentRecordKey(origin)]: recordOf({ state: 'funded', environment: 'staging', confirmedAt: start }),
        },
      }),
    );
    expect(h.state()).toBe('idle');
    expect(h.mode()).toEqual({ state: 'unknown', problem: 'safe-mode' });
    expect(h.requests).toEqual([]);
    expect(h.reports).toEqual([{ type: 'deploymentChanged', mode: { state: 'unknown', problem: 'safe-mode' } }]);
  });

  it('should start funded and remembered from a funded record, then ask (table: record says funded)', async () => {
    const h = await started(
      harness({
        stored: {
          [deploymentRecordKey(origin)]: recordOf({
            state: 'funded',
            environment: 'staging',
            confirmedAt: start - day,
          }),
        },
      }),
    );
    expect(h.reports[0]?.mode).toEqual({ state: 'funded', basis: 'remembered', environment: 'staging' });
    expect(h.state()).toBe('asking');
    expect(h.requests).toHaveLength(1);
  });

  it('should start unfunded and remembered from an unfunded record (table: record says unfunded)', async () => {
    const h = await started(
      harness({ stored: { [deploymentRecordKey(origin)]: recordOf({ state: 'unfunded', confirmedAt: start }) } }),
    );
    expect(h.reports[0]?.mode).toEqual({ state: 'unfunded', basis: 'remembered' });
  });

  it('should read a blocked, corrupt or old-shaped record as none, without throwing (T-BA1)', async () => {
    for (const stored of [
      { [deploymentRecordKey(origin)]: '{not json' },
      {
        [deploymentRecordKey(origin)]: JSON.stringify({ state: 'funded', environment: 'staging', confirmedAt: start }),
      },
      { [deploymentRecordKey(origin)]: recordOf({ state: 'funded', environment: 'mars', confirmedAt: start }) },
    ]) {
      // oxlint-disable-next-line no-await-in-loop -- each case is its own actor.
      const h = await started(harness({ stored }));
      expect(h.mode()).toEqual({ state: 'unknown', problem: 'pending' });
      expect(h.reports).toEqual([]);
    }
    const blocked = harness();
    blocked.storage.state.blocked = true;
    await started(blocked);
    expect(blocked.mode()).toEqual({ state: 'unknown', problem: 'pending' });
    expect(blocked.actor.getSnapshot().context.fault).toBeUndefined();
  });
});

describe('deployment: answers', () => {
  it('should confirm a funded answer and write the record with the time (table: valid funded)', async () => {
    const h = await started(harness({ replies: [funded('staging')] }));
    expect(h.mode()).toEqual({ state: 'funded', basis: 'confirmed', environment: 'staging' });
    expect(h.state()).toBe('fresh');
    expect(parseDeploymentRecord(JSON.parse(h.storage.items.get(deploymentRecordKey(origin))!))).toEqual({
      state: 'funded',
      environment: 'staging',
      confirmedAt: start,
    });
  });

  it('should confirm an unfunded answer and write the record (table: valid unfunded)', async () => {
    const h = await started(harness({ replies: [unfunded()] }));
    expect(h.mode()).toEqual({ state: 'unfunded', basis: 'confirmed' });
    expect(parseDeploymentRecord(JSON.parse(h.storage.items.get(deploymentRecordKey(origin))!))).toEqual({
      state: 'unfunded',
      confirmedAt: start,
    });
  });

  it('should demote a remembered funded origin at once on a valid unfunded answer (no debounce, D5)', async () => {
    const h = await started(
      harness({
        replies: [unfunded()],
        stored: {
          [deploymentRecordKey(origin)]: recordOf({ state: 'funded', environment: 'staging', confirmedAt: start }),
        },
      }),
    );
    expect(h.reports.map((report) => report.mode)).toEqual([
      { state: 'funded', basis: 'remembered', environment: 'staging' },
      { state: 'unfunded', basis: 'confirmed' },
    ]);
  });

  it('should read an unknown environment as unsupported and none as misconfigured, never unfunded (T-BA9, D7)', async () => {
    const unsupported = await started(harness({ replies: [funded('prod-mars')] }));
    expect(unsupported.mode()).toEqual({ state: 'unknown', problem: 'unsupported' });
    const misconfigured = await started(harness({ replies: [funded(false)] }));
    expect(misconfigured.mode()).toEqual({ state: 'unknown', problem: 'misconfigured' });
    expect(misconfigured.storage.items.size).toBe(0);
    const fromFunded = await started(
      harness({
        replies: [funded('prod-mars')],
        stored: {
          [deploymentRecordKey(origin)]: recordOf({ state: 'funded', environment: 'staging', confirmedAt: start }),
        },
      }),
    );
    expect(fromFunded.mode()).toEqual({ state: 'unknown', problem: 'unsupported' });
  });

  it('should read a 404 from an unknown origin as unfunded and absent, without a record (table: unknown, 404)', async () => {
    const h = await started(harness({ replies: [absent()] }));
    expect(h.mode()).toEqual({ state: 'unfunded', basis: 'absent' });
    expect(h.storage.items.size).toBe(0);
  });

  it('should keep an unfunded origin as it is on a 404 (table: unfunded, 404)', async () => {
    const h = await started(harness({ replies: [unfunded()] }));
    h.reply(absent());
    await h.clock.advanceAsync(300_000);
    expect(h.mode()).toEqual({ state: 'unfunded', basis: 'confirmed' });
  });
});

describe('deployment: a 404 against a funded record (T-BA6, D5)', () => {
  const storedFunded = (confirmedAt: number) => ({
    [deploymentRecordKey(origin)]: recordOf({ state: 'funded', environment: 'staging', confirmedAt }),
  });

  it('should not demote a funded origin confirmed within 14 days, and count it as a failed ask', async () => {
    const h = await started(
      harness({ replies: [absent()], stored: storedFunded(start - deploymentFundedRecordTrustMilliseconds + 1000) }),
    );
    expect(h.mode()).toEqual({ state: 'funded', basis: 'remembered', environment: 'staging' });
    expect(h.state()).toBe('backoff');
    expect(h.storage.items.size).toBe(1);
  });

  it('should demote a funded origin confirmed more than 14 days ago and drop its record', async () => {
    const h = await started(
      harness({ replies: [absent()], stored: storedFunded(start - deploymentFundedRecordTrustMilliseconds - 1000) }),
    );
    expect(h.mode()).toEqual({ state: 'unfunded', basis: 'absent' });
    expect(h.storage.items.size).toBe(0);
  });

  it('should read a record dated more than a day ahead of the clock as expired (clock set back)', async () => {
    const h = await started(harness({ replies: [absent()], stored: storedFunded(start + day + 1000) }));
    expect(h.mode()).toEqual({ state: 'unfunded', basis: 'absent' });
  });

  it('should trust a record dated less than a day ahead of the clock', async () => {
    const h = await started(harness({ replies: [absent()], stored: storedFunded(start + day - 1000) }));
    expect(h.mode()).toEqual({ state: 'funded', basis: 'remembered', environment: 'staging' });
  });

  it('should demote at the first 404 once the clock moves past 14 days in the page load (clock set forward)', async () => {
    const h = await started(harness({ replies: [funded('staging')] }));
    expect(h.mode()).toEqual({ state: 'funded', basis: 'confirmed', environment: 'staging' });
    /* The clock jumps past the trust; the revalidation it passes asks, and the 404 now demotes. */
    h.reply(absent());
    h.clock.set(start + deploymentFundedRecordTrustMilliseconds + 1000);
    await flush();
    await flush();
    expect(h.mode()).toEqual({ state: 'unfunded', basis: 'absent' });
  });
});

describe('deployment: failures and deadlines', () => {
  it('should end pending at the ask deadline as unreachable and abort the request (T-BA3, I15)', async () => {
    const h = await started(harness({ replies: ['hang'] }));
    expect(h.mode()).toEqual({ state: 'unknown', problem: 'pending' });
    await h.clock.advanceAsync(deploymentAskDeadlineMilliseconds - 1);
    expect(h.mode()).toEqual({ state: 'unknown', problem: 'pending' });
    await h.clock.advanceAsync(1);
    expect(h.mode()).toEqual({ state: 'unknown', problem: 'unreachable' });
    expect(h.requests[0]?.init?.signal?.aborted).toBe(true);
    expect(h.state()).toBe('backoff');
  });

  it('should keep the state on a refused connection, a 5xx, HTML and wrong JSON (T-BA2, T-BA4, T-BA5)', async () => {
    const replies: Array<() => Reply> = [
      () => new TypeError('Failed to fetch'),
      () => new Response('', { status: 503 }),
      () => new Response('<html>login</html>', { status: 200, headers: { 'content-type': 'text/html' } }),
      () => Response.json({ version: 2, edition: 'cloud', billing: { funded: true }, maxAgeSeconds: 1 }),
      () => Response.json({ version: 1, edition: 'self-host', billing: { funded: true }, maxAgeSeconds: 1 }),
    ];
    for (const reply of replies) {
      // oxlint-disable-next-line no-await-in-loop -- each case is its own actor.
      const fresh = await started(harness({ replies: [reply()] }));
      expect(fresh.mode()).toEqual({ state: 'unknown', problem: 'unreachable' });
      // oxlint-disable-next-line no-await-in-loop -- each case is its own actor.
      const remembered = await started(
        harness({
          replies: [reply()],
          stored: { [deploymentRecordKey(origin)]: recordOf({ state: 'unfunded', confirmedAt: start }) },
        }),
      );
      expect(remembered.mode()).toEqual({ state: 'unfunded', basis: 'remembered' });
    }
  });

  it('should turn confirmed into remembered when a later ask fails (D5)', async () => {
    const h = await started(harness({ replies: [funded('staging', 60)] }));
    expect(h.mode()).toEqual({ state: 'funded', basis: 'confirmed', environment: 'staging' });
    h.reply(new Response('', { status: 502 }));
    await h.clock.advanceAsync(60_000);
    expect(h.mode()).toEqual({ state: 'funded', basis: 'remembered', environment: 'staging' });
    h.reply(funded('staging'));
    await h.clock.advanceAsync(deploymentBackoffMilliseconds(1));
    expect(h.mode()).toEqual({ state: 'funded', basis: 'confirmed', environment: 'staging' });
  });

  it('should back off with a capped doubling, and ask at once on online, focus and Retry', async () => {
    const h = await started(harness({ replies: [new TypeError('offline')] }));
    expect(h.state()).toBe('backoff');
    h.reply(new TypeError('offline'));
    await h.clock.advanceAsync(deploymentBackoffMilliseconds(1));
    expect(h.requests).toHaveLength(2);
    expect(deploymentBackoffMilliseconds(2)).toBe(2 * deploymentBackoffMilliseconds(1));
    expect(deploymentBackoffMilliseconds(50)).toBe(300_000);
    for (const send of [
      () => {
        h.online();
      },
      () => {
        h.actor.send({ type: 'windowFocused' });
      },
      () => {
        h.actor.send({ type: 'retry' });
      },
    ]) {
      h.reply(new TypeError('offline'));
      const before = h.requests.length;
      send();
      // oxlint-disable-next-line no-await-in-loop -- each trigger settles before the next.
      await flush();
      expect(h.requests).toHaveLength(before + 1);
    }
  });

  it('should treat an API URL with no origin as unreachable, never as an answer', async () => {
    const h = await started(harness({ apiUrl: 'not a url' }));
    expect(h.mode()).toEqual({ state: 'unknown', problem: 'unreachable' });
    expect(h.requests).toEqual([]);
  });
});

describe('deployment: revalidation', () => {
  it("should ask once per page load regardless of the record's age, then at the answer's bounded maxAge", async () => {
    const h = await started(
      harness({
        replies: [funded('staging', 0)],
        stored: {
          [deploymentRecordKey(origin)]: recordOf({ state: 'funded', environment: 'staging', confirmedAt: start }),
        },
      }),
    );
    expect(h.requests).toHaveLength(1);
    h.reply(funded('staging', 99_999));
    await h.clock.advanceAsync(59_999);
    expect(h.requests).toHaveLength(1);
    await h.clock.advanceAsync(1);
    expect(h.requests).toHaveLength(2);
    await h.clock.advanceAsync(3_599_999);
    expect(h.requests).toHaveLength(2);
    h.reply(funded('staging'));
    await h.clock.advanceAsync(1);
    expect(h.requests).toHaveLength(3);
  });

  it('should still retry a failed ask on online after its backoff ended on a hidden page', async () => {
    const h = await started(harness({ replies: [new TypeError('offline')] }));
    h.actor.send({ type: 'visibilityChanged', visible: false });
    await h.clock.advanceAsync(deploymentBackoffMilliseconds(1));
    expect(h.state()).toBe('stalled');
    expect(h.requests).toHaveLength(1);
    h.reply(funded('staging'));
    h.online();
    await flush();
    await flush();
    expect(h.mode()).toEqual({ state: 'funded', basis: 'confirmed', environment: 'staging' });
  });

  it('should keep a newer confirmation another tab wrote when a 404 drops an expired record', async () => {
    const key = deploymentRecordKey(origin);
    const h = harness({
      replies: [absent()],
      stored: { [key]: recordOf({ state: 'funded', environment: 'staging', confirmedAt: start - 15 * day }) },
    });
    h.actor.start();
    /* Another tab confirms the origin after this tab read the record and before its 404 arrives. */
    h.storage.items.set(key, recordOf({ state: 'funded', environment: 'staging', confirmedAt: start }));
    await flush();
    await flush();
    expect(h.mode()).toEqual({ state: 'unfunded', basis: 'absent' });
    expect(parseDeploymentRecord(JSON.parse(h.storage.items.get(key)!))).toEqual({
      state: 'funded',
      environment: 'staging',
      confirmedAt: start,
    });
  });

  it('should wait for a visible page to revalidate', async () => {
    const h = await started(harness({ replies: [funded('staging', 60)] }));
    h.actor.send({ type: 'visibilityChanged', visible: false });
    await h.clock.advanceAsync(120_000);
    expect(h.state()).toBe('due');
    expect(h.requests).toHaveLength(1);
    h.reply(funded('staging'));
    h.actor.send({ type: 'visibilityChanged', visible: true });
    await flush();
    expect(h.requests).toHaveLength(2);
  });

  it('should ask with no-store, no credentials and no header, so no preflight and no cached answer (T-BA7)', async () => {
    const h = await started(harness({ replies: [funded('staging')] }));
    expect(h.requests[0]?.url).toBe(`${origin}/v1/deployment`);
    const { signal, ...init } = h.requests[0]?.init ?? {};
    expect(signal).toBeInstanceOf(AbortSignal);
    expect(init).toEqual({ method: 'GET', credentials: 'omit', cache: 'no-store' });
  });
});

describe('deployment: origins (T-BA21, I9)', () => {
  it('should key the record by exact origin, so another origin starts unknown', async () => {
    const stored = {
      [deploymentRecordKey('https://api.test')]: recordOf({
        state: 'funded',
        environment: 'staging',
        confirmedAt: start,
      }),
    };
    const other = await started(harness({ apiUrl: 'https://api.test:8443', stored }));
    expect(other.mode()).toEqual({ state: 'unknown', problem: 'pending' });
    const same = await started(harness({ apiUrl: 'https://api.test/anything', stored }));
    expect(same.mode()).toEqual({ state: 'funded', basis: 'remembered', environment: 'staging' });
  });

  it('should use a key prefix no host reads', () => {
    expect(deploymentRecordKeyPrefix).not.toBe(deploymentAnswerKeyPrefix);
    expect(deploymentRecordKeyPrefix.startsWith(deploymentAnswerKeyPrefix)).toBe(false);
    expect(deploymentAnswerKeyPrefix.startsWith(deploymentRecordKeyPrefix)).toBe(false);
  });
});

describe('deployment: composition', () => {
  it('should know exactly the billing environments of the financial wire (D7 parity)', () => {
    expect([...knownBillingEnvironments].toSorted()).toEqual([...financialEnvironmentSchema.options].toSorted());
  });

  it('should bound the revalidation to the shared 60 s to 1 h', () => {
    const answer = (maxAgeSeconds: number) =>
      ({ version: 1, edition: 'cloud', billing: { funded: true, environment: 'staging' }, maxAgeSeconds }) as const;
    expect(classifyDeploymentAnswer(answer(0), 1)).toMatchObject({ revalidateMilliseconds: 60_000 });
    expect(classifyDeploymentAnswer(answer(86_400), 1)).toMatchObject({ revalidateMilliseconds: 3_600_000 });
  });

  it('should fold a failed ask from every mode as the table says', () => {
    const failed = { kind: 'failed', reason: 'network', at: start } as const;
    expect(foldAskOutcome({ state: 'unknown', problem: 'unsupported' }, undefined, failed).mode).toEqual({
      state: 'unknown',
      problem: 'unreachable',
    });
    expect(foldAskOutcome({ state: 'unfunded', basis: 'absent' }, undefined, failed).mode).toEqual({
      state: 'unfunded',
      basis: 'absent',
    });
  });
});

describe('deployment: totality', () => {
  const events: AnyEventObject[] = [
    { type: 'visibilityChanged', visible: true },
    { type: 'visibilityChanged', visible: false },
    { type: 'windowFocused' },
    { type: 'online' },
    { type: 'retry' },
  ];

  it('should sample every public event', () => {
    expect(new Set(events.map((event) => event.type))).toEqual(new Set(deploymentEventTypes));
  });

  it('should answer every public event in every reachable state', () => {
    const options = {
      input: {},
      events,
      limit: 200,
      serializeState: (snapshot: AnyMachineSnapshot) => JSON.stringify(snapshot.value),
    };
    expect(unansweredEvents(deploymentMachine, { ...options, ignore: deploymentIgnoredEvents })).toEqual([]);
  });

  it('should reach safe mode from its input', () => {
    const options = {
      input: { safeMode: true },
      events,
      limit: 50,
      serializeState: (snapshot: AnyMachineSnapshot) => JSON.stringify(snapshot.value),
    };
    expect(unreachedStates(deploymentMachine, options)).toContain('deployment.recalling');
  });
});
