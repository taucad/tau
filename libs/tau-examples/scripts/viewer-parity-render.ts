/**
 * Viewer parity render helpers shared by the Node gate (nanoraster's native addon) and the browser pass (nanoraster's
 * WASM build, as the web app's image worker runs it): the parity frame, the image options Tau's editor capture sends
 * for a viewer camera, and the render call the image transcoder makes. Nothing here may reach Node built-ins.
 */

import { buildViewerCaptureImageOptions } from '@taucad/agent-tools/capture';
import { imageEdgeSchemas, toNanorasterCamera } from '@taucad/image';

/** The parity frame: the viewer's reference viewport in CSS pixels at pixel ratio 1. */
export const viewerParitySize = { width: 768, height: 576 } as const;
/** The dark-scheme capture background. */
const captureBackground = '#242424';
/** Tau's root frame, as every capture sends it. */
const tauWorld = { up: '+z', forward: '-y', unit: 'meter' } as const;

/** The viewer camera a reference was captured with: Tau's renderer-neutral camera state. */
export type ViewerParityCameraState = Parameters<typeof toNanorasterCamera>[0]['cameraState'];

/** The validated single-image options, exactly as the transcoder receives them. @public */
export type ViewerParityImageOptions = ReturnType<typeof imageEdgeSchemas.png.parse>;

/**
 * The image export options Tau's editor capture sends for a viewer camera at the parity frame
 * (`apps/ui/app/services/headless-capture.ts`): the viewer render profile through `buildViewerCaptureImageOptions`,
 * the dark-scheme background, Tau's world, and the viewer camera through `toNanorasterCamera`, validated by the image
 * transcoder's own schema. With `ao: false` only the AO intensity changes, to 0: the AO-off diagnostic split.
 *
 * @param input - The viewer camera and whether ambient occlusion is on.
 * @param input.camera - The viewer camera state of the reference frame.
 * @param input.ao - Whether ambient occlusion is on.
 * @returns The validated single-image options.
 */
export const buildViewerParityImageOptions = ({
  camera,
  ao,
}: {
  camera: ViewerParityCameraState;
  ao: boolean;
}): ViewerParityImageOptions => {
  const look = buildViewerCaptureImageOptions({ ...viewerParitySize, colorScheme: 'dark' });
  return imageEdgeSchemas.png.parse({
    mode: 'single',
    ...viewerParitySize,
    ...look,
    ao: ao ? look.ao : { ...look.ao, intensity: 0 },
    background: captureBackground,
    world: tauWorld,
    camera: toNanorasterCamera({ cameraState: camera }),
  });
};

/**
 * The part of nanoraster's module the gate calls. Structural, because tau-examples reaches nanoraster only through
 * `@taucad/image` and the module under test may be a checkout of a newer version than the installed types.
 */
export type ViewerParityNanorasterModule = Readonly<{
  renderImages: (
    glb: Uint8Array<ArrayBuffer>,
    options: Readonly<Record<string, unknown>>,
  ) => Promise<ReadonlyArray<{ readonly file: { readonly bytes: Uint8Array<ArrayBuffer> } }>>;
  describeAdapter: () => Promise<unknown>;
}>;

/**
 * Render the options as the image transcoder does for a single image (`image.transcoder.ts`), with every
 * viewer-parity option passed through: the transcoder withholds them only while the installed nanoraster predates
 * them.
 *
 * @param renderer - The nanoraster module.
 * @param glb - The fixture bytes.
 * @param options - Options from {@link buildViewerParityImageOptions}.
 * @returns The PNG bytes.
 */
export const renderViewerParityImage = async (
  renderer: ViewerParityNanorasterModule,
  glb: Uint8Array<ArrayBuffer>,
  options: ViewerParityImageOptions,
): Promise<Uint8Array<ArrayBuffer>> => {
  if (options.mode !== 'single') {
    throw new TypeError('Viewer parity renders single images');
  }
  const { mode: _mode, camera, label, sections: _sections, ...renderOptions } = options;
  const [image] = await renderer.renderImages(glb, {
    format: 'png',
    ...renderOptions,
    views: [{ id: 'single', camera, label }],
  });
  if (!image) {
    throw new Error('nanoraster returned no image');
  }
  return image.file.bytes;
};
