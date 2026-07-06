import { formatShapeName, isLegacyGeneratedShapeName, normalizeShapeName } from '#utils/shape-names.js';

/** Declares whether a geometry name came from authored content, imported content, or Tau/generated output. */
export type GeometryNameSource = 'authored' | 'imported' | 'generated' | 'external-generated' | 'internal';

/** Inputs for resolving material, scene, and other optional geometry names. */
export type ResolveGeometryNameOptions = {
  name?: string;
  source?: GeometryNameSource;
  semanticRole?: boolean;
};

/** Inputs for generated export artifact names. */
export type ResolveArtifactNameOptions = {
  basename?: string;
  extension?: string;
};

const generatedMaterialNamePattern = /^(?:default|rgba\([^)]*\)|outline-.+|material(?:_.+)?)$/i;
const generatedSceneNamePattern = /^Scene$/;

/**
 * Trim a geometry name and collapse empty names to undefined.
 *
 * @param name - Optional geometry name to normalize.
 * @returns A non-empty trimmed name, or undefined.
 */
export function normalizeGeometryName(name: string | undefined): string | undefined {
  return normalizeShapeName(name);
}

/**
 * Detect generated material labels from Tau and converter output.
 *
 * @param name - Optional normalized or raw material name.
 * @returns True when the name matches a known generated material pattern.
 */
export function isGeneratedMaterialName(name: string | undefined): boolean {
  const normalized = normalizeGeometryName(name);
  return normalized ? generatedMaterialNamePattern.test(normalized) : false;
}

/**
 * Detect generated single-scene labels from Tau and converter output.
 *
 * @param name - Optional normalized or raw scene name.
 * @returns True when the name is the generic generated scene label.
 */
export function isGeneratedSceneName(name: string | undefined): boolean {
  const normalized = normalizeGeometryName(name);
  return normalized ? generatedSceneNamePattern.test(normalized) : false;
}

/**
 * Resolve an authored/imported material name or omit generated material labels.
 *
 * @param options - Name, provenance, and semantic-role metadata for the material.
 * @returns A preserved semantic name, or undefined for generated labels.
 */
export function resolveMaterialName({
  name,
  source = 'authored',
  semanticRole = false,
}: ResolveGeometryNameOptions): string | undefined {
  const normalized = normalizeGeometryName(name);
  if (!normalized) {
    return undefined;
  }

  if (source === 'generated' || source === 'internal') {
    return semanticRole ? normalized : undefined;
  }

  if (source === 'external-generated' && isGeneratedMaterialName(normalized)) {
    return undefined;
  }

  return normalized;
}

/**
 * Resolve an authored/imported scene name or omit generated scene labels.
 *
 * @param options - Name and provenance for the scene.
 * @returns A preserved scene name, or undefined for generated labels.
 */
export function resolveSceneName({ name, source = 'authored' }: ResolveGeometryNameOptions): string | undefined {
  const normalized = normalizeGeometryName(name);
  if (!normalized) {
    return undefined;
  }

  if (source === 'generated' || source === 'internal') {
    return undefined;
  }

  if (source === 'external-generated' && isGeneratedSceneName(normalized)) {
    return undefined;
  }

  return normalized;
}

/**
 * Format a generated component ID from a mesh-bearing node address.
 *
 * @param nodeIndex - Zero-based glTF node index.
 * @returns A payload-local component identifier.
 */
export function formatComponentId(nodeIndex: number): string {
  if (!Number.isInteger(nodeIndex) || nodeIndex < 0) {
    throw new RangeError(`Component node index must be a non-negative integer; received ${nodeIndex}.`);
  }

  return `component:node-${nodeIndex}`;
}

/**
 * Format a semantic component ID from a modeled component name.
 *
 * @param name - Resolved component display name.
 * @param nodeIndex - Zero-based glTF node index used to identify generated labels.
 * @returns A semantic component id, or undefined when the name is generated.
 */
export function formatNamedComponentId(name: string, nodeIndex: number): string | undefined {
  const normalized = normalizeGeometryName(name);
  if (!normalized || isLegacyGeneratedShapeName(normalized) || normalized === formatShapeName(nodeIndex)) {
    return undefined;
  }

  const slug = normalized
    .toLowerCase()
    .normalize('NFKD')
    .replaceAll(/[\u0300-\u036F]/g, '')
    .replaceAll(/[^\da-z]+/g, '-')
    .replaceAll(/^-+|-+$/g, '');

  return slug.length > 0 ? `component:${slug}` : undefined;
}

/**
 * Format a generated selector for a mesh-bearing glTF node.
 *
 * @param nodeIndex - Zero-based glTF node index.
 * @returns A payload-local node selector.
 */
export function formatNodeSelector(nodeIndex: number): string {
  if (!Number.isInteger(nodeIndex) || nodeIndex < 0) {
    throw new RangeError(`Selector node index must be a non-negative integer; received ${nodeIndex}.`);
  }

  return `node/${nodeIndex}`;
}

/**
 * Format a generated selector for a semantic primitive within a mesh-bearing node.
 *
 * @param nodeIndex - Zero-based glTF node index.
 * @param primitiveKind - Primitive role inside the node.
 * @returns A payload-local primitive selector.
 */
export function formatPrimitiveSelector(nodeIndex: number, primitiveKind: 'surface' | 'edges'): string {
  return `${formatNodeSelector(nodeIndex)}/${primitiveKind}`;
}

/**
 * Format the single-document model export artifact name.
 *
 * @param extension - Output file extension.
 * @returns The canonical model artifact filename.
 */
export function formatModelArtifactName(extension: string): string {
  const normalizedExtension = normalizeGeometryName(extension)?.replace(/^\./, '');
  if (!normalizedExtension) {
    throw new Error('Model artifact extension must be non-empty.');
  }

  return `model.${normalizedExtension}`;
}

/**
 * Format the assembly export artifact name.
 *
 * @param extension - Optional output file extension.
 * @returns The canonical assembly artifact basename or filename.
 */
export function formatAssemblyArtifactName(extension?: string): string {
  const normalizedExtension = normalizeGeometryName(extension)?.replace(/^\./, '');
  return normalizedExtension ? `assembly.${normalizedExtension}` : 'assembly';
}

/**
 * Sanitize a display label for the rare multi-file per-shape artifact case.
 *
 * @param name - Candidate artifact basename.
 * @returns A filesystem-safe basename.
 */
export function sanitizeArtifactBasename(name: string): string {
  const normalized = normalizeGeometryName(name);
  if (!normalized) {
    return 'Shape';
  }

  const sanitized = normalized
    .replaceAll(/[^\w .-]+/gu, '_')
    .replaceAll(/\s+/gu, ' ')
    .replaceAll(/^\.+|\.+$/gu, '')
    .trim();
  return sanitized.length > 0 ? sanitized : 'Shape';
}

/**
 * De-duplicate a generated artifact name while preserving the first occurrence unchanged.
 *
 * @param options - Candidate basename and optional extension.
 * @param usedNames - Mutable count map for artifact names already emitted in this scope.
 * @returns The original artifact name or a suffixed duplicate label.
 */
export function uniqueArtifactName(
  { basename, extension }: ResolveArtifactNameOptions,
  usedNames: Map<string, number>,
): string {
  const sanitizedBasename = sanitizeArtifactBasename(basename ?? 'Shape');
  const normalizedExtension = normalizeGeometryName(extension)?.replace(/^\./, '');
  const stem = normalizedExtension ? `${sanitizedBasename}.${normalizedExtension}` : sanitizedBasename;
  const occurrence = (usedNames.get(stem) ?? 0) + 1;
  usedNames.set(stem, occurrence);

  if (occurrence === 1) {
    return stem;
  }

  return normalizedExtension
    ? `${sanitizedBasename} ${occurrence}.${normalizedExtension}`
    : `${sanitizedBasename} ${occurrence}`;
}
