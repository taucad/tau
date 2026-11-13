/*
 * Conformance of `focus` and its route-state selector to `specs/project-focus/ProjectFocus.tla` (app state
 * orchestration charter D7, I2 to I4, I20; plan § 4 A5a): forward replay of the TLC-exported covering suite, the
 * action correspondence (MC-R27). The drift manifest is `specs/project-focus/project-focus.drift.test.ts`'s (FM-R13).
 *
 * The suite comes from `ProjectFocus.export.cfg`: the target at two projects and Home, three requests, budget 2, no
 * library change and no failure. The harness plays every party but focus, so each spec step is one thing it does:
 *
 *   RouteCommitted     the router commits; the selector reads it before focus hears it
 *   RouteHeard, ChatForwarded   `routeRequested` (or `routeLeft` for Home)
 *   AccessAnswered     the library answers the question the model answered, with the access it holds
 *   ModuleLoaded       `moduleLoaded`
 *   LeaveFlushSettled  the flush port answers the running leave flush; nothing for the model's `TLeft`
 *   ChatReady          the session reports both facts settled (`FactOrder = "together"`)
 *   OpenBoundPassed    the clock passes `openPatienceMilliseconds`
 *   Edit               nothing: unsaved work belongs to the session, not to focus
 *   AccessAsked, LeaveFlushStarted, OpenAsked, OpenJoined   nothing (below)
 *
 * Focus takes `AccessAsked`, `LeaveFlushStarted`, `TLeft`, `OpenAsked` and `OpenJoined` in the macrostep of the
 * event that enables them, where the model takes each as a step of its own. So `project` applies every one of those
 * steps that is enabled to the model's state before the comparison; the registry stub answers focus's open as the
 * model's `Outcomes` would. The view compares focus's state, its request, its answer, the project it is on and the
 * one it is leaving with that flush, whether its open is out and went live, the module, and the selector's route
 * state.
 */
import path from 'node:path';
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { checkActionCorrespondence, machineActions, specOperators } from '@taucad/formal/drift';
import { readSpecGraph, suiteBehaviours } from '@taucad/formal/graph';
import type { CoveringSuite, SpecView } from '@taucad/formal/graph';
import { replaySuite } from '@taucad/formal/replay';
import type { ConformanceAdapter } from '@taucad/formal/replay';
import { flush } from '@taucad/xstate-testing/clock';
import { createFocusMachine, openPatienceMilliseconds } from '#machines/focus.machine.js';
import { createFocusHarness, projectFixture, slugsOf } from '#machines/focus.machine.test.fixture.js';
import { selectProjectRouteState } from '#machines/focus.route-state.js';
import type { FocusRegistryView } from '#machines/focus.route-state.js';

const specs = path.resolve(import.meta.dirname, '../../specs/project-focus');
const graph = readSpecGraph(path.join(specs, 'ProjectFocus/graph.json'));
const suite = JSON.parse(readFileSync(path.join(specs, 'ProjectFocus/suite.json'), 'utf8')) as CoveringSuite;

const none = 'None';
const home = 'Home';

type Request = Readonly<{ id: number; project: string; chat: string }>;
type Focus = Readonly<{
  req: Request;
  st: string;
  ans: string;
  ansProj: string;
  ansEpoch: number;
  on: string;
  from: string;
  lf: string;
  lfp: string;
  opened: boolean;
  live: boolean;
}>;

/** The model's state, as far as the harness reads it. */
type SpecState = Readonly<{
  act: string;
  route: Request;
  f: Focus;
  asks: ReadonlyArray<Readonly<{ id: number; project: string; epoch: number }>>;
  lib: Readonly<{ access: Readonly<Record<string, string>>; epoch: number }>;
  mod: string;
  sess: Readonly<Record<string, string>>;
  fact: Readonly<Record<string, string>>;
  pendingOpen: Readonly<{ project: string; req: unknown }>;
}>;

const budget = 2;
const facts = new Set(['settled', 'bound']);

/* The model's focus steps that focus takes eagerly, applied until none is enabled. */
const fresh = (s: SpecState): boolean => s.f.ans !== 'none' && s.f.ansEpoch === s.lib.epoch;
const leaveDone = (s: SpecState): boolean => s.f.from === none || s.f.lf === 'ok' || s.sess[s.f.from] === 'none';
const closeable = (s: SpecState, p: string): boolean => s.sess[p] === 'live' || s.sess[p] === 'failed';
const liveCount = (s: SpecState): number => Object.values(s.sess).filter((status) => status !== 'none').length;

// oxlint-disable-next-line complexity -- One step per eager model action, in the model's own guards.
const eager = (s: SpecState): SpecState | undefined => {
  const { f } = s;
  if (f.st === 'leaving' && f.lf === 'none' && f.from !== none && closeable(s, f.from)) {
    return { ...s, f: { ...f, lf: 'running', lfp: f.from } };
  }
  if (f.st === 'leaving' && f.lf !== 'running' && leaveDone(s)) {
    return { ...s, f: { ...f, st: f.req.project === home ? 'idle' : 'opening' } };
  }
  if (f.st === 'opening' && !f.opened && f.ans === 'ready' && fresh(s)) {
    const p = f.ansProj;
    const status = s.sess[p];
    if (status === 'live' || status === 'failed') {
      return { ...s, f: { ...f, opened: true, live: true }, pendingOpen: { project: none, req: none } };
    }
    if (status === 'none' && liveCount(s) < budget) {
      return {
        ...s,
        f: { ...f, opened: true, live: true },
        sess: { ...s.sess, [p]: 'live' },
        fact: { ...s.fact, [p]: 'pending' },
        pendingOpen: { project: none, req: none },
      };
    }
    return { ...s, f: { ...f, opened: true, live: false }, pendingOpen: { project: p, req: { project: p } } };
  }
  const settle = { st: 'focused', on: f.ansProj, from: none, lf: 'none', lfp: none };
  const opened = f.st === 'opening' && f.opened && f.ans === 'ready' && s.pendingOpen.project !== f.ansProj;
  if (opened && fresh(s) && s.sess[f.ansProj] === 'live' && s.mod === 'loaded' && facts.has(s.fact[f.ansProj] ?? '')) {
    return { ...s, f: { ...f, ...settle } };
  }
  if (opened && f.live && (s.sess[f.ansProj] === 'none' || s.sess[f.ansProj] === 'failed')) {
    return { ...s, f: { ...f, ...settle } };
  }
  return undefined;
};

const closure = (state: SpecState): SpecState => {
  let current = state;
  for (let next = eager(current); next !== undefined; next = eager(current)) {
    current = next;
  }
  return current;
};

/** `TargetView`: the route state the selector derives, as the model names it. */
const targetView = (s: SpecState): string => {
  const { f, route } = s;
  if (route.id === 0 || route.project === home) {
    return 'none';
  }
  if (f.req.id === 0 || route.project !== f.req.project) {
    return 'resolving';
  }
  switch (f.st) {
    case 'flushFailed': {
      return 'flushError';
    }
    case 'held': {
      return 'held';
    }
    case 'focused': {
      return s.sess[f.ansProj] === 'live' ? 'editor' : 'closed';
    }
    default: {
      return 'resolving';
    }
  }
};

/** What is compared: focus's fields the machine stands for, and the route state. */
const fields = (s: SpecState): SpecView => ({
  st: s.f.st,
  req: s.f.req,
  ans: s.f.ans,
  ansProj: s.f.ansProj,
  on: s.f.on,
  from: s.f.from,
  lf: s.f.from === none ? 'none' : s.f.lf,
  opened: s.f.opened,
  live: s.f.opened && s.f.live,
  mod: s.mod,
  view: targetView(s),
});

type Harness = Readonly<{
  focus: ReturnType<typeof createFocusHarness>;
  stub: { route: Request; sess: Record<string, 'live'>; handled: number; factsFirst: boolean };
}>;

const requestId = (id: number): string => `r${id}`;

/**
 * The registry stub answers each open focus sent as the model's `Outcomes` would. The spawn is one step in the model,
 * so the stub reports the new session's facts before or after the open's reply, as the replay asks.
 */
const answerOpens = (harness: Harness): void => {
  const { focus, stub } = harness;
  for (let opens = focus.opens(); stub.handled < opens.length; opens = focus.opens()) {
    const open = opens[stub.handled]!;
    stub.handled += 1;
    const spawned = stub.sess[open.projectId] === undefined && Object.keys(stub.sess).length < budget;
    if (spawned) {
      stub.sess[open.projectId] = 'live';
    }
    // A spawn's facts may come before its answer too; the harness reports them again after it (the wiring contract).
    if (spawned && stub.factsFirst) {
      focus.facts(open.projectId, 'live', { chatReady: false, availability: 'pending' });
    }
    focus.settleOpen(stub.sess[open.projectId] === undefined ? 'waiting' : 'live', open.requestId);
    if (spawned && !stub.factsFirst) {
      focus.facts(open.projectId, 'live', { chatReady: false, availability: 'pending' });
    }
  }
};

// oxlint-disable-next-line complexity -- One case per model action.
const apply = async (harness: Harness, previous: SpecState, state: SpecState): Promise<void> => {
  const { focus, stub } = harness;
  switch (state.act) {
    case 'RouteCommitted': {
      stub.route = state.route;
      break;
    }
    case 'RouteHeard':
    case 'ChatForwarded': {
      const { req } = state.f;
      if (req.project === home) {
        focus.home(requestId(req.id));
      } else {
        focus.route(requestId(req.id), req.project, req.chat === none ? {} : { chatId: req.chat });
      }
      break;
    }
    case 'AccessAnswered': {
      const answered = previous.asks.find(
        (ask) => !state.asks.some((other) => other.id === ask.id && other.project === ask.project),
      );
      if (answered === undefined) {
        throw new Error('AccessAnswered: the model answered no question the harness holds.');
      }
      const ready = previous.lib.access[answered.project] === 'ready';
      focus.answer(
        requestId(answered.id),
        ready ? { status: 'ready', project: projectFixture(answered.project) } : { status: 'unavailable' },
        previous.lib.epoch,
      );
      break;
    }
    case 'ModuleLoaded': {
      focus.loaded();
      break;
    }
    case 'LeaveFlushSettled': {
      if (previous.f.lf === 'running') {
        const flushId = focus.context().flights[previous.f.lfp];
        if (flushId === undefined) {
          throw new Error('LeaveFlushSettled: focus has no flush running for the session the model is leaving.');
        }
        focus.settleFlush(state.f.lf === 'ok' || state.f.lf === 'none', flushId);
      }
      break;
    }
    case 'ChatReady': {
      const projectId = state.f.ansProj;
      focus.facts(projectId, 'live', { chatReady: true, availability: 'settled' });
      break;
    }
    case 'OpenBoundPassed': {
      focus.clock.advance(openPatienceMilliseconds);
      break;
    }
    case 'Edit':
    case 'AccessAsked':
    case 'LeaveFlushStarted':
    case 'OpenAsked':
    case 'OpenJoined': {
      break;
    }
    default: {
      throw new Error(`No harness step for the model's ${state.act}.`);
    }
  }
  answerOpens(harness);
  await flush();
};

const kindToView: Readonly<Record<string, string>> = {
  resolving: 'resolving',
  'flush-error': 'flushError',
  editor: 'editor',
  closed: 'closed',
};

/** The model's fields this harness state stands for (the refinement mapping). */
// oxlint-disable-next-line complexity -- One mapping per model field.
const view = (harness: Harness): SpecView => {
  const snapshot = harness.focus.focus.getSnapshot();
  const { context } = snapshot;
  const { request, answer, leave, open } = context;
  const st = typeof snapshot.value === 'string' ? snapshot.value : (Object.keys(snapshot.value)[0] ?? '');
  const registry: FocusRegistryView = {
    status: Object.fromEntries(
      Object.keys(harness.stub.sess).map((projectId) => [
        projectId,
        { state: 'live', runs: 0, dirty: false, pushed: true, pending: 0, chatReady: true, availability: 'settled' },
      ]),
    ),
    closed: {},
  };
  const { route } = harness.stub;
  const committed =
    route.id === 0 || route.project === home
      ? undefined
      : {
          slugs: slugsOf(route.project),
          projectId: route.project,
          chatId: route.chat === none ? undefined : route.chat,
        };
  const kind = selectProjectRouteState(snapshot, registry, committed)?.kind;
  const status = answer?.answer.status;
  return {
    st,
    req:
      request === undefined
        ? { id: 0, project: none, chat: none }
        : {
            id: Number(request.requestId.slice(1)),
            project: request.home ? home : (request.projectId ?? none),
            chat: request.chatId ?? none,
          },
    ans: status === undefined ? 'none' : status === 'ready' ? 'ready' : status === 'start-failed' ? 'failed' : 'held',
    ansProj: answer?.projectId ?? none,
    on: context.on ?? none,
    from: leave?.projectId ?? none,
    lf: leave?.flush ?? 'none',
    opened: open.openId !== undefined,
    live: open.openId !== undefined && open.live,
    mod: context.module,
    view: kind === undefined ? 'none' : (kindToView[kind] ?? 'held'),
  };
};

const project = (spec: SpecView): SpecView => fields(closure(spec as unknown as SpecState));

const machine = createFocusMachine({ nativeKernelOf: () => undefined });

describe('focus conforms to ProjectFocus.tla', () => {
  it.each([
    ['before and after', true],
    ['after', false],
  ])('should replay the covering suite without divergence, facts reported %s the reply', async (_order, factsFirst) => {
    const behaviours = suiteBehaviours(graph, suite) as unknown as SpecState[][];
    const divergences = [];
    for (const [index, behaviour] of behaviours.entries()) {
      let step = 0;
      const adapter: ConformanceAdapter<Harness> = {
        start: () => ({
          focus: createFocusHarness({ guard: false }),
          stub: { route: { id: 0, project: none, chat: none }, sess: {}, handled: 0, factsFirst },
        }),
        apply: async (harness, [state]) => {
          step += 1;
          await apply(harness, behaviour[step - 1]!, state as SpecState);
        },
        view,
        project,
        stop(harness) {
          harness.focus.focus.stop();
        },
      };
      // oxlint-disable-next-line no-await-in-loop -- each behaviour replays on its own actor, in order.
      const found = await replaySuite([behaviour as unknown as SpecView[]], adapter, (state) => [state]);
      divergences.push(
        ...found.map((divergence) => ({ ...divergence, behaviour: index, action: behaviour[divergence.step]?.act })),
      );
    }

    expect(behaviours).toHaveLength(35);
    expect(divergences).toEqual([]);
  });

  it('should take every action of the model in the suite', () => {
    const taken = new Set(suiteBehaviours(graph, suite).flatMap((behaviour) => behaviour.map((state) => state['act'])));

    // No failure, library change, person command or close is in the export's bounds; the machine rows cover them.
    expect([...taken].map(String).toSorted((left, right) => left.localeCompare(right))).toEqual([
      'AccessAnswered',
      'AccessAsked',
      'ChatForwarded',
      'ChatReady',
      'Edit',
      'Init',
      'LeaveFlushSettled',
      'LeaveFlushStarted',
      'ModuleLoaded',
      'OpenAsked',
      'OpenBoundPassed',
      'OpenJoined',
      'RouteCommitted',
      'RouteHeard',
    ]);
  });

  it('should name a model action on every refining transition, and a transition for every focus action (MC-R27)', () => {
    const actions = machineActions([machine]);
    const named = new Set(Object.values(actions).filter((action) => action !== 'Unmodelled'));

    expect(named).toEqual(
      new Set([
        'TRouteHeard',
        'AccessAnswered',
        'LibraryChanged',
        'LeaveFlushSettled',
        'ModuleLoaded',
        'TOpenAsked',
        'ChatReady',
        'OpenBoundPassed',
        'PersonOpenAsked',
        'TRetry',
      ]),
    );
    expect(
      checkActionCorrespondence(
        Object.fromEntries(Object.entries(actions).filter(([, action]) => action !== 'Unmodelled')),
        {
          operators: specOperators(readFileSync(path.join(specs, 'ProjectFocus.tla'), 'utf8')),
          // The target's `Next`, less today's gate (`DRerun`, `DRetry`, `RegSync`).
          next: [
            'RouteCommitted',
            'LibraryChanged',
            'AccessAnswered',
            'LeaveFlushSettled',
            'ModuleLoaded',
            'TRouteHeard',
            'TAccessAsked',
            'TLeaveFlushStarted',
            'TLeft',
            'TOpenAsked',
            'TOpenJoined',
            'TRetry',
            'TOpenLost',
            'TOpenOnFailed',
            'ChatReady',
            'FirstCheckSettled',
            'OpenBoundPassed',
            'Edit',
            'PersonOpenAsked',
            'PersonClosed',
            'IdleExpired',
            'BudgetSwitchClose',
            'SessionClosed',
            'CloseFlushFailed',
            'CloseFailed',
            'PersonDiscarded',
          ],
          /*
           * The router, the person's edits and closes, and the registry act outside focus; their effect on focus
           * arrives as `routeRequested`, `sessionFacts` and `openSettled`. `FirstCheckSettled` arrives in the same
           * `sessionFacts` as `ChatReady`. Focus takes `TAccessAsked`, `TLeaveFlushStarted`, `TLeft`, `TOpenJoined`,
           * `TOpenLost` and `TOpenOnFailed` in the macrostep of the event that enables them.
           */
          environment: [
            'RouteCommitted',
            'Edit',
            'PersonClosed',
            'PersonDiscarded',
            'IdleExpired',
            'BudgetSwitchClose',
            'SessionClosed',
            'CloseFlushFailed',
            'CloseFailed',
            'FirstCheckSettled',
            'TAccessAsked',
            'TLeaveFlushStarted',
            'TLeft',
            'TOpenJoined',
            'TOpenLost',
            'TOpenOnFailed',
          ],
        },
      ),
    ).toEqual([]);
  });
});
