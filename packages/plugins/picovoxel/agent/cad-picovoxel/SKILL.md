---
name: cad-picovoxel
description: Guides PicoVoxel voxel, SDF and lattice CAD, named parts, PBR materials and mechanisms. For TypeScript geometry, appearance, textures or moving-part authoring.
---

# PicoVoxel authoring

## Workflow

1. Author `main.ts`: `import type { Pico, Voxels, Mesh } from 'picovoxel'`, helpers from `picovoxel/shapekernel`, `picovoxel/latticelibrary` and `picovoxel/numerics`.
2. Export `defaultParams` with a `voxelSize` and a default `main(pico, params = defaultParams)` returning `Voxels`, `Mesh`, `{ shape, name?, material? }`, a model envelope, or a flat mixed array; `[]` is an empty scene.
3. For moving parts, read `kinematics-reference.md`: return explicitly named bodies and export `mechanism` or `mechanism(params)` with joints and clips. Fix mechanism warnings.
4. Use the `pico` session Tau passes in. Never call `createPico()` or import `picovoxel/multi`, `picovoxel/raw` or `picovoxel/three`.

Across files, use explicit ESM paths such as `./lib/widget.js` and pass `pico` to helpers.

## Kernel rules

- `voxelSize` is the voxel edge in millimetres. Cost grows roughly with 1/voxelSize³: start at 0.5–1 mm and refine only for final detail.
- Prefer voxel booleans, offsets, ShapeKernel and LatticeLibrary over manual triangles. Output is mesh, not BRep.
- Prefer an `SdfExpression` (`['max', ['abs', 'x'], ['abs', 'y']]`) over a JS `sdf` callback: expressions fill in parallel, callbacks run serially.
- Dispose large intermediates after their last use.
- The viewer shows a fast preview; exports and GeoSpec checks replay the model exactly, so they can differ by about one voxel. Never request `lane: 'fast'` for manufacturing exports.

Route TypeScript PicoGK requests here; native C# `main.cs` uses desktop `cad-picogk`.

Check a missing default export, a wrong return type and a non-positive `voxelSize` first. `PICO_OUT_OF_MEMORY` means coarsen `voxelSize` or shrink the bounds.

## Part names

Name final parts with `{ shape, name }` after transforms, booleans or clones. Import
`PicovoxelResult` with `import type` only.

```ts
import type { Pico } from 'picovoxel';
import type { PicovoxelResult } from '@taucad/picovoxel';

export default function main(pico: Pico): PicovoxelResult {
  return {
    shape: pico.createVoxels({ shape: 'sphere', radius: 10 }),
    name: 'Housing',
  };
}
```

Names trim; blank/omitted names use ordinal `Shape N`. Duplicate labels and Unicode survive;
STL basenames are safe and unique. Raw parts remain valid. Nested arrays, `children`, invalid
shapes/names fail with the output index. Names create no stable identity or hierarchy.
Mechanism bindings require unique authored names.

## Materials

Attach `material` to final descriptors. Return `{ shapes, images?, textures?, samplers? }`
for maps. Find all six `@taucad/picovoxel` authoring types in `tau-api-index.md`.
Read [materials-reference.md](materials-reference.md) for all 17 maps, 11 extensions,
units, UV0 and exports.

## Core API

The symbols real Tau models use most, as verbatim declarations. Anything not shown is in the API reference below.

### `picovoxel`

```ts
interface Pico
  readonly voxelSize: number
  createVoxels(options: CreateVoxelsOptions): Voxels;
  // Builds a mesh from vertex/triangle data via the bulk imports (two crossings)
  createMesh(options: {
      vertices: ArrayLike<number>;
      triangles: ArrayLike<number>;
    }): Mesh;
  createLattice(): Lattice;
  createScalarField(options?: CreateScalarFieldOptions): ScalarField;
  createVectorField(options?: CreateVectorFieldOptions): VectorField;
  // An empty writable .vdb container
  createVdb(): VdbFile;
  // Opens .vdb bytes as a container for field-level access
  openVdb(bytes: Uint8Array): VdbFile;
  // Escape hatch
  readonly handle: bigint
  // Deterministic teardown
  dispose(): void;
  // … 14 more members in the API reference

CreateVoxelsOptions: {
  shape: 'empty'
}

interface Lattice
  addSphere(options: {
      center: Vec3;
      radius: number;
    }): void;
  addBeam(options: AddBeamOptions): void;
  // Renders the lattice into a fresh voxel field
  toVoxels(): Voxels;
  readonly memUsage: number
  // Raw ABI handle — escape hatch
  readonly handle: bigint
  // Optional
  dispose(): void;
  [Symbol.dispose](): void;

CreateScalarFieldOptions: {
  from: Voxels
  value?: number
  sdThreshold?: number
}

interface ScalarField extends FieldBase
  // Sets (and activates) the value at a position in mm
  set(position: Vec3, value: number): void;
  // Value at the position, or null when the position holds no value
  get(position: Vec3): number | null;
  remove(position: Vec3): void;
  // Visits every active value
  traverse(callback: (x: number, y: number, z: number, value: number) => void): void;
  // Field extent in discrete voxel units
  dimensions(): {
      origin: Vec3;
      size: Vec3;
    };
  // One Z slice of raw field values
  getSlice(options: {
      index: number;
    }): ScalarFieldSlice;
  // Bounding box of active voxels in mm (dims × voxel size, as C# does)
  bounds(): Bounds;
  // Stored values are voxel-unit signed distance
  signedDistanceAt(position: Vec3): number | null;
  clone(): ScalarField;

CreateVectorFieldOptions: {
  from: Voxels
  value?: Vec3
  sdThreshold?: number
}

interface VectorField extends FieldBase
  set(position: Vec3, value: Vec3): void;
  get(position: Vec3): Vec3 | null;
  remove(position: Vec3): void;
  // Visits every active value
  traverse(callback: (x: number, y: number, z: number, vx: number, vy: number, vz: number) => void): void;
  clone(): VectorField;

interface VdbFile
  readonly fieldCount: number
  // Name + type of every field, index order
  fields(): Array<{
      name: string;
      type: VdbFieldType;
    }>;
  // Adds a field under `name`
  add(field: Voxels | ScalarField | VectorField, name?: string): number;
  getVoxels(indexOrName: number | string): Voxels;
  getScalarField(indexOrName: number | string): ScalarField;
  getVectorField(indexOrName: number | string): VectorField;
  // Serialises the container to .vdb bytes
  toBytes(options?: {
      acceptLane?: 'fast';
    }): Uint8Array;
  // Raw ABI handle — escape hatch
  readonly handle: bigint
  // Optional
  dispose(): void;
  [Symbol.dispose](): void;

// A 3D coordinate or direction, `[x, y, z]`, in millimetres unless noted
Vec3: readonly [number, number, number]

interface AddBeamOptions
  start: Vec3
  end: Vec3
  // Uniform radius
  radius?: number
  startRadius?: number
  endRadius?: number
  // Hemispherical end caps (default true, as upstream)
  roundCap?: boolean

// A 3D coordinate or direction, `[x, y, z]`, in millimetres unless noted
Vec3: readonly [number, number, number]

interface ScalarFieldSlice
  width: number
  height: number
  // Raw field values, row-major
  data: Float32Array

// An axis-aligned box in millimetres
interface Bounds
  min: Vec3
  max: Vec3

// A 3D coordinate or direction, `[x, y, z]`, in millimetres unless noted
Vec3: readonly [number, number, number]

// A 3D coordinate or direction, `[x, y, z]`, in millimetres unless noted
Vec3: readonly [number, number, number]

VdbFieldType: 'voxels' | 'scalarField' | 'vectorField' | 'unsupported'

interface Voxels
  // Pure union
  union(...others: Voxels[]): Voxels;
  // Pure subtraction of every operand
  subtract(...others: Voxels[]): Voxels;
  // Pure intersection
  intersect(other: Voxels): Voxels;
  // Pure surface offset
  offset(options: {
      distance: number;
      fastRenorm?: boolean;
    }): Voxels;
  // In, 2× out, in again
  smoothen(options: {
      distance: number;
      fastRenorm?: boolean;
    }): Voxels;
  // Over-offset composition
  fillet(options: {
      rounding: number;
      finalSurfaceDistance?: number;
      fastRenorm?: boolean;
    }): Voxels;
  // Everything outside the box is trimmed away (cube-mesh intersect, as C#)
  trim(bounds: Bounds): Voxels;
  // Projects the slice at startZ through endZ (mm)
  projectZSlice(options: {
      startZ: number;
      endZ: number;
    }): Voxels;
  // The gyroid-in-sphere idiom
  maskedByImplicit(options: {
      sdf: SdfFunction | SdfExpression;
    }): Voxels;
  // Volume in mm³ from the raw grid — fast but approximate after booleans (use…
  readonly volume: number
  // Volume (mm³), surface area (mm²) and bounds free of boolean residue, from one native…
  properties(): {
      volume: number;
      area: number;
      bounds: Bounds;
    };
  // Bounding box via the intermediate mesh (the only accurate way)
  bounds(): Bounds;
  toMesh(): Mesh;
  readonly metadata: Metadata
  // Raw ABI handle — escape hatch
  readonly handle: bigint
  // Optional
  dispose(): void;
  // … 24 more members in the API reference

// Signed distance in millimetres at (x, y, z) — scalars, never a vector object
SdfFunction: (x: number, y: number, z: number) => number

// A serializable SDF
SdfExpression: number | 'x' | 'y' | 'z' | readonly [SdfOperator, ...SdfExpression[]]

interface Metadata
  // Number of entries in the table
  readonly count: number
  // Every entry name, index order
  names(): string[];
  typeOf(name: string): MetadataType;
  // Typed read
  get(name: string): MetadataValue | undefined;
  // Reserved names (`PicoGK.*`, `PicoVoxel.*`, `class`, `name`, `file_*`) throw
  set(name: string, value: MetadataValue): void;
  // The reserved-name guard applies here too
  remove(name: string): void;
  // Raw ABI handle — escape hatch
  readonly handle: bigint
  // Optional
  dispose(): void;
  [Symbol.dispose](): void;

SdfOperator: '+' | '-' | '*' | '/' | 'abs' | 'sqrt' | 'sin' | 'cos' | 'floor' | 'exp' | 'log' | 'mod' | 'pow' | 'min' | 'max'

MetadataType: 'string' | 'float' | 'vector' | 'unknown'

MetadataValue: string | number | Vec3
```

### `picovoxel/shapekernel`

```ts
// Box along a straight frame or spine with width/depth line modulations (C# `BaseBox`)
declare class BaseBox extends BaseShape implements MeshBaseShape, SurfaceBaseShape
  constructor(frameOrFrames: Frame | Frames, a?: number, b?: number, c?: number);
  // From a bounding box
  static fromBounds(bounds: Bounds): BaseBox;
  // C# `SetWidth` — modulated width bumps width+length sampling to 500
  setWidth(modulation: LineModulation): void;
  // C# `SetDepth` — modulated depth bumps depth+length sampling to 500
  setDepth(modulation: LineModulation): void;
  voxConstruct(pk: Pico): Voxels;
  // … 14 more members in the API reference

// A rigid transform stored as explicit axes (C# `PicoGK.Shapes.Frame3d`)
interface Frame
  // Origin of the frame in world coordinates (C# `vecPos`)
  readonly pos: Vec3
  // Local X axis in world coordinates (C# `vecLx`)
  readonly lx: Vec3
  // Local Y axis in world coordinates (C# `vecLy`)
  readonly ly: Vec3
  // Local Z axis in world coordinates (C# `vecLz`)
  readonly lz: Vec3

// Gyroid pattern with a wall-thickness ratio (C# `ImplicitGyroid`)
declare class ImplicitGyroid implements Implicit
  // C# `IImplicit.fSignedDistance` as a picovoxel SdfFunction
  readonly sdf: SdfFunction
  // The same field as a tape expression for the parallel fill
  readonly expression: SdfExpression
  constructor(unitSize: number, thicknessRatio: number);
  // Thickness ratio for a target wall thickness in mm (C# `fGetThicknessRatio`)
  static thicknessRatio(wallThickness: number, unitSize: number): number;

// ShapeKernel `LocalFrame` construction helpers over the numerics `Frame`
localFrame: {
  // World-aligned frame at the origin (C# `LocalFrame()`)
  readonly identity: Frame
  // World-aligned axes at a position (C# `LocalFrame(vecPos)`)
  readonly create: (pos: Vec3) => Frame
  // Position + local Z
  readonly createZ: (pos: Vec3, localZ: Vec3) => Frame
  // Position + local Z + local X
  readonly createZX: (pos: Vec3, localZ: Vec3, localX: Vec3) => Frame
  // Translated frame, axes unchanged (C# `oTranslate` / `oGetTranslatedFrame`)
  readonly translated: (f: Frame, delta: Vec3) => Frame
  // All axes rotated about an axis, position unchanged (C# `oRotate` / `oGetRotatedFrame`)
  readonly rotated: (f: Frame, deltaPhi: number, axis: Vec3) => Frame
  // Selected axes negated, position unchanged (C# `oGetInvertFrame`
  readonly inverted: (f: Frame, mirrorZ: boolean, mirrorX: boolean) => Frame
  // … 2 more members in the API reference
}

// ShapeKernel `VecOperations` (Hungarian prefixes dropped)
vecOps: {
  // Cartesian point from cylindrical coordinates (C# `vecGetCylPoint`)
  readonly cylPoint: (radius: number, phi: number, z: number) => Vec3
  // Planar (XY) radius about the absolute Z axis (C# `fGetRadius` / the `R` extension)
  readonly radius: (pt: Vec3) => number
  // Planar polar angle about the absolute Z axis, radians (C# `fGetPhi`)
  readonly phi: (pt: Vec3) => number
  // Same phi and z, new radius (C# `vecSetRadius`)
  readonly setRadius: (pt: Vec3, newRadius: number) => Vec3
  // Radially shifted by deltaRadius (C# `vecUpdateRadius`)
  readonly updateRadius: (pt: Vec3, deltaRadius: number) => Vec3
  // Normalized planar radial direction from the Z axis to the point (C# `vecGetPlanarDir`)
  readonly planarDir: (pt: Vec3) => Vec3
  // The vector or its negation, whichever aligns better with the target (C# `vecFlipForAlignment`)
  readonly flipForAlignment: (dir: Vec3, targetDir: Vec3) => Vec3
  // Rotate a point about the absolute Z axis through an optional origin (C# `vecRotateAroundZ`)
  readonly rotateAroundZ: (pt: Vec3, deltaPhi: number, axisOrigin?: Vec3) => Vec3
  // Rotate a point about an arbitrary axis through an optional origin (C# `vecRotateAroundAxis`)
  readonly rotateAroundAxis: (pt: Vec3, deltaPhi: number, axis: Vec3, axisOrigin?: Vec3) => Vec3
  // … 15 more members in the API reference
}

// C# `BaseShape` — the vertex-transformation seam every shape shares
declare abstract class BaseShape
  trafo: VertexTransformation
  // Point-wise transformation applied during construction (C# `SetTransformation`)
  setTransformation(trafo: VertexTransformation): void;
  abstract voxConstruct(pk: Pico): Voxels;

// Point-wise vertex transformation applied during construction (C# `fnVertexTransformation`)
VertexTransformation: (pt: Vec3) => Vec3

// Pipe (annular cylinder) along a straight frame or spine (C# `BasePipe`)
declare class BasePipe extends BaseShape implements MeshBaseShape, SurfaceBaseShape
  constructor(frameOrFrames: Frame | Frames, a?: number, b?: number, c?: number);
  // C# `SetRadius(inner, outer)` — bumps length sampling to 500
  setRadius(innerRadius: SurfaceModulation, outerRadius: SurfaceModulation): void;
  setRadialSteps(steps: number): void;
  setPolarSteps(steps: number): void;
  setLengthSteps(steps: number): void;
  voxConstruct(pk: Pico): Voxels;
  // Surface point
  surfacePoint(lengthRatio: number, phiRatio: number, radiusRatio: number): Vec3;
  // … 15 more members in the API reference

// 2D modulation over (phi, lengthRatio) (C# `SurfaceModulation`
declare class SurfaceModulation
  constructor(value: number | SurfaceRatioFunc);
  // Lift a 1D modulation
  static fromLineModulation(lineModulation: LineModulation, line?: ModulationLine): SurfaceModulation;
  // The modulation value at the given ratios (C# `fGetModulation`)
  modulation(phi: number, lengthRatio: number): number;
  // Sum of two modulations (C# `operator +`)
  add(other: SurfaceModulation): SurfaceModulation;
  // Difference of two modulations (C# `operator -`)
  sub(other: SurfaceModulation): SurfaceModulation;
  // Scaled modulation (C# `operator *`)
  scale(factor: number): SurfaceModulation;

SurfaceRatioFunc: (phi: number, lengthRatio: number) => number

ModulationLine: 'first' | 'second'

// Cylinder along a straight frame or a spine, with a surface-modulated radius (C# `BaseCylinder`)
declare class BaseCylinder extends BaseShape implements MeshBaseShape, SurfaceBaseShape
  constructor(frameOrFrames: Frame | Frames, lengthOrRadius?: number, radius?: number);
  // C# `SetRadius` — modulated radii bump the length sampling to 500
  setRadius(modulation: SurfaceModulation): void;
  setRadialSteps(steps: number): void;
  setPolarSteps(steps: number): void;
  setLengthSteps(steps: number): void;
  voxConstruct(pk: Pico): Voxels;
  // … 13 more members in the API reference

declare class Frames implements Spline
  // Tangential Z along the spline, X aligned to a const target direction, then NURBS…
  static withTargetX(points: readonly Vec3[], targetX: Vec3, reparametrisationSpacing?: number): Frames;
  // Tangential Z along the spline, X from a coordinate-system-dependent target — incl
  static ofType(points: readonly Vec3[], frameType: FrameType, reparametrisationSpacing?: number): Frames;
  // Spine position at a length ratio 0..1 (C# `vecGetSpineAlongLength`)
  spineAt(lengthRatio: number): Vec3;
  // The full local frame at a length ratio (C# `oGetLocalFrame`)
  frameAt(lengthRatio: number): Frame;
  // The spine points (C# `aGetPoints()`)
  points(samples?: number): Vec3[];
  // … 8 more members in the API reference

FrameType: 'cylindrical' | 'spherical' | 'z' | 'minRotation'

// Lens/washer
declare class BaseLens extends BaseShape implements MeshBaseShape, SurfaceBaseShape
  radialSteps: number
  polarSteps: number
  heightSteps: number
  readonly innerRadius: number
  readonly outerRadius: number
  upperModulation: SurfaceModulation
  lowerModulation: SurfaceModulation
  readonly frame: Frame
  constructor(frame: Frame, height: number, innerRadius: number, outerRadius: number);
  // C# `SetHeight` — modulated faces bump radial sampling to 500
  setHeight(lowerModulation: SurfaceModulation, upperModulation: SurfaceModulation): void;
  setRadialSteps(steps: number): void;
  setPolarSteps(steps: number): void;
  setHeightSteps(steps: number): void;
  voxConstruct(pk: Pico): Voxels;
  mshConstruct(pk: Pico): Mesh;
  protected radiusRatioFromStep(step: number): number;
  protected phiRatioFromStep(step: number): number;
  protected heightRatioFromStep(step: number): number;
  // Surface point (C# `vecGetSurfacePoint`
  surfacePoint(heightRatio: number, phiRatio: number, radiusRatio: number): Vec3;
```

### `picovoxel/numerics`

```ts
// `Vector3` operations
vec3: {
  readonly zero: Vec3
  readonly unitX: Vec3
  readonly unitZ: Vec3
  readonly add: (a: Vec3, b: Vec3) => Vec3
  readonly sub: (a: Vec3, b: Vec3) => Vec3
  readonly neg: (v: Vec3) => Vec3
  readonly scale: (v: Vec3, f: number) => Vec3
  readonly dot: (a: Vec3, b: Vec3) => number
  readonly cross: (a: Vec3, b: Vec3) => Vec3
  readonly length: (v: Vec3) => number
  // Unit-length copy
  readonly normalized: (v: Vec3) => Vec3
  // Unit-length copy, or (0,0,0) for (almost) zero-length input (C# `vecSafeNormalized`)
  readonly safeNormalized: (v: Vec3) => Vec3
  // All components finite (C# `Vector3.bIsFinite`)
  readonly isFinite: (v: Vec3) => boolean
  // … 11 more members in the API reference
}
```

## API reference

To read any other signature, grep the skill directory for the name followed by `(` (or the bare type name): each hit is the declaration line and names its file; read a few lines around it for overloads and parameter notes. `api-index.md` lists all 964 symbols by file.

- `api-interfaces.md` — Interfaces
- `api-interfaces-2.md` — Interfaces (2)
- `api-types.md` — Types
- `api-classes.md` — Classes
- `api-classes-2.md` — Classes (2)
- `api-functions.md` — Functions
- `api-constants.md` — Constants

Read ranges, not whole files. Never copy a reference into a source file.
