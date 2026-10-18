import type { AnyShape, Drawing } from 'replicad';
import type { OpenCascadeInstance } from 'replicad-opencascadejs';
import type { SetRequired } from 'type-fest';
import type { GeometrySvg, KernelIssue, RuntimeSpanTracer, TessellationReport } from '@taucad/runtime/types';
import {
  createTessellationDowngradedIssue,
  resolveOcctTessellation,
  tessellateWithinOcctBudget,
} from '@taucad/occt-core';
import type { OcctResolvedTessellation, OcctTessellation, OcctTessellationTolerances } from '@taucad/occt-core';
import type { ShapeConfig } from '#model.js';
import { addSurfaceCoordinates } from '#utils/surface-coordinates.js';
import { normalizeColor } from '#utils/normalize-color.js';
import type { GeometryReplicad } from '#replicad.types.js';
import { resolveShapeName, uniqueShapeName } from '@taucad/geometry-core';

import {
  extractInstanceEdgeIds,
  extractInstanceFaceIds,
  extractPrototypeEdges,
  extractPrototypeFaces,
  inspectReplicadShapeIdentity,
  transformReplicadGeometryInstance,
} from '#utils/tessellation-instancing.js';
import type {
  Meshable,
  ReplicadShapeIdentityInfo,
  ReplicadTessellationInstance,
} from '#utils/tessellation-instancing.js';

type Tessellation = {
  linearTolerance: number;
  angularTolerance: number;
};

type Svgable = SetRequired<Drawing, 'toSVGPaths' | 'toSVGViewBox'>;

type RenderMode = 'flat' | 'tessellation-instanced' | 'mixed';

type ParsedSvgViewBox = {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
};

type RenderTelemetry = {
  tracer?: RuntimeSpanTracer;
  onRenderMode?: (mode: RenderMode) => void;
};

type RenderOptions = {
  tessellation?: Tessellation;
  collectBrepEdges?: boolean;
  openCascade?: OpenCascadeInstance;
  tessellationInstancing?: boolean;
} & RenderTelemetry;

type RenderMeshOptions = {
  tessellation: Tessellation;
  collectBrepEdges: boolean;
} & RenderTelemetry;

type SpanOperation<T> = {
  tracer?: RuntimeSpanTracer;
  name: string;
  attributes: Record<string, string | number | boolean>;
  operation: () => T;
};

/** Replicad authoring config used by the meshing adapter. */
export type InputShape = { [Key in keyof ShapeConfig]: ShapeConfig[Key] };

/** An input shape whose display name has been resolved and de-duplicated. @public */
export type NamedInputShape = InputShape & { name: string };

type SvgShapeConfiguration = NamedInputShape & { shape: Svgable };

type MeshableConfiguration = NamedInputShape & { shape: Meshable };
type MeshableInstance = {
  config: MeshableConfiguration;
  info: ReplicadShapeIdentityInfo;
};

type PrototypeGroup = {
  key: string;
  prototype: MeshableInstance;
  instances: MeshableInstance[];
};

const isSvgable = (shape: unknown): shape is Svgable => {
  return (
    typeof shape === 'object' &&
    shape !== null &&
    Boolean((shape as Svgable).toSVGPaths) &&
    Boolean((shape as Svgable).toSVGViewBox)
  );
};

/**
 * Whether a retained shape can be rendered as a drawing.
 * @param shape - Shape in a live Replicad handle.
 * @returns True for SVG-capable drawings.
 */
export const isDrawingShape = (shape: unknown): boolean => isSvgable(shape);

const isMeshable = (shape: unknown): shape is Meshable => {
  return (
    typeof shape === 'object' &&
    shape !== null &&
    // oxlint-disable-next-line @typescript-eslint/no-unnecessary-condition -- runtime defensive guard against nullish values
    Boolean((shape as Meshable).mesh && (shape as Meshable).meshEdges)
  );
};

const hasSvgableShape = (config: InputShape): config is SvgShapeConfiguration => isSvgable(config.shape);

const hasMeshableShape = (config: InputShape): config is MeshableConfiguration => isMeshable(config.shape);

function partitionRenderConfigs(configs: NamedInputShape[]): {
  svgConfigs: SvgShapeConfiguration[];
  meshConfigs: MeshableConfiguration[];
} {
  const svgConfigs: SvgShapeConfiguration[] = [];
  const meshConfigs: MeshableConfiguration[] = [];

  for (const config of configs) {
    if (hasSvgableShape(config)) {
      svgConfigs.push(config);
      continue;
    }

    if (hasMeshableShape(config)) {
      meshConfigs.push(config);
      continue;
    }

    throw new Error('Invalid shape');
  }

  return { svgConfigs, meshConfigs };
}

const isInputShape = (shape: unknown): shape is InputShape => {
  return typeof shape === 'object' && shape !== null && Boolean((shape as InputShape).shape);
};

function resolveReplicadShapeNames(shapes: InputShape[], defaultName?: string): Array<InputShape & { name: string }> {
  const usedNames = new Map<string, number>();
  return shapes.map((inputShape, index) => {
    const { name, ...rest } = inputShape;
    const resolvedName = resolveShapeName({
      index,
      name: name ?? defaultName,
      source: 'authored',
    });

    return {
      name: uniqueShapeName(resolvedName, usedNames),
      ...rest,
    };
  });
}

function createBasicShapeConfig(inputShapes: unknown, defaultName?: string): Array<InputShape & { name: string }> {
  // We accept a single shape or an array of shapes
  const raw: unknown[] = Array.isArray(inputShapes) ? inputShapes : [inputShapes];

  // Filter out nullish entries (e.g., from main() returning undefined)
  // oxlint-disable-next-line @typescript-eslint/no-unnecessary-condition -- runtime values can be nullish despite types
  const shapes = raw.filter((shape): shape is AnyShape | InputShape => shape !== null && shape !== undefined);

  const shapeConfigs = shapes.map((inputShape) => {
    if (isInputShape(inputShape)) {
      return inputShape;
    }

    return {
      shape: inputShape,
    };
  });

  return resolveReplicadShapeNames(shapeConfigs, defaultName);
}

function normalizeColorAndOpacity(shape: InputShape): InputShape {
  if (shape.material !== undefined) {
    if (['color', 'opacity', 'metalness', 'roughness'].some((key) => shape[key as keyof InputShape] !== undefined)) {
      throw new TypeError('Use material or legacy color/opacity/metalness/roughness, not both.');
    }
    return shape;
  }
  const { color, opacity, ...rest } = shape;

  const normalizedColor: undefined | { color: string; alpha: number } = color ? normalizeColor(color) : undefined;
  let configuredOpacity: undefined | number = opacity;
  if (normalizedColor && normalizedColor.alpha !== 1) {
    configuredOpacity = opacity ?? normalizedColor.alpha;
  }

  return {
    ...rest,
    color: normalizedColor?.color,
    opacity: configuredOpacity,
  };
}

const escapeSvgAttribute = (value: string): string =>
  value.replaceAll('&', '&amp;').replaceAll('"', '&quot;').replaceAll('<', '&lt;');

const normalizeSvgPathEntries = (paths: string[] | string[][]): string[] => {
  const flattened: unknown[] = paths.flat();
  return flattened.map((path) => {
    if (typeof path !== 'string') {
      throw new TypeError('Replicad SVG path entries must be strings.');
    }
    return path;
  });
};

const strokeDashArray = (strokeType: string | undefined): string | undefined => {
  if (strokeType === 'dots') {
    return '1 3';
  }
  if (strokeType === 'dashes') {
    return '8 4';
  }
  return undefined;
};

const defaultSvgStrokeWidth = '1';
const defaultSvgVectorEffect = 'non-scaling-stroke';

const parseSvgViewBox = (viewBox: string): ParsedSvgViewBox => {
  const values = viewBox
    .trim()
    .split(/[\s,]+/)
    .filter(Boolean)
    .map(Number);

  if (values.length !== 4 || values.some((value) => !Number.isFinite(value))) {
    throw new TypeError(`Replicad SVG viewBox must contain four finite numbers: ${viewBox}`);
  }

  const minX = values[0]!;
  const minY = values[1]!;
  const width = values[2]!;
  const height = values[3]!;
  return {
    minX,
    minY,
    maxX: minX + width,
    maxY: minY + height,
  };
};

const formatSvgNumber = (value: number): string => (Object.is(value, -0) ? '0' : String(value));

const formatSvgViewBox = (boxes: readonly ParsedSvgViewBox[]): string => {
  if (boxes.length === 0) {
    throw new TypeError('Replicad SVG render requires at least one SVG viewBox.');
  }

  const minX = Math.min(...boxes.map((box) => box.minX));
  const minY = Math.min(...boxes.map((box) => box.minY));
  const maxX = Math.max(...boxes.map((box) => box.maxX));
  const maxY = Math.max(...boxes.map((box) => box.maxY));
  return [minX, minY, maxX - minX, maxY - minY].map((value) => formatSvgNumber(value)).join(' ');
};

function renderSvgPathElements(shapeConfig: SvgShapeConfiguration): string[] {
  const { shape, color, strokeType, opacity } = shapeConfig;
  const stroke = escapeSvgAttribute(color ?? 'currentColor');
  const opacityAttribute = opacity === undefined ? '' : ` opacity="${opacity}"`;
  const dashArray = strokeDashArray(strokeType);
  const dashAttribute = dashArray === undefined ? '' : ` stroke-dasharray="${dashArray}"`;
  return normalizeSvgPathEntries(shape.toSVGPaths()).map(
    (path) =>
      `<path d="${escapeSvgAttribute(path)}" fill="none" stroke="${stroke}" stroke-width="${defaultSvgStrokeWidth}" vector-effect="${defaultSvgVectorEffect}"${opacityAttribute}${dashAttribute}/>`,
  );
}

function renderSvgDocument(shapeConfigs: readonly SvgShapeConfiguration[]): GeometrySvg {
  if (shapeConfigs.length === 0) {
    throw new TypeError('Replicad SVG render requires at least one SVG shape.');
  }

  const viewBox = escapeSvgAttribute(
    formatSvgViewBox(shapeConfigs.map((shapeConfig) => parseSvgViewBox(shapeConfig.shape.toSVGViewBox()))),
  );
  const paths = shapeConfigs.flatMap((shapeConfig) => renderSvgPathElements(shapeConfig)).join('');

  return {
    format: 'svg',
    units: { length: 'mm' },
    ...(shapeConfigs.length === 1 ? { name: shapeConfigs[0]!.name } : {}),
    content: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${viewBox}">${paths}</svg>`,
  };
}

function renderSvg(shapeConfig: SvgShapeConfiguration): GeometrySvg {
  return renderSvgDocument([shapeConfig]);
}

const renderSvgArtifacts = (shapeConfigs: readonly SvgShapeConfiguration[]): GeometrySvg[] => {
  if (shapeConfigs.length === 0) {
    return [];
  }
  return [shapeConfigs.length === 1 ? renderSvg(shapeConfigs[0]!) : renderSvgDocument(shapeConfigs)];
};

const defaultPreviewTessellation: Tessellation = {
  linearTolerance: 0.02,
  angularTolerance: 20,
};

function withSpan<T>({ tracer, name, attributes, operation }: SpanOperation<T>): T {
  const span = tracer?.startSpan(name, attributes);
  try {
    return operation();
  } finally {
    span?.end();
  }
}

function renderMesh(shapeConfig: MeshableConfiguration, options: RenderMeshOptions) {
  const { name, shape, color, opacity, metalness, roughness, material } = shapeConfig;
  const { tessellation, collectBrepEdges, tracer } = options;
  const geometry: GeometryReplicad = {
    format: 'replicad',
    name,
    color,
    opacity,
    metalness,
    roughness,
    material,
    faces: {
      triangles: new Uint32Array(0),
      vertices: new Float32Array(0),
      normals: new Float32Array(0),
      faceGroups: [],
    },
    edges: {
      lines: new Float32Array(0),
      edgeGroups: [],
    },
  };

  const angularToleranceRad = tessellation.angularTolerance * (Math.PI / 180);
  const tessellationAttributes = {
    shapeName: name,
    linearTolerance: tessellation.linearTolerance,
    angularToleranceDeg: tessellation.angularTolerance,
    collectBrepEdges,
  };

  geometry.faces = withSpan({
    tracer,
    name: 'replicad.tessellate.faces',
    attributes: {
      ...tessellationAttributes,
      output: 'faces',
    },
    operation: () =>
      shape.mesh({
        tolerance: tessellation.linearTolerance,
        angularTolerance: angularToleranceRad,
      }),
  });

  addSurfaceCoordinates(shape, geometry.faces, { material });

  if (collectBrepEdges) {
    geometry.edges = withSpan({
      tracer,
      name: 'replicad.tessellate.edges',
      attributes: {
        ...tessellationAttributes,
        output: 'edges',
      },
      operation: () =>
        shape.meshEdges({
          tolerance: tessellation.linearTolerance,
          angularTolerance: angularToleranceRad,
        }),
    });
  }

  return geometry;
}

function createEmptyReplicadGeometry(shapeConfig: MeshableConfiguration): GeometryReplicad {
  const { name, color, opacity, metalness, roughness, material } = shapeConfig;
  return {
    format: 'replicad',
    name,
    color,
    opacity,
    metalness,
    roughness,
    material,
    faces: {
      triangles: new Uint32Array(0),
      vertices: new Float32Array(0),
      normals: new Float32Array(0),
      faceGroups: [],
    },
    edges: {
      lines: new Float32Array(0),
      edgeGroups: [],
    },
  };
}

function instancingGroupKey(instance: MeshableInstance, tessellation: Tessellation, collectBrepEdges: boolean): string {
  const { info } = instance;
  return [
    info.partnerKey,
    info.orientation,
    tessellation.linearTolerance,
    tessellation.angularTolerance,
    collectBrepEdges,
  ].join('|');
}

function isInstancingEligible(info: ReplicadShapeIdentityInfo): boolean {
  return info.canPrototypeMesh && info.partnerKey.length > 0 && Number.isFinite(info.determinant);
}

function groupMeshableInstances(
  instances: MeshableInstance[],
  tessellation: Tessellation,
  collectBrepEdges: boolean,
): {
  groups: PrototypeGroup[];
  grouped: Set<MeshableConfiguration>;
  missedContentHashGroups: number;
} {
  const candidates = new Map<string, PrototypeGroup>();
  const contentHashes = new Map<string, number>();

  for (const instance of instances) {
    contentHashes.set(instance.info.prototypeHash, (contentHashes.get(instance.info.prototypeHash) ?? 0) + 1);
    if (!isInstancingEligible(instance.info)) {
      continue;
    }

    const key = instancingGroupKey(instance, tessellation, collectBrepEdges);
    const group = candidates.get(key);
    if (group) {
      group.instances.push(instance);
    } else {
      candidates.set(key, { key, prototype: instance, instances: [instance] });
    }
  }

  const groups = [...candidates.values()].filter((group) => group.instances.length > 1);
  const grouped = new Set<MeshableConfiguration>();
  for (const group of groups) {
    for (const instance of group.instances) {
      grouped.add(instance.config);
    }
  }

  let missedContentHashGroups = 0;
  for (const count of contentHashes.values()) {
    if (count > 1) {
      missedContentHashGroups++;
    }
  }
  missedContentHashGroups = Math.max(0, missedContentHashGroups - groups.length);

  return { groups, grouped, missedContentHashGroups };
}

function detectInstancingGroups({
  configs,
  openCascade,
  tessellation,
  collectBrepEdges,
  tracer,
}: {
  configs: NamedInputShape[];
  openCascade: OpenCascadeInstance;
  tessellation: Tessellation;
  collectBrepEdges: boolean;
  tracer?: RuntimeSpanTracer;
}): {
  instances: MeshableInstance[];
  groups: PrototypeGroup[];
  grouped: Set<MeshableConfiguration>;
  missedContentHashGroups: number;
} {
  const span = tracer?.startSpan('replicad.tessellation-instancing.detect', {
    shapeCount: configs.length,
    linearTolerance: tessellation.linearTolerance,
    angularToleranceDeg: tessellation.angularTolerance,
    collectBrepEdges,
  });

  try {
    const instances: MeshableInstance[] = [];
    for (const config of configs) {
      if (!hasMeshableShape(config)) {
        continue;
      }

      instances.push({
        config,
        info: inspectReplicadShapeIdentity({ openCascade, shape: config.shape }),
      });
    }

    const groupedResult = groupMeshableInstances(instances, tessellation, collectBrepEdges);
    const instanceCount = groupedResult.groups.reduce((total, group) => total + group.instances.length, 0);
    span?.end({
      meshableShapeCount: instances.length,
      prototypeCount: groupedResult.groups.length,
      instanceCount,
      eligibleInstanceCount: groupedResult.grouped.size,
      missedContentHashGroups: groupedResult.missedContentHashGroups,
    });

    return {
      instances,
      ...groupedResult,
    };
  } catch (error) {
    span?.end({ failed: true });
    throw error;
  }
}

function instanceFromConfig({
  config,
  info,
  faceIds,
  edgeIds,
}: {
  config: MeshableConfiguration;
  info: ReplicadShapeIdentityInfo;
  faceIds: number[];
  edgeIds: number[];
}): ReplicadTessellationInstance {
  return {
    name: config.name,
    color: config.color,
    opacity: config.opacity,
    metalness: config.metalness,
    roughness: config.roughness,
    material: config.material,
    locationMatrix: info.locationMatrix,
    determinant: info.determinant,
    faceIds,
    edgeIds,
  };
}

function renderPrototypeGroup({
  group,
  openCascade,
  tessellation,
  collectBrepEdges,
  tracer,
}: {
  group: PrototypeGroup;
  openCascade: OpenCascadeInstance;
  tessellation: Tessellation;
  collectBrepEdges: boolean;
  tracer?: RuntimeSpanTracer;
}): Array<[MeshableConfiguration, GeometryReplicad]> {
  const prototypeConfig = group.prototype.config;
  const prototypeGeometry = createEmptyReplicadGeometry(prototypeConfig);
  const shapeNames = group.instances.map((instance) => instance.config.name).join(',');
  const sharedAttributes = {
    prototypeHash: group.prototype.info.prototypeHash,
    partnerKey: group.prototype.info.partnerKey,
    instanceCount: group.instances.length,
    shapeNames,
    linearTolerance: tessellation.linearTolerance,
    angularToleranceDeg: tessellation.angularTolerance,
    collectBrepEdges,
  };

  prototypeGeometry.faces = withSpan({
    tracer,
    name: 'replicad.tessellate.faces',
    attributes: {
      ...sharedAttributes,
      output: 'faces',
    },
    operation: () => extractPrototypeFaces({ openCascade, shape: prototypeConfig.shape, tessellation }),
  });

  for (const instance of group.instances) {
    addSurfaceCoordinates(prototypeConfig.shape, prototypeGeometry.faces, {
      material: instance.config.material,
      prototype: true,
    });
  }

  if (collectBrepEdges) {
    prototypeGeometry.edges = withSpan({
      tracer,
      name: 'replicad.tessellate.edges',
      attributes: {
        ...sharedAttributes,
        output: 'edges',
      },
      operation: () => extractPrototypeEdges({ openCascade, shape: prototypeConfig.shape, tessellation }),
    });
  }

  return withSpan({
    tracer,
    name: 'replicad.tessellation-instancing.expand',
    attributes: {
      prototypeHash: group.prototype.info.prototypeHash,
      partnerKey: group.prototype.info.partnerKey,
      instanceCount: group.instances.length,
      vertexCount: prototypeGeometry.faces.vertices.length / 3,
      triangleCount: prototypeGeometry.faces.triangles.length / 3,
      linePointCount: prototypeGeometry.edges.lines.length / 3,
    },
    operation: () =>
      group.instances.map((instance) => {
        const faceIds = extractInstanceFaceIds({ openCascade, shape: instance.config.shape, tessellation });
        const edgeIds = collectBrepEdges
          ? extractInstanceEdgeIds({ openCascade, shape: instance.config.shape, tessellation })
          : [];
        return [
          instance.config,
          transformReplicadGeometryInstance({
            prototype: prototypeGeometry,
            instance: instanceFromConfig({ config: instance.config, info: instance.info, faceIds, edgeIds }),
          }),
        ];
      }),
  });
}

function renderWithTessellationInstancing(
  configs: NamedInputShape[],
  {
    openCascade,
    tessellation,
    collectBrepEdges,
    tracer,
  }: {
    openCascade: OpenCascadeInstance;
    tessellation: Tessellation;
    collectBrepEdges: boolean;
    tracer?: RuntimeSpanTracer;
  },
): { geometries: Array<GeometrySvg | GeometryReplicad>; renderMode: RenderMode } {
  const { svgConfigs, meshConfigs } = partitionRenderConfigs(configs);
  const detection = detectInstancingGroups({
    configs: meshConfigs,
    openCascade,
    tessellation,
    collectBrepEdges,
    tracer,
  });

  if (detection.groups.length === 0) {
    return {
      geometries: render(configs, { tessellation, collectBrepEdges, tracer, tessellationInstancing: false }),
      renderMode: 'flat',
    };
  }

  const groupedGeometries = new Map<MeshableConfiguration, GeometryReplicad>();
  for (const group of detection.groups) {
    for (const [config, geometry] of renderPrototypeGroup({
      group,
      openCascade,
      tessellation,
      collectBrepEdges,
      tracer,
    })) {
      groupedGeometries.set(config, geometry);
    }
  }

  let legacyMeshCount = 0;
  const geometries: Array<GeometrySvg | GeometryReplicad> = [];
  for (const shapeConfig of meshConfigs) {
    const grouped = groupedGeometries.get(shapeConfig);
    if (grouped) {
      geometries.push(grouped);
      continue;
    }

    legacyMeshCount++;
    geometries.push(renderMesh(shapeConfig, { tessellation, collectBrepEdges, tracer }));
  }
  geometries.push(...renderSvgArtifacts(svgConfigs));

  return {
    geometries,
    renderMode: legacyMeshCount === 0 ? 'tessellation-instanced' : 'mixed',
  };
}

/**
 * Renders an array of input shapes into geometry representations.
 *
 * @param shapes - The shapes to render with optional color/name metadata
 * @param options - Tessellation, BRep edge, and telemetry options
 * @returns An array of SVG or Replicad geometry objects
 */
export function render(
  shapes: NamedInputShape[],
  {
    tessellation = defaultPreviewTessellation,
    collectBrepEdges = false,
    tracer,
    openCascade,
    tessellationInstancing = false,
    onRenderMode,
  }: RenderOptions = {},
): Array<GeometrySvg | GeometryReplicad> {
  if (tessellationInstancing && openCascade) {
    try {
      const result = renderWithTessellationInstancing(shapes, {
        openCascade,
        tessellation,
        collectBrepEdges,
        tracer,
      });
      onRenderMode?.(result.renderMode);
      return result.geometries;
    } catch {
      onRenderMode?.('flat');
      return render(shapes, { tessellation, collectBrepEdges, tracer, tessellationInstancing: false });
    }
  }

  onRenderMode?.('flat');
  const { svgConfigs, meshConfigs } = partitionRenderConfigs(shapes);
  return [
    ...meshConfigs.map((shapeConfig) => renderMesh(shapeConfig, { tessellation, collectBrepEdges, tracer })),
    ...renderSvgArtifacts(svgConfigs),
  ];
}

/** A tessellation request: a preset or explicit tolerances, and the field values an explicit request omits. */
export type ReplicadTessellationRequest = Readonly<{
  tessellation: OcctTessellation;
  explicitDefaults: OcctTessellationTolerances;
}>;

/**
 * Bounding-box diagonal of every meshable shape together, in model millimetres. Reads the
 * B-rep geometry (not a triangulation), so it does not depend on any earlier meshing.
 *
 * @param shapes - Shapes about to be meshed; drawings are ignored.
 * @returns The diagonal, or `NaN` when no meshable shape has extent.
 */
export function measureShapesDiagonal(shapes: readonly InputShape[]): number {
  const boxes = shapes.filter((config) => hasMeshableShape(config)).map(({ shape }) => shape.boundingBox);
  const [combined, ...rest] = boxes;
  if (combined === undefined) {
    return Number.NaN;
  }
  try {
    for (const box of rest) {
      combined.add(box);
    }
    const [min, max] = combined.bounds;
    return Math.hypot(max[0] - min[0], max[1] - min[1], max[2] - min[2]);
  } catch {
    // A void box (an empty compound) has no corners.
    return Number.NaN;
  } finally {
    for (const box of boxes) {
      box.delete();
    }
  }
}

/**
 * Resolve a request into absolute tolerances. Explicit tolerances never measure the shapes.
 *
 * @param shapes - Shapes about to be meshed.
 * @param request - The preset or explicit tolerances.
 * @returns Absolute tolerances and the requested form.
 */
export function resolveReplicadTessellation(
  shapes: readonly InputShape[],
  request: ReplicadTessellationRequest,
): OcctResolvedTessellation {
  return resolveOcctTessellation({ ...request, measureDiagonal: () => measureShapesDiagonal(shapes) });
}

/**
 * Triangles and vertices of rendered geometries, summed over every delivered part.
 *
 * @param geometries - Rendered geometries; drawings count nothing.
 * @returns Triangle and vertex counts.
 */
export function countMesh(geometries: ReadonlyArray<GeometrySvg | GeometryReplicad>): {
  triangles: number;
  vertices: number;
} {
  let triangles = 0;
  let vertices = 0;
  for (const geometry of geometries) {
    if (geometry.format === 'replicad') {
      triangles += geometry.faces.triangles.length / 3;
      vertices += geometry.faces.vertices.length / 3;
    }
  }
  return { triangles, vertices };
}

/** A rendering within a triangle budget, with its cost report and any downgrade warning. */
export type BudgetedRender = {
  geometries: Array<GeometrySvg | GeometryReplicad>;
  tessellation: TessellationReport;
  issues: KernelIssue[];
};

/**
 * Render a preview within a triangle budget. The request resolves to absolute tolerances; while
 * the mesh exceeds the budget it is re-tessellated one step coarser, at most three times, and a
 * `TESSELLATION_DOWNGRADED` warning names the requested and effective tolerances.
 *
 * @param shapes - The shapes to render.
 * @param options - Request, budget, and the {@link render} options other than tessellation.
 * @returns Geometries, the tessellation report and the downgrade warning when one was taken.
 */
export function renderWithinBudget(
  shapes: NamedInputShape[],
  options: Omit<RenderOptions, 'tessellation'> & {
    request: ReplicadTessellationRequest;
    budget: number;
  },
): BudgetedRender {
  const { request, budget, ...renderOptions } = options;
  const started = performance.now();
  const requested = resolveReplicadTessellation(shapes, request);
  const { result, effective, downgraded } = tessellateWithinOcctBudget({
    tolerances: requested,
    budget,
    tessellate(tolerances) {
      const geometries = render(shapes, { ...renderOptions, tessellation: tolerances });
      return { geometries, ...countMesh(geometries) };
    },
  });
  const elapsed = performance.now() - started;
  return {
    geometries: result.geometries,
    tessellation: {
      triangles: result.triangles,
      vertices: result.vertices,
      elapsed,
      requested: requested.requested,
      linearTolerance: effective.linearTolerance,
      angularTolerance: effective.angularTolerance,
      downgraded,
    },
    issues:
      downgraded === 0
        ? []
        : [
            createTessellationDowngradedIssue({
              producer: 'replicad',
              requested,
              effective,
              downgraded,
              triangles: result.triangles,
              budget,
            }),
          ],
  };
}

/**
 * Normalize a model's main-function output into named, color-normalized shape
 * configs — the build-phase half of the former `renderOutput`. The result is
 * the raw material for the replicad nativeHandle; tessellation happens later
 * (and only on the display path) via {@link render} in `meshGeometry`.
 *
 * @param shapes - Raw main() return value
 * @param defaultName - Optional model-declared default shape name
 * @returns Named input shape configs with normalized color/opacity
 */
export function normalizeRenderShapes(shapes: unknown, defaultName?: string): NamedInputShape[] {
  const baseShape = createBasicShapeConfig(shapes, defaultName).map((element) => normalizeColorAndOpacity(element));
  return resolveReplicadShapeNames(baseShape);
}
