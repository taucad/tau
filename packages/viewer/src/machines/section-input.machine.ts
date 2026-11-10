/**
 * The section handles' pointer gesture: one per mounted surface while Section is on.
 *
 * ```text
 * sectionInput: idle → hovering → pressed → dragging
 * context: hovered, hoveredTile, press
 * ```
 *
 * - **idle**: the pointer is over no handle and no plane-picker tile.
 * - **hovering**: the pointer rests on a handle (`hovered`) or a tile (`hoveredTile`). Hover picks arrive as
 *   `hoverPicked`, at most once per frame.
 * - **pressed**: a primary press on a handle or tile is held (`press`). Hover waits while it is held. A press on a drag
 *   handle starts dragging once it travels past {@link sectionDragThreshold}; a tile or a revolution's select fan never
 *   drags.
 * - **dragging**: each move is a drag step for the adapter to land; the release is the last one.
 *
 * The DOM adapter, a callback actor invoked here as `adapter`, owns everything a host holds: the nine capture-phase
 * listeners on the surface, the picking, the handles' paint and the cursor, the drag maths and the camera controls. It
 * reports what the pointer did and the drawing's current cuts; this machine decides what each report means and answers
 * with an {@link SectionInputCommand}. Nothing here touches the DOM, Three or another actor (D4).
 *
 * A drag ends on its release, a pointer cancel, Section turning off, or `cutsChanged` showing that its cut went away,
 * changed its kind, plane or axis, or lost the selection; the last two drop a step still waiting for its frame.
 *
 * Every fact here is ephemeral: it is derived from the pointer on the mounted surface and never persisted or seeded.
 *
 * @module
 */

import { createCallbackLogic, setup, types } from 'xstate';
import type { ActorRefFrom, CallbackActorLogic, EnqueueObject, SnapshotFrom, SystemRegistry } from 'xstate';
import type { SectionCut, SectionPlane } from '#graphics/section-cuts.js';
import type { RenderFrame } from '@taucad/spatial';
import type { SectionHandleTarget } from '#graphics/three/controls/section-handles.js';
import { eventSchemas } from '#machines/machine-schemas.js';

/**
 * CSS pixels a press travels before it drags.
 *
 * @public
 */
export const sectionDragThreshold = 3;

/**
 * A held press: its pointer, where it started (client pixels) and what it landed on.
 *
 * @public
 */
export type SectionInputPress = Readonly<{
  pointerId: number;
  startX: number;
  startY: number;
  /** Whether it travelled past {@link sectionDragThreshold}; it never goes back. */
  moved: boolean;
  tile?: SectionPlane;
  handle?: SectionHandleTarget;
  /** The cut a drag handle moves, as it was at the press. Absent for a tile or a select fan, which never drag. */
  cut?: SectionCut;
}>;

/**
 * What the adapter paints: the hovered handle and tile, and the held press.
 *
 * @public
 */
export type SectionInputGesture = Readonly<{
  hovered?: SectionHandleTarget;
  hoveredTile?: SectionPlane;
  press?: SectionInputPress;
}>;

/**
 * How a press ends: its waiting drag step lands (`flush`) or is dropped (`cancel`).
 *
 * @public
 */
export type SectionPressEnding = 'flush' | 'cancel';

/**
 * Commands the section input sends its DOM adapter.
 *
 * @public
 */
export type SectionInputCommand =
  /** Land a drag step at this canvas point (offset pixels), at most once per frame. */
  | { type: 'dragStep'; x: number; y: number }
  /**
   * The press is over: give the pointer and the camera controls back. `clickedTile` is a tile pressed and released
   * without moving, which moves the selected plane cut there or adds one.
   */
  | { type: 'pressEnded'; ending: SectionPressEnding; clickedTile?: SectionPlane }
  /** The hovered handle's cut changed: link it with its chip. */
  | { type: 'hoverCutChanged'; cutId: string | undefined }
  /** Paint and set the cursor for this gesture. */
  | { type: 'gestureChanged'; gesture: SectionInputGesture }
  /** The view's physical-to-render frame changed: lay the drawing out in it. */
  | { type: 'renderFrameChanged'; renderFrame: RenderFrame };

/**
 * A DOM adapter: callback logic that owns one surface's listeners and the host objects behind them. The handles'
 * owner builds it around those objects and provides it as `adapter`.
 *
 * @public
 */
export type SectionInputAdapterLogic = CallbackActorLogic<SectionInputCommand, undefined>;

/** A pointer report: its pointer, and where it is in client pixels (`x`, `y`) and canvas pixels (`offsetX`, `offsetY`). */
type PointerAt = Readonly<{ pointerId: number; x: number; y: number; offsetX: number; offsetY: number }>;

/**
 * Events accepted by the section input; every one comes from its DOM adapter except `renderFrameChanged`, which the
 * handles' owner forwards from the view.
 *
 * @public
 */
export type SectionInputEvent =
  /** The latest hover pick: the tile or handle under a resting pointer, or neither. */
  | { type: 'hoverPicked'; handle?: SectionHandleTarget; tile?: SectionPlane }
  /** A primary press the adapter took: it landed on `handle` or `tile`. `cut` is the cut a drag handle moves. */
  | ({ type: 'pointerPressed'; handle?: SectionHandleTarget; tile?: SectionPlane; cut?: SectionCut } & Omit<
      PointerAt,
      'offsetX' | 'offsetY'
    >)
  | ({ type: 'pointerMoved' } & PointerAt)
  | ({ type: 'pointerReleased' } & PointerAt)
  /** The press's pointer was cancelled or lost its capture. */
  | { type: 'pointerCancelled'; pointerId: number }
  /**
   * The drawing was brought up to date: the cuts, the selection, the handles now drawn and whether the plane picker
   * takes input.
   */
  | {
      type: 'cutsChanged';
      cuts: readonly SectionCut[];
      selectedId: string | undefined;
      handles: readonly SectionHandleTarget[];
      isPickerLive: boolean;
    }
  /** Section turned off: everything held is given back. */
  | { type: 'sectionViewEnded' }
  | { type: 'renderFrameChanged'; renderFrame: RenderFrame };

/**
 * The section input's context.
 *
 * @public
 */
// oxlint-disable-next-line typescript/consistent-type-definitions -- an interface, so declarations reference it by name
export interface SectionInputContext {
  hovered: SectionHandleTarget | undefined;
  hoveredTile: SectionPlane | undefined;
  press: SectionInputPress | undefined;
}

/** The adapter slot is filled by the handles' owner; nothing starts it from the registry. */
const missingAdapter: SectionInputAdapterLogic = createCallbackLogic<SectionInputCommand, undefined>(() => {
  throw new Error('The section input adapter is provided by the section handles, with the surface it listens on.');
});

const sectionInputActors = { adapter: missingAdapter };

type SectionInputEnqueue = EnqueueObject<SectionInputEvent, never, SystemRegistry, typeof sectionInputActors>;

type SectionInputChildren = Readonly<{ adapter?: ActorRefFrom<SectionInputAdapterLogic> }>;

/** Absolute, so a root-level answer and a state's own reach the same states. */
type SectionInputTarget =
  | '#sectionInput.idle'
  | '#sectionInput.hovering'
  | '#sectionInput.pressed'
  | '#sectionInput.dragging';

/** What a transition hands its handler: the context before the event, the event and the adapter child. */
type TransitionArgs<Type extends SectionInputEvent['type'] = SectionInputEvent['type']> = Readonly<{
  context: SectionInputContext;
  event: Extract<SectionInputEvent, { type: Type }>;
  children: SectionInputChildren;
}>;

const isSameTarget = (left: SectionHandleTarget | undefined, right: SectionHandleTarget | undefined): boolean =>
  left?.kind === right?.kind && left?.cutId === right?.cutId;

/** What a drag must keep to land: its cut, and that cut's kind and plane or axis. */
const cutStructure = (cut: SectionCut): string =>
  `${cut.id}:${cut.kind}:${cut.kind === 'plane' ? cut.plane : cut.axis}`;

const hasTravelled = (press: SectionInputPress, x: number, y: number): boolean =>
  press.moved || Math.hypot(x - press.startX, y - press.startY) > sectionDragThreshold;

const stateOf = (context: SectionInputContext): SectionInputTarget => {
  if (context.press) {
    return context.press.cut && context.press.moved ? '#sectionInput.dragging' : '#sectionInput.pressed';
  }
  return context.hovered === undefined && context.hoveredTile === undefined
    ? '#sectionInput.idle'
    : '#sectionInput.hovering';
};

const command = (children: SectionInputChildren, enq: SectionInputEnqueue, message: SectionInputCommand): void => {
  if (children.adapter) {
    enq.sendTo(children.adapter, message);
  }
};

/** Moves to the state `next` describes and repaints when anything the adapter paints changed. */
const settle = (
  { context, children }: Pick<TransitionArgs, 'context' | 'children'>,
  next: SectionInputContext,
  enq: SectionInputEnqueue,
) => {
  if (next.hovered !== context.hovered || next.hoveredTile !== context.hoveredTile || next.press !== context.press) {
    command(children, enq, {
      type: 'gestureChanged',
      gesture: { hovered: next.hovered, hoveredTile: next.hoveredTile, press: next.press },
    });
  }
  return { target: stateOf(next), context: next };
};

/** Ends the held press: the adapter lands or drops its waiting step and gives everything back. */
const endPress = (
  { context, children }: Pick<TransitionArgs, 'context' | 'children'>,
  enq: SectionInputEnqueue,
  ending: Readonly<{ ending: SectionPressEnding; clickedTile?: SectionPlane }>,
) => {
  command(children, enq, { type: 'pressEnded', ...ending });
  return settle({ context, children }, { ...context, press: undefined }, enq);
};

const hoverPicked = ({ context, event, children }: TransitionArgs<'hoverPicked'>, enq: SectionInputEnqueue) => {
  if (isSameTarget(event.handle, context.hovered) && event.tile === context.hoveredTile) {
    // The pointer rests where it was.
    return {};
  }
  const hovered = event.handle;
  if (hovered?.cutId !== context.hovered?.cutId) {
    command(children, enq, { type: 'hoverCutChanged', cutId: hovered?.cutId });
  }
  return settle({ context, children }, { ...context, hovered, hoveredTile: event.tile }, enq);
};

const pointerPressed = ({ context, event, children }: TransitionArgs<'pointerPressed'>, enq: SectionInputEnqueue) => {
  const press: SectionInputPress = {
    pointerId: event.pointerId,
    startX: event.x,
    startY: event.y,
    moved: false,
    ...(event.tile === undefined ? {} : { tile: event.tile }),
    ...(event.handle === undefined ? {} : { handle: event.handle }),
    // Only a drag handle carries its cut; a select fan selects and drags nothing.
    ...(event.cut === undefined || event.handle?.kind === 'select' ? {} : { cut: event.cut }),
  };
  return settle({ context, children }, { ...context, press }, enq);
};

const pointerMoved = ({ context, event, children }: TransitionArgs<'pointerMoved'>, enq: SectionInputEnqueue) => {
  const { press } = context;
  if (press?.pointerId !== event.pointerId) {
    // Another pointer: only the held one moves the press.
    return {};
  }
  const moved = hasTravelled(press, event.x, event.y);
  if (press.cut && moved) {
    command(children, enq, { type: 'dragStep', x: event.offsetX, y: event.offsetY });
  }
  return moved === press.moved ? {} : settle({ context, children }, { ...context, press: { ...press, moved } }, enq);
};

const pointerReleased = ({ context, event, children }: TransitionArgs<'pointerReleased'>, enq: SectionInputEnqueue) => {
  const { press } = context;
  if (press?.pointerId !== event.pointerId) {
    // Another pointer: only the held one ends the press.
    return {};
  }
  const moved = hasTravelled(press, event.x, event.y);
  if (press.cut && moved) {
    // The release is the drag's last step; it lands now, not on the next frame.
    command(children, enq, { type: 'dragStep', x: event.offsetX, y: event.offsetY });
  }
  return endPress(
    { context, children },
    enq,
    moved || press.tile === undefined ? { ending: 'flush' } : { ending: 'flush', clickedTile: press.tile },
  );
};

const pointerCancelled = ({ context, event, children }: TransitionArgs<'pointerCancelled'>, enq: SectionInputEnqueue) =>
  context.press?.pointerId === event.pointerId ? endPress({ context, children }, enq, { ending: 'flush' }) : {};

const cutsChanged = ({ context, event, children }: TransitionArgs<'cutsChanged'>, enq: SectionInputEnqueue) => {
  const hovered =
    context.hovered && event.handles.some((handle) => isSameTarget(handle, context.hovered))
      ? context.hovered
      : undefined;
  const hoveredTile = event.isPickerLive ? context.hoveredTile : undefined;
  const next = { ...context, hovered, hoveredTile };
  const dragged = context.press?.cut;
  if (dragged) {
    const current = event.cuts.find((cut) => cut.id === dragged.id);
    if (event.selectedId !== dragged.id || !current || cutStructure(current) !== cutStructure(dragged)) {
      // A step dragged on a cut that went away, changed its plane or axis or lost the selection must not land.
      command(children, enq, { type: 'pressEnded', ending: 'cancel' });
      return settle({ context, children }, { ...next, press: undefined }, enq);
    }
  }
  return settle({ context, children }, next, enq);
};

const sectionViewEnded = (
  { context, children }: Pick<TransitionArgs, 'context' | 'children'>,
  enq: SectionInputEnqueue,
) => {
  if (context.press) {
    command(children, enq, { type: 'pressEnded', ending: 'cancel' });
  }
  if (context.hovered) {
    command(children, enq, { type: 'hoverCutChanged', cutId: undefined });
  }
  return settle({ context, children }, { hovered: undefined, hoveredTile: undefined, press: undefined }, enq);
};

const sectionInputMachineDefinition = setup({
  actors: sectionInputActors,
  schemas: {
    context: types<SectionInputContext>(),
    events: eventSchemas<SectionInputEvent>(),
  },
}).createMachine({
  id: 'sectionInput',
  context: { hovered: undefined, hoveredTile: undefined, press: undefined },
  // Stopping the section input stops its adapter, which gives back whatever it held.
  invoke: { id: 'adapter', src: 'adapter' },
  initial: 'idle',
  states: {
    idle: {
      on: {
        hoverPicked: (args, enq) => hoverPicked(args, enq),
        pointerPressed: (args, enq) => pointerPressed(args, enq),
      },
    },
    hovering: {
      on: {
        hoverPicked: (args, enq) => hoverPicked(args, enq),
        pointerPressed: (args, enq) => pointerPressed(args, enq),
      },
    },
    pressed: {
      on: {
        pointerMoved: (args, enq) => pointerMoved(args, enq),
        pointerReleased: (args, enq) => pointerReleased(args, enq),
        pointerCancelled: (args, enq) => pointerCancelled(args, enq),
      },
    },
    dragging: {
      on: {
        pointerMoved: (args, enq) => pointerMoved(args, enq),
        pointerReleased: (args, enq) => pointerReleased(args, enq),
        pointerCancelled: (args, enq) => pointerCancelled(args, enq),
      },
    },
  },
  on: {
    cutsChanged: (args, enq) => cutsChanged(args, enq),
    sectionViewEnded: (args, enq) => sectionViewEnded(args, enq),
    renderFrameChanged: ({ event, children }, enq) => {
      command(children, enq, { type: 'renderFrameChanged', renderFrame: event.renderFrame });
      return {};
    },
  },
});

/**
 * The `[state, eventType]` pairs {@link sectionInputMachine} leaves unanswered (MC-R17). Hover waits while a press is
 * held; the adapter reports a press only while none is held, and moves, releases and cancels only for a held one.
 *
 * @public
 */
export const sectionInputIgnoredEvents: ReadonlyArray<readonly [state: string, eventType: string]> = [
  ['idle', 'pointerMoved'],
  ['idle', 'pointerReleased'],
  ['idle', 'pointerCancelled'],
  ['hovering', 'pointerMoved'],
  ['hovering', 'pointerReleased'],
  ['hovering', 'pointerCancelled'],
  ['pressed', 'hoverPicked'],
  ['pressed', 'pointerPressed'],
  ['dragging', 'hoverPicked'],
  ['dragging', 'pointerPressed'],
];

/**
 * Every {@link SectionInputEvent} type, in the union's order.
 *
 * @public
 */
export const sectionInputEventTypes = [
  'hoverPicked',
  'pointerPressed',
  'pointerMoved',
  'pointerReleased',
  'pointerCancelled',
  'cutsChanged',
  'sectionViewEnded',
  'renderFrameChanged',
] as const satisfies ReadonlyArray<SectionInputEvent['type']>;

type SectionInputMachineDefinition = typeof sectionInputMachineDefinition;

/**
 * The type of {@link sectionInputMachine}, named so declarations reference it rather than inline it.
 *
 * @public
 */
// oxlint-disable-next-line typescript/no-empty-interface, typescript/no-empty-object-type, typescript/consistent-type-definitions -- an interface, not a type alias: declarations reference an interface by name and would expand an alias (K-17)
export interface SectionInputMachine extends SectionInputMachineDefinition {}

/**
 * The section handles' pointer gesture.
 *
 * @public
 */
export const sectionInputMachine: SectionInputMachine = sectionInputMachineDefinition;

/**
 * A running section input.
 *
 * @public
 */
export type SectionInputRef = ActorRefFrom<SectionInputMachine>;

/**
 * A section input's snapshot.
 *
 * @public
 */
export type SectionInputSnapshot = SnapshotFrom<SectionInputMachine>;
