---
title: 'WASM C++ RBV Prior Art Survey'
description: 'Survey of how seven sizable C++→WASM libraries (CanvasKit, OpenCV.js, Manifold, rhino3dm, Draco, ammo.js, Box2D, assimpjs, occt-import-js) handle reference-output parameters'
status: active
created: '2026-05-12'
updated: '2026-05-12'
category: comparison
related:
  - docs/research/replicad-class-rbv-migration-surface.md
  - docs/research/embind-return-strategy-benchmarks.md
  - docs/research/occt-unbound-symbols-audit.md
---

# WASM C++ RBV Prior Art Survey

How seven production-grade C++→WASM libraries handle reference-output parameters in their JavaScript bindings, and what their choices imply for OCJS's class-type Return-by-Value (RBV) migration.

## Executive Summary

We surveyed nine WASM C++ libraries (seven binding generators) ranging from ~250 LOC of bindings (occt-import-js) to ~6,400 LOC (Skia CanvasKit). The dataset spans three bindgen families: hand-written Embind (CanvasKit, Manifold, rhino3dm, occt-import-js, assimpjs), Python-driven Embind codegen (OpenCV.js), and Emscripten's WebIDL Binder (Draco, ammo.js, Box2D-WASM).

Three findings dominate:

1. **The `{ current: value }` proxy-mutation pattern is not used anywhere outside legacy OCJS.** Every surveyed library represents output parameters via one of four canonical patterns — none of them resembles OCJS's historical class-type output convention.
2. **In/out parameters are universally caller-allocated.** When a C++ method reads and writes the same parameter (`gp_Trsf::Transforms`, `cv::InputOutputArray`, `b2World::SetGravity`/`GetGravity`), every surveyed library forces the JS caller to construct the value first and pass it in — there is no idiom that default-constructs input data inside the binding.
3. **Two-tier bindgen + adapter wrappers is universal at scale.** OpenCV.js, CanvasKit, and rhino3dm all combine an automatable bulk path with a curated set of hand-written adapter functions for awkward signatures. The "manual adapters" layer is treated as a first-class, named module — not a special-case escape hatch.

These findings imply that OCJS's R2 plan should drop the proposed `keep_proxy_mutation` allowlist (which preserves the unique-in-the-world `{ current }` pattern), replace it with a named "manual binding" lane modelled on OpenCV's `binding_utils` namespace, and adopt CanvasKit-style caller-allocated inputs for genuine in/out methods like `gp_Trsf::Transforms` and the `BndLib::Add` accumulator family.

## Table of Contents

- [Scope and Methodology](#scope-and-methodology)
- [Library Inventory](#library-inventory)
- [Findings](#findings)
  - [Finding 1: Five canonical output-param patterns](#finding-1-five-canonical-output-parameter-patterns)
  - [Finding 2: The `{ current }` proxy-mutation pattern is OCJS-unique](#finding-2-the--current--proxy-mutation-pattern-is-ocjs-unique)
  - [Finding 3: In/out parameters are always caller-allocated](#finding-3-inout-parameters-are-always-caller-allocated)
  - [Finding 4: Two-tier bindgen with a named adapter layer is universal](#finding-4-two-tier-bindgen-with-a-named-adapter-layer-is-universal)
  - [Finding 5: WebIDL Binder vs Embind for output parameters](#finding-5-webidl-binder-vs-embind-for-output-parameters)
  - [Finding 6: Resource cleanup is the secondary axis](#finding-6-resource-cleanup-is-the-secondary-axis)
  - [Finding 7: Coverage is always curated, never exhaustive](#finding-7-coverage-is-always-curated-never-exhaustive)
- [Pattern Catalogue](#pattern-catalogue)
- [Recommendations for OCJS](#recommendations-for-ocjs)
- [Code Examples by Library](#code-examples-by-library)
- [References](#references)
- [Appendix: Survey Matrix](#appendix-survey-matrix)

## Scope and Methodology

**In scope.** How each surveyed library exposes C++ functions whose signatures take parameters by non-const reference (`T&`) — including pure-output (write-only), in/out (read+write), and accumulator patterns — to JavaScript. Bindgen authoring model, generated/hand-written split, and resource-cleanup conventions are recorded as secondary axes.

**Out of scope.** Performance benchmarks (covered in `embind-return-strategy-benchmarks.md`), TypeScript declaration shape, build-system mechanics, language-specific safety hazards (UB, ABI mismatches), and any binding work specific to JavaScript engines.

**Methodology.** Each repository was added to `repos.yaml`, cloned into `repos/` (sparse-cloned for monorepos like Skia and OpenCV), and analysed in parallel via independent subagents. Each subagent was tasked with cataloguing (1) the bindgen approach, (2) the top output-parameter patterns with file:line citations, (3) 3–5 concrete C++→JS examples, (4) cleanup mechanism, (5) coverage philosophy. The subagents had no shared context; convergence on patterns across independent analyses strengthens confidence in the findings.

## Library Inventory

| Library            | Domain                | Bindgen                                       | Binding LOC                                           | Repo path                                      |
| ------------------ | --------------------- | --------------------------------------------- | ----------------------------------------------------- | ---------------------------------------------- |
| **Skia CanvasKit** | 2D graphics           | Hand-written Embind + JS interface layer      | ~6,400 C++ + ~1,500 JS                                | `repos/skia/modules/canvaskit/`                |
| **OpenCV.js**      | Computer vision       | Python codegen → Embind                       | 1,077 LOC `embindgen.py` + manual `core_bindings.cpp` | `repos/opencv/modules/js/`                     |
| **Manifold**       | CSG geometry          | Hand-written Embind + JS shim                 | ~700 LOC `bindings.cpp` + ~400 LOC helpers            | `repos/manifold/bindings/wasm/`                |
| **rhino3dm**       | OpenNURBS geometry    | Hand-written Embind (dual-target with Python) | ~146 files in `src/bindings/`                         | `repos/rhino3dm/src/bindings/`                 |
| **ammo.js**        | Bullet physics        | WebIDL Binder                                 | 1,282 LOC `ammo.idl`                                  | `repos/ammo.js/`                               |
| **Box2D-WASM**     | 2D physics            | WebIDL Binder                                 | ~1,000 LOC `Box2D.idl`                                | `repos/box2d-wasm/box2d-wasm/`                 |
| **Draco**          | 3D mesh compression   | WebIDL Binder                                 | ~250 LOC `draco_web_decoder.idl`                      | `repos/draco/src/draco/javascript/emscripten/` |
| **assimpjs**       | 3D model import       | Hand-written Embind                           | ~330 LOC `assimpjs.cpp`                               | `repos/assimpjs/assimpjs/src/`                 |
| **occt-import-js** | OCCT STEP/IGES import | Hand-written Embind                           | 263 LOC `js-interface.cpp`                            | `repos/occt-import-js/occt-import-js/src/`     |

## Findings

### Finding 1: Five canonical output-parameter patterns

Across all nine libraries, every reference-output parameter is handled by exactly one of five patterns. No library invents its own outside this set.

| #      | Pattern                                                      | How JS sees the result                                                                                    | Used by                                                                                                                                        |
| ------ | ------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| **P1** | **Resolve in C++, never expose**                             | C++ method's reference output is consumed by the wrapper and the wrapper returns a value-typed POJO/array | assimpjs, occt-import-js, rhino3dm (`Trim`), CanvasKit (`getMetrics`)                                                                          |
| **P2** | **`value_object` / `value_array` return**                    | Single function returns `{ field1, field2 }` or `[a, b]` — caller pre-allocates nothing                   | rhino3dm (most output-param methods via `BND_TUPLE`), OpenCV.js (`minMaxLoc`), Manifold (`Merge` via `val::object`), CanvasKit (small structs) |
| **P3** | **Caller-allocated wrapper (passed by reference)**           | JS calls `new Module.Foo()`, passes it to method, then reads back fields                                  | ammo.js (`[Ref] btVector3`), Box2D-WASM, Draco (`DracoFloat32Array out_values`), OpenCV.js (`cv::Mat&` from `InputOutputArray`)                |
| **P4** | **Caller-allocated WASM-heap pointer + `optional_override`** | JS allocates raw heap buffer (via `Module.Malloc`), passes `uintptr_t`, C++ writes via `reinterpret_cast` | CanvasKit (matrices, `SkPoint`, `SkRect`, `getPosTan`)                                                                                         |
| **P5** | **JS-object mutation via `emscripten::val`**                 | C++ wrapper receives a plain JS object and calls `val.set("x", …)`                                        | OpenCV.js (`floodFill` rect-out)                                                                                                               |

The legacy OCJS pattern — proxy mutation through a `{ current: value }` JavaScript object that the C++ binding reads and writes — was not observed in any of the nine libraries.

### Finding 2: The `{ current }` proxy-mutation pattern is OCJS-unique

Repository-wide searches across all nine binding codebases for indicators of the `{ current }` pattern (`val.set("current"`, `["current"]`, etc.) returned zero matches. The pattern is not used by:

- Any of the hand-written Embind libraries (CanvasKit, Manifold, rhino3dm, occt-import-js, assimpjs).
- The Python codegen library (OpenCV.js) — its `embindgen.py` never emits such a wrapper.
- The WebIDL Binder libraries (Draco, ammo.js, Box2D-WASM) — `[Ref]` semantically resembles the pattern (caller-allocated, mutated in place) but the JS object is a real `Module.btVector3` wrapper class with named methods (`.x()`, `.y()`, `.z()`), not a proxy object with a single `current` field.

OCJS's historical pattern appears to be a local convention with no peer prior art. This is consistent with the migration direction already adopted for primitives/enums/handles in `embind-return-strategy-benchmarks.md` (which recommended `value_object` return-by-value): the survey confirms `value_object` matches industry consensus and the proxy pattern is the outlier.

### Finding 3: In/out parameters are always caller-allocated

The most architecturally important finding. Every surveyed library that exposes a C++ method whose parameter is read as input _and_ written as output (a true in/out parameter — `cv::Mat&` with `/IO` semantics, ammo.js `[Ref]` with prior values intended to matter, CanvasKit's caller-supplied buffers) uses the **caller-allocated** model.

| Library                | In/out example                                                                                 | Caller responsibility                                                                    |
| ---------------------- | ---------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------- |
| **OpenCV.js**          | `cv.GaussianBlur(src, dst, …)` where `dst` is `InputOutputArray`                               | `new cv.Mat()` first; OpenCV reads existing size/type metadata and reallocates if needed |
| **ammo.js**            | `btCollisionWorld::rayTest(from, to, [Ref] callback)` — callback object carries prior hit data | `new Ammo.ClosestRayResultCallback(from, to)` constructs with explicit ray endpoints     |
| **Box2D-WASM**         | `b2World.SetGravity([Ref] b2Vec2 gravity)` — caller's vector copied in                         | `new Module.b2Vec2(x, y)`                                                                |
| **CanvasKit**          | `Canvas._concat(matrixPtr)` — read CTM, multiply                                               | JS caller writes into `_scratch4x4MatrixPtr` before call                                 |
| **OpenCV.js (manual)** | `CamShiftWrapper(arg1, arg2, arg3)` where `arg2` is `Rect&` track-window                       | `new cv.Rect(x, y, w, h)` — `CamShift` reads the prior window and refines                |

None of these libraries default-construct the input value inside the binding wrapper. The caller is always responsible for supplying the input state. This is the universal idiom.

**Implication for OCJS.** The class-RBV migration plan's currently-proposed `keep_proxy_mutation` allowlist (for `gp_Trsf::Transforms`, `BndLib::Add`, etc.) preserves the OCJS-unique `{ current }` pattern _specifically for in/out methods_ and inherits the existing primitive RBV bug for those methods. Replacing it with caller-allocated inputs matches every surveyed peer.

### Finding 4: Two-tier bindgen with a named adapter layer is universal

Every library that exposes more than a trivial surface area uses a two-tier model: an automatable bulk path for "regular" methods, plus a named hand-written adapter layer for methods that resist mechanical translation. The adapter layer is treated as a first-class part of the codebase — given a namespace, a dedicated file, and an explicit ignore-list mechanism to redirect codegen.

| Library            | Bulk tier                                                  | Adapter tier                                                                                                    | Selection mechanism                                                                                               |
| ------------------ | ---------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------- |
| **OpenCV.js**      | `embindgen.py` auto-generated `Wrappers::*_wrapper` thunks | `namespace binding_utils { … }` in `core_bindings.cpp` (700+ LOC)                                               | `ignore_list = ['locate', 'minEnclosingCircle', 'minMaxLoc', 'floodFill', 'CamShift', …]` in `embindgen.py:83-95` |
| **CanvasKit**      | Direct `.function(&Class::Method)` registrations           | `optional_override([](self, args…) { … })` lambdas, plus `interface.js` ergonomic wrappers                      | Per-method, by hand                                                                                               |
| **rhino3dm**       | `.function("name", &BND_Curve::Name)` registrations        | `BND_TUPLE BND_Curve::FrameAt(double t) { ON_Plane plane; success = m_curve->FrameAt(t, plane); … return rc; }` | Per-method, by hand                                                                                               |
| **Manifold**       | Direct registrations of public C++ API                     | `namespace js { … }` and `namespace man_js { … }` in `helpers.cpp`                                              | Per-method, by hand                                                                                               |
| **occt-import-js** | (No bulk tier — entire surface is adapter)                 | `ReadStepFile`, `ReadIgesFile` hand-written                                                                     | All-manual                                                                                                        |
| **OCJS (today)**   | `bindings.py` codegen + `additionalBindCode` YAML override | YAML override is the _only_ manual lane                                                                         | Inline string-soup in `full.yml`                                                                                  |

OCJS's existing `additionalBindCode` is an unstructured string-injection mechanism, not a first-class adapter namespace. The peer libraries (especially OpenCV.js, which has the closest bindgen architecture) demonstrate that promoting "manual binding" from an escape hatch to a named, idiomatic C++ module pays off as the binding surface grows.

### Finding 5: WebIDL Binder vs Embind for output parameters

Three of the surveyed libraries (Draco, ammo.js, Box2D-WASM) use Emscripten's **WebIDL Binder** rather than Embind. WebIDL Binder is the older Emscripten binding generator; it consumes a `.idl` file and emits glue C++ + JS. Its `[Ref]` / `[Value]` annotation vocabulary is materially easier to reason about for output parameters than Embind's hand-rolled equivalents — but at the cost of flexibility.

| Annotation               | Semantics                                                                               | Embind equivalent                                                                                           |
| ------------------------ | --------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------- |
| **`[Ref] T arg`**        | Caller passes wrapped `Module.T` instance; C++ binding sees `T&`; mutations propagate   | Hand-written `optional_override` with explicit pointer cast, or `cv::Mat&`-style direct reference parameter |
| **`[Const, Ref] T arg`** | Read-only reference                                                                     | Direct `const T&` parameter                                                                                 |
| **`[Value] T method()`** | Method returns `T` by value (copy semantics)                                            | `value_object`, or method returning `T` if `T` has a registered Embind class                                |
| **`[Ref] T method()`**   | Method returns reference to interior storage; JS receives wrapper aliasing that storage | Requires hand-written `allow_raw_pointers()` + careful lifetime documentation                               |

The WebIDL Binder's value is that **`[Ref]` is the only output-parameter mechanism**: every output is caller-allocated, every read-only input is `[Const, Ref]`, every value return is `[Value]`. There is no `{ current }` pattern and no `value_object` ambiguity. The cost is that templates require typedef workarounds (`ammo.h:15-22` typedefs `btAlignedObjectArray<btVector3>` because "Web IDL doesn't seem to support C++ templates"), and any custom mapping requires extending `webidl_binder.py` itself.

This is informative even for OCJS (which is Embind-based): the WebIDL Binder's structural distinction between `[Ref]` (caller-allocated, in/out) and `[Value]` (by-copy return) is exactly the structural distinction OCJS needs to express in its own bindgen — currently OCJS's `isOutputParam` / `shouldStripParam` collapse both cases into "pure output, default-constructed".

### Finding 6: Resource cleanup is the secondary axis

The output-parameter mechanism is closely entangled with how the resulting JavaScript value gets cleaned up:

| Library                       | Cleanup approach for outputs                                                                                                                                                                                                 |
| ----------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **CanvasKit**                 | `value_object` returns: no cleanup needed (explicit comment in `canvaskit_bindings.cpp:3223-3225`). `sk_sp<>` returns: `.delete()`. Scratch heap buffers: allocated once via `CanvasKit.Malloc` at module init, never freed. |
| **OpenCV.js**                 | `value_object` returns: no cleanup. `cv::Mat&` outputs: caller must `mat.delete()` (matches Python's manual `Mat` lifetime).                                                                                                 |
| **Manifold**                  | `value_object` returns: no cleanup. `Vector_*` outputs: explicit `.delete()` in `bindings.js`. Optional `garbage-collector.ts` registry for batch cleanup.                                                                   |
| **rhino3dm**                  | Tuples and `value_array` returns: no cleanup. Raw-pointer returns (e.g. `BND_Curve::Trim` → new `BND_Curve*`): caller must `.delete()`.                                                                                      |
| **WebIDL libraries**          | `Ammo.destroy(obj)` / `Module.destroy(obj)` is the canonical destructor; `[Value]` returns are auto-cleaned by GC; `[Ref]` returns alias parent storage (no cleanup).                                                        |
| **assimpjs / occt-import-js** | Pure-value `emscripten::val` POJO returns: no cleanup. No persistent wrapper objects exposed.                                                                                                                                |

The cross-library consensus: `value_object`-style returns require no cleanup, raw `class_<>` handle returns require explicit `.delete()`. There is no in-between. This validates the OCJS plan's idea of synthesising `[Symbol.dispose]()` on the _container_ only when the container holds an embind handle (e.g. `BRepLProp_CLProps` returning a `Handle<Geom_Curve>` field) — and skipping `Symbol.dispose` entirely on POD-only containers (`gp_Pnt`, `gp_Vec`).

### Finding 7: Coverage is always curated, never exhaustive

No surveyed library mechanically exposes every C++ method. Coverage is always intentional:

- **occt-import-js** binds _four_ free functions — `ReadFile`, `ReadStepFile`, `ReadIgesFile`, `ReadBrepFile` — across the entire OCCT codebase. OpenCASCADE types never cross the JS boundary; everything is collapsed into a JSON-like result tree.
- **assimpjs** binds _four_ free functions (`ConvertFile`/`ConvertFileList` overloads) and three classes (`File`, `FileList`, `Result`). All of Assimp's per-format importers and exporters are linked into the WASM but not bound.
- **rhino3dm** explicitly describes itself as a "subset of RhinoCommon"; many methods are commented out in `.cpp` files with `// TODO` markers (`bnd_polyline.h:66-67`).
- **OpenCV.js** uses a whitelist JSON to control export surface; `embindgen.py` has both a whitelist _and_ an `ignore_list`.
- **CanvasKit** binds Canvas/Path/Paint/Shader/Font/Skottie selectively; many `_`-prefixed raw entry points are completed with ergonomic wrappers in `interface.js` before reaching consumers.
- **OCJS (today)** is the _most_ aggressive: it attempts to bind nearly every public OCCT class and method via codegen. This is a deliberate architectural commitment — OCJS exists specifically to give JS callers full OCCT access — but it amplifies the output-parameter problem because awkward signatures are everywhere.

The implication is that "do not bind this method at all" is a legitimate option that OCJS underuses. For methods like the existing primitive in/out `gp_Trsf::Transforms(double&, double&, double&)` overload (currently miscompiled because the bindgen treats it as pure-output), one valid solution is `bindgen-filters.yaml` exclusion + a hand-written replacement that takes the input by value and returns the result.

## Pattern Catalogue

### P1: Resolve in C++, never expose

**When to use.** The C++ method is structurally awkward (multiple outputs, hierarchy of refs, dependent lifetimes) but the _information_ it produces fits cleanly into a value-typed return.

**Embind shape.**

```cpp
emscripten::val BoundsResult(const Shape& shape) {
  Bnd_Box box;
  BRepBndLib::Add(shape, box);
  Standard_Real xMin, yMin, zMin, xMax, yMax, zMax;
  box.Get(xMin, yMin, zMin, xMax, yMax, zMax);
  emscripten::val out = emscripten::val::object();
  out.set("min", emscripten::val::array(std::vector<double>{xMin, yMin, zMin}));
  out.set("max", emscripten::val::array(std::vector<double>{xMax, yMax, zMax}));
  return out;
}
```

**JS shape.** `const { min, max } = bounds(shape);`

**Cost.** Bindgen cannot mechanically generate this. Requires hand-authoring per method.

### P2: `value_object` / `value_array` return

**When to use.** The C++ method has 1–N pure-output reference parameters of fixed type, no in/out semantics, no lifetime entanglement.

**Embind shape (the canonical Emscripten idiom — see `embind.rst:339-342`):**

```cpp
struct CurveD2Result {
  gp_Pnt theP;
  gp_Vec theV1;
  gp_Vec theV2;
};

value_object<CurveD2Result>("CurveD2Result")
  .field("theP", &CurveD2Result::theP)
  .field("theV1", &CurveD2Result::theV1)
  .field("theV2", &CurveD2Result::theV2);

class_<Geom_Curve>("Geom_Curve")
  .function("D2", optional_override([](const Geom_Curve& self, double U) {
    CurveD2Result r;
    self.D2(U, r.theP, r.theV1, r.theV2);
    return r;
  }));
```

**JS shape.**

```js
const { theP, theV1, theV2 } = curve.D2(0.5);
```

**Cost.** Bindgen-emittable when output param types are known to the registry. For class-typed fields, the field types must themselves have Embind registrations or be `value_object`s.

### P3: Caller-allocated wrapper (passed by reference)

**When to use.** The C++ method is in/out (reads input, writes output), or the same target object is updated repeatedly (e.g. ray-test results, accumulators).

**Embind shape.**

```cpp
class_<gp_Trsf>("gp_Trsf")
  .function("Transforms", optional_override([](const gp_Trsf& self, gp_XYZ& coord) {
    self.Transforms(coord);  // reads X/Y/Z, writes back
  }));
```

**WebIDL Binder shape.**

```webidl
void Transforms([Ref] gp_XYZ coord);
```

**JS shape.**

```js
const coord = new Module.gp_XYZ(1, 2, 3);
trsf.Transforms(coord); // mutates coord in place
const x = coord.X();
```

**Cost.** Requires the input type to be a registered Embind class (not a `value_object` — value_objects pass by value/copy, so mutations would not propagate).

### P4: Caller-allocated WASM-heap pointer + `optional_override`

**When to use.** The output is a dense numerical struct (matrix, point, rect) that is more efficient to keep as raw bytes on the WASM heap and read/write via `HEAPF32`-style typed-array views.

**Embind shape.**

```cpp
.function("_getTotalMatrix",
  optional_override([](const SkCanvas& self, WASMPointerU8 mPtr) {
    float* nineMatrixValues = reinterpret_cast<float*>(mPtr);
    if (!nineMatrixValues) return;
    SkMatrix m = self.getTotalMatrix();
    m.get9(nineMatrixValues);
  }))
```

**JS shape.** Caller pre-allocates a scratch buffer once (`CanvasKit.Malloc(Float32Array, 9)`), reads `HEAPF32` after the call.

**Cost.** Highest authoring complexity, lowest per-call overhead. Justified only for hot-path numerical APIs. Almost certainly not needed in OCJS where per-call cost is dominated by OCCT itself.

### P5: JS-object mutation via `emscripten::val`

**When to use.** A single optional reference output; caller already has a JS object to update.

**Embind shape.**

```cpp
int floodFill_withRect_helper(cv::Mat& arg1, cv::Mat& arg2, Point arg3,
                              Scalar arg4, emscripten::val arg5, …) {
  cv::Rect rect;
  int rc = cv::floodFill(arg1, arg2, arg3, arg4, &rect, …);
  arg5.set("x", emscripten::val(rect.x));
  arg5.set("y", emscripten::val(rect.y));
  arg5.set("width", emscripten::val(rect.width));
  arg5.set("height", emscripten::val(rect.height));
  return rc;
}
```

**JS shape.**

```js
const rectOut = { x: 0, y: 0, width: 0, height: 0 };
const rc = cv.floodFill(image, mask, seed, color, rectOut);
```

**Cost.** Ergonomic ceiling: only practical for one or two fields. Beyond that, P2 (`value_object`) reads more cleanly.

## Recommendations for OCJS

These recommendations refine the open class-RBV plan (`/Users/rifont/.cursor/plans/r1_lprops_template_alias_fix_50ca8b09.plan.md`) and the migration surface document (`docs/research/replicad-class-rbv-migration-surface.md`).

| #      | Action                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      | Priority | Effort | Impact |
| ------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------- | ------ | ------ |
| **R1** | **Adopt P2 (`value_object` return) as the default for pure-output ref parameters of class types.** Already proposed; the survey confirms this matches CanvasKit, rhino3dm, OpenCV.js (for aggregates), and Manifold.                                                                                                                                                                                                                                                                                                                                                                                                        | P0       | Medium | High   |
| **R2** | **Replace the proposed `keep_proxy_mutation` allowlist with P3 (caller-allocated wrapper).** For `gp_Trsf::Transforms`, `gp_GTrsf::Transforms`, `BndLib::Add`, `BndLib_Add2dCurve::Add`, `BndLib_AddSurface::Add`, `BRepBndLib::Add`: the bindgen should emit `optional_override` lambdas that take the in/out parameter as a registered class reference (mutated in place), not as a `{ current }` proxy. This eliminates the legacy pattern from the codebase entirely.                                                                                                                                                   | P0       | Medium | High   |
| **R3** | **Fix the existing primitive in/out bug for `gp_Trsf::Transforms(double&, double&, double&)`.** The current `_emitOutputParamBinding` unconditionally default-constructs primitive outputs, silently producing zero-input transforms. The fix is either (a) exclude the overload via `bindgen-filters.yaml` and hand-write a P3 wrapper that takes the coordinates as a value-typed input (e.g. `gp_XYZ` or a tuple of three doubles), or (b) detect the in/out pattern via Doxygen `@param[in,out]` and use a value-typed input. Option (a) is consistent with industry practice; option (b) requires no manual exclusion. | P0       | Low    | High   |
| **R4** | **Promote `additionalBindCode` to a first-class adapter namespace.** OCJS's current `additionalBindCode` YAML field is unstructured string injection. Carve out a `bindings/manual/` directory containing `.cpp` files in a `namespace ocjs_manual { … }` (mirror of OpenCV's `namespace binding_utils`), with explicit `bindgen-filters.yaml` ignore-list entries pointing at it. This pays compounding dividends as OCCT V8 adds more awkward signatures.                                                                                                                                                                 | P1       | Medium | Medium |
| **R5** | **Surface in/out vs pure-output distinction in the bindgen.** Add a structural flag (analogous to OpenCV's `/IO` vs `/O`) to OCJS's `ArgInfo`-equivalent so the codegen can pick between P2 (pure-output, RBV return) and P3 (in/out, caller-allocated reference). Source the flag from Doxygen `@param[out]` / `@param[in,out]` tags where available; fall back to "treat as pure-output" when ambiguous, with the manual ignore-list as the escape hatch.                                                                                                                                                                 | P1       | Medium | Medium |
| **R6** | **Synthesise `[Symbol.dispose]()` on `value_object` containers only when the container holds Embind handles.** For `gp_Pnt`/`gp_Vec` POD-only containers, no dispose method (matches CanvasKit's documented comment that `value_object` returns need no cleanup). For containers with `Handle<T>` fields, emit a `[Symbol.dispose]` that walks the fields and calls `.delete()`. The bindgen already knows the field types via the existing RBV path.                                                                                                                                                                       | P2       | Low    | Medium |
| **R7** | **Document the OCJS bindgen output-param decision tree in `BREAKING_CHANGES.md` Section B2.** The decision tree is: pure-output of registered class → P2; pure-output of primitive → P2 (existing primitive RBV); in/out of any type → P3; multi-output with mixed semantics → manual `binding_utils` (P1/P5).                                                                                                                                                                                                                                                                                                              | P2       | Low    | Medium |
| **R8** | **Do not adopt WebIDL Binder.** It is structurally appealing for output parameters but Embind already dominates new C++→WASM work post-2022; the migration cost is large and OCJS's Python codegen already implements many features WebIDL Binder cannot (templates, smart pointers, custom dispatch). The lesson from WebIDL Binder is the _structural distinction_ between `[Ref]` and `[Value]`, not the syntax.                                                                                                                                                                                                         | P3       | —      | —      |

## Code Examples by Library

### Skia CanvasKit — caller-allocated heap pointer + `optional_override`

```cpp
// repos/skia/modules/canvaskit/canvaskit_bindings.cpp:1678-1687
.function("_getTotalMatrix",
  optional_override([](const SkCanvas& self, WASMPointerU8 mPtr) {
    float* nineMatrixValues = reinterpret_cast<float*>(mPtr);
    if (!nineMatrixValues) return;
    SkMatrix m = self.getTotalMatrix();
    m.get9(nineMatrixValues);
  }))
```

```js
// repos/skia/modules/canvaskit/interface.js:804-814
CanvasKit.Canvas.prototype.getTotalMatrix = function () {
  this._getTotalMatrix(_scratch3x3MatrixPtr);
  var rv = new Array(9);
  for (var i = 0; i < 9; i++) {
    rv[i] = CanvasKit.HEAPF32[_scratch3x3MatrixPtr / 4 + i];
  }
  return rv;
};
```

### OpenCV.js — Python codegen + hand-written `binding_utils`

```python
# repos/opencv/modules/js/generator/embindgen.py:83-91
ignore_list = ['locate',  #int&
               'minEnclosingCircle',  #float&
               'checkRange',
               'minMaxLoc',   #double*
               'floodFill', # special case, implemented in core_bindings.cpp
```

```cpp
// repos/opencv/modules/js/src/core_bindings.cpp:293-314
class MinMaxLoc {
public:
  double minVal;
  double maxVal;
  Point minLoc;
  Point maxLoc;
};

MinMaxLoc minMaxLoc(const cv::Mat& src, const cv::Mat& mask) {
  MinMaxLoc result;
  cv::minMaxLoc(src, &result.minVal, &result.maxVal,
                &result.minLoc, &result.maxLoc, mask);
  return result;
}

// Registration:
emscripten::value_object<binding_utils::MinMaxLoc>("MinMaxLoc")
  .field("minVal", &binding_utils::MinMaxLoc::minVal)
  .field("maxVal", &binding_utils::MinMaxLoc::maxVal)
  .field("minLoc", &binding_utils::MinMaxLoc::minLoc)
  .field("maxLoc", &binding_utils::MinMaxLoc::maxLoc);
```

```js
// JS usage
const { minVal, maxVal, minLoc, maxLoc } = cv.minMaxLoc(src, mask);
```

### rhino3dm — `BND_TUPLE` (= `emscripten::val` array) for output bundles

```cpp
// repos/rhino3dm/src/bindings/bnd_curve.cpp:158-169
BND_TUPLE BND_Curve::FrameAt(double t) const {
  ON_Plane plane;
  bool success = m_curve->FrameAt(t, plane);
  BND_TUPLE rc = CreateTuple(2);
  SetTuple(rc, 0, success);
  SetTuple(rc, 1, BND_Plane::FromOnPlane(plane));
  return rc;
}
```

```ts
// rhino3dm.d.ts (paraphrased)
frameAt(t: number): [boolean, Plane];
```

### ammo.js — WebIDL Binder `[Ref]` for output, `[Value]` for return

```webidl
# repos/ammo.js/ammo.idl:99-100
[Ref] btVector3 getOrigin();      # reference to interior storage
[Value] btQuaternion getRotation(); # by-value copy
```

```webidl
# repos/ammo.js/ammo.idl:275
void calculateLocalInertia(float mass, [Ref] btVector3 inertia);
```

```js
// repos/ammo.js/examples/hello_world.js:22-25
const localInertia = new Ammo.btVector3(0, 0, 0);
shape.calculateLocalInertia(mass, localInertia);
// localInertia now contains the result; read via .x()/.y()/.z()
```

### Manifold — `emscripten::val` envelope, no proxy mutation

```cpp
// repos/manifold/bindings/wasm/helpers.cpp:95-101
val Merge(const val& mesh) {
  val out = val::object();
  MeshGL meshGL = MeshJS2GL(mesh);
  bool changed = meshGL.Merge();
  out.set("changed", changed);
  out.set("mesh", changed ? MeshGL2JS(meshGL) : mesh);
  return out;
}
```

```js
// repos/manifold/bindings/wasm/bindings.js:400-404
merge() {
  const {changed, mesh} = Module._Merge(this);
  Object.assign(this, {...mesh});
  return changed;
}
```

### Draco — WebIDL Binder typed-array output sink

```webidl
# repos/draco/src/draco/javascript/emscripten/draco_web_decoder.idl:238-240
boolean GetAttributeFloatForAllPoints([Ref, Const] PointCloud pc,
                                      [Ref, Const] PointAttribute pa,
                                      DracoFloat32Array out_values);
```

```js
const out = new draco.DracoFloat32Array();
decoder.GetAttributeFloatForAllPoints(pc, pa, out);
for (let i = 0; i < out.size(); i++) {
  const v = out.GetValue(i);
}
```

## References

- Emscripten Embind docs: `repos/emscripten/site/source/docs/porting/connecting_cpp_and_javascript/embind.rst:306-355` — canonical `value_object` and `value_array` example.
- Emscripten WebIDL Binder docs: <https://emscripten.org/docs/porting/connecting_cpp_and_javascript/WebIDL-Binder.html>
- Related research: `docs/research/embind-return-strategy-benchmarks.md` — performance comparison of `value_object` vs `value_array` vs `emscripten::val` for OCJS smart pointer outputs.
- Related research: `docs/research/replicad-class-rbv-migration-surface.md` — replicad-side impact analysis of the class-RBV migration.
- Related research: `docs/research/occt-unbound-symbols-audit.md` — OCJS unbound-symbols inventory; R1 (template alias fix) and the broader recommendations.
- Plan: `/Users/rifont/.cursor/plans/r1_lprops_template_alias_fix_50ca8b09.plan.md` — current R1 plan (this survey's recommendations should be folded into R2 / R3 sequencing).

## Appendix: Survey Matrix

Cross-tabulation of all nine libraries by pattern usage. A `●` means the pattern is the library's _primary_ idiom; `◐` means used as a secondary tool; blank means not observed.

| Library                | P1: resolve in C++ |  P2: `value_object` return   | P3: caller-allocated wrapper | P4: heap pointer |   P5: `val.set`   | `{current}` proxy |
| ---------------------- | :----------------: | :--------------------------: | :--------------------------: | :--------------: | :---------------: | :---------------: |
| Skia CanvasKit         |         ◐          |              ◐               |              ◐               |        ●         |                   |                   |
| OpenCV.js              |                    |        ● (aggregates)        |           ● (Mat&)           |                  |   ◐ (floodFill)   |                   |
| Manifold               |                    |              ◐               |                              |  ◐ (heap views)  | ● (`val::object`) |                   |
| rhino3dm               |         ◐          |       ● (`BND_TUPLE`)        |                              |                  |                   |                   |
| ammo.js (WebIDL)       |                    |         ◐ ([Value])          |          ● ([Ref])           |                  |                   |                   |
| Box2D-WASM (WebIDL)    |                    |         ◐ ([Value])          |          ● ([Ref])           |                  |                   |                   |
| Draco (WebIDL)         |                    |                              |       ● ([Ref] sinks)        |   ◐ (VoidPtr)    |                   |                   |
| assimpjs               |         ●          |                              |                              |                  |                   |                   |
| occt-import-js         |         ●          |                              |                              |                  |                   |                   |
| **OCJS (today)**       |         ◐          | ● (primitives/enums/handles) |                              |                  |                   |  ● (class types)  |
| **OCJS (after R1–R7)** |  ◐ (manual lane)   |         ● (default)          |          ● (in/out)          |                  |                   |     (removed)     |

The matrix makes the architectural mismatch explicit: OCJS is the only library currently using the proxy-mutation pattern. After R1–R7, OCJS aligns with the surveyed peer consensus — `value_object` for pure-output (matching CanvasKit/OpenCV.js/rhino3dm) and caller-allocated wrappers for in/out (matching every WebIDL Binder library and OpenCV.js's `cv::Mat&` model).
