import {
  Sketch,
  EdgeFinder,
  FaceFinder,
  Blueprint,
  Blueprints,
  CompoundBlueprint,
  Drawing,
  Sketches,
  CompoundSketch,
} from 'replicad';
import { normalizeColor } from './normalize-color.js';

type Meshable = {
  mesh: (config: { tolerance: number; angularTolerance: number }) => any;
  meshEdges: (config: { keepMesh: boolean }) => any;
};

type Svgable = {
  toSvgPaths: () => any;
  toSvgViewBox: () => any;
};

type InputShape = {
  shape: unknown;
  name?: string;
  color?: string;
  opacity?: number;
  highlight?: any;
  highlightEdge?: any;
  highlightFace?: any;
  strokeType?: string;
};

type CleanConfig = {
  name: string;
  shape: Meshable | Svgable;
  color?: string;
  opacity?: number;
  highlight?: any;
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
  highlight?: any;
};

const isSvgable = (shape: any): shape is Svgable => {
  return (
    shape instanceof Blueprint ||
    shape instanceof Blueprints ||
    shape instanceof CompoundBlueprint ||
    shape instanceof Drawing ||
    (shape.toSvgPaths && shape.toSvgViewBox)
  );
};

const isMeshable = (shape: any): shape is Meshable => {
  return Boolean(shape.mesh && shape.meshEdges);
};

function createBasicShapeConfig(
  inputShapes: unknown | unknown[] | InputShape[] | InputShape,
  baseName = 'Shape',
): Array<InputShape & { name: string }> {
  let shapes: unknown[] = [];

  if (!inputShapes) return [];

  // We accept a single shape or an array of shapes
  shapes = Array.isArray(inputShapes) ? inputShapes : [inputShapes];

  return shapes
    .map((inputShape: any) => {
      // We accept shapes without additional configuration
      if (!inputShape.shape) {
        return {
          shape: inputShape,
        };
      }

      return inputShape;
    })
    .map((inputShape, index_) => {
      // We accept unamed shapes
      const { name, ...rest } = inputShape;
      const index = shapes.length > 1 ? ` ${index_}` : '';

      return {
        name: name || `${baseName}${index}`,
        ...rest,
      };
    });
}

function normalizeColorAndOpacity<T extends Record<string, any>>(
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

function normalizeHighlight<T extends Record<string, any>>(config: T) {
  const { highlight: inputHighlight, highlightEdge, highlightFace, ...rest } = config;

  const highlight: { find: (s: any) => any } =
    (inputHighlight && typeof inputHighlight.find === 'function') ||
    highlightEdge?.(new EdgeFinder()) ||
    highlightFace?.(new FaceFinder());

  return {
    ...rest,
    highlight,
  };
}

function checkShapeConfigIsValid<T extends Record<string, any> & { shape: unknown }>(
  shape: T,
): shape is T & { shape: Meshable | Svgable } {
  return isSvgable(shape.shape) || isMeshable(shape.shape);
}

const adaptSketch = (shape: any) => {
  if (!(shape instanceof Sketch)) return shape;
  if (shape.wire.isClosed) return shape.face();
  return shape.wire;
};

const adaptSketches = (shape: any) => {
  const isSketches = shape instanceof Sketches || shape instanceof CompoundSketch;
  if (!isSketches) return shape;

  return shape.wires;
};

export class ShapeStandardizer {
  private shapeAdapters: Record<string, (shape: any) => any>;

  public constructor() {
    this.shapeAdapters = {
      sketch: adaptSketch,
      sketches: adaptSketches,
    };
  }

  public registerAdapter(name: string, adapter: (shape: any) => any) {
    this.shapeAdapters[name] = adapter;
  }

  public adaptShape(shape: any) {
    for (const adaptor of Object.values(this.shapeAdapters)) {
      shape = adaptor(shape);
    }

    return shape;
  }

  public standardizeShape<T extends { shape: unknown }>(shapes: T[]): Array<T & { shape: Meshable | Svgable }> {
    return shapes
      .map(({ shape, ...rest }) => ({
        shape: this.adaptShape(shape),
        ...rest,
      }))
      .filter((element): element is T & { shape: Meshable | Svgable } => checkShapeConfigIsValid(element));
  }
}

function renderSvg(shapeConfig: SvgShapeConfiguration) {
  const { name, shape, color, strokeType, opacity } = shapeConfig;
  return {
    name,
    color,
    strokeType,
    opacity,
    format: 'svg',
    paths: shape.toSvgPaths(),
    viewbox: shape.toSvgViewBox(),
  };
}

function renderMesh(shapeConfig: MeshableConfiguration) {
  const { name, shape, color, opacity, highlight } = shapeConfig;
  const shapeInfo = {
    name,
    color,
    opacity,
    mesh: undefined,
    edges: undefined,
    error: false,
    highlight: undefined,
  };

  try {
    shapeInfo.mesh = shape.mesh({
      tolerance: 0.01,
      angularTolerance: 30,
    });
    shapeInfo.edges = shape.meshEdges({ keepMesh: true });
  } catch (error) {
    console.error(error);
    shapeInfo.error = true;
    return shapeInfo;
  }

  if (highlight)
    try {
      shapeInfo.highlight = highlight.find(shape).map((s: any) => {
        return s.hashCode;
      });
    } catch (error) {
      console.error(error);
    }

  return shapeInfo;
}

export function render(shapes: CleanConfig[]) {
  return shapes.map((shapeConfig: CleanConfig) => {
    if (isSvgable(shapeConfig.shape)) return renderSvg(shapeConfig as SvgShapeConfiguration);
    return renderMesh(shapeConfig as MeshableConfiguration);
  });
}

export function renderOutput(
  shapes: unknown,
  shapeStandardizer?: ShapeStandardizer,
  beforeRender?: (shapes: CleanConfig[]) => CleanConfig[],
  defaultName = 'Shape',
) {
  const standardizer = shapeStandardizer || new ShapeStandardizer();

  const baseShape = createBasicShapeConfig(shapes, defaultName)
    .map((element) => normalizeColorAndOpacity(element))
    .map((element) => normalizeHighlight(element));
  const standardizedShapes = standardizer.standardizeShape(baseShape);

  const config = beforeRender ? beforeRender(standardizedShapes) : standardizedShapes;

  return render(config);
}
