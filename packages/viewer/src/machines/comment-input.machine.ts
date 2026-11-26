/**
 * Comment's pointer session for one surface: whether a release is a click on the viewer (a pin to place) or the end of
 * an orbit.
 *
 * ```text
 * commentInput: idle → pressed → idle
 * context: pointerId, x, y, slop, discardGesture
 * ```
 *
 * - **idle**: no press is held.
 * - **pressed**: a primary left press is held. A camera drag while it is held (`cameraMoved`), or a release farther
 *   than the press's slop, makes it an orbit: nothing is asked.
 *
 * The session runs only while the Comment tool is on (the scene mounts it then) and invokes one DOM adapter, `pointer`,
 * which the scene builds around its surface: it reports the pointer and the camera's drags, and answers a click's
 * {@link CommentInputCommand} with a surface pick. A pointer cancel or a window blur drops the press silently.
 *
 * Every fact here is ephemeral: derived from the pointer and never persisted or seeded.
 *
 * @module
 */

import { createCallbackLogic, setup, types } from 'xstate';
import type { ActorRefFrom, CallbackActorLogic, SnapshotFrom } from 'xstate';
import { eventSchemas } from '#machines/machine-schemas.js';
import { describeFault } from '#machines/machine-fault.js';

/**
 * The held press.
 *
 * @public
 */
// oxlint-disable-next-line typescript/consistent-type-definitions -- an interface, so declarations reference it by name
export interface CommentInputContext {
  /** The first defect this actor caught at its root (MC-R12); it keeps its state and answers every event. */
  fault?: string;
  pointerId: number | undefined;
  /** Where the held press went down, in client pixels. */
  x: number;
  y: number;
  /** How far, in pixels, a release may be from its press and still be a click. */
  slop: number;
  discardGesture: boolean;
}

/**
 * Events accepted by the comment input, every one from its pointer adapter.
 *
 * @public
 */
export type CommentInputEvent =
  | {
      type: 'pointerDown';
      button: number;
      isPrimary: boolean;
      pointerId: number;
      x: number;
      y: number;
      slop: number;
      cameraMoving: boolean;
    }
  | { type: 'pointerUp'; pointerId: number; x: number; y: number }
  | { type: 'cameraMoved' }
  | { type: 'pointerCancel'; pointerId: number }
  | { type: 'blur' };

/**
 * What the session asks of its pointer adapter: pick the surface under a click, at client pixels.
 *
 * @public
 */
export type CommentInputCommand = { type: 'pick'; x: number; y: number };

/**
 * The pointer adapter: callback logic the scene builds around its surface and provides as `pointer`.
 *
 * @public
 */
export type CommentInputAdapterLogic = CallbackActorLogic<CommentInputCommand, undefined>;

type PointerDown = Extract<CommentInputEvent, { type: 'pointerDown' }>;

const released: CommentInputContext = { pointerId: undefined, x: 0, y: 0, slop: 0, discardGesture: false };

const isCommentPress = (event: PointerDown): boolean => event.button === 0 && event.isPrimary;

const pressOf = (event: PointerDown): CommentInputContext => ({
  pointerId: event.pointerId,
  x: event.x,
  y: event.y,
  slop: event.slop,
  discardGesture: event.cameraMoving,
});

/** The adapter slot is filled by the scene; nothing starts it from the registry. */
const missingAdapter: CommentInputAdapterLogic = createCallbackLogic<CommentInputCommand, undefined>(() => {
  throw new Error('The comment input adapter is provided by the scene, with the surface it listens on.');
});

const commentInputActors = { pointer: missingAdapter };

const commentInputMachineDefinition = setup({
  actors: commentInputActors,
  schemas: {
    context: types<CommentInputContext>(),
    events: eventSchemas<CommentInputEvent>(),
  },
}).createMachine({
  id: 'commentInput',
  // A defect is recorded, never fatal (MC-R12). The first is kept: the root cause matters more than what it sets off.
  onError: ({ context, event }) => ({ context: { fault: context.fault ?? describeFault(event.error) } }),
  context: released,
  // Stopping the session stops the adapter, which removes its listeners.
  invoke: { id: 'pointer', src: 'pointer' },
  initial: 'idle',
  states: {
    idle: {
      on: {
        pointerDown: ({ event }) => (isCommentPress(event) ? { target: 'pressed', context: pressOf(event) } : {}),
        // No press is held: a release, a camera move, a cancel or a blur has nothing to decide or drop.
        pointerUp: () => ({}),
        cameraMoved: () => ({}),
        pointerCancel: () => ({}),
        blur: () => ({}),
      },
    },
    pressed: {
      on: {
        // A newer comment press replaces the held one; any other press leaves it held.
        pointerDown: ({ event }) => (isCommentPress(event) ? { context: pressOf(event) } : {}),
        pointerUp: ({ context, event, children }, enq) => {
          if (event.pointerId !== context.pointerId) {
            return {};
          }
          const isClick =
            !context.discardGesture && Math.hypot(event.x - context.x, event.y - context.y) <= context.slop;
          const { pointer } = children as { pointer?: ActorRefFrom<CommentInputAdapterLogic> };
          if (isClick && pointer) {
            enq.sendTo(pointer, { type: 'pick', x: event.x, y: event.y });
          }
          return { target: 'idle', context: released };
        },
        cameraMoved: () => ({ context: { discardGesture: true } }),
        pointerCancel: ({ context, event }) =>
          context.pointerId === event.pointerId ? { target: 'idle', context: released } : {},
        blur: () => ({ target: 'idle', context: released }),
      },
    },
  },
});

/**
 * The `[state, eventType]` pairs {@link commentInputMachine} leaves unanswered (MC-R17): none.
 *
 * @public
 */
export const commentInputIgnoredEvents: ReadonlyArray<readonly [state: string, eventType: string]> = [];

/**
 * Every {@link CommentInputEvent} type, in the union's order.
 *
 * @public
 */
export const commentInputEventTypes = [
  'pointerDown',
  'pointerUp',
  'cameraMoved',
  'pointerCancel',
  'blur',
] as const satisfies ReadonlyArray<CommentInputEvent['type']>;

type CommentInputMachineDefinition = typeof commentInputMachineDefinition;

/**
 * The type of {@link commentInputMachine}, named so declarations reference it rather than inline it.
 *
 * @public
 */
// oxlint-disable-next-line typescript/no-empty-interface, typescript/no-empty-object-type, typescript/consistent-type-definitions -- an interface, not a type alias: declarations reference an interface by name and would expand an alias (K-17)
export interface CommentInputMachine extends CommentInputMachineDefinition {}

/**
 * Comment's pointer session.
 *
 * @public
 */
export const commentInputMachine: CommentInputMachine = commentInputMachineDefinition;

/**
 * A running comment input.
 *
 * @public
 */
export type CommentInputRef = ActorRefFrom<CommentInputMachine>;

/**
 * A comment input's snapshot.
 *
 * @public
 */
export type CommentInputSnapshot = SnapshotFrom<CommentInputMachine>;
