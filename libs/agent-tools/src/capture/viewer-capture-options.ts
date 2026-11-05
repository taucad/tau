/**
 * The viewer's look as image export options: every headless capture (thumbnails, the agent `screenshot`, the editor's
 * capture, example thumbnails) builds its edge, ambient-occlusion, tone-mapping and lighting options here, from the
 * viewer render profile the viewer itself reads. Each value is passed explicitly; none is left to the renderer's
 * defaults.
 *
 * @module
 */

import { resolveViewerAoRadiusCssPixels, viewerRenderProfile } from '@taucad/types/constants/viewer-render-profile';
import type { ViewerColorScheme, ViewerToneMapping } from '@taucad/types/constants/viewer-render-profile';

/**
 * The viewer frame a capture reproduces, in CSS pixels: the parity reference frame. A capture of another size draws
 * that frame at a proportionally higher device pixel ratio, as the viewer does on a denser display.
 *
 * @public
 */
export const viewerCaptureReferenceViewport = { width: 768, height: 576 } as const;

/** Inputs of {@link buildViewerCaptureImageOptions}. @public */
export type ViewerCaptureImageOptionsInput = Readonly<{
  /** Output width in pixels. */
  width: number;
  /** Output height in pixels. */
  height: number;
  /** The viewer colour scheme to reproduce. Captures use `'dark'`, the parity reference. */
  colorScheme: ViewerColorScheme;
  /**
   * Width in CSS pixels the image is shown at, for a thumbnail card. When set, edges take the card line weight
   * (`edges.cardLineWidthCssPixels`) at `width / displayWidth` output pixels per CSS pixel instead of the viewer's.
   */
  displayWidth?: number;
}>;

/** The look-defining image export options of a capture. @public */
export type ViewerCaptureImageOptions = {
  /** Edge width in output pixels: the viewer's CSS-pixel width at the capture's pixel ratio, or a card's. */
  lineWidth: number;
  /** The colour scheme's edge colour, sRGB `#RRGGBB`. */
  lineColor: string;
  ao: {
    radiusPixels: number;
    intensity: number;
    distanceFalloff: number;
    thicknessRatio: number;
    denoiseDepthTolerance: number;
    samples: number;
    resolutionScale: number;
  };
  toneMapping: ViewerToneMapping;
  lighting: {
    /** The viewer's camera-relative headlamp. */
    headlamp: { intensity: number; rightOffset: number; upOffset: number };
    /** Directional lights beside the headlamp: none. */
    lights: Array<{ direction: [number, number, number]; color: [number, number, number] }>;
    ambient: number;
    /** The viewer's environment at its intensity; no cards is nanoraster's neutral room. */
    environment: { intensity: number };
    space: 'view';
    exposure: number;
  };
};

/**
 * The nanoraster environment for each viewer environment it reproduces. Three.js's neutral `RoomEnvironment` is
 * nanoraster's card-less environment, the room its `'studio'` name also selects; only the object form carries the
 * intensity, so captures send that.
 */
const nanorasterEnvironments = {
  room: (intensity: number): ViewerCaptureImageOptions['lighting']['environment'] => ({ intensity }),
} as const;

/** The renderer aims its headlamp this many scene radii ahead of the camera: view direction `[right, up, 2]`. */
const nanorasterHeadlampAimRadii = 2;

const toSrgbHex = (color: number): string => `#${color.toString(16).padStart(6, '0')}`;

/**
 * Device pixels per CSS pixel of a capture: its diagonal over the reference frame's diagonal.
 *
 * @param size - Output size in pixels.
 * @returns The capture's pixel ratio; 1 at 768×576, 2 at 1536×1152.
 * @public
 */
export const resolveViewerCapturePixelRatio = (size: Readonly<{ width: number; height: number }>): number =>
  Math.hypot(size.width, size.height) /
  Math.hypot(viewerCaptureReferenceViewport.width, viewerCaptureReferenceViewport.height);

/**
 * Image export options that reproduce the viewer's edges, ambient occlusion, tone mapping and lighting for one
 * output size and colour scheme.
 *
 * Lighting maps the viewer's Three.js rig onto nanoraster's, every value explicit: the headlamp keeps its intensity
 * and its view direction (its offset from its target, rescaled to nanoraster's fixed two-radius aim); no other
 * directional light; the ambient intensity is divided by π (nanoraster multiplies the diffuse colour directly,
 * Three.js through the Lambert BRDF); the viewer's neutral `RoomEnvironment` at the viewer's environment intensity.
 *
 * @param input - Output size and colour scheme.
 * @returns Options to spread into a raster image export.
 * @public
 *
 * @example <caption>A dark-scheme thumbnail at 1536×1152</caption>
 * ```typescript
 * import { buildViewerCaptureImageOptions } from '@taucad/agent-tools/capture';
 *
 * const look = buildViewerCaptureImageOptions({ width: 1536, height: 1152, colorScheme: 'dark' });
 * // look.lineWidth === 2, look.lineColor === '#868686'
 * ```
 *
 * @example <caption>A 1536 px card thumbnail shown at 512 px</caption>
 * ```typescript
 * import { buildViewerCaptureImageOptions } from '@taucad/agent-tools/capture';
 *
 * const card = buildViewerCaptureImageOptions({ width: 1536, height: 1536, colorScheme: 'dark', displayWidth: 512 });
 * // card.lineWidth === 6
 * ```
 */
export const buildViewerCaptureImageOptions = ({
  width,
  height,
  colorScheme,
  displayWidth,
}: ViewerCaptureImageOptionsInput): ViewerCaptureImageOptions => {
  const { ambientOcclusion, lighting, edges, toneMapping, exposure } = viewerRenderProfile;
  const scheme = viewerRenderProfile.colorSchemes[colorScheme];
  const pixelRatio = resolveViewerCapturePixelRatio({ width, height });
  const radiusCssPixels = resolveViewerAoRadiusCssPixels(ambientOcclusion.radiusCssPixels, {
    width: width / pixelRatio,
    height: height / pixelRatio,
    dpr: pixelRatio,
  });
  const { headlamp } = lighting;
  // The viewer aims its headlamp `targetDistance` radii ahead, skewed; nanoraster at a fixed two radii. Scaling the
  // offsets keeps the view direction [right + rightSkew, up + upSkew, targetDistance] (view space: +x right, +y up,
  // +z toward the viewer).
  const aim = nanorasterHeadlampAimRadii / headlamp.targetDistance;
  return {
    lineWidth:
      displayWidth === undefined
        ? edges.lineWidthCssPixels * pixelRatio
        : edges.cardLineWidthCssPixels * (width / displayWidth),
    lineColor: toSrgbHex(scheme.edgeColor),
    ao: {
      radiusPixels: radiusCssPixels * pixelRatio,
      intensity: ambientOcclusion.intensity,
      distanceFalloff: ambientOcclusion.distanceFalloff,
      thicknessRatio: ambientOcclusion.thicknessRatio,
      denoiseDepthTolerance: ambientOcclusion.denoiseDepthTolerance,
      samples: ambientOcclusion.samples,
      resolutionScale: ambientOcclusion.resolutionScale,
    },
    toneMapping,
    lighting: {
      headlamp: {
        intensity: headlamp.intensity * scheme.lightIntensityScale,
        rightOffset: (headlamp.rightOffset + headlamp.targetRightSkew) * aim,
        upOffset: (headlamp.upOffset + headlamp.targetUpSkew) * aim,
      },
      lights: [],
      ambient: (lighting.ambientIntensity * scheme.lightIntensityScale * scheme.ambientBoost) / Math.PI,
      environment: nanorasterEnvironments[lighting.environment](
        lighting.environmentIntensity * scheme.lightIntensityScale,
      ),
      space: 'view',
      exposure,
    },
  };
};
