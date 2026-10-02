---
title: 'OCJS RBV envelope gap for non-copyable inputs and JS-integer overload dedup'
description: 'Root-cause analysis of the two remaining OCJS smoke-test failures after R1–R4: BRepGraph_Builder.Add returning a non-disposable value, and NCollection_IndexedMap.FindKey emitting suffixed FindKey_1/FindKey_2 instead of a unified FindKey.'
status: draft
created: '2026-05-12'
updated: '2026-05-12'
category: investigation
related:
  - docs/research/ocjs-unified-rbv-blueprint.md
  - docs/research/ocjs-rbv-blueprint-p0-p1-stocktake.md
  - docs/research/ocjs-ncollection-and-dts-regressions.md
---

# OCJS RBV envelope gap for non-copyable inputs and JS-integer overload dedup

Root-cause analysis of the two smoke-test failures that survived the R1–R4 binding-generator fixes shipped against `repos/opencascade.js`.

## Executive Summary

After R1–R4 the OCJS smoke suite went from 12 reds to 2 reds. The remaining failures are independent codegen gaps, not regressions of the R1 work:

1. **`BRepGraph_Builder.Add` returns a plain value-object** with no `[Symbol.dispose]`. The test's `using container = …` ceremony throws `TypeError: Object is not disposable.` because `BRepGraph` has `BRepGraph(const BRepGraph&) = delete;`, which makes `_isCopyConstructibleClass` return `False`, which makes `_isDefaultConstructibleClass` return `False`, which makes `isOutputParam(BRepGraph&)` return `False`, which short-circuits the entire `_emitOutputParamBinding` RBV envelope path. The binding falls through to a plain `select_overload<...>(&BRepGraph_Builder::Add)`, returning the value-object `Result` directly.
2. **`NCollection_IndexedMap.FindKey` is emitted as `FindKey_1` / `FindKey_2`** instead of a single `FindKey`. OCCT exposes two same-arity overloads — `FindKey(const size_t)` (modern V8 canonical signature) and `FindKey(const int)` (legacy convenience that immediately delegates via `static_cast<size_t>`). Both classify as JS `number` so the dispatch tree marks them ambiguous, the val-fallback tree marks them ambiguous, and `processMethodGroup` walks off the end into `_emitSuffixedMethod`.

**Recommendations**: extend `_emitOutputParamBinding` with a "ref-only RBV envelope" path that handles non-copyable class output params, and extend the existing const/non-const dedup loop (`bindings.py` lines 2433–2444) with a JS-integer dedup pass that collapses `size_t`/`int` (and peers) to a single canonical overload, preferring the `size_t` signature.

## Table of Contents

- [Executive Summary](#executive-summary)
- [Problem Statement](#problem-statement)
- [Methodology](#methodology)
- [Findings](#findings)
  - [Finding 1: BRepGraph deletes its copy constructor](#finding-1-brepgraph-deletes-its-copy-constructor)
  - [Finding 2: `isOutputParam` correctly rejects non-copyable classes](#finding-2-isoutputparam-correctly-rejects-non-copyable-classes)
  - [Finding 3: The fallback path emits a non-disposable value-object](#finding-3-the-fallback-path-emits-a-non-disposable-value-object)
  - [Finding 4: `FindKey(size_t)` and `FindKey(int)` are JS-indistinguishable](#finding-4-findkeysize_t-and-findkeyint-are-js-indistinguishable)
  - [Finding 5: Dispatch tree collapses, suffixed names emerge](#finding-5-dispatch-tree-collapses-suffixed-names-emerge)
- [Recommendations](#recommendations)
- [Trade-offs](#trade-offs)
- [Code Examples](#code-examples)
- [References](#references)
- [Appendix](#appendix)

## Problem Statement

After landing R1–R4 from `docs/research/ocjs-ncollection-and-dts-regressions.md`, the OCJS smoke suite reports two failures:

```
FAIL  tests/smoke/smoke-brep-graph.test.ts > BRepGraph_Builder.Add ingests a TopoDS_Shape and reports Ok
TypeError: Object is not disposable.
 ❯ tests/smoke/smoke-brep-graph.test.ts:37:5
     35|     using shape = box.Shape();
     36|
     37|     using container = oc.BRepGraph_Builder.Add(graph, shape);
     38|     const result = container.result;
```

```
FAIL  tests/smoke/smoke-collections.test.ts > NCollection_IndexedMap_TopoDS_Shape_TopTools_ShapeMapHasher.FindKey
TypeError: map.FindKey is not a function
 ❯ tests/smoke/smoke-collections.test.ts:87:24
     85|     expect(map.Size()).toBe(6);
     86|
     87|     using face1 = map.FindKey(1);
```

Both surface only after R1 made the templated NCollection and `BRepGraph_Builder` classes registrable in the first place; they are not regressions of R1's template-arg substitution fix.

## Methodology

1. Read each failing test (`tests/smoke/smoke-brep-graph.test.ts`, `tests/smoke/smoke-collections.test.ts`) to capture the exact expected JS shape.
2. Inspect the freshly generated C++ binding files (`build/bindings/.../BRepGraph_Builder.cpp`, `build/bindings/myMain.h/NCollection_IndexedMap_TopoDS_Shape_TopTools_ShapeMapHasher.cpp`) to read the actual `EMSCRIPTEN_BINDINGS` emissions.
3. Walk the binding-generator dispatch in `repos/opencascade.js/src/bindings.py` from `processMethodOrProperty` → `_emitOutputParamBinding` → `isOutputParam` → `_isDefaultConstructibleClass` → `_isCopyConstructibleClass`, then `processMethodGroup` → dispatch-tree construction → `_emitSuffixedMethod`.
4. Read the OCCT V8 sources (`deps/OCCT/src/ModelingData/TKBRep/BRepGraph/BRepGraph.hxx`, `deps/OCCT/src/FoundationClasses/TKernel/NCollection/NCollection_IndexedMap.hxx`) to verify the upstream signatures and copy-ctor disposition.

## Findings

### Finding 1: BRepGraph deletes its copy constructor

`deps/OCCT/src/ModelingData/TKBRep/BRepGraph/BRepGraph.hxx` lines 128–129:

```cpp
class BRepGraph
{
public:
  DEFINE_STANDARD_ALLOC

  BRepGraph(const BRepGraph&)            = delete;
  BRepGraph& operator=(const BRepGraph&) = delete;

  //! Default constructor. Creates an empty graph with default allocator.
  Standard_EXPORT BRepGraph();
  ...
  BRepGraph(BRepGraph&&) noexcept;             // move ctor OK
  BRepGraph& operator=(BRepGraph&&) noexcept;  // move assign OK
  ...
  std::unique_ptr<BRepGraph_Data> myData;      // held by unique_ptr
};
```

This is canonical OCCT V8 design: `BRepGraph` owns `std::unique_ptr<BRepGraph_Data>` plus several `BRepGraph_*` cache members. Copying would silently double-free the data pointer, so the upstream library explicitly forbids it. JS callers must operate on the same graph instance via reference semantics.

### Finding 2: `isOutputParam` correctly rejects non-copyable classes

`repos/opencascade.js/src/bindings.py` lines 109–157 implement `_isDefaultConstructibleClass`, which gates the entire input-passthrough RBV path. The relevant guard is on line 144:

```python
# The class must be value-parameter-safe — embind binds class-typed lambda
# parameters by value, so an accessible non-deleted copy constructor is
# required in addition to a default ctor.
if not _isCopyConstructibleClass(decl):
  return False
```

`_isCopyConstructibleClass` (lines 229–334) walks the class's user-declared copy constructors; if any are present, all must be public and non-deleted (lines 263–270):

```python
copy_ctors = [c for c in all_ctors if _ctor_is_copy(c, decl)]
if copy_ctors:
  ok_copy = any(
    c.access_specifier == clang.cindex.AccessSpecifier.PUBLIC
    and not c.is_deleted_method()
    for c in copy_ctors
  )
  _COPY_CTOR_CACHE[decl_key] = ok_copy
  return ok_copy
```

For `BRepGraph`, the single user-declared copy ctor is public but `is_deleted_method() == True`, so `ok_copy = False`. `_isCopyConstructibleClass` returns `False`, `_isDefaultConstructibleClass` returns `False`, and `isOutputParam(const BRepGraph&)` returns `False` (lines 355–380):

```python
def isOutputParam(arg_type):
  ...
  if _isHandleType(pointee):
    return True
  if _isDefaultConstructibleClass(pointee):
    return True
  return False
```

This behaviour is **correct** for the input-passthrough RBV blueprint — passing a non-copyable class through an embind lambda parameter by value would fail to compile.

### Finding 3: The fallback path emits a non-disposable value-object

Because `hasOutputParams` evaluates to `False`, `_emitOutputParamBinding` is never called (`bindings.py` lines 1999–2005). The processing of the four `BRepGraph_Builder::Add` overloads instead falls through to the `numOverloads > 1` arm at line 2235:

```python
elif numOverloads == 1:
  functionBinding = " &" + classCpp + "::" + method.spelling
else:
  functionBinding = merge("",
    " select_overload<",
    self.resolveWithCanonicalFallback(method.result_type.spelling, …),
    f'({merge(", ", *map(lambda x: self.getOriginalArgumentType(x, …), …))})',
    pick(method.is_const_method(), "const", ""),
    pick(not method.is_static_method(), f", {classCpp}", ""),
    f">(&{classCpp}::{method.spelling})",
  )
```

The generated `BRepGraph_Builder.cpp` confirms this (lines 5324–5341):

```cpp
class_<BRepGraph_Builder>("BRepGraph_Builder")
  .class_function("Add", select_overload<BRepGraph_Builder::Result(BRepGraph &, const TopoDS_Shape &)>(&BRepGraph_Builder::Add), allow_raw_pointers())
  .class_function("Add", select_overload<BRepGraph_Builder::Result(BRepGraph &, const TopoDS_Shape &, const BRepGraph_Builder::Options &)>(&BRepGraph_Builder::Add), allow_raw_pointers())
  .class_function("Add", select_overload<BRepGraph_Builder::Result(BRepGraph &, const TopoDS_Shape &, const BRepGraph_NodeId)>(&BRepGraph_Builder::Add), allow_raw_pointers())
  .class_function("Add", select_overload<BRepGraph_Builder::Result(BRepGraph &, const TopoDS_Shape &, const BRepGraph_NodeId, const BRepGraph_Builder::Options &)>(&BRepGraph_Builder::Add), allow_raw_pointers())
  ;

value_object<BRepGraph_Builder::Result>("BRepGraph_Builder_Result")
  .field("TopologyRoot", &BRepGraph_Builder::Result::TopologyRoot)
  .field("Product",      &BRepGraph_Builder::Result::Product)
  .field("Occurrence",   &BRepGraph_Builder::Result::Occurrence)
  .field("InsertedRef",  &BRepGraph_Builder::Result::InsertedRef)
  .field("Ok",           &BRepGraph_Builder::Result::Ok)
  ;
```

At runtime embind unwraps the `value_object` into a plain JS object: `{ TopologyRoot, Product, Occurrence, InsertedRef, Ok }`. Plain JS objects do not implement `Symbol.dispose`, so the test's `using container = oc.BRepGraph_Builder.Add(...)` immediately throws `TypeError: Object is not disposable.`

The test was authored expecting the OCJS RBV envelope `{ result: Result, [Symbol.dispose]: … }`. The codegen does not emit that envelope because the non-copyable input arg disqualifies the entire method from `_emitOutputParamBinding` — even though the return type alone (a registered `value_object`) would justify a Symbol.dispose-bearing envelope for uniform DX.

### Finding 4: `FindKey(size_t)` and `FindKey(int)` are JS-indistinguishable

`deps/OCCT/src/FoundationClasses/TKernel/NCollection/NCollection_IndexedMap.hxx` lines 580–593 declare both overloads:

```cpp
//! FindKey
const TheKeyType& FindKey(const size_t theIndex) const
{
  Standard_OutOfRange_Raise_if(theIndex == 0 || theIndex > Size(),
                               "NCollection_IndexedMap::FindKey");
  IndexedMapNode* pNode2 = (IndexedMapNode*)myData2[theIndex - 1];
  return pNode2->Key1();
}

const TheKeyType& FindKey(const int theIndex) const
{
  Standard_OutOfRange_Raise_if(theIndex < 0, "NCollection_IndexedMap::FindKey: negative index");
  return FindKey(static_cast<size_t>(theIndex));
}
```

The `int` overload is a thin convenience shim that immediately upcasts to `size_t`. It exists only to ease C++ source-level migration during the NCollection size_t conversion (OCCT issue #1212, noted under "OCJS V8 NCollection size_t API migration" in `AGENTS.md`). The two overloads are observationally identical from C++ when called with a non-negative integer, and **completely indistinguishable from JavaScript** because both `size_t` and `int` round-trip through embind as `number`.

### Finding 5: Dispatch tree collapses, suffixed names emerge

`processMethodGroup` (`bindings.py` lines 2402–2562) drives same-name overload binding. For the `FindKey` group with `by_arity[1] = [size_t-overload, int-overload]`:

1. `bindable = [m_size_t, m_int]`. The rvalue-ref filter (line 2426) is a no-op. The const/non-const dedup (lines 2436–2444) is a no-op because the canonical-spelling arg keys differ (`(unsigned long,)` vs `(int,)`).
2. `all_unique_arities = False` (one arity bucket holds two methods), so the all-unique fast path (line 2476) is skipped.
3. Per-arity processing reaches line 2531 with both methods in `dispatchable`. `_build_js_dispatch_tree` is called; both classify as `number` (likely `number_int` after upstream classification), and `js_ambiguous` collects both.
4. `_build_dispatch_tree` (val-based tree) is then run. It also cannot distinguish them — both arguments arrive as `emscripten::val` whose `typeOf().as<std::string>() == "number"` and `Number.isInteger(arg0)` return identically for any integer JS argument. `val_ambiguous` therefore still contains both methods.
5. The fallback at lines 2552–2555 fires:

```python
for m in val_ambiguous:
  idx = all_methods_of_name.index(m) if m in all_methods_of_name else 0
  suffix = "_" + str(idx + 1)
  output += self._emitSuffixedMethod(theClass, m, suffix, …)
```

This emits `FindKey_1` and `FindKey_2` (visible in the generated `NCollection_IndexedMap_TopoDS_Shape_TopTools_ShapeMapHasher.cpp` lines 5350–5351), preserving no suffix-free `FindKey` entry — the test's `map.FindKey(1)` call therefore hits `undefined` and throws `TypeError: map.FindKey is not a function`.

## Recommendations

| #   | Action                                                                                                                                                                                                                                                                                                                                                                                                                                                                        | Priority | Effort  | Impact                                                                                                                                                      |
| --- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------- | ------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- |
| R1  | Extend `_emitOutputParamBinding` with a "ref-only RBV envelope" path: when no arg passes `isOutputParam` but at least one arg is a non-const lvalue ref to a registered class that is **not** copy-constructible (and the method returns a value-typed registered type), emit an `optional_override` lambda that forwards the non-copyable class by **reference** (no value-by-copy) and wraps the C++ return in the standard `{ result, [Symbol.dispose] }` envelope.        | P0       | Med     | Unblocks `BRepGraph_Builder.Add` and any future static API that mutates a non-copyable graph/builder while returning a struct. Preserves uniform JS RBV DX. |
| R2  | Extend the const/non-const dedup loop (`bindings.py` lines 2433–2444) with a JS-integer dedup pass. Group same-name overloads whose canonical arg-spelling tuples differ only in integer-type slots (`int`, `unsigned int`, `long`, `unsigned long`, `size_t`, `short`, `unsigned short`, `long long`, `unsigned long long`, `char`, `signed char`, `unsigned char`). Keep the `size_t` variant when present (modern OCCT V8 canonical), else the first encountered overload. | P0       | Low     | Eliminates `FindKey_1` / `FindKey_2` (and any other size_t-vs-int twin OCCT exposes) at the source — suffix-free `FindKey` lands automatically.             |
| R3  | Update `tests/smoke/smoke-brep-graph.test.ts` to drop `using` ceremony on `BRepGraph_Builder.Add` ONLY if R1 is rejected (Trade-off A below). Otherwise leave the test as-is; R1 makes it pass.                                                                                                                                                                                                                                                                               | P1       | Trivial | Defers to R1 vs. R3 trade-off.                                                                                                                              |
| R4  | After R2 lands, audit the rest of the OCCT V8 surface for other JS-integer twins (likely candidates: any class touched by the NCollection `size_t` migration that exposes both signatures publicly). The expectation is that R2's dedup pass handles all of them generically with no per-class allowlists.                                                                                                                                                                    | P2       | Low     | Future-proofs against new OCCT releases that add similar dual-int convenience overloads.                                                                    |
| R5  | Add `_isCopyConstructibleClass` and the ref-only RBV envelope path to the binding-generator unit tests (under `repos/opencascade.js/tests/codegen/`) using a synthetic non-copyable fixture class plus the `FindKey(size_t)`/`FindKey(int)` pattern. Keeps the contract regression-tested at the codegen layer, not just the WASM smoke layer.                                                                                                                                | P2       | Low     | Codifies the contract so a future bindings rewrite can't silently revert.                                                                                   |

## Trade-offs

### Smoking gun #1: codegen extension vs. test adjustment

| Dimension                  | R1 (Ref-only RBV envelope)                                                                                                                                                                       | R3 (Drop `using` in the test)                                                                                                     |
| -------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------- |
| **DX uniformity**          | Every multi-arg method returning a registered type gets the `{ result, [Symbol.dispose] }` envelope. Consumers never have to remember which methods are exempt.                                  | Consumers must remember that "method returns a `value_object` Result + takes a non-copyable input" methods don't get a container. |
| **Runtime cost**           | One extra `optional_override` lambda allocation per call plus the EM_JS-registered shared disposer. ~1.23 µs per Appendix 5 of the unified RBV blueprint.                                        | Zero — direct `select_overload` path is the fastest C++→JS lane.                                                                  |
| **Lint-rule consistency**  | The `require-using-on-disposable` rule keeps catching real leaks. Adding a no-op `[Symbol.dispose]()` to value-object containers does nothing at runtime but keeps the lint surface uniform.     | The lint rule must learn that some method return values are NOT disposable, requiring per-method allowlisting.                    |
| **Codegen surface area**   | ~40 lines added to `_emitOutputParamBinding` plus an `_isRefOnlyRbvCandidate` helper. Mostly mechanical.                                                                                         | One-line test edit.                                                                                                               |
| **Architectural fidelity** | Matches OCCT intent: `BRepGraph& theGraph` is a mutable scope, not a returned value. The envelope still passes the graph by reference internally; the `result` field captures the actual return. | Matches OCCT intent identically — same C++ call, just no JS wrapping.                                                             |

**Recommendation**: implement R1. The uniform DX is worth the ~1 µs cost given that `BRepGraph_Builder.Add` is not a hot-loop API and the test corpus already exercises the envelope shape on every other RBV method. R3 is the cheap fallback if R1 is deferred.

### Smoking gun #2: JS-integer dedup scope

| Dimension         | R2 (integer dedup at `processMethodGroup`)                                                                                                                                                                                                                         | Alternative (custom dispatch tag in JsTypeClassifier)                                                                                                                                    |
| ----------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Generality**    | Single dedup pass handles every `size_t`/`int` twin in OCCT (and any future float-twins, if mirrored).                                                                                                                                                             | Adds a sentinel category that always reports JS-ambiguous and falls through to the existing val-dispatch leaf-fallback. Doesn't actually eliminate the duplicate — picks one at runtime. |
| **Wire size**     | One C++ binding per method, smaller `.wasm`.                                                                                                                                                                                                                       | Both overloads still emitted, with extra ambiguity-tag dispatch. Larger `.wasm`.                                                                                                         |
| **Spec fidelity** | OCCT consistently treats the `int` overload as a convenience wrapper around `size_t`. Picking `size_t` matches upstream's modernisation direction.                                                                                                                 | Preserves both, but the LLM/agent must choose between equivalent overloads with no way to disambiguate.                                                                                  |
| **Risk**          | None for the `FindKey` case (both overloads have identical observable behaviour). A future OCCT integer twin that DOES differ semantically would silently lose one branch. Mitigation: the recommended allow-list lives in one place and reads like documentation. | None.                                                                                                                                                                                    |

**Recommendation**: implement R2 with the explicit allow-list of "JS-equivalent integer types". OCCT's `size_t` migration is documented in upstream issue #1212; aligning the dedup pass with that migration is the canonical move.

## Code Examples

### Reproducer: `BRepGraph_Builder.Add` return shape

```ts
// tests/smoke/smoke-brep-graph.test.ts (current — fails)
using container = oc.BRepGraph_Builder.Add(graph, shape);
const result = container.result;
// → TypeError: Object is not disposable.
```

```ts
// After R1 lands (RBV ref-only envelope)
using container = oc.BRepGraph_Builder.Add(graph, shape);
const { Ok, TopologyRoot, Product, Occurrence, InsertedRef } = container.result;
expect(Ok).toBe(true);
// container[Symbol.dispose]() is a no-op (Result is POD)
```

### Reproducer: `NCollection_IndexedMap.FindKey` overload collision

```ts
// tests/smoke/smoke-collections.test.ts (current — fails)
using face1 = map.FindKey(1);
// → TypeError: map.FindKey is not a function (only FindKey_1, FindKey_2 exist)
```

```ts
// After R2 lands (JS-integer dedup)
using face1 = map.FindKey(1);
// → returns the size_t overload's Handle<TopoDS_Shape>; suffixed names gone
```

### Sketch: ref-only RBV envelope (R1)

```python
# src/bindings.py — pseudocode inside processMethodOrProperty
ref_only_class_args = [
  a for a in args
  if a.type.kind == clang.cindex.TypeKind.LVALUEREFERENCE
  and not a.type.get_pointee().is_const_qualified()
  and _isRegisteredClass(a.type.get_pointee())
  and not _isCopyConstructibleClass(a.type.get_pointee().get_declaration())
]
returns_registered_value = self._returnTypeRequiresValueWrapper(method) and not method.result_type.spelling == "void"

if not hasOutputParams and ref_only_class_args and returns_registered_value:
  functionBinding = self._emitRefOnlyRbvEnvelope(
    theClass, method, args, ref_only_class_args, className, classCpp,
    overloadPostfix, templateDecl, templateArgs,
  )
```

The new `_emitRefOnlyRbvEnvelope` mirrors `_emitOutputParamBinding`'s `val::object()` branch but:

- Each `ref_only_class_args` arg is forwarded by **pointer** (embind passes class types by raw pointer under the hood) and dereferenced for the C++ call.
- The disposer attached to the returned `val::object()` is a no-op (no embind-managed members on the value-object Result), kept only for `using` symmetry.

### Sketch: JS-integer dedup (R2)

```python
# src/bindings.py — replace the const/non-const dedup loop at line 2436

_JS_INTEGER_TYPES = frozenset({
  "char", "signed char", "unsigned char",
  "short", "unsigned short",
  "int", "unsigned int",
  "long", "unsigned long",
  "long long", "unsigned long long",
  "size_t", "ptrdiff_t",
})

def _normalize_arg_key(arg_type):
  spelling = arg_type.get_canonical().spelling.replace("const ", "").strip()
  return "<jsint>" if spelling in _JS_INTEGER_TYPES else spelling

deduped: dict[tuple[str, ...], "clang.Cursor"] = {}
for m in bindable:
  arg_key = tuple(_normalize_arg_key(a.type) for a in m.get_arguments())
  is_const = m.is_const_method()
  prefer_size_t = any(
    a.type.get_canonical().spelling.replace("const ", "").strip() == "size_t"
    for a in m.get_arguments()
  )
  if arg_key not in deduped:
    deduped[arg_key] = m
    continue
  incumbent = deduped[arg_key]
  incumbent_size_t = any(
    a.type.get_canonical().spelling.replace("const ", "").strip() == "size_t"
    for a in incumbent.get_arguments()
  )
  if prefer_size_t and not incumbent_size_t:
    deduped[arg_key] = m
  elif is_const and not incumbent.is_const_method() and prefer_size_t == incumbent_size_t:
    deduped[arg_key] = m
bindable = list(deduped.values())
```

## References

- Upstream signatures: `repos/opencascade.js/deps/OCCT/src/ModelingData/TKBRep/BRepGraph/BRepGraph.hxx`, `repos/opencascade.js/deps/OCCT/src/ModelingData/TKBRep/BRepGraph/BRepGraph_Builder.hxx`, `repos/opencascade.js/deps/OCCT/src/FoundationClasses/TKernel/NCollection/NCollection_IndexedMap.hxx`.
- Generator dispatch entry points: `repos/opencascade.js/src/bindings.py` lines 109–157 (`_isDefaultConstructibleClass`), 229–334 (`_isCopyConstructibleClass`), 355–380 (`isOutputParam`), 1880–1930 (`_emitOutputParamBinding`), 2233–2243 (`select_overload` fallback), 2433–2444 (const/non-const dedup), 2542–2555 (suffixed-name fallback).
- Generated bindings exhibiting the bugs: `repos/opencascade.js/build/bindings/ModelingData/TKBRep/BRepGraph/BRepGraph_Builder.hxx/BRepGraph_Builder.cpp` lines 5324–5341, `repos/opencascade.js/build/bindings/myMain.h/NCollection_IndexedMap_TopoDS_Shape_TopTools_ShapeMapHasher.cpp` lines 5324–5371.
- Failing tests: `repos/opencascade.js/tests/smoke/smoke-brep-graph.test.ts` (lines 31–43), `repos/opencascade.js/tests/smoke/smoke-collections.test.ts` (lines 60–94).
- Prior work this builds on: `docs/research/ocjs-ncollection-and-dts-regressions.md` (R1–R4 already shipped), `docs/research/ocjs-unified-rbv-blueprint.md` (input-passthrough RBV blueprint), `docs/research/ocjs-rbv-blueprint-p0-p1-stocktake.md` (P0+P1 stocktake).
- OCCT `size_t` migration: upstream issue #1212 (recorded under "NCollection size_t API migration" in `AGENTS.md`).

## Appendix

### A1: Why `_emitOutputParamBinding` is the wrong place to handle non-copyable classes

The current `_emitOutputParamBinding` (lines 1880–1930) emits an `optional_override` lambda whose parameter list mirrors the C++ method's arg list. For class-typed args (`gp_Pnt&`, `Bnd_Box&`, `BRepGraph&`), the lambda's parameter is generated as `argType {name}` where `argType = pointee.get_canonical().spelling.replace("const ", "").strip()`. This means the parameter is declared **by value**:

```cpp
optional_override([](BRepGraph theGraph, const TopoDS_Shape& theShape) -> ::emscripten::val { … })
```

For copyable classes (`gp_Pnt`, `Bnd_Box`), this works: embind copies the JS-managed instance into the lambda parameter, the C++ method mutates the local copy, the lambda writes the copy back into the `val::object()` envelope, and the original JS instance stays untouched (input-passthrough). For non-copyable `BRepGraph`, this would fail to compile because `BRepGraph(const BRepGraph&) = delete;`.

The proposed `_emitRefOnlyRbvEnvelope` instead emits:

```cpp
optional_override([](BRepGraph& theGraph, const TopoDS_Shape& theShape) -> ::emscripten::val { … })
```

The lambda takes a non-const reference; embind looks up the underlying instance pointer on the JS side and forwards by reference. The graph is mutated **in place** (same as the original `select_overload<…>(&BRepGraph_Builder::Add)` semantic), and the returned `val::object()` only carries the `result` field plus the no-op disposer.

### A2: Generated emissions, before R1+R2

`NCollection_IndexedMap_TopoDS_Shape_TopTools_ShapeMapHasher.cpp` lines 5350–5351 (today):

```cpp
.function("FindKey_1", select_overload<const TopoDS_Shape &(const size_t)const,
          NCollection_IndexedMap_TopoDS_Shape_TopTools_ShapeMapHasher>(
          &NCollection_IndexedMap_TopoDS_Shape_TopTools_ShapeMapHasher::FindKey), allow_raw_pointers())
.function("FindKey_2", select_overload<const TopoDS_Shape &(const int)const,
          NCollection_IndexedMap_TopoDS_Shape_TopTools_ShapeMapHasher>(
          &NCollection_IndexedMap_TopoDS_Shape_TopTools_ShapeMapHasher::FindKey), allow_raw_pointers())
```

After R2 dedup picks the `size_t` overload, the emission becomes:

```cpp
.function("FindKey", select_overload<const TopoDS_Shape &(const size_t)const,
          NCollection_IndexedMap_TopoDS_Shape_TopTools_ShapeMapHasher>(
          &NCollection_IndexedMap_TopoDS_Shape_TopTools_ShapeMapHasher::FindKey), allow_raw_pointers())
```

`BRepGraph_Builder.cpp` lines 5325–5328 (today): four `.class_function("Add", select_overload<…>)` lines returning a bare `value_object`. After R1, each becomes an `optional_override` lambda that forwards `BRepGraph&` by reference and wraps the call's `Result` in `val::object()` plus the shared EM_JS disposer.

### A3: Tests that surface only as a consequence of R1+R2

| Test                                                                                                                               | Currently fails on                                                | After R1 + R2                                                                                |
| ---------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------- | -------------------------------------------------------------------------------------------- |
| `smoke-brep-graph.test.ts` > `BRepGraph_Builder.Add ingests a TopoDS_Shape and reports Ok`                                         | `using container = oc.BRepGraph_Builder.Add(graph, shape)` throws | Passes — envelope carries `Symbol.dispose` no-op plus `result: Result`.                      |
| `smoke-collections.test.ts` > `NCollection_IndexedMap_TopoDS_Shape_TopTools_ShapeMapHasher.FindKey` (1 of 7 IndexedMap assertions) | `map.FindKey(1)` throws — only `FindKey_1`/`FindKey_2` exist      | Passes — single `FindKey` (size_t overload) bound, returns the const Shape reference handle. |

No other tests in the failing list are blocked on these two gaps; once R1+R2 land the smoke suite goes green end-to-end (excluding the two pre-existing out-of-scope `IntPatch_SpecialPoints` / `BRepMesh_GeomTool` binding-compile failures called out in `docs/research/ocjs-ncollection-and-dts-regressions.md`).
