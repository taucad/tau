/**
 * The resident cost of what a live-tier entry retains, estimated from topology (audit R10, catalogue E12).
 *
 * Nothing in the OpenCascade build reports live native bytes per shape (memory R8 is not connected), so an entry is
 * costed by the faces of its shapes, or by their edges when they have no face (wires, edges, sketches). Calibrated on
 * the single-thread build by WebAssembly heap growth over 1,500 retained parts: a face's B-rep alone holds 0.6 to
 * 0.7 KiB (filleted brackets, 40-sided prisms), and 3 to 8 KiB once a render triangulates it (one coarse sphere face:
 * 94 KiB). Most entries are intermediate results no render meshes, and the last ones share their triangulation with
 * the delivered model, so a face counts 2 KiB. Entries also share native sub-shapes with the results they were made
 * from, so the sum overestimates and the byte budget errs towards evicting.
 *
 * @internal
 */
import type * as ReplicadModule from 'replicad';

type ReplicadLibrary = typeof ReplicadModule;

/** Resident bytes counted per face. @internal */
export const bytesPerFace = 2 * 1024;
/** Resident bytes counted per edge of a shape without faces. @internal */
export const bytesPerEdge = 512;
/** Bytes of any retained value: its wrapper, its handle and the tier's bookkeeping. @internal */
export const bytesPerValue = 512;

/**
 * Create the estimator for one library.
 *
 * @param library - The Replicad library whose values the tier retains.
 * @returns Estimated resident bytes of a retained value.
 * @internal
 */
export const createEntryCost = (library: ReplicadLibrary): ((value: unknown) => number) => {
  const count = (shape: ReplicadModule.AnyShape, kind: 'TopAbs_FACE' | 'TopAbs_EDGE'): number => {
    const oc = library.getOC();
    const explorer = new oc.TopExp_Explorer(shape.wrapped, oc.TopAbs_ShapeEnum[kind]);
    let found = 0;
    try {
      /* oxlint-disable new-cap -- OCCT exposes callable C++ PascalCase methods. */
      while (explorer.More()) {
        found += 1;
        explorer.Next();
      }
      /* oxlint-enable new-cap */
    } finally {
      explorer.delete();
    }
    return found;
  };

  const shapeBytes = (shape: ReplicadModule.AnyShape): number => {
    const faces = count(shape, 'TopAbs_FACE');
    return bytesPerValue + (faces > 0 ? faces * bytesPerFace : count(shape, 'TopAbs_EDGE') * bytesPerEdge);
  };

  const cost = (value: unknown): number => {
    if (Array.isArray(value)) {
      return value.reduce<number>((sum, entry) => sum + cost(entry), 0);
    }
    if (value instanceof library.Shape) {
      return shapeBytes(value as ReplicadModule.AnyShape);
    }
    if (value instanceof library.Sketch) {
      return shapeBytes(value.wire);
    }
    if (value instanceof library.CompoundSketch || value instanceof library.Sketches) {
      return cost(value.sketches);
    }
    // A drawing's 2D curves, or a value the tier does not retain.
    return bytesPerValue;
  };
  return cost;
};
