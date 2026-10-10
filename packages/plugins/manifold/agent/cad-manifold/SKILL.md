---
name: cad-manifold
description: Guides robust Manifold mesh CAD in main.ts. Use when creating or editing TypeScript geometry with manifold-3d/manifoldCAD.
---

# Manifold authoring

## Workflow

1. Author `main.ts` with ES module imports from `manifold-3d/manifoldCAD`, exported `defaultParams`, and a default `main(params)` returning a `Manifold` or a flat array of `Manifold`/GLTF nodes.
2. Use positive dimensions and built-in primitives, revolves, and booleans.
3. Choose segment counts deliberately because all curves become mesh geometry.
4. Keep every standalone test target renderable through a default `main` returning geometry.

For multiple files, import helpers through explicit ESM paths such as `./lib/widget.js`; keep assembly orchestration in `main.ts`.

## Kernel rules

- For cylinders, spheres, and revolves, start near `max(16, Math.PI * diameter / 0.3)` segments for visible parts; 32 suits small features and 64 large ones.
- Prefer `Manifold.cylinder`, `Manifold.sphere`, and `Manifold.revolve` over manual point loops.
- Combine arrays once with `Manifold.compose` or n-ary boolean methods instead of nested Manifold-of-Manifold construction.
- Do not proliferate segments on small features.

## Canonical pattern

```ts
import { GLTFNode, Manifold } from 'manifold-3d/manifoldCAD';

export const defaultParams = { width: 80, depth: 40, height: 20, holeRadius: 6 };

export default function main(p = defaultParams): GLTFNode {
  const body = Manifold.cube([p.width, p.depth, p.height], true);
  const hole = Manifold.cylinder(p.height + 2, p.holeRadius, -1, 64, true);
  const solid = body.subtract(Manifold.union([hole.translate([-20, 0, 0]), hole.translate([20, 0, 0])]));
  // Flat normals, named on the material, so screenshots shade the mesh.
  const node = new GLTFNode();
  node.manifold = solid.calculateNormals(0, 60);
  node.material = { attributes: ['NORMAL'] };
  return node;
}
```

Check missing imports, undefined returns, invalid boolean inputs, and non-positive dimensions first.

## Wrong / Correct

- Wrong: `Manifold.cylinder(radius, height)`. Correct: height first: `Manifold.cylinder(height, radiusLow, radiusHigh, segments, center)`; pass `-1` for `radiusHigh` to match `radiusLow`.
- Wrong: chaining `a.add(b).add(c)…` over many parts. Correct: `Manifold.union([a, b, c])` once.
- Wrong: returning a boolean result as it is. Correct: finish with `.calculateNormals(0, 60)` in a `GLTFNode` whose material names `['NORMAL']`, as above. Otherwise screenshots fail with "TRIANGLES primitive missing NORMAL".

## Core API

The symbols real Tau models use most, as verbatim declarations. Anything not shown is in the API reference below.

### Classes

```ts
// This library's internal representation of an oriented, 2-manifold, triangle mesh - a simple boundary-representation…
export declare class Manifold
  constructor(mesh: Mesh);
  // Constructs a unit cube (edge lengths all one), by default in the first octant,…
  static cube(size?: Readonly<Vec3>|number, center?: boolean): Manifold;
  // A convenience constructor for the common case of extruding a circle
  static cylinder(
      height: number, radiusLow: number, radiusHigh?: number,
      circularSegments?: number, center?: boolean): Manifold;
  // Constructs a geodesic sphere of a given radius
  static sphere(radius: number, circularSegments?: number): Manifold;
  // Constructs a manifold from a set of polygons/cross-section by extruding them along the Z-axis
  static extrude(
      polygons: CrossSection|Polygons, height: number, nDivisions?: number,
      twistDegrees?: number, scaleTop?: Readonly<Vec2>|number,
      center?: boolean): Manifold;
  // Constructs a manifold from a set of polygons/cross-section by revolving them around the Y-axis…
  static revolve(
      polygons: CrossSection|Polygons, circularSegments?: number,
      revolveDegrees?: number): Manifold;
  // Move this Manifold in space
  translate(v: Readonly<Vec3>): Manifold;
  translate(x: number, y?: number, z?: number): Manifold;
  // Applies an Euler or Tait-Bryan angle rotation to the manifold
  rotate(v: Readonly<Vec3>): Manifold;
  rotate(x: number, y?: number, z?: number): Manifold;
  // Scale this Manifold in space
  scale(v: Readonly<Vec3>|number): Manifold;
  // Fills in vertex properties for normal vectors, calculated from the mesh geometry
  calculateNormals(normalIdx: number, minSharpAngle?: number): Manifold;
  // Boolean union
  add(other: Manifold): Manifold;
  // Boolean difference
  subtract(other: Manifold): Manifold;
  // Boolean intersection
  intersect(other: Manifold): Manifold;
  // Boolean union of the manifolds a and b Boolean union of a list of…
  static union(a: Manifold, b: Manifold): Manifold;
  static union(manifolds: readonly Manifold[]): Manifold;
  // Boolean difference of the manifold b from the manifold a Boolean difference of the…
  static difference(a: Manifold, b: Manifold): Manifold;
  static difference(manifolds: readonly Manifold[]): Manifold;
  // If you copy a manifold, but you want this new copy to have new…
  asOriginal(): Manifold;
  // … 44 more members in the API reference

// A vector in three dimensional space
Vec3: [number, number, number]

Polygons: SimplePolygon|SimplePolygon[]

// A vector in two dimensional space
Vec2: [number, number]

SimplePolygon: Vec2[]

// Two-dimensional cross sections guaranteed to be without self-intersections, or overlaps between polygons (from construction…
export declare class CrossSection
  // Constructs a square with the given XY dimensions
  static square(size?: Readonly<Vec2>|number, center?: boolean): CrossSection;
  // Constructs a circle of a given radius
  static circle(radius: number, circularSegments?: number): CrossSection;
  // … 28 more members in the API reference

// Position a manifold model for later export
export declare class GLTFNode extends BaseGLTFNode
  manifold?: Manifold
  material?: GLTFMaterial
  clone(newParent?: BaseGLTFNode): GLTFNode;
  // Does this node have any geometry that needs to be converted on export?
  isEmpty(): boolean;

// Define a material using the glTF metallic-roughness physically-based rendering model
export declare interface GLTFMaterial
  // Every vertex in a glTF Mesh has a set of attributes
  attributes?: GLTFAttribute[]
  // Roughness of the material
  roughness?: number
  // Metallic property of the material
  metallic?: number
  // Base colour of the material
  baseColorFactor?: [number, number, number]
  // Transparency of the material
  alpha?: number
  // Render model as unlit or shadeless, as opposed to physically based rendering
  unlit?: boolean
  // Material name
  name?: string
  // If set, this material is a copy of another material on an in-memory glTF…
  sourceMaterial?: GLTFTransform.Material
  // If set, this material is a copy of another material on an in-memory glTF…
  sourceRunID?: number
  // Treat this material as double sided
  doubleSided?: boolean

GLTFAttribute: 'POSITION' | 'NORMAL' | 'TANGENT' | 'TEXCOORD_0' | 'TEXCOORD_1' | 'COLOR_0' | 'JOINTS_0' | 'WEIGHTS_0' | 'SKIP_1' | 'SKIP_2' | 'SKIP_3' | 'SKIP_4'

// The abstract class from which other classes inherit
export declare abstract class BaseGLTFNode
  name?: string
  translation?: Vec3 | ((t: number) => Vec3)
  // From the reference frame of the model being rotated, rotations are applied in *z-y'-x"*…
  rotation?: Vec3 | ((t: number) => Vec3)
  scale?: Vec3 | ((t: number) => Vec3)
  constructor(parent?: BaseGLTFNode);
  readonly parent: BaseGLTFNode | undefined
  // Does this node have any geometry that needs to be converted on export?
  isEmpty(): boolean;
```

### Functions

```ts
// Return a shallow copy of the input manifold with the given material properties applied
export declare function setMaterial(manifold: Manifold, material: GLTFMaterial): Manifold;
```

## API reference

To read any other signature, grep the skill directory for the name followed by `(` (or the bare type name): each hit is the declaration line and names its file; read a few lines around it for overloads and parameter notes. `api-index.md` lists all 208 symbols by file.

- `api-functions.md` — Functions
- `api-types.md` — Types
- `api-classes.md` — Classes
- `api-classes-2.md` — Classes (2)
- `api-interfaces.md` — Interfaces

Read ranges, not whole files. Never copy a reference into a source file.
