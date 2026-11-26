/**
 * The viewer's side of comment pins: a host gives the pins to draw and takes the surface a click picked. The viewer
 * owns the tool's toggle, the click and the picking; the host owns the comments.
 *
 * @module
 */
import { createContext, useContext, useMemo, useState } from 'react';
import type { CameraState } from '@taucad/camera';

/** A point or direction in the Tau root frame. @public */
export type CommentPinVector = readonly [number, number, number];

/** One pin the viewer draws. @public */
export type ViewerCommentPin = Readonly<{
  id: string;
  /** The number on the pin's head. */
  number: number;
  /** The surface point, in metres in the Tau root frame. */
  point: CommentPinVector;
  /** The outward unit surface normal the pin stands along. */
  normal: CommentPinVector;
}>;

/** The surface a click picked, and the camera that saw it. @public */
export type CommentSurfacePick = Readonly<{
  /** Metres in the Tau root frame. */
  point: CommentPinVector;
  /** The unit surface normal, turned toward the viewer. */
  normal: CommentPinVector;
  componentId?: string;
  componentLabel?: string;
  /** The presented geometry the point is on. */
  geometryKey: string;
  camera: CameraState;
}>;

/** Where a pin's head is on the viewer surface this frame, in CSS pixels from its top left. @public */
export type CommentPinScreen = Readonly<{
  x: number;
  y: number;
  /** The model hides the pin's foot from this camera. */
  isOccluded: boolean;
  /** The pin is behind the camera or outside its clip range. */
  isOffscreen: boolean;
}>;

/**
 * The scene's surface, for a host that drags a pin's head: what lies under a point of the page, and the ghost pin that
 * shows where a drop would put it. Points are client pixels.
 *
 * @public
 */
export type CommentPinSurface = Readonly<{
  /** The surface under a point, or `undefined` over nothing or while the model's pick tree is still building. */
  pick: (at: Readonly<{ x: number; y: number }>) => CommentSurfacePick | undefined;
  /** Shows the ghost pin at a point, or hides it with `undefined`. */
  hover: (at: Readonly<{ x: number; y: number }> | undefined) => void;
  /**
   * The first visible surface along a ray in the Tau root frame (metres), whatever the live camera: how a picture of
   * this scene finds the part under one of its points.
   */
  pickRay: (ray: Readonly<{ origin: CommentPinVector; direction: CommentPinVector }>) => CommentSurfacePick | undefined;
}>;

/**
 * The pin heads a host draws as DOM over the viewer. The scene moves each registered element when the camera or the
 * pin moves, without a React render.
 *
 * @public
 */
export type CommentPinHeads = Readonly<{
  /** Registers a pin's head element, or forgets it with `undefined`. Fits a ref callback. */
  register: (id: string, element: HTMLElement | undefined) => void;
  /** Called by the scene. */
  place: (id: string, screen: CommentPinScreen) => void;
  /** Stops the scene moving a head the host is dragging, or lets it again with `undefined`. */
  hold: (id: string | undefined) => void;
  /** The scene's surface while it is mounted; the scene sets it. */
  surface: { current: CommentPinSurface | undefined };
}>;

const createCommentPinHeads = (): CommentPinHeads => {
  const elements = new Map<string, HTMLElement>();
  const screens = new Map<string, CommentPinScreen>();
  let held: string | undefined;
  const apply = (id: string): void => {
    if (id === held) {
      return;
    }
    const element = elements.get(id);
    const screen = screens.get(id);
    if (!element || !screen) {
      return;
    }
    element.style.transform = `translate3d(${screen.x}px, ${screen.y}px, 0) translate(-50%, -50%)`;
    element.style.visibility = screen.isOffscreen ? 'hidden' : 'visible';
    element.dataset['occluded'] = String(screen.isOccluded);
  };
  return {
    register(id, element) {
      if (element) {
        elements.set(id, element);
        apply(id);
      } else {
        elements.delete(id);
      }
    },
    place(id, screen) {
      screens.set(id, screen);
      apply(id);
    },
    hold(id) {
      const released = held;
      held = id;
      if (released !== undefined && released !== id) {
        apply(released);
      }
    },
    surface: { current: undefined },
  };
};

/** What a host gives the viewer's Comment tool. @public */
export type CommentPinsHost = Readonly<{
  /** The pins of the model this viewer shows. */
  pins: readonly ViewerCommentPin[];
  /** A click on the model while the tool is on. */
  onPlace: (pick: CommentSurfacePick) => void;
  /** A click that met no surface while the tool is on. */
  onMiss?: () => void;
}>;

type CommentPinsValue = CommentPinsHost & Readonly<{ heads: CommentPinHeads }>;

const CommentPinsContext = createContext<CommentPinsValue | undefined>(undefined);

/**
 * Gives a viewer its comment pins. Without a host the viewer has no Comment tool; the provider stays mounted either
 * way, so a host that arrives later does not remount the viewer under it.
 *
 * @param props - The host, and the viewer under it.
 * @returns The provider.
 * @public
 */
export function CommentPinsProvider({
  host,
  children,
}: {
  readonly host: CommentPinsHost | undefined;
  readonly children: React.ReactNode;
}): React.JSX.Element {
  // oxlint-disable-next-line react/hook-use-state -- created once for the provider's life; never replaced.
  const [heads] = useState(createCommentPinHeads);
  const value = useMemo(() => (host ? { ...host, heads } : undefined), [heads, host]);
  return <CommentPinsContext.Provider value={value}>{children}</CommentPinsContext.Provider>;
}

/**
 * The nearest viewer's comment pins.
 *
 * @returns The host's pins and the head registry, or `undefined` when the viewer has no Comment tool.
 * @public
 */
export function useCommentPins(): CommentPinsValue | undefined {
  return useContext(CommentPinsContext);
}
