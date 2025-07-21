import type { Shape as ReplicadShape, Drawing, Face, Wire, AnyShape, Vertex, exportSTEP } from 'replicad';
import { Sketch, EdgeFinder, FaceFinder, Sketches, CompoundSketch } from 'replicad';
import type { SetRequired } from 'type-fest';
import { normalizeColor } from '~/components/geometry/kernel/replicad/utils/normalize-color.js';
import type { Shape2D, Shape3D } from '~/types/cad.types.js';

type Shape = ReplicadShape<never>;
type Meshable = SetRequired<Shape, 'mesh' | 'meshEdges'>;

type Svgable = SetRequired<Drawing, 'toSVGPaths' | 'toSVGViewBox'>;

type InputShape = {
  shape: Shape;
  name?: string;
  color?: string;
  opacity?: number;
  highlight?: unknown;
  highlightEdge?: unknown;
  highlightFace?: unknown;
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
  highlight?: unknown;
};

export type ShapeConfig = Exclude<Parameters<typeof exportSTEP>[0], undefined>[number];

export type MainResultShapes = Shape | Shape[] | InputShape | InputShape[];

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
  baseName = 'Shape',
): Array<InputShape & { name: string }> {
  let shapes: Array<Shape | InputShape> = [];

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

function normalizeColorAndOpacity<T extends Record<string, unknown>>(
  shape: T,
): T & { color: string | undefined; opacity: number | undefined } {
  const { color, opacity, ...rest } = shape;

  const normalizedColor: undefined | { color: string; alpha: number } = color && normalizeColor(color);
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

function normalizeHighlight<T extends Record<string, unknown>>(config: T) {
  const { highlight: inputHighlight, highlightEdge, highlightFace, ...rest } = config;

  // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment -- TODO: fix these
  const highlight: { find: (s: unknown) => unknown } =
    (inputHighlight && typeof inputHighlight.find === 'function') ??
    highlightEdge?.(new EdgeFinder()) ??
    highlightFace?.(new FaceFinder());

  return {
    ...rest,
    highlight,
  };
}

function checkShapeConfigIsValid<T extends Record<string, unknown> & { shape: unknown }>(
  shape: T,
): shape is T & { shape: Meshable | Svgable } {
  return isSvgable(shape.shape) || isMeshable(shape.shape);
}

const adaptSketch = (shape: Shape) => {
  if (!(shape instanceof Sketch)) {
    return shape;
  }

  if (shape.wire.isClosed) {
    return shape.face();
  }

  return shape.wire;
};

const adaptSketches = (shape: Shape) => {
  const isSketches = shape instanceof Sketches || shape instanceof CompoundSketch;
  if (!isSketches) {
    return shape;
  }

  return shape.wires;
};

export class ShapeStandardizer {
  private shapeAdapters: {
    sketch: (shape: Shape) => Shape | Face | Wire;
    sketches: (shape: Shape) => Shape | (Wire[] & (() => AnyShape)) | (Wire[] & Vertex);
  };

  public constructor() {
    this.shapeAdapters = {
      sketch: adaptSketch,
      sketches: adaptSketches,
    };
  }

  public registerAdapter(name: string, adapter: (shape: unknown) => unknown): void {
    this.shapeAdapters[name] = adapter;
  }

  public standardizeShape<T extends { shape: unknown }>(shapes: T[]): Array<T & { shape: Meshable | Svgable }> {
    return shapes
      .map(({ shape, ...rest }) => ({
        shape: this.adaptShape(shape),
        ...rest,
      }))
      .filter((element): element is T & { shape: Meshable | Svgable } => checkShapeConfigIsValid(element));
  }

  private adaptShape(shape: Shape) {
    for (const adaptor of Object.values(this.shapeAdapters)) {
      shape = adaptor(shape);
    }

    return shape;
  }
}

function renderSvg(shapeConfig: SvgShapeConfiguration): Shape2D {
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
    error: false,
  };
}

function renderMesh(shapeConfig: MeshableConfiguration) {
  const { name, shape, color, opacity, highlight } = shapeConfig;
  const shapeInfo: Shape3D = {
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
    error: false,
    highlight: undefined,
  };

  try {
    shapeInfo.faces = shape.mesh({
      tolerance: 0.1,
      angularTolerance: 30,
    });
    shapeInfo.edges = shape.meshEdges({
      tolerance: 0.1,
      angularTolerance: 30,
    });
  } catch (error) {
    console.error(error);
    shapeInfo.error = true;
    return shapeInfo;
  }

  if (highlight) {
    try {
      // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-call -- TODO: fix these
      shapeInfo.highlight = highlight
        // eslint-disable-next-line @typescript-eslint/no-unsafe-return -- TODO: fix these
        .find((element) => shape(element))
        .map((s: unknown) => {
          // eslint-disable-next-line @typescript-eslint/no-unsafe-return -- TODO: fix these
          return s.hashCode;
        });
    } catch (error) {
      console.error(error);
    }
  }

  return shapeInfo;
}

export function render(shapes: ShapeConfig[]): Array<Shape2D | Shape3D> {
  return shapes.map((shapeConfig: ShapeConfig) => {
    if (isSvgable(shapeConfig.shape)) {
      return renderSvg(shapeConfig as SvgShapeConfiguration);
    }

    return renderMesh(shapeConfig as MeshableConfiguration);
  });
}

export function renderOutput(
  shapes: MainResultShapes,
  shapeStandardizer?: ShapeStandardizer,
  beforeRender?: (shapes: ShapeConfig[]) => ShapeConfig[],
  defaultName = 'Shape',
): Array<Shape2D | Shape3D> {
  const standardizer = shapeStandardizer ?? new ShapeStandardizer();

  const baseShape = createBasicShapeConfig(shapes, defaultName)
    .map((element) => normalizeColorAndOpacity(element))
    .map((element) => normalizeHighlight(element));
  const standardizedShapes = standardizer.standardizeShape(baseShape);

  const config = beforeRender ? beforeRender(standardizedShapes) : standardizedShapes;

  return render(config);
}
