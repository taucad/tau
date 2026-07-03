import type { AnyShape, Drawing } from 'replicad';
import type { OpenCascadeInstance } from 'replicad-opencascadejs';
import type { SetRequired } from 'type-fest';
import type { GeometrySvg } from '@taucad/types';
import { normalizeColor } from '#kernels/replicad/utils/normalize-color.js';
import type { GeometryReplicad } from '#kernels/replicad/replicad.types.js';
import { resolveShapeName, uniqueShapeName } from '#utils/shape-names.js';
import type { RuntimeSpanTracer } from '#types/runtime-tracer.types.js';
import {
  extractInstanceEdgeIds,
  extractInstanceFaceIds,
  extractPrototypeEdges,
  extractPrototypeFaces,
  inspectReplicadShapeIdentity,
  transformReplicadGeometryInstance,
} from '#kernels/replicad/utils/tessellation-instancing.js';
import type {
  Meshable,
  ReplicadShapeIdentityInfo,
  ReplicadTessellationInstance,
} from '#kernels/replicad/utils/tessellation-instancing.js';

type Tessellation = {
  linearTolerance: number;
  angularTolerance: number;
};

type Svgable = SetRequired<Drawing, 'toSVGPaths' | 'toSVGViewBox'>;

type RenderMode = 'flat' | 'tessellation-instanced' | 'mixed';

type RenderTelemetry = {
  tracer?: RuntimeSpanTracer;
  onRenderMode?: (mode: RenderMode) => void;
};

type RenderOptions = {
  tessellation?: Tessellation;
  withBrepEdges?: boolean;
  openCascade?: OpenCascadeInstance;
  tessellationInstancing?: boolean;
} & RenderTelemetry;

type RenderMeshOptions = {
  tessellation: Tessellation;
  withBrepEdges: boolean;
} & RenderTelemetry;

type SpanOperation<T> = {
  tracer?: RuntimeSpanTracer;
  name: string;
  attributes: Record<string, string | number | boolean>;
  operation: () => T;
};

/**
 * A shape with optional display and material metadata for rendering.
 *
 * Returned from a Replicad model's `main()` function to control per-shape
 * appearance in both GLTF preview rendering and STEP export.
 *
 * @public
 *
 * @example <caption>Shape with PBR material properties</caption>
 * ```typescript
 * import { makeCylinder } from 'replicad';
 *
 * export default function main() {
 *   return {
 *     shape: makeCylinder(10, 30),
 *     color: '#C0C0C0',
 *     metalness: 0.9,
 *     roughness: 0.2,
 *     density: 7.85,
 *   };
 * }
 * ```
 */
export type InputShape = {
  shape: AnyShape;
  name?: string;
  /** CSS hex color string (e.g. `'#ff0000'`). Applied to GLTF baseColor and STEP surface color. */
  color?: string;
  /** Opacity from 0 (transparent) to 1 (opaque). Maps to GLTF alpha and STEP transparency. */
  opacity?: number;
  strokeType?: string;
  /** PBR metalness factor (0 = dielectric, 1 = metal). Threaded to GLTF metallicFactor and STEP visual material. */
  metalness?: number;
  /** PBR roughness factor (0 = mirror, 1 = diffuse). Threaded to GLTF roughnessFactor and STEP visual material. */
  roughness?: number;
  /** Physical density in g/cm³. Written to STEP as XCAFDoc_Material for mass computation. */
  density?: number;
};

type NamedInputShape = InputShape & { name: string };

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

/** Union of all valid return types from a Replicad model's main function. */
export type MainResultShapes = AnyShape | AnyShape[] | InputShape | InputShape[] | undefined;

const isSvgable = (shape: unknown): shape is Svgable => {
  return (
    typeof shape === 'object' &&
    shape !== null &&
    Boolean((shape as Svgable).toSVGPaths) &&
    Boolean((shape as Svgable).toSVGViewBox)
  );
};

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

function createBasicShapeConfig(
  inputShapes: MainResultShapes,
  defaultName?: string,
): Array<InputShape & { name: string }> {
  // We accept a single shape or an array of shapes
  const raw: Array<AnyShape | InputShape | undefined> = Array.isArray(inputShapes) ? inputShapes : [inputShapes];

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

function normalizeColorAndOpacity<T extends InputShape>(shape: T): InputShape {
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

const strokeDashArray = (strokeType: string | undefined): string | undefined => {
  if (strokeType === 'dots') {
    return '1 3';
  }
  if (strokeType === 'dashes') {
    return '8 4';
  }
  return undefined;
};

function renderSvg(shapeConfig: SvgShapeConfiguration): GeometrySvg {
  const { name, shape, color, strokeType, opacity } = shapeConfig;
  const viewBox = escapeSvgAttribute(shape.toSVGViewBox());
  const stroke = escapeSvgAttribute(color ?? 'currentColor');
  const opacityAttribute = opacity === undefined ? '' : ` opacity="${opacity}"`;
  const dashArray = strokeDashArray(strokeType);
  const dashAttribute = dashArray === undefined ? '' : ` stroke-dasharray="${dashArray}"`;
  const paths = (shape.toSVGPaths() as string[])
    .map(
      (path) =>
        `<path d="${escapeSvgAttribute(path)}" fill="none" stroke="${stroke}"${opacityAttribute}${dashAttribute}/>`,
    )
    .join('');

  return {
    format: 'svg',
    name,
    content: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${viewBox}">${paths}</svg>`,
  };
}

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
  const { name, shape, color, opacity, metalness, roughness } = shapeConfig;
  const { tessellation, withBrepEdges, tracer } = options;
  const geometry: GeometryReplicad = {
    format: 'replicad',
    name,
    color,
    opacity,
    metalness,
    roughness,
    faces: {
      triangles: [],
      vertices: [],
      normals: [],
      faceGroups: [],
    },
    edges: {
      lines: [],
      edgeGroups: [],
    },
  };

  const angularToleranceRad = tessellation.angularTolerance * (Math.PI / 180);
  const tessellationAttributes = {
    shapeName: name,
    linearTolerance: tessellation.linearTolerance,
    angularToleranceDeg: tessellation.angularTolerance,
    withBrepEdges,
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

  if (withBrepEdges) {
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
  const { name, color, opacity, metalness, roughness } = shapeConfig;
  return {
    format: 'replicad',
    name,
    color,
    opacity,
    metalness,
    roughness,
    faces: {
      triangles: [],
      vertices: [],
      normals: [],
      faceGroups: [],
    },
    edges: {
      lines: [],
      edgeGroups: [],
    },
  };
}

function instancingGroupKey(instance: MeshableInstance, tessellation: Tessellation, withBrepEdges: boolean): string {
  const { info } = instance;
  return [
    info.partnerKey,
    info.orientation,
    tessellation.linearTolerance,
    tessellation.angularTolerance,
    withBrepEdges,
  ].join('|');
}

function isInstancingEligible(info: ReplicadShapeIdentityInfo): boolean {
  return info.canPrototypeMesh && info.partnerKey.length > 0 && Number.isFinite(info.determinant);
}

function groupMeshableInstances(
  instances: MeshableInstance[],
  tessellation: Tessellation,
  withBrepEdges: boolean,
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

    const key = instancingGroupKey(instance, tessellation, withBrepEdges);
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
  withBrepEdges,
  tracer,
}: {
  configs: NamedInputShape[];
  openCascade: OpenCascadeInstance;
  tessellation: Tessellation;
  withBrepEdges: boolean;
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
    withBrepEdges,
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

    const groupedResult = groupMeshableInstances(instances, tessellation, withBrepEdges);
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
  withBrepEdges,
  tracer,
}: {
  group: PrototypeGroup;
  openCascade: OpenCascadeInstance;
  tessellation: Tessellation;
  withBrepEdges: boolean;
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
    withBrepEdges,
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

  if (withBrepEdges) {
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
        const edgeIds = withBrepEdges
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
    withBrepEdges,
    tracer,
  }: {
    openCascade: OpenCascadeInstance;
    tessellation: Tessellation;
    withBrepEdges: boolean;
    tracer?: RuntimeSpanTracer;
  },
): { geometries: Array<GeometrySvg | GeometryReplicad>; renderMode: RenderMode } {
  const detection = detectInstancingGroups({
    configs,
    openCascade,
    tessellation,
    withBrepEdges,
    tracer,
  });

  if (detection.groups.length === 0) {
    return {
      geometries: render(configs, { tessellation, withBrepEdges, tracer, tessellationInstancing: false }),
      renderMode: 'flat',
    };
  }

  const groupedGeometries = new Map<MeshableConfiguration, GeometryReplicad>();
  for (const group of detection.groups) {
    for (const [config, geometry] of renderPrototypeGroup({
      group,
      openCascade,
      tessellation,
      withBrepEdges,
      tracer,
    })) {
      groupedGeometries.set(config, geometry);
    }
  }

  let legacyMeshCount = 0;
  const geometries = configs.map((shapeConfig) => {
    if (hasSvgableShape(shapeConfig)) {
      return renderSvg(shapeConfig);
    }

    if (hasMeshableShape(shapeConfig)) {
      const grouped = groupedGeometries.get(shapeConfig);
      if (grouped) {
        return grouped;
      }
      legacyMeshCount++;
      return renderMesh(shapeConfig, { tessellation, withBrepEdges, tracer });
    }

    throw new Error('Invalid shape');
  });

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
    withBrepEdges = false,
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
        withBrepEdges,
        tracer,
      });
      onRenderMode?.(result.renderMode);
      return result.geometries;
    } catch {
      onRenderMode?.('flat');
      return render(shapes, { tessellation, withBrepEdges, tracer, tessellationInstancing: false });
    }
  }

  onRenderMode?.('flat');
  return shapes.map((shapeConfig) => {
    if (hasSvgableShape(shapeConfig)) {
      return renderSvg(shapeConfig);
    }

    if (hasMeshableShape(shapeConfig)) {
      return renderMesh(shapeConfig, { tessellation, withBrepEdges, tracer });
    }

    throw new Error('Invalid shape');
  });
}

/**
 * Normalizes, optionally transforms, and renders shapes from a model's main function output.
 *
 * @param options - Shapes, optional beforeRender, defaultName, tessellation, and withBrepEdges
 * @returns An array of SVG or Replicad geometry objects
 */
export function renderOutput({
  shapes,
  beforeRender,
  defaultName,
  tessellation,
  withBrepEdges = false,
  openCascade,
  tessellationInstancing = false,
  tracer,
  onRenderMode,
}: {
  shapes: MainResultShapes;
  beforeRender?: (shapes: InputShape[]) => InputShape[];
  defaultName?: string;
  tessellation?: Tessellation;
  withBrepEdges?: boolean;
  openCascade?: OpenCascadeInstance;
  tessellationInstancing?: boolean;
  tracer?: RuntimeSpanTracer;
  onRenderMode?: (mode: RenderMode) => void;
}): Array<GeometrySvg | GeometryReplicad> {
  const baseShape = createBasicShapeConfig(shapes, defaultName).map((element) => normalizeColorAndOpacity(element));

  const config = resolveReplicadShapeNames(beforeRender ? beforeRender(baseShape) : baseShape);

  return render(config, { tessellation, withBrepEdges, openCascade, tessellationInstancing, tracer, onRenderMode });
}
