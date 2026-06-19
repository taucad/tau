import type { AnyShape, Drawing } from 'replicad';
import type { SetRequired } from 'type-fest';
import type { GeometrySvg } from '@taucad/types';
import { normalizeColor } from '#kernels/replicad/utils/normalize-color.js';
import type { GeometryReplicad } from '#kernels/replicad/replicad.types.js';
import { resolveShapeName, uniqueShapeName } from '#utils/shape-names.js';
import type { RuntimeSpanTracer } from '#types/runtime-tracer.types.js';

type Tessellation = {
  linearTolerance: number;
  angularTolerance: number;
};

type Meshable = SetRequired<AnyShape, 'mesh' | 'meshEdges'>;

type Svgable = SetRequired<Drawing, 'toSVGPaths' | 'toSVGViewBox'>;

type RenderTelemetry = {
  tracer?: RuntimeSpanTracer;
};

type RenderOptions = {
  tessellation?: Tessellation;
  withBrepEdges?: boolean;
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

function renderSvg(shapeConfig: SvgShapeConfiguration): GeometrySvg {
  const { name, shape, color, strokeType, opacity } = shapeConfig;
  return {
    format: 'svg',
    name,
    color,
    strokeType,
    opacity,
    paths: shape.toSVGPaths() as string[],
    viewbox: shape.toSVGViewBox(),
  };
}

const defaultPreviewTessellation: Tessellation = {
  linearTolerance: 0.01,
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

/**
 * Renders an array of input shapes into geometry representations.
 *
 * @param shapes - The shapes to render with optional color/name metadata
 * @param options - Tessellation, BRep edge, and telemetry options
 * @returns An array of SVG or Replicad geometry objects
 */
export function render(
  shapes: NamedInputShape[],
  { tessellation = defaultPreviewTessellation, withBrepEdges = false, tracer }: RenderOptions = {},
): Array<GeometrySvg | GeometryReplicad> {
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
  tracer,
}: {
  shapes: MainResultShapes;
  beforeRender?: (shapes: InputShape[]) => InputShape[];
  defaultName?: string;
  tessellation?: Tessellation;
  withBrepEdges?: boolean;
  tracer?: RuntimeSpanTracer;
}): Array<GeometrySvg | GeometryReplicad> {
  const baseShape = createBasicShapeConfig(shapes, defaultName).map((element) => normalizeColorAndOpacity(element));

  const config = resolveReplicadShapeNames(beforeRender ? beforeRender(baseShape) : baseShape);

  return render(config, { tessellation, withBrepEdges, tracer });
}
