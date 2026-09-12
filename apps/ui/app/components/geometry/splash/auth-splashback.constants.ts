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

/** Circular pitch of both gears, matching `gear.jscad.js` defaults (millimetres) */
export const circularPitch = 5;

/** Pitch radius of the 12-tooth gear */
export const pitchRadius12 = (gear12Teeth * circularPitch) / (2 * Math.PI);

/** Pitch radius of the 8-tooth gear */
export const pitchRadius8 = (gear8Teeth * circularPitch) / (2 * Math.PI);

/**
 * Assembly position of the 12-tooth gear along x.
 *
 * The pair sits at the exact meshing centre distance (`pitchRadius12 + pitchRadius8`)
 * either way; what these offsets choose is where that pair sits in frame. Centring the
 * two *axes* leaves the assembly visibly off-centre, because gear12 is the larger of the
 * two and its teeth then overhang the left edge. Balancing the **outer** circles instead
 * puts each gear's rim the same distance from the origin.
 */
export const gear12AssemblyOffsetX = -pitchRadius8;

/** Assembly position of the 8-tooth gear along x (see {@link gear12AssemblyOffsetX}) */
export const gear8AssemblyOffsetX = pitchRadius12;

/**
 * Rotational phase of the 8-tooth gear so its teeth fall into the 12-tooth gear's
 * gaps. Hand-tuned against the generated involute profiles; verified as the
 * maximum-clearance phase over a full revolution.
 */
export const gear8PhaseOffset = (1.9 * Math.PI) / gear8Teeth;

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
 * The visualization camera sits at z=45 with fov=45°, giving a visible width of
 * ~37 units at z=0. A radius of 30 keeps particles "from all around" while
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
