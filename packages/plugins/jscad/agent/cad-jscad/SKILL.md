---
name: cad-jscad
description: Guides JSCAD modeling in main.ts with 2D-first CSG and deliberate tessellation. Use when creating or editing @jscad/modeling geometry.
---

# JSCAD authoring

## Workflow

1. Author `main.ts` with ES module imports from `@jscad/modeling`, exported `defaultParams`, and a default `main(params)` returning geometry.
2. Compose holes, slots, ears, sockets, and teeth in a 2D profile, then call `extrudeLinear` once.
3. Choose segment counts deliberately because curves become mesh evidence.
4. Name every returned part, and keep each standalone test target renderable through its own default `main`.

For multiple files, import helpers through explicit ESM paths such as `./lib/widget.js`; the entry point owns assembly.

## Kernel rules

- Prefer `circle`, `cylinder`, and `extrudeRotate` with roughly `max(16, Math.PI * diameter / 0.3)` segments over manual point loops.
- Prefer `extrudeRotate` or `extrudeLinear` when the profile has a regular form.
- Avoid 3D mesh CSG between overlapping, touching, or contained primitives when the equivalent 2D profile operation exists; the preview can hide a non-manifold `geom3`.
- Attach a stable name, for example with `Object.assign(shape, { name })`.
- When returning multiple shapes, return one flat array of named geometries; never nest arrays or wrap them in a result object.

## Canonical pattern

```ts
import { booleans, extrusions, primitives, type geometries } from '@jscad/modeling';

export const defaultParams = { radius: 18, holeRadius: 5, height: 6, segments: 48 };

export default function main(p = defaultParams): geometries.geom3.Geom3 {
  const profile = booleans.subtract(
    primitives.circle({ radius: p.radius, segments: p.segments }),
    primitives.circle({ radius: p.holeRadius, segments: 32 }),
  );
  return Object.assign(extrusions.extrudeLinear({ height: p.height }, profile), { name: 'Plate' });
}
```

Check import paths, vector shapes, invalid dimensions, failed booleans, and segment proliferation first.

## Wrong / Correct

- Wrong: `primitives.cylinder(10, 5)`. Correct: every primitive takes one options object: `primitives.cylinder({ height: 10, radius: 5, segments: 48 })`.
- Wrong: `transforms.translate(shape, [x, y, z])`. Correct: options or vector first, geometry last: `transforms.translate([x, y, z], shape)`, `extrusions.extrudeLinear({ height }, profile)`.

## Core API

The symbols real Tau models use most, as verbatim declarations. Anything not shown is in the API reference below.

### primitives

```ts
primitives
  export interface ArcOptions
  declare function circle(options?: CircleOptions): Geom2
  export interface CircleOptions
  declare function cube(options?: CubeOptions): Geom3
  export interface CubeOptions
  declare function cuboid(options?: CuboidOptions): Geom3
  export interface CuboidOptions
  declare function cylinder(options?: CylinderOptions): Geom3
  export interface CylinderOptions
  export interface CylinderEllipticOptions
  export interface EllipseOptions
  export interface EllipsoidOptions
  export interface GeodesicSphereOptions
  declare function polygon(options: PolygonOptions): Geom2
  export interface PolygonOptions
  export interface PolyhedronOptions
  declare function rectangle(options?: RectangleOptions): Geom2
  export interface RectangleOptions
  export interface RoundedCuboidOptions
  export interface RoundedCylinderOptions
  export interface RoundedRectangleOptions
  export interface SphereOptions
  export interface SquareOptions
  export interface StarOptions
  declare function torus(options?: TorusOptions): Geom3
  export interface TorusOptions
  // … 15 more members in the API reference
```

### booleans

```ts
booleans
  declare function intersect(...geometries: RecursiveArray<Geom2>): Geom2
  declare function intersect(...geometries: RecursiveArray<Geom3>): Geom3
  export function minkowski(geometryA: Geom3, geometryB: Geom3): Geom3
  export function minkowski(...geometries: Geom3[]): Geom3
  declare function subtract(...geometries: RecursiveArray<Geom2>): Geom2
  declare function subtract(...geometries: RecursiveArray<Geom3>): Geom3
  declare function union(...geometries: RecursiveArray<Geom2>): Geom2
  declare function union(...geometries: RecursiveArray<Geom3>): Geom3
  declare function scission(...geometries: RecursiveArray<Geom3>): Geom3[]
```

### transforms

```ts
transforms
  export function center<T extends Geometry>(options: CenterOptions, geometry: T): T
  export function center<T extends Geometry>(options: CenterOptions, ...geometries: RecursiveArray<T>): Array<T>
  export function center(options: CenterOptions, ...geometries: RecursiveArray<Geometry>): Array<Geometry>
  export function mirrorZ<T extends Geometry>(geometry: T): T
  export function mirrorZ<T extends Geometry>(...geometries: RecursiveArray<T>): Array<T>
  export function mirrorZ(...geometries: RecursiveArray<Geometry>): Array<Geometry>
  export function rotate<T extends Geometry>(angles: Vec1 | Vec2 | Vec3, geometry: T): T
  export function rotate<T extends Geometry>(angles: Vec1 | Vec2 | Vec3, ...geometries: RecursiveArray<T>): Array<T>
  export function rotate(angles: Vec1 | Vec2 | Vec3, ...geometries: RecursiveArray<Geometry>): Array<Geometry>
  export function rotateX<T extends Geometry>(angle: number, geometry: T): T
  export function rotateX<T extends Geometry>(angle: number, ...geometries: RecursiveArray<T>): Array<T>
  export function rotateX(angle: number, ...geometries: RecursiveArray<Geometry>): Array<Geometry>
  export function rotateY<T extends Geometry>(angle: number, geometry: T): T
  export function rotateY<T extends Geometry>(angle: number, ...geometries: RecursiveArray<T>): Array<T>
  export function rotateY(angle: number, ...geometries: RecursiveArray<Geometry>): Array<Geometry>
  export function rotateZ<T extends Geometry>(angle: number, geometry: T): T
  export function rotateZ<T extends Geometry>(angle: number, ...geometries: RecursiveArray<T>): Array<T>
  export function rotateZ(angle: number, ...geometries: RecursiveArray<Geometry>): Array<Geometry>
  export function scale<T extends Geometry>(factors: Vec1 | Vec2 | Vec3, geometry: T): T
  export function scale<T extends Geometry>(factors: Vec1 | Vec2 | Vec3, ...geometries: RecursiveArray<T>): Array<T>
  export function scale(factors: Vec1 | Vec2 | Vec3, ...geometries: RecursiveArray<Geometry>): Array<Geometry>
  export function translate<T extends Geometry>(offset: Vec, geometry: T): T
  export function translate<T extends Geometry>(offset: Vec, ...geometries: RecursiveArray<T>): Array<T>
  export function translate(offset: Vec, ...geometries: RecursiveArray<Geometry>): Array<Geometry>
  // … 18 more members in the API reference
```

### extrusions

```ts
extrusions
  declare function extrudeLinear(options: ExtrudeLinearOptions, geometry: Geometry): Geom3
  declare function extrudeLinear(options: ExtrudeLinearOptions, ...geometries: RecursiveArray<Geometry>): Geom3
  export interface ExtrudeLinearOptions
  export interface ExtrudeRectangularOptions
  export interface ExtrudeHelicalOptions
  slice
  // … 8 more members in the API reference
```

### maths

```ts
maths
  constants
  line2
  line3
  mat4
  plane
  utils
  vec2
  vec3
  vec4
```

### geometries

```ts
geometries
  geom2
  geom3
  path2
  poly2
  poly3
```

### colors

```ts
colors
  declare function colorize<T extends Geometry>(color: RGB | RGBA, object: T): T & Colored
  declare function colorize<T extends Geometry>(color: RGB | RGBA, ...objects: RecursiveArray<T>): Array<T & Colored>
  declare function colorize(color: RGB | RGBA, ...objects: RecursiveArray<Geometry>): Array<Geometry & Colored>
  cssColors
  // … 14 more members in the API reference
```

### text

```ts
text
  declare function vectorChar(): VectorChar
  declare function vectorChar(char: string): VectorChar
  declare function vectorChar(options: VectorCharOptions): VectorChar
  declare function vectorChar(options: Omit<VectorCharOptions, 'input'>, char: string): VectorChar
  export interface VectorChar
  export interface VectorCharOptions
  declare function vectorText(): VectorText
  declare function vectorText(text: string): VectorText
  declare function vectorText(options: VectorTextOptions): VectorText
  declare function vectorText(options: Omit<VectorTextOptions, 'input'>, text: string): VectorText
  export interface VectorText extends Array<Array<Vec2>>
  export interface VectorTextOptions
```

### utils

```ts
utils
  declare function areAllShapesTheSameType(shapes: Array<Geometry>): boolean
  declare function degToRad(degrees: number): number
  declare function flatten<T>(arr: RecursiveArray<T>): Array<T>
  declare function fnNumberSort(a: number, b: number): number
  declare function insertSorted<T>(array: Array<T>, element: T, comparefunc: (a: T, b: T) => number): void
  declare function radiusToSegments(radius: number, minimumLength?: number, minimumAngle?: number): number
  declare function radToDeg(radians: number): number
```

### curves

```ts
curves
  bezier
```

### measurements

```ts
measurements
  declare function measureBoundingBox(geometry: Geometry): BoundingBox
  declare function measureBoundingBox(geometry: any): [[0, 0, 0], [0, 0, 0]]
  declare function measureBoundingBox(...geometries: RecursiveArray<Geometry | any>): Array<BoundingBox>
  // … 12 more members in the API reference
```

### expansions

```ts
expansions
  declare function expand(options: ExpandOptions, geometry: Path2 | Geom2): Geom2
  declare function expand(options: ExpandOptions, geometry: Geom3): Geom3
  declare function expand<T extends Geom>(options?: ExpandOptions, ...geometries: RecursiveArray<T>): Array<T>
  declare function expand(options?: ExpandOptions, ...geometries: RecursiveArray<Geom>): Array<Geom>
  export interface ExpandOptions
  declare function offset<T extends Geometry>(options: OffsetOptions, geometry: T): T
  declare function offset(options?: OffsetOptions, ...geometries: RecursiveArray<Geometry>): Geometry
  export interface OffsetOptions
```

## API reference

To read any other signature, grep the skill directory for the name followed by `(` (or the bare type name): each hit is the declaration line and names its file; read a few lines around it for overloads and parameter notes. `api-index.md` lists all 729 symbols by file.

- 15 reference files, named in `api-index.md`

Read ranges, not whole files. Never copy a reference into a source file.
