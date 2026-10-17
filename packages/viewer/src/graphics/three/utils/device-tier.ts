/**
 * Whether the primary pointer is coarse: a phone or tablet, where the tab shares a small
 * memory budget with the GPU process and every render-target byte counts against it.
 *
 * @returns `false` where media queries are unavailable (SSR, workers).
 */
export const isCoarsePointerDevice = (): boolean =>
  typeof globalThis.matchMedia === 'function' && globalThis.matchMedia('(pointer: coarse)').matches;

/** The drawing-buffer pixel-ratio cap on a fine-pointer display. */
const desktopPixelRatioCap = 2;
/** At 1.5 every drawing-buffer-sized target holds 44% fewer pixels than at 2. */
const coarsePointerPixelRatioCap = 1.5;

/**
 * The viewer's drawing-buffer pixel ratio for this device.
 *
 * @returns The device ratio, capped at 2, or at 1.5 on a coarse-pointer device.
 */
export const resolveViewerPixelRatio = (): number =>
  Math.min(globalThis.devicePixelRatio, isCoarsePointerDevice() ? coarsePointerPixelRatioCap : desktopPixelRatioCap);
