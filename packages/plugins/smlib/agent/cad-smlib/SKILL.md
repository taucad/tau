---
name: cad-smlib
description: Guides SMLib NURBS BRep modeling with @classcad/smlibwasm, Tau materials, textures and kinematics. Use for SMLib models, appearance or moving parts.
---

# SMLib authoring

## Workflow

1. Author `main.ts` with ES module imports from `@classcad/smlibwasm`, exported `defaultParams`, and a default `main(params)` returning a body, a Tau `ShapeConfig`, an array of either, or a `Model` envelope. `main(smlib, params)` (two parameters) receives the library namespace instead.
2. smlibwasm is smlibpy's build123d-style **algebra** API in JavaScript: camelCase names (`parallelTo`, `massProperties`), Python keyword arguments as a trailing options object (`Rectangle(40, 20, { fillet: 2 })`, `sketch.extrude(10, { both: true })`), and methods for operators: `a.fuse(b)`, `a.cut(b)`, `a.intersect(b)` for `+`, `-`, `&`; `Pos(10, 0, 0).mul(shape)` and `GridLocations(20, 20, 3, 3).mul(shape)` for `*`. There is no builder mode (`BuildPart`, `BuildSketch`).
3. Prefer feature construction: a `Sketch` (`Rectangle`, `Circle`, `Polygon`, `Text`, their `fuse`/`cut`) extruded, revolved, lofted or swept, then `fillet`, `chamfer`, `shell` and holes on selected edges and faces. Select topology with chained `ShapeList` selectors such as `part.edges().parallelTo(Z)`, `part.faces().sortBy(Z).last` or `part.faces().top()`.
4. For appearance, materials, textures, mass or the drawing view, read `tau-authoring-reference.md` and import Tau types with `import type` from `@taucad/smlib/model`. Use physical `material` for glTF effects beyond the legacy color/opacity/metalness/roughness fields.
5. If parts move relative to one another, read `kinematics-reference.md`. Return separate named parts, export `mechanism` with joints and an animation for every independent motion, and verify the Kinematics pane plays them.
6. Verify the entry point and every renderable library file independently. Fix `ModelingError`/`KernelError` messages, material/resource and mechanism warnings even if some geometry renders.

For multiple files, import helpers with explicit ESM paths such as `./lib/widget.js`. Library files export geometry builders; `main.ts` assembles them. A standalone test target must export a default `main` returning geometry.

## Kernel rules

- Primitives (`Box`, `Cylinder`, `Sphere`, `Cone`, `Torus`) and sketches (`Rectangle`, `Circle`, …) are **centered on the origin** on every axis. Stand a part on XY with `{ align: ['center', 'center', 'min'] }` or `Pos(0, 0, h / 2).mul(...)`.
- Sketches are built on `Plane.XY`. Place one with `Pos(...).mul(sketch)`, `Plane.XZ.mul(sketch)`, `Plane.XY.offset(z).mul(sketch)` or `sketch.on(part.faces().top())`.
- `sketch.revolve()` turns about the sketch's **local Y axis**; a profile crossing that axis throws. For a Z-up turned part draw the half profile beside the axis on `Plane.XZ` and call `.revolve(Z)` (optional angle in degrees).
- Booleans take several operands at once: `base.cut(holeA, holeB)`, `base.fuse(GridLocations(...).mul(boss))`. A `Locations` product is a `ShapeList`; pass it straight to `fuse`/`cut`.
- Transforms return new shapes: `shape.translate(x, y, z)`, `shape.rotate(Z, degrees)`, `shape.mirror(Plane.YZ)`, `Rot(0, 0, 45).mul(shape)`. Angles are degrees, lengths millimetres.
- Name and color bodies with `.named('Lid')` and `.colored('#c78b52')`; a `ShapeConfig`'s own `name` and `color` win when present.
- Errors are specific: `ModelingError` explains the failed operation (a fillet larger than its faces allow, an axis crossing a revolve region), `KernelError` carries the kernel status, and a Python `ValueError` is a `RangeError`. Read the message and change the input rather than wrapping the call in `try`.

## Tessellation

SMLib meshes each B-rep face with a chordal and an angular tolerance, the same contract as Tau's OpenCascade kernels. Views and exports take `options.tessellation` as a preset or an explicit object, never both. Presets scale with the bounding-box diagonal D of every meshed shape: `low` (D/500, 30°) for a first look or a large assembly; `medium` (D/2000, 20°), the default for `evaluate_model`, `screenshot` and the viewer; `high` (D/8000, 12°), the export default; `extra-high` (D/32000, 6°) only when asked. The explicit `{ linearTolerance, angularTolerance }` is absolute, in millimetres and degrees, and does not scale with size; an omitted field keeps the kernel default (0.02 mm and 20° to view, 0.01 mm and 20° to export). Both forms together, such as `{ quality: 'high', linearTolerance: 0.01 }`, fail with `VALIDATION_ERROR`. A model cannot declare a tessellation hint, so keep it out of model parameters. Results report the effective `tessellation` (requested form, tolerances, triangles, vertices, elapsed); a view over 2 M triangles is re-meshed up to three steps coarser with a `TESSELLATION_DOWNGRADED` warning, and an export over 20 M fails with suggested tolerances. STEP is exact B-rep and takes no tessellation. There is no tessellation instancing: every repeated copy is meshed again.

## Canonical pattern

```ts
import { Box, Cylinder, GridLocations, Z, type Part } from '@classcad/smlibwasm';

export const defaultParams = {
  width: 80,
  depth: 60,
  thickness: 10,
  cornerRadius: 8,
  holeRadius: 4,
};

export default function main(p = defaultParams): Part {
  let plate = Box(p.width, p.depth, p.thickness, {
    align: ['center', 'center', 'min'],
  });
  plate = plate.fillet(plate.edges().parallelTo(Z), p.cornerRadius);
  const holes = GridLocations(p.width - 20, p.depth - 20, 2, 2).mul(
    Cylinder(p.holeRadius, p.thickness, { align: ['center', 'center', 'min'] }),
  );
  return plate.cut(holes).named('Plate');
}
```

Check invalid dimensions, a revolve axis through the profile, coincident boolean faces and over-sized fillets first. `api-*` files cover upstream `@classcad/smlibwasm`; `tau-api-*` files cover Tau's returned model and material types from `@taucad/smlib/model`. Grep them before assuming an API is unavailable.

## Wrong / Correct

- Wrong: `Box(10, 10, 10) + Cylinder(3, 20)` or `Box(...) - hole`. Correct: `Box(10, 10, 10).fuse(Cylinder(3, 20))`, `body.cut(hole)`.
- Wrong: `Pos(10, 0, 0) * Box(1, 1, 1)` or `Rectangle(40, 20, fillet=2)`. Correct: `Pos(10, 0, 0).mul(Box(1, 1, 1))`, `Rectangle(40, 20, { fillet: 2 })`.
- Wrong: `part.edges().filter_by(Axis.Z)` or `group_by`. Correct: camelCase, `part.edges().filterBy(Z)`, `part.edges().parallelTo(Z)`, `part.faces().groupBy(Z)`.
- Wrong: `Rectangle(10, 30).revolve()` (the default local Y axis crosses the centered region). Correct: `Plane.XZ.mul(Polygon([10, 0], [20, 0], [20, 30], [10, 30])).revolve(Z)`.
- Wrong: `import { Material } from '@taucad/smlib/model'` as a value. Correct: `import type { Material, Model, ShapeConfig } from '@taucad/smlib/model'`.

## Known gaps

SMLib in Tau has no STEP interfaces or PMI annotations (Replicad's `@taucad/replicad/annotations` has no SMLib equivalent), STEP export keeps shape names and the legacy `color` but not `density` or physical materials, textured and anisotropic materials use box-projected UVs because SMLib exposes no surface parameterization, error stacks are mapped to your source but not into smlibwasm's own frames, and there is no OpenCascade-level tracing, tessellation instancing or reuse of unchanged geometry between evaluations. Node-only file helpers (`exportStep(shapes, path)`, `importStep(path)`, `show`) do not apply in Tau; return shapes and let Tau export them.

## Core API

The symbols real Tau models use most, as verbatim declarations. Anything not shown is in the API reference below.

### Functions

```ts
// A box of `length` (X) by `width` (Y) by `height` (Z)
export declare function Box(length: number, width: number, height: number, options?: {
    align?: AlignLike;
}): Part;

// One alignment for all axes, or one per axis (null leaves an axis alone)
AlignLike: Align | string | null | readonly (Align | string | null)[]

// A cylinder along Z
export declare function Cylinder(radius: number, height: number, options?: {
    align?: AlignLike;
}): Part;

// A `width` (X) by `height` (Y) rectangle
export declare function Rectangle(width: number, height: number, options?: CornerOptions & PlacementOptions): Sketch;

// A disk of `radius`
export declare function Circle(radius: number, options?: {
    align?: AlignLike;
}): Sketch;

// The polygon through the points (closed automatically)
export declare function Polygon(...args: (VectorLike | readonly VectorLike[] | PolygonOptions)[]): Sketch;

// A point or direction
VectorLike: Vector | ArrayLike<number>

// A translation
export declare function Pos(x?: number | VectorLike | XYZ, y?: number, z?: number): Location;

// A rotation in degrees about the world X, then Y, then Z axis
export declare function Rot(x?: number | VectorLike | XYZ, y?: number, z?: number): Location;

// A rectangular grid in the XY plane, centered on the origin unless `centered
export declare function GridLocations(xSpacing: number, ySpacing: number, xCount: number, yCount: number, options?: {
    centered?: boolean;
}): Locations;

// `count` locations on a circle of `radius` in the XY plane
export declare function PolarLocations(radius: number, count: number, options?: {
    startAngle?: number;
    angularRange?: number;
    rotate?: boolean;
}): Locations;

// A sphere
export declare function Sphere(radius: number, options?: {
    align?: AlignLike;
}): Part;

// A drilling tool
export declare function Hole(radius: number, depth: number): Part;

// A drilling tool with a counterbore at the top
export declare function CounterBoreHole(radius: number, counterBoreRadius: number, counterBoreDepth: number, depth: number): Part;

// A solid through a sequence of cross sections, or a surface through open curves
export declare function loft(sections: readonly unknown[], options?: {
    ruled?: boolean;
    smooth?: boolean;
}): Part | Shell;

// Sweep a profile along a path
export declare function sweep(profile: Sketch | Face | Wire | Edge | ShapeList<Any>, path: Edge | Wire | ShapeList<Edge>, options?: SweepOptions): Part | Shell;

// Straight segments through the points
export declare function Polyline(...args: (VectorLike | readonly VectorLike[] | {
    close?: boolean;
})[]): Wire;

// A smooth cubic curve through the points
export declare function Spline(...args: (VectorLike | readonly VectorLike[] | {
    tangents?: readonly [VectorLike | null, VectorLike | null] | null;
    closed?: boolean;
})[]): Edge;

// A helix around `direction` through `center`
export declare function Helix(pitch: number, height: number, radius: number, options?: {
    center?: VectorLike;
    direction?: Axis | VectorLike;
    endRadius?: number | null;
    leftHanded?: boolean;
}): Edge;

// Lettering as a sketch in the XY plane, with the exact outlines of the…
export declare function Text(text: string, size: number, options?: TextOptions): Sketch;
```

### Classes

```ts
// A solid
export declare class Part extends _Body
  // Union with other parts (Python's `+`)
  fuse(...others: (Part | Iterable<Part>)[]): Part;
  // Subtract other parts (Python's `-`)
  cut(...others: (Part | Iterable<Part>)[]): Part;
  // Keep only the volume shared with the other parts (Python's `&`)
  intersect(...others: (Part | Iterable<Part>)[]): Part;
  // Round edges
  fillet(edges: unknown, radius: FilletRadius, options?: FilletOptions): Part;
  // Bevel edges
  chamfer(edges: unknown, length: number): Part;
  // Hollow the part out to walls of `thickness`, removing the `openings` faces
  shell(thickness: number, openings?: unknown, options?: {
          outward?: boolean;
      }): Part;
  // … 26 more members in the API reference: volume, area, center, massProperties, isValid, solids, merge, cells, offset, split, section, twist, taper, bend, deform, removeFillets, removeFaces, draftAnalysis, partingLine, draft, fold, flange, bends, unfold, flatPattern, toString

// A coordinate system
export declare class Plane
  static XY: Plane
  static XZ: Plane
  // This plane moved `distance` along its normal
  offset(distance: number): Plane;
  // … 32 more members in the API reference: YZ, ZX, YX, ZY, top, bottom, front, back, left, right, origin, xDir, yDir, zDir, constructor, normal, location, shifted, flipped, rotated, moved, at, toLocal, fromLocal, contains, distanceTo, project, isCoplanar, mul, equals, toString, [inspect]

// A rigid placement (rotation + translation), stored as a 4x4 matrix
export declare class Location
  constructor(position?: VectorLike | Plane | Location | Matrix | number[][] | null, rotation?: VectorLike | null);
  // Rotation by `angle` degrees about an arbitrary axis
  static about(axis: Axis, angle: number): Location;
  // The 4x4 homogeneous matrix (column-vector convention), row by row
  readonly matrix: number[][]
  readonly position: Vector
  // Rotation as X, Y, Z angles in degrees (applied in that order about world…
  readonly rotation: Vector
  readonly xDir: Vector
  readonly yDir: Vector
  readonly zDir: Vector
  // The XY plane moved by this location
  readonly plane: Plane
  inverse(): Location;
  rotateVector(v: VectorLike): Vector;
  // This location applied to something
  mul(other: Location): Location;
  mul(other: VectorLike): Vector;
  mul(other: Axis): Axis;
  mul(other: Plane): Plane;
  mul<T>(other: Movable<T>): T;
  mul<T>(other: readonly T[]): unknown[];
  equals(other: unknown): boolean;
  toString(): string;
  [inspect](): string;

// A list of locations
export declare class Locations extends Array<Location>
  static readonly [Symbol.species]: ArrayConstructor
  constructor(...items: unknown[]);
  // Each location applied to something
  mul(other: Location | Locations): Locations;
  mul<T>(other: Shape | Iterable<T>): ShapeList<Any>;
  // The pattern moved by a location (`location.mul(pattern)`)
  moved(location: Location): Locations;
  // The pattern placed onto a plane or face
  on(target: unknown): Locations;
  readonly points: Vector[]
  // Returns a string representation of an array
  toString(): string;
  [inspect](): string;

// Base class of all shapes
export declare abstract class Shape
  // A copy moved by `(x, y, z)`
  translate(x?: number | VectorLike, y?: number, z?: number): this;
  // A copy rotated by `angle` degrees about `axis`
  rotate(axis?: Axis, angle?: number): this;
  // A mirrored copy (reflection in `plane`, a plane or a planar face
  mirror(plane?: Plane | Face | Axis | ShapeList<Face>): this;
  // Place this shape, designed around the world XY plane, onto a plane or face
  on(target: Plane | Face | Location | ShapeList<Face> | Sketch): this;
  // … 14 more members in the API reference: vertices, edges, wires, faces, moved, scale, bbox, center, distanceTo, mesh, show, export, toString, [inspect]

// A planar region (with holes, possibly several pieces) on a plane
export declare class Sketch extends Shell
  // Round corners of the region with tangent arcs of `radius`
  fillet(radius: number, vertices?: Iterable<VectorLike | Vertex> | null): Sketch;
  // Extrude the region into a solid
  extrude(amount: number, options?: ExtrudeOptions): Part;
  // Revolve the region about an axis in its plane
  revolve(axis?: Axis | null, angle?: number): Part;
  // Sweep the region along a path
  sweep(path: Edge | Wire, options?: {
          sharpCorners?: boolean | null;
      }): Part;
  // … 11 more members in the API reference: plane, fuse, cut, intersect, xor, center, perimeter, offset, chamfer, mirror, toString

// A list of shapes with selection helpers
export declare class ShapeList<T = Shape> extends Array<T>
  // Sort by position along an axis, by "length"/"area"/"volume"/"radius", or by any function of a…
  sortBy(key?: SortKey, reverse?: boolean): ShapeList<T>;
  // `parallelTo(axis)`, `ofType(name)` or `filter(predicate)`, depending on the argument
  filterBy(criterion: Axis | string | ((s: T) => boolean)): ShapeList<T>;
  // Highest shapes (largest Z)
  top(): ShapeList<T>;
  // Lowest shapes (smallest Z)
  bottom(): ShapeList<T>;
  // Straight edges along `axis`, or planar faces whose normal is along `axis`
  parallelTo(axis: Axis | VectorLike): ShapeList<T>;
  // Straight edges perpendicular to `axis`, or planar faces containing it
  perpendicularTo(axis: Axis | VectorLike): ShapeList<T>;
  // … 44 more members in the API reference: one, first, last, sortByDistance, groupBy, maxBy, minBy, right, left, back, front, largest, smallest, nearest, filter, map, ofType, lines, circles, planar, cylinders, facing, convex, concave, smooth, fillets, hitBy, within, atPoint, union, difference, intersection, vertices, edges, faces, wires, center, bbox, moved, on, translate, rotate, toString, and 1 more
```

### Types

```ts
// A shape with optional display and material metadata for rendering
ShapeConfig: {
  shape: SmlibShape
  name?: string
  // Drawing stroke style for curves
  strokeType?: string
  // Physical density in g/cm³, retained on the part for mass evidence
  density?: number
  // CSS color, converted from sRGB to linear glTF base color
  color?: string
  opacity?: number
  metalness?: number
  roughness?: number
  material?: never
}

// Anything an SMLib model can return for display
SmlibShape: Shape | Mesh

// Model-level textures and images shared by the returned shapes
Model: GlbResources & {
  // An array of textures
  textures?: ITexture[]
  // An array of samplers
  samplers?: ISampler[]
  images?: GlbImage[]
  shapes: ShapeConfig[]
}
```

## API reference

To read any other signature, find its name in `api-index.md`, which lists all 697 symbols by file with the lines that hold each, and read that range of the named file.

- `api-constants.md` — Constants
- `api-classes.md` — Classes
- `api-classes-2.md` — Classes (2)
- `api-classes-3.md` — Classes (3)
- `api-functions.md` — Functions
- `api-functions-2.md` — Functions (2)
- `api-types.md` — Types
- `api-interfaces.md` — Interfaces

Read ranges, not whole files. Never copy a reference into a source file.
