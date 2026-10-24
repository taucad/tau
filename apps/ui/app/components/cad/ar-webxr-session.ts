/** A running in-page AR session. */
export type WebXrArPresentation = Readonly<{
  /** Whether the session is still running; false once it ended, even before the scene loaded. */
  isActive: () => boolean;
  /** End the session; resolves once it has ended. */
  end: () => Promise<void>;
}>;

const placeHint = 'Move your phone slowly to find the floor, then tap to place the model.';
const movedHint = 'Tap another spot to move the model.';

/**
 * The DOM overlay the session shows over the camera: a live hint and an Exit button. It is created before the
 * session request, which takes it as `domOverlay.root`, and is plain DOM because it must exist within the click's
 * user activation.
 */
function createOverlay(): { root: HTMLDivElement; hint: HTMLParagraphElement; exit: HTMLButtonElement } {
  const root = document.createElement('div');
  root.dataset['slot'] = 'ar-session-overlay';
  root.className = 'pointer-events-none fixed inset-0 z-[2147483647] flex flex-col items-center justify-between p-4';
  root.style.paddingTop = 'max(1rem, env(safe-area-inset-top))';
  root.style.paddingBottom = 'max(1rem, env(safe-area-inset-bottom))';

  const hint = document.createElement('p');
  hint.setAttribute('role', 'status');
  hint.className = 'rounded-full bg-black/60 px-4 py-2 text-center text-sm text-white';
  hint.textContent = placeHint;

  const exit = document.createElement('button');
  exit.type = 'button';
  exit.className =
    'pointer-events-auto h-10 min-w-24 rounded-full bg-white px-5 text-sm font-medium text-black shadow-lg';
  exit.textContent = 'Exit AR';
  // A tap on the overlay's button must not also place the model.
  exit.addEventListener('beforexrselect', (event) => {
    event.preventDefault();
  });

  root.append(hint, exit);
  return { root, hint, exit };
}

/**
 * Open an `immersive-ar` WebXR session and show the GLB in it. The bytes stay in the page: nothing is uploaded,
 * and no external app or URL is involved. Call it from a click handler, since the session request needs the
 * person's gesture; the Three.js scene loads only after the session is granted.
 *
 * @param options - The GLB bytes, and `onEnd`, called once whenever the session ends after it started.
 * @returns The running presentation.
 * @throws The session request's `DOMException` (`NotAllowedError`, `NotSupportedError`, …), or the scene's error after
 *   the session was ended again. A session that ended while the model loaded resolves as an inactive presentation.
 */
export async function startWebXrAr({
  glb,
  onEnd,
}: Readonly<{ glb: Uint8Array<ArrayBuffer>; onEnd: () => void }>): Promise<WebXrArPresentation> {
  const { xr } = navigator;
  if (!xr) {
    throw new DOMException('WebXR is not available in this browser.', 'NotSupportedError');
  }

  // In the DOM for `domOverlay`, but invisible until the session is granted, so a denied request never flashes it.
  const overlay = createOverlay();
  overlay.root.style.visibility = 'hidden';
  document.body.append(overlay.root);

  let session: XRSession;
  try {
    session = await xr.requestSession('immersive-ar', {
      requiredFeatures: ['local'],
      optionalFeatures: ['hit-test', 'dom-overlay'],
      domOverlay: { root: overlay.root },
    });
  } catch (error) {
    overlay.root.remove();
    throw error;
  }

  overlay.root.style.visibility = '';
  let isActive = true;
  let disposeScene: (() => void) | undefined;
  const ended = new Promise<void>((resolve) => {
    session.addEventListener(
      'end',
      () => {
        isActive = false;
        const dispose = disposeScene;
        disposeScene = undefined;
        // Teardown must finish even when the scene's disposer throws: the overlay leaves and the host is told.
        try {
          dispose?.();
        } finally {
          overlay.root.remove();
          onEnd();
          resolve();
        }
      },
      { once: true },
    );
  });
  const end = async (): Promise<void> => {
    if (isActive) {
      await session.end().catch(() => undefined);
    }

    await ended;
  };
  overlay.exit.addEventListener('click', () => {
    void end();
  });

  try {
    const { presentGlbInArSession } = await import('#components/cad/ar-webxr-scene.js');
    const dispose = await presentGlbInArSession(session, glb, {
      onPlaced() {
        overlay.hint.textContent = movedHint;
      },
    });
    // oxlint-disable-next-line @typescript-eslint/no-unnecessary-condition -- the session's end event clears isActive while the scene loads
    if (isActive) {
      disposeScene = dispose;
    } else {
      dispose();
    }
  } catch (error) {
    // oxlint-disable-next-line @typescript-eslint/no-unnecessary-condition -- the session's end event clears isActive while the scene loads
    if (!isActive) {
      // Exit AR or the system ended the session while the model loaded: that is a return, not a failure.
      return { isActive: () => false, end };
    }

    await end();
    throw error;
  }

  return { isActive: () => isActive, end };
}
