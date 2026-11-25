/**
 * SPIKE (chat pointers design): the comment pins a person has dropped on the model, outside the graphics machine.
 *
 * The charter moves this state into a `comment` region of the graphics machine and the chat draft record. The spike
 * keeps it in one external store so the viewer scene, the DOM pin heads and a host composer can read the same pins.
 */
import { useSyncExternalStore } from 'react';

/** A camera pose in physical tau:root metres, enough to return to the view a pin was placed from. */
export type CommentPinView = {
  position: [number, number, number];
  target: [number, number, number];
  up: [number, number, number];
  projection: 'perspective' | 'orthographic';
  /** Vertical field of view in degrees (perspective) or vertical span in metres (orthographic). */
  vertical: number;
};

/** One comment pinned to a surface point of the model. */
export type CommentPin = {
  id: string;
  comment: string;
  /** Surface point in physical tau:root metres (Z up). */
  point: [number, number, number];
  /** Outward unit surface normal in tau:root. */
  normal: [number, number, number];
  /** Surface point and normal in the Three render frame, for drawing. */
  renderPoint: [number, number, number];
  renderNormal: [number, number, number];
  componentId?: string;
  componentLabel?: string;
  /** The geometry the pin was placed on; a different presented key means the model changed underneath it. */
  geometryKey: string;
  view: CommentPinView;
};

/** Where a pin's head sits on screen this frame, in CSS pixels of the viewer surface. */
export type CommentPinScreen = { x: number; y: number; isOccluded: boolean; isBehindCamera: boolean };

/** What the spike's scene bridge answers for a host: a frame of the live canvas and a ray pick. */
export type CommentSceneBridge = {
  /** The live canvas as a PNG data URL without the pins, and the camera that drew it. */
  capture: (
    from?: CommentPinView,
  ) => Promise<{ dataUrl: string; width: number; height: number; view: CommentPinView & { aspect: number } }>;
  /** The first visible surface a tau:root ray meets. */
  pickRay: (
    origin: [number, number, number],
    direction: [number, number, number],
  ) =>
    | {
        point: [number, number, number];
        normal: [number, number, number];
        renderPoint: [number, number, number];
        geometryKey: string;
        componentId?: string;
        componentLabel?: string;
      }
    | undefined;
  /** The current camera. */
  view: () => (CommentPinView & { aspect: number }) | undefined;
};

type CommentPinsState = {
  isActive: boolean;
  pins: readonly CommentPin[];
  /** The pin whose comment is being written or read. */
  openPinId: string | undefined;
  /** Pins from an earlier message, shown read-only. */
  historyPins: readonly CommentPin[];
};

type Listener = () => void;

/** One viewer's pins. Created per viewer scope so two panes never share pins. */
export type CommentPinsStore = {
  getState: () => CommentPinsState;
  subscribe: (listener: Listener) => () => void;
  setActive: (isActive: boolean) => void;
  addPin: (pin: CommentPin) => void;
  updateComment: (id: string, comment: string) => void;
  removePin: (id: string) => void;
  openPin: (id: string | undefined) => void;
  clear: () => void;
  showHistory: (pins: readonly CommentPin[]) => void;
  /** DOM heads register here; the scene moves them every frame without a React render. */
  registerHead: (id: string, element: HTMLElement | undefined) => void;
  placeHead: (id: string, screen: CommentPinScreen) => void;
  readonly screens: Map<string, CommentPinScreen>;
  /** Asks the scene to fly the camera to a pin's recorded view. */
  requestView: (view: CommentPinView) => void;
  onViewRequest: (handler: (view: CommentPinView) => void) => () => void;
  /** Set by the scene while it is mounted. */
  bridge: CommentSceneBridge | undefined;
};

/**
 * Creates one viewer's pin store.
 *
 * @returns The store.
 */
export function createCommentPinsStore(): CommentPinsStore {
  let state: CommentPinsState = { isActive: false, pins: [], openPinId: undefined, historyPins: [] };
  const listeners = new Set<Listener>();
  const heads = new Map<string, HTMLElement>();
  const screens = new Map<string, CommentPinScreen>();
  const viewHandlers = new Set<(view: CommentPinView) => void>();
  const set = (next: Partial<CommentPinsState>): void => {
    state = { ...state, ...next };
    for (const listener of listeners) {
      listener();
    }
  };
  const applyHead = (id: string): void => {
    const element = heads.get(id);
    const screen = screens.get(id);
    if (!element || !screen) {
      return;
    }
    element.style.transform = `translate3d(${screen.x}px, ${screen.y}px, 0) translate(-50%, -50%)`;
    element.dataset['occluded'] = String(screen.isOccluded);
    element.style.visibility = screen.isBehindCamera ? 'hidden' : 'visible';
  };
  return {
    getState: () => state,
    subscribe(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    setActive(isActive) {
      set({ isActive, openPinId: isActive ? state.openPinId : undefined });
    },
    addPin(pin) {
      set({ pins: [...state.pins, pin], openPinId: pin.id });
    },
    updateComment(id, comment) {
      set({ pins: state.pins.map((pin) => (pin.id === id ? { ...pin, comment } : pin)) });
    },
    removePin(id) {
      screens.delete(id);
      set({
        pins: state.pins.filter((pin) => pin.id !== id),
        openPinId: state.openPinId === id ? undefined : state.openPinId,
      });
    },
    openPin(id) {
      set({ openPinId: id });
    },
    clear() {
      screens.clear();
      set({ pins: [], openPinId: undefined });
    },
    showHistory(pins) {
      set({ historyPins: pins });
    },
    registerHead(id, element) {
      if (element) {
        heads.set(id, element);
        applyHead(id);
      } else {
        heads.delete(id);
      }
    },
    placeHead(id, screen) {
      screens.set(id, screen);
      applyHead(id);
    },
    screens,
    bridge: undefined,
    requestView(view) {
      for (const handler of viewHandlers) {
        handler(view);
      }
    },
    onViewRequest(handler) {
      viewHandlers.add(handler);
      return () => {
        viewHandlers.delete(handler);
      };
    },
  };
}

/** The spike's single viewer store. */
export const commentPinsStore = createCommentPinsStore();

/**
 * Subscribes to the pin store.
 *
 * @param selector - Picks the value to read.
 * @returns The selected value.
 */
export function useCommentPins<T>(selector: (state: CommentPinsState) => T): T {
  return useSyncExternalStore(
    commentPinsStore.subscribe,
    () => selector(commentPinsStore.getState()),
    () => selector(commentPinsStore.getState()),
  );
}
