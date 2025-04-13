import { Sketch } from 'replicad';

const shapeOrSketch = (shape: any) => {
  if (!(shape instanceof Sketch)) return shape;
  if (shape.wire.isClosed) return shape.face();
  return shape.wire;
};

export class StudioHelper {
  public _shapes: any[] = [];
  public _faceFinder: any;
  public _edgeFinder: any;

  public constructor() {
    this._shapes = [];
    this._faceFinder = null;
    this._edgeFinder = null;
  }

  public debug(shape: any) {
    this._shapes.push(shape);
    return shape;
  }

  public d(shape: any) {
    return this.debug(shape);
  }

  public highlightFace(faceFinder: any) {
    this._faceFinder = faceFinder;
    return faceFinder;
  }

  public hf(faceFinder: any) {
    return this.highlightFace(faceFinder);
  }

  public highlightEdge(edgeFinder: any) {
    this._edgeFinder = edgeFinder;
    return edgeFinder;
  }

  public he(edgeFinder: any) {
    return this.highlightEdge(edgeFinder);
  }

  public apply(config: any) {
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
