/**
 * Whether the primary pointer is coarse: a phone or tablet, where the tab shares a small
 * memory budget with the GPU process and every render-target byte counts against it.
 *
 * @returns `false` where media queries are unavailable (SSR, workers).
 */
export const isCoarsePointerDevice = (): boolean =>
  typeof globalThis.matchMedia === 'function' && globalThis.matchMedia('(pointer: coarse)').matches;

/**
 * The drawing-buffer pixel-ratio cap on every device. Phones keep 2 too: at 1.5 the model's edges and section
 * outlines looked soft on a 3x screen, which outweighs the extra render-target memory.
 */
const viewerPixelRatioCap = 2;

/**
 * The viewer's drawing-buffer pixel ratio for this device.
 *
 * @returns The device ratio, capped at 2.
 */
export const resolveViewerPixelRatio = (): number => Math.min(globalThis.devicePixelRatio, viewerPixelRatioCap);
