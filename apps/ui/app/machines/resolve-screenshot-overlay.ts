import type { ActorRefFrom } from 'xstate';
import type { ScreenshotOverlay } from '@taucad/types';
import type { cadMachine } from '#machines/cad.machine.js';
import { getIconIdFromExtension } from '#components/icons/file-extension-icon.js';
import { getFileExtension } from '#utils/filesystem.utils.js';

type CadActorRef = ActorRefFrom<typeof cadMachine>;

/**
 * Build a {@link ScreenshotOverlay} from a per-view CAD actor ref.
 *
 * Reads `file.filename` (the project-relative entry path, e.g. `lib/part.ts`)
 * — NOT `file.path`, which on `CadContext` is the project mount root
 * `/projects/{projectId}` and would render a useless chip like
 * `/projects/proj_OUJEN…`. Resolves the matching sprite icon via the same
 * priority chain the file tree / editor tabs use
 * ({@link getIconIdFromExtension}). Returns `undefined` when the CAD machine
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
  const { file } = cadRef.getSnapshot().context;
  if (!file?.filename) {
    return undefined;
  }
  return buildScreenshotOverlayForPath(file.filename);
}

/**
 * Build an overlay from a raw file path. Used by call sites that already
 * have the path in hand without a CAD ref (e.g. agent RPC handlers).
 */
export function buildScreenshotOverlayForPath(filePath: string): ScreenshotOverlay {
  const extension = getFileExtension(filePath);
  const iconKey = extension ? getIconIdFromExtension(extension) : undefined;
  return {
    filePath,
    iconKey,
  };
}
