/**
 * Common 3D descriptor terms that should not form their own categories
 * These should be associated with the feature they describe
 */
import * as pluralize from 'pluralize';

const groupingModifiers = new Set([
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
  'rounded',
  'taper',
  'bevel',
  'chamfer',
  'fillet',
  'curvature',
  'smoothness',
  'resolution',
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
  'angle',
  'angular',
  'rotation',
  'radians',
  'degrees',
  'tilt',
  'orientation',
  'slope',
  'twist',
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
  'opacity',
  'transparency',
  'position',
  'alignment',
  'elevation',
  'inset',
  'inner',
  'outer',
  'top',
  'bottom',
  'side',
  'front',
  'back',
  'edge',
  'corner',
  'center',
  'color',
  'density',
  'weight',
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
]);

const generalGroupingTerms = new Set([
  'total',
  'default',
  'main',
  'primary',
  'secondary',
  'common',
  'standard',
  'general',
  'global',
]);

/**
 * Normalize a plural word to its singular form using the pluralize library
 *
 * @param word - The word to normalize
 * @returns The normalized singular form
 */
export const normalizePlural = (word: string): string => {
  return pluralize.singular(word.toLowerCase());
};

/**
 * Extract meaningful terms from a parameter name
 *
 * @param parameterName - The parameter name to analyze
 * @returns Array of meaningful terms
 */
export const extractTerms = (parameterName: string): string[] => {
  // Convert camelCase/PascalCase to space-separated words
  const spaceSeparated = parameterName.replaceAll(/([\da-z])([A-Z])/g, '$1 $2').toLowerCase();

  // Split into words and filter out common words and single characters
  const words = spaceSeparated
    .split(/[\s_-]+/)
    .filter((word) => word.length > 1 && !['the', 'a', 'an', 'and', 'or', 'of', 'to', 'in', 'for'].includes(word));

  return words;
};

/**
 * Extract primary term from a parameter name (usually the first non-descriptor term)
 * This helps identify the main feature that a parameter belongs to
 * Normalizes plural forms to singular to group related parameters together
 *
 * @param parameterName - The parameter name to analyze
 * @returns The normalized primary term
 */
export const extractPrimaryTerm = (parameterName: string): string | undefined => {
  const terms = extractTerms(parameterName);

  // First look for a non-descriptor, non-common term
  for (const term of terms) {
    if (!isDescriptorTerm(term) && !isCommonGeneralTerm(term)) {
      return normalizePlural(term);
    }
  }

  // If not found, take the first non-descriptor term
  for (const term of terms) {
    if (!isDescriptorTerm(term)) {
      return normalizePlural(term);
    }
  }

  // Fallback to the first term
  return terms[0] ? normalizePlural(terms[0]) : undefined;
};

/**
 * Determine if a term is a descriptor term that shouldn't form its own category
 *
 * @param term - The term to check
 * @returns Whether the term is a descriptor term
 */
export const isDescriptorTerm = (term: string): boolean => {
  return groupingModifiers.has(term.toLowerCase());
};

/**
 * Determine if a term is a common general term that should be given lower priority
 *
 * @param term - The term to check
 * @returns Whether the term is a common general term
 */
export const isCommonGeneralTerm = (term: string): boolean => {
  return generalGroupingTerms.has(term.toLowerCase());
};

/**
 * Group parameters based on semantic analysis of their names
 * This implementation focuses on creating separate categories for each primary term
 * that appears in multiple parameters
 *
 * @param parameterEntries - Array of [key, value] entries to categorize
 * @returns An object with group names as keys and parameter entries as values
 */
export const categorizeParameters = (
  parameterEntries: Array<[string, unknown]>,
): Record<string, Array<[string, unknown]>> => {
  // Extract primary terms from all parameter names
  const parameterToTerms = new Map<string, string[]>();
  const parameterToPrimaryTerm = new Map<string, string>();
  const primaryTermCount = new Map<string, number>();

  // First pass: extract terms and identify primary terms
  for (const [key] of parameterEntries) {
    const terms = extractTerms(key);
    parameterToTerms.set(key, terms);

    // Identify the primary term for this parameter
    const primaryTerm = extractPrimaryTerm(key);
    if (primaryTerm) {
      parameterToPrimaryTerm.set(key, primaryTerm);

      // Count occurrences of each primary term
      primaryTermCount.set(primaryTerm, (primaryTermCount.get(primaryTerm) ?? 0) + 1);
    }
  }

  // Create a category for each significant primary term
  // A term is significant if it appears as the primary term in at least one parameter
  // and is not a descriptor or common general term
  let groups: Record<string, Array<[string, unknown]>> = {};

  // Create categories for each significant primary term
  for (const [term, count] of primaryTermCount.entries()) {
    if (!isDescriptorTerm(term) && count > 0) {
      const groupName = term.charAt(0).toUpperCase() + term.slice(1);
      groups[groupName] = [];
    }
  }

  // Add "General" group for anything that doesn't match
  const generalGroup: Array<[string, unknown]> = [];

  // Assign parameters to groups based on their primary term
  for (const entry of parameterEntries) {
    const [key] = entry;
    const primaryTerm = parameterToPrimaryTerm.get(key);

    if (primaryTerm) {
      const groupName = primaryTerm.charAt(0).toUpperCase() + primaryTerm.slice(1);

      if (groups[groupName]) {
        groups[groupName].push(entry);
      } else {
        // If no category exists for this primary term, assign to "General"
        generalGroup.push(entry);
      }
    } else {
      // If no primary term, assign to "General"
      generalGroup.push(entry);
    }
  }

  groups = {
    // eslint-disable-next-line @typescript-eslint/naming-convention -- naming convention.
    General: generalGroup,
    ...groups,
  };

  // Remove empty groups
  return Object.fromEntries(Object.entries(groups).filter(([_, entries]) => entries.length > 0));
};
