/**
 * The Tau viewer's render profile: every post-processing, lighting and edge value that decides how the interactive
 * viewer draws a model. The viewer reads these values, and every headless capture builds its image options from them,
 * so a capture follows the viewer by construction instead of by copied literals.
 *
 * Owner: `docs/research/nanoraster-viewer-parity-charter.md` (W5, invariant I3). Changing a value here changes the
 * viewer's pixels and every capture's bytes: bump the image transcoder version with it.
 */

/**
 * A viewer colour scheme.
 *
 * @public
 */
export type ViewerColorScheme = 'light' | 'dark';

/**
 * A Three.js tone-mapping operator the viewer can apply as its final display transform.
 *
 * @public
 */
export type ViewerToneMapping = 'aces' | 'neutral' | 'linear' | 'none';

/**
 * One rectangular studio light card, placed relative to the scene radius `r`. Its radiance is the studio background
 * radiance plus `intensity` times the studio fill intensity.
 *
 * @public
 */
export type ViewerStudioFillCard = Readonly<{
  /** Fill radiance factor, multiplied by the studio fill intensity. */
  intensity: number;
  /** World position as multiples of `r`. */
  position: readonly [x: number, y: number, z: number];
  /** XYZ Euler rotation in radians; omitted for an unrotated card facing +Z. */
  rotation?: readonly [x: number, y: number, z: number];
  /** Square edge length as a multiple of `r`. */
  size: number;
}>;

/**
 * The viewer's render profile. Values are the production defaults; the viewer's settings may override some of them at
 * run time (for example the calibration route), captures never do.
 *
 * @public
 */
export const viewerRenderProfile = {
  /** Three r184 GTAO as the viewer runs it on its WebGPU and WebGL2 node backends. */
  ambientOcclusion: {
    /** Visibility exponent applied to the GTAO estimate. */
    intensity: 0.75,
    /** GTAO distance attenuation. */
    distanceFalloff: 1,
    /** Sampling radius: `'viewport'` resolves through {@link resolveViewerAoRadiusCssPixels}. */
    radiusCssPixels: 'viewport',
    /** Fraction of the CSS viewport diagonal used as the `'viewport'` radius. */
    radiusViewportFraction: 0.01,
    /** Smallest `'viewport'` radius, in device pixels. */
    radiusMinimumDevicePixels: 4,
    /** GTAO thickness as a multiple of the world-space radius. */
    thicknessRatio: 1 / 0.09,
    /** Denoise depth acceptance as a fraction of the world-space radius. */
    denoiseDepthTolerance: 0.1,
    /** GTAO samples per pixel. */
    samples: 16,
    /** AO estimate and denoise resolution as a fraction of the drawing buffer. */
    resolutionScale: 0.5,
  },
  /** Final display transform. */
  toneMapping: 'neutral',
  /** Linear exposure applied before tone mapping. */
  exposure: 1,
  lighting: {
    /** Reflection environment: Three.js's neutral `RoomEnvironment`. */
    environment: 'room',
    /** Scene environment intensity. */
    environmentIntensity: 1,
    /** Flat ambient light intensity (Three.js units). */
    ambientIntensity: 0.1,
    /**
     * Camera-relative directional key. The light sits `rightOffset` and `upOffset` scene radii off the camera and aims
     * `targetDistance` radii ahead of it, skewed by the target offsets, so its view-space direction is fixed.
     */
    headlamp: {
      intensity: 1.5,
      rightOffset: 2,
      upOffset: 2,
      targetRightSkew: 0,
      targetUpSkew: 0,
      targetDistance: 2,
    },
    /** Environment cubemap resolution in pixels, by device class. */
    environmentResolution: {
      default: 512,
      coarsePointer: 256,
      softwareRasterizer: 64,
    },
    /** The `'studio'` Lightformer environment, selectable through the viewer's lighting settings. */
    studio: {
      keyIntensity: 64,
      /** Key card edge length as a multiple of the scene radius. */
      keySize: 1.2,
      /** Key card position as multiples of the scene radius. */
      keyPosition: [1, 1, 1],
      fillIntensity: 1,
      /** Minimum linear radiance across the studio; added to every card. */
      backgroundIntensity: 0,
      /** Broad, low-energy cards that keep metallic and back-facing surfaces readable: left, top, ground, back. */
      fills: [
        { intensity: 1.2, position: [-3, 1, 0.5], rotation: [Math.PI / 8, Math.PI / 3, 0], size: 4 },
        { intensity: 0.25, position: [0, 3, 0], rotation: [Math.PI / 2, 0, 0], size: 3 },
        { intensity: 1.5, position: [2, -3, 0], rotation: [-Math.PI / 2, 0, 0], size: 6 },
        { intensity: 8, position: [2, -3, 4], size: 2 },
      ],
    },
  },
  edges: {
    /** Characteristic-edge stroke width in CSS pixels. */
    lineWidthCssPixels: 1,
  },
  /** Per-scheme factors. Dark mode raises the ambient floor while preserving the key and reflections. */
  colorSchemes: {
    light: {
      /** Overall multiplier on every light. */
      lightIntensityScale: 1,
      /** Multiplier on the ambient floor. */
      ambientBoost: 1,
      /** Characteristic-edge tint, sRGB hex: black reads over matcap-lit surfaces on light backgrounds. */
      edgeColor: 0x00_00_00,
    },
    dark: {
      lightIntensityScale: 1,
      ambientBoost: 1.15,
      /** Neutral grey `oklch(0.62 0 0deg)`: readable on dimmed faces, below near-white glare against `#171717`. */
      edgeColor: 0x86_86_86,
    },
  },
} as const;

/**
 * Resolve the viewer's AO sampling radius in CSS pixels: a fixed radius, or for `'viewport'` the configured fraction
 * of the viewport diagonal with a minimum of a few device pixels.
 *
 * @param radius - A CSS-pixel radius or `'viewport'`.
 * @param viewport - The viewport size in CSS pixels and its device pixel ratio.
 * @returns The radius in CSS pixels.
 * @public
 */
export const resolveViewerAoRadiusCssPixels = (
  radius: number | 'viewport',
  viewport: { readonly width: number; readonly height: number; readonly dpr: number },
): number => {
  const { radiusViewportFraction, radiusMinimumDevicePixels } = viewerRenderProfile.ambientOcclusion;
  // Onshape's half-size AO target uses max(1% of its diagonal, 2 texels).
  // Converting back to full-resolution CSS pixels gives this four-device-pixel floor.
  return radius === 'viewport'
    ? Math.max(
        Math.hypot(viewport.width, viewport.height) * radiusViewportFraction,
        radiusMinimumDevicePixels / viewport.dpr,
      )
    : radius;
};
