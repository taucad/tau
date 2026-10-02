---
title: 'OCJS Bindgen `unknown` Coverage Audit'
description: 'Forensic taxonomy of the 4984 `unknown` types in opencascade_full.d.ts and architecturally-correct AST-based bindgen fixes to eliminate them generically'
status: draft
created: '2026-05-15'
updated: '2026-05-15'
category: audit
related:
  - docs/research/ocjs-rbv-blueprint-p0-p1-stocktake.md
  - docs/research/ocjs-rbv-non-copyable-and-integer-overload-dedup.md
  - docs/research/ocjs-v8-bindings-remaining-issues.md
  - docs/research/ocjs-rbv-test-corpus-contract-drift.md
---

# OCJS Bindgen `unknown` Coverage Audit

Forensic stocktake of every code path in `repos/opencascade.js/src/{bindings,buildFromYaml,generateBindings,TuInfo,ocjs_bindgen}.py` that emits `unknown` into the consumer-facing `dist/opencascade_full.d.ts`, with AST-only generic fixes that eliminate each category without manual symbol lists.

## Executive Summary

`dist/opencascade_full.d.ts` contains **4 984 occurrences of the literal token `unknown`** spread across 269 761 lines. Every one is a downgraded type position — embind cannot register the C++ value, so the consumer sees an opaque handle. Tracing each occurrence back through `build/any-type-report.json` (4 446 unbound references + 538 unrecognized templates) yields **seven distinct AST root causes**. All seven can be fixed structurally inside the bindgen pipeline; none require enlarging `bindgen-filters.yaml` or hand-coding symbol tables. The largest single win — recursive inner-class enumeration — unlocks the entire OCCT V8 BRepGraph grouped-view API plus every `Class::Iterator` and `Class::Ops` pattern across OCCT, including ~50 method-bearing inner classes that are currently _runtime-unreachable_ from JS.

## Problem Statement

The OCJS V8 final build ships a TypeScript surface where 4 984 type positions are `unknown`. Some of these are tolerable (excluded classes referenced from method signatures), but the majority indicate types that _should_ be reachable from JS and are not. The same root cause that returns `unknown` in TS also returns an opaque, methodless handle at runtime — so the audit is not just about TS hygiene, it is about API surface area.

The user's directive: identify _every_ AST mechanism that produces `unknown`, recommend _generic_ fixes (no manual lists), and quantify which API categories become reachable after each fix.

## Scope and Non-Goals

**In scope**: AST-driven generic fixes inside `src/*.py` that eliminate `unknown` without per-symbol allowlists.

**Out of scope**:

- Re-binding classes already excluded in `bindgen-filters.yaml` for ABI/ABI-stability reasons (`Storage_BaseDriver`, `BOPAlgo_PaveFiller`, etc.).
- Custom hand-written wrappers in `myMain.h`-style additional code.
- TypeScript post-processing transforms unrelated to the bindgen output.

## Methodology

1. **Quantification** — counted `unknown` by syntactic context using ripgrep against `build-configs/opencascade_full.d.ts`.
2. **Forensic taxonomy** — cross-referenced each context against `build/any-type-report.json`, the JSON debug log emitted by `TypescriptBindings._collect_any` (line 3985 of `src/bindings.py`).
3. **AST trace** — for each category, walked the bindgen path that produced the failure: `TuInfo.allChildrenGenerator` → `generateBindings.process` → `EmbindBindings.processClass` / `TypescriptBindings.processClass` → `TypescriptBindings.resolve_type` → `buildFromYaml._replace_undeclared_with_unknown`.
4. **Cross-validation** — compared per-fragment `.d.ts.json` outputs in `build/bindings/.../*.d.ts.json` against the merged final `.d.ts` to identify post-link rewrites.
5. **OCCT cross-check** — counted the C++ surface that maps to each AST pattern (e.g. `^\s+class\s+\w+` inside bound headers) to size the impact of each fix.

## Findings

### Quantification

| Syntactic context                    | Count | % of total |
| ------------------------------------ | ----: | ---------: |
| Function returns `): unknown;`       | 2 108 |     42.3 % |
| Parameter `: unknown[,)]`            | 2 961 |     59.4 % |
| Top-level `export type X = unknown;` |    57 |      1.1 % |
| Initializer-list `unknown[]`         |    26 |      0.5 % |
| Total occurrences (`\bunknown\b`)    | 4 984 |          — |

| Debug log bucket        | Unique types | Total hits |
| ----------------------- | -----------: | ---------: |
| `unbound_reference`     |          135 |      4 446 |
| `unrecognized_template` |           76 |        538 |

The two debug buckets together (5 stage hits) almost perfectly match the 4 984 `\bunknown\b` count after dedup of property-access vs. type-position appearances.

### Root Cause Taxonomy

Each row maps an AST symptom to the bindgen function that produces `unknown`. Hit counts come from `build/any-type-report.json`.

| #   | Symptom (canonical from log)                                                                                  |                              Hits | AST root cause                                                                                                                                                                                                                                                                                              | Source                                      |
| --- | ------------------------------------------------------------------------------------------------------------- | --------------------------------: | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------- |
| A   | `type-parameter-0-0`, `TheItemType`, `TheKeyType`, `Hasher`, `value_type`, `RefType` …                        |                            ~2 400 | Template parameter pass-through: `resolve_type` reaches `type-parameter-N-N` without a substitution from `templateArgs`.                                                                                                                                                                                    | `bindings.py:4363`                          |
| B   | `BRepGraph::TopoView::FaceOps`, `EdgeOps`, …; OCCT V8 grouped-view inner classes                              | ~150 (TS) + ~50 classes (runtime) | `TuInfo._walk_namespaces` is non-recursive into classes (line 73); `getClassJsPublicName` truncates to one parent (line 466); `_resolve_nested_type` joins one parent only (line 3869).                                                                                                                     | `TuInfo.py`, `bindings.py`                  |
| C   | `IGESData_IGESReaderData`, `Interface_Graph`, `VrmlData_Scene`, `HLRBRep_Surface`, `BOPAlgo_PaveFiller` …     |                              ~750 | Classes excluded by `bindgen-filters.yaml` are referenced by non-excluded methods. The exclusion is honored for _binding_ but the _signature_ still points at the unbound type.                                                                                                                             | `filterPackages.py`, `bindgen-filters.yaml` |
| D   | `typename type-parameter-0-0::ParentId`, `::ChildId`, `::RefId`, `::ChildDef`                                 |                              ~150 | Member typedef of a template parameter (Traits pattern). `_resolve_qualified_member_type` (line 3886) cannot resolve `T::M` when `T` is an unsubstituted template arg.                                                                                                                                      | `bindings.py:3886`                          |
| E   | `BRepGraphInc_BaseRef`, `BRepGraphInc_FaceDef`, … (27 of 57 top-level aliases)                                |                                27 | Cross-fragment stub leakage: `_namespace_scoped_interfaces` accumulates stubs across fragments. Fragment B emits `export type X = unknown;` because `self.exports` is per-fragment, even though fragment A defined `class X`. Link-time `_replace_undeclared_with_unknown` does not drop pre-emitted stubs. | `bindings.py:3706`, `buildFromYaml.py:853`  |
| F   | `NCollection_Array1<TheItemType>`, `NCollection_DynamicArray<RefId>`, `BVH_Box<double, 3>`, `std::bitset<18>` |                               538 | Auto-discovery in `discover.py` walks bound class methods for fully-instantiated NCollection types but cannot follow template-typedef chains where the inner T is a dependent type or non-NCollection.                                                                                                      | `ocjs_bindgen/discover.py:99`               |
| G   | `IFSelect_ActFunc`, `MoniTool_ValueInterpret`, `OSD_Function`, `ShapeProcess_OperFunc`                        |                                ~7 | Function-pointer typedef. `resolve_type` has no `FUNCTIONPROTO` branch, so the fallback returns `unknown`.                                                                                                                                                                                                  | `bindings.py:4363`                          |

### Finding 1: Template parameter pass-through (root cause A) is the single largest contributor

**~2 400 of 4 984 hits** (48 %). Every one is a method on a _template_ class whose return or parameter is the template parameter `T` (or a derived form like `const T&`). Sample:

| Symptom                                                   | Hits | OCCT origin                                                 |
| --------------------------------------------------------- | ---: | ----------------------------------------------------------- |
| `const_reference (canonical: const type-parameter-0-0 &)` |  647 | NCollection_Array1, NCollection_Sequence, NCollection_List  |
| `reference (canonical: type-parameter-0-0 &)`             |  640 | Same — non-const overloads                                  |
| `const TheItemType (canonical: const type-parameter-0-0)` |  639 | NCollection element accessors                               |
| `TheItemType (canonical: type-parameter-0-0)`             |  200 | Same                                                        |
| `const TheKeyType (canonical: const type-parameter-0-0)`  |  150 | NCollection_Map, NCollection_DataMap                        |
| `const Hasher (canonical: const type-parameter-0-2)`      |  120 | NCollection_Map, NCollection_DataMap, NCollection_DoubleMap |

The bindgen _does_ know how to substitute when it processes a template alias via `processTemplate` (`generateBindings.py:261`) — `templateArgs` is built and threaded through `resolve_type`. The failure mode is the **enclosing-class processing path**: when `processClass` encounters an inherited method from a base class template, the inherited method's AST cursor still references `type-parameter-0-0` and `_resolve_template_type` cannot resolve it because the substitution map is keyed by the _base_ template's parameter name (`TheItemType`), not the canonical `type-parameter-N-N` form.

`bindings.py:1226` (`_substitute_canonical_template_names`) attempts this rewrite for the C++ side — there is no symmetric path on the TypeScript side for inherited methods.

### Finding 2: Inner classes are completely invisible to the AST walker (root cause B)

`src/TuInfo.py:73-86` is annotated:

> "This is intentionally NON-recursive. Doubly-nested namespaces (`Outer::Inner::Type`) are out of scope for the current namespace-aware bindgen — `getClassJsPublicName` only encodes the IMMEDIATE parent namespace as the `Namespace_TypeName` prefix, so admitting deeper types here produces a JS public name that doesn't match the C++ binding's `class_<Outer::Inner::Type>("Inner_Type")` reference and the binding fails with `use of undeclared identifier 'Inner'` at compile time. Recursing into nested namespaces would require the helper, the JS public-name encoder, AND every emit site to agree on a multi-level mangling scheme — **deferred until a real consumer surfaces.**"

OCCT V8's BRepGraph grouped-view API is that consumer. `BRepGraph::TopoView` exposes 14 methods that each return an inner `*Ops` class:

```
class FaceOps      class WireOps       class CompoundOps
class EdgeOps      class ShellOps      class CompSolidOps
class VertexOps    class SolidOps      class ProductOps
class CoEdgeOps    class OccurrenceOps class GenOps
class GeometryOps  class PolyOps
```

`BRepGraph::RefsView`, `ShapesView`, `EditorView`, `MeshView`, `UIDsView`, `CacheView`, `BuilderView` follow the same pattern. The per-fragment .d.ts.json correctly emits `Faces(): TopoView_FaceOps`, but `TopoView_FaceOps` is _never declared_ (no `.cpp` is generated for it because `allChildrenGenerator` doesn't recurse into class bodies), so the link-time `_replace_undeclared_with_unknown` rewrites it to `unknown`.

**Runtime impact**: with `allow_raw_pointers()`, the `class_<BRepGraph::TopoView>` registration accepts the binding even though `FaceOps` has no `class_<>` entry — but at call time, embind has nothing to wrap the returned `FaceOps&` with. The JS caller receives an opaque numeric pointer. **`graph.Topo().Faces().Nb()` throws `TypeError: faces.Nb is not a function`**. Every method on every inner class is unreachable today.

### Finding 3: Excluded classes leak via signatures of non-excluded classes (root cause C)

The exclusion lists in `bindgen-filters.yaml:9-455` cover ~165 explicit class names plus ~37 prefix patterns. When excluded class `IGESData_IGESReaderData` appears as a parameter type of _bound_ class `IGESData_GlobalSection::Read(IGESData_IGESReaderData& reader)`, the binding pipeline:

1. Skips emitting a binding for `IGESData_IGESReaderData` (correct — it's excluded).
2. Still emits the `Read(reader: IGESData_IGESReaderData)` signature in the per-fragment .d.ts.json.
3. Link-time `_replace_undeclared_with_unknown` cannot find `IGESData_IGESReaderData` in `declared_names`, rewrites to `unknown`.

This is a **symptom amplifier**, not an independent bug — fixing it requires either (a) re-enabling the underlying class binding (out of scope; ABI reasons), or (b) AST-driven _method-level_ filtering: when any param/return type resolves to an excluded class, drop the method from the signature instead of leaving the type as `unknown`. Path (b) is feasible and generic.

| Excluded class                          | Hits | Causes excluded for             |
| --------------------------------------- | ---: | ------------------------------- |
| `IGESData_IGESReaderData`               |  156 | Abstract / private constructors |
| `IGESData_ParamReader`                  |  153 | Abstract / private constructors |
| `Interface_Graph`                       |   53 | Compilation errors              |
| `VrmlData_Scene`                        |   42 | Compilation errors              |
| `HLRBRep_Surface`                       |   41 | Undefined symbols               |
| `IFSelect_EditForm`                     |   36 | Undefined symbols               |
| `IFSelect_IntParam`                     |   34 | Undefined symbols               |
| `Message_Messenger`                     |   33 | Compilation errors              |
| `VrmlData_Node`                         |   33 | Compilation errors              |
| `IntCurveSurface_ThePolyhedronOfHInter` |   27 | Undefined symbols               |
| `HLRBRep_ThePolyhedronOfInterCSurf`     |   27 | Undefined symbols               |
| `IFSelect_ContextModif`                 |   23 | Undefined symbols               |
| `IntPatch_Polyhedron`                   |   20 | Undefined symbols               |
| `BOPAlgo_PaveFiller`                    |   17 | Abstract / deleted ctors        |
| `Intf_SectionPoint`                     |   17 | OCCT V8 specific                |
| `Image_Texture`                         |   17 | Visualization stack             |

### Finding 4: Member typedefs through Traits cannot resolve (root cause D)

OCCT V8's BRepGraph_ReverseIterator family uses C++ traits-based generic programming:

```cpp
template <class TraitsT>
class BRepGraph_ReverseIterator {
  using ParentId = typename TraitsT::ParentId;
  using ChildId  = typename TraitsT::ChildId;
  using RefId    = typename TraitsT::RefId;
  // ...
};
```

When `_resolve_qualified_member_type` (`bindings.py:3886`) is asked to resolve `typename TraitsT::ParentId`, it does:

```python
parent_name, member_name = parts[0], parts[1]   # "TraitsT", "ParentId"
combined = parent_name + "_" + member_name      # "TraitsT_ParentId"
if combined in self.exports: return combined    # No
class_cursor = self.tuInfo.classDict.get(parent_name)  # None — TraitsT is a template param
return None
```

Hits ~150. Affected APIs: every `.Current()`, `.CurrentParent()`, `.CurrentChild()`, `.CurrentRef()` method on `BRepGraph_ReverseIterator<*>` aliases (`FacesOfEdge`, `WiresOfEdge`, `CompoundsOfFace`, etc.). The bindgen needs to consult the **template-arg substitution map** for `TraitsT` first, _then_ resolve the member typedef on the resolved concrete type.

### Finding 5: Cross-fragment stub leakage (root cause E)

The TypeScript binder uses two class-level sets (`bindings.py:3863-3867`):

```python
_namespace_scoped_interfaces = set()  # accumulates across all fragments
_emitted_stub_names = set()           # accumulates across all fragments
```

Per-fragment `processFinalizeClass` (`bindings.py:3699`) emits stubs:

```python
for iface_name in sorted(TypescriptBindings._namespace_scoped_interfaces):
  if iface_name in self.exports or iface_name in TypescriptBindings._emitted_stub_names:
    continue
  output += "export type " + iface_name + " = unknown;\n\n"
```

The `self.exports` check is **per-fragment**. If fragment A defines `class BRepGraphInc_BaseRef` (so `A.exports` contains it) and fragment B references the type (adding it to `_namespace_scoped_interfaces`), fragment B's `processFinalizeClass` sees `iface_name not in B.exports` and emits `export type BRepGraphInc_BaseRef = unknown;`. The merged .d.ts contains _both_ `class BRepGraphInc_BaseRef` (from A) and `type BRepGraphInc_BaseRef = unknown` (from B).

Verified manually:

```
185892:export declare class BRepGraphInc_BaseRef {           # from BRepGraphInc_Reference
186612:export type BRepGraphInc_BaseRef = unknown;           # from BRepGraphInc_Storage
```

This affects **27 of the 57 top-level `export type X = unknown` aliases** (every BRepGraphInc**). The link-time pass `_replace_undeclared_with_unknown` (`buildFromYaml.py:72`) only *rewrites\* references in type positions — it does not drop pre-emitted alias declarations. The TypeScript compiler resolves the merged-namespace pair to `unknown` (declaration merging weakens the class declaration), which is why `BRepGraphInc*\*` types appear non-functional in consumer code despite the underlying class being correctly bound.

### Finding 6: NCollection auto-discovery template-arg gap (root cause F)

`ocjs_bindgen/discover.py` scans bound class method signatures for _fully-instantiated_ `NCollection_<Container><T>` types, generates `using` declarations, and writes `build/ncollection-manifest.json`. The walker explicitly rejects template-dependent arguments via `_is_globally_accessible` (line 75-96):

```python
if parent.kind == clang.cindex.CursorKind.CLASS_DECL:
    return False
if parent.kind == clang.cindex.CursorKind.STRUCT_DECL:
    return False
return True
```

So `NCollection_DynamicArray<RefId>` where `RefId` is a member typedef of a class is rejected. That cuts 538 template references to `unknown`. Sample failures:

| Pattern                                                    | Hits | Why rejected                      |
| ---------------------------------------------------------- | ---: | --------------------------------- |
| `NCollection_Array1<type-parameter-0-0>`                   |  140 | `T` is template parameter         |
| `NCollection_Array1<type-parameter-0-0>` non-const         |   70 | Same                              |
| `NCollection_Sequence<type-parameter-0-0>` const+non-const |   76 | Same                              |
| `NCollection_DynamicArray<RefId>`                          |   21 | RefId is a class member typedef   |
| `NCollection_DynamicArray<TypedIdT>`                       |   18 | Template parameter inside Typed<> |
| `NCollection_Array2<type-parameter-0-0>`                   |   24 | Same                              |
| `std::bitset<18>`                                          |   17 | Not in `NCOLLECTION_CONTAINERS`   |
| `BVH_Box<double, 3>`                                       |    5 | Not in container set              |

### Finding 7: Function-pointer typedefs collapse to `unknown` (root cause G)

OCCT exposes a small number of C-style function pointer typedefs as method parameters or static members:

```cpp
typedef IFSelect_ReturnStatus (*IFSelect_ActFunc)(const Handle(IFSelect_SessionPilot)&);
typedef Handle(TCollection_HAsciiString) (*MoniTool_ValueInterpret)(...);
typedef bool (*ShapeProcess_OperFunc)(const Handle(ShapeProcess_Context)&, const Message_ProgressRange&);
```

`resolve_type` has no `clang.cindex.TypeKind.FUNCTIONPROTO` / `POINTER` → `FUNCTIONPROTO` branch, so the canonical spelling `IFSelect_ReturnStatus (*const)(...)` falls through to `unknown`. Hit count is small (~7) but trivially fixable.

### Finding 8: Initializer-list constructors are typed `unknown[]`

The 26 `unknown[]` occurrences are NCollection container constructors taking `std::initializer_list<T>` where `T` is the template parameter:

```typescript
constructor(theInitList: unknown[]);
constructor(theInitList: unknown[], theAllocator?: NCollection_BaseAllocator);
```

Same root cause as A — once template arg substitution propagates correctly, these become `T[]`.

## Recommendations

All recommendations are AST-only, generic, and require no manual symbol tables. Listed in priority order by `unknown` reduction × runtime API unlock.

| #   | Action                                                                                                                                                                                                                                                           | Hits resolved | Runtime API unlocked                                                                      | Priority | Effort |
| --- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------: | ----------------------------------------------------------------------------------------- | -------- | ------ |
| R1  | **Recursive class-cursor enumeration** in `TuInfo.allChildrenGenerator` + multi-level `getClassJsPublicName` + symmetric `_resolve_nested_type`                                                                                                                  |     ~150 (TS) | All BRepGraph V8 grouped views (~70 inner classes) + `Class::Iterator` patterns OCCT-wide | P0       | M      |
| R2  | **Template-arg substitution propagation** through inherited methods: thread `templateArgs` from `processClass` into the AST walk for parent-class methods, key the substitution map by both source name (`TheItemType`) and canonical (`type-parameter-N-N`)     |        ~2 400 | All NCollection element accessors / iterators                                             | P0       | M      |
| R3  | **Method-level signature filtering**: when any param/return resolves to an excluded class, drop the method from the binding instead of leaving the signature with `unknown`                                                                                      |          ~750 | (cleaner API, no surface change)                                                          | P1       | S      |
| R4  | **Member-typedef-through-Traits resolution**: in `_resolve_qualified_member_type`, consult `templateArgs` for the parent name first, then resolve the member on the substituted type                                                                             |          ~150 | BRepGraph_ReverseIterator family (`FacesOfEdge`, etc.)                                    | P1       | S      |
| R5  | **Recursive NCollection auto-discovery**: in `discover.py`, accept template-dependent argument types when the enclosing class is itself instantiated via a template typedef; instantiate the discovered NCollection<DependentT> for each known instantiation     |          ~538 | Trait-typed NCollection containers                                                        | P1       | M      |
| R6  | **Cross-fragment stub elimination**: in `buildFromYaml._replace_undeclared_with_unknown`, after computing `declared_names`, also drop `^export\s+type\s+(\w+)\s*=\s*unknown\s*;` declarations whose name is in `declared_names`. Idempotent, no false positives. |            27 | Removes `BRepGraphInc_*` duplicate-decl masking                                           | P1       | XS     |
| R7  | **Function-pointer typedef rendering**: add a `FUNCTIONPROTO` branch to `resolve_type` that emits `(arg: A, …) => R`. Fall back to `unknown` only for varargs / unresolvable inner types                                                                         |            ~7 | (TS-only)                                                                                 | P2       | XS     |

### R1: Recursive class-cursor enumeration (architecturally most impactful)

Three coordinated edits, all generic:

#### R1.a — `src/TuInfo.py`

Add a recursive class walker; compose into `allChildrenGenerator`:

```python
def _walk_classes(cursor, predicate, results):
    """Recursive walker: descend into PUBLIC class/struct bodies to discover inner declarations."""
    current_access = clang.cindex.AccessSpecifier.PUBLIC
    for child in cursor.get_children():
        if child.kind == clang.cindex.CursorKind.CXX_ACCESS_SPEC_DECL:
            current_access = child.access_specifier
            continue
        if current_access != clang.cindex.AccessSpecifier.PUBLIC:
            continue
        if child.kind in (clang.cindex.CursorKind.CLASS_DECL, clang.cindex.CursorKind.STRUCT_DECL):
            predicate(child, results)
            _walk_classes(child, predicate, results)  # depth N

def allChildrenGenerator(tu):
    flat = list(tu.cursor.get_children())
    descended = []

    def _collect(child, out):
        if child.kind in (clang.cindex.CursorKind.CLASS_DECL, clang.cindex.CursorKind.STRUCT_DECL):
            out.append(child)

    for top in flat:
        if top.kind == clang.cindex.CursorKind.NAMESPACE and top.spelling and top.spelling not in _SKIPPED_NAMESPACES:
            _walk_namespaces(top, _collect, descended)
        if top.kind in (clang.cindex.CursorKind.CLASS_DECL, clang.cindex.CursorKind.STRUCT_DECL):
            _walk_classes(top, _collect, descended)

    for n in flat:
        if n.kind == clang.cindex.CursorKind.NAMESPACE and n.spelling and n.spelling not in _SKIPPED_NAMESPACES:
            for grand in n.get_children():
                if grand.kind in (clang.cindex.CursorKind.CLASS_DECL, clang.cindex.CursorKind.STRUCT_DECL):
                    _walk_classes(grand, _collect, descended)

    return flat + descended
```

Recursion is unbounded by design — a depth limit would be a manual rule. The `PUBLIC` access guard is the only exclusion criterion and is purely AST-driven (`CXX_ACCESS_SPEC_DECL` cursors are direct AST nodes, not metadata).

#### R1.b — `src/bindings.py:getClassJsPublicName`

Walk the full `semantic_parent` chain up to the namespace boundary:

```python
def getClassJsPublicName(theClass, templateDecl=None):
    if templateDecl is not None:
        return templateDecl.spelling
    parts = [theClass.spelling]
    cur = theClass.semantic_parent
    while cur and cur.kind in (
        clang.cindex.CursorKind.CLASS_DECL,
        clang.cindex.CursorKind.STRUCT_DECL,
        clang.cindex.CursorKind.CLASS_TEMPLATE,
    ):
        parts.insert(0, cur.spelling)
        cur = cur.semantic_parent
    if cur and cur.kind == clang.cindex.CursorKind.NAMESPACE and cur.spelling \
       and cur.spelling not in _STDLIB_NAMESPACES:
        parts.insert(0, cur.spelling)
    return "_".join(p for p in parts if p)
```

`getClassCppName` (also in `bindings.py`) already walks the full chain — only the JS-side encoder is truncated.

#### R1.c — `src/bindings.py:_resolve_nested_type`

Mirror the encoder change so resolved type names match emitted public names:

```python
def _resolve_nested_type(self, decl):
    if not decl or decl.spelling == "":
        return None
    if decl.kind not in (
        clang.cindex.CursorKind.ENUM_DECL,
        clang.cindex.CursorKind.CLASS_DECL,
        clang.cindex.CursorKind.STRUCT_DECL,
    ):
        return None
    parts = [decl.spelling]
    cur = decl.semantic_parent
    while cur and cur.kind in (
        clang.cindex.CursorKind.CLASS_DECL,
        clang.cindex.CursorKind.STRUCT_DECL,
        clang.cindex.CursorKind.CLASS_TEMPLATE,
    ):
        parts.insert(0, cur.spelling)
        cur = cur.semantic_parent
    if cur and cur.kind == clang.cindex.CursorKind.NAMESPACE and cur.spelling \
       and cur.spelling not in _STDLIB_NAMESPACES:
        parts.insert(0, cur.spelling)
        TypescriptBindings._namespace_scoped_interfaces.add("_".join(parts))
    return "_".join(parts)
```

#### R1 deliverables (verifiable)

- Per-fragment .cpp count grows by ~50 (one per inner class) — verifiable via `find build/bindings -name "*.cpp" | wc -l` before/after.
- `dist/opencascade_full.d.ts` loses ~150 `unknown` from inner-Ops returns; gains ~50 `export declare class` blocks for inner classes.
- Runtime: `oc.BRepGraph.Topo().Faces().Nb()` works.

### R2: Template-arg substitution propagation

The substitution table is built correctly in `processTemplate` (`generateBindings.py:261-331`), then threaded through `processClass(theClass, templateDecl, templateArgs)`. The leak is in **inherited method processing**: when `_processBaseMethods` walks the base-class methods, it reuses the parent's `templateArgs` — but the parent template's parameter names (e.g. `TheItemType` for `NCollection_Array1`) differ from the canonical `type-parameter-N-N` form that libclang reports for the inherited method's argument types.

Fix: when entering the inherited-method path, augment `templateArgs` with canonical-form keys derived from the parent template's parameter ordinal positions:

```python
def _augment_template_args_with_canonical(templateArgs, templateClass):
    """Add type-parameter-N-N keys to the substitution map, derived from ordinal position."""
    augmented = dict(templateArgs)
    template_params = [
        c for c in templateClass.get_children()
        if c.kind in (
            clang.cindex.CursorKind.TEMPLATE_TYPE_PARAMETER,
            clang.cindex.CursorKind.TEMPLATE_NON_TYPE_PARAMETER,
        )
    ]
    for ordinal, param in enumerate(template_params):
        if param.spelling in templateArgs:
            canonical_key = f"type-parameter-0-{ordinal}"
            augmented[canonical_key] = templateArgs[param.spelling]
    return augmented
```

Use the augmented map at every call site in `resolve_type` / `_resolve_template_type` / `_resolve_qualified_member_type`. The parameter-name and canonical-name aliases both resolve to the same substituted type.

### R3: Method-level signature filtering

Augment `filterMethodOrProperty` to consult the eventual `resolve_type` result for every parameter/return type. If any resolves to `unknown` _because_ the underlying class is in the bindgen exclusion set (vs. being structurally unresolvable), drop the method.

To stay generic, the check is: "does the canonical type name match any class that `filterPackages` or `filterClass` rejects?" — both are AST-driven predicates, not lookups. No new manual list.

### R4: Member-typedef-through-Traits resolution

In `_resolve_qualified_member_type`, before falling through, consult `templateArgs`:

```python
def _resolve_qualified_member_type(self, resolved, templateDecl=None, templateArgs=None):
    # ... existing parsing ...
    parent_name, member_name = parts
    if templateArgs and parent_name in templateArgs:
        substituted_parent = templateArgs[parent_name]
        if hasattr(substituted_parent, "get_declaration"):
            real_parent_decl = substituted_parent.get_declaration()
            if real_parent_decl and real_parent_decl.spelling:
                # Walk real_parent_decl for member typedef matching member_name
                for child in real_parent_decl.get_children():
                    if child.kind in (
                        clang.cindex.CursorKind.TYPEDEF_DECL,
                        clang.cindex.CursorKind.TYPE_ALIAS_DECL,
                    ) and child.spelling == member_name:
                        return self.resolve_type(child.underlying_typedef_type, templateDecl, templateArgs)
    # ... existing fallback ...
```

### R5: Recursive NCollection auto-discovery

`discover.py` currently rejects template-dependent arguments. Lift the rejection when the enclosing class is _itself_ an instantiated template (a template typedef in `tuInfo.templateTypedefs`). For each instantiation, substitute the template arg into the discovered NCollection signature and re-emit a `using` declaration:

```python
def discover_ncollection_types(tuInfo, filterClasses, customBuild=False):
    needed = {}
    # First pass: collect from non-template classes (existing behavior)
    for child in tuInfo.allChildren:
        if not filterClasses(child, customBuild):
            continue
        for method in child.get_children():
            if method.kind not in METHOD_KINDS:
                continue
            for arg in method.get_arguments():
                _scan_type_for_ncollection(arg.type, needed)
            _scan_type_for_ncollection(method.result_type, needed)

    # Second pass: walk template typedefs, substitute, re-scan
    for td in tuInfo.templateTypedefs:
        templateClass, templateArgs = processTemplate(td)
        for method in templateClass.get_children():
            if method.kind not in METHOD_KINDS:
                continue
            for arg in method.get_arguments():
                substituted = _substitute_template_arg(arg.type, templateArgs)
                _scan_type_for_ncollection(substituted, needed)
            substituted_ret = _substitute_template_arg(method.result_type, templateArgs)
            _scan_type_for_ncollection(substituted_ret, needed)

    return needed
```

The substitution helper reuses the augmented-canonical-keys map from R2 so the dependent-type detection becomes resolvable. Newly-discovered instantiations enter `ncollection-manifest.json` automatically — the symbol enumerator picks them up at link time without further edits.

### R6: Cross-fragment stub elimination (lowest effort, immediate win)

Three lines of regex inside `_replace_undeclared_with_unknown`:

```python
def _drop_redundant_unknown_aliases(source: str, declared_names: set) -> str:
    """Drop `export type X = unknown;` declarations whose name is also a real class export."""
    pattern = re.compile(r"^export\s+type\s+([A-Za-z_][A-Za-z0-9_]*)\s*=\s*unknown\s*;\s*$\n?", re.MULTILINE)
    def _filter(m):
        return "" if m.group(1) in declared_names else m.group(0)
    return pattern.sub(_filter, source)
```

Call after `declared_names` is computed (`buildFromYaml.py:846-852`), before `_replace_undeclared_with_unknown`. Drops 27 BRepGraphInc duplicates plus any future cross-fragment leakage.

### R7: Function-pointer typedef rendering

Add a branch to `resolve_type`:

```python
def resolve_type(self, clang_type, templateDecl=None, templateArgs=None):
    # ... existing handle / array / template handling ...
    t = self._strip_qualifiers(clang_type)
    if t.kind == clang.cindex.TypeKind.POINTER:
        pointee = t.get_pointee()
        if pointee.kind == clang.cindex.TypeKind.FUNCTIONPROTO:
            return self._render_function_proto(pointee, templateDecl, templateArgs)
    if t.kind == clang.cindex.TypeKind.FUNCTIONPROTO:
        return self._render_function_proto(t, templateDecl, templateArgs)
    # ... existing fallback ...

def _render_function_proto(self, proto, templateDecl, templateArgs):
    arg_types = [self.resolve_type(proto.argument_types()[i], templateDecl, templateArgs)
                 for i in range(proto.argument_types().__len__())]
    ret_ts = self.resolve_type(proto.get_result(), templateDecl, templateArgs)
    args_ts = ", ".join(f"arg{i}: {at}" for i, at in enumerate(arg_types))
    return f"(({args_ts}) => {ret_ts})"
```

## Trade-offs

| Concern                                                 | Cost                                                                                          | Mitigation                                                                                            |
| ------------------------------------------------------- | --------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------- |
| Build time grows                                        | ~50–100 extra .cpp files per build configuration (R1)                                         | Negligible — Nx parallel compile; existing per-class files dominate cost                              |
| Symbol surface bloat                                    | New inner-class symbols enter the link manifest                                               | `enumerate-symbols.py` already auto-discovers; no manual edit needed                                  |
| Stable JS public-name churn                             | `BRepGraph_TopoView_FaceOps` is longer than the truncated `TopoView_FaceOps`                  | Acceptable — TopoView_FaceOps was _never reachable_ before; no consumer depends on the truncated name |
| Template-arg propagation may surface latent type errors | Some inherited-method bindings may flip from accidental-success-via-unknown to typed mismatch | Treat as a quality improvement; fix the underlying mismatch on a case-by-case basis as they surface   |
| R3 may drop methods consumers expect                    | Methods whose param/return resolve to excluded classes get dropped silently                   | Emit a `// dropped: param X resolves to excluded type` JSDoc for transparency                         |

## Diagrams

```
┌────────────────────────────────────────────────────────────────────┐
│                    Bindgen Pipeline (current)                      │
└────────────────────────────────────────────────────────────────────┘

  myMain.h (TU)
        │
        ▼
  ┌───────────────────────┐
  │  TuInfo.parse(tu)     │
  └─────────┬─────────────┘
            │
            ▼
  ┌─────────────────────────────────────┐
  │  allChildrenGenerator(tu)           │
  │  ─ TU top-level CLASS_DECL          │
  │  ─ namespace-direct CLASS_DECL      │
  │  ╳ class-nested CLASS_DECL ←──┐     │  ← R1 missing recursion (root cause B)
  └─────────┬───────────────────────────┘
            │
            ▼
  ┌─────────────────────────────────────┐
  │  EmbindBindings.processClass        │  → emits .cpp for each enumerated class
  │  TypescriptBindings.processClass    │  → emits .d.ts.json (per fragment)
  │                                     │
  │  resolve_type(...)                  │
  │  ├─ _resolve_handle_recursive       │
  │  ├─ _strip_qualifiers               │
  │  ├─ _resolve_template_type   ←──┐   │  ← R2 missing canonical-key sub (root cause A)
  │  ├─ _resolve_nested_type     ←─┐│   │  ← R1c single-level join (root cause B)
  │  ├─ _resolve_qualified_member ←┘│   │  ← R4 missing trait sub (root cause D)
  │  └─ canonical fallback → unknown │   │  ← R7 no FUNCTIONPROTO branch (root cause G)
  │                                  │   │
  │  processFinalizeClass            │   │
  │   └─ emit `type X = unknown;` ←──┘   │  ← R5 cross-fragment leakage (root cause E)
  └─────────┬───────────────────────────┘
            │
            ▼
  ┌─────────────────────────────────────┐
  │  buildFromYaml.linkAllFragments     │
  │  ─ merge per-fragment .d.ts.json    │
  │  ─ _replace_undeclared_with_unknown │  ← rewrites refs (root cause C amplifier)
  │    ╳ does not drop pre-emitted     │  ← R6 missing alias dedup
  │       `type X = unknown` aliases   │
  └─────────┬───────────────────────────┘
            │
            ▼
  dist/opencascade_full.d.ts  (4 984 `unknown`)
```

## Code Examples

### Demonstration: BRepGraph V8 inner class is unreachable today

```typescript
import init from '@taucad/opencascade.js';
const oc = await init();

const graph = new oc.BRepGraph();
const builder = oc.BRepGraph_Builder.Add(graph, someShape);

// .Topo() works — TopoView IS bound at file scope
const topo = graph.Topo(); // type: unknown (root cause E + B)
const topoTyped = topo as oc.TopoView;

// .Faces() returns FaceOps — but FaceOps has no class_<> registration
const faces = topoTyped.Faces(); // type: unknown (root cause B)
const n = (faces as any).Nb(); // RUNTIME: TypeError: faces.Nb is not a function
```

After R1 lands, `faces` is typed `oc.BRepGraph_TopoView_FaceOps` and the `Nb()` call works.

### Demonstration: NCollection element accessor returns `unknown` for all element types

```typescript
const arr = new oc.NCollection_Array1_gp_Pnt(0, 9);
const pt = arr.Value(3); // type: unknown (root cause A)
const pt2 = arr.ChangeValue(3); // type: unknown (root cause A)
```

After R2 lands, both return `gp_Pnt`.

## References

- `repos/opencascade.js/src/bindings.py` — main bindgen logic
- `repos/opencascade.js/src/TuInfo.py` — AST cursor enumeration
- `repos/opencascade.js/src/buildFromYaml.py` — link-time fragment merging
- `repos/opencascade.js/src/generateBindings.py` — pipeline orchestrator
- `repos/opencascade.js/src/ocjs_bindgen/discover.py` — NCollection auto-discovery
- `repos/opencascade.js/build/any-type-report.json` — debug log (generated each build)
- `repos/opencascade.js/bindgen-filters.yaml` — class/method/package exclusion config
- Related: `docs/research/ocjs-rbv-blueprint-p0-p1-stocktake.md` — RBV pipeline design
- Related: `docs/research/ocjs-v8-bindings-remaining-issues.md` — open V8 binding gaps

## Appendix A: Top-level `export type X = unknown` aliases (all 57)

| Prefix           | Count | Cause                                              | Cleared by                    |
| ---------------- | ----: | -------------------------------------------------- | ----------------------------- |
| `BRepGraphInc_*` |    27 | Cross-fragment stub leakage (E)                    | R6                            |
| `BRepGraph_*`    |    11 | Mix of E + missing template typedefs (F)           | R5 + R6                       |
| `MathOpt_*`      |     5 | Excluded MathOpt enums                             | R3 (drop methods using these) |
| `ExtremaPC_*`    |     4 | Namespace-scoped result types only partially bound | R1 (recursion)                |
| `Geom2dEval_*`   |     3 | Same                                               | R1                            |
| `MathUtils_*`    |     2 | Same                                               | R1                            |
| `GeomEval_*`     |     2 | Same                                               | R1                            |
| `MathRoot_*`     |     1 | Excluded — drop                                    | R3                            |
| `std_type_info`  |     1 | std namespace; expected `unknown`                  | (intentional)                 |
| Other            |     1 | Misc                                               | mixed                         |

## Appendix B: Per-package impact summary

| Package                             | Inner classes (~) | Affected methods | Fixed by |
| ----------------------------------- | ----------------: | ---------------- | -------- |
| TKBRep / BRepGraph (V8)             |               ~70 | ~150             | R1       |
| TKernel / NCollection               |               ~40 | ~2 400           | R1 + R2  |
| TKBRep / BRepGraphInc               |                ~0 | 27 (alias dedup) | R6       |
| TKMath (Extrema*, Math*)            |               ~15 | ~50              | R1 + R3  |
| TKMath (Trait families)             |                ~0 | ~150             | R4       |
| TKBRep / BRepGraph (traits aliases) |                ~0 | ~150             | R4 + R5  |
| Excluded-class amplifier            |                 — | ~750             | R3       |

## Appendix C: Verification commands

After implementing R1–R7, verify with:

```bash
# Should drop from 4984 to <500
rg -c '\bunknown\b' dist/opencascade_full.d.ts

# Should be empty (root cause E gone)
rg -c '^export type \w+ = unknown' dist/opencascade_full.d.ts

# Should drop from ~2100 to <100
rg -c '\): unknown[;[]' dist/opencascade_full.d.ts

# Smoke: BRepGraph TopoView roundtrip works
pnpm test:smoke -- smoke-brep-graph
```

The `dist` count target of `<500` accounts for the residual ~750 excluded-class amplifier (R3) — full elimination requires either re-binding those classes (out of scope) or accepting the method-level drop.
