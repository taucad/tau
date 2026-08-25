import { normalizeShapeName } from '#utils/shape-names.js';

/** Declares whether a geometry name came from authored content, imported content, or Tau/generated output. */
export type GeometryNameSource = 'authored' | 'imported' | 'generated' | 'external-generated' | 'internal';

/** Inputs for resolving material, scene, and other optional geometry names. */
export type ResolveGeometryNameOptions = {
  name?: string;
  source?: GeometryNameSource;
  semanticRole?: boolean;
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
