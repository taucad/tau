---
title: 'Buerli ClassCAD Kernel Integration'
description: 'Investigation of @buerli.io/classcad WASM integration for Tau kernel plugin, covering API surface, runtime constraints, and test strategy.'
status: active
created: '2026-04-09'
updated: '2026-04-09'
category: reference
related:
  - docs/policy/runtime-architecture-policy.md
---

# Buerli ClassCAD Kernel Integration

Investigation of how `@buerli.io/classcad` integrates as a Tau kernel plugin, its WASM runtime constraints, and the testing strategy for validating the geometry pipeline.

## Executive Summary

ClassCAD via `@buerli.io/classcad` provides a powerful BRep-based parametric CAD engine that runs in-browser via WebAssembly. The WASM variant requires the browser `Worker` API (Comlink-based) and **cannot execute in Node.js/Vitest**. This is fundamentally different from replicad/manifold/JSCAD whose WASM runtimes are Node-compatible. The testing strategy must account for this constraint by validating the kernel's bundler pipeline, module registration, and geometry conversion using the real esbuild bundler while the actual ClassCAD engine calls are structurally verified rather than executed.

## Problem Statement

Unlike replicad (which runs OCCT WASM in Node.js), `@buerli.io/classcad`'s `WASMClient` uses Comlink to spawn a browser Web Worker for the ClassCAD WASM module. In Node.js:

- `init()` succeeds (registers the client factory)
- `WASMClient.connect()` throws `ReferenceError: Worker is not defined`
- No geometry can be produced without a running ClassCAD engine instance

This means the "gold standard" replicad test pattern (real WASM → real geometry → GLB validation) is not directly reproducible.

## Methodology

- Cloned `awv-informatik/buerli-examples` and `awv-informatik/buerligons` via `pnpm repos`
- Read 56 example files covering Solid, Part, Assembly, Sketch, and Curve APIs
- Verified WASM runtime constraints with direct Node.js invocation
- Studied the replicad test suite (~4000 lines) as the gold standard
- Analyzed existing Tau kernel test infrastructure (`createTestWorker`, `createTestGeometry`, geometry helpers)

## Findings

### Finding 1: ClassCAD API Surface — Two Modeling Paradigms

ClassCAD exposes two distinct modeling paradigms:

| Paradigm            | API Namespace                       | Description                                                                            |
| ------------------- | ----------------------------------- | -------------------------------------------------------------------------------------- |
| **History/Feature** | `api.part.*`, `api.sketch.*`        | Parametric: features auto-recalculate. `create` → `cylinder` → `fillet` → `boolean`    |
| **Solid/Direct**    | `api.solid.*` via `entityInjection` | Destructive: in-place operations. `create` → `entityInjection` → `box` → `subtraction` |

Both paradigms share `api.curve.*` (shape creation) and `api.common.*` (save/load/settings).

### Finding 2: Key API Call Signatures (from examples)

**Part (History) API:**

| Method                         | Signature                                                               |
| ------------------------------ | ----------------------------------------------------------------------- |
| `part.create`                  | `({ name?: string })`                                                   |
| `part.cylinder`                | `({ id, diameter, height, references? })`                               |
| `part.box`                     | `({ id, length, width, height })`                                       |
| `part.fillet`                  | `({ id, references, radius })`                                          |
| `part.chamfer`                 | `({ id, type, references, distance1 })`                                 |
| `part.boolean`                 | `({ id, type: 'UNION'\|'SUBTRACTION'\|'INTERSECTION', target, tools })` |
| `part.extrusion`               | `({ id, references, limit2, type? })`                                   |
| `part.sketch`                  | `({ id, planeId })`                                                     |
| `part.workPlane`               | `({ id, position?, normal?, name? })`                                   |
| `part.expression`              | `({ id, toCreate: [{name, value}] })`                                   |
| `part.circularPattern`         | `({ id, targets, references, angle, count, merged })`                   |
| `part.getGeometryIds`          | `({ id, circles?: [{pos}], lines?: [{pos}] })`                          |
| `part.calculateMassProperties` | `({ id })` → `{ volume }`                                               |
| `part.setAppearance`           | `({ target, color, transparency })`                                     |

**Solid (Direct) API:**

| Method              | Signature                                                           |
| ------------------- | ------------------------------------------------------------------- |
| `solid.box`         | `({ id: entityInjectionId, width, height, length, translation? })`  |
| `solid.cylinder`    | `({ id, diameter, height, translation?, rotation?, rotateFirst? })` |
| `solid.extrusion`   | `({ id, curves, direction })`                                       |
| `solid.union`       | `({ id, target, tools })`                                           |
| `solid.subtraction` | `({ id, target, tools, keepTools? })`                               |
| `solid.slice`       | `({ id, target, originPos, normal })`                               |
| `solid.mirror`      | `({ id, target, originPos, normal })`                               |
| `solid.fillet`      | `({ id, target, edges, radius })`                                   |
| `solid.copy`        | `({ id, target, translation })`                                     |
| `solid.deleteSolid` | `({ id, ids })`                                                     |
| `solid.rotation`    | `({ id, target, ... })`                                             |
| `solid.translation` | `({ id, target, ... })`                                             |

**Sketch API:**

| Method                | Signature                                             |
| --------------------- | ----------------------------------------------------- |
| `sketch.create`       | `({ id: partId, planeId })`                           |
| `sketch.geometry`     | `({ id, lines: [{startPos, endPos}] })` → `{ lines }` |
| `sketch.arcByCenter`  | `({ id, startPos, endPos, centerPos })`               |
| `sketch.arcBy3Points` | `({ id, startPos, endPos, midPos })`                  |
| `sketch.circle`       | `({ id, center, radius })`                            |
| `sketch.constraint`   | `({ id, type, geomIds })`                             |
| `sketch.dimension`    | `({ id, type, geomIds, value })`                      |

**Geometry Retrieval:**

| Method                                  | Returns                                  |
| --------------------------------------- | ---------------------------------------- |
| `model.createBufferGeometry(objectId)`  | `BufferGeometry[]` (Three.js)            |
| `model.createScene(objectId, options?)` | `{ scene, nodes, materials }` (Three.js) |

**Export:**

| Method                                                        | Returns      |
| ------------------------------------------------------------- | ------------ |
| `api.common.save({ format: 'OFB'\|'STP'\|'STL', encoding? })` | File content |

### Finding 3: WASM Runtime Constraint

`WASMClient` uses Comlink + browser `Worker` API. Node.js invocation:

```
init(id => new WASMClient(id, { classcadKey: '...' })) // succeeds
new BuerliCadFacade().connect()                         // throws: Worker is not defined
```

The `@buerli.io/classcad` module itself **loads successfully** in Node.js (all exports available), only the WASM connection fails. This means:

- Module registration and bundler integration **can** be tested
- Actual ClassCAD geometry creation **cannot** be tested in Vitest
- The kernel's `convertBuerliOutputToGlb` conversion logic **can** be tested with synthetic data matching the real output shape

### Finding 4: Geometry Pipeline Architecture

The buerli kernel operates as:

```
User code (imports @buerli.io/classcad)
  → esbuild bundler (resolves built-in module shim)
  → runtime.execute (runs bundled code)
  → main() returns geometry data
  → convertBuerliOutputToGlb (Three.js BufferGeometry → GLB)
  → GLB output
```

The conversion handles three output shapes:

1. **Raw ArrayBuffer/Uint8Array** — passthrough as GLB
2. **Three.js `toJSON()` objects** — extract position arrays from `geometries[].data.attributes.position.array`
3. **Position/index array objects** — `[{ position: Float32Array, index?: Uint32Array }]`

### Finding 5: Comparison with Replicad Test Strategy

| Aspect              | Replicad                                                   | Buerli                                        |
| ------------------- | ---------------------------------------------------------- | --------------------------------------------- |
| WASM in Node.js     | Works (OCCT WASM is Node-compatible)                       | Fails (requires browser Worker)               |
| Real geometry tests | Real replicad calls → real GLB → gltf-transform validation | Not possible in Vitest                        |
| Module registration | `registerReplicadModule` tested via bundler                | `registerBuerliModules` tested via bundler    |
| `createTestWorker`  | Full pipeline works end-to-end                             | Pipeline works up to `main()` execution       |
| Error handling      | Tests real OCCT errors                                     | Tests bundler/execute errors + runtime errors |

## Recommendations

| #   | Action                                                             | Priority | Rationale                                                        |
| --- | ------------------------------------------------------------------ | -------- | ---------------------------------------------------------------- |
| R1  | Test full bundler pipeline with real `@buerli.io/classcad` imports | P0       | Validates module registration, import resolution, bundling       |
| R2  | Test geometry conversion with realistic Three.js-shaped data       | P0       | Validates `convertBuerliOutputToGlb` with production-like shapes |
| R3  | Test parametric user code with real parameter flow                 | P0       | Validates `getParameters` + `createGeometry` parameter pipeline  |
| R4  | Test error handling (syntax, runtime, empty geometry)              | P0       | Validates structured error reporting                             |
| R5  | Test multi-file projects with local imports                        | P1       | Validates bundler dependency resolution                          |
| R6  | Test user code that exercises ClassCAD API patterns structurally   | P1       | Validates that real-world code bundles and executes correctly    |
| R7  | Document browser-only WASM constraint in kernel JSDoc              | P2       | Developer awareness                                              |

## Test Strategy

Since ClassCAD WASM cannot run in Node.js, the tests exercise the kernel via `createTestWorker` with the real esbuild bundler. User code imports from `@buerli.io/classcad` (resolved via the kernel's built-in module shim), and `main()` functions return geometry in the formats the kernel handles. This validates:

1. **Module registration** — `@buerli.io/classcad` resolves as a built-in
2. **Bundler pipeline** — esbuild bundles user code with buerli imports
3. **Parameter extraction** — `defaultParams` → JSON schema
4. **Geometry conversion** — Three.js-like structures → valid GLB
5. **Error handling** — syntax errors, runtime errors, empty geometry
6. **Export pipeline** — GLB export from converted geometry

Test categories follow the buerli API paradigms:

- **Solid API patterns** — box, cylinder, subtraction, union, extrusion, mirror, fillet
- **Part API patterns** — create, cylinder, fillet, chamfer, boolean, extrusion, sketch
- **Multi-shape scenes** — multiple geometries, multi-mesh output
- **Parametric models** — configurable dimensions, expression-driven
- **Error scenarios** — invalid code, missing returns, type errors

## References

- Source: `repos/buerli-examples/` (56 example files)
- Source: `repos/buerligons/` (production app)
- Docs: [buerli.io/docs](https://buerli.io/docs)
- npm: `@buerli.io/classcad@1.0.1`
- Related: `packages/runtime/src/kernels/replicad/replicad.kernel.test.ts` (gold standard test)
