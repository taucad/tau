/**
 * Viewer parity file layout, shared by the viewer references, the WASM pass in Chromium and the Node gate. No imports:
 * the gate's config loads it before any workspace package.
 */

/** A nanoraster build the gate renders through. @public */
export type ViewerParityBackend = 'native' | 'wasm';

/** Every nanoraster build the gate renders through: the native addon (desktop, CLI, MCP) and WASM (the web app). */
export const viewerParityBackends: readonly ViewerParityBackend[] = ['native', 'wasm'];

/**
 * File name of a viewer reference's metadata (camera, size, backend) in a fixture's reference directory; the frame is
 * the PNG of the same stem.
 *
 * @param ao - Whether the viewer ran its ambient occlusion.
 * @returns The JSON file name.
 */
export const viewerParityReferenceName = (ao: boolean): string => `viewer.webgpu.${ao ? 'ao-on' : 'ao-off'}.json`;

/**
 * File name of a nanoraster render in a fixture's output directory.
 *
 * @param backend - The nanoraster build.
 * @param ao - Whether ambient occlusion is on.
 * @returns The PNG file name.
 */
export const viewerParityRenderName = (backend: ViewerParityBackend, ao: boolean): string =>
  `nanoraster.${backend}.${ao ? 'ao-on' : 'ao-off'}.png`;

/** File name of the WASM pass's record (nanoraster source, adapter, browser) in a fixture's output directory. */
export const viewerParityWasmRecordName = 'nanoraster.wasm.json';
