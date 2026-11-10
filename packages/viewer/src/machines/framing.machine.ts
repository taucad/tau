/**
 * The framing actor: one per view, beside the view's camera. It decides when geometry is framed and sends the camera
 * the one event that does it (graphics event-driven state charter, G5; D2, D3, D14, D20; I7, I8).
 *
 * ```text
 * framing
 * ├── awaitingGeometry ──geometryBoundsMeasured──▶ framed
 * │                    sends camera.frameGeometry{source: 'framing', orientation: configured unless a pose is pending}
 * │                    then camera.adoptPersistedPose when a pose is pending
 * ├── framed           ──geometryBoundsMeasured (same key)──▶ camera.setBounds
 * │                    ──geometryBoundsMeasured (change over 10 %)──▶ camera.frameGeometry{source: 'framing'}
 * │                    ──fitRequested──▶ camera.frameGeometry{source: 'fit'}
 * │                    ──entryChanged{identity, pendingPose}──▶ awaitingGeometry
 * └── context: identity, pendingPose?, lastBounds?, lastRadius?
 * ```
 *
 * - The actor lives as long as the view, not as long as a React mount, so a remounted canvas that re-measures the
 *   same presentation never re-frames: that is true by construction, where the hook it replaces needed a session
 *   record. One deliberate change (D14): a remount whose first measurement is a new presentation that moved more than
 *   10 % refits, where the hook, whose reference died with the mount, only refreshed the bounds.
 * - A measurement with a new key under the 10 % threshold leaves the camera alone and keeps the reference it compares
 *   against, so slow drift still refits once it adds up (characterised from `use-camera-framing.ts`, D14).
 * - The first frame and a refit are automatic (`framing`); Fit view is the person's command (`fit`), so only Fit view
 *   is saved (D20, I7). The pose a view's record holds goes through `adoptPersistedPose`, which the camera applies
 *   only in `input.idle` and drops otherwise (D15, I8).
 * - The camera is the only owner of the pose and of its revisions (MC-R1). This actor keeps no copy of either: which
 *   change was the automatic first frame is the camera's `lastChange.source` (D2), so there is no first-frame
 *   revision here.
 * - The camera arrives in `input` (MC-R3, MC-R13). The configured orientation and margin are the host's resolved
 *   stage options: `input` holds the first, and a measurement or Fit view that carries `stage` replaces them, so a
 *   changed up direction or fit margin reaches the next frame. No host object enters context (D4), and nothing here
 *   keeps time (D3).
 *
 * Every fact here is ephemeral: it is derived from the view's entry and the measured geometry and never persisted.
 *
 * @module
 */

import { createActor, setup, types } from 'xstate';
import type { Actor, ActorOptions, ActorRef, EnqueueObject, SnapshotFrom, Snapshot } from 'xstate';
import type { CameraBounds } from '@taucad/camera';
import type { CameraMachineEmitted, CameraMachineEvent, CameraOrientation, CameraPose } from '@taucad/camera/machine';
import { eventSchemas } from '#machines/machine-schemas.js';

/**
 * The camera a framing actor drives: any actor that accepts the camera's public events.
 *
 * @public
 */
export type FramingCameraRef = ActorRef<Snapshot<unknown>, CameraMachineEvent, CameraMachineEmitted>;

/**
 * A drawing surface's size, as the camera takes it in `setViewport`.
 *
 * @public
 */
export type FramingViewport = Extract<CameraMachineEvent, Readonly<{ type: 'setViewport' }>>['viewport'];

/**
 * The camera fields a view's record holds for its entry, applied once after the entry's first frame. A pose replaces
 * the framed pose; an orientation turns the camera and re-frames the same bounds. `requestId` correlates the camera's
 * `adoptionApplied` or `adoptionDropped` answer.
 *
 * @public
 */
export type FramingPendingPose =
  | Readonly<{ requestId: string; pose: CameraPose; orientation?: undefined }>
  | Readonly<{ requestId: string; orientation: CameraOrientation; pose?: undefined }>;

/**
 * The host's resolved stage options: the configured orientation a first frame faces, with an up the host resolved
 * against the camera's current up, and the fractional fit margin, from 0 to 0.5.
 *
 * @public
 */
export type FramingStage = Readonly<{ orientation: CameraOrientation; margin: number }>;

/**
 * Input of {@link framingMachine}.
 *
 * @public
 */
export type FramingInput = Readonly<{
  camera: FramingCameraRef;
  /** The entry whose geometry is framed; `undefined` before the view knows it. */
  identity?: string;
  /** The record's camera fields for that entry. */
  pendingPose?: FramingPendingPose;
  /** The configured stage orientation the first frame faces, until an event carries a newer {@link FramingStage}. */
  orientation: CameraOrientation;
  /** The fractional fit margin, until an event carries a newer {@link FramingStage}. */
  margin: number;
}>;

/**
 * The public event alphabet of {@link framingMachine}.
 *
 * @public
 */
export type FramingEvent =
  | Readonly<{
      type: 'geometryBoundsMeasured';
      /**
       * The measured presentation's key. The same key re-measured (a remounted canvas, a settled kinematics pose) only
       * refreshes the camera's bounds; a new key may refit.
       */
      key: string;
      bounds: CameraBounds;
      radius: number;
      /** The drawing surface at measurement, published to the camera before it frames. */
      viewport?: FramingViewport;
      /** The stage options at measurement; kept for every later frame until another event carries them. */
      stage?: FramingStage;
    }>
  | Readonly<{
      type: 'fitRequested';
      /** The drawing surface now, published to the camera before it fits. */
      viewport?: FramingViewport;
      /** The stage options now; kept for every later frame until another event carries them. */
      stage?: FramingStage;
    }>
  | Readonly<{ type: 'entryChanged'; identity: string; pendingPose?: FramingPendingPose }>;

/** What every state holds. */
type FramingContext = Readonly<{
  camera: FramingCameraRef;
  identity: string | undefined;
  orientation: CameraOrientation;
  margin: number;
}>;

/** `awaitingGeometry` also holds the record's camera fields, consumed by the first frame (MC-R26). */
type AwaitingContext = FramingContext & Readonly<{ pendingPose: FramingPendingPose | undefined }>;

/**
 * `framed` also holds the measurement (MC-R26). `lastBounds` and `lastRadius` are the reference a refit compares
 * against: what the camera was last framed or bounded with. `measuredBounds` is the latest measurement, which Fit view
 * frames.
 */
type FramedContext = FramingContext &
  Readonly<{ key: string; lastBounds: CameraBounds; lastRadius: number; measuredBounds: CameraBounds | undefined }>;

type Measurement = Extract<FramingEvent, Readonly<{ type: 'geometryBoundsMeasured' }>>;

type FramingEnqueue = EnqueueObject<FramingEvent, never>;

/**
 * The relative change in radius or bounds over which a measurement refits the camera.
 *
 * @public
 */
export const framingRefitRatio = 0.1;

const axes = [0, 1, 2] as const;

/* Geometry to frame: a finite positive radius and finite bounds with no inverted axis. */
const hasGeometry = ({ bounds, radius }: Measurement): boolean =>
  Number.isFinite(radius) &&
  radius > 0 &&
  axes.every(
    (axis) =>
      Number.isFinite(bounds.min[axis]) && Number.isFinite(bounds.max[axis]) && bounds.min[axis] <= bounds.max[axis],
  );

/* Whether the measurement moved more than the refit ratio from the reference, in radius or in any bounds face. */
const changedSignificantly = (context: FramedContext, { bounds, radius }: Measurement): boolean => {
  const previous = context.lastRadius;
  const radiusChange = previous === 0 ? Infinity : Math.abs((radius - previous) / previous);
  const scale = Math.max(previous, radius);
  const boundsChange =
    Math.max(
      ...axes.flatMap((axis) => [
        Math.abs(context.lastBounds.min[axis] - bounds.min[axis]),
        Math.abs(context.lastBounds.max[axis] - bounds.max[axis]),
      ]),
    ) / scale;
  return radiusChange > framingRefitRatio || boundsChange > framingRefitRatio;
};

/* The camera frames against the surface it is given; an unmeasured surface (no area) is not one. */
const publishViewport = (context: FramingContext, viewport: FramingViewport | undefined, enq: FramingEnqueue): void => {
  if (viewport !== undefined && viewport.width > 0 && viewport.height > 0) {
    enq.sendTo(context.camera, { type: 'setViewport', viewport });
  }
};

/* The stage options an event carries replace the ones held; the host resolves them when it measures or fits. */
const staged = <Context extends FramingContext>(context: Context, stage: FramingStage | undefined): Context =>
  stage === undefined ? context : { ...context, orientation: stage.orientation, margin: stage.margin };

/* The measurement becomes the reference a later refit compares against. */
const framedWith = (context: FramingContext, measurement: Measurement): FramedContext => ({
  camera: context.camera,
  identity: context.identity,
  orientation: context.orientation,
  margin: context.margin,
  key: measurement.key,
  lastBounds: measurement.bounds,
  lastRadius: measurement.radius,
  measuredBounds: measurement.bounds,
});

const framingMachineDefinition = setup({
  schemas: {
    context: types<FramingContext>(),
    events: eventSchemas<FramingEvent>(),
    input: types<FramingInput>(),
  },
  states: {
    awaitingGeometry: { schemas: { context: types<AwaitingContext>() } },
    framed: { schemas: { context: types<FramedContext>() } },
  },
}).createMachine({
  id: 'framing',
  version: '1',
  context: ({ input }): AwaitingContext => ({
    camera: input.camera,
    identity: input.identity,
    pendingPose: input.pendingPose,
    orientation: input.orientation,
    margin: input.margin,
  }),
  initial: 'awaitingGeometry',
  states: {
    awaitingGeometry: {
      on: {
        geometryBoundsMeasured: ({ context: held, event }, enq) => {
          const context = staged(held, event.stage);
          if (!hasGeometry(event)) {
            // Nothing to frame yet: empty geometry is not a first frame, and the camera keeps its pose.
            return { context };
          }
          const { pendingPose } = context;
          publishViewport(context, event.viewport, enq);
          // A pending pose replaces whatever the frame faces, so only an entry with none faces the configured angles.
          enq.sendTo(context.camera, {
            type: 'frameGeometry',
            bounds: event.bounds,
            margin: context.margin,
            ...(pendingPose === undefined ? { orientation: context.orientation } : {}),
            source: 'framing',
          });
          if (pendingPose !== undefined) {
            enq.sendTo(context.camera, {
              type: 'adoptPersistedPose',
              requestId: pendingPose.requestId,
              ...(pendingPose.pose === undefined
                ? { orientation: pendingPose.orientation, margin: context.margin }
                : { pose: pendingPose.pose }),
            });
          }
          return { target: 'framed', context: { ...framedWith(context, event), pendingPose: undefined } };
        },
        entryChanged: ({ event }) => {
          // The latest record before the first frame wins, also for the same entry: a record can load after the view
          // knows its entry. A true re-delivery carries the same fields, so this stays idempotent.
          return { context: { identity: event.identity, pendingPose: event.pendingPose } };
        },
      },
    },
    framed: {
      on: {
        geometryBoundsMeasured: ({ context: held, event }, enq) => {
          const context = staged(held, event.stage);
          if (!hasGeometry(event)) {
            // The model is momentarily empty (a rebuild in flight): the camera keeps the pose and bounds it has, and Fit
            // view has nothing to fit until geometry returns.
            return { context: { ...context, measuredBounds: undefined } };
          }
          if (event.key === context.key) {
            // The same presentation re-measured: refresh the bounds the clip planes derive from, keep the pose.
            enq.sendTo(context.camera, { type: 'setBounds', bounds: event.bounds });
            return { context: framedWith(context, event) };
          }
          if (changedSignificantly(context, event)) {
            publishViewport(context, event.viewport, enq);
            // A refit keeps the person's direction: it only recentres and zooms.
            enq.sendTo(context.camera, {
              type: 'frameGeometry',
              bounds: event.bounds,
              margin: context.margin,
              source: 'framing',
            });
            return { context: framedWith(context, event) };
          }
          // Under the threshold the camera is left alone and the reference stays, so drift adds up to a refit (D14).
          return { context: { ...context, key: event.key, measuredBounds: event.bounds } };
        },
        fitRequested: ({ context: held, event }, enq) => {
          const context = staged(held, event.stage);
          if (context.measuredBounds === undefined) {
            // The latest measurement is empty: as the hook did, Fit view on an empty model changes nothing.
            return { context };
          }
          publishViewport(context, event.viewport, enq);
          // Fit view zooms and recentres on the model; it never turns the camera.
          enq.sendTo(context.camera, {
            type: 'frameGeometry',
            bounds: context.measuredBounds,
            margin: context.margin,
            source: 'fit',
          });
          return { context };
        },
        entryChanged: ({ context, event }) => {
          if (event.identity === context.identity) {
            // Idempotent re-delivery: the entry is already framed.
            return {};
          }
          return {
            target: 'awaitingGeometry',
            context: {
              camera: context.camera,
              identity: event.identity,
              pendingPose: event.pendingPose,
              orientation: context.orientation,
              margin: context.margin,
            },
          };
        },
      },
    },
  },
});

/**
 * The `[state, eventType]` pairs {@link framingMachine} leaves unanswered (MC-R17).
 *
 * - Fit view before the entry's first geometry has nothing to fit.
 *
 * @public
 */
export const framingIgnoredEvents: ReadonlyArray<readonly [state: string, eventType: string]> = [
  ['awaitingGeometry', 'fitRequested'],
];

/**
 * Every {@link FramingEvent} type, in the union's order.
 *
 * @public
 */
export const framingEventTypes = [
  'geometryBoundsMeasured',
  'fitRequested',
  'entryChanged',
] as const satisfies ReadonlyArray<FramingEvent['type']>;

type FramingMachineDefinition = typeof framingMachineDefinition;

/**
 * The type of {@link framingMachine}, named so declarations reference it rather than inline it.
 *
 * @public
 */
// oxlint-disable-next-line typescript/no-empty-interface, typescript/no-empty-object-type, typescript/consistent-type-definitions -- an interface, not a type alias: declarations reference an interface by name and would expand an alias (K-17)
export interface FramingMachine extends FramingMachineDefinition {}

/**
 * When a view's geometry is framed, and with which camera event.
 *
 * @public
 */
export const framingMachine: FramingMachine = framingMachineDefinition;

/**
 * Options of {@link createFramingActor} (MC-R4).
 *
 * @public
 */
export type FramingActorOptions = Pick<ActorOptions<FramingMachine>, 'clock' | 'inspect' | 'onRejectedEvent'> &
  Readonly<{ input: FramingInput }>;

/**
 * Creates the framing actor, not yet started.
 *
 * @param options - The machine input and the system's clock, inspector and rejection hook.
 * @returns An unstarted actor of {@link framingMachine} on that input.
 * @public
 */
export const createFramingActor = ({
  input,
  clock,
  inspect,
  onRejectedEvent,
}: FramingActorOptions): Actor<FramingMachine> =>
  createActor(framingMachine, {
    input,
    ...(clock === undefined ? {} : { clock }),
    ...(inspect === undefined ? {} : { inspect }),
    ...(onRejectedEvent === undefined ? {} : { onRejectedEvent }),
  });

/**
 * A framing actor's snapshot.
 *
 * @public
 */
export type FramingSnapshot = SnapshotFrom<FramingMachine>;
