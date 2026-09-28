/**
 * Shared parameters for the 5:2 (2.5:1) single-stage planetary gearbox.
 *
 * Ratio (ring fixed, sun input, carrier output):
 *   i = 1 + zR/zS = 1 + 72/48 = 2.5
 * Assembly condition: (zS + zR) / N = (48 + 72)/3 = 40  (integer) -> 3 planets
 * Coaxial condition:   zR = zS + 2*zP -> 72 = 48 + 2*12  (ok)
 */

// --- Gear definition (module / 20-deg involute) -------------------------------
export const MODULE = 1.0; // mm
export const PRESSURE_ANGLE = 20; // degrees
export const BACKLASH = 0.012; // rad, tooth-flank clearance (~0.69 deg)

export const Z_SUN = 48;
export const Z_PLANET = 12;
export const Z_RING = 72;
export const N_PLANETS = 3;

// Pitch radii
export const RP_SUN = (MODULE * Z_SUN) / 2; // 24
export const RP_PLANET = (MODULE * Z_PLANET) / 2; // 6
export const RP_RING = (MODULE * Z_RING) / 2; // 36

// Planet pin-circle radius (carrier)
export const CARRIER_R = RP_SUN + RP_PLANET; // 30

// --- Axial layout (z, mm) -----------------------------------------------------
export const GEAR_W = 10; // sun & planet face width  -> z in [-5, 5]
export const RING_W = 12; // ring face width          -> z in [-6, 6]

export const RING_OUTER_R = 42;

// Housing
export const HOUSE_IN_R = 42;
export const HOUSE_OUT_R = 48;
export const FLANGE_R = 58;
export const BACK_Z0 = -14; // back outer face
export const BACK_Z1 = -8; // inner face of back wall
export const WALL_Z1 = 14; // front rim of side wall
export const INPUT_BORE_D = 10.5;

// Cover
export const COVER_Z0 = 14;
export const COVER_Z1 = 19;
export const COVER_R = 50;
export const COVER_LIP_Z = 12;
export const OUTPUT_BORE_D = 12.5;

// Shafts
export const INPUT_SHAFT_D = 10;
export const INPUT_SHAFT_Z = -30;
export const OUTPUT_SHAFT_D = 12;
export const OUTPUT_SHAFT_Z = 32;

// Carrier
export const CARRIER_PLATE_R = 34;
export const CARRIER_PLATE_Z0 = 7;
export const CARRIER_PLATE_Z1 = 12;
export const PIN_D = 4;
export const PIN_Z0 = -6;
export const PIN_Z1 = 7;
export const PLANET_BORE_D = 4.4;

// Fasteners (cover -> housing)
export const N_BOLTS = 4;
export const BOLT_CIRCLE_R = 44;
export const BOLT_SHAFT_D = 4;
export const BOLT_HEAD_D = 7;
export const BOLT_HEAD_H = 3;

// Rear mounting holes
export const MOUNT_HOLE_D = 5;
export const MOUNT_CIRCLE_R = 53;
