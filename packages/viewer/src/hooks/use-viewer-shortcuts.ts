import { useId, useLayoutEffect, useMemo, useRef } from 'react';
import { useViewerViewFields } from '#cad/viewer-view-fields.jsx';
import type { ViewerViewFieldValues, ViewerViewFields } from '#cad/viewer-view-fields.jsx';
import type { RefObject } from 'react';
import { useActorRef } from '@xstate/react';
import { createCallbackLogic } from 'xstate';
import type { ActorRefFrom, Subscription } from 'xstate';
import { useGraphics } from '#hooks/use-graphics.jsx';
import type {
  GraphicsContext,
  GraphicsEvent,
  graphicsMachine,
  ViewerShortcut,
  ViewerShortcutCamera,
  ViewerShortcutOutcome,
} from '#machines/graphics.machine.js';
import { useKeybinding } from '@taucad/ui/components/keyboard';
import type { KeyCombination } from '@taucad/ui/utils/keys';

type GraphicsActorRef = ActorRefFrom<typeof graphicsMachine>;
type ViewerShortcutPress = Extract<GraphicsEvent, { type: 'viewerShortcutPressed' }>;
/** What a press knows: the key's shortcut, the camera's view and the focused chip's cut. */
type ViewerShortcutFacts = Omit<ViewerShortcutPress, 'type' | 'pressId'>;
type KeybindingOptions = NonNullable<Parameters<typeof useKeybinding>[2]>;

/** Focus inside one of these belongs to a menu, list, tree, grid or dialog, which keeps its own keys. */
const ownKeysSelector =
  '[role=menu],[role=menubar],[role=listbox],[role=tree],[role=treegrid],[role=grid],[role=dialog],[data-radix-popper-content-wrapper]';

const fitViewKey: KeyCombination = { key: 'f' };
const sectionKey: KeyCombination = { key: 's' };
const measureKey: KeyCombination = { key: 'm' };
const gridKey: KeyCombination = { key: 'g' };
const projectionKey: KeyCombination = { key: 'p' };
const escapeKey: KeyCombination = { key: 'Escape' };
const deleteKey: KeyCombination = { key: 'Delete' };
const backspaceKey: KeyCombination = { key: 'Backspace' };

/** The phrase the bar speaks for each outcome. */
const outcomePhrases: Readonly<Record<ViewerShortcutOutcome, string>> = {
  fitted: 'Fitted to view',
  noModelToFit: 'No model to fit',
  sectionOn: 'Section on',
  sectionOff: 'Section off',
  sectionNeedsModel: 'A model is required for section view',
  measureOn: 'Measure on',
  measureOff: 'Measure off',
  measureNeedsModel: 'A model is required for measurement',
  gridShown: 'Grid shown',
  gridHidden: 'Grid hidden',
  perspective: 'Perspective',
  orthographic: 'Orthographic',
  pointCancelled: 'Point cancelled',
  cutRemoved: 'Cut removed',
};

/**
 * Whether a key belongs to the viewer holding `element`: the viewer under the pointer, else the one holding focus,
 * and never while focus is in a menu, list, tree, grid or dialog. Read when the key goes down, so neither the pointer
 * nor focus is tracked. Without a `[data-viewer-frame]` ancestor, `element` stands in for its viewer.
 *
 * @param element - The element a key reached.
 * @returns Whether the viewer owns the key.
 * @public
 */
export const isViewerKeyTarget = (element: Element | undefined): boolean => {
  const frame = element?.closest('[data-viewer-frame]') ?? element;
  const focused = document.activeElement;
  if (!frame || focused?.closest(ownKeysSelector)) {
    return false;
  }
  const hovered = document.querySelector('[data-viewer-frame]:hover');
  return hovered ? hovered === frame : frame.contains(focused);
};

/** The camera child's view at the press, which Section and P need. */
function selectShortcutCamera(graphicsRef: GraphicsActorRef): ViewerShortcutCamera {
  const { view, lastPerspectiveVerticalFieldOfView } = graphicsRef
    .getSnapshot()
    .context.cameraRef.getSnapshot().context;
  return {
    direction: view.direction,
    requestedVerticalFieldOfView: view.requestedVerticalFieldOfView,
    lastPerspectiveVerticalFieldOfView,
  };
}

/** Whether graphics does something with `press`, so the viewer claims the key; graphics leaves the rest unhandled. */
function selectShortcutApplies(graphicsRef: GraphicsActorRef, press: ViewerShortcutPress): boolean {
  return graphicsRef.getSnapshot().can(press);
}

/** Whether graphics shows the grid at the press, which G with view commands needs. */
function selectShortcutGridShown(graphicsRef: GraphicsActorRef): boolean {
  return graphicsRef.getSnapshot().context.enableGrid;
}

type ShortcutLeaf = 'display.grid' | 'fieldOfView';

/* The camera child, whose field of view P writes. */
function selectShortcutCameraRef(graphicsRef: GraphicsActorRef): GraphicsContext['cameraRef'] {
  return graphicsRef.getSnapshot().context.cameraRef;
}

/* What graphics shows for a G or P leaf now. */
function selectShortcutShown(graphicsRef: GraphicsActorRef, leaf: ShortcutLeaf): boolean | number {
  return leaf === 'display.grid'
    ? selectShortcutGridShown(graphicsRef)
    : selectShortcutCamera(graphicsRef).requestedVerticalFieldOfView;
}

/**
 * A G or P value the host is still writing, per graphics actor: what the next press toggles from. `stop` ends the
 * watch that forgets it once graphics shows it.
 */
type PendingShortcutWrite = Readonly<{ write: number; value: boolean | number; stop: () => void }>;
type PendingShortcutWrites = Map<ShortcutLeaf, PendingShortcutWrite>;
const pendingShortcutWrites = new WeakMap<GraphicsActorRef, PendingShortcutWrites>();
/* Names each write, so a write that settles clears only its own pending value, never a newer one equal to it. */
let shortcutWrites = 0;

/* Forgets a leaf's pending value, only `write`'s when one is named. */
function forgetShortcutWrite(graphicsRef: GraphicsActorRef, leaf: ShortcutLeaf, write?: number): void {
  const pending = pendingShortcutWrites.get(graphicsRef);
  const entry = pending?.get(leaf);
  if (entry === undefined || (write !== undefined && entry.write !== write)) {
    return;
  }
  entry.stop();
  pending!.delete(leaf);
}

/*
 * Forgets `write`'s value when graphics comes to show it: the host's write reached the view. Only a change counts, so
 * a value graphics shows already while an earlier write is still landing stays pending until it shows again.
 */
function watchShortcutWrite({
  graphicsRef,
  leaf,
  write,
  value,
}: Readonly<{
  graphicsRef: GraphicsActorRef;
  leaf: ShortcutLeaf;
  write: number;
  value: boolean | number;
}>): () => void {
  let shown = selectShortcutShown(graphicsRef, leaf);
  const observe = (): void => {
    const now = selectShortcutShown(graphicsRef, leaf);
    if (now !== shown && now === value) {
      forgetShortcutWrite(graphicsRef, leaf, write);
    }
    shown = now;
  };
  // The grid is graphics' own; the field of view is the camera child's.
  const subscription: Subscription =
    leaf === 'display.grid' ? graphicsRef.subscribe(observe) : selectShortcutCameraRef(graphicsRef).subscribe(observe);
  return () => {
    subscription.unsubscribe();
  };
}

/* The value a press toggles from: the one still being written, until graphics shows it, else the one shown. */
function toggledFrom<Value extends boolean | number>(
  graphicsRef: GraphicsActorRef,
  leaf: 'display.grid' | 'fieldOfView',
  shown: Value,
): Value {
  const value = pendingShortcutWrites.get(graphicsRef)?.get(leaf)?.value;
  if (value === undefined || value === shown) {
    forgetShortcutWrite(graphicsRef, leaf);
    return shown;
  }
  // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- Each leaf only ever holds its own value type.
  return value as Value;
}

/* Forgets a pending value once its write is refused or fails; a saved one is forgotten when graphics shows it
 * ({@link watchShortcutWrite}). */
async function settleShortcutWrite({
  graphicsRef,
  leaf,
  write,
  written,
}: Readonly<{
  graphicsRef: GraphicsActorRef;
  leaf: 'display.grid' | 'fieldOfView';
  write: number;
  written: Promise<boolean>;
}>): Promise<void> {
  let saved = false;
  try {
    saved = await written;
  } catch {
    // The host reports its own failure.
  }
  if (!saved) {
    forgetShortcutWrite(graphicsRef, leaf, write);
  }
}

/* Issues one G or P value as the view's command, remembering it until graphics shows it or the write fails. */
function issueShortcutWrite<Leaf extends 'display.grid' | 'fieldOfView'>({
  viewFields,
  graphicsRef,
  leaf,
  value,
}: Readonly<{
  viewFields: ViewerViewFields;
  graphicsRef: GraphicsActorRef;
  leaf: Leaf;
  value: ViewerViewFieldValues[Leaf];
}>): void {
  const written = viewFields.set(leaf, value);
  if (written === undefined) {
    return;
  }
  const pending: PendingShortcutWrites = pendingShortcutWrites.get(graphicsRef) ?? new Map();
  pendingShortcutWrites.set(graphicsRef, pending);
  shortcutWrites += 1;
  const write = shortcutWrites;
  pending.get(leaf)?.stop();
  pending.set(leaf, { write, value, stop: watchShortcutWrite({ graphicsRef, leaf, write, value }) });
  void settleShortcutWrite({ graphicsRef, leaf, write, written });
}

/** G or P with the host's view commands: the same decision graphics makes, issued as the view's command. */
function setViewField({
  viewFields,
  graphicsRef,
  shortcut,
  announce,
}: Readonly<{
  viewFields: ViewerViewFields;
  graphicsRef: GraphicsActorRef;
  shortcut: 'grid' | 'projection';
  announce: (phrase: string) => void;
}>): void {
  if (shortcut === 'grid') {
    const isShown = !toggledFrom(graphicsRef, 'display.grid', selectShortcutGridShown(graphicsRef));
    issueShortcutWrite({ viewFields, graphicsRef, leaf: 'display.grid', value: isShown });
    announce(outcomePhrases[isShown ? 'gridShown' : 'gridHidden']);
    return;
  }
  const camera = selectShortcutCamera(graphicsRef);
  const fieldOfView = toggledFrom(graphicsRef, 'fieldOfView', camera.requestedVerticalFieldOfView);
  const isOrthographic = fieldOfView === 0;
  /* Back to the perspective still shown when an orthographic write is pending, else the last one graphics kept. */
  const perspective =
    camera.requestedVerticalFieldOfView === 0
      ? camera.lastPerspectiveVerticalFieldOfView
      : camera.requestedVerticalFieldOfView;
  issueShortcutWrite({ viewFields, graphicsRef, leaf: 'fieldOfView', value: isOrthographic ? perspective : 0 });
  announce(outcomePhrases[isOrthographic ? 'perspective' : 'orthographic']);
}

/** What the keyboard adapter takes: one press for the graphics actor the bar shows. */
type KeyboardAdapterEvent = Readonly<{ type: 'pressed'; graphicsRef: GraphicsActorRef; facts: ViewerShortcutFacts }>;

type KeyboardAdapterInput = Readonly<{
  /** Prefixes this adapter's press ids, so a second bar on the same graphics announces only its own presses. */
  adapterId: string;
  announce: (phrase: string) => void;
}>;

/**
 * The bar's keyboard adapter: the one path from its key bindings to graphics and back. It sends each press to the
 * graphics actor that the press names, listens there for `viewerShortcutApplied`, and announces the outcome of its own
 * presses. The listener lives in this closure and follows the bar to a new graphics actor, so no React effect sends
 * or subscribes (the React event-layer ceiling).
 */
const viewerKeyboardAdapter = createCallbackLogic<KeyboardAdapterEvent, KeyboardAdapterInput>(({ input, receive }) => {
  let pressCount = 0;
  let listened: Readonly<{ graphicsRef: GraphicsActorRef; subscription: Subscription }> | undefined;
  const listen = (graphicsRef: GraphicsActorRef): void => {
    if (listened?.graphicsRef === graphicsRef) {
      return;
    }
    listened?.subscription.unsubscribe();
    const subscription = graphicsRef.on('viewerShortcutApplied', ({ pressId, outcome }) => {
      if (pressId.startsWith(`${input.adapterId}:`)) {
        input.announce(outcomePhrases[outcome]);
      }
    });
    listened = { graphicsRef, subscription };
  };
  receive(({ graphicsRef, facts }) => {
    listen(graphicsRef);
    pressCount += 1;
    graphicsRef.send({ type: 'viewerShortcutPressed', pressId: `${input.adapterId}:${pressCount}`, ...facts });
  });
  return () => {
    listened?.subscription.unsubscribe();
  };
});

/**
 * The formatted keys of the shortcuts that tooltips show.
 *
 * @public
 */
export type ViewerShortcutKeys = Readonly<{ fitView: string; section: string; measure: string }>;

/**
 * The viewer's shortcuts: F fits the view, S and M toggle Section and Measure, G the grid, and P switches between
 * orthographic and the last perspective field of view. Escape cancels a half-placed measurement, then stops Measure,
 * then stops Section; Delete and Backspace remove the cut of the chip holding focus, else the selected cut. S, M and
 * P are off for 2D geometry. Each shortcut passes a short phrase for its result to `announce`, which the bar speaks.
 *
 * Each key is an intent sent to graphics through the bar's keyboard adapter; graphics decides what it does. A key
 * claims its event only when graphics would act on it, so Escape, Delete and Backspace pass through otherwise.
 *
 * Keys typed into a field never reach these bindings, and every viewer registers its own set, gated by
 * {@link isViewerKeyTarget} on `barRef`. The bindings keep the default priority, below a drag's Escape.
 *
 * @param barRef - The bar the shortcuts belong to.
 * @param announce - Speaks each shortcut's result.
 * @returns The formatted keys tooltips show.
 * @public
 */
export const useViewerShortcuts = (
  // oxlint-disable-next-line @typescript-eslint/no-restricted-types -- required by React
  barRef: RefObject<HTMLElement | null>,
  announce: (phrase: string) => void,
): ViewerShortcutKeys => {
  const graphicsRef = useGraphics();
  const viewFields = useViewerViewFields();
  const announceRef = useRef(announce);
  useLayoutEffect(() => {
    announceRef.current = announce;
  }, [announce]);
  const adapterId = useId();
  const adapterRef = useActorRef(viewerKeyboardAdapter, {
    input: {
      adapterId,
      announce: (phrase: string) => {
        announceRef.current(phrase);
      },
    },
  });

  const bindings = useMemo(() => {
    // The cut of the chip in this bar holding focus, which focus previews in the scene.
    const focusedCutId = (): string | undefined => {
      const chip = document.activeElement?.closest<HTMLElement>('[data-section-chip]');
      return chip && barRef.current?.contains(chip) ? chip.dataset['sectionChip'] : undefined;
    };
    const factsFor = (shortcut: ViewerShortcut): ViewerShortcutFacts => {
      const cutId = shortcut === 'removeCut' ? focusedCutId() : undefined;
      return { shortcut, camera: selectShortcutCamera(graphicsRef), ...(cutId === undefined ? {} : { cutId }) };
    };
    const binding = (shortcut: ViewerShortcut): Readonly<{ press: () => void; options: KeybindingOptions }> => ({
      press: () => {
        if (viewFields && (shortcut === 'grid' || shortcut === 'projection')) {
          // G and P set their leaf in the view through the host's command; the record reaches graphics from there.
          setViewField({ viewFields, graphicsRef, shortcut, announce: announceRef.current });
          return;
        }
        adapterRef.send({ type: 'pressed', graphicsRef, facts: factsFor(shortcut) });
      },
      options: {
        ignoreInputs: true,
        enabled: () =>
          isViewerKeyTarget(barRef.current ?? undefined) &&
          selectShortcutApplies(graphicsRef, { type: 'viewerShortcutPressed', pressId: '', ...factsFor(shortcut) }),
      },
    });
    return {
      fitView: binding('fitView'),
      section: binding('section'),
      measure: binding('measure'),
      grid: binding('grid'),
      projection: binding('projection'),
      escape: binding('escape'),
      removeCut: binding('removeCut'),
    };
  }, [adapterRef, barRef, graphicsRef, viewFields]);

  const { formattedKeyCombination: fitView } = useKeybinding(
    fitViewKey,
    bindings.fitView.press,
    bindings.fitView.options,
  );
  const { formattedKeyCombination: section } = useKeybinding(
    sectionKey,
    bindings.section.press,
    bindings.section.options,
  );
  const { formattedKeyCombination: measure } = useKeybinding(
    measureKey,
    bindings.measure.press,
    bindings.measure.options,
  );
  useKeybinding(gridKey, bindings.grid.press, bindings.grid.options);
  useKeybinding(projectionKey, bindings.projection.press, bindings.projection.options);
  useKeybinding(escapeKey, bindings.escape.press, bindings.escape.options);
  useKeybinding(deleteKey, bindings.removeCut.press, bindings.removeCut.options);
  useKeybinding(backspaceKey, bindings.removeCut.press, bindings.removeCut.options);

  return useMemo(() => ({ fitView, section, measure }), [fitView, measure, section]);
};
