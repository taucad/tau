import { analyzeGlb as analyzeGeoSpecGlb } from 'geospec/mesh';
import type { GeometryStats } from '#geometry/types.js';

/**
 * Analyze GLB mesh bytes using GeoSpec while preserving the legacy
 * `@taucad/testing` export.
 *
 * @param glb - Binary GLB bytes.
 * @returns Mesh statistics used by legacy measurement requirements.
 * @public
 */
export const analyzeGlb = async (glb: Uint8Array<ArrayBuffer>): Promise<GeometryStats> => analyzeGeoSpecGlb(glb);
