type Presentation = { owners: number; ready: Promise<void>; resolve: () => void };
const presentations = new WeakMap<Uint8Array<ArrayBuffer>, Presentation>();

/** Hold noncritical capture while a mounted viewer prepares these immutable bytes. */
export function holdGeometryPresentation(content: Uint8Array<ArrayBuffer>): {
  presented: () => void;
  release: () => void;
} {
  let presentation = presentations.get(content);
  if (!presentation) {
    const { promise, resolve } = Promise.withResolvers<void>();
    presentation = { owners: 0, ready: promise, resolve };
    presentations.set(content, presentation);
  }
  const held = presentation;
  held.owners += 1;
  let released = false;
  return {
    presented: () => {
      held.resolve();
    },
    release: () => {
      if (released) {
        return;
      }
      released = true;
      held.owners -= 1;
      // No foreground view remains; headless capture can proceed independently.
      if (held.owners === 0) {
        held.resolve();
      }
    },
  };
}

/** Wait for a foreground presentation opportunity, or proceed immediately without a viewer. */
export async function awaitGeometryPresentation(content: Uint8Array<ArrayBuffer>, signal: AbortSignal): Promise<void> {
  signal.throwIfAborted();
  const presentation = presentations.get(content);
  if (!presentation) {
    return;
  }
  const aborted = Promise.withResolvers<never>();
  const abort = (): void => {
    aborted.reject(signal.reason);
  };
  signal.addEventListener('abort', abort, { once: true });
  try {
    await Promise.race([presentation.ready, aborted.promise]);
    signal.throwIfAborted();
  } finally {
    signal.removeEventListener('abort', abort);
  }
}
