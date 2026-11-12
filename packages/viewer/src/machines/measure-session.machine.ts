/**
 * Measure's session: one per mounted measuring tool. It owns where the pointer hovers, the press generation that a
 * press waiting on its targets is checked against, and when a release commits, cancels or waits.
 *
 * ```text
 * measureSession: off ⇄ on
 * context: hover, pressGeneration, deferred, inputRef, exactRef, catalogRef
 * ```
 *
 * - **off**: Measure is off. Nothing hovers and no press is taken; a pose change still moves the press generation on.
 * - **on**: Measure is on. The pointer adapter (`pointer`) listens on the surface and reports what the pointer did;
 *   every decision about a release comes from the `measureInput` child, whose emitted decision the session listens to.
 *
 * Two DOM adapters, provided by the tool and sharing one closure, own everything a host holds (D4): `follower` lives
 * as long as the session and reports what changed under it (Measure turning on or off, the presented camera, a
 * camera drag, the pose, the cuts, the start, the presented model and the hover settings), and `pointer`, invoked only in `on`, owns the
 * surface's listeners, the raycasts and the waiting presses. The session answers each report with a
 * {@link MeasureSessionCommand}; it touches no DOM, Three object or host actor itself.
 *
 * A press waiting on its targets lands only while the press generation is the one it waited under. Any newer press,
 * a camera drag, a pose, cut, start or model change, or Measure turning off moves the generation on and drops it.
 *
 * While Measure is on the session also runs, one at a time each, the two pieces of async work a commit or a target list
 * starts (G10b), as children it spawns and stops:
 *
 * - **exact** (`exactRef`): the exact CAD distance a body-to-body minimum distance waits for. A new commit replaces it,
 *   and Measure turning off cancels it, each with its reason; a pose, cut or model change stops it, since graphics has
 *   already marked its record out of date. Stopping the session (the view closing) cancels it from its own cleanup.
 * - **catalog** (`catalogRef`): the scan that lists the targets in view, a page at a time. A new request replaces it;
 *   the camera, pose, cuts, the listed model or its filter changing, or Measure turning off, stops it.
 *
 * Every fact here is ephemeral: derived from the pointer on the mounted surface and never persisted or seeded.
 *
 * @module
 */

import type { GeometryComponentManifest } from '@taucad/types';
import { createCallbackLogic, setup, types } from 'xstate';
import type { ActorRefFrom, CallbackActorLogic, EnqueueObject, SnapshotFrom, SystemRegistry } from 'xstate';
import { eventSchemas } from '#machines/machine-schemas.js';
import { measureInputMachine } from '#machines/measure-input.machine.js';
import type { MeasureInputEmitted, MeasureInputEvent, MeasureInputRef } from '#machines/measure-input.machine.js';

/**
 * Where the pointer is, in client pixels.
 *
 * @public
 */
export type MeasurePointerAt = Readonly<{ clientX: number; clientY: number }>;

/**
 * Commands the session sends its adapters.
 *
 * @public
 */
export type MeasureSessionCommand =
  /** Hover from `at`: `now` takes the pointer snapshot at once, `frame` on the next animation frame. */
  | { type: 'hover'; at: MeasurePointerAt; when: 'now' | 'frame' }
  /** Nothing hovers: drop a waiting hover and clear the marks. */
  | { type: 'hoverCleared' }
  /** The release just reported decided this: place its point, cancel the current measurement, or neither. */
  | { type: 'releaseDecided'; decision: 'accepted' | 'cancelled' | 'ignored' }
  /** The release just reported waits on its targets under `generation`; report `pressReady` when they are. */
  | { type: 'pressDeferred'; generation: number }
  /** The press waiting under `generation` is still current: take its snapshot again and land it. */
  | { type: 'pressLanded'; generation: number }
  /** The presented camera changed: targets the tool holds in world space under the old one are stale. */
  | { type: 'candidatesInvalidated' }
  /** Use target was asked for: commit the chosen candidate, and report `committed` if a point was placed. */
  | { type: 'commitChosen' };

/**
 * The exact CAD distance a body-to-body minimum distance asks for: plain values only, so the session can carry it.
 *
 * @public
 */
export type MeasureExactRequest = Readonly<{
  /** The pending record the answer resolves. */
  id: string;
  manifest: GeometryComponentManifest;
  /** The presented geometry the record was taken on; an answer for any other is dropped. */
  geometryKey: string;
  occurrenceA: string;
  occurrenceB: string;
  /** The pose the record was taken in; an answer under any other is dropped. */
  poseRevision: number;
}>;

/**
 * What the session tells a running exact query.
 *
 * @public
 */
export type MeasureExactCommand =
  /** Resolve the record as unavailable for `reason` and stop waiting for the answer. */
  | { type: 'cancel'; reason: string }
  /** Stop waiting for the answer: graphics already marked the record out of date. */
  | { type: 'drop' };

/**
 * The exact query: callback logic the tool provides, which resolves one pending record and aborts its query when
 * stopped.
 *
 * @public
 */
export type MeasureExactLogic = CallbackActorLogic<MeasureExactCommand, MeasureExactRequest>;

/**
 * A target list request: a fresh catalog, or with `append` the next page of the one listed.
 *
 * @public
 */
export type MeasureCatalogRequest = Readonly<{ append: boolean }>;

/**
 * The catalog scan: callback logic the tool provides, which lists the targets in view and aborts when stopped.
 *
 * @public
 */
export type MeasureCatalogLogic = CallbackActorLogic<{ type: 'stop' }, MeasureCatalogRequest>;

/**
 * A DOM adapter: callback logic the tool builds around its host objects and provides as `follower` or `pointer`.
 *
 * @public
 */
export type MeasureSessionAdapterLogic = CallbackActorLogic<MeasureSessionCommand, undefined>;

type PointerDownFacts = Omit<Extract<MeasureInputEvent, { type: 'pointerDown' }>, 'type'>;
type PointerUpFacts = Omit<Extract<MeasureInputEvent, { type: 'pointerUp' }>, 'type'>;

/**
 * Events accepted by the measure session: reports from its adapters and the decisions of its `measureInput` child.
 *
 * @public
 */
export type MeasureSessionEvent =
  /** Measure turned on or off. The follower reports the current value when it starts. */
  | { type: 'measureActiveChanged'; active: boolean }
  /** The pointer moved to `at`, or rests there when Measure turned on. */
  | { type: 'pointerMoved'; at: MeasurePointerAt }
  /** The pointer left the surface or was cancelled: nothing hovers. */
  | { type: 'pointerLeft' }
  /** A press went down at `at`. `pointerCount` is how many pointers are now down on the surface. */
  | ({ type: 'pointerPressed'; at: MeasurePointerAt; pointerCount: number } & PointerDownFacts)
  /** A press was released at `at`; the adapter holds its pointer snapshot until the decision comes back. */
  | ({ type: 'pointerReleased'; at: MeasurePointerAt } & PointerUpFacts)
  | { type: 'pointerCancelled'; pointerId: number }
  | { type: 'windowBlurred' }
  /** The presented camera's matrices changed (a pose, a resize, a render-frame rebase or another projection). */
  | { type: 'cameraPresented' }
  /** The view's camera started or stopped being dragged (`input.dragging`). */
  | { type: 'cameraDragChanged'; dragging: boolean }
  /** The kinematic pose moved to `revision`. */
  | { type: 'poseChanged'; revision: number }
  /** The committed section cuts changed while Measure is on. */
  | { type: 'cutsChanged' }
  /** A start was placed or cancelled. */
  | { type: 'startChanged' }
  /** What a pointer snapshot reads changed: the presented model, its display or its pickable meshes. */
  | { type: 'sourceChanged' }
  /** A setting a hover is taken with changed: the mode, filter, snapping or operation, or the unit's manifest. */
  | { type: 'hoverSettingsChanged' }
  /** The targets under the press waiting under `generation` are ready, or one of them failed. */
  | { type: 'pressReady'; generation: number }
  /**
   * A waiting press released at `at` landed (it was current when it did): hover from where the pointer is now. Its
   * own commit may already have moved the press generation on, so this carries where it was released, not its
   * generation.
   */
  | { type: 'pressSettled'; at: MeasurePointerAt }
  /** The `measureInput` child decided a release. */
  | { type: 'inputDecided'; decision: MeasureInputEmitted['type'] }
  /** The presented geometry changed (not its display or pickable meshes): an exact query on the old one is stale. */
  | { type: 'geometryChanged' }
  /** What a target list is taken from changed: the presented model, its display, pickable meshes, mode or filter. */
  | { type: 'catalogSourceChanged' }
  /** Graphics asked for Use target. */
  | { type: 'commitRequested' }
  /** Graphics asked for the target list. */
  | ({ type: 'catalogRequested' } & MeasureCatalogRequest)
  /** A commit placed a point; `exact` is set when its record waits on an exact CAD distance. */
  | { type: 'committed'; exact?: MeasureExactRequest };

/**
 * The measure session's context.
 *
 * @public
 */
// oxlint-disable-next-line typescript/consistent-type-definitions -- an interface, so declarations reference it by name
export interface MeasureSessionContext {
  /** Where the pointer last rested over the surface, or nothing once it left. */
  hover: MeasurePointerAt | undefined;
  /** Moves on whenever a press waiting on its targets no longer applies. */
  pressGeneration: number;
  /** The press waiting on its targets, by the generation it waits under and where it was released. */
  deferred: Readonly<{ generation: number; at: MeasurePointerAt }> | undefined;
  /** The release decision child. */
  inputRef: MeasureInputRef;
  /** The exact query running for the last body-to-body minimum distance, while Measure is on. */
  exactRef: ActorRefFrom<MeasureExactLogic> | undefined;
  /** The target list scan running, while Measure is on. */
  catalogRef: ActorRefFrom<MeasureCatalogLogic> | undefined;
}

/** The adapter slots are filled by the measuring tool; nothing starts them from the registry. */
const missingAdapter: MeasureSessionAdapterLogic = createCallbackLogic<MeasureSessionCommand, undefined>(() => {
  throw new Error('The measure session adapters are provided by the measuring tool, with the surface it listens on.');
});

const missingExact: MeasureExactLogic = createCallbackLogic<MeasureExactCommand, MeasureExactRequest>(() => {
  throw new Error('The exact query is provided by the measuring tool, with the CAD source it asks.');
});

const missingCatalog: MeasureCatalogLogic = createCallbackLogic<{ type: 'stop' }, MeasureCatalogRequest>(() => {
  throw new Error('The catalog scan is provided by the measuring tool, with the scene it lists.');
});

const measureSessionActors = {
  follower: missingAdapter,
  pointer: missingAdapter,
  exact: missingExact,
  catalog: missingCatalog,
  input: measureInputMachine,
};

/** Why an exact query was cancelled, as its record then says. */
const exactReplacedReason = 'The exact query was replaced by a new selection.';
const exactClosedReason = 'Measurement closed before the exact query finished.';

type MeasureSessionEnqueue = EnqueueObject<MeasureSessionEvent, never, SystemRegistry, typeof measureSessionActors>;

type MeasureSessionChildren = Readonly<{ pointer?: ActorRefFrom<MeasureSessionAdapterLogic> }>;

type TransitionArgs<Type extends MeasureSessionEvent['type'] = MeasureSessionEvent['type']> = Readonly<{
  context: MeasureSessionContext;
  event: Extract<MeasureSessionEvent, { type: Type }>;
  children: MeasureSessionChildren;
  actors: typeof measureSessionActors;
}>;

/** Ends the running exact query: cancelled with `reason`, or dropped when graphics already marked its record. */
const endExact = (
  context: MeasureSessionContext,
  enq: MeasureSessionEnqueue,
  reason?: string,
): Partial<MeasureSessionContext> => {
  if (!context.exactRef) {
    return {};
  }
  enq.sendTo(context.exactRef, reason === undefined ? { type: 'drop' } : { type: 'cancel', reason });
  enq.stop(context.exactRef);
  return { exactRef: undefined };
};

/** Stops the running target list scan. */
const endCatalog = (context: MeasureSessionContext, enq: MeasureSessionEnqueue): Partial<MeasureSessionContext> => {
  if (!context.catalogRef) {
    return {};
  }
  enq.stop(context.catalogRef);
  return { catalogRef: undefined };
};

const command = (
  children: MeasureSessionChildren,
  enq: MeasureSessionEnqueue,
  message: MeasureSessionCommand,
): void => {
  if (children.pointer) {
    enq.sendTo(children.pointer, message);
  }
};

const isSamePoint = (left: MeasurePointerAt, right: MeasurePointerAt): boolean =>
  left.clientX === right.clientX && left.clientY === right.clientY;

/** A press waiting on its targets no longer applies. */
const nextGeneration = (context: MeasureSessionContext): Partial<MeasureSessionContext> => ({
  pressGeneration: context.pressGeneration + 1,
  deferred: undefined,
});

/** Something under a resting pointer changed: hover from it again on the next frame. */
const rehover = ({ context, children }: Pick<TransitionArgs, 'context' | 'children'>, enq: MeasureSessionEnqueue) => {
  if (context.hover) {
    command(children, enq, { type: 'hover', at: context.hover, when: 'frame' });
  }
};

const pointerMoved = ({ event, children }: TransitionArgs<'pointerMoved'>, enq: MeasureSessionEnqueue) => {
  command(children, enq, { type: 'hover', at: event.at, when: 'frame' });
  return { context: { hover: event.at } };
};

const pointerLeft = ({ children }: TransitionArgs, enq: MeasureSessionEnqueue) => {
  command(children, enq, { type: 'hoverCleared' });
  return { context: { hover: undefined } };
};

const pointerPressed = ({ context, event }: TransitionArgs<'pointerPressed'>, enq: MeasureSessionEnqueue) => {
  const { type: _type, at, pointerCount, ...down } = event;
  if (pointerCount > 1) {
    // A second pointer is a pinch or a two-finger pan: the held press is the camera's now.
    enq.sendTo(context.inputRef, { type: 'cameraMoved' });
  }
  enq.sendTo(context.inputRef, { type: 'pointerDown', ...down });
  return { context: { ...nextGeneration(context), hover: at } };
};

const pointerReleased = ({ context, event }: TransitionArgs<'pointerReleased'>, enq: MeasureSessionEnqueue) => {
  const { type: _type, at, ...up } = event;
  enq.sendTo(context.inputRef, { type: 'pointerUp', ...up });
  return { context: { hover: at } };
};

const inputDecided = ({ context, event, children }: TransitionArgs<'inputDecided'>, enq: MeasureSessionEnqueue) => {
  if (event.decision === 'deferred') {
    if (!context.hover) {
      // A release always reports where it was; a decision with none has no release to wait for.
      return {};
    }
    command(children, enq, { type: 'pressDeferred', generation: context.pressGeneration });
    return { context: { deferred: { generation: context.pressGeneration, at: context.hover } } };
  }
  command(children, enq, { type: 'releaseDecided', decision: event.decision });
  return {};
};

const pressReady = ({ context, event, children }: TransitionArgs<'pressReady'>, enq: MeasureSessionEnqueue) => {
  if (context.deferred?.generation !== event.generation || event.generation !== context.pressGeneration) {
    // A newer press, a camera drag, or a pose, cut, start or model change moved on while it waited.
    return {};
  }
  command(children, enq, { type: 'pressLanded', generation: event.generation });
  return {};
};

const pressSettled = ({ context, event, children }: TransitionArgs<'pressSettled'>, enq: MeasureSessionEnqueue) => {
  if (!context.hover) {
    // The pointer left while the press waited: the snapshot that landed it hovered where it was released.
    command(children, enq, { type: 'hoverCleared' });
  } else if (!isSamePoint(context.hover, event.at)) {
    // The pointer moved on while the press waited: hover from where it is now.
    command(children, enq, { type: 'hover', at: context.hover, when: 'frame' });
  }
  return { context: { deferred: undefined } };
};

const cameraPresented = ({ context, children }: TransitionArgs, enq: MeasureSessionEnqueue) => {
  command(children, enq, { type: 'candidatesInvalidated' });
  if (context.hover) {
    // The frame that presented the camera is the one the pointer snapshot is taken in.
    command(children, enq, { type: 'hover', at: context.hover, when: 'now' });
  }
  // A list scanned under the old camera holds targets in view of it.
  return { context: endCatalog(context, enq) };
};

const committed = ({ context, event, actors }: TransitionArgs<'committed'>, enq: MeasureSessionEnqueue) => {
  const ended = endExact(context, enq, exactReplacedReason);
  if (!event.exact) {
    return { context: ended };
  }
  const exactRef = enq.spawn(actors.exact, { id: 'exact', input: event.exact });
  return { context: { ...ended, exactRef } };
};

const catalogRequested = (
  { context, event, actors }: TransitionArgs<'catalogRequested'>,
  enq: MeasureSessionEnqueue,
) => {
  const ended = endCatalog(context, enq);
  const catalogRef = enq.spawn(actors.catalog, { id: 'catalog', input: { append: event.append } });
  return { context: { ...ended, catalogRef } };
};

const cameraDragChanged = ({ context, event }: TransitionArgs<'cameraDragChanged'>, enq: MeasureSessionEnqueue) => {
  if (!event.dragging) {
    return {};
  }
  // A drag steals the held press, and a press waiting on its targets was made under the camera that just moved.
  enq.sendTo(context.inputRef, { type: 'cameraMoved' });
  return { context: nextGeneration(context) };
};

const measureSessionMachineDefinition = setup({
  actors: measureSessionActors,
  schemas: {
    context: types<MeasureSessionContext>(),
    events: eventSchemas<MeasureSessionEvent>(),
  },
}).createMachine({
  id: 'measureSession',
  context: ({ spawn, actors }) => ({
    hover: undefined,
    pressGeneration: 0,
    deferred: undefined,
    inputRef: spawn(actors.input, { id: 'input' }),
    exactRef: undefined,
    catalogRef: undefined,
  }),
  entry: ({ context }, enq) => {
    enq.listen(
      context.inputRef,
      '*',
      (decision): MeasureSessionEvent => ({
        type: 'inputDecided',
        decision: (decision as MeasureInputEmitted).type,
      }),
    );
  },
  // The follower lives as long as the session; stopping the session stops it and gives back what it followed.
  invoke: { id: 'follower', src: 'follower' },
  initial: 'off',
  states: {
    off: {
      on: {
        measureActiveChanged: ({ event }) => (event.active ? { target: 'on' } : {}),
        poseChanged: ({ context }) => ({ context: nextGeneration(context) }),
      },
    },
    on: {
      // Stopping the pointer adapter removes its listeners and drops its waiting presses.
      invoke: { id: 'pointer', src: 'pointer' },
      exit: ({ context }, enq) => {
        enq.sendTo(context.inputRef, { type: 'blur' });
      },
      on: {
        // Turning Measure off cancels here, in the transition, so a session stopped while on (the view closing) is
        // cancelled by the exact query's own cleanup, with its own reason.
        measureActiveChanged: ({ context, event }, enq) =>
          event.active
            ? {}
            : {
                target: 'off',
                context: {
                  ...nextGeneration(context),
                  hover: undefined,
                  ...endExact(context, enq, exactClosedReason),
                  ...endCatalog(context, enq),
                },
              },
        pointerMoved: (args, enq) => pointerMoved(args, enq),
        pointerLeft: (args, enq) => pointerLeft(args, enq),
        pointerPressed: (args, enq) => pointerPressed(args, enq),
        pointerReleased: (args, enq) => pointerReleased(args, enq),
        pointerCancelled: (args, enq) => {
          enq.sendTo(args.context.inputRef, { type: 'pointerCancel', pointerId: args.event.pointerId });
          return pointerLeft(args, enq);
        },
        windowBlurred: (args, enq) => {
          enq.sendTo(args.context.inputRef, { type: 'blur' });
          return pointerLeft(args, enq);
        },
        inputDecided: (args, enq) => inputDecided(args, enq),
        pressReady: (args, enq) => pressReady(args, enq),
        pressSettled: (args, enq) => pressSettled(args, enq),
        cameraPresented: (args, enq) => cameraPresented(args, enq),
        cameraDragChanged: (args, enq) => cameraDragChanged(args, enq),
        poseChanged: (args, enq) => {
          rehover(args, enq);
          return {
            context: {
              ...nextGeneration(args.context),
              ...endExact(args.context, enq),
              ...endCatalog(args.context, enq),
            },
          };
        },
        cutsChanged: (args, enq) => {
          rehover(args, enq);
          return {
            context: {
              ...nextGeneration(args.context),
              ...endExact(args.context, enq),
              ...endCatalog(args.context, enq),
            },
          };
        },
        sourceChanged: (args, enq) => {
          rehover(args, enq);
          return { context: nextGeneration(args.context) };
        },
        hoverSettingsChanged: (args, enq) => {
          rehover(args, enq);
          return {};
        },
        startChanged: ({ context }) => ({ context: nextGeneration(context) }),
        geometryChanged: ({ context }, enq) => ({ context: endExact(context, enq) }),
        catalogSourceChanged: ({ context }, enq) => ({ context: endCatalog(context, enq) }),
        commitRequested: ({ children }, enq) => {
          command(children, enq, { type: 'commitChosen' });
          return {};
        },
        catalogRequested: (args, enq) => catalogRequested(args, enq),
        committed: (args, enq) => committed(args, enq),
      },
    },
  },
});

/**
 * The `[state, eventType]` pairs {@link measureSessionMachine} leaves unanswered (MC-R17). While Measure is off there
 * is no pointer adapter: it reports no pointer, no waiting press and no decision. The follower reports the cuts and
 * the presented camera only while Measure is on; a start, source, hover-settings or camera-drag change it reports
 * while Measure is off leaves nothing to drop or hover again.
 *
 * @public
 */
export const measureSessionIgnoredEvents: ReadonlyArray<readonly [state: string, eventType: string]> = [
  ['off', 'pointerMoved'],
  ['off', 'pointerLeft'],
  ['off', 'pointerPressed'],
  ['off', 'pointerReleased'],
  ['off', 'pointerCancelled'],
  ['off', 'windowBlurred'],
  ['off', 'cameraPresented'],
  ['off', 'cameraDragChanged'],
  ['off', 'cutsChanged'],
  ['off', 'startChanged'],
  ['off', 'sourceChanged'],
  ['off', 'hoverSettingsChanged'],
  ['off', 'pressReady'],
  ['off', 'pressSettled'],
  ['off', 'inputDecided'],
  // Nothing runs while Measure is off: no exact query or scan to stop, and no tool to commit or list for.
  ['off', 'geometryChanged'],
  ['off', 'catalogSourceChanged'],
  ['off', 'commitRequested'],
  ['off', 'catalogRequested'],
  ['off', 'committed'],
];

/**
 * Every {@link MeasureSessionEvent} type, in the union's order.
 *
 * @public
 */
export const measureSessionEventTypes = [
  'measureActiveChanged',
  'pointerMoved',
  'pointerLeft',
  'pointerPressed',
  'pointerReleased',
  'pointerCancelled',
  'windowBlurred',
  'cameraPresented',
  'cameraDragChanged',
  'poseChanged',
  'cutsChanged',
  'startChanged',
  'sourceChanged',
  'hoverSettingsChanged',
  'pressReady',
  'pressSettled',
  'inputDecided',
  'geometryChanged',
  'catalogSourceChanged',
  'commitRequested',
  'catalogRequested',
  'committed',
] as const satisfies ReadonlyArray<MeasureSessionEvent['type']>;

type MeasureSessionMachineDefinition = typeof measureSessionMachineDefinition;

/**
 * The type of {@link measureSessionMachine}, named so declarations reference it rather than inline it.
 *
 * @public
 */
// oxlint-disable-next-line typescript/no-empty-interface, typescript/no-empty-object-type, typescript/consistent-type-definitions -- an interface, not a type alias: declarations reference an interface by name and would expand an alias (K-17)
export interface MeasureSessionMachine extends MeasureSessionMachineDefinition {}

/**
 * Measure's session.
 *
 * @public
 */
export const measureSessionMachine: MeasureSessionMachine = measureSessionMachineDefinition;

/**
 * A running measure session.
 *
 * @public
 */
export type MeasureSessionRef = ActorRefFrom<MeasureSessionMachine>;

/**
 * A measure session's snapshot.
 *
 * @public
 */
export type MeasureSessionSnapshot = SnapshotFrom<MeasureSessionMachine>;
