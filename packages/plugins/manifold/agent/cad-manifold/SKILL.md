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
import { Manifold } from 'manifold-3d/manifoldCAD';

export const defaultParams = { width: 80, depth: 40, height: 20, holeRadius: 6 };

export default function main(p = defaultParams): Manifold {
  const body = Manifold.cube([p.width, p.depth, p.height], true);
  const hole = Manifold.cylinder(p.height + 2, p.holeRadius, -1, 64, true);
  return body.subtract(Manifold.union([hole.translate([-20, 0, 0]), hole.translate([20, 0, 0])]));
}
```

Check missing imports, undefined returns, invalid boolean inputs, and non-positive dimensions first.

## Wrong / Correct

- Wrong: `Manifold.cylinder(radius, height)`. Correct: height first: `Manifold.cylinder(height, radiusLow, radiusHigh, segments, center)`; pass `-1` for `radiusHigh` to match `radiusLow`.
- Wrong: chaining `a.add(b).add(c)…` over many parts. Correct: `Manifold.union([a, b, c])` once.

## Core API

The symbols real Tau models use most, as verbatim declarations. Anything not shown is in the API reference below.

### Classes

```ts
// This library's internal representation of an oriented, 2-manifold, triangle mesh - a simple boundary-representation…
export declare class Manifold
  constructor(mesh: Mesh);
  // Constructs a unit cube (edge lengths all one), by default in the first octant,…
  static cube(size?: Readonly<Vec3>|number, center?: boolean): Manifold;
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
  // Boolean union of the manifolds a and b Boolean union of a list of…
  static union(a: Manifold, b: Manifold): Manifold;
  static union(manifolds: readonly Manifold[]): Manifold;
  // Boolean difference of the manifold b from the manifold a Boolean difference of the…
  static difference(a: Manifold, b: Manifold): Manifold;
  static difference(manifolds: readonly Manifold[]): Manifold;
  // … 52 more members in the API reference

// A vector in three dimensional space
Vec3: [number, number, number]
```

### Functions

```ts
declare function Module(config?: {locateFile: () => string}):
Promise<ManifoldToplevel>;

export declare interface ManifoldToplevel
  CrossSection: typeof CrossSection
  Manifold: typeof Manifold
  Mesh: typeof Mesh
  triangulate: typeof triangulate
  setMinCircularAngle: typeof setMinCircularAngle
  setMinCircularEdgeLength: typeof setMinCircularEdgeLength
  setCircularSegments: typeof setCircularSegments
  getCircularSegments: typeof getCircularSegments
  resetToCircularDefaults: typeof resetToCircularDefaults
  setup: () => void
```

## API reference

To read any other signature, grep the skill directory for the name followed by `(` (or the bare type name): each hit is the declaration line and names its file; read a few lines around it for overloads and parameter notes. `api-index.md` lists all 166 symbols by file.

- `api-functions.md` — Functions
- `api-types.md` — Types
- `api-classes.md` — Classes
- `api-interfaces.md` — Interfaces

Read ranges, not whole files. Never copy a reference into a source file.
