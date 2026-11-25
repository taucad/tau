import type { AnyShape, Drawing } from 'replicad';
import type { OpenCascadeInstance } from 'replicad-opencascadejs';
import type { SetRequired } from 'type-fest';
import type { GeometrySvg, RuntimeSpanTracer, TessellationReport } from '@taucad/runtime/types';
import { resolveOcctTessellation } from '@taucad/occt-core';
import type { OcctResolvedTessellation, OcctTessellation, OcctTessellationTolerances } from '@taucad/occt-core';
import type { ShapeConfig } from '#model.js';
import { addSurfaceCoordinates, needsSurfaceCoordinates } from '#utils/surface-coordinates.js';
import { normalizeColor } from '#utils/normalize-color.js';
import type { GeometryReplicad } from '#replicad.types.js';
import type { MemoMesh, ReplicadMeshMemo } from '#utils/mesh-memo.js';
import { resolveShapeName, uniqueShapeName } from '@taucad/geometry-core';
import { getOC } from 'replicad';

import {
  createReplicadOccurrenceReader,
  extractPrototypeEdges,
  extractPrototypeFaces,
  transformReplicadGeometryInstance,
} from '#utils/tessellation-instancing.js';
import type {
  Meshable,
  ReplicadShapeOccurrenceInfo,
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
  /** Meshes kept across renders (compute reuse on); without it every shape is meshed. */
  meshMemo?: ReplicadMeshMemo;
} & RenderTelemetry;

type RenderMeshOptions = {
  tessellation: Tessellation;
  collectBrepEdges: boolean;
  meshMemo?: ReplicadMeshMemo;
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
  info: ReplicadShapeOccurrenceInfo;
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

const emptyEdges = (): GeometryReplicad['edges'] => ({ lines: new Float32Array(0), edgeGroups: [] });

/**
 * Memo key of a mesh beyond the partner: how it was made. Orientation and placement because a flat mesh is in world
 * space, the exact tolerances, and the material because it decides the surface coordinates.
 * @param input - How the mesh is made: flat or as an instance, the occurrence, the tolerances and the material.
 * @param input.mode - Flat (world space) or an instance of a prototype.
 * @param input.info - The occurrence's identity and placement.
 * @param input.tessellation - The exact resolved tolerances.
 * @param input.material - The authored material, which decides the surface coordinates.
 * @returns The key.
 */
function meshMemoKey({
  mode,
  info,
  tessellation,
  material,
}: {
  mode: 'flat' | 'instanced';
  info: ReplicadShapeOccurrenceInfo;
  tessellation: Tessellation;
  material: InputShape['material'];
}): string {
  return [
    mode,
    info.orientation,
    info.locationMatrix.join(','),
    tessellation.linearTolerance,
    tessellation.angularTolerance,
    material === undefined ? '' : JSON.stringify(material),
  ].join('|');
}

/**
 * A geometry from a kept mesh, with this render's names and appearance. The arrays are shared with the memo; nothing
 * downstream writes to them (the glTF packer copies what it transforms).
 * @param shapeConfig - The shape as this render names and colours it.
 * @param mesh - The kept mesh.
 * @param collectBrepEdges - Whether this render delivers edges.
 * @returns The geometry.
 */
function geometryFromMemo(
  shapeConfig: MeshableConfiguration,
  mesh: MemoMesh,
  collectBrepEdges: boolean,
): GeometryReplicad {
  const { name, color, opacity, metalness, roughness, material } = shapeConfig;
  return {
    format: 'replicad',
    name,
    color,
    opacity,
    metalness,
    roughness,
    material,
    faces: mesh.faces,
    edges: collectBrepEdges && mesh.edges ? mesh.edges : emptyEdges(),
  };
}

function renderMesh(shapeConfig: MeshableConfiguration, options: RenderMeshOptions) {
  const { meshMemo } = options;
  if (!meshMemo) {
    return meshShape(shapeConfig, options);
  }
  const info = meshMemo.readOccurrence(shapeConfig.shape);
  const key = meshMemoKey({
    mode: 'flat',
    info,
    tessellation: options.tessellation,
    material: shapeConfig.material,
  });
  // A kept mesh without edges cannot serve a render that collects them: that is a miss, meshed again.
  const kept = meshMemo.lookup(info, key, {
    usable: (mesh) => mesh.edges !== undefined || !options.collectBrepEdges,
  });
  if (kept) {
    return geometryFromMemo(shapeConfig, kept, options.collectBrepEdges);
  }
  const geometry = meshShape(shapeConfig, options);
  meshMemo.store(info, key, {
    faces: geometry.faces,
    ...(options.collectBrepEdges ? { edges: geometry.edges } : {}),
  });
  return geometry;
}

function meshShape(shapeConfig: MeshableConfiguration, options: RenderMeshOptions) {
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

function isInstancingEligible(info: ReplicadShapeOccurrenceInfo): boolean {
  return info.canPrototypeMesh && info.partnerKey.length > 0 && Number.isFinite(info.determinant);
}

function groupMeshableInstances(
  instances: MeshableInstance[],
  tessellation: Tessellation,
  collectBrepEdges: boolean,
): {
  groups: PrototypeGroup[];
  grouped: Set<MeshableConfiguration>;
} {
  const candidates = new Map<string, PrototypeGroup>();

  for (const instance of instances) {
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

  // A partner-less shape is a group of one (catalogue N5): meshed unplaced like any prototype, with its placement
  // applied afterwards, so moving it changes no mesh the memo keeps.
  const groups = [...candidates.values()];
  const grouped = new Set<MeshableConfiguration>();
  for (const group of groups) {
    for (const instance of group.instances) {
      grouped.add(instance.config);
    }
  }

  return { groups, grouped };
}

function detectInstancingGroups({
  configs,
  openCascade,
  tessellation,
  collectBrepEdges,
  tracer,
  meshMemo,
}: {
  configs: NamedInputShape[];
  openCascade: OpenCascadeInstance;
  tessellation: Tessellation;
  collectBrepEdges: boolean;
  tracer?: RuntimeSpanTracer;
  meshMemo?: ReplicadMeshMemo;
}): {
  instances: MeshableInstance[];
  groups: PrototypeGroup[];
  grouped: Set<MeshableConfiguration>;
} {
  const span = tracer?.startSpan('replicad.tessellation-instancing.detect', {
    shapeCount: configs.length,
    linearTolerance: tessellation.linearTolerance,
    angularToleranceDeg: tessellation.angularTolerance,
    collectBrepEdges,
  });

  try {
    const readOccurrence = meshMemo?.readOccurrence ?? createReplicadOccurrenceReader(openCascade);
    const instances: MeshableInstance[] = [];
    for (const config of configs) {
      if (!hasMeshableShape(config)) {
        continue;
      }

      instances.push({
        config,
        info: readOccurrence(config.shape),
      });
    }

    const groupedResult = groupMeshableInstances(instances, tessellation, collectBrepEdges);
    const instanceCount = groupedResult.groups.reduce((total, group) => total + group.instances.length, 0);
    span?.end({
      meshableShapeCount: instances.length,
      prototypeCount: groupedResult.groups.length,
      instanceCount,
      eligibleInstanceCount: groupedResult.grouped.size,
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

/**
 * An instance's placement and appearance. No per-instance face or edge ids (catalogue N5): the glTF packer numbers
 * face and edge groups by their index, so an instance keeps the prototype's labels and the GLB is the same.
 * @param config - The instance's configuration.
 * @param info - The instance's occurrence.
 * @returns The instance.
 */
function instanceFromConfig(
  config: MeshableConfiguration,
  info: ReplicadShapeOccurrenceInfo,
): ReplicadTessellationInstance {
  return {
    name: config.name,
    color: config.color,
    opacity: config.opacity,
    metalness: config.metalness,
    roughness: config.roughness,
    material: config.material,
    locationMatrix: info.locationMatrix,
    determinant: info.determinant,
  };
}

type PrototypeGroupOptions = {
  group: PrototypeGroup;
  openCascade: OpenCascadeInstance;
  tessellation: Tessellation;
  collectBrepEdges: boolean;
  tracer?: RuntimeSpanTracer;
  meshMemo?: ReplicadMeshMemo;
};

/**
 * Memo key of a group's prototype mesh beyond the partner: its orientation, the exact tolerances and, when an
 * instance's material asks for surface coordinates, that it does and the prototype's placement (its tangent frames are
 * brought back through the prototype's location). Placement otherwise plays no part: the prototype is meshed unplaced.
 * The material's values play no part either: surface coordinates depend on geometry alone, and a kept mesh takes this
 * render's appearance, so a material-only edit is answered from the memo.
 * @param group - The group.
 * @param tessellation - The exact resolved tolerances.
 * @returns The key.
 */
function prototypeMemoKey(group: PrototypeGroup, tessellation: Tessellation): string {
  const surface = group.instances.some((instance) => needsSurfaceCoordinates(instance.config.material));
  return [
    'prototype',
    group.prototype.info.orientation,
    tessellation.linearTolerance,
    tessellation.angularTolerance,
    surface ? 'surface' : '',
    surface ? group.prototype.info.locationMatrix.join(',') : '',
  ].join('|');
}

/**
 * An instanced group, from the memo when every instance is where it was. Otherwise the prototype's unplaced mesh comes
 * from the memo when it has one (a pose edit moves instances, not prototypes) and only the placement is applied again.
 * The placed meshes are kept under a key naming each instance in group order, the prototype's under
 * {@link prototypeMemoKey}.
 * @param options - The group and how to mesh it.
 * @returns Each instance's configuration and geometry.
 */
function renderPrototypeGroup(options: PrototypeGroupOptions): Array<[MeshableConfiguration, GeometryReplicad]> {
  const { group, tessellation, collectBrepEdges, meshMemo } = options;
  if (!meshMemo) {
    return expandPrototypeGroup(options, meshPrototype(options));
  }
  const prototype = group.prototype.info;
  const key = [
    'group',
    ...group.instances.map((instance) =>
      meshMemoKey({ mode: 'instanced', info: instance.info, tessellation, material: instance.config.material }),
    ),
  ].join(';');
  const kept = meshMemo.lookupGroup(prototype, key, {
    instances: group.instances.length,
    usable: (meshes) => !collectBrepEdges || meshes.every((mesh) => mesh.edges !== undefined),
  });
  if (kept) {
    return group.instances.map((instance, index) => [
      instance.config,
      geometryFromMemo(instance.config, kept[index]!, collectBrepEdges),
    ]);
  }
  const prototypeKey = prototypeMemoKey(group, tessellation);
  // The group's parts count as reused when the prototype's unplaced mesh is kept: only the placement is applied again.
  const keptPrototype = meshMemo.lookup(prototype, prototypeKey, {
    usable: (mesh) => mesh.edges !== undefined || !collectBrepEdges,
    parts: group.instances.length,
  });
  let prototypeGeometry: GeometryReplicad;
  if (keptPrototype) {
    prototypeGeometry = geometryFromMemo(group.prototype.config, keptPrototype, collectBrepEdges);
  } else {
    prototypeGeometry = meshPrototype(options);
    meshMemo.store(prototype, prototypeKey, {
      faces: prototypeGeometry.faces,
      ...(collectBrepEdges ? { edges: prototypeGeometry.edges } : {}),
    });
  }
  const rendered = expandPrototypeGroup(options, prototypeGeometry);
  meshMemo.storeGroup(
    prototype,
    key,
    rendered.map(([, geometry]) => ({ faces: geometry.faces, ...(collectBrepEdges ? { edges: geometry.edges } : {}) })),
  );
  return rendered;
}

/**
 * A group's prototype, meshed unplaced, with the surface coordinates its instances' materials ask for.
 * @param options - The group and how to mesh it.
 * @returns The prototype's geometry.
 */
function meshPrototype({
  group,
  openCascade,
  tessellation,
  collectBrepEdges,
  tracer,
}: PrototypeGroupOptions): GeometryReplicad {
  const prototypeConfig = group.prototype.config;
  const prototypeGeometry = createEmptyReplicadGeometry(prototypeConfig);
  const shapeNames = group.instances.map((instance) => instance.config.name).join(',');
  const sharedAttributes = {
    // A group of one is a partner-less shape (N5): its spans name it as the flat path did.
    ...(group.instances.length === 1 ? { shapeName: prototypeConfig.name } : {}),
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

  return prototypeGeometry;
}

/**
 * Each instance of a group: the prototype's mesh at the instance's placement, with its names and appearance.
 * @param options - The group.
 * @param prototypeGeometry - The prototype's unplaced geometry.
 * @returns Each instance's configuration and geometry.
 */
function expandPrototypeGroup(
  { group, tracer }: PrototypeGroupOptions,
  prototypeGeometry: GeometryReplicad,
): Array<[MeshableConfiguration, GeometryReplicad]> {
  return withSpan({
    tracer,
    name: 'replicad.tessellation-instancing.expand',
    attributes: {
      partnerKey: group.prototype.info.partnerKey,
      instanceCount: group.instances.length,
      vertexCount: prototypeGeometry.faces.vertices.length / 3,
      triangleCount: prototypeGeometry.faces.triangles.length / 3,
      linePointCount: prototypeGeometry.edges.lines.length / 3,
    },
    operation: () =>
      group.instances.map((instance) => [
        instance.config,
        transformReplicadGeometryInstance({
          prototype: prototypeGeometry,
          instance: instanceFromConfig(instance.config, instance.info),
        }),
      ]),
  });
}

function renderWithTessellationInstancing(
  configs: NamedInputShape[],
  {
    openCascade,
    tessellation,
    collectBrepEdges,
    tracer,
    meshMemo,
  }: {
    openCascade: OpenCascadeInstance;
    tessellation: Tessellation;
    collectBrepEdges: boolean;
    tracer?: RuntimeSpanTracer;
    meshMemo?: ReplicadMeshMemo;
  },
): { geometries: Array<GeometrySvg | GeometryReplicad>; renderMode: RenderMode } {
  const { svgConfigs, meshConfigs } = partitionRenderConfigs(configs);
  const detection = detectInstancingGroups({
    configs: meshConfigs,
    openCascade,
    tessellation,
    collectBrepEdges,
    tracer,
    meshMemo,
  });

  if (detection.groups.length === 0) {
    return {
      geometries: render(configs, {
        tessellation,
        collectBrepEdges,
        tracer,
        tessellationInstancing: false,
        meshMemo,
      }),
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
      meshMemo,
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
    geometries.push(renderMesh(shapeConfig, { tessellation, collectBrepEdges, tracer, meshMemo }));
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
 * @throws When tessellation instancing is on and detection or prototype meshing fails; there is no flat fallback.
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
    meshMemo,
  }: RenderOptions = {},
): Array<GeometrySvg | GeometryReplicad> {
  if (tessellationInstancing && openCascade) {
    // No flat fallback: flat meshing delivers different bytes, so a detection or instancing failure is a render error
    // (the kernel reports it as a build issue) rather than a silent change of output.
    const result = renderWithTessellationInstancing(shapes, {
      openCascade,
      tessellation,
      collectBrepEdges,
      tracer,
      meshMemo,
    });
    onRenderMode?.(result.renderMode);
    return result.geometries;
  }

  onRenderMode?.('flat');
  const { svgConfigs, meshConfigs } = partitionRenderConfigs(shapes);
  return [
    ...meshConfigs.map((shapeConfig) => renderMesh(shapeConfig, { tessellation, collectBrepEdges, tracer, meshMemo })),
    ...renderSvgArtifacts(svgConfigs),
  ];
}

/** A tessellation request: a preset or explicit tolerances, and the field values an explicit request omits. */
export type ReplicadTessellationRequest = Readonly<{
  tessellation: OcctTessellation;
  explicitDefaults: OcctTessellationTolerances;
}>;

/* oxlint-disable eslint/new-cap -- OCCT methods retain their native C++ names. */
/**
 * Bounding-box diagonal of every meshable shape together, in model millimetres. Reads the
 * B-rep geometry (not a triangulation), so it does not depend on any earlier meshing. The box is
 * OCCT's cheap one (`BRepBndLib.Add`): it bounds each surface from its definition instead of
 * sampling it, so it is never smaller than the tight box and, on curved and B-spline models, a few
 * percent larger. A preset only needs the model's rough size, and replicad's tight
 * `shape.boundingBox` (`AddOptimal`) costs up to half a second on a gear assembly.
 *
 * @param shapes - Shapes about to be meshed; drawings are ignored.
 * @returns The diagonal, or `NaN` when no meshable shape has extent.
 */
export function measureShapesDiagonal(shapes: readonly InputShape[]): number {
  const meshable = shapes.filter((config) => hasMeshableShape(config));
  if (meshable.length === 0) {
    return Number.NaN;
  }
  const oc = getOC();
  const box = new oc.Bnd_Box();
  try {
    for (const { shape } of meshable) {
      oc.BRepBndLib.Add(shape.wrapped, box, false);
    }
    if (box.IsVoid()) {
      return Number.NaN;
    }
    const low = box.CornerMin();
    const high = box.CornerMax();
    const diagonal = Math.hypot(high.X() - low.X(), high.Y() - low.Y(), high.Z() - low.Z());
    low.delete();
    high.delete();
    return diagonal;
  } finally {
    box.delete();
  }
}
/* oxlint-enable eslint/new-cap */

/**
 * Resolve a request into absolute tolerances. Explicit tolerances never measure the shapes.
 *
 * @param shapes - Shapes about to be meshed.
 * @param request - The preset or explicit tolerances.
 * @param reuse - Kept boxes, when the render uses them.
 * @param reuse.meshMemo - Boxes kept across renders (N2); without it every shape is measured.
 * @returns Absolute tolerances and the requested form.
 */
export function resolveReplicadTessellation(
  shapes: readonly InputShape[],
  request: ReplicadTessellationRequest,
  { meshMemo }: { meshMemo?: ReplicadMeshMemo } = {},
): OcctResolvedTessellation {
  return resolveOcctTessellation({
    ...request,
    measureDiagonal: () =>
      meshMemo
        ? meshMemo.diagonal(shapes.filter((config) => hasMeshableShape(config)).map(({ shape }) => shape as Meshable))
        : measureShapesDiagonal(shapes),
  });
}

/**
 * Triangles and vertices of rendered geometries, summed over every delivered part.
 *
 * @param geometries - Rendered geometries; drawings count nothing.
 * @returns Triangle and vertex counts.
 */
function countMesh(geometries: ReadonlyArray<GeometrySvg | GeometryReplicad>): {
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

/** A rendering at the requested tessellation, with its cost report. */
export type TessellatedRender = {
  geometries: Array<GeometrySvg | GeometryReplicad>;
  tessellation: TessellationReport;
};

/**
 * Render at the requested tessellation, once. The request resolves to absolute tolerances and
 * the mesh is never coarsened; the report carries its triangles, vertices, elapsed time and the
 * tolerances it was produced at.
 *
 * @param shapes - The shapes to render.
 * @param options - Request and the {@link render} options other than tessellation.
 * @returns Geometries and the tessellation report.
 */
export function renderTessellated(
  shapes: NamedInputShape[],
  options: Omit<RenderOptions, 'tessellation'> & { request: ReplicadTessellationRequest },
): TessellatedRender {
  const { request, ...renderOptions } = options;
  const started = performance.now();
  const requested = resolveReplicadTessellation(shapes, request, { meshMemo: renderOptions.meshMemo });
  const geometries = render(shapes, { ...renderOptions, tessellation: requested });
  return {
    geometries,
    tessellation: {
      ...countMesh(geometries),
      elapsed: performance.now() - started,
      requested: requested.requested,
      linearTolerance: requested.linearTolerance,
      angularTolerance: requested.angularTolerance,
    },
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
