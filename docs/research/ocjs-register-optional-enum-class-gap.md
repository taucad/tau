---
title: 'OCJS register_optional Enum/Class Inner-Type Gap — Lost OCCT Surface Quantification'
description: 'Read-only audit quantifying which bound OCCT classes are unreachable because register_optional<T> is emitted only for bool/int/3 handle-alloc types and never for the enum/class inner types used in genuine std::optional<T> parameters, returns, and value_object fields.'
status: active
created: '2026-05-29'
updated: '2026-05-29'
category: audit
related:
  - docs/research/ocjs-occt-surface-audit.md
  - docs/research/ocjs-skipped-test-reactivation.md
  - repos/opencascade.js/docs/policy/ocjs-trailing-default-emission-policy.md
---

# OCJS register_optional Enum/Class Inner-Type Gap — Lost OCCT Surface Quantification

Read-only quantification of the OCCT binding surface rendered unreachable from JS because the OCJS bindgen emits `register_optional<T>` only for a closed set of inner `T` (scalar `bool`/`int` + three handle/alloc types) and never for the enum or class inner types that appear in genuine `std::optional<T>` parameters, returns, and `value_object` fields.

## Executive Summary

The Phase-4 binding surface emits `register_optional<T>` for exactly **five** inner types — `bool` (203), `occ::handle<NCollection_BaseAllocator>` (102), `occ::handle<IntTools_Context>` (2), `int` (1), `TDF_HAllocator` (1) — and **zero** enum or class inner types. Any bound method/ctor/field whose wire type is `std::optional<EnumOrClass>` therefore reaches an unbound type at call time and throws `Cannot construct … due to unbound types`.

Intersecting OCCT's source-level `std::optional<T>` usage against what is actually **bound** (appears as a class in `dist/opencascade_full.d.ts`), the lost surface is **narrow and almost entirely low-importance**:

- **Genuine `std::optional<enum/class>` _parameters_ (the core question): exactly 2 bound classes / 4 constructors**, all carrying one inner enum `BRepGraph_NodeId::Kind` — `BRepGraph_ParentExplorer` and `BRepGraph_ChildExplorer`. Every other source-level genuine-optional parameter (ExtremaPC `Domain1D`, `OSD_ThreadPool::performJob`'s `Standard_ProgramError`) sits on a **private/protected** method and is **not bound** — never reachable, so not lost surface.
- **Identical-root-cause _return_ + _`value_object` field_ surface (same gap, broader reach):** `Bnd_Box::Center`/`Bnd_Box2d::Center` (`optional<gp_Pnt>`/`optional<gp_Pnt2d>` returns), the two `BRepGraph_*Explorer::Config` value-objects + `GetConfig()`, and **≈20 modern-V8 math-solver result/config classes** (`MathUtils_*`, `MathLin_*`, `MathOpt_*`, `MathInteg_*`) whose computed-output fields are typed `optional<math_Vector|math_Matrix>`.

**Public-vs-internal verdict:** the only _public, user-facing_ casualty with no clean workaround is the **avoid-kind pruning / `Config`-based / `GetConfig()` slice of the new `BRepGraph` topology explorers** — and that is an advanced, niche V8 feature a replicad/Tau-style modeling consumer essentially never calls; basic graph traversal (arities 2–4) still works. `Bnd_Box::Center` is public and common but trivially recovered from the bound `CornerMin()`/`CornerMax()` midpoint. The math-solver result structs are **internal numerical helpers** — consumers don't call raw eigen/SVD/Uzawa from a CAD app.

**Scale to close the gap:** emitting `register_optional<T>` for **3 inner types** (`BRepGraph_NodeId::Kind`, `gp_Pnt`, `gp_Pnt2d`) restores the BRepGraph explorers + bounding-box centers; adding **`math_Vector`, `math_Matrix`, `math_IntegerVector`** (and the adjacent scalar `double`) restores the entire modern-math result family — **≈6 inner types total**.

## Problem Statement

A prior worker (see `ocjs-skipped-test-reactivation.md`, Findings 1–2) discovered that `register_optional<BRepGraph_NodeId::Kind>` is never emitted, so the genuine-optional `BRepGraph_ParentExplorer` ctors throw `unbound types: std::optional<BRepGraph_NodeId::Kind>` at full arity. This audit answers the follow-up: **exactly how much bound OCCT surface is lost to this enum/class `register_optional` gap, how much of it matters to a CAD-on-the-web consumer, and how many inner types must be registered to close it.**

## Methodology

- Enumerated every `register_optional<T>` in the regenerated binding surface (`build/bindings/**/*.cpp`, 5,324 files) by inner `T`.
- Grepped OCCT public headers (`deps/OCCT/src/**/*.hxx`) for source-level `std::optional<` and classified each hit as parameter / return / `value_object` field / member-initializer / private-helper.
- Cross-referenced every candidate class against the bound surface (`dist/opencascade_full.d.ts`) to drop unbound classes (never reachable ⇒ not lost surface).
- Verified the absence of `register_optional` and the exact emission shape directly in the generating `.cpp` for the flagship sites (`Bnd_Box.cpp`, `BRepGraph_ParentExplorer.cpp`, `BRepGraph_ChildExplorer.cpp`, `MathUtils_VectorResult.cpp`).
- **Note:** a sibling agent was concurrently rebuilding the WASM; `dist/opencascade_full.d.ts` changed under observation (optional fields shifted from `T | undefined` to `T | null | undefined` mid-audit). The `register_optional` inventory was stable across both reads. Citations use class/method names, not line numbers, since the artefact churns.

## Findings

### Finding 1: `register_optional` covers 5 inner types, none enum/class

Inner-`T` inventory across all 5,324 binding `.cpp` files (stable across two reads during a concurrent rebuild):

| Inner `T` registered                     | Count | Kind                 |
| ---------------------------------------- | ----- | -------------------- |
| `bool`                                   | 203   | scalar               |
| `occ::handle<NCollection_BaseAllocator>` | 102   | handle               |
| `occ::handle<IntTools_Context>`          | 2     | handle               |
| `int`                                    | 1     | scalar               |
| `TDF_HAllocator`                         | 1     | handle/alloc typedef |

`rg -l 'register_optional<(gp_|BRepGraph_NodeId|ExtremaPC|math_|Standard_ProgramError)'` over `build/bindings` returns **zero** files. No enum, no class, and notably **no `double`** is ever registered as an optional inner type.

### Finding 2: every genuine `std::optional<enum/class>` _parameter_ in OCCT source is private — except the BRepGraph explorers

OCCT public headers use source-level `std::optional<T>` in 38 files, but in **parameter position** the enum/class hits are:

| Source site                                                     | Inner `T`                       | Access           | Bound?                   |
| --------------------------------------------------------------- | ------------------------------- | ---------------- | ------------------------ |
| `BRepGraph_ParentExplorer` ctors ×2 (`theAvoidKind`)            | `BRepGraph_NodeId::Kind` (enum) | **public**       | **yes**                  |
| `BRepGraph_ChildExplorer` ctors ×2 (`theAvoidKind`)             | `BRepGraph_NodeId::Kind` (enum) | **public**       | **yes**                  |
| `BRepGraph_*Explorer::normalizeAvoidKind(...)`                  | `BRepGraph_NodeId::Kind`        | private static   | no                       |
| `ExtremaPC_Curve::initFromGeomCurve / initFromTransformedCurve` | `ExtremaPC::Domain1D` (class)   | **private**      | no                       |
| `ExtremaPC_Parabola/Hyperbola::performCore`                     | `ExtremaPC::Domain1D` (class)   | **private**      | no                       |
| `OSD_ThreadPool::performJob`                                    | `Standard_ProgramError` (class) | protected helper | no (absent from `.d.ts`) |

The `ExtremaPC_*` public ctors take a **non-optional** `const ExtremaPC::Domain1D&` (the `std::optional` only appears in member-initializers and private helpers); the domain is fixed at construction, so no public `ExtremaPC` method exposes an optional parameter. `OSD_ThreadPool::performJob` is an internal helper and does not appear in `dist/opencascade_full.d.ts`. **The genuine-optional enum/class _parameter_ gap is therefore exactly the two `BRepGraph` explorers.**

### Finding 3: the BRepGraph explorer breakage is partial — basic traversal works, the avoid-kind / Config / GetConfig slice does not

`BRepGraph_ParentExplorer.cpp` (and the structurally-identical `ChildExplorer.cpp`) contains **no** `register_optional`. The class registers these constructor entries:

```cpp
.constructor<const BRepGraph &, const BRepGraph_NodeId>()                              // arity 2 — native
.constructor(optional_override([](val arg0, val arg1, val arg2) -> … {                 // arity 3 — val-dispatch
  if (arg2 is Kind string)         return new …(graph, node, Kind);                     //   branch A — OK
  else if (arg2 is TraversalMode)  return new …(graph, node, TraversalMode);            //   branch B — OK
  else                             return new …(graph, node, arg2.as<const Config&>()); //   branch C — Config → THROWS
}))
.constructor<…, BRepGraph_NodeId::Kind, TraversalMode>()                                // arity 4 — native
.constructor(optional_override([](…, const std::optional<Kind>& theAvoidKind, bool, val theMode){…})) // arity 5 — THROWS
.constructor(optional_override([](…, Kind, const std::optional<Kind>& theAvoidKind, bool, val theMode){…})) // arity 6 — THROWS
.function("GetConfig", &…::GetConfig, …)                                                // returns Config value_object — THROWS
…
value_object<…::Config>("BRepGraph_ParentExplorer_Config")
  .field("AvoidKind", &Config::AvoidKind)     // std::optional<Kind> — unreadable
  .field("TargetKind", &Config::TargetKind)   // std::optional<Kind> — unreadable
```

Reachability (matches the arity-by-arity probe in `ocjs-skipped-test-reactivation.md` Finding 2):

| Call shape                                                                                    | Result                                                   |
| --------------------------------------------------------------------------------------------- | -------------------------------------------------------- |
| `(graph, node)` / `(graph, node, Kind)` / `(graph, node, Mode)` / `(graph, node, Kind, Mode)` | reachable ✓                                              |
| arity-3 `(graph, node, configObject)` — the **documented "preferred long-term" idiom**        | **throws** (`arg2.as<Config>()` reads optional fields)   |
| arity-5 `(graph, node, avoidKind, emit, mode)`                                                | **throws**                                               |
| arity-6 `(graph, node, targetKind, avoidKind, emit, mode)`                                    | **throws**                                               |
| `explorer.GetConfig()`                                                                        | **throws** (Config value-object carries optional fields) |

The full-arity ctors are masked in `smoke-genuine-optional-param.test.ts` because its 4-arg calls route around the unbound full-arity invoker via libembind arity-pad.

### Finding 4: identical-root-cause return + field surface

The same missing-`register_optional` defect reaches bound **returns** and **`value_object`/class fields** whose inner type is an enum/class:

| Bound site                                                                              | Wire type                                                                                 | Inner `T`                                                    | Reachability                                                           | Workaround                                    |
| --------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------- | ------------------------------------------------------------ | ---------------------------------------------------------------------- | --------------------------------------------- |
| `Bnd_Box::Center()`                                                                     | `optional<gp_Pnt>` (`gp_Pnt \| null \| undefined`)                                        | `gp_Pnt` (class)                                             | **fully unreachable** (throws on call)                                 | midpoint of bound `CornerMin()`/`CornerMax()` |
| `Bnd_Box2d::Center()`                                                                   | `optional<gp_Pnt2d>`                                                                      | `gp_Pnt2d` (class)                                           | **fully unreachable**                                                  | midpoint of corners                           |
| `BRepGraph_ParentExplorer::GetConfig()` + `Config` value-object                         | `optional<Kind>` fields                                                                   | `BRepGraph_NodeId::Kind` (enum)                              | **fully unreachable**                                                  | reconstruct from ctor inputs                  |
| `BRepGraph_ChildExplorer::GetConfig()` + `Config` value-object                          | `optional<Kind>` fields                                                                   | `BRepGraph_NodeId::Kind` (enum)                              | **fully unreachable**                                                  | reconstruct from ctor inputs                  |
| `MathUtils_*` / `MathLin_*` / `MathOpt_*` / `MathInteg_*` result & config classes (≈20) | `optional<math_Vector>` / `optional<math_Matrix>` / `optional<math_IntegerVector>` fields | `math_Vector`, `math_Matrix`, `math_IntegerVector` (classes) | **field-unreachable** (object constructs; output fields throw on read) | none from JS                                  |

`Bnd_Box.cpp`, `BRepGraph_*Explorer.cpp`, and `MathUtils_VectorResult.cpp` each confirmed to contain **no** `register_optional`. The math result classes bind their outputs as `class_<…>().property("Solution", …).property("Jacobian", …)` etc.; `dist/opencascade_full.d.ts` carries **15** `math_Matrix | null | undefined` field/return slots and **17** `unknown | null | undefined` slots (`math_Vector`/`math_IntegerVector` resolve to `unknown`), spread across the modern-math family. (`GeomGridEval_Surface::GetTransformation() → optional<gp_Trsf>` is **not** bound — the class is absent from `.d.ts` — so it is not lost surface.)

> Adjacent scalar gap (out of the strict enum/class scope but the same root cause): `optional<double>` is **also** never registered, so `Bnd_Range::Center/Min/Max` and every `optional<double>` math-result field (`Value`, `Determinant`, `Residual`, …) are likewise broken. Closing the enum/class gap should register `double` in the same pass.

## Full Inventory Table (bound sites only)

| Class::Method (or ctor / field)                                       | Inner `T`                                        | enum/class | Module / toolkit           | Reachability                   | Feature area                                      | Importance                 |
| --------------------------------------------------------------------- | ------------------------------------------------ | ---------- | -------------------------- | ------------------------------ | ------------------------------------------------- | -------------------------- |
| `BRepGraph_ParentExplorer` ctor (arity 5, `theAvoidKind`)             | `BRepGraph_NodeId::Kind`                         | enum       | ModelingData / TKBRep      | partial — full-arity throws    | BRepGraph topology traversal (avoid-kind pruning) | Low–Med (public, niche V8) |
| `BRepGraph_ParentExplorer` ctor (arity 6, `theAvoidKind`)             | `BRepGraph_NodeId::Kind`                         | enum       | ModelingData / TKBRep      | partial — full-arity throws    | BRepGraph topology traversal                      | Low–Med                    |
| `BRepGraph_ParentExplorer` ctor (arity 3, `Config` branch)            | `BRepGraph_NodeId::Kind`                         | enum       | ModelingData / TKBRep      | partial — Config branch throws | BRepGraph Config idiom (recommended)              | Low–Med                    |
| `BRepGraph_ParentExplorer::GetConfig()` + `Config` fields             | `BRepGraph_NodeId::Kind`                         | enum       | ModelingData / TKBRep      | fully unreachable              | BRepGraph config readback                         | Low                        |
| `BRepGraph_ChildExplorer` ctors (arity 5 & 6)                         | `BRepGraph_NodeId::Kind`                         | enum       | ModelingData / TKBRep      | partial — full-arity throws    | BRepGraph topology traversal                      | Low–Med                    |
| `BRepGraph_ChildExplorer::GetConfig()` + `Config` fields              | `BRepGraph_NodeId::Kind`                         | enum       | ModelingData / TKBRep      | fully unreachable              | BRepGraph config readback                         | Low                        |
| `Bnd_Box::Center()`                                                   | `gp_Pnt`                                         | class      | FoundationClasses / TKMath | fully unreachable              | bounding-box centroid                             | Low (workaround: corners)  |
| `Bnd_Box2d::Center()`                                                 | `gp_Pnt2d`                                       | class      | FoundationClasses / TKMath | fully unreachable              | 2D bounding-box centroid                          | Low (workaround: corners)  |
| `MathUtils_VectorResult` fields (`Solution`,`Gradient`,`Jacobian`)    | `math_Vector`,`math_Matrix`                      | class      | FoundationClasses / TKMath | field-unreachable              | modern math solver result                         | Low (internal numeric)     |
| `MathUtils_{Inverse,Decomp,Eigen,Linear,LinearMultiple}Result` fields | `math_Vector`,`math_Matrix`                      | class      | FoundationClasses / TKMath | field-unreachable              | modern math solver result                         | Low                        |
| `MathLin_{Eigen,SVD,QR,LeastSquares,Crout,LU}Result` fields           | `math_Vector`,`math_Matrix`,`math_IntegerVector` | class      | FoundationClasses / TKMath | field-unreachable              | modern linear-algebra result                      | Low                        |
| `MathOpt_{Uzawa}Result` / `MathOpt_PSO*` config fields                | `math_Vector`,`math_Matrix`                      | class      | FoundationClasses / TKMath | field-unreachable              | modern optimization result                        | Low                        |
| `MathInteg_SetResult` field (`Values`)                                | `math_Vector`                                    | class      | FoundationClasses / TKMath | field-unreachable              | modern integration result                         | Low                        |

## Feature-Area Grouping + Importance Verdicts

### Group A — BRepGraph topology explorers (public, niche)

`BRepGraph` is OCCT V8's new graph-based B-Rep representation; the Parent/Child explorers walk the topology graph up/down. The **only public, user-facing parameter casualty** in the whole audit lives here: the `theAvoidKind` pruning slot, the recommended `Config`-object constructor, and `GetConfig()` readback. **Basic and target-kind traversal (arities 2–4, plus the `Kind`/`Mode` string branches of the arity-3 dispatch) all work.** A replicad/Tau-style modeling consumer almost never walks the raw BRep graph (it is topology introspection, not modeling), and the lost slice is the _advanced_ configuration of an _already-niche_ feature. **Verdict: Low–Medium importance; partial workaround (omit avoid-kind, pass `Kind`/`Mode` directly).**

### Group B — Bounding-box center (public, trivially worked around)

`Bnd_Box`/`Bnd_Box2d` are heavily used (framing, layout, pre-checks), so `Center()` returning `optional<gp_Pnt>` (nullopt for a void box) is a genuinely public convenience that **throws today**. But `CornerMin()`/`CornerMax()` are bound and return `gp_Pnt` directly, so `center = (min + max) / 2` is a one-line recovery. **Verdict: Low importance; full workaround.**

### Group C — Modern V8 math-solver result structs (internal helpers)

The `MathUtils_*`/`MathLin_*`/`MathOpt_*`/`MathInteg_*` families are V8's modernized numerical solvers (eigen, SVD, QR, least-squares, LU, Crout, Uzawa, PSO, Kronrod integration). Their result objects construct fine, but **every computed-output field** (`Solution`, `EigenValues`, `EigenVectors`, `Inverse`, `Q`/`R`, `U`/`V`, …) is `optional<math_Vector|math_Matrix>` and **throws on read** — making the JS-exposed solver surface effectively non-functional. However these are **internal algorithm helpers**: OCCT uses them inside its own C++ algorithms; a CAD-on-the-web consumer does not call raw linear-algebra solvers from a modeling app. **Verdict: Low importance to the target consumer despite the large count.**

## Scale

| Metric                                                                             | Value                                                                                                                                        |
| ---------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------- |
| Bound classes with a genuine `std::optional<enum/class>` **parameter**             | **2** (`BRepGraph_ParentExplorer`, `BRepGraph_ChildExplorer`)                                                                                |
| Affected **constructors** (parameter sites)                                        | **4** full-arity ctors + the `Config` branch of 2 arity-3 dispatchers                                                                        |
| Bound classes affected when including **returns + `value_object`/class fields**    | **≈24** (2 BRepGraph + 2 `Bnd_Box*` + ≈20 math result/config)                                                                                |
| Affected **methods/returns**                                                       | `GetConfig()` ×2, `Center()` ×2, ≈32 optional class-typed field/return slots (15 `math_Matrix` + 17 `unknown`=`math_Vector`/`IntegerVector`) |
| Distinct inner **enum** types needing `register_optional`                          | **1** (`BRepGraph_NodeId::Kind`)                                                                                                             |
| Distinct inner **class** types needing `register_optional`                         | **5** (`gp_Pnt`, `gp_Pnt2d`, `math_Vector`, `math_Matrix`, `math_IntegerVector`)                                                             |
| Distinct inner types to close the **whole** gap (enum + class + adjacent `double`) | **≈7**                                                                                                                                       |
| Inner types to restore **all public, user-facing** sites (Groups A + B)            | **3** (`BRepGraph_NodeId::Kind`, `gp_Pnt`, `gp_Pnt2d`)                                                                                       |

## What Closing the Gap Unlocks

- **3 inner types** (`BRepGraph_NodeId::Kind`, `gp_Pnt`, `gp_Pnt2d`) restore **every public, user-facing site**: the full BRepGraph explorer API (avoid-kind pruning, the recommended `Config` constructor, `GetConfig()` readback) and `Bnd_Box`/`Bnd_Box2d::Center()`. This also unblocks the `MIXED_DISPATCH_AVAILABLE` smoke gate (`ocjs-skipped-test-reactivation.md` R2) and lets `smoke-genuine-optional-param.test.ts` exercise the full-arity ctors (R3).
- **Adding `math_Vector`, `math_Matrix`, `math_IntegerVector`** (and registering `double`) makes the modern-math result family readable — low consumer value, but it removes ~24 silently-broken bound classes and a class of "constructs-then-throws-on-read" foot-guns.
- The fix is the bindgen recommendation already recorded as R1 in the reactivation doc: emit `register_optional<T>` for every enum/class `T` that appears in a genuine `std::optional<T>` parameter, return, or `value_object` field. Per the surface audit, rows 21/22 of the trailing-default emission matrix are the genuine-optional domain this gap belongs to.

## References

- Surface audit (rows 21/22 genuine-optional inventory): `docs/research/ocjs-occt-surface-audit.md`
- Reactivation escalation that found the gap (Findings 1–2, R1–R3): `docs/research/ocjs-skipped-test-reactivation.md`
- Trailing-default emission policy (rows 21/22 definitions): `repos/opencascade.js/docs/policy/ocjs-trailing-default-emission-policy.md`
- Flagship binding evidence: `build/bindings/ModelingData/TKBRep/BRepGraph/BRepGraph_{Parent,Child}Explorer.hxx/*.cpp`, `build/bindings/FoundationClasses/TKMath/Bnd/Bnd_Box.hxx/Bnd_Box.cpp`, `build/bindings/FoundationClasses/TKMath/MathUtils/MathUtils_Types.hxx/MathUtils_VectorResult.cpp`
- OCCT source: `deps/OCCT/src/ModelingData/TKBRep/BRepGraph/*.hxx`, `deps/OCCT/src/FoundationClasses/TKMath/{Bnd,MathUtils,MathLin,MathOpt,MathInteg}/*.hxx`, `deps/OCCT/src/ModelingData/TKGeomBase/ExtremaPC/*.hxx`
