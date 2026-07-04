/**
 * L2 selector index builder (SB3-R2).
 *
 * Builds the per-subject occurrence/body/face tables plus authored-interface,
 * datum, and group records from one SB1 STEP-XDE read result and its per-face
 * analytic facts. All geometry facts are plain data computed at index time so
 * the L3 resolution engine stays pure (no wasm calls). Per D1 the index may
 * be cached per subject by the caller but never across subjects.
 *
 * @module
 */

import type { GeometryDiagnostic, Vec3 } from '#mesh/types.js';
import type { XdeOccurrence, XdeReadResult } from '#step/types.js';
import { missingStampedFactsDiagnostic } from '#selector/diagnostics.js';
import { composeFullName } from '#selector/grammar.js';
import { mapStampedFactsToSubjectFrame, parseStampedFacts } from '#selector/stale.js';
import type { StampedDatumFacts, StampedFaceFacts } from '#selector/stale.js';
import type { ResolvedEntityType, SelectorFaceFacts } from '#selector/types.js';

/**
 * One placed occurrence row in the selector index.
 *
 * @public
 */
export type SelectorOccurrenceRow = {
  path: string;
  productName: string;
  instanceName?: string;
  /** 4x4 row-major placement transform (part-local frame → subject frame). */
  transform: number[];
  shapeIndex: number;
  /** 1-based ordinal path in the occurrence tree (snapshot refs `#o1.2`). */
  ordinalPath: number[];
  /** Union of the occurrence's face bounds (subject frame), when faces exist. */
  bounds?: { min: Vec3; max: Vec3 };
};

/**
 * One BRep face row with subject-frame analytic facts.
 *
 * @public
 */
export type SelectorFaceRow = {
  id: string;
  occurrencePath: string;
  faceIndex: number;
  facts: SelectorFaceFacts;
  /** Snapshot topology ref, e.g. `#o1.f7`. */
  topologyRef: string;
};

/**
 * One per-occurrence solid aggregate row backing body selectors.
 *
 * @public
 */
export type SelectorBodyRow = {
  id: string;
  occurrencePath: string;
  /** Total face area (mm²). */
  area: number;
  /** Area-weighted centroid of the occurrence's faces. */
  centroid?: Vec3;
  bounds?: { min: Vec3; max: Vec3 };
};

/**
 * One authored interface record joining a subshape name to its face row.
 *
 * @public
 */
export type SelectorInterfaceRow = {
  id: string;
  /** Composed full name: `${occurrencePath}.${name}`. */
  fullName: string;
  occurrencePath: string;
  /** Part-relative authored name. */
  name: string;
  faceIndex: number;
  /** Entity kinds derived from the carrier face's geometry (profile rule). */
  entityKinds: ResolvedEntityType[];
  /** True when the named `faceIndex` no longer exists in the geometry. */
  dangling: boolean;
  face?: SelectorFaceRow;
  /** Stamped facts mapped into the subject frame, when present and usable. */
  stamped?: StampedFaceFacts;
  /** Why stamped facts are absent/unusable, when a resolution should say so. */
  stampedAbsentReason?: string;
};

/**
 * One materialized datum row (subject frame). The stamped payload is
 * constitutive — datums have no carrier subshape and are never stale.
 *
 * @public
 */
export type SelectorDatumRow = {
  id: string;
  fullName: string;
  occurrencePath: string;
  name: string;
  origin: Vec3;
  xAxis: Vec3;
  zAxis: Vec3;
};

/**
 * One reconstructed group row (shared `prefix[i]` family per occurrence).
 *
 * @public
 */
export type SelectorGroupRow = {
  id: string;
  fullName: string;
  occurrencePath: string;
  /** Part-relative group prefix. */
  name: string;
  /** Members ordered by 1-based index. */
  members: SelectorInterfaceRow[];
  /** The members' 1-based indices, ascending. */
  memberIndices: number[];
};

/**
 * The per-subject selector index consumed by the L3 resolution engine.
 *
 * @public
 */
export type SelectorIndex = {
  occurrences: SelectorOccurrenceRow[];
  faces: SelectorFaceRow[];
  bodies: SelectorBodyRow[];
  interfaces: SelectorInterfaceRow[];
  datums: SelectorDatumRow[];
  groups: SelectorGroupRow[];
  diagnostics: GeometryDiagnostic[];
};

/**
 * Per-occurrence face facts keyed by occurrence path, matching the
 * verification kernel's `faceFacts(occurrence)` payload.
 *
 * @public
 */
export type SelectorFaceFactsTable = Record<string, { faces: SelectorFaceFacts[] } | undefined>;

/**
 * Inputs for {@link buildSelectorIndex}.
 *
 * @public
 */
export type BuildSelectorIndexOptions = {
  xde: XdeReadResult;
  faceFactsByOccurrence: SelectorFaceFactsTable;
};

const identityTransform = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];

const computeOrdinalPaths = (occurrences: XdeOccurrence[]): Map<string, number[]> => {
  const childrenByParent = new Map<string, string[]>();
  for (const occurrence of occurrences) {
    const lastDot = occurrence.path.lastIndexOf('.');
    const parent = lastDot === -1 ? '' : occurrence.path.slice(0, lastDot);
    const children = childrenByParent.get(parent) ?? [];
    children.push(occurrence.path);
    childrenByParent.set(parent, children);
  }
  const ordinalPaths = new Map<string, number[]>();
  const visit = (parentPath: string, prefix: number[]): void => {
    const children = childrenByParent.get(parentPath) ?? [];
    for (const [position, childPath] of children.entries()) {
      const ordinalPath = [...prefix, position + 1];
      ordinalPaths.set(childPath, ordinalPath);
      visit(childPath, ordinalPath);
    }
  };
  visit('', []);
  return ordinalPaths;
};

const boundsUnion = (bounds: Array<{ min: Vec3; max: Vec3 }>): { min: Vec3; max: Vec3 } | undefined => {
  const first = bounds[0];
  if (!first) {
    return undefined;
  }
  let union = { min: first.min, max: first.max };
  for (const next of bounds.slice(1)) {
    union = {
      min: [
        Math.min(union.min[0], next.min[0]),
        Math.min(union.min[1], next.min[1]),
        Math.min(union.min[2], next.min[2]),
      ],
      max: [
        Math.max(union.max[0], next.max[0]),
        Math.max(union.max[1], next.max[1]),
        Math.max(union.max[2], next.max[2]),
      ],
    };
  }
  return union;
};

const derivedEntityKinds = (face: SelectorFaceRow | undefined): ResolvedEntityType[] => {
  if (!face) {
    return ['face'];
  }
  if (face.facts.surfaceType === 'plane') {
    return ['face', 'plane'];
  }
  if (face.facts.surfaceType === 'cylinder' || face.facts.surfaceType === 'cone') {
    return ['face', 'axis'];
  }
  return ['face'];
};

const buildFaceRows = (options: {
  occurrences: SelectorOccurrenceRow[];
  faceFactsByOccurrence: SelectorFaceFactsTable;
}): SelectorFaceRow[] => {
  const rows: SelectorFaceRow[] = [];
  for (const occurrence of options.occurrences) {
    const faces = options.faceFactsByOccurrence[occurrence.path]?.faces ?? [];
    const sorted = [...faces].sort((a, b) => a.faceIndex - b.faceIndex);
    for (const facts of sorted) {
      rows.push({
        id: `face:${occurrence.path}#${facts.faceIndex}`,
        occurrencePath: occurrence.path,
        faceIndex: facts.faceIndex,
        facts,
        topologyRef: `#o${occurrence.ordinalPath.join('.')}.f${facts.faceIndex}`,
      });
    }
  }
  return rows;
};

const buildBodyRows = (options: {
  occurrences: SelectorOccurrenceRow[];
  faces: SelectorFaceRow[];
}): SelectorBodyRow[] =>
  options.occurrences.map((occurrence) => {
    const faces = options.faces.filter((face) => face.occurrencePath === occurrence.path);
    let area = 0;
    for (const face of faces) {
      area += face.facts.area;
    }
    let centroid: Vec3 | undefined;
    if (area > 0) {
      let sumX = 0;
      let sumY = 0;
      let sumZ = 0;
      for (const face of faces) {
        sumX += (face.facts.centroid[0] * face.facts.area) / area;
        sumY += (face.facts.centroid[1] * face.facts.area) / area;
        sumZ += (face.facts.centroid[2] * face.facts.area) / area;
      }
      centroid = [sumX, sumY, sumZ];
    }
    const { bounds } = occurrence;
    return {
      id: `body:${occurrence.path}`,
      occurrencePath: occurrence.path,
      area,
      ...(centroid ? { centroid } : {}),
      ...(bounds ? { bounds } : {}),
    };
  });

type StampAttachment = {
  stamped?: StampedFaceFacts;
  stampedAbsentReason?: string;
  diagnostics: GeometryDiagnostic[];
};

const attachStamp = (options: {
  payload: string | undefined;
  fullName: string;
  transform: number[];
}): StampAttachment => {
  if (options.payload === undefined) {
    return { diagnostics: [] };
  }
  const parsed = parseStampedFacts(options.payload);
  if (parsed.status === 'absent') {
    return {
      stampedAbsentReason: parsed.reason,
      diagnostics: [missingStampedFactsDiagnostic({ interfaceName: options.fullName, reason: parsed.reason })],
    };
  }
  if (parsed.facts.kind === 'datum') {
    const reason = 'a datum payload cannot stamp a carrier face interface';
    return {
      stampedAbsentReason: reason,
      diagnostics: [missingStampedFactsDiagnostic({ interfaceName: options.fullName, reason })],
    };
  }
  return {
    stamped: mapStampedFactsToSubjectFrame(parsed.facts, options.transform) as StampedFaceFacts,
    diagnostics: [],
  };
};

const buildInterfaceRows = (options: {
  xde: XdeReadResult;
  occurrences: SelectorOccurrenceRow[];
  faces: SelectorFaceRow[];
  diagnostics: GeometryDiagnostic[];
}): SelectorInterfaceRow[] => {
  const faceByKey = new Map(options.faces.map((face) => [`${face.occurrencePath}#${face.faceIndex}`, face]));
  const occurrenceByPath = new Map(options.occurrences.map((occurrence) => [occurrence.path, occurrence]));
  const payloadByKey = new Map(
    options.xde.properties.map((property) => [`${property.occurrencePath} ${property.name}`, property.payload]),
  );
  const rows: SelectorInterfaceRow[] = [];
  for (const subshape of options.xde.subshapeNames) {
    if (subshape.shapeType !== 'face') {
      options.diagnostics.push({
        code: 'GEOSPEC_SELECTOR_UNSUPPORTED_EVIDENCE',
        severity: 'info',
        message: `Subshape name '${subshape.name}' on '${subshape.occurrencePath}' has shape type '${subshape.shapeType}'; V1 interfaces are faces only.`,
        suggestion: 'Edge/vertex/wire interfaces are V2 scope; author a face, axis, or datum interface instead.',
      });
      continue;
    }
    const fullName = composeFullName(subshape.occurrencePath, subshape.name);
    const face = faceByKey.get(`${subshape.occurrencePath}#${subshape.faceIndex}`);
    const dangling = face === undefined;
    if (dangling) {
      options.diagnostics.push({
        code: 'GEOSPEC_SELECTOR_STALE',
        severity: 'warning',
        message: `Authored interface '${fullName}' names faceIndex ${subshape.faceIndex}, which no longer exists in the geometry.`,
        suggestion: 'Re-export the artifact so authored interface names are re-evaluated against the current shape.',
        details: { interfaceName: fullName, faceIndex: subshape.faceIndex },
      });
    }
    const transform = occurrenceByPath.get(subshape.occurrencePath)?.transform ?? identityTransform;
    const attachment = attachStamp({
      payload: payloadByKey.get(`${subshape.occurrencePath} ${subshape.name}`),
      fullName,
      transform,
    });
    options.diagnostics.push(...attachment.diagnostics);
    rows.push({
      id: `interface:${fullName}`,
      fullName,
      occurrencePath: subshape.occurrencePath,
      name: subshape.name,
      faceIndex: subshape.faceIndex,
      entityKinds: derivedEntityKinds(face),
      dangling,
      ...(face ? { face } : {}),
      ...(attachment.stamped ? { stamped: attachment.stamped } : {}),
      ...(attachment.stampedAbsentReason ? { stampedAbsentReason: attachment.stampedAbsentReason } : {}),
    });
  }
  return rows;
};

const buildDatumRows = (options: {
  xde: XdeReadResult;
  occurrences: SelectorOccurrenceRow[];
  interfaceNames: Set<string>;
  diagnostics: GeometryDiagnostic[];
}): SelectorDatumRow[] => {
  const occurrenceByPath = new Map(options.occurrences.map((occurrence) => [occurrence.path, occurrence]));
  const rows: SelectorDatumRow[] = [];
  for (const property of options.xde.properties) {
    if (options.interfaceNames.has(`${property.occurrencePath} ${property.name}`)) {
      continue; // Aspect-attached stamp, already joined to its interface row.
    }
    const fullName = composeFullName(property.occurrencePath, property.name);
    const parsed = parseStampedFacts(property.payload);
    if (parsed.status === 'absent' || parsed.facts.kind !== 'datum') {
      options.diagnostics.push(
        missingStampedFactsDiagnostic({
          interfaceName: fullName,
          reason:
            parsed.status === 'absent'
              ? parsed.reason
              : 'a face/axis stamp has no matching authored subshape name (orphan property)',
        }),
      );
      continue; // Absent/unparseable datum: the interface does not exist.
    }
    const occurrence = occurrenceByPath.get(property.occurrencePath);
    if (!occurrence) {
      options.diagnostics.push(
        missingStampedFactsDiagnostic({
          interfaceName: fullName,
          reason: `datum property is attached to unknown occurrence '${property.occurrencePath}'`,
        }),
      );
      continue;
    }
    const mapped = mapStampedFactsToSubjectFrame(parsed.facts, occurrence.transform) as StampedDatumFacts;
    rows.push({
      id: `datum:${fullName}`,
      fullName,
      occurrencePath: property.occurrencePath,
      name: property.name,
      origin: mapped.origin,
      xAxis: mapped.xAxis,
      zAxis: mapped.zAxis,
    });
  }
  return rows;
};

const groupMemberPattern = /^(.*)\[([1-9]\d*)]$/;

const buildGroupRows = (interfaces: SelectorInterfaceRow[]): SelectorGroupRow[] => {
  const groups = new Map<
    string,
    { occurrencePath: string; name: string; members: Array<{ index: number; row: SelectorInterfaceRow }> }
  >();
  for (const row of interfaces) {
    const match = groupMemberPattern.exec(row.name);
    const prefix = match?.[1];
    const memberIndex = match?.[2];
    if (prefix === undefined || memberIndex === undefined) {
      continue;
    }
    const key = `${row.occurrencePath} ${prefix}`;
    const group = groups.get(key) ?? { occurrencePath: row.occurrencePath, name: prefix, members: [] };
    group.members.push({ index: Number(memberIndex), row });
    groups.set(key, group);
  }
  return [...groups.values()]
    .map((group) => {
      const members = [...group.members].sort((a, b) => a.index - b.index);
      const fullName = composeFullName(group.occurrencePath, group.name);
      return {
        id: `group:${fullName}`,
        fullName,
        occurrencePath: group.occurrencePath,
        name: group.name,
        members: members.map((member) => member.row),
        memberIndices: members.map((member) => member.index),
      };
    })
    .sort((a, b) => a.fullName.localeCompare(b.fullName));
};

/**
 * Build the per-subject selector index from an SB1 XDE read result and its
 * per-occurrence face facts.
 *
 * @param options - XDE structure plus subject-frame face facts per occurrence.
 * @returns The selector index with build diagnostics.
 * @public
 */
export const buildSelectorIndex = (options: BuildSelectorIndexOptions): SelectorIndex => {
  const diagnostics: GeometryDiagnostic[] = [];
  const ordinalPaths = computeOrdinalPaths(options.xde.occurrences);
  const occurrences: SelectorOccurrenceRow[] = options.xde.occurrences.map((occurrence) => ({
    path: occurrence.path,
    productName: occurrence.productName,
    ...(occurrence.instanceName === undefined ? {} : { instanceName: occurrence.instanceName }),
    transform: occurrence.transform,
    shapeIndex: occurrence.shapeIndex,
    ordinalPath: ordinalPaths.get(occurrence.path) ?? [],
  }));
  const faces = buildFaceRows({ occurrences, faceFactsByOccurrence: options.faceFactsByOccurrence });
  for (const occurrence of occurrences) {
    const bounds = boundsUnion(
      faces.filter((face) => face.occurrencePath === occurrence.path).map((face) => face.facts.bounds),
    );
    if (bounds) {
      occurrence.bounds = bounds;
    }
  }
  const interfaces = buildInterfaceRows({ xde: options.xde, occurrences, faces, diagnostics });
  const interfaceNames = new Set(
    options.xde.subshapeNames.map((subshape) => `${subshape.occurrencePath} ${subshape.name}`),
  );
  const datums = buildDatumRows({ xde: options.xde, occurrences, interfaceNames, diagnostics });
  return {
    occurrences,
    faces,
    bodies: buildBodyRows({ occurrences, faces }),
    interfaces,
    datums,
    groups: buildGroupRows(interfaces),
    diagnostics,
  };
};
