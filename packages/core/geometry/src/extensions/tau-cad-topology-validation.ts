import type { TauCadTopologyPayload, TauCadTopologyPrimitiveRef } from '#extensions/tau-cad-topology.types.js';

/** Primitive mode and index bounds used to validate topology references. @public */
export type TauCadTopologyPrimitiveBounds = { readonly mode: number; readonly indexCount: number };

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

/**
 * Validate payload hierarchy and references against one glTF document.
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
  const identifiers = new Set<string>();
  for (const component of payload.components) {
    if (identifiers.has(component.id)) {
      issues.push(`${component.id} is duplicated`);
    }
    identifiers.add(component.id);
    const references = component.primitiveRefs ?? [];
    for (const reference of references) {
      const issue = referenceIssue(reference, bounds);
      if (issue) {
        issues.push(`${component.id} ${issue}`);
      }
    }
    if (component.parentId && !payload.components.some(({ id }) => id === component.parentId)) {
      issues.push(`${component.id} references missing parent ${component.parentId}`);
    }
    for (const childId of component.childIds ?? []) {
      if (!payload.components.some(({ id }) => id === childId)) {
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
        if (group.start + group.count > primitiveBounds.indexCount) {
          issues.push(`${component.id} ${label} group exceeds its primitive index count`);
        }
      }
    }
  }
  return issues;
};
