/**
 * The matchers mesh evidence answers, as the GeoSpec authoring skill lists
 * them (`packages/geospec/agent/geospec-authoring/SKILL.md`): bounds, volume,
 * surface area, connected components and watertightness. Every other
 * exact-feature matcher needs STEP BRep evidence.
 *
 * @public
 */
export const geoSpecMeshEvidenceMatchers = [
  'toHaveBoundingBox',
  'toHaveVolume',
  'toHaveSurfaceArea',
  'toHaveConnectedComponents',
  'toBeWatertight',
] as const;
