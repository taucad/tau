/**
 * Shared constants for the auth splashback animation.
 */

// ============================================================================
// Gear Configuration
// ============================================================================

/** Number of teeth on the first gear (12-tooth) */
export const gear12Teeth = 12;

/** Number of teeth on the second gear (8-tooth) */
export const gear8Teeth = 8;

/** Gear ratio for counter-rotation (gear12Teeth / gear8Teeth) */
export const gearRatio = gear12Teeth / gear8Teeth;

// ============================================================================
// Animation Parameters
// ============================================================================

/** Number of particles for morphing animation */
export const morphPointCount = 3000;

/** Default split ratio for assembly morph (60% to gear12, 40% to gear8) */
export const assemblySplitRatio = 0.6;

/**
 * World-space radius of the "atoms" scatter cloud used as both the alpha (loading
 * convergence) and omega (unloading dispersion) point distribution.
 *
 * The visualization camera sits at z=40 with fov=45°, giving a visible width of
 * ~33 units at z=0. A radius of 30 keeps particles "from all around" while
 * remaining inside the frustum so they read as a sphere rather than streaks.
 */
export const loadingScatterRadius = 30;

// ============================================================================
// Colors
// ============================================================================

/** Primary color for gear12 (teal) */
export const gear12Color = '#14b8a6';

/** Primary color for gear8 (blue) */
export const gear8Color = '#5B8FD9';
