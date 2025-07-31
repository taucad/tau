import type { AnyShape, Drawing } from 'replicad';
import type { SetRequired } from 'type-fest';
import { normalizeColor } from '#components/geometry/kernel/replicad/utils/normalize-color.js';
import type { Geometry2D } from '#types/cad.types.js';
import type { GeometryReplicad } from '#components/geometry/kernel/replicad/replicad.types.js';

type Meshable = SetRequired<AnyShape, 'mesh' | 'meshEdges'>;

type Svgable = SetRequired<Drawing, 'toSVGPaths' | 'toSVGViewBox'>;

export type InputShape = {
  shape: AnyShape;
  name?: string;
  color?: string;
  opacity?: number;
  strokeType?: string;
};

type SvgShapeConfiguration = {
  name: string;
  shape: Svgable;
  color?: string;
  opacity?: number;
  strokeType?: string;
};

type MeshableConfiguration = {
  name: string;
  shape: Meshable;
  color?: string;
  opacity?: number;
};

export type MainResultShapes = AnyShape | AnyShape[] | InputShape | InputShape[];

const isSvgable = (shape: unknown): shape is Svgable => {
  return Boolean((shape as Svgable).toSVGPaths) && Boolean((shape as Svgable).toSVGViewBox);
};

const isMeshable = (shape: unknown): shape is Meshable => {
  // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- type casting
  return Boolean((shape as Meshable).mesh && (shape as Meshable).meshEdges);
};

const isInputShape = (shape: unknown): shape is InputShape => {
  return Boolean((shape as InputShape).shape);
};

function createBasicShapeConfig(
  inputShapes: MainResultShapes,
  baseName = 'AnyShape',
): Array<InputShape & { name: string }> {
  let shapes: Array<AnyShape | InputShape> = [];

  // We accept a single shape or an array of shapes
  shapes = Array.isArray(inputShapes) ? inputShapes : [inputShapes];

  return shapes
    .map((inputShape) => {
      if (isInputShape(inputShape)) {
        return inputShape;
      }

      return {
        shape: inputShape,
      };
    })
    .map((inputShape, index_) => {
      // We accept unamed shapes
      const { name, ...rest } = inputShape;
      const index = shapes.length > 1 ? ` ${index_}` : '';

      return {
        name: name ?? `${baseName} ${index}`,
        ...rest,
      };
    });
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

function renderSvg(shapeConfig: SvgShapeConfiguration): Geometry2D {
  const { name, shape, color, strokeType, opacity } = shapeConfig;
  return {
    type: '2d',
    name,
    color,
    strokeType,
    opacity,
    format: 'svg',
    paths: shape.toSVGPaths() as string[],
    viewbox: shape.toSVGViewBox(),
  };
}

function renderMesh(shapeConfig: MeshableConfiguration) {
  const { name, shape, color, opacity } = shapeConfig;
  const geometry: GeometryReplicad = {
    type: '3d',
    name,
    color,
    opacity,
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

  try {
    geometry.faces = shape.mesh({
      tolerance: 0.1,
      angularTolerance: 30,
    });
    geometry.edges = shape.meshEdges({
      tolerance: 0.1,
      angularTolerance: 30,
    });
  } catch (error) {
    console.error(error);
    return geometry;
  }

  return geometry;
}

export function render(shapes: InputShape[]): Array<Geometry2D | GeometryReplicad> {
  return shapes.map((shapeConfig) => {
    if (isSvgable(shapeConfig.shape)) {
      // TODO: fix this type
      return renderSvg(shapeConfig as unknown as SvgShapeConfiguration);
    }

    if (isMeshable(shapeConfig.shape)) {
      // TODO: fix this type
      return renderMesh(shapeConfig as unknown as MeshableConfiguration);
    }

    throw new Error('Invalid shape');
  });
}

export function renderOutput(
  shapes: MainResultShapes,
  beforeRender?: (shapes: InputShape[]) => InputShape[],
  defaultName = 'AnyShape',
): Array<Geometry2D | GeometryReplicad> {
  const baseShape = createBasicShapeConfig(shapes, defaultName).map((element) => normalizeColorAndOpacity(element));

  const config = beforeRender ? beforeRender(baseShape) : baseShape;

  return render(config);
}
