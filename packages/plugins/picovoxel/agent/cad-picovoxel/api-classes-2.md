# picovoxel — Classes (2)

4 top-level symbols. Signatures are verbatim typescript.

// 1D modulation
LineModulation: declare class LineModulation

  // The constant value when built from one (C# public `m_fConstValue`)
  readonly constValue: number

  // LineModulation.constructor (constructor)
  constructor(value: number | RatioFunc);

  // From a discrete point list
  // LineModulation.fromPoints (method)
  static fromPoints(points: readonly Vec3[], values: ModulationCoord, axis: ModulationCoord): LineModulation;

  // The modulation value at a 0..1 ratio (C# `fGetModulation`)
  // LineModulation.modulation (method)
  modulation(ratio: number): number;

  // Sum of two modulations (C# `operator +`)
  // LineModulation.add (method)
  add(other: LineModulation): LineModulation;

  // Difference of two modulations (C# `operator -`)
  // LineModulation.sub (method)
  sub(other: LineModulation): LineModulation;

  // Scaled modulation (C# `operator *`)
  // LineModulation.scale (method)
  scale(factor: number): LineModulation;

// Accumulates upstream-style per-triangle geometry, built through ONE bulk `createMesh` call
MeshBuilder: declare class MeshBuilder

  // Number of vertices added so far
  readonly vertexCount: number

  // Adds one vertex and returns its index, for {@link MeshBuilder.addIndexedTriangle} (C# `Mesh.nAddVertex`)
  // MeshBuilder.addVertex (method)
  addVertex(pt: Vec3): number;

  // One triangle over vertices already added, by index (C# `Mesh.nAddTriangle(Triangle)`)
  // MeshBuilder.addIndexedTriangle (method)
  addIndexedTriangle(a: number, b: number, c: number): void;

  // Three fresh vertices + one triangle, exactly like C# `Mesh.nAddTriangle(v0, v1, v2)`
  // MeshBuilder.addTriangle (method)
  addTriangle(a: Vec3, b: Vec3, c: Vec3): void;

  // The two-triangle quad both upstream mesh helpers and shape mantles use
  // MeshBuilder.addQuad (method)
  addQuad(pt1: Vec3, pt2: Vec3, pt3: Vec3, pt4: Vec3): void;

  // MeshBuilder.build (method)
  build(pk: Pico): Mesh;

// 2D modulation over (phi, lengthRatio) (C# `SurfaceModulation`
SurfaceModulation: declare class SurfaceModulation

  // SurfaceModulation.constructor (constructor)
  constructor(value: number | SurfaceRatioFunc);

  // Lift a 1D modulation
  // SurfaceModulation.fromLineModulation (method)
  static fromLineModulation(lineModulation: LineModulation, line?: ModulationLine): SurfaceModulation;

  // The modulation value at the given ratios (C# `fGetModulation`)
  // SurfaceModulation.modulation (method)
  modulation(phi: number, lengthRatio: number): number;

  // Sum of two modulations (C# `operator +`)
  // SurfaceModulation.add (method)
  add(other: SurfaceModulation): SurfaceModulation;

  // Difference of two modulations (C# `operator -`)
  // SurfaceModulation.sub (method)
  sub(other: SurfaceModulation): SurfaceModulation;

  // Scaled modulation (C# `operator *`)
  // SurfaceModulation.scale (method)
  scale(factor: number): SurfaceModulation;

// Cubic-feel connector between two points/frames with tangent control (C# `TangentialControlSpline`)
TangentialControlSpline: declare class TangentialControlSpline implements Spline

  // TangentialControlSpline.constructor (constructor)
  constructor(start: Vec3, end: Vec3, startDir: Vec3, endDir: Vec3, options?: TangentOptions);

  // The frame-to-frame form
  // TangentialControlSpline.betweenFrames (method)
  static betweenFrames(startFrame: Frame, endFrame: Frame, options?: TangentOptions): TangentialControlSpline;

  // TangentialControlSpline.points (method)
  points(samples?: number): Vec3[];
