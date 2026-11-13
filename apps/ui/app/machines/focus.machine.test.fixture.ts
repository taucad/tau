/**
 * The focus harness the focus tests share: recording ports, a step clock, the actor guard and the runtime schemas
 * (MC-R23, MC-R30). Every port records what focus sends it; the test plays the port's answer back as focus's event.
 */
import { createActor, createCallbackLogic } from 'xstate';
import type { Actor, AnyActorRef, AnyEventObject, StateValue } from 'xstate';
import { StepClock } from '@taucad/xstate-testing/clock';
import { guardActors, validated } from '@taucad/xstate-testing/inspect';
import { recordEmitted } from '@taucad/xstate-testing/fakes';
import type { Project } from '@taucad/types';
import { createFocusMachine, focusIgnoredEvents } from '#machines/focus.machine.js';
import type {
  FocusAccessAnswer,
  FocusAvailability,
  FocusContext,
  FocusEvent,
  FocusFlushCommand,
  FocusLibraryCommand,
  FocusMachine,
  FocusNativeKernel,
  FocusOpenResult,
  FocusPorts,
  FocusRegistryCommand,
  FocusSessionStatus,
} from '#machines/focus.machine.js';

type PortName = keyof FocusPorts;

/** A ready project with an entry, for answers. */
export const projectFixture = (id: string, entryPath = 'main.ts'): Project =>
  // oxlint-disable-next-line typescript/consistent-type-assertions -- the machine reads only `id` and the entry path.
  ({ id, name: id, assets: { main: { entryPath } } }) as unknown as Project;

/** The slugs a project id is addressed by in these tests. */
export const slugsOf = (projectId: string): Readonly<{ workspaceSlug: string; projectSlug: string }> => ({
  workspaceSlug: 'w',
  projectSlug: projectId,
});

type HarnessOptions = Readonly<{
  /** What `nativeKernelOf` answers for every project. */
  kernel?: FocusNativeKernel;
  /** Leave the actor guard to the caller (the totality and conformance tests run without one). */
  guard?: boolean;
}>;

type Sent = AnyEventObject;
type Open = Extract<FocusRegistryCommand, { type: 'open' }>;
type Asked = Extract<FocusLibraryCommand, { type: 'accessAsked' }>;
type RouteRequested = Extract<FocusEvent, { type: 'routeRequested' }>;

/** What a session's facts say, for `facts`. */
export type FactsOptions = Readonly<{ chatReady?: boolean; availability?: FocusAvailability }>;

/** A started focus actor over recording ports, and helpers that play the ports' answers back. */
export type FocusHarness = Readonly<{
  focus: Actor<FocusMachine>;
  clock: StepClock;
  sent: Record<PortName, Sent[]>;
  emitted: AnyEventObject[];
  guard: ReturnType<typeof guardActors> | undefined;
  send: (event: FocusEvent) => void;
  ofType: (name: PortName, type: string) => Sent[];
  opens: () => Open[];
  lastOpen: () => Open;
  lastFlush: () => Readonly<{ requestId: string; projectId: string }>;
  lastAsked: () => Asked;
  state: () => StateValue;
  context: () => FocusContext;
  /** The route commits a project URL and focus hears it. */
  route: (requestId: string, projectId: string | undefined, extra?: Partial<RouteRequested>) => void;
  home: (requestId: string) => void;
  answer: (requestId: string, answer: FocusAccessAnswer, epoch?: number) => void;
  ready: (requestId: string, projectId: string, epoch?: number) => void;
  loaded: () => void;
  facts: (projectId: string, status: FocusSessionStatus, options?: FactsOptions) => void;
  settleOpen: (result: FocusOpenResult, requestId?: string) => void;
  settleFlush: (ok: boolean, requestId?: string) => void;
  /** Open and focus `projectId` from `requestId`: answer ready, load, go live with both facts settled. */
  focusOn: (requestId: string, projectId: string) => void;
}>;

/**
 * A started focus actor over recording ports.
 *
 * @param options - The native kernel every project needs, if any.
 * @returns The actor, its clock, what each port received, what focus emitted, and helpers that play answers back.
 */
// oxlint-disable-next-line max-lines-per-function -- One harness: its helpers share the actor and the records.
export const createFocusHarness = (options: HarnessOptions = {}): FocusHarness => {
  const guard = options.guard === false ? undefined : guardActors({ ignore: { focus: focusIgnoredEvents } });
  const clock = new StepClock();
  const sent: Record<PortName, Sent[]> = { library: [], registry: [], flush: [], module: [], route: [] };
  const port = (name: PortName): AnyActorRef =>
    createActor(
      createCallbackLogic<AnyEventObject>(({ receive }) => {
        receive((event) => {
          sent[name].push(event);
        });
      }),
    ).start();
  const ports: FocusPorts = {
    library: port('library'),
    registry: port('registry'),
    flush: port('flush'),
    module: port('module'),
    route: port('route'),
  };
  const machine = validated(createFocusMachine({ nativeKernelOf: () => options.kernel }));
  const focus = createActor(machine, {
    clock,
    ...(guard === undefined ? {} : { inspect: guard.inspect }),
    input: { ports },
  });
  const emitted = recordEmitted(focus);
  focus.start();

  const send = (event: FocusEvent): void => {
    focus.send(event);
  };
  const ofType = (name: PortName, type: string): Sent[] => sent[name].filter((event) => event.type === type);
  // oxlint-disable-next-line typescript/consistent-type-assertions -- the registry port records only focus's commands.
  const opens = (): Open[] => ofType('registry', 'open') as unknown as Open[];
  const lastOpen = (): Open => {
    const open = opens().at(-1);
    if (open === undefined) {
      throw new Error('focus sent no open');
    }
    return open;
  };
  const lastFlush = (): Readonly<{ requestId: string; projectId: string }> => {
    // oxlint-disable-next-line typescript/consistent-type-assertions -- the flush port records only focus's commands.
    const flush = ofType('flush', 'leaveFlushAsked').at(-1) as FocusFlushCommand | undefined;
    if (flush === undefined) {
      throw new Error('focus asked no leave flush');
    }
    return flush;
  };
  const lastAsked = (): Asked => {
    // oxlint-disable-next-line typescript/consistent-type-assertions -- the library port records only focus's commands.
    const asked = ofType('library', 'accessAsked').at(-1) as Asked | undefined;
    if (asked === undefined) {
      throw new Error('focus asked no access question');
    }
    return asked;
  };
  const ready = (requestId: string, projectId: string, epoch = 0): void => {
    send({ type: 'accessAnswered', requestId, epoch, answer: { status: 'ready', project: projectFixture(projectId) } });
  };

  return {
    focus,
    clock,
    sent,
    emitted,
    guard,
    send,
    opens,
    lastOpen,
    lastFlush,
    lastAsked,
    ofType,
    state: () => focus.getSnapshot().value,
    context: () => focus.getSnapshot().context,
    route: (requestId, projectId, extra = {}) => {
      send({
        type: 'routeRequested',
        requestId,
        slugs: slugsOf(projectId ?? 'unresolved'),
        ...(projectId === undefined ? {} : { projectId }),
        ...extra,
      });
    },
    home: (requestId) => {
      send({ type: 'routeLeft', requestId });
    },
    answer: (requestId, answer, epoch = 0) => {
      send({ type: 'accessAnswered', requestId, epoch, answer });
    },
    ready,
    loaded: () => {
      send({ type: 'moduleLoaded' });
    },
    facts: (projectId, status, { chatReady = true, availability = 'settled' } = {}) => {
      send({ type: 'sessionFacts', projectId, status, chatReady, availability });
    },
    settleOpen: (result, requestId) => {
      send({ type: 'openSettled', requestId: requestId ?? lastOpen().requestId, result });
    },
    settleFlush: (ok, requestId) => {
      send({ type: 'leaveFlushSettled', requestId: requestId ?? lastFlush().requestId, ok });
    },
    focusOn: (requestId, projectId) => {
      send({ type: 'routeRequested', requestId, slugs: slugsOf(projectId), projectId });
      ready(requestId, projectId);
      send({ type: 'moduleLoaded' });
      send({ type: 'sessionFacts', projectId, status: 'live', chatReady: true, availability: 'settled' });
      const open = opens().at(-1);
      if (open?.projectId === projectId) {
        send({ type: 'openSettled', requestId: open.requestId, result: 'live' });
      }
    },
  };
};
