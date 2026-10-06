import { admitMechanism } from '@taucad/kinematics';
import type { TauCadTopologyPayload, TauCadTopologyPrimitiveRef } from '#extensions/tau-cad-topology.types.js';

/** Primitive mode and index bounds used to validate topology references. @public */
export type TauCadTopologyPrimitiveBounds = {
  readonly mode: number;
  readonly indexCount: number;
  /** Non-indexed POSITION accessor count times three, for XYZ-scalar edge spans. */
  readonly positionScalarCount?: number;
};

/** Document bounds used to validate topology references without owning a parser. @public */
export type TauCadTopologyDocumentBounds = {
  readonly nodes: ReadonlyArray<{ readonly meshIndex?: number }>;
  readonly meshes: ReadonlyArray<readonly TauCadTopologyPrimitiveBounds[]>;
};

const referenceIssue = (
  reference: TauCadTopologyPrimitiveRef,
  bounds: TauCadTopologyDocumentBounds,
): string | undefined => {
  const node = bounds.nodes[reference.nodeIndex];
  const primitive = bounds.meshes[reference.meshIndex]?.[reference.primitiveIndex];
  if (!node || !primitive) {
    return `references missing node ${reference.nodeIndex}, mesh ${reference.meshIndex}, primitive ${reference.primitiveIndex}`;
  }
  return node.meshIndex === reference.meshIndex
    ? undefined
    : `references mesh ${reference.meshIndex} from node ${reference.nodeIndex}, which owns mesh ${String(node.meshIndex)}`;
};

// The mechanism must pass admission, and every link component must be a declared component id.
const mechanismIssues = (mechanism: unknown, identifiers: ReadonlySet<string>): string[] => {
  if (mechanism === undefined) {
    return [];
  }
  const outcome = admitMechanism(mechanism);
  if (outcome.status === 'invalid') {
    return outcome.issues.map((issue) => `mechanism${issue.path && ` ${issue.path}`}: ${issue.message}`);
  }
  return Object.entries(outcome.mechanism.links).flatMap(([linkId, { components }]) =>
    components
      .filter((id) => !identifiers.has(id))
      .map((id) => `mechanism link ${linkId} references missing component ${id}`),
  );
};

const asRecord = (value: unknown): Record<string, unknown> | undefined =>
  value !== null && typeof value === 'object' ? (value as Record<string, unknown>) : undefined;

const physicalIssues = (componentId: string, input: unknown): string[] => {
  if (input === undefined) {
    return [];
  }
  const physical = asRecord(input);
  const volume = asRecord(physical?.['volume']);
  if (!physical || !volume) {
    return [`${componentId} has invalid physical evidence`];
  }
  const issues: string[] = [];
  if (volume['state'] === 'measured') {
    if (
      typeof volume['valueMm3'] !== 'number' ||
      !Number.isFinite(volume['valueMm3']) ||
      volume['valueMm3'] <= 0 ||
      typeof volume['geometryDigest'] !== 'string' ||
      !/^sha256:[0-9a-f]{64}$/u.test(volume['geometryDigest']) ||
      volume['method'] !== 'occt-solid-volume' ||
      volume['validity'] !== 'closed-solid'
    ) {
      issues.push(`${componentId} has invalid native solid volume evidence`);
    }
  } else if (volume['state'] === 'derived') {
    const source = volume['sourceValueMm3'];
    const factor = volume['addedAbsDeterminant'];
    const value = volume['valueMm3'];
    if (
      typeof source !== 'number' ||
      !Number.isFinite(source) ||
      source <= 0 ||
      typeof factor !== 'number' ||
      !Number.isFinite(factor) ||
      factor <= 0 ||
      typeof value !== 'number' ||
      !Number.isFinite(value) ||
      value <= 0 ||
      value !== source * factor ||
      typeof volume['geometryDigest'] !== 'string' ||
      !/^sha256:[0-9a-f]{64}$/u.test(volume['geometryDigest']) ||
      volume['method'] !== 'occurrence-determinant-v1' ||
      volume['validity'] !== 'placed-solid'
    ) {
      issues.push(`${componentId} has invalid placed-volume evidence`);
    }
  } else if (
    volume['state'] !== 'unavailable' ||
    !['not-solid', 'invalid-solid', 'native-unavailable', 'degenerate-placement', 'nonfinite-placement'].includes(
      volume['reason'] as string,
    )
  ) {
    issues.push(`${componentId} has invalid unavailable-volume evidence`);
  }
  if (physical['density'] !== undefined) {
    const density = asRecord(physical['density']);
    if (
      !density ||
      typeof density['valueGPerCm3'] !== 'number' ||
      !Number.isFinite(density['valueGPerCm3']) ||
      density['valueGPerCm3'] <= 0 ||
      density['provenance'] !== 'authored-shape-config'
    ) {
      issues.push(`${componentId} has invalid authored density evidence`);
    }
  }
  return issues;
};

/**
 * Validate payload hierarchy, references and mechanism against one glTF document.
 *
 * @param payload - Canonical topology payload to inspect.
 * @param bounds - Parsed glTF node, mesh, primitive, and index bounds.
 * @returns Human-readable conformance issues; empty when valid.
 * @public
 */
export const validateTauCadTopology = (
  payload: TauCadTopologyPayload,
  bounds: TauCadTopologyDocumentBounds,
): readonly string[] => {
  const issues: string[] = [];
  const componentIds = new Set(payload.components.map(({ id }) => id));
  const identifiers = new Set<string>();
  for (const component of payload.components) {
    if (identifiers.has(component.id)) {
      issues.push(`${component.id} is duplicated`);
    }
    identifiers.add(component.id);
    issues.push(...physicalIssues(component.id, component.physical));
    const references = component.primitiveRefs ?? [];
    for (const reference of references) {
      const issue = referenceIssue(reference, bounds);
      if (issue) {
        issues.push(`${component.id} ${issue}`);
      }
    }
    if (component.parentId && !componentIds.has(component.parentId)) {
      issues.push(`${component.id} references missing parent ${component.parentId}`);
    }
    for (const childId of component.childIds ?? []) {
      if (!componentIds.has(childId)) {
        issues.push(`${component.id} references missing child ${childId}`);
      }
    }
    for (const [groups, mode, label] of [
      [component.faceGroups ?? [], 4, 'face'],
      [component.edgeGroups ?? [], 1, 'edge'],
    ] as const) {
      if (groups.length === 0) {
        continue;
      }
      const primitiveBounds = references
        .map((reference) => bounds.meshes[reference.meshIndex]?.[reference.primitiveIndex])
        .find((primitive) => primitive?.mode === mode);
      if (!primitiveBounds) {
        issues.push(`${component.id} has ${label} groups without a matching primitive`);
        continue;
      }
      for (const group of groups) {
        const scalarEdges = label === 'edge' && component.sourceRefs?.['edgeGroupUnit'] === 'xyz-scalars-v1';
        const limit = scalarEdges ? primitiveBounds.positionScalarCount : primitiveBounds.indexCount;
        if (limit === undefined || group.start + group.count > limit) {
          issues.push(
            `${component.id} ${label} group exceeds its primitive ${scalarEdges ? 'position scalar' : 'index'} count`,
          );
        }
      }
    }
  }
  return [...issues, ...mechanismIssues(payload.mechanism, identifiers)];
};
