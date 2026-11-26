/**
 * The comment input's DOM adapter: one surface's pointer listeners and the camera's drags, reported to the comment
 * input, whose click it answers through the scene's host functions.
 *
 * @module
 */
import { createCallbackLogic } from 'xstate';
import type { ActorRefFrom } from 'xstate';
import { createRafCoalescer } from '#graphics/three/utils/raf-coalescer.js';
import type { graphicsMachine } from '#machines/graphics.machine.js';
import { selectCameraDragging } from '#machines/graphics.machine.js';
import type {
  CommentInputAdapterLogic,
  CommentInputCommand,
  CommentInputEvent,
} from '#machines/comment-input.machine.js';

type GraphicsActorRef = ActorRefFrom<typeof graphicsMachine>;

/** A point of the page, in client pixels. */
export type CommentPointerAt = Readonly<{ x: number; y: number }>;

/** The scene's own work, read live: the adapter calls the version the scene rendered last. */
export type CommentSceneHost = Readonly<{
  /** Shows where a click would put a pin, or hides the preview with `undefined`. */
  hover: (at: CommentPointerAt | undefined) => void;
  /** Picks the surface under a click and gives it to the viewer's host. */
  click: (at: CommentPointerAt) => void;
}>;

type CommentAdapterOptions = Readonly<{
  /** The element R3F listens on, which covers the canvas. */
  surface: HTMLElement;
  graphics: GraphicsActorRef;
  host: Readonly<{ current: CommentSceneHost | undefined }>;
}>;

/** How far a release may be from its press and still be a click, in CSS pixels. */
const clickSlop = { mouse: 4, touch: 10 } as const;

/** Pin heads and comment cards sit over the same surface: a press on them is theirs. */
const isOverCommentUi = (event: PointerEvent): boolean =>
  event.target instanceof Element && event.target.closest('[data-comment-ui]') !== null;

/**
 * Builds the comment input's pointer adapter around a surface.
 *
 * @param options - The surface, the view's graphics actor and the scene's host functions.
 * @returns The `pointer` logic to provide to the comment input.
 */
export const createCommentPointerAdapter = ({
  surface,
  graphics,
  host,
}: CommentAdapterOptions): CommentInputAdapterLogic =>
  createCallbackLogic<CommentInputCommand, undefined>(({ sendBack, receive }) => {
    const report = (event: CommentInputEvent): void => {
      sendBack(event);
    };
    const listeners = new AbortController();
    const { signal } = listeners;
    const hovers = createRafCoalescer<CommentPointerAt>((at) => {
      host.current?.hover(at);
    });
    const endHover = (): void => {
      hovers.cancel();
      host.current?.hover(undefined);
    };
    const { cameraRef } = graphics.getSnapshot().context;

    surface.addEventListener(
      'pointerdown',
      (event) => {
        if (isOverCommentUi(event)) {
          return;
        }
        report({
          type: 'pointerDown',
          button: event.button,
          isPrimary: event.isPrimary,
          pointerId: event.pointerId,
          x: event.clientX,
          y: event.clientY,
          slop: event.pointerType === 'mouse' ? clickSlop.mouse : clickSlop.touch,
          cameraMoving: selectCameraDragging(cameraRef),
        });
      },
      { signal },
    );
    surface.addEventListener(
      'pointermove',
      (event) => {
        // Only a resting mouse previews: a held button is an orbit, and touch has no hover.
        if (event.pointerType !== 'mouse' || event.buttons !== 0 || isOverCommentUi(event)) {
          endHover();
          return;
        }
        hovers.schedule({ x: event.clientX, y: event.clientY });
      },
      { signal },
    );
    surface.addEventListener(
      'pointerup',
      (event) => {
        report({ type: 'pointerUp', pointerId: event.pointerId, x: event.clientX, y: event.clientY });
      },
      { signal },
    );
    surface.addEventListener(
      'pointercancel',
      (event) => {
        report({ type: 'pointerCancel', pointerId: event.pointerId });
        endHover();
      },
      { signal },
    );
    surface.addEventListener('pointerleave', endHover, { signal });
    globalThis.addEventListener(
      'blur',
      () => {
        report({ type: 'blur' });
        endHover();
      },
      { signal },
    );

    // The view's camera child: a drag it reports makes the held press an orbit.
    const cameraSubscription = cameraRef.subscribe(() => {
      if (selectCameraDragging(cameraRef)) {
        report({ type: 'cameraMoved' });
        endHover();
      }
    });

    receive((command) => {
      host.current?.click({ x: command.x, y: command.y });
    });

    const previousCursor = surface.style.cursor;
    surface.style.cursor = 'crosshair';

    return () => {
      listeners.abort();
      cameraSubscription.unsubscribe();
      surface.style.cursor = previousCursor;
      endHover();
    };
  });
