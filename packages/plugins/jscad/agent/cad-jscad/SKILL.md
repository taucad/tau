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
    center?: Vec2
    radius?: number
    startAngle?: number
    endAngle?: number
    segments?: number
    makeTangent?: boolean
  declare function circle(options?: CircleOptions): Geom2
  export interface CircleOptions
    center?: Vec2
    radius?: number
    startAngle?: number
    endAngle?: number
    segments?: number
  declare function cube(options?: CubeOptions): Geom3
  export interface CubeOptions
    center?: Vec3
    size?: number
  declare function cuboid(options?: CuboidOptions): Geom3
  export interface CuboidOptions
    center?: Vec3
    size?: Vec3
  declare function cylinder(options?: CylinderOptions): Geom3
  export interface CylinderOptions
    center?: Vec3
    height?: number
    radius?: number
    segments?: number
  export interface CylinderEllipticOptions
    center?: Vec3
    height?: number
    startRadius?: [number, number]
    startAngle?: number
    endRadius?: [number, number]
    endAngle?: number
    segments?: number
  export interface EllipseOptions
    center?: Vec2
    radius?: Vec2
    startAngle?: number
    endAngle?: number
    segments?: number
  export interface EllipsoidOptions
    center?: Vec3
    radius?: Vec3
    segments?: number
    axes?: Vec3
  export interface GeodesicSphereOptions
    radius?: number
    frequency?: number
  declare function polygon(options: PolygonOptions): Geom2
  export interface PolygonOptions
    points: Array<Vec2> | Array<Array<Vec2>>
    paths?: Array<number> | Array<Array<number>>
    orientation?: 'counterclockwise' | 'clockwise'
  export interface PolyhedronOptions
    points: Array<Vec3>
    faces: Array<Array<number>>
    colors?: Array<RGB | RGBA>
    orientation?: 'outward' | 'inward'
  declare function rectangle(options?: RectangleOptions): Geom2
  export interface RectangleOptions
    center?: Vec2
    size?: Vec2
  export interface RoundedCuboidOptions
    center?: Vec3
    size?: Vec3
    roundRadius?: number
    segments?: number
  export interface RoundedCylinderOptions
    center?: Vec3
    height?: number
    radius?: number
    roundRadius?: number
    segments?: number
  export interface RoundedRectangleOptions
    center?: Vec2
    size?: Vec2
    roundRadius?: number
    segments?: number
  export interface SphereOptions
    center?: Vec3
    radius?: number
    segments?: number
    axes?: Vec3
  export interface SquareOptions
    center?: Vec2
    size?: number
  export interface StarOptions
    center?: Vec2
    vertices?: number
    density?: number
    outerRadius?: number
    innerRadius?: number
    startAngle?: number
  declare function torus(options?: TorusOptions): Geom3
  export interface TorusOptions
    innerRadius?: number
    outerRadius?: number
    innerSegments?: number
    outerSegments?: number
    innerRotation?: number
    outerRotation?: number
    startAngle?: number
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
    height?: number
    twistAngle?: number
    twistSteps?: number
  export interface ExtrudeRectangularOptions
    size?: number
    height?: number
    corners?: Corners
    segments?: number
  export interface ExtrudeHelicalOptions
    angle?: number
    startAngle?: number
    pitch?: number
    height?: number
    endOffset?: number
    segmentsPerRotation?: number
  slice
    declare function calculatePlane(slice: Slice): Plane
    declare function clone(slice: Slice): Slice
    declare function clone(out: Slice, slice: Slice): Slice
    declare function create(edges?: Slice['edges']): Slice
    declare function equals(a: Slice, b: Slice): boolean
    declare function fromPoints(points: Array<Point>): Slice
    declare function fromSides(sides: Geom2['sides']): Slice
    declare function isA(object: any): object is Slice
    declare function reverse(slice: Slice): Slice
    declare function reverse(out: Slice, slice: Slice): Slice
    declare function toEdges(slice: Slice): Slice['edges']
    declare function toPolygons(slice: Slice): Array<Poly3>
    declare function toString(slice: Slice): string
    declare function transform(matrix: Mat4, slice: Slice): Slice
    interface Slice
      edges: Array<[Vec3, Vec3]>
  // … 8 more members in the API reference
```

### maths

```ts
maths
  line2
  line3
  utils
    declare function aboutEqualNormals(a: Vec3, b: Vec3): boolean
    declare function area(points: Array<Vec2>): number
    declare function interpolateBetween2DPointsForY(point1: Vec2, point2: Vec2, y: number): number
    declare function intersect(p1: Vec2, p2: Vec2, p3: Vec2, p4: Vec2): Vec2
    declare function solve2Linear(a: number, b: number, c: number, d: number, u: number, v: number): Vec2
    export function sin(radians: number): number
    export function cos(radians: number): number
  vec2
  vec3
  // … 4 more members in the API reference
```

### geometries

```ts
geometries
  geom2
  geom3
  path2
  poly2
    declare function arePointsInside(points: Array<Vec2>, polygon: Poly2): number
    declare function create(vertices?: Array<Vec2>): Poly2
    declare function flip(polygon: Poly2): Poly2
    declare function measureArea(polygon: Poly2): number
    declare interface Poly2
      vertices: Array<Vec2>
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
  export interface VectorChar
    width: number
    height: number
    segments: Array<Array<Vec2>>
  export interface VectorCharOptions
    xOffset?: number
    yOffset?: number
    height?: number
    extrudeOffset?: number
    input?: string
  export interface VectorTextOptions
    xOffset?: number
    yOffset?: number
    height?: number
    lineSpacing?: number
    letterSpacing?: number
    align?: 'left' | 'center' | 'right'
    extrudeOffset?: number
    input?: string
  // … 3 more members in the API reference
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
    declare function create(points: Array<number> | Array<Array<number>>): Bezier
    declare function tangentAt(t: number, bezier: Bezier): Array<number> | number
    declare function valueAt(t: number, bezier: Bezier): Array<number> | number
    declare function lengths(segments: number, bezier: Bezier): Array<number>
    declare function length(segments: number, bezier: Bezier): number
    declare function arcLengthToT(options: ArcLengthToTOptions, bezier: Bezier): number
    declare interface Bezier
      points: Array<number> | Array<Array<number>>
      pointType: string
      dimensions: number
      permutations: Array<number>
      tangentPermutations: Array<number>
```

### measurements

```ts
measurements
  declare function measureBoundingBox(geometry: Geometry): BoundingBox
  declare function measureBoundingBox(geometry: any): [[0, 0, 0], [0, 0, 0]]
  declare function measureBoundingBox(...geometries: RecursiveArray<Geometry | any>): Array<BoundingBox>
  // … 12 more members in the API reference
```

## API reference

To read any other signature, grep the skill directory for the name followed by `(` (or the bare type name): each hit is the declaration line and names its file; read a few lines around it for overloads and parameter notes. `api-index.md` lists all 729 symbols by file.

- 15 reference files, named in `api-index.md`

Read ranges, not whole files. Never copy a reference into a source file.
