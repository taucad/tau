import { weldPositions } from '#mesh/_internal/spatial-welding.js';
import { createOpenCascadeMeshAnalyzer } from '#mesh/native.js';
import type {
  GeoSpecNativeMeshAnalyzer,
  GeoSpecNativeMeshComponent,
  GeoSpecNativeMeshOverlap,
  GeoSpecNativeTriangleSoup,
} from '#mesh/native.js';
import type { GeometryDiagnostic, GeometrySubject, MeshTriangle, Vec3 } from '#mesh/types.js';

/**
 * Options for native component-overlap analysis.
 *
 * @public
 */
export type AnalyzeMeshOverlapOptions = {
  subject: GeometrySubject;
  tolerance?: number;
  nativeAnalyzer?: GeoSpecNativeMeshAnalyzer;
};

/**
 * One overlapping component pair found by {@link analyzeMeshOverlap}.
 *
 * @public
 */
export type MeshComponentOverlap = {
  leftComponentId: number;
  rightComponentId: number;
  leftLabel: string;
  rightLabel: string;
  leftColor?: string;
  rightColor?: string;
  intersectionVolume: number;
  witnessPoint?: Vec3;
  penetration: 'positive-volume';
};

/**
 * Successful native overlap analysis.
 *
 * @public
 */
export type MeshOverlapEvidence = {
  componentSource: 'named' | 'connected';
  componentCount: number;
  checkedPairs: number;
  tolerance: number;
  overlaps: MeshComponentOverlap[];
};

/**
 * Typed result for component-overlap analysis.
 *
 * @public
 */
export type AnalyzeMeshOverlapResult =
  | { success: true; evidence: MeshOverlapEvidence; diagnostics: GeometryDiagnostic[] }
  | { success: false; diagnostics: GeometryDiagnostic[] };

type ComponentPartition = {
  source: 'named' | 'connected';
  componentIds: Int32Array<ArrayBuffer>;
  components: GeoSpecNativeMeshComponent[];
};

const defaultOverlapTolerance = 0.1;

const toNativeTriangleSoup = (triangles: readonly MeshTriangle[]): GeoSpecNativeTriangleSoup => {
  const buffer = new Float64Array(triangles.length * 9);
  let offset = 0;
  for (const triangle of triangles) {
    buffer[offset++] = triangle.a[0];
    buffer[offset++] = triangle.a[1];
    buffer[offset++] = triangle.a[2];
    buffer[offset++] = triangle.b[0];
    buffer[offset++] = triangle.b[1];
    buffer[offset++] = triangle.b[2];
    buffer[offset++] = triangle.c[0];
    buffer[offset++] = triangle.c[1];
    buffer[offset++] = triangle.c[2];
  }
  return { triangles: buffer, triangleCount: triangles.length };
};

const primitiveColorMap = (subject: GeometrySubject): Map<string, string> => {
  const colors = new Map<string, string>();
  const primitives = subject.mesh.stats.boundingBox?.primitives ?? [];
  for (const primitive of primitives) {
    if (primitive.color) {
      colors.set(primitive.name, primitive.color);
    }
  }
  return colors;
};

const namedPartition = (
  triangles: readonly MeshTriangle[],
  colors: ReadonlyMap<string, string>,
): ComponentPartition | undefined => {
  const labelToId = new Map<string, number>();
  const componentIds = new Int32Array(triangles.length);
  const triangleCounts: number[] = [];

  for (const [index, triangle] of triangles.entries()) {
    const label = triangle.primitive.trim();
    if (!label) {
      return undefined;
    }
    let id = labelToId.get(label);
    if (id === undefined) {
      id = labelToId.size;
      labelToId.set(label, id);
      triangleCounts[id] = 0;
    }
    componentIds[index] = id;
    triangleCounts[id] = (triangleCounts[id] ?? 0) + 1;
  }

  if (labelToId.size < 2) {
    return undefined;
  }

  const components: GeoSpecNativeMeshComponent[] = [...labelToId.entries()].map(([label, id]) => ({
    id,
    label,
    color: colors.get(label),
    triangleCount: triangleCounts[id] ?? 0,
  }));
  return { source: 'named', componentIds, components };
};

const connectedPartition = (
  triangles: readonly MeshTriangle[],
  colors: ReadonlyMap<string, string>,
): ComponentPartition | undefined => {
  const positions: Array<[number, number, number]> = [];
  for (const triangle of triangles) {
    positions.push([...triangle.a], [...triangle.b], [...triangle.c]);
  }
  const welded = weldPositions(positions);
  const parent = new Int32Array(triangles.length);
  for (let index = 0; index < triangles.length; index++) {
    parent[index] = index;
  }
  const find = (value: number): number => {
    let current = value;
    while (parent[current] !== current) {
      parent[current] = parent[parent[current]!]!;
      current = parent[current]!;
    }
    return current;
  };
  const union = (left: number, right: number): void => {
    const leftRoot = find(left);
    const rightRoot = find(right);
    if (leftRoot !== rightRoot) {
      parent[leftRoot] = rightRoot;
    }
  };

  const canonicalToTriangles = new Map<number, number[]>();
  for (let triangleIndex = 0; triangleIndex < triangles.length; triangleIndex++) {
    for (let corner = 0; corner < 3; corner++) {
      const canonical = welded[triangleIndex * 3 + corner]!;
      const list = canonicalToTriangles.get(canonical) ?? [];
      list.push(triangleIndex);
      canonicalToTriangles.set(canonical, list);
    }
  }
  for (const list of canonicalToTriangles.values()) {
    for (let index = 1; index < list.length; index++) {
      union(list[0]!, list[index]!);
    }
  }

  const rootToId = new Map<number, number>();
  const componentIds = new Int32Array(triangles.length);
  const triangleCounts: number[] = [];
  const labels: string[] = [];
  for (let triangleIndex = 0; triangleIndex < triangles.length; triangleIndex++) {
    const root = find(triangleIndex);
    let id = rootToId.get(root);
    if (id === undefined) {
      id = rootToId.size;
      rootToId.set(root, id);
      triangleCounts[id] = 0;
      labels[id] = `connected-component-${id}`;
    }
    componentIds[triangleIndex] = id;
    triangleCounts[id] = (triangleCounts[id] ?? 0) + 1;
  }

  if (rootToId.size < 2) {
    return undefined;
  }

  const components: GeoSpecNativeMeshComponent[] = labels.map((label, id) => ({
    id,
    label,
    color: colors.get(label),
    triangleCount: triangleCounts[id] ?? 0,
  }));
  return { source: 'connected', componentIds, components };
};

const partitionComponents = (subject: GeometrySubject): ComponentPartition | undefined => {
  const { triangles } = subject.mesh.stats.meshQuality;
  const colors = primitiveColorMap(subject);
  return namedPartition(triangles, colors) ?? connectedPartition(triangles, colors);
};

const nativeUnavailableDiagnostic = (): GeometryDiagnostic => ({
  code: 'GEOSPEC_NATIVE_OVERLAP_UNAVAILABLE',
  severity: 'error',
  message: 'Component-overlap analysis requires the native GeoSpec OpenCascade mesh analyzer.',
  suggestion:
    'Use the bundled geospec/native/opencascade/single build or pass a GeoSpec native analyzer that implements analyzeMeshOverlap.',
});

const partitionInconclusiveDiagnostic = (subject: GeometrySubject): GeometryDiagnostic => ({
  code: 'GEOSPEC_COMPONENT_PARTITION_INCONCLUSIVE',
  severity: 'error',
  message: 'GeoSpec could not identify at least two independently testable mesh components.',
  suggestion:
    'Preserve component names/groups in the exported assembly, or test a source that returns separate closed parts.',
  details: {
    triangleCount: subject.mesh.stats.meshQuality.triangleCount,
    primitiveCount: new Set(subject.mesh.stats.meshQuality.triangles.map((triangle) => triangle.primitive)).size,
    source: subject.provenance.source,
    unit: subject.provenance.unit,
    parameters: subject.provenance.parameters,
  },
});

const overlapAnalysisFailedDiagnostic = (
  diagnostics: ReadonlyArray<{ code: string; message: string; details?: unknown }>,
): GeometryDiagnostic => ({
  code: 'GEOSPEC_COMPONENT_OVERLAP_ANALYSIS_FAILED',
  severity: 'error',
  message: 'Native component-overlap analysis failed before producing a reliable verdict.',
  suggestion: 'Check that every candidate component is a closed solid mesh and retry with valid geometry evidence.',
  details: { nativeDiagnostics: diagnostics },
});

const componentById = (components: readonly GeoSpecNativeMeshComponent[]): Map<number, GeoSpecNativeMeshComponent> =>
  new Map(components.map((component) => [component.id, component]));

const toVec3 = (value: [number, number, number] | undefined): Vec3 | undefined =>
  value === undefined ? undefined : [value[0], value[1], value[2]];

const enrichOverlaps = (
  nativeOverlaps: readonly GeoSpecNativeMeshOverlap[],
  components: readonly GeoSpecNativeMeshComponent[],
): MeshComponentOverlap[] => {
  const byId = componentById(components);
  return nativeOverlaps.map((overlap) => {
    const left = byId.get(overlap.leftComponentId);
    const right = byId.get(overlap.rightComponentId);
    return {
      leftComponentId: overlap.leftComponentId,
      rightComponentId: overlap.rightComponentId,
      leftLabel: left?.label ?? `component-${overlap.leftComponentId}`,
      rightLabel: right?.label ?? `component-${overlap.rightComponentId}`,
      leftColor: left?.color,
      rightColor: right?.color,
      intersectionVolume: overlap.intersectionVolume,
      witnessPoint: toVec3(overlap.witnessPoint),
      penetration: 'positive-volume',
    };
  });
};

const resolveNativeAnalyzer = async (
  provided: GeoSpecNativeMeshAnalyzer | undefined,
): Promise<GeoSpecNativeMeshAnalyzer | undefined> => {
  if (provided) {
    return provided;
  }
  try {
    const module_ = await import('geospec/native/opencascade/single');
    const factory = module_.default as (options?: unknown) => Promise<unknown>;
    return createOpenCascadeMeshAnalyzer((await factory()) as Parameters<typeof createOpenCascadeMeshAnalyzer>[0]);
  } catch {
    return undefined;
  }
};

/**
 * Analyze whether separate mesh components physically occupy the same solid
 * volume.
 *
 * The geometric verdict is native-only: GeoSpec does not fall back to coarse
 * bounding-volume checks or JavaScript triangle-pair approximation.
 *
 * @param options - Subject, optional tolerance, and optional native analyzer.
 * @returns Typed overlap evidence or diagnostics.
 * @public
 */
export const analyzeMeshOverlap = async (options: AnalyzeMeshOverlapOptions): Promise<AnalyzeMeshOverlapResult> => {
  const tolerance = options.tolerance ?? defaultOverlapTolerance;
  if (!Number.isFinite(tolerance) || tolerance < 0) {
    return {
      success: false,
      diagnostics: [
        {
          code: 'GEOSPEC_INVALID_EXPECTATION',
          severity: 'error',
          message: 'analyzeMeshOverlap received an invalid tolerance: expected a non-negative finite number.',
          suggestion: 'Use analyzeMeshOverlap({ subject, tolerance: 0.1 }).',
          details: { tolerance },
        },
      ],
    };
  }

  const partition = partitionComponents(options.subject);
  if (!partition) {
    return { success: false, diagnostics: [partitionInconclusiveDiagnostic(options.subject)] };
  }

  const nativeAnalyzer = await resolveNativeAnalyzer(options.nativeAnalyzer);
  if (!nativeAnalyzer?.analyzeMeshOverlap) {
    return { success: false, diagnostics: [nativeUnavailableDiagnostic()] };
  }

  try {
    const native = nativeAnalyzer.analyzeMeshOverlap({
      subject: toNativeTriangleSoup(options.subject.mesh.stats.meshQuality.triangles),
      componentIds: partition.componentIds,
      components: partition.components,
      tolerance,
    });
    if (!native.success) {
      return {
        success: false,
        diagnostics: [overlapAnalysisFailedDiagnostic(native.diagnostics ?? [])],
      };
    }
    const evidence: MeshOverlapEvidence = {
      componentSource: partition.source,
      componentCount: native.componentCount,
      checkedPairs: native.checkedPairs,
      tolerance,
      overlaps: enrichOverlaps(native.overlaps, partition.components),
    };
    return {
      success: true,
      evidence,
      diagnostics: [],
    };
  } catch (error) {
    return {
      success: false,
      diagnostics: [
        {
          code: 'GEOSPEC_COMPONENT_OVERLAP_ANALYSIS_FAILED',
          severity: 'error',
          message: error instanceof Error ? error.message : String(error),
          suggestion: 'Check the native GeoSpec OpenCascade mesh analyzer and the supplied mesh buffers.',
          details: error,
        },
      ],
    };
  }
};
