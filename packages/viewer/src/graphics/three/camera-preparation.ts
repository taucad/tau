/**
 * Admit one optional synchronous preparation after a quiet, visible frame.
 * No work runs before presentation, during interaction, or after owner disposal.
 *
 * @internal
 * @param canvas - The owning viewer's input surface.
 * @param prepare - Returns false when the scene is not yet eligible.
 * @returns Frame notification and disposal for this canvas owner.
 */
export function scheduleCameraPreparation(
  canvas: HTMLCanvasElement,
  prepare: () => boolean,
): {
  onFrame: () => void;
  dispose: () => void;
} {
  const document = canvas.ownerDocument;
  const window = document.defaultView;
  let timer: number | undefined;
  let disposed = false;
  let prepared = false;
  let pointerDown = false;
  const cancel = (): void => {
    if (timer !== undefined) {
      window?.clearTimeout(timer);
      timer = undefined;
    }
  };
  const onFrame = (): void => {
    if (disposed || prepared || pointerDown || !window) {
      return;
    }
    cancel();
    if (document.visibilityState !== 'visible') {
      return;
    }
    timer = window.setTimeout(() => {
      timer = undefined;
      if (!disposed && document.visibilityState === 'visible') {
        try {
          prepared = prepare();
        } catch (error) {
          // Speculation must not disable the live viewer or repeatedly retry a failed graph.
          prepared = true;
          console.warn('Camera preparation failed; the next projection remains demand-rendered.', error);
        }
      }
    }, 750);
  };
  const beginPointer = (): void => {
    pointerDown = true;
    cancel();
  };
  const endPointer = (): void => {
    pointerDown = false;
  };
  canvas.addEventListener('pointerdown', beginPointer);
  document.addEventListener('pointerup', endPointer);
  document.addEventListener('pointercancel', endPointer);
  const events = ['pointermove', 'wheel', 'keydown'] as const;
  for (const event of events) {
    canvas.addEventListener(event, cancel, { passive: true });
  }
  document.addEventListener('visibilitychange', cancel);
  return {
    onFrame,
    dispose: () => {
      disposed = true;
      cancel();
      for (const event of events) {
        canvas.removeEventListener(event, cancel);
      }
      document.removeEventListener('visibilitychange', cancel);
      canvas.removeEventListener('pointerdown', beginPointer);
      document.removeEventListener('pointerup', endPointer);
      document.removeEventListener('pointercancel', endPointer);
    },
  };
}
