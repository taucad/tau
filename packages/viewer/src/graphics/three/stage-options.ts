import type { StudioLightingSettings } from '#graphics/three/utils/lights.utils.js';

/**
 * Options for the stage: lighting overrides, the camera fit margin and the initial camera rotation.
 *
 * @public
 */
export type StageOptions = {
  lighting?: Partial<StudioLightingSettings>;
  /** Fractional outer margin applied by projected-corner fitting. */
  fitMargin?: number;
  rotation?: {
    /**
     * The initial z-axis rotation of the camera in radians.
     */
    side?: number;

    /**
     * The initial xy-plane rotation of the camera in radians.
     */
    vertical?: number;
  };
};

/**
 * Default stage options: a 10% fit margin and a camera turned 45 degrees to the side and 30 degrees upwards.
 *
 * @public
 */
export const defaultStageOptions = {
  fitMargin: 0.1,
  rotation: {
    side: -Math.PI / 4, // Default rotation is 45 degrees counter-clockwise
    vertical: Math.PI / 6, // Default rotation is 30 degrees upwards
  },
} as const satisfies StageOptions;
