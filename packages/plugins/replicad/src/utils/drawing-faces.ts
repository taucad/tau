import type { AnyShape } from 'replicad';

/** A Replicad blueprint leaf: one chain of 2D curves. */
type BlueprintLike = {
  readonly curves: readonly unknown[];
  isClosed(): boolean;
};

/** A drawing shape that sketches onto a plane: `Drawing`, `Blueprint`, `Blueprints` or `CompoundBlueprint`. */
type PlaneSketchable = {
  sketchOnPlane(plane?: 'XY'): SketchLike;
};

/**
 * A sketch on a plane: `Sketch` and `Sketches` give `faces()`, `CompoundSketch` only `face()`, and `Sketches` has no
 * `delete` of its own.
 */
type SketchLike = {
  delete?: () => void;
  sketches?: ReadonlyArray<{ delete?: () => void }>;
  faces?: () => AnyShape;
  face?: () => AnyShape;
};

const deleteSketch = (sketch: SketchLike): void => {
  if (typeof sketch.delete === 'function') {
    sketch.delete();
    return;
  }
  for (const part of sketch.sketches ?? []) {
    part.delete?.();
  }
};

const isBlueprintLeaf = (shape: unknown): shape is BlueprintLike =>
  typeof shape === 'object' &&
  shape !== null &&
  Array.isArray((shape as { curves?: unknown }).curves) &&
  typeof (shape as { isClosed?: unknown }).isClosed === 'function';

const isPlaneSketchable = (shape: unknown): shape is PlaneSketchable =>
  typeof shape === 'object' &&
  shape !== null &&
  typeof (shape as { sketchOnPlane?: unknown }).sketchOnPlane === 'function';

/**
 * The blueprint leaves a drawing is made of, or `undefined` when its structure is not one Replicad's 2D
 * shapes take. Duck-typed like `isDrawingShape`, because the authored module may hold its own Replicad
 * classes. A `Drawing` keeps its shape in the private `innerShape` field Replicad's own methods delegate to.
 * @param shape - A drawing shape or one of its parts.
 * @returns Every blueprint leaf, or `undefined` for an unrecognised structure.
 */
const blueprintLeaves = (shape: unknown): BlueprintLike[] | undefined => {
  if (isBlueprintLeaf(shape)) {
    return [shape];
  }
  if (typeof shape !== 'object' || shape === null) {
    return undefined;
  }
  const { blueprints } = shape as { blueprints?: unknown };
  if (Array.isArray(blueprints)) {
    const leaves = blueprints.map((blueprint) => blueprintLeaves(blueprint));
    return leaves.every((leaf) => leaf !== undefined) ? leaves.flat() : undefined;
  }
  if ('innerShape' in shape) {
    return blueprintLeaves((shape as { innerShape?: unknown }).innerShape);
  }
  return undefined;
};

/**
 * Whether a drawing bounds regions: it holds at least one blueprint and every blueprint is closed.
 * Open profiles, such as projected edge drawings, bound no region and have no face form.
 * @param shape - A drawing shape from a live Replicad handle.
 * @returns True when the drawing converts to planar faces.
 */
export const isClosedDrawing = (shape: unknown): boolean => {
  const leaves = blueprintLeaves(shape);
  return (
    isPlaneSketchable(shape) && leaves !== undefined && leaves.length > 0 && leaves.every((leaf) => leaf.isClosed())
  );
};

/**
 * The planar faces a closed drawing bounds, sketched on the XY plane at Z = 0 in model units, holes included.
 * The caller owns and deletes the returned shape.
 * @param shape - A drawing for which {@link isClosedDrawing} holds.
 * @returns The drawing's region faces as one shape.
 */
export const drawingFaces = (shape: unknown): AnyShape => {
  if (!isClosedDrawing(shape) || !isPlaneSketchable(shape)) {
    throw new TypeError('Only a drawing of closed profiles bounds faces.');
  }
  const sketch = shape.sketchOnPlane('XY');
  try {
    if (typeof sketch.faces === 'function') {
      return sketch.faces();
    }
    if (typeof sketch.face === 'function') {
      return sketch.face();
    }
    throw new TypeError('The drawing sketch has no face form.');
  } finally {
    deleteSketch(sketch);
  }
};
