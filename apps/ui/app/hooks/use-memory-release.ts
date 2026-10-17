/**
 * Free the projects nobody is looking at on a memory-constrained device (B-08).
 *
 * On desktop-class browsers navigation never closes a project (I22): returning
 * is instant because the kernel stayed warm. A phone cannot afford that — a
 * project left behind keeps its kernel WASM, runtime and agent workers, which
 * measured 900–1,845 MB after navigating from the editor to `/projects`
 * (D-MEAS-05). So on a constrained device, leaving a project, hiding the page
 * and `pagehide` ask the registry to close every project its policy may close
 * except the one on screen. Running, dirty or unpushed projects stay (I24).
 */

import { useEffect, useRef } from 'react';
import type { SessionsMachineEvent } from '#machines/sessions.machine.js';

type UseMemoryReleaseOptions = Readonly<{
  sessions: Readonly<{ send: (event: SessionsMachineEvent) => void }>;
  /** The project on screen, or `undefined` off the editor. */
  focusedProjectId: string | undefined;
  /** Whether this device is memory-constrained (`isMemoryConstrainedDevice`). */
  constrained: boolean;
}>;

const releaseEvent = (keepProjectId: string | undefined): SessionsMachineEvent =>
  keepProjectId === undefined ? { type: 'releaseMemory' } : { type: 'releaseMemory', keepProjectId };

/**
 * Bind the memory policy to focus changes and page visibility.
 *
 * @param options - The registry, the focused project and the device's memory class.
 */
export function useMemoryRelease({ sessions, focusedProjectId, constrained }: UseMemoryReleaseOptions): void {
  const focusedRef = useRef(focusedProjectId);

  useEffect(() => {
    focusedRef.current = focusedProjectId;
    if (constrained) {
      sessions.send(releaseEvent(focusedProjectId));
    }
  }, [constrained, focusedProjectId, sessions]);

  useEffect(() => {
    if (!constrained) {
      return undefined;
    }
    const release = (): void => {
      sessions.send(releaseEvent(focusedRef.current));
    };
    const onVisibilityChange = (): void => {
      if (document.visibilityState === 'hidden') {
        release();
      }
    };
    document.addEventListener('visibilitychange', onVisibilityChange);
    globalThis.addEventListener('pagehide', release);
    return () => {
      document.removeEventListener('visibilitychange', onVisibilityChange);
      globalThis.removeEventListener('pagehide', release);
    };
  }, [constrained, sessions]);
}
