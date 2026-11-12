/**
 * The world conventions the viewer moves geometry between, without Three.js, so headless machines can import them.
 *
 * @module
 */

/**
 * The glTF world convention: Y up, Z forward, one metre per unit.
 * @public
 */
export const canonicalGltfWorld = { up: '+y', forward: '+z', metersPerUnit: 1 } as const;
/**
 * Tau's world convention: Z up, negative Y forward, one metre per unit.
 * @public
 */
export const tauWorld = { up: '+z', forward: '-y', metersPerUnit: 1 } as const;
