/**
 * Conformance of `workbenchLayout` to `specs/layout-apply/LayoutApply.tla` (app state orchestration charter A8a; D13,
 * I10 to I14): the forward replay of the TLC-exported covering suite (`expected.json`'s `graphs.LayoutApply`, the
 * `export` configuration), the action correspondence in the machine's `meta.tla` (MC-R27), and the drift manifest.
 *
 * The harness is the machine with a scripted record child (the model starts where `recordSync`'s publications come
 * out) and a scripted viewer adapter, the only adapter of the exported graph. The model's two arrangements are two
 * layouts that differ in their viewer tabs.
 *
 * | Spec step                                 | Harness                                                              |
 * | ----------------------------------------- | -------------------------------------------------------------------- |
 * | `Init`                                    | the record's first read publishes `a`                                |
 * | `Published`                               | the record publishes the step's bytes and origin, owed while the     |
 * |                                           | previous step had a local edit unwritten                             |
 * | `ApplyComputed`                           | nothing: the machine computes at arrival or attach                   |
 * | `ApplyDiscarded`                          | the adapter takes the last apply it was offered, which the machine   |
 * |                                           | discarded at once and must not land                                  |
 * | `ApplyLanded`                             | the adapter takes the latest offered apply                           |
 * | `Acknowledged`                            | every attached adapter reports every show it was sent                |
 * | `PersonEdited`                            | the viewer adapter reports the step's arrangement                    |
 * | `AdapterAttaching`, `Attached`, `Detached`| the adapter's own events                                             |
 * | `IntentSent`, `IntentApplied`             | a pane intent; the adapter answers its delivery with the step's      |
 * |                                           | arrangement                                                          |
 * | `IntentDropped`                           | `intentUnavailable`                                                  |
 * | `RouteKeyChanged`                         | a new route key                                                      |
 * | `EditWritten`                             | the record answers the latest edit                                   |
 *
 * Refinement mapping: `shown` is the arrangement, `applied` the acknowledged revision against the latest, `adapter` the
 * adapter regions, `wbOpen` the lane, `intent` each id's state (a delivered intent is queued), `route` the route key
 * changes and `sessions.writing` the unwritten edit. The apply in flight and the record's latest publication are not
 * compared: the machine computes an apply eagerly and discards one at once, so it holds a computed apply where the
 * model has not yet taken `ApplyComputed` and none where the model holds a dead one. Their effect on what lands and what
 * is acknowledged is compared through `shown` and `applied`.
 */
import path from 'node:path';
import { readFileSync } from 'node:fs';
import type { WorkbenchLayout } from '@taucad/workbench';
import {
  checkActionCorrespondence,
  driftManifestProblems,
  hashFiles,
  machineActions,
  machineAlphabet,
  specOperators,
} from '@taucad/formal/drift';
import { readSpecGraph, suiteBehaviours } from '@taucad/formal/graph';
import type { CoveringSuite, SpecGraph, SpecView } from '@taucad/formal/graph';
import { replaySuite } from '@taucad/formal/replay';
import type { ConformanceAdapter } from '@taucad/formal/replay';
import { guardActors } from '@taucad/xstate-testing/inspect';
import { describe, expect, it } from 'vitest';
import { createActor, createCallbackLogic } from 'xstate';
import {
  sameLayout,
  workbenchLayoutIgnoredEvents,
  workbenchLayoutMachine,
} from '#workbench-records/workbench-layout.machine.js';
import type { LayoutAdapterId } from '#workbench-records/pane-intents.js';
import type {
  LayoutRecordCommand,
  WorkbenchLayoutActor,
  WorkbenchLayoutEmitted,
  WorkbenchLayoutEvent,
} from '#workbench-records/workbench-layout.machine.js';

const specs = path.resolve(import.meta.dirname, '../../specs/layout-apply');
const graph = readSpecGraph(path.join(specs, 'LayoutApply/graph.json'));
const suite = JSON.parse(readFileSync(path.join(specs, 'LayoutApply/suite.json'), 'utf8')) as CoveringSuite;
const behaviours = suiteBehaviours(graph, suite);

type SpecIntent = Readonly<{ state: string; target: LayoutAdapterId; kind?: 'file' | 'pane' }>;
type SpecState = Readonly<{
  act: string;
  shown: string;
  applied: string;
  adapter: Readonly<Partial<Record<LayoutAdapterId, string>>>;
  wbOpen: boolean;
  intent: readonly SpecIntent[];
  route: number;
  rec: Readonly<{ bytes: string; origin: 'own' | 'foreign'; done: boolean; fresh: boolean; held: boolean }>;
  pending: Readonly<{ state: string; bytes: string; fresh: boolean; held: boolean; latest: boolean }>;
  sessions: Readonly<{ writing: boolean }>;
}>;

/** The model's two arrangements: they differ in their viewer tabs, the part the exported graph's adapter edits. */
const layoutOf = (bytes: string): WorkbenchLayout => ({
  version: 1,
  lanes: { chat: true, workbench: true },
  viewer: { kind: 'group', tabs: [{ kind: 'view', view: bytes === 'a' ? 'front' : 'iso' }] },
  workbench: { kind: 'group', tabs: [{ kind: 'pane', pane: 'parameters' }] },
});
const bytesOf = (layout: WorkbenchLayout | undefined): string =>
  sameLayout(layout, layoutOf('a'))
    ? 'a'
    : sameLayout(layout, layoutOf('b'))
      ? 'b'
      : `unexpected ${JSON.stringify(layout)}`;
const digestOf = (bytes: string): `sha256:${string}` => `sha256:${bytes}`;

/** A small deterministic generator (Park and Miller's minimal standard), so a walk's failure replays from its seed. */
const seeded = (seed: number): (() => number) => {
  const modulus = 2_147_483_647;
  let state = (seed % (modulus - 1)) + 1;
  return () => {
    state = (state * 48_271) % modulus;
    return (state - 1) / (modulus - 1);
  };
};

/** `count` walks of at most `length` steps from the graph's initial states, each step a uniformly chosen edge. */
const randomWalks = (
  specGraph: SpecGraph,
  options: Readonly<{ seed: number; count: number; length: number }>,
): SpecView[][] => {
  const successors = new Map<number, number[]>();
  for (const [from, to] of specGraph.edges) {
    successors.set(from, [...(successors.get(from) ?? []), to]);
  }
  const random = seeded(options.seed);
  const pick = <Item>(items: readonly Item[]): Item => items[Math.floor(random() * items.length)]!;
  return Array.from({ length: options.count }, () => {
    const walk = [pick(specGraph.initial)];
    while (walk.length <= options.length) {
      const next = successors.get(walk.at(-1)!);
      if (next === undefined || next.length === 0) {
        break;
      }
      walk.push(pick(next));
    }
    return walk.map((state) => specGraph.views[state] ?? {});
  });
};

/* The exported graph's intent ids. */
const intentCount = (behaviours[0]?.[0] as SpecState | undefined)?.intent.length ?? 0;

/* Whether the exported graph's intents carry a kind (the spec-la rule 7 follow-up adds one). */
const intentsHaveKind = (behaviours[0]?.[0] as SpecState | undefined)?.intent[0]?.kind !== undefined;

type Harness = Readonly<{
  actor: WorkbenchLayoutActor;
  emitted: WorkbenchLayoutEmitted[];
  record: { send: ((event: WorkbenchLayoutEvent) => void) | undefined; commands: LayoutRecordCommand[] };
  routes: { count: number };
  previous: { state: SpecState | undefined };
}>;

const start = (): Harness => {
  const guard = guardActors({ ignore: { workbenchLayout: workbenchLayoutIgnoredEvents } });
  const record: Harness['record'] = { send: undefined, commands: [] };
  const layoutRecord = createCallbackLogic<LayoutRecordCommand>(({ sendBack, receive }) => {
    record.send = sendBack;
    receive((command) => {
      record.commands.push(command);
    });
  });
  const actor = createActor(workbenchLayoutMachine.provide({ actors: { layoutRecord } }), {
    input: { device: 'desktop', adapters: ['viewer'], routeKey: 'route-0', workbenchOpen: false },
    inspect: guard.inspect,
  });
  const emitted: WorkbenchLayoutEmitted[] = [];
  actor.on('*', (event) => {
    emitted.push(event as WorkbenchLayoutEmitted);
  });
  actor.start();
  record.send!({
    type: 'recordPublished',
    layout: layoutOf('a'),
    digest: digestOf('a'),
    origin: 'foreign',
    refusal: undefined,
    owed: false,
  });
  return { actor, emitted, record, routes: { count: 0 }, previous: { state: behaviours[0]?.[0] as SpecState } };
};

const changedIntent = (before: SpecState, after: SpecState): number =>
  after.intent.findIndex((entry, index) => entry.state !== before.intent[index]?.state);

const changedAdapter = (before: SpecState, after: SpecState): LayoutAdapterId => {
  const adapter = (Object.keys(after.adapter) as LayoutAdapterId[]).find(
    (candidate) => after.adapter[candidate] !== before.adapter[candidate],
  );
  if (adapter === undefined) {
    throw new Error(`no adapter changed in ${after.act}`);
  }
  return adapter;
};

type Step = (harness: Harness, state: SpecState, before: SpecState) => void;

/** The adapter takes the last apply it was offered. */
const takeLastOffer: Step = ({ actor, emitted }) => {
  const offer = emitted.findLast((event) => event.type === 'applyOffered');
  if (offer?.type === 'applyOffered') {
    actor.send({ type: 'applyTaken', adapter: 'viewer', applyId: offer.applyId });
  }
};

const adapterStep =
  (type: 'adapterAttaching' | 'adapterAttached' | 'adapterDetached'): Step =>
  ({ actor }, state, before) => {
    actor.send({ type, adapter: changedAdapter(before, state) });
  };

/** Each spec step's harness events, as the header's table lists them, by the step's name in camel case. */
const steps: Readonly<Record<string, Step>> = {
  published: ({ record }, state, before) => {
    record.send!({
      type: 'recordPublished',
      layout: layoutOf(state.rec.bytes),
      digest: digestOf(state.rec.bytes),
      origin: state.rec.origin,
      refusal: undefined,
      owed: before.sessions.writing,
    });
  },
  // The machine computed it at arrival or attach.
  applyComputed: () => undefined,
  // The adapter races the discard: it takes the last apply it was offered, which must not land (rule 2).
  applyDiscarded: takeLastOffer,
  applyLanded: takeLastOffer,
  acknowledged: ({ actor, emitted }) => {
    for (const event of emitted) {
      if (event.type === 'show') {
        actor.send({ type: 'adapterShown', adapter: event.adapter, showId: event.showId });
      }
    }
  },
  personEdited: ({ actor }, state) => {
    actor.send({ type: 'personEdited', adapter: 'viewer', node: layoutOf(state.shown).viewer });
  },
  adapterAttaching: adapterStep('adapterAttaching'),
  adapterAttached: adapterStep('adapterAttached'),
  adapterDetached: adapterStep('adapterDetached'),
  intentSent: ({ actor }, state, before) => {
    const index = changedIntent(before, state);
    const entry = state.intent[index]!;
    actor.send({
      type: 'intent',
      intentId: String(index + 1),
      source: 'person',
      target: { kind: 'pane', adapter: entry.target, pane: 'model' },
    });
  },
  intentApplied: ({ actor, emitted }, state, before) => {
    const intentId = String(changedIntent(before, state) + 1);
    const delivery = emitted.findLast((event) => event.type === 'deliverIntent' && event.intentId === intentId);
    if (delivery?.type === 'deliverIntent') {
      actor.send({
        type: 'intentApplied',
        intentId,
        deliveryId: delivery.deliveryId,
        node: delivery.adapter === 'viewer' ? layoutOf(state.shown).viewer : layoutOf(state.shown).workbench,
      });
    }
  },
  intentDropped: ({ actor }, state, before) => {
    actor.send({ type: 'intentUnavailable', intentId: String(changedIntent(before, state) + 1) });
  },
  routeKeyChanged: (harness) => {
    harness.routes.count += 1;
    harness.actor.send({ type: 'routeChanged', routeKey: `route-${harness.routes.count}` });
  },
  editWritten: ({ record }) => {
    const edit = record.commands.findLast((command) => command.type === 'edit');
    if (edit?.type === 'edit') {
      record.send!({ type: 'recordEditAnswered', editCount: edit.editCount, ok: true });
    }
  },
};

const perform: Step = (harness, state, before) => {
  const step = steps[`${state.act.charAt(0).toLowerCase()}${state.act.slice(1)}`];
  if (step === undefined) {
    throw new Error(`the exported graph has no ${state.act} step`);
  }
  step(harness, state, before);
};

const adapter: ConformanceAdapter<Harness> = {
  start,
  apply: async (harness, [, next]) => {
    const state = next as SpecState;
    perform(harness, state, harness.previous.state!);
    harness.previous.state = state;
  },
  view: (harness) => {
    const snapshot = harness.actor.getSnapshot();
    const { context } = snapshot;
    const ids = Array.from({ length: intentCount }, (_, index) => String(index + 1));
    return {
      shown: bytesOf(context.arrangement),
      applied:
        context.acknowledged === undefined
          ? 'Unknown'
          : context.acknowledged === context.latest?.revision
            ? 'latest'
            : 'older',
      adapter: Object.fromEntries(context.adapters.map((id) => [id, (snapshot.value as Record<string, string>)[id]])),
      wbOpen: context.workbenchOpen,
      intent: ids.map((intentId) => {
        const entry = context.intents[intentId];
        // A settled intent is retired to its outcome once no late answer can reach it.
        const outcome = context.outcomes[intentId];
        // The export graph's intents all target the viewer, whose intents the spec only ever kinds `file` (a `pane`
        // kind exists for desktop workbench intents alone), so this field is the same on both sides; rule 7's kinds
        // are checked by the TLC configurations and the unit rows.
        const kind = intentsHaveKind ? { kind: 'file' } : {};
        if (outcome !== undefined) {
          return { state: outcome.outcome === 'applied' ? 'applied' : outcome.reason, target: 'viewer', ...kind };
        }
        if (entry === undefined) {
          return { state: 'unsent', target: 'viewer', ...kind };
        }
        if (entry.state === 'queued' || entry.state === 'delivered') {
          return {
            state: 'queued',
            target: entry.target.kind === 'file' ? 'workbench' : entry.target.adapter,
            ...kind,
          };
        }
        return { state: entry.state === 'applied' ? 'applied' : entry.reason, target: 'viewer', ...kind };
      }),
      route: harness.routes.count,
      sessions: { writing: context.unwritten },
      landable:
        context.adapters.some((id) => (snapshot.value as Record<string, string>)[id] === 'attached') &&
        context.pending !== undefined &&
        context.pending.revision === context.latest?.revision &&
        context.pending.editCount === context.editCount &&
        !sameLayout(context.pending.layout, context.arrangement),
      acknowledgeable:
        context.adapters.every((id) => (snapshot.value as Record<string, string>)[id] === 'attached') &&
        context.pending === undefined &&
        context.latest !== undefined &&
        sameLayout(context.arrangement, context.latest.layout) &&
        context.acknowledged !== context.latest.revision,
    };
  },
  project: (view) => {
    const state = view as SpecState;
    const attached = Object.values(state.adapter).filter((value) => value === 'attached');
    const { pending, rec } = state;
    // Rule 2: the apply in flight may still land.
    const current = pending.state === 'computed' && pending.latest && pending.fresh && !pending.held;
    return {
      ...state,
      sessions: { writing: state.sessions.writing },
      // An apply would change the arrangement if an adapter took it now: the one in flight, or the latest
      // publication's once computed. The machine computes eagerly and discards at once, so this is what both agree on.
      landable:
        attached.length > 0 &&
        ((current && pending.bytes !== state.shown) ||
          (!(pending.state === 'computed' && pending.latest) &&
            !rec.done &&
            rec.fresh &&
            !rec.held &&
            rec.bytes !== state.shown)),
      // Rule 4 with every report in: a dead apply the model has not yet discarded does not count, since the machine
      // discards it in the step that kills it, and nor does a current one whose bytes are already shown, which the
      // machine never computes (rule 3, D18).
      acknowledgeable:
        attached.length === Object.keys(state.adapter).length &&
        !(current && pending.bytes !== state.shown) &&
        state.shown === rec.bytes &&
        state.applied !== 'latest',
    };
  },
  stop: (harness) => {
    harness.actor.stop();
  },
};

describe('workbenchLayout conforms to LayoutApply.tla', () => {
  it('should replay the TLC covering suite through the adapter', async () => {
    expect(behaviours).toHaveLength(suite.behaviours.length);
    expect(behaviours.length).toBeGreaterThan(0);
    const replayed = await replaySuite(behaviours, adapter, (state) => {
      return [state['act'], state];
    });
    expect(replayed).toEqual([]);
  });

  it('should replay seeded random walks through the exported graph', async () => {
    // The covering suite has one shortest behaviour per class, which misses orders such as an edit between an apply's
    // computation and its discard (rule 2). Fixed-seed walks reach them; the seed keeps the run reproducible.
    const walks = randomWalks(graph, { seed: 1808, count: 400, length: 14 });
    expect(walks.length).toBe(400);
    expect(await replaySuite(walks, adapter, (state) => [state['act'], state])).toEqual([]);
  });

  it('should name a model action on every refining transition, and a transition for every machine action (MC-R27)', () => {
    const actions = Object.fromEntries(
      Object.entries(machineActions([workbenchLayoutMachine])).filter(([, action]) => action !== 'Unmodelled'),
    );
    expect(new Set(Object.values(actions))).toEqual(
      new Set([
        'Published',
        'ApplyLanded',
        'Acknowledged',
        'PersonEdited',
        'AdapterAttaching',
        'AdapterAttached',
        'AdapterDetached',
        'IntentSent',
        'IntentApplied',
        'IntentDropped',
        'RouteKeyChanged',
        'WorkbenchClosed',
        'RestoreAsked',
        'RestoreSettled',
        'EditWritten',
      ]),
    );
    expect(
      checkActionCorrespondence(actions, {
        operators: specOperators(readFileSync(path.join(specs, 'LayoutApply.tla'), 'utf8')),
        next: [
          'Published',
          'ApplyComputed',
          'ApplyLanded',
          'ApplyDiscarded',
          'Acknowledged',
          'PersonEdited',
          'AdapterAttaching',
          'AdapterAttached',
          'AdapterDetached',
          'IntentSent',
          'IntentApplied',
          'IntentDropped',
          'RouteKeyChanged',
          'WorkbenchClosed',
          'RestoreAsked',
          'RestoreSettled',
          'EditWritten',
          'HostRemounted',
          'OldStoreDisposed',
          'OrphanWriteLanded',
        ],
        // The machine computes an apply in the step that makes it computable and discards one in the step that makes
        // it stale, so `ApplyComputed` and `ApplyDiscarded` are outcomes of `Published`, the adapter and edit steps.
        // The host remount and its orphan write are today's store (Today only); the record session is a child here.
        environment: ['ApplyComputed', 'ApplyDiscarded', 'HostRemounted', 'OldStoreDisposed', 'OrphanWriteLanded'],
      }),
    ).toEqual([]);
  });

  it('should match the committed drift manifest', () => {
    expect(
      driftManifestProblems(path.join(specs, 'LayoutApply/drift.json'), {
        alphabet: machineAlphabet([workbenchLayoutMachine]),
        versions: { [workbenchLayoutMachine.id]: String(workbenchLayoutMachine.version) },
        tables: {},
        actions: machineActions([workbenchLayoutMachine]),
        specs: hashFiles(specs, ['LayoutApply.tla']),
      }),
    ).toEqual([]);
  });
});
