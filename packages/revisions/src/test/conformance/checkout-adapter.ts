/**
 * The conformance adapter between `checkout.machine` and `specs/checkout/CheckoutRequests.tla`
 * (RM-A24). The spec is the checkout in its world: the store's heads, the branch on disk, the
 * producers that move it and the facts they send. The harness plays that world around one live
 * checkout actor over fakes, so both bridges run on it: forward replay performs each spec action,
 * and the path table enumerates the harness's own choices for the backward walk.
 *
 * The fence grant is not a spec step: the spec's mint holds its fence from the start, so the
 * harness grants it as soon as the machine waits on it. The head re-read is one (`ReadDone`):
 * requests, withdrawals and head facts land while it is in flight.
 */

import { createActor } from 'xstate';
import type { AnyMachineSnapshot } from 'xstate';
import type { ConformanceAdapter } from '@taucad/formal/replay';
import { canonicalJson } from '@taucad/formal/graph';
import type { SpecView, WalkPath } from '@taucad/formal/graph';

import { checkoutIgnoredEvents } from '#checkout.machine.js';
import type { CheckoutMachine, CheckoutMachineEvent } from '#checkout.machine.js';
import { createFakeCallbackActors, createFakePromiseActors, recordEmitted } from '@taucad/xstate-testing/fakes';
import { guardActors } from '@taucad/xstate-testing/inspect';

/* The requests of `CheckoutRequests.conformance.cfg`, in TLC's order for its sets. */
const turnRequests: readonly string[] = ['t1'];
const requests: readonly string[] = ['t1', 's1', 's2'];
const branches = ['main', 'feature'] as const;
/* The cfg's outside-writer bound: the switch is the only move. */
const maxExternal = 0;

const key = { chatId: 'chat-1', turnId: 'turn-1', runId: 'run-1', attempt: 0 } as const;

/** How many D4 comparisons the harness has answered, for the conformance test's coverage check. */
export const captureTreeAnswers = { count: 0 };

/* A head is a per-branch counter in the spec; the harness names the revision `<branch>:<n>`. */
const revisionOf = (branch: string, head: number): string => `${branch}:${String(head)}`;
const headOf = (revisionId: unknown): number => Number(String(revisionId).split(':')[1] ?? 0);

type World = {
  ref: Record<string, number>;
  disk: string;
  facts: Array<{ branch: string; head: number }>;
  sent: Set<string>;
  cancelled: Set<string>;
  switched: boolean;
  ext: number;
  trees: number;
};

const startHarness = (machine: CheckoutMachine) => {
  const promises = createFakePromiseActors();
  const callbacks = createFakeCallbackActors();
  const actor = createActor(
    machine.provide({
      actors: {
        cut: promises.actor('cut'),
        writeRevision: promises.actor('writeRevision'),
        casHead: promises.actor('casHead'),
        readHead: promises.actor('readHead'),
        captureTree: promises.actor('captureTree'),
        fence: callbacks.actor('fence'),
      },
    }),
    {
      input: {
        checkoutId: 'checkout-1',
        branch: 'main',
        headRevisionId: revisionOf('main', 1),
        headTreeId: 'tree-main-1',
      },
      /* RM-A15: the zero-microstep inspector; a dropped event fails the test. */
      inspect: guardActors({ ignore: { checkout: checkoutIgnoredEvents } }).inspect,
    },
  );
  const emitted = recordEmitted(actor);
  actor.start();
  const world: World = {
    ref: { main: 1, feature: 1 },
    disk: 'main',
    facts: [],
    sent: new Set(),
    cancelled: new Set(),
    switched: false,
    ext: 0,
    trees: 0,
  };
  return { actor, promises, callbacks, emitted, world };
};

export type CheckoutHarness = ReturnType<typeof startHarness>;

const snapshotOf = (harness: CheckoutHarness): AnyMachineSnapshot => harness.actor.getSnapshot() as AnyMachineSnapshot;
const contextOf = (harness: CheckoutHarness): Record<string, unknown> =>
  snapshotOf(harness).context as Record<string, unknown>;

/* Let a settled promise actor's resolution reach the machine: every microtask drains before `setImmediate`. */
const flush = async (): Promise<void> => {
  await new Promise<void>((resolve) => {
    setImmediate(resolve);
  });
};

/*
 * The steps the spec does not take: grant a waiting fence, and answer a D4 comparison (the spec's files are always
 * their head's, so the capture reads the head's own tree).
 */
const settleInternal = async (harness: CheckoutHarness): Promise<void> => {
  const { callbacks, promises } = harness;
  for (;;) {
    // oxlint-disable-next-line no-await-in-loop -- each internal step settles before the next is read.
    await flush();
    if (snapshotOf(harness).matches({ minting: 'acquiring' }) && callbacks.active('fence') > 0) {
      callbacks.sendBack('fence', { type: 'fenceGranted' });
      continue;
    }
    if (promises.running('captureTree') > 0) {
      captureTreeAnswers.count += 1;
      promises.settle('captureTree', { output: { treeId: String(contextOf(harness)['headTreeId']) } });
      continue;
    }
    return;
  }
};

const send = (harness: CheckoutHarness, event: CheckoutMachineEvent): void => {
  harness.actor.send(event);
};

/* The spec's `mint.phase`: the fence wait and the capture are its `cutting`; `stale` passes straight to `rereading`. */
const mintPhase = (snapshot: AnyMachineSnapshot): 'idle' | 'cutting' | 'publishing' | 'rereading' => {
  if (snapshot.matches({ minting: 'publishing' })) {
    return 'publishing';
  }
  if (snapshot.matches('rereading') || snapshot.matches('stale')) {
    return 'rereading';
  }
  return snapshot.matches('minting') ? 'cutting' : 'idle';
};

const sortedIds = (ids: readonly string[]): string[] =>
  [...ids].sort((left, right) => requests.indexOf(left) - requests.indexOf(right));

type Requesters = ReadonlyArray<Readonly<{ requestId: string }>>;
const idsOf = (requesters: Requesters): string[] => sortedIds(requesters.map((requester) => requester.requestId));

const answerNames: Readonly<Record<string, string>> = {
  revisionMinted: 'minted',
  casLost: 'casLost',
  nothingToSave: 'nothing',
  cutCancelled: 'cancelled',
  cutFailed: 'failed',
};

/* Each requester's answers, in the spec's `nAns` and `last`. */
const answersOf = (harness: CheckoutHarness): { nAns: Record<string, number>; last: Record<string, string> } => {
  const nAns = Object.fromEntries(requests.map((request) => [request, 0]));
  const last = Object.fromEntries(requests.map((request): [string, string] => [request, 'none']));
  for (const event of harness.emitted) {
    const name = answerNames[event.type];
    const { requestId } = event as { requestId?: unknown };
    if (name !== undefined && typeof requestId === 'string') {
      nAns[requestId] = (nAns[requestId] ?? 0) + 1;
      last[requestId] = name;
    }
  }
  return { nAns, last };
};

/**
 * The refinement mapping: the spec fields the checkout and its world stand for. `rootRec`,
 * `orphan`, `ghost`, `foreign`, `unseen` and `ann` are constant under the code's knobs and unchecked.
 */
export const checkoutView = (harness: CheckoutHarness): SpecView => {
  const snapshot = snapshotOf(harness);
  const context = snapshot.context as Record<string, unknown>;
  const phase = mintPhase(snapshot);
  const pending = context['pending'] as { requesters: Requesters } | undefined;
  const queued = context['queued'] as ReadonlyArray<{ requesters: Requesters }>;
  const { world } = harness;
  return {
    mint:
      phase === 'idle' || phase === 'rereading'
        ? { phase, reqs: [], branch: 'none', expected: 0 }
        : {
            phase,
            reqs: idsOf(pending?.requesters ?? []),
            branch: context['branch'],
            expected: headOf(context['headRevisionId']),
          },
    queue: queued.map((entry) => idsOf(entry.requesters)),
    actor: { branch: context['branch'], head: headOf(context['headRevisionId']) },
    deferred: phase !== 'idle' && Number(context['moveGeneration']) > Number(context['seenMoveGeneration']),
    ...answersOf(harness),
    ref: { ...world.ref },
    disk: world.disk,
    facts: world.facts.map((fact) => ({ ...fact })),
    sent: sortedIds([...world.sent]),
    cancelled: sortedIds([...world.cancelled]),
    switched: world.switched,
    ext: world.ext,
  };
};

const cutRequest = (requestId: string): CheckoutMachineEvent =>
  turnRequests.includes(requestId)
    ? { type: 'cut', requestId, trigger: 'turn', turn: { key, turnCut: 'base' }, leaseIds: ['run-1'] }
    : { type: 'cut', requestId, trigger: 'save', leaseIds: [] };

/* One spec action, performed on the harness. */
const perform = async (harness: CheckoutHarness, action: readonly unknown[]): Promise<void> => {
  const [name, argument] = action as [string, string | undefined];
  const { promises, world } = harness;
  /* The target root ignores an announcement's heads (RM-R5): nothing reaches the checkout. */
  if (name === 'RegistryAnnounce') {
    return;
  }
  switch (name) {
    case 'Request': {
      world.sent.add(String(argument));
      send(harness, cutRequest(String(argument)));
      return;
    }
    case 'Cancel': {
      world.cancelled.add(String(argument));
      send(harness, { type: 'cancelCut', requestId: String(argument) });
      return;
    }
    case 'MintNothing': {
      promises.settle('cut', { output: { cutId: 'cut-same', treeId: contextOf(harness)['headTreeId'] } });
      return;
    }
    case 'WriteDone': {
      world.trees += 1;
      promises.settle('cut', { output: { cutId: 'cut-new', treeId: `tree-cut-${String(world.trees)}` } });
      await flush();
      const context = contextOf(harness);
      promises.settle('writeRevision', {
        output: {
          status: 'written',
          revisionId: revisionOf(String(context['branch']), headOf(context['headRevisionId']) + 1),
        },
      });
      return;
    }
    case 'Cas': {
      /* The effect's compare-and-swap (I7), refusing a branch the checkout's files are not on (RM-R6). */
      const input = promises.inputsFor('casHead').at(-1) as { branch: string; expectedHead: string; head: string };
      const ok = world.ref[input.branch] === headOf(input.expectedHead) && world.disk === input.branch;
      if (ok) {
        world.ref[input.branch] = (world.ref[input.branch] ?? 0) + 1;
      }
      promises.settle('casHead', {
        output: ok
          ? { status: 'updated', head: input.head }
          : { status: 'conflicted', head: revisionOf(input.branch, world.ref[input.branch] ?? 0) },
      });
      return;
    }
    case 'ReadDone': {
      const head = world.ref[world.disk] ?? 0;
      promises.settle('readHead', {
        output: {
          branch: world.disk,
          revisionId: revisionOf(world.disk, head),
          treeId: `tree-${world.disk}-${String(head)}`,
        },
      });
      return;
    }
    case 'SwitchApply': {
      world.switched = true;
      world.disk = 'feature';
      world.facts.push({ branch: 'feature', head: world.ref['feature'] ?? 0 });
      return;
    }
    case 'FastForward': {
      world.ext += 1;
      world.ref[world.disk] = (world.ref[world.disk] ?? 0) + 1;
      world.facts.push({ branch: world.disk, head: world.ref[world.disk] ?? 0 });
      return;
    }
    case 'OtherWriter': {
      world.ext += 1;
      world.ref[String(argument)] = (world.ref[String(argument)] ?? 0) + 1;
      return;
    }
    case 'DeliverFact': {
      world.facts.shift();
      send(harness, { type: 'headMoved' });
      return;
    }
    default: {
      throw new Error(`No adapter for protocol action ${name}.`);
    }
  }
};

const apply = async (harness: CheckoutHarness, action: readonly unknown[]): Promise<void> => {
  await perform(harness, action);
  await settleInternal(harness);
};

const stop = (harness: CheckoutHarness): void => {
  harness.actor.stop();
};

/**
 * The forward-replay adapter.
 *
 * @param machine - The machine under test.
 */
export const checkoutAdapter = (machine: CheckoutMachine): ConformanceAdapter<CheckoutHarness> => ({
  start: () => startHarness(machine),
  apply,
  view: checkoutView,
  stop,
});

/*
 * The harness's own choices in a state: who may ask, what the world may do, how a running effect
 * may end. They read the harness, never the spec: a turn withdraws only a cut it still waits on,
 * a producer moves the checkout only under its fence, and the store decides a compare-and-swap.
 */
const choices = (harness: CheckoutHarness): Array<readonly string[]> => {
  const snapshot = snapshotOf(harness);
  const { world, promises } = harness;
  const { nAns } = answersOf(harness);
  /* A producer applies under the checkout fence, which a re-read does not hold. */
  const idle = mintPhase(snapshot) === 'idle' || mintPhase(snapshot) === 'rereading';
  return [
    ...requests.filter((request) => !world.sent.has(request)).map((request) => ['Request', request]),
    ...turnRequests
      .filter((request) => world.sent.has(request) && !world.cancelled.has(request) && nAns[request] === 0)
      .map((request) => ['Cancel', request]),
    ...(promises.running('cut') > 0 ? [['MintNothing'], ['WriteDone']] : []),
    ...(promises.running('casHead') > 0 ? [['Cas']] : []),
    ...(promises.running('readHead') > 0 ? [['ReadDone']] : []),
    ...(!world.switched && idle ? [['SwitchApply']] : []),
    ...(world.ext < maxExternal && idle ? [['FastForward']] : []),
    ...(world.ext < maxExternal ? branches.map((branch) => ['OtherWriter', branch]) : []),
    ...(world.facts.length > 0 ? [['DeliverFact']] : []),
  ];
};

const run = async (machine: CheckoutMachine, actions: ReadonlyArray<readonly string[]>) => {
  const harness = startHarness(machine);
  await settleInternal(harness);
  const views = [checkoutView(harness)];
  for (const action of actions) {
    // oxlint-disable-next-line no-await-in-loop -- each step settles before the next is taken.
    await apply(harness, action);
    views.push(checkoutView(harness));
  }
  return { harness, views };
};

/**
 * The path table of the harness: the shortest action sequence to each distinct harness state,
 * breadth first, as walk paths in the spec's vocabulary. Each path replays on a fresh harness.
 *
 * @param machine - The machine under test.
 * @returns One walk path per reachable harness state.
 */
export const checkoutPaths = async (machine: CheckoutMachine): Promise<WalkPath[]> => {
  const seen = new Set<string>();
  const paths: WalkPath[] = [];
  let frontier: Array<ReadonlyArray<readonly string[]>> = [[]];
  while (frontier.length > 0) {
    const next: Array<ReadonlyArray<readonly string[]>> = [];
    for (const actions of frontier) {
      // oxlint-disable-next-line no-await-in-loop -- one harness at a time keeps the replay deterministic.
      const { harness, views } = await run(machine, actions);
      const state = canonicalJson(views.at(-1));
      if (!seen.has(state)) {
        seen.add(state);
        paths.push({
          initial: views[0] ?? {},
          steps: actions.map((action, index) => ({ action: canonicalJson(action), view: views[index + 1] ?? {} })),
        });
        next.push(...choices(harness).map((choice) => [...actions, choice]));
      }
      stop(harness);
    }
    frontier = next;
  }
  return paths;
};

/** The spec's label of a step, as the graph's edges carry it. */
export const actionOf = (state: SpecView): readonly unknown[] => state['act'] as unknown[];
