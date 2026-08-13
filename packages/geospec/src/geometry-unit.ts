/**
 * Geometry units accepted at GeoSpec evidence-loading boundaries.
 *
 * Loaded subjects normalize coordinates into canonical millimetres; this type
 * describes source and provenance units, not a project-wide configuration.
 *
 * @public
 */
export type GeoSpecUnit = 'mm' | 'cm' | 'm' | 'in' | 'ft' | (string & {});
