import type { ActorRefFrom } from 'xstate';
import type { ScreenshotOverlay } from '@taucad/types';
import type { cadMachine } from '#machines/cad.machine.js';
import { getIconIdForFilename } from '#components/icons/file-extension-icon.js';

type CadActorRef = ActorRefFrom<typeof cadMachine>;

/**
 * Build a {@link ScreenshotOverlay} from a per-view CAD actor ref.
 *
 * Reads the project-relative `entryPath` (for example `lib/part.ts`) and
 * resolves the matching sprite icon via the same priority chain the file tree / editor tabs use
 * ({@link getIconIdForFilename}). Returns `undefined` when the CAD machine
 * has no file loaded so the screenshot pipeline simply skips stamping rather
 * than rendering a partial chip.
 *
 * Centralising the resolution here keeps every call site a one-liner and
 * lets the screenshot machine remain decoupled from CAD state — see
 * `docs/research/screenshot-overlay-watermark-architecture.md` Finding 3.
 */
export function resolveScreenshotOverlay(cadRef: CadActorRef | undefined): ScreenshotOverlay | undefined {
  if (!cadRef) {
    return undefined;
  }
  const { entryPath } = cadRef.getSnapshot().context;
  if (!entryPath) {
    return undefined;
  }
  return buildScreenshotOverlayForPath(entryPath);
}

/**
 * Build an overlay from a raw file path. Used by call sites that already
 * have the path in hand without a CAD ref (e.g. agent RPC handlers).
 */
export function buildScreenshotOverlayForPath(filePath: string): ScreenshotOverlay {
  const iconKey = getIconIdForFilename(filePath);
  return {
    filePath,
    iconKey,
  };
}
