/** Declares whether a caller-supplied name came from authored code or from generated/imported output. */
export type ShapeNameSource = 'authored' | 'generated' | 'external-generated';

/** Inputs for resolving an authored or fallback shape name. */
export type ResolveShapeNameOptions = {
  index: number;
  name?: string;
  source?: ShapeNameSource;
};

const legacyGeneratedShapeNamePattern = /^(?:AnyShape(?:\s+\d+)?|Geometry|Mesh|Shape_\d+)$/;

/**
 * Format a zero-based shape ordinal as Tau's one-indexed fallback label.
 *
 * @param index - Zero-based shape index.
 * @returns A display label such as `Shape 1`.
 */
export function formatShapeName(index: number): string {
  if (!Number.isInteger(index) || index < 0) {
    throw new RangeError(`Shape index must be a non-negative integer; received ${index}.`);
  }

  return `Shape ${index + 1}`;
}

/**
 * Trim a shape name and collapse empty names to undefined.
 *
 * @param name - Optional shape name to normalize.
 * @returns A non-empty trimmed name, or undefined.
 */
export function normalizeShapeName(name: string | undefined): string | undefined {
  if (typeof name !== 'string') {
    return undefined;
  }

  const trimmed = name.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

/**
 * Detect generated fallback labels from older kernel implementations.
 *
 * @param name - Optional normalized or raw shape name.
 * @returns True when the name matches a known legacy-generated pattern.
 */
export function isLegacyGeneratedShapeName(name: string | undefined): boolean {
  const normalized = normalizeShapeName(name);
  return normalized ? legacyGeneratedShapeNamePattern.test(normalized) : false;
}

/**
 * Resolve the visible shape name for a render/export position.
 *
 * @param options - Name, ordinal, and provenance for the shape.
 * @returns The authored name when present, or a one-indexed fallback.
 */
export function resolveShapeName({ index, name, source = 'authored' }: ResolveShapeNameOptions): string {
  const normalized = normalizeShapeName(name);
  if (!normalized) {
    return formatShapeName(index);
  }

  if (source !== 'authored' && isLegacyGeneratedShapeName(normalized)) {
    return formatShapeName(index);
  }

  return normalized;
}

/**
 * De-duplicate a shape name while preserving the first occurrence unchanged.
 *
 * @param name - Candidate display name.
 * @param usedNames - Mutable count map for names already emitted in this scope.
 * @returns The original name or a suffixed duplicate label.
 */
export function uniqueShapeName(name: string, usedNames: Map<string, number>): string {
  let count = (usedNames.get(name) ?? 0) + 1;
  usedNames.set(name, count);
  if (count === 1) {
    return name;
  }

  // Skip suffixes that collide with an authored name already emitted this scope.
  let candidate = `${name} ${count}`;
  while (usedNames.has(candidate)) {
    count += 1;
    candidate = `${name} ${count}`;
  }
  usedNames.set(name, count);
  usedNames.set(candidate, 1);
  return candidate;
}
