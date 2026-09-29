# picovoxel — Classs (2)

1 top-level symbols. Signatures are verbatim typescript.

// Cubic-feel connector between two points/frames with tangent control (C# `TangentialControlSpline`)
TangentialControlSpline: declare class TangentialControlSpline implements Spline

  constructor

  // The frame-to-frame form
  static betweenFrames(startFrame: Frame, endFrame: Frame, options?: TangentOptions): TangentialControlSpline;

  points(samples?: number): Vec3[];
