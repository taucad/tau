import { Sketch } from 'replicad';

const shapeOrSketch = (shape: unknown) => {
  if (!(shape instanceof Sketch)) {
    return shape;
  }

  if (shape.wire.isClosed) {
    return shape.face();
  }

  return shape.wire;
};

export class StudioHelper {
  public _shapes: unknown[] = [];
  public _faceFinder: unknown;
  public _edgeFinder: unknown;

  public constructor() {
    this._shapes = [];
    this._faceFinder = null;
    this._edgeFinder = null;
  }

  public debug(shape: unknown) {
    this._shapes.push(shape);
    return shape;
  }

  public d(shape: unknown) {
    return this.debug(shape);
  }

  public highlightFace(faceFinder: unknown) {
    this._faceFinder = faceFinder;
    return faceFinder;
  }

  public hf(faceFinder: unknown) {
    return this.highlightFace(faceFinder);
  }

  public highlightEdge(edgeFinder: unknown) {
    this._edgeFinder = edgeFinder;
    return edgeFinder;
  }

  public he(edgeFinder: unknown) {
    return this.highlightEdge(edgeFinder);
  }

  public apply(config: unknown) {
    const config_ = [
      ...config,
      ...this._shapes.map((s, index) => ({
        shape: shapeOrSketch(s),
        name: `Debug ${index}`,
      })),
    ];
    for (const shape of config_) {
      if (this._edgeFinder && !shape.highlightEdge) {
        shape.highlightEdge = this._edgeFinder;
      }

      if (this._faceFinder && !shape.highlightFace) {
        shape.highlightFace = this._faceFinder;
      }
    }

    return config_;
  }
}
