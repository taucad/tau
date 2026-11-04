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
}>;

/** The look-defining image export options of a capture. @public */
export type ViewerCaptureImageOptions = {
  /** Edge width in output pixels: the viewer's CSS-pixel width at the capture's pixel ratio. */
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
    lights: [{ direction: [number, number, number]; color: [number, number, number] }];
    ambient: number;
    environment: 'studio';
    space: 'view';
    exposure: number;
  };
};

/** The nanoraster environment for each viewer environment it reproduces. */
const nanorasterEnvironments = { room: 'studio' } as const;

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
 * Lighting maps the viewer's Three.js rig onto nanoraster's: the headlamp becomes one view-space directional light
 * along the headlamp's offset from its target; the ambient intensity is divided by π (nanoraster multiplies the
 * diffuse colour directly, Three.js through the Lambert BRDF); the viewer's neutral `RoomEnvironment` is nanoraster's
 * `'studio'` environment, captured from it.
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
 */
export const buildViewerCaptureImageOptions = ({
  width,
  height,
  colorScheme,
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
  const headlampRadiance = headlamp.intensity * scheme.lightIntensityScale;
  return {
    lineWidth: edges.lineWidthCssPixels * pixelRatio,
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
      lights: [
        {
          // View space: +x right, +y up, +z toward the viewer, which is opposite the camera's forward direction.
          direction: [
            headlamp.rightOffset + headlamp.targetRightSkew,
            headlamp.upOffset + headlamp.targetUpSkew,
            headlamp.targetDistance,
          ],
          color: [headlampRadiance, headlampRadiance, headlampRadiance],
        },
      ],
      ambient: (lighting.ambientIntensity * scheme.lightIntensityScale * scheme.ambientBoost) / Math.PI,
      environment: nanorasterEnvironments[lighting.environment],
      space: 'view',
      exposure,
    },
  };
};
