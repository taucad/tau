/**
 * GeoSpec AP242 profile name grammar.
 *
 * Implements the normative grammar from the master blueprint's "The GeoSpec
 * AP242 Profile" section independently of SB2's authoring-side validator.
 * Both implementations must pass the profile's shared test vectors.
 *
 * @module
 */

/**
 * One parsed segment of a selector path (`name`, `name[3]`, or selector-side
 * `name[*]`).
 *
 * @public
 */
export type SelectorPathSegment = {
  /** Bare segment name without index. */
  name: string;
  /** 1-based member index when the segment is `name[n]`. */
  index?: number;
  /** True when the segment is the selector-side wildcard `name[*]`. */
  wildcard?: boolean;
};

/**
 * Full-name regex for stored interface names per the profile: dot-joined
 * segments `[A-Za-z][A-Za-z0-9]*` each optionally carrying a 1-based index.
 * `[*]` is selector-side only and never valid in a stored name.
 *
 * @public
 */
export const storedNamePattern = /^[A-Za-z][\dA-Za-z]*(\[[1-9]\d*])?(\.[A-Za-z][\dA-Za-z]*(\[[1-9]\d*])?)*$/;

const segmentPartsPattern = /^([A-Za-z][\dA-Za-z]*)(?:\[([1-9]\d*|\*)])?$/;

/**
 * Validate a stored (artifact-side) interface or occurrence name against the
 * profile grammar.
 *
 * @param name - Candidate stored name.
 * @returns True when the name conforms to the profile grammar.
 * @public
 */
export const isValidStoredName = (name: string): boolean => storedNamePattern.test(name);

/**
 * Parse a selector-side dotted path into segments. Accepts the profile
 * grammar plus the selector-only `[*]` wildcard.
 *
 * @param path - Dotted selector path such as `headL.boltHole[*]`.
 * @returns Parsed segments, or undefined when the path does not conform.
 * @public
 */
export const parseSelectorPath = (path: string): SelectorPathSegment[] | undefined => {
  const parsed: SelectorPathSegment[] = [];
  for (const segment of path.split('.')) {
    const match = segmentPartsPattern.exec(segment);
    const name = match?.[1];
    if (name === undefined) {
      return undefined;
    }
    const index = match?.[2];
    if (index === '*') {
      parsed.push({ name, wildcard: true });
    } else if (index === undefined) {
      parsed.push({ name });
    } else {
      parsed.push({ name, index: Number(index) });
    }
  }
  return parsed;
};

/**
 * Compose a full selector name from an occurrence path and a part-relative
 * interface name. Full names are always composed, never stored (profile rule).
 *
 * @param occurrencePath - Dot-joined instance path from the root (root omitted).
 * @param interfaceName - Part-relative interface name.
 * @returns The composed full selector name.
 * @public
 */
export const composeFullName = (occurrencePath: string, interfaceName: string): string =>
  occurrencePath === '' ? interfaceName : `${occurrencePath}.${interfaceName}`;
