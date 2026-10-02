/**
 * Render order for overlays (axes fat lines, section controls, grid) that must
 * sort above CAD geometry without using `Infinity` — some WebGPU / internal
 * sort paths choke on infinite keys and can amplify validation errors.
 */
export const topMostRenderOrder = Number.MAX_SAFE_INTEGER;
