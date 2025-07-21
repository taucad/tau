/**
 * Constants related to parameter characteristics
 * This file centralizes terms used to identify specific parameter types
 */

/**
 * Terms that indicate a parameter represents dimensions & measurements
 */
export const dimensionTerms = [
  'width',
  'height',
  'radius',
  'diameter',
  'thickness',
  'depth',
  'length',
  'scale',
  'size',
  'offset',
  'gap',
  'distance',
  'margin',
  'clearance',
];

/**
 * Terms that indicate a parameter modifies shapes
 */
export const shapeModifierTerms = [
  'rounded',
  'taper',
  'bevel',
  'chamfer',
  'fillet',
  'curvature',
  'smoothness',
  'resolution',
];

/**
 * Terms that indicate a parameter represents a count or quantity
 * These parameters should display a "×" (times) icon instead of a unit
 */
export const countTerms = [
  'count',
  'number',
  'num',
  'quantity',
  'amount',
  'frequency',
  'rows',
  'columns',
  'cols',
  'cells',
];

/**
 * Terms that indicate a parameter represents an angle
 * These parameters should display an angle icon
 */
export const angleTerms = ['angle', 'rotation', 'radians', 'degrees', 'tilt', 'orientation', 'slope', 'twist'];

/**
 * Terms that indicate a parameter is unitless (dimensionless values)
 * These parameters should display a hash icon to indicate they are pure numbers
 */
export const unitlessTerms = [
  'resolution',
  'quality',
  'detail',
  'factor',
  'ratio',
  'multiplier',
  'coefficient',
  'level',
  'grade',
  'step',
  'steps',
  'segments',
  'facets',
  'subdivision',
  'divisions',
  'precision',
  'sampling',
];

/**
 * Terms that indicate a parameter relates to positioning
 */
export const positioningTerms = ['position', 'alignment', 'elevation', 'inset'];

/**
 * Terms that indicate a parameter relates to direction or location
 */
export const directionTerms = ['inner', 'outer', 'top', 'bottom', 'side', 'front', 'back', 'edge', 'corner', 'center'];

/**
 * Terms that indicate a parameter relates to material properties
 */
export const materialTerms = ['color', 'opacity', 'density', 'weight'];

/**
 * Terms that indicate a parameter controls inclusion or exclusion
 */
export const inclusionTerms = [
  'include',
  'exclude',
  'enable',
  'disable',
  'show',
  'hide',
  'add',
  'remove',
  'with',
  'without',
];

/**
 * Common general terms that should be given lower priority when forming groups
 * These appear in many parameters but are less specific
 */
export const commonGeneralTerms = [
  'total',
  'default',
  'main',
  'primary',
  'secondary',
  'common',
  'standard',
  'general',
  'global',
];

/**
 * All descriptor terms combined - these should not form their own categories
 */
export const descriptorTerms = [
  ...dimensionTerms,
  ...shapeModifierTerms,
  ...countTerms,
  ...angleTerms,
  ...unitlessTerms,
  ...positioningTerms,
  ...directionTerms,
  ...materialTerms,
  ...inclusionTerms,
];

/**
 * Check if a parameter name contains any count terms
 *
 * @param parameterName - The parameter name to check
 * @returns Whether the parameter is a count parameter
 */
export const isCountParameter = (parameterName: string): boolean => {
  const normalizedName = parameterName.toLowerCase();
  return countTerms.some((term) => normalizedName.includes(term));
};

/**
 * Check if a parameter name contains any angle terms
 *
 * @param parameterName - The parameter name to check
 * @returns Whether the parameter is an angle parameter
 */
export const isAngleParameter = (parameterName: string): boolean => {
  const normalizedName = parameterName.toLowerCase();
  return angleTerms.some((term) => normalizedName.includes(term));
};

/**
 * Check if a parameter name contains any unitless terms
 *
 * @param parameterName - The parameter name to check
 * @returns Whether the parameter is a unitless parameter
 */
export const isUnitlessParameter = (parameterName: string): boolean => {
  const normalizedName = parameterName.toLowerCase();
  return unitlessTerms.some((term) => normalizedName.includes(term));
};
