/**
 * Geometry inspection helpers for advanced GeoSpec matchers.
 *
 * @module
 */

import { getMeshAnalysisRecord } from '#mesh/analysis-record.js';
import type { AabbMeters, GeometryDiagnostic, GeometrySubject, Vec3 } from '#mesh/types.js';
import type { GeoSpecComponentSelector, GeoSpecGeometrySelector } from '#runner/types.js';

/**
 * One inspected geometry entity.
 *
 * @public
 */
export type GeometryInspectionEntity =
  | {
      kind: 'occurrence';
      name: string;
      color?: string;
      bounds: AabbMeters;
      center: Vec3;
      triangleCount?: number;
      source: 'mesh' | 'step';
    }
  | {
      kind: 'axis';
      name: string;
      axis?: 'x' | 'y' | 'z';
      center?: Vec3;
      direction?: Vec3;
      radius?: number;
      bounds?: AabbMeters;
      source: 'selector' | 'brep';
    }
  | {
      kind: 'plane';
      name: string;
      normal?: Vec3;
      offset?: number;
      bounds?: AabbMeters;
      source: 'selector' | 'brep';
    };

type GeometryInspectionOccurrenceEntity = Extract<GeometryInspectionEntity, { kind: 'occurrence' }>;

/**
 * Result of one selector inspection.
 *
 * @public
 */
export type GeometryInspectionSelection = {
  selector: GeoSpecGeometrySelector;
  matches: GeometryInspectionEntity[];
};

/**
 * Options for {@link inspectGeometry}.
 *
 * @public
 */
export type InspectGeometryOptions = {
  subject: GeometrySubject;
  selectors: GeoSpecGeometrySelector[];
  evidence?: Array<'bounds' | 'facts' | 'frames'>;
};

/**
 * Structured inspection result used by relationship and occurrence matchers.
 *
 * @public
 */
export type InspectGeometryResult = {
  selections: GeometryInspectionSelection[];
  diagnostics: GeometryDiagnostic[];
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const isGeometrySubject = (value: unknown): value is GeometrySubject =>
  isRecord(value) && value['kind'] === 'geometry-subject' && isRecord(value['mesh']) && isRecord(value['provenance']);

const selectorLabel = (selector: GeoSpecComponentSelector): string =>
  typeof selector === 'string' ? selector : selector.toString();

const selectorMatches = (selector: GeoSpecComponentSelector, label: string): boolean =>
  typeof selector === 'string'
    ? label === selector
    : (() => {
        selector.lastIndex = 0;
        const matched = selector.test(label);
        selector.lastIndex = 0;
        return matched;
      })();

const centerOfBounds = (bounds: AabbMeters): Vec3 => [
  (bounds.min[0] + bounds.max[0]) / 2,
  (bounds.min[1] + bounds.max[1]) / 2,
  (bounds.min[2] + bounds.max[2]) / 2,
];

const meshOccurrenceEntities = (subject: GeometrySubject): GeometryInspectionOccurrenceEntity[] => {
  const record = getMeshAnalysisRecord(subject.mesh.stats);
  const partition = record.getComponentPartition();
  if (partition) {
    return partition.components.map((component) => ({
      kind: 'occurrence',
      name: component.label,
      ...(component.color ? { color: component.color } : {}),
      bounds: component.aabb,
      center: centerOfBounds(component.aabb),
      triangleCount: component.triangleCount,
      source: 'mesh',
    }));
  }
  return record.primitives.map((primitive) => ({
    kind: 'occurrence',
    name: primitive.componentName,
    ...(primitive.color ? { color: primitive.color } : {}),
    bounds: primitive.aabb,
    center: centerOfBounds(primitive.aabb),
    triangleCount: primitive.triangleCount,
    source: 'mesh',
  }));
};

const stepOccurrenceEntities = (subject: GeometrySubject): GeometryInspectionOccurrenceEntity[] =>
  (subject.step?.productStructure ?? []).flatMap((product) => {
    const meshMatch = meshOccurrenceEntities(subject).find((entity) => entity.name === product.name);
    if (!meshMatch) {
      return [];
    }
    return [{ ...meshMatch, name: product.name, source: 'step' }];
  });

const occurrenceEntities = (subject: GeometrySubject): GeometryInspectionOccurrenceEntity[] => {
  const stepEntities = stepOccurrenceEntities(subject);
  return stepEntities.length > 0 ? stepEntities : meshOccurrenceEntities(subject);
};

const componentSelectorFromGeometrySelector = (
  selector: GeoSpecGeometrySelector,
): GeoSpecComponentSelector | undefined => {
  if (typeof selector === 'string' || selector instanceof RegExp) {
    return selector;
  }
  switch (selector.kind) {
    case 'occurrence': {
      return selector.name;
    }
    case 'axis':
    case 'plane': {
      return selector.name;
    }
    default: {
      // SB3 selector kinds (body/face/datum/interface/group) resolve through
      // the selector engine (`geospec/selector`); the legacy inspector has no
      // component-name equivalent for them (routing lands with SB4/R6).
      return undefined;
    }
  }
};

const selectOccurrences = (
  subject: GeometrySubject,
  selector: GeoSpecGeometrySelector,
): GeometryInspectionOccurrenceEntity[] => {
  const componentSelector = componentSelectorFromGeometrySelector(selector);
  if (!componentSelector) {
    return [];
  }
  return occurrenceEntities(subject).filter((entity) => selectorMatches(componentSelector, entity.name));
};

const axisMatches = (
  axis: { axis?: 'x' | 'y' | 'z'; radius?: number },
  selector: Extract<GeoSpecGeometrySelector, { kind: 'axis' }>,
): boolean => {
  const tolerance = selector.tolerance ?? 0.1;
  return (
    (selector.axis === undefined || axis.axis === selector.axis) &&
    (selector.radius === undefined ||
      (axis.radius !== undefined && Math.abs(axis.radius - selector.radius) <= tolerance))
  );
};

const planeMatches = (
  plane: { normal?: Vec3; offset?: number },
  selector: Extract<GeoSpecGeometrySelector, { kind: 'plane' }>,
): boolean => {
  const tolerance = selector.tolerance ?? 0.1;
  return (
    (selector.offset === undefined ||
      (plane.offset !== undefined && Math.abs(plane.offset - selector.offset) <= tolerance)) &&
    (selector.normal === undefined ||
      (plane.normal !== undefined &&
        Math.hypot(
          plane.normal[0] - selector.normal[0],
          plane.normal[1] - selector.normal[1],
          plane.normal[2] - selector.normal[2],
        ) <= tolerance))
  );
};

const selectAxis = (
  subject: GeometrySubject,
  selector: Extract<GeoSpecGeometrySelector, { kind: 'axis' }>,
): GeometryInspectionEntity[] => {
  const explicit =
    selector.center !== undefined ||
    selector.direction !== undefined ||
    selector.radius !== undefined ||
    selector.axis !== undefined;
  if (explicit && selector.name === undefined) {
    return [
      {
        kind: 'axis',
        name: selectorLabel(selector.axis ?? 'axis'),
        ...(selector.axis ? { axis: selector.axis } : {}),
        ...(selector.center ? { center: selector.center } : {}),
        ...(selector.direction ? { direction: selector.direction } : {}),
        ...(selector.radius === undefined ? {} : { radius: selector.radius }),
        source: 'selector',
      },
    ];
  }

  const occurrences = selectOccurrences(subject, selector);
  if (occurrences.length > 0 && explicit) {
    return occurrences.map((occurrence) => ({
      kind: 'axis',
      name: `${occurrence.name}.axis`,
      ...(selector.axis ? { axis: selector.axis } : {}),
      center: selector.center ?? occurrence.center,
      ...(selector.direction ? { direction: selector.direction } : {}),
      ...(selector.radius === undefined ? {} : { radius: selector.radius }),
      bounds: occurrence.bounds,
      source: 'selector',
    }));
  }

  return (subject.brep?.cylindricalFaces ?? [])
    .filter((face) => axisMatches(face, selector))
    .map((face, index) => ({
      kind: 'axis',
      name: `cylindricalFace[${index}]`,
      axis: face.axis,
      ...(face.center ? { center: face.center } : {}),
      radius: face.radius,
      source: 'brep',
    }));
};

const selectPlane = (
  subject: GeometrySubject,
  selector: Extract<GeoSpecGeometrySelector, { kind: 'plane' }>,
): GeometryInspectionEntity[] => {
  const explicit = selector.normal !== undefined || selector.offset !== undefined;
  if (explicit && selector.name === undefined) {
    return [
      {
        kind: 'plane',
        name: 'plane',
        ...(selector.normal ? { normal: selector.normal } : {}),
        ...(selector.offset === undefined ? {} : { offset: selector.offset }),
        source: 'selector',
      },
    ];
  }

  const occurrences = selectOccurrences(subject, selector);
  if (occurrences.length > 0 && explicit) {
    return occurrences.map((occurrence) => ({
      kind: 'plane',
      name: `${occurrence.name}.plane`,
      ...(selector.normal ? { normal: selector.normal } : {}),
      ...(selector.offset === undefined ? {} : { offset: selector.offset }),
      bounds: occurrence.bounds,
      source: 'selector',
    }));
  }

  return (subject.brep?.planarFaces ?? [])
    .filter((face) => planeMatches(face, selector))
    .map((face, index) => ({
      kind: 'plane',
      name: `planarFace[${index}]`,
      normal: face.normal,
      offset: face.offset,
      source: 'brep',
    }));
};

const inspectSelector = (subject: GeometrySubject, selector: GeoSpecGeometrySelector): GeometryInspectionSelection => {
  if (typeof selector === 'string' || selector instanceof RegExp) {
    return { selector, matches: selectOccurrences(subject, selector) };
  }
  switch (selector.kind) {
    case 'axis': {
      return { selector, matches: selectAxis(subject, selector) };
    }
    case 'plane': {
      return { selector, matches: selectPlane(subject, selector) };
    }
    case 'occurrence': {
      return { selector, matches: selectOccurrences(subject, selector) };
    }
    default: {
      // SB3 selector kinds are not resolvable by the legacy inspection path;
      // they report unmatched here until SB4/R6 routes inspection through
      // the selector engine's resolve().
      return { selector, matches: [] };
    }
  }
};

const geometrySelectorLabel = (selector: GeoSpecGeometrySelector): string => {
  if (typeof selector === 'string') {
    return selector;
  }
  if (selector instanceof RegExp) {
    return selector.toString();
  }
  return JSON.stringify(selector);
};

/**
 * Inspect selected geometry entities from a GeoSpec-loaded subject.
 *
 * @param options - Subject and selectors to inspect.
 * @returns Matched entities and diagnostics for selector misses.
 * @public
 */
export const inspectGeometry = (options: InspectGeometryOptions): InspectGeometryResult => {
  if (!isGeometrySubject(options.subject)) {
    return {
      selections: [],
      diagnostics: [
        {
          code: 'UNSUPPORTED_GEOMETRY_SUBJECT',
          severity: 'error',
          message: 'inspectGeometry requires a GeoSpec GeometrySubject loaded from geometry evidence.',
          suggestion:
            'Use loadMesh(...) or loadModel(...) and pass the returned GeometrySubject to inspectGeometry(...).',
        },
      ],
    };
  }

  const selections = options.selectors.map((selector) => inspectSelector(options.subject, selector));
  const available = occurrenceEntities(options.subject).map((entity) => entity.name);
  const diagnostics = selections
    .map((selection, index) => ({ selection, index }))
    .filter(({ selection }) => selection.matches.length === 0)
    .map(
      ({ selection, index }): GeometryDiagnostic => ({
        code: 'GEOSPEC_SELECTOR_UNMATCHED',
        severity: 'error',
        message: `Geometry selector ${index} matched no entities.`,
        suggestion:
          'Use an exported occurrence name, a RegExp matching an occurrence, or an explicit selector with analytic facts.',
        details: {
          selector: geometrySelectorLabel(selection.selector),
          selectorIndex: index,
          available,
        },
      }),
    );

  return { selections, diagnostics };
};
