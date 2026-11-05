import { resolveViewerAoRadiusCssPixels, viewerRenderProfile } from '@taucad/types/constants/viewer-render-profile';
import type { ViewerToneMapping } from '@taucad/types/constants/viewer-render-profile';

/**
 * Diagnostic controls shared by the production viewport and calibration captures.
 *
 * @public
 */
export type PostProcessingSettings = Readonly<{
  /** Execute the AO estimator. False keeps beauty and tone mapping and ignores displayMode. */
  aoEnabled: boolean;
  /** CSS-pixel radius, or 1% of the viewport diagonal with a four-device-pixel minimum. */
  radiusCssPixels: number | 'viewport';
  /** Apply visibility to scene radiance or to tone-mapped linear display RGB. */
  aoCompositeStage: 'scene' | 'display';
  /** WebGL/N8AO visibility exponent. Zero leaves the surface unoccluded. */
  intensity: number;
  /** Node WebGPU/WebGL2 GTAO visibility exponent, configured independently from denoised N8AO. */
  gtaoIntensity: number;
  /** N8AO's screen-space distance attenuation, expressed as a fraction of its radius. */
  distanceFalloff: number;
  /** GTAO's independent distance attenuation; its units differ from N8AO's control. */
  gtaoDistanceFalloff: number;
  /** WebGL-only diagnostic; production stays full resolution pending image/performance acceptance. */
  webglHalfResolution: boolean;
  /** WebGL's existing depth-aware denoiser footprint, measured in CSS pixels. */
  webglDenoiseRadiusCssPixels: number;
  /** AO-only encodes the visibility factor as sRGB, bypassing exposure and tone mapping. */
  displayMode: 'combined' | 'ao' | 'no-ao';
  /** Final display transform; exposure is controlled by the renderer separately. */
  toneMapping: ViewerToneMapping;
}>;

/**
 * Production defaults; calibration changes never replace authored material factors. The GTAO, radius and tone-mapping
 * values come from the viewer render profile that captures also read.
 *
 * @public
 */
export const defaultPostProcessingSettings: PostProcessingSettings = {
  aoEnabled: true,
  radiusCssPixels: viewerRenderProfile.ambientOcclusion.radiusCssPixels,
  aoCompositeStage: 'display',
  intensity: 3,
  gtaoIntensity: viewerRenderProfile.ambientOcclusion.intensity,
  distanceFalloff: 0.2,
  gtaoDistanceFalloff: viewerRenderProfile.ambientOcclusion.distanceFalloff,
  webglHalfResolution: false,
  webglDenoiseRadiusCssPixels: 3,
  displayMode: 'combined',
  toneMapping: viewerRenderProfile.toneMapping,
};

/**
 * Resolve the common screen-space radius before adapting it to either estimator.
 *
 * @public
 */
export const resolveAoRadiusCssPixels = (
  radius: PostProcessingSettings['radiusCssPixels'],
  viewport: { readonly width: number; readonly height: number; readonly dpr: number },
): number => resolveViewerAoRadiusCssPixels(radius, viewport);
