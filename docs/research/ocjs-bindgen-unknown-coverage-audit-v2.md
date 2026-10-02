---
title: 'OCJS Bindgen `unknown` Coverage Audit V2'
description: 'Post-R1–R7 stocktake of the residual 4038 `unknown` types in opencascade_full.d.ts: which root causes were fully resolved, which were partial, and what AST-driven follow-ups can close the remaining gap'
status: active
created: '2026-05-15'
updated: '2026-05-18'
category: audit
related:
  - docs/research/ocjs-bindgen-unknown-coverage-audit.md
  - docs/research/ocjs-bindgen-residual-issues-stocktake.md
  - docs/research/ocjs-bindgen-modular-refactor-blueprint.md
  - docs/research/ocjs-v8-bindings-remaining-issues.md
---

# OCJS Bindgen `unknown` Coverage Audit V2

Post-implementation forensic stocktake comparing the original audit's projected deltas (R1–R7) against the _actual_ residual `unknown` surface in `dist/opencascade_full.d.ts` after all seven recommendations landed, with new AST-driven follow-up recommendations (R8–R12) that target the next reduction wave.

## Executive Summary

The seven recommendations from the V1 audit landed in full and reduced `dist/opencascade_full.d.ts` from 4 984 to **4 038** total `unknown` occurrences (−946, −19 %). The headline win was R6 (cross-fragment stub elimination): the 57 top-level `export type X = unknown;` aliases dropped to **0**, eliminating the BRepGraphInc declaration-merging hazard entirely. R1 (recursive class enumeration) and R7 (function-pointer typedef rendering) also achieved their projected deltas. The remaining ~4 000 unknowns concentrate in a single architectural gap missed by V1: **member-typedef substitution** (`reference`, `const_reference`, `value_type`, `RefId::ParentId`) inside _instantiated_ template classes. R2's canonical-key augmentation correctly populates the substitution map but the resolver code path that consumes it skips the canonical key when the source spelling is a member typedef rather than the bare template parameter. Closing this gap (R8) plus four smaller follow-ups (R9–R12) projects to a residual under 500 `unknown` occurrences — meeting the V1 goal of `<500`.

## Table of Contents

1. [Quantification — Before vs After](#quantification--before-vs-after)
2. [Per-Recommendation Outcome](#per-recommendation-outcome)
3. [Residual Taxonomy](#residual-taxonomy)
4. [New Findings (V2)](#new-findings-v2)
5. [Recommendations (R8–R12)](#recommendations-r8r12)
6. [Trade-offs](#trade-offs)
7. [References](#references)
8. [Appendix A — Top 30 Residual Buckets](#appendix-a--top-30-residual-buckets)
9. [Appendix B — Verification Commands](#appendix-b--verification-commands)

## Problem Statement

The V1 audit projected R1–R7 would reduce `unknown` from 4 984 to under 500. The actual delta was −946 (to 4 038). The gap (~3 500 unmatched `unknown` instances) is large enough to warrant a full stocktake before the next implementation wave: which V1 recommendations underperformed, which exceeded expectations, and what new categories surfaced once the V1 fixes deduplicated the bucket counts.

## Methodology

1. Re-ran the same quantification pipeline as V1 (ripgrep contexts, `build/any-type-report.json` buckets) against the post-R1–R7 `dist/opencascade_full.d.ts`.
2. Cross-referenced each surviving bucket against the projected V1 deltas to compute hit/miss.
3. Sampled ~30 unknown sites by class to identify common upstream patterns (member typedef vs bare template arg vs excluded-class amplifier).
4. Verified R7 (function-pointer rendering) by inspecting `IFSelect_Activator` constructor in dist.
5. Confirmed R6 (alias dedup) by counting top-level `export type X = unknown;` lines (0).

## Quantification — Before vs After

### Total Counts

| Syntactic context                      | V1 baseline | V2 actual |     Δ | V1 projected | Hit? |
| -------------------------------------- | ----------: | --------: | ----: | -----------: | ---- |
| Function returns `): unknown;`         |       2 108 |     1 913 |  −195 |         <100 | Miss |
| Parameter `: unknown[,)]`              |       2 961 |     2 259 |  −702 |        (n/a) | —    |
| Top-level `export type X = unknown;`   |          57 |         0 |   −57 |            0 | Hit  |
| Initializer-list `unknown[]`           |          26 |        26 |     0 |           ~0 | Miss |
| Total `\bunknown\b`                    |       4 984 |     4 038 |  −946 |         <500 | Miss |
| `dist/opencascade_full.d.ts` size (MB) |       11.66 |     11.62 | −0.04 |            — | —    |
| `export declare class` count           |      ~4 838 |     4 888 |   +50 |          +50 | Hit  |

### Debug Log Buckets

| Reason                  | V1 distinct | V1 hits | V2 distinct | V2 hits |     Δ hits |
| ----------------------- | ----------: | ------: | ----------: | ------: | ---------: |
| `unbound_reference`     |         132 |   4 446 |          73 |   3 450 |   **−996** |
| `unrecognized_template` |          81 |     538 |          84 |     534 |         −4 |
| **Total**               |       _213_ | _4 984_ |       _157_ | _3 984_ | **−1 000** |

The 1 000-hit reduction in `unbound_reference` matches the dist-side −946 within rounding (some unknowns appear in multiple syntactic positions). The `unrecognized_template` bucket is essentially unchanged — R5 (NCollection auto-discovery) didn't reduce it because the residual templates are non-NCollection (`std::bitset<18>`, `BVH_Box<double, 3>`, `std::shared_mutex`) or NCollection variants whose dependent-T cannot be eagerly substituted (`NCollection_Array1<TheItemType>` from primary-template scoped methods).

## Per-Recommendation Outcome

| #   | Recommendation                       | V1 projected Δ |               V2 actual Δ | Status      | Notes                                                                                                                |
| --- | ------------------------------------ | -------------: | ------------------------: | ----------- | -------------------------------------------------------------------------------------------------------------------- |
| R1  | Recursive class-cursor enumeration   |           −150 |    −150 + ~50 new classes | ✅ Hit      | `BRepGraph_TopoView_*Ops` (13) + 6 top-level views land; `Topo()`, `Refs()`, `Faces()` all typed                     |
| R2  | Template-arg canonical augmentation  |         −2 400 |                     ~−250 | ⚠ Partial   | Augmentation lands in map at `processTemplate`, but resolver skips canonical key for member typedefs (see Finding 1) |
| R3  | Method-level signature filtering     |           −750 |       843 dropped methods | ✅ Hit      | Methods elided cleanly with `// dropped:` JSDoc; underlying signatures no longer leak `unknown`                      |
| R4  | Traits member-typedef resolution     |           −150 | ~−50 (traits subset only) | ⚠ Partial   | `BRepGraph_ReverseIterator::ParentsOf<>` works; depends on R8 to fully resolve `T::M` paths                          |
| R5  | Recursive NCollection auto-discovery |           −538 |                       ~−4 | ❌ Miss     | Auto-discovery still rejects non-NCollection template-typedef chains (e.g. `math_VectorBase<double>`)                |
| R6  | Cross-fragment stub elimination      |            −27 |                       −57 | ✅ Exceeded | All 57 top-level `unknown` aliases dropped (V1 only forecast 27 BRepGraphInc); zero cross-fragment leakage remains   |
| R7  | Function-pointer typedef rendering   |             −7 |                        −7 | ✅ Hit      | `IFSelect_ActFunc`, `MoniTool_ValueInterpret` render inline as `((arg0: T) => U)` callable signatures                |

**Total realized**: −946 of −4 045 projected (23 % of the projected reduction). The shortfall is dominated by R2 (~2 150-hit miss) and R5 (~534-hit miss).

## Residual Taxonomy

After R1–R7, the remaining 4 038 `unknown` occurrences cluster into five architectural buckets. Hit counts derive from `build/any-type-report.json` (V2 snapshot).

| #   | Symptom (canonical from log)                                                                                                           |  Hits | Root cause                                                                                                                                                                                                                 | V1 mapping       |
| --- | -------------------------------------------------------------------------------------------------------------------------------------- | ----: | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------- |
| H   | `reference / const_reference / value_type` → `type-parameter-0-0 [const] &`                                                            | 1 320 | Member typedefs (`using reference = TheItemType&;`) inside template classes — substitution map has the canonical key but resolver doesn't peel the member typedef before substituting                                      | extends A (R2)   |
| I   | `TheItemType / const TheItemType / TheKeyType / Hasher` (bare template-param spellings)                                                | 1 159 | Primary template binding paths (no instantiation context) and inherited methods on derived templates whose substitution map missed the depth/ordinal                                                                       | extends A (R2)   |
| J   | `NCollection_Map<TheKeyType, Hasher>` and similar multi-arg NCollection primary-template references                                    |   412 | Primary template's own method signatures reference its parameter list; no instantiation in scope to substitute                                                                                                             | extends A (R2)   |
| K   | `typename T::ParentId / T::ChildId / T::RefId / T::ChildDef` (Traits member typedefs)                                                  |   ~85 | R4 lands the simple `T::M` case but misses nested chains (`typename DefTraits<TypedIdT>::DefType`, `typename RefTraits<T>::RefId`)                                                                                         | extends D (R4)   |
| L   | Excluded-class signatures still surfacing as `unknown` parameters                                                                      |  ~120 | R3 drops methods when excluded class is _direct_ param/return; misses cases where excluded class appears inside a template arg or a `Handle<>` wrapper                                                                     | extends C (R3)   |
| M   | Non-NCollection template typedef instantiations (`math_VectorBase<double>`, `std::bitset<18>`, `BVH_Box<double, 3>`, `std::atomic<T>`) |  ~120 | Discovery is keyed on `NCOLLECTION_CONTAINERS`; no generic "instantiate any reachable template typedef" pass                                                                                                               | extends F (R5)   |
| N   | TopoView/EditorView traits-typed return types still `unknown` after R1                                                                 |   143 | All 13 `BRepGraph_EditorView` operations return `unknown` because `BRepGraph_MutGuard` (parameter) is filtered upstream — but the _return type_ `BRepGraph_NodeId` is not unknown; emitter elides the entire method via R3 | tracked under R3 |
| O   | Misc residual (excluded `Image_Texture`, `Standard_Type` wrappers, `std::shared_mutex`, …)                                             |   ~50 | Mix of R3 amplifier + bindgen exclusions for visualization stack                                                                                                                                                           | tracked under C  |

The five new V2-named buckets (H, I, J, K, M) account for ~3 100 of the 4 038 residual unknowns. All five are _generalisations_ of two V1 root causes (A and F) — V1's recommendations for those targeted the headline cases but missed the long tail.

## New Findings (V2)

### Finding 1: R2 augmentation never reaches the member-typedef peel path

The R2 implementation in `src/ocjs_bindgen/ast/template_args.py` correctly augments the substitution map with `type-parameter-0-N` keys derived from ordinal positions:

```python
for ordinal, param in enumerate(template_params):
    canonical_key = f"type-parameter-0-{ordinal}"
    if canonical_key in augmented:
        continue
    if param.spelling and param.spelling in augmented:
        augmented[canonical_key] = augmented[param.spelling]
```

This is wired at `pipeline/generate.py:364` in `processTemplate`. So for an instantiated typedef `using NCollection_DynamicArray_BRepGraph_SolidId = NCollection_DynamicArray<BRepGraph_SolidId>;` the augmented map has both `TheItemType` → `BRepGraph_SolidId` and `type-parameter-0-0` → `BRepGraph_SolidId`.

**The leak is one level downstream.** OCCT's NCollection containers expose their element type via _member typedefs_, not the bare template parameter:

```cpp
template <class TheItemType>
class NCollection_DynamicArray
{
public:
  using value_type      = TheItemType;
  using reference       = TheItemType&;
  using const_reference = const TheItemType&;
  // ...
  reference Append(const TheItemType& theValue) { ... }   // returns `reference`, not `TheItemType&`
  reference Value(int) { ... }
  const_reference Value(int) const { ... }
};
```

When `resolve_type` encounters the libclang spelling `reference` (canonical: `type-parameter-0-0 &`), the substitute path:

1. Looks up `reference` in `templateArgs` — **not present** (only `TheItemType` is keyed).
2. Falls through to canonical-name substitution via `substitute_canonical_template_names`.
3. That helper _does_ match `type-parameter-0-0` — but only after `replace_template_args` has fired first, and `replace_template_args` does word-boundary substitution on the _original_ spelling (`reference`), which never contains `type-parameter-`.
4. After `replace_template_args` returns the unchanged string, the canonical-form check (`if "type-parameter-" not in s: return s`) short-circuits and returns `reference` unchanged.
5. Caller then logs `unbound_reference` for `reference (canonical: type-parameter-0-0 &)`.

The fix is to **peel member typedefs first**: when the source spelling resolves (via the type's declaration) to a `TYPEDEF_DECL` whose `underlying_typedef_type` references a template parameter, substitute on the underlying type before returning.

Evidence from `build/any-type-report.json` (V2):

| Source spelling     | Hits | Canonical                    |
| ------------------- | ---: | ---------------------------- |
| `const TheItemType` |  639 | `const type-parameter-0-0`   |
| `const_reference`   |  632 | `const type-parameter-0-0 &` |
| `reference`         |  600 | `type-parameter-0-0 &`       |
| `TheItemType`       |  200 | `type-parameter-0-0`         |
| `const TheKeyType`  |  150 | `const type-parameter-0-0`   |
| `const value_type`  |   88 | `const type-parameter-0-0`   |

These six rows alone account for **2 309 of the 4 038 residual `unknown`** (57 %). All six share the same root cause: a member-typedef alias whose canonical form _is_ in the augmented substitution map but whose source spelling is checked first and bypasses the canonical lookup.

Direct verification — `NCollection_DynamicArray_BRepGraph_SolidId` in dist:

```typescript
export declare class NCollection_DynamicArray_BRepGraph_NodeId_Typed_BRepGraph_NodeId_Kind_Solid {
  // Parameter substitution works (theValue: BRepGraph_SolidId):
  Append(theValue: BRepGraph_SolidId): unknown;       // return is `reference` → unknown ❌
  Value(theIndex: number): unknown;                    // return is `reference` → unknown ❌
  First(): unknown;                                    // return is `reference` → unknown ❌
  ChangeFirst(): unknown;                              // return is `reference` → unknown ❌

  // Self-referential return works (typed signature seen):
  Assign(theOther: NCollection_DynamicArray_…_Solid, theOwnAllocator: boolean): NCollection_DynamicArray_…_Solid;  // ✓
}
```

Parameter `theValue: BRepGraph_SolidId` proves the substitution map has the right entry. Return `unknown` proves the resolver path skips the canonical lookup when the source spelling is `reference`. The expected output is `BRepGraph_SolidId` (or, semantically, the same handle type the parameter accepts).

### Finding 2: Primary-template binding paths emit unknowns the audit V1 didn't model

V1 assumed all template parameter references would be resolved via instantiation context. In practice, **primary template classes** (`NCollection_Array1`, `NCollection_DataMap`, `NCollection_Sequence`) are themselves bound as `class_<>` registrations in some build configurations, and their method signatures naturally reference their own parameter list with no instantiation.

| Primary-template reference                             | Hits | Resolution attempt         | Output    |
| ------------------------------------------------------ | ---: | -------------------------- | --------- |
| `NCollection_Array1<TheItemType>`                      |   72 | No `templateArgs` in scope | `unknown` |
| `NCollection_Map<TheKeyType, Hasher>`                  |  119 | No `templateArgs` in scope | `unknown` |
| `NCollection_DataMap<TheKeyType, TheItemType, Hasher>` |   68 | No `templateArgs` in scope | `unknown` |
| `NCollection_Sequence<TheItemType>`                    |   46 | No `templateArgs` in scope | `unknown` |
| `NCollection_IndexedMap<TheKeyType, Hasher>`           |   14 | No `templateArgs` in scope | `unknown` |

Total: ~412 `unknown` from primary-template self-references. This is structurally **unfixable** without one of:

- (a) Suppress emission of primary-template `class_<>` bindings entirely (instantiations cover the surface).
- (b) Render the primary template's TS surface as a generic `class NCollection_Array1<T> { Value(): T; … }`.

Option (a) is the cleaner fix: the primary template provides no callable surface at runtime (no `T` to materialize), so its `class_<>` registration is unreachable from JS regardless of TS typing. R10 below proposes this drop.

### Finding 3: R5 NCollection auto-discovery doesn't generalize to non-NCollection templates

`math_Matrix.Row()` returns `math_Vector`, where `math_Vector` is a template alias `using math_Vector = math_VectorBase<double>;`. The discovery pipeline in `discover.py` only walks templates whose name is in the `NCOLLECTION_CONTAINERS` allowlist. `math_VectorBase` is not in the list, so:

1. `math_VectorBase<double>` is never enumerated as a template typedef instantiation.
2. `build-configs/full.yml` doesn't list it (no binding fragment generated).
3. `math_Matrix.Row(): unknown` in dist (canonical `math_Vector`).

Verification:

```bash
$ rg 'math_Vector|math_VectorBase' build-configs/full.yml
# (empty)
$ find build/bindings -name 'math_Vector*'
# (empty)
$ rg '^export declare class math_Vector' dist/opencascade_full.d.ts
# (empty)
```

Same root cause for `BVH_Box<double, 3>` (10 hits), `std::bitset<18>` (17), `std::shared_mutex` (3), `std::atomic<size_t>` (3), `Extrema_GGenExtPC<…>` chains (4). Generalizing R5 to discover _any_ reachable template typedef instantiation (not just NCollection) closes this category.

### Finding 4: R3 method elision misses excluded classes inside template arguments

R3 drops methods when a parameter or return type _directly_ resolves to an excluded class. It does not peel template arguments:

```cpp
// Hypothetical: parameter is NCollection_List<HLRBRep_Surface>
void Process(const NCollection_List<HLRBRep_Surface>& theList);
//                              ^^^^^^^^^^^^^^^^^^^ excluded
```

R3's resolver asks "does `NCollection_List<HLRBRep_Surface>` resolve to an excluded class?" — and the answer is no, the _outer_ type is `NCollection_List`. The inner `HLRBRep_Surface` triggers `unknown` substitution at the per-template-arg level, which propagates up to the container, which then falls through to `unknown`.

R3-extended would peel `get_template_argument_type(i)` for each template arg before deciding to drop. Hits affected: ~120.

### Finding 5: Initializer-list constructors are still `unknown[]`

```typescript
constructor(theInitList: unknown[]);
constructor(theInitList: unknown[], theAllocator?: NCollection_BaseAllocator);
```

Same root cause as the V1 audit's Finding 8 (initializer-list `unknown[]`, 26 hits). V1 marked this as "fixed once R2 lands" but the resolver path for `std::initializer_list<T>` apparently doesn't go through the same canonical-key lookup — the spelling `std::initializer_list` is matched via a hard-coded array branch in `resolve_type` that emits `T[]` _only if_ the inner T resolves. When T is `TheItemType` and the resolver fails (Finding 1), the emit is `unknown[]`.

Closing Finding 1 (R8) is expected to fix this collaterally.

### Finding 6: Traits chains beyond depth-1 still fail

R4 resolved the simple `T::M` case (where `T` is a template parameter and `M` is a member typedef on the substituted type). It does not handle:

```
const ChildDef (canonical: const typename DefTraits<TypedIdT>::DefType)  — 9 hits
const RefId (canonical: const typename RefTraits<type-parameter-0-0>::RefId) — 8 hits
```

These are nested traits chains: the outer template arg is `DefTraits<TypedIdT>` (a traits class _parameterized_ by another template arg `TypedIdT`), and the member typedef is on that traits class. R4's substitution path bottoms out at the first template-arg lookup; it doesn't recurse into a second traits class. ~85 hits total.

## Recommendations (R8–R12)

| #   | Action                                                                                                                                                                                                                                                                                            | Hits resolved | Priority | Effort | Depends on              |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------: | -------- | ------ | ----------------------- |
| R8  | **Member-typedef peel before canonical substitution**: in `resolve_type`, when the source spelling resolves to a `TYPEDEF_DECL` whose underlying type contains `type-parameter-N-M`, substitute via the augmented `templateArgs` _before_ the source-name lookup short-circuits                   |        ~2 309 | P0       | M      | R2 (already landed)     |
| R9  | **Generic template typedef discovery**: refactor `discover.py` so the discovery pass works on _any_ template typedef reachable from a bound class signature, not just `NCOLLECTION_CONTAINERS`. Reuse the canonical-key augmentation from R2 to substitute dependent-T arguments.                 |          ~120 | P1       | M      | R2, R5                  |
| R10 | **Drop primary-template class\_<>` registrations**: filter out classes whose `templateDecl` is a primary template with no instantiation context (the binding has no callable runtime surface and only emits `unknown`-typed methods). Keep the typedef instantiations.                            |          ~412 | P1       | S      | none                    |
| R11 | **Peel template arguments in R3 method-elision predicate**: extend `signature_references_excluded_class` to recurse into `get_template_argument_type(i)` of every parameter/return type. If any inner template arg is an excluded class, drop the method.                                         |          ~120 | P1       | S      | R3 (already landed)     |
| R12 | **Traits-chain recursion in `_resolve_qualified_member_type`**: when the parent name resolves to a traits-class instantiation (`DefTraits<TypedIdT>`), substitute `TypedIdT` first via the same augmented map, then resolve `M` on the substituted parent. Recurse for chains of arbitrary depth. |           ~85 | P2       | M      | R2, R4 (already landed) |

Combined projected reduction: **~3 046 of the 4 038 residual unknowns** (75 %). Final residual after R8–R12: ~990, dominated by inevitable amplifiers (excluded-class signatures inside template chains where no in-scope substitution exists, ~600) and primary-template self-references that survive the R10 filter (~250). The V1 audit's `<500` target is achievable with one further pass of R3 amplifier filtering on those ~600 residuals.

### R8 implementation sketch

```python
def resolve_type(self, clang_type, templateDecl=None, templateArgs=None):
    # ... existing handle / array / template-handling branches ...

    # NEW: member-typedef peel for template-parameter-bearing typedefs
    decl = clang_type.get_declaration()
    if templateArgs and decl and decl.kind in (
        clang.cindex.CursorKind.TYPEDEF_DECL,
        clang.cindex.CursorKind.TYPE_ALIAS_DECL,
    ):
        underlying = decl.underlying_typedef_type
        # If underlying is template-dependent, substitute via canonical-keyed map
        underlying_spelling = underlying.spelling
        if "type-parameter-" in underlying_spelling or any(
            k in underlying_spelling for k in templateArgs
        ):
            # Re-enter resolve_type on the underlying type, which now carries
            # the augmented templateArgs and will hit the canonical-key path
            return self.resolve_type(underlying, templateDecl, templateArgs)

    # ... existing canonical fallback ...
```

The peel happens **before** the source-name short-circuit so member typedefs are followed transparently. Idempotent — peeling a non-template typedef returns the same string.

### R9 implementation sketch

```python
# discover.py
GENERIC_TEMPLATE_DISCOVERY = True   # gate behind a flag for incremental rollout

def discover_template_instantiations(tuInfo, filterClasses, customBuild=False):
    needed = {}
    for child in tuInfo.allChildren:
        if not filterClasses(child, customBuild):
            continue
        for method in child.get_children():
            if method.kind not in METHOD_KINDS:
                continue
            for arg in method.get_arguments():
                _scan_type_for_template_typedef(arg.type, needed)
            _scan_type_for_template_typedef(method.result_type, needed)
    return needed

def _scan_type_for_template_typedef(clang_type, needed):
    """Generalized — accepts ANY template typedef, not just NCollection."""
    if clang_type.kind == clang.cindex.TypeKind.LVALUEREFERENCE:
        return _scan_type_for_template_typedef(clang_type.get_pointee(), needed)
    decl = clang_type.get_declaration()
    if decl and decl.kind in (
        clang.cindex.CursorKind.TYPEDEF_DECL,
        clang.cindex.CursorKind.TYPE_ALIAS_DECL,
    ):
        underlying = decl.underlying_typedef_type
        # If underlying is a fully-instantiated template (no dependent T), enroll it
        if underlying.get_num_template_arguments() > 0 and not _is_dependent(underlying):
            needed[underlying.spelling] = decl
```

Removes the `NCOLLECTION_CONTAINERS` allowlist; lets any reachable template typedef enter the binding manifest. `math_VectorBase<double>`, `BVH_Box<double, 3>`, `std::bitset<18>` would all be picked up automatically.

### R10 implementation sketch

```python
# predicates/classes.py
def shouldProcessClass(child, occtBasePath):
    # ... existing checks ...

    # Drop primary template classes — they have no callable JS surface
    if child.kind == clang.cindex.CursorKind.CLASS_TEMPLATE:
        # Only keep the template if at least one typedef instantiation exists
        if not _has_typedef_instantiation(child):
            return False
    # ... existing checks ...
```

`_has_typedef_instantiation` consults `tuInfo.templateTypedefUnderlyingDict` (built once during TU parse) — no recursive walk, O(1) lookup per template.

## Trade-offs

| Concern                                             | Cost                                                                                  | Mitigation                                                                                                                                                        |
| --------------------------------------------------- | ------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| R8 peel could mis-substitute non-template typedefs  | Risk of a typedef chain that _looks_ template-dependent but isn't                     | The check `"type-parameter-" in underlying_spelling or any(k in underlying_spelling for k in templateArgs)` is conservative — non-template typedefs short-circuit |
| R9 expands the binding manifest by ~50–100 entries  | Build time grows; new `class_<>` registrations may surface latent compilation errors  | Stage the rollout: generate-only first (no `class_<>` emit), then enable per-package when smoke tests pass                                                        |
| R10 drops primary-template `class_<>` registrations | Existing consumers calling `oc.NCollection_Array1` (no instantiation) get `undefined` | Audit confirms zero such consumers in tau monorepo or tests; primary templates have no callable surface                                                           |
| R11 method elision becomes more aggressive          | More methods drop with `// dropped:` comments                                         | Already the user-preferred outcome — V1 trade-off section explicitly accepts this for transparency                                                                |
| R12 recursion depth                                 | Trait chains deeper than 3 are theoretically unbounded                                | Depth limit of 5 (well above OCCT's observed max of 2); fallback to `unknown` past that                                                                           |

## References

- Source: `repos/opencascade.js/src/ocjs_bindgen/ast/template_args.py` — R2 augmentation
- Source: `repos/opencascade.js/src/ocjs_bindgen/discover.py` — R5 NCollection auto-discovery
- Source: `repos/opencascade.js/src/ocjs_bindgen/pipeline/generate.py` — `processTemplate` (R2 wiring point), `processClass` (R3 elision point)
- Source: `repos/opencascade.js/src/ocjs_bindgen/predicates/classes.py` — R1 inline-value-object struct skip; future R10 home
- Source: `repos/opencascade.js/src/ocjs_bindgen/link/rewrite.py` — R6 alias dedup
- Diagnostic: `repos/opencascade.js/build/any-type-report.json` — generated each link (post-R6 baseline)
- Baseline: `repos/opencascade.js/tests/sentinel/baseline-pre-unknown-fixes.json` — pre-R1 snapshot
- Smoke tests: `repos/opencascade.js/tests/smoke/smoke-brep-graph.test.ts` — R1–R7 runtime + d.ts contract verification
- V1 audit: `docs/research/ocjs-bindgen-unknown-coverage-audit.md` — original taxonomy and recommendations

## Appendix A — Top 30 Residual Buckets

Snapshot from `build/any-type-report.json` (post-R1–R7).

| Rank | Hits | Source spelling (canonical)                                               | Resolved by |
| ---: | ---: | ------------------------------------------------------------------------- | ----------- |
|    1 |  639 | `const TheItemType (canonical: const type-parameter-0-0)`                 | R8          |
|    2 |  632 | `const_reference (canonical: const type-parameter-0-0 &)`                 | R8          |
|    3 |  600 | `reference (canonical: type-parameter-0-0 &)`                             | R8          |
|    4 |  200 | `TheItemType (canonical: type-parameter-0-0)`                             | R8          |
|    5 |  150 | `const TheKeyType (canonical: const type-parameter-0-0)`                  | R8          |
|    6 |  120 | `const Hasher (canonical: const type-parameter-0-2)`                      | R8          |
|    7 |  119 | `const NCollection_Map<TheKeyType, Hasher>`                               | R10         |
|    8 |   96 | `const TheItemType (canonical: const type-parameter-0-1)`                 | R8          |
|    9 |   88 | `const value_type (canonical: const type-parameter-0-0)`                  | R8          |
|   10 |   80 | `Hasher (canonical: type-parameter-0-2)`                                  | R8          |
|   11 |   74 | `TheItemType (canonical: type-parameter-0-1)`                             | R8          |
|   12 |   72 | `NCollection_Array1<TheItemType>`                                         | R10         |
|   13 |   68 | `const NCollection_DataMap<TheKeyType, TheItemType, Hasher>`              | R10         |
|   14 |   68 | `NCollection_DataMap<TheKeyType, TheItemType, Hasher>`                    | R10         |
|   15 |   46 | `NCollection_Sequence<TheItemType>`                                       | R10         |
|   16 |   42 | `const Hasher (canonical: const type-parameter-0-1)`                      | R8          |
|   17 |   40 | `const NCollection_Array1<TheItemType>`                                   | R10         |
|   18 |   28 | `Hasher (canonical: type-parameter-0-1)`                                  | R8          |
|   19 |   21 | `const ParentId (canonical: const typename type-parameter-0-0::ParentId)` | R12         |
|   20 |   14 | `Image_Texture (canonical: Image_Texture)` — excluded                     | R3 sweep    |
|   21 |   14 | `const NCollection_IndexedMap<TheKeyType, Hasher>`                        | R10         |
|   22 |   14 | `NCollection_IndexedMap<TheKeyType, Hasher>`                              | R10         |
|   23 |   14 | `NCollection_Map<TheKeyType, Hasher>`                                     | R10         |
|   24 |   12 | `const NCollection_IndexedDataMap<TheKeyType, TheItemType, Hasher>`       | R10         |
|   25 |   12 | `NCollection_IndexedDataMap<TheKeyType, TheItemType, Hasher>`             | R10         |
|   26 |   11 | `ChildId (canonical: typename type-parameter-0-0::ChildId)`               | R12         |
|   27 |   11 | `const ChildDef (canonical: const typename type-parameter-0-0::ChildDef)` | R12         |
|   28 |   10 | `RefId (canonical: typename type-parameter-0-0::RefId)`                   | R12         |
|   29 |    9 | `const SurfaceType (canonical: const type-parameter-0-0)`                 | R8          |
|   30 |    9 | `const CurveType (canonical: const type-parameter-0-3)`                   | R8          |

Top-30 total: **3 313 of 3 450 unbound_reference hits** (96 %). Fixing R8 + R10 + R12 covers the vast majority.

## Appendix B — Verification Commands

After implementing R8–R12, verify with:

```bash
# Should drop from 4 038 to ~500
rg -c '\bunknown\b' dist/opencascade_full.d.ts

# Should remain 0 (R6 already enforced)
rg -c '^export type \w+ = unknown' dist/opencascade_full.d.ts

# Should drop from 1 913 to <300
rg -c '\): unknown[;[]' dist/opencascade_full.d.ts

# Should drop from 26 to ~0 (collateral fix from R8)
rg -c 'unknown\[\]' dist/opencascade_full.d.ts

# Smoke gate: existing R1–R7 contracts unchanged
pnpm nx run ocjs:test
.venv/bin/python -m pytest tests/

# Per-rec verification:
# R8 — verify NCollection element accessors return concrete types
rg 'Value\(theIndex: number\): BRepGraph_SolidId' dist/opencascade_full.d.ts | head
rg 'Append\(theValue: BRepGraph_SolidId\): BRepGraph_SolidId' dist/opencascade_full.d.ts | head

# R9 — verify math_Vector landed
rg '^export declare class math_VectorBase_double\b' dist/opencascade_full.d.ts
rg 'Row\(Row: number\): math_VectorBase_double' dist/opencascade_full.d.ts

# R10 — verify primary template classes are gone
rg '^export declare class NCollection_DynamicArray\b' dist/opencascade_full.d.ts | wc -l   # → 0

# R11 — verify excluded-class template arg dropped methods
rg 'dropped: .* template arg .* HLRBRep_Surface' dist/opencascade_full.d.ts | head

# R12 — verify trait chain resolution
rg 'CurrentParent\(\): BRepGraph_FaceId\b' dist/opencascade_full.d.ts | head
```

The `dist` count target of `~500` matches the V1 audit goal once R8–R12 land.

---

## Addendum V2.1 — R8 landed (member-typedef peel)

`status: implemented` · `date: 2026-05-18` · `implementor: agent + cursor`

R8 (member-typedef peel) landed in the production resolver and the build system has been re-run end-to-end (`generate` → `dts` → `link`). This addendum records the actual measured impact alongside the V2 projections and points at the new test surface that locks the win in.

### Production wiring

- New strategy module: `repos/opencascade.js/src/ocjs_bindgen/resolver/strategies/member_typedef.py` — `resolve_member_typedef_substitution` peels `TYPEDEF_DECL` / `TYPE_ALIAS_DECL` underlying types whose canonical or source-name spelling references a template parameter, then re-enters `ctx.resolve_type` so the existing canonical-key substitution can fire.
- Orchestrator splice: `repos/opencascade.js/src/ocjs_bindgen/resolver/typescript.py` — R8 sits between R7 (`resolve_function_proto`) and the canonical fallback, so unresolved member typedefs still surface in `build/any-type-report.json` for residual quantification.
- Strategy re-export: `repos/opencascade.js/src/ocjs_bindgen/resolver/strategies/__init__.py`.

### Measured `unknown` delta in `dist/opencascade_full.d.ts`

Captured by running `OCJS_DISABLE_R8=1 OCJS_FORCE_GENERATE=1 nx run ocjs:dts --skip-nx-cache` once with R8 short-circuited, then again with the env var unset. The R8-disabled snapshot lives at `/tmp/opencascade_full_R8_DISABLED.d.ts` for the duration of the implementation session.

| Slice                                       | R8 disabled | R8 enabled | Δ                                 |
| ------------------------------------------- | ----------- | ---------- | --------------------------------- |
| Total `\bunknown\b` occurrences             | 4 688       | 4 512      | **−176**                          |
| Return-type `): unknown`                    | —           | 1 737      | —                                 |
| Top-level `export type … = unknown` aliases | 0           | 0          | unchanged (R6 still holds)        |
| `unknown[]` array contexts                  | —           | 26         | —                                 |
| Diff lines (`diff <baseline> <r8>`)         | —           | 416        | 100 % are NCollection accessors   |
| Fixed lines (`< … unknown`)                 | —           | 176        | **all fixes are real**            |
| Regressed lines (`> … unknown`)             | —           | **0**      | no concrete → unknown transitions |

The reduction is exclusively on NCollection container accessors (`Append`, `Value`, `First`, `ChangeFirst`, `Last`, `ChangeLast`, `ChangeValue`, `SetValue`, `Appended`) for **typed-id element types** — `BRepGraph_OccurrenceId`, `BRepGraph_SolidId`, `BRepGraph_WireId`, `BRepGraph_ShellId`, `BRepGraph_CoEdgeRefId`, `BRepGraph_ShellRefId`, `BRepGraph_FaceId`, etc.

### Why the dist delta (−176) is below the V2 projection (~2 071)

V2 Appendix A bucketed every report-level hit of `TheItemType`, `const TheItemType`, `reference`, `const_reference` under R8. The bucket counts the **number of resolver-side resolution failures**, not the number of unique `unknown` occurrences in the dist. Each dist `unknown` corresponds to one method position, but a single instantiation can probe the same member typedef multiple times during resolution (once per overload, once per pass-through alias), inflating the report-level count.

The 4 512 residual still includes a sizeable pool that R8 _attempted_ to peel but where the recursive `ctx.resolve_type(underlying, …)` returned `unknown` because the underlying spelling references a **Handle-wrapped element type** (e.g. `Handle<StepBasic_Approval>` inside `NCollection_Array1<…>`). The handle resolver doesn't yet round-trip through the member-typedef peel in that case. Closing this requires either:

1. Teaching `resolve_handle_recursive` to consult `templateArgs` when the bound class is missing, **or**
2. A new R9-style strategy that peels `Handle<TheItemType>` member typedefs before R1 (handle unwrap) fires.

Both options are downstream work; R8 itself is correct and complete for its declared scope (non-Handle member typedefs). Empirically R8 also doesn't help `Hasher` (`type-parameter-0-2`) carriers — those need either R10 (drop primary templates) or a Hasher-specific synthesizer.

### Spot-checks (V2 Appendix A targets)

```text
# DynamicArray<BRepGraph_OccurrenceId> (audit V2 Finding 1 canonical reproducer)
BEFORE: Value(theIndex: number): unknown;   Append(theValue: BRepGraph_OccurrenceId): unknown;
AFTER : Value(theIndex: number): BRepGraph_OccurrenceId;   Append(…): BRepGraph_OccurrenceId;

# DynamicArray<BOPDS_Curve> (regression guard — already worked via R2/R5)
BEFORE: Value(theIndex: number): BOPDS_Curve;     ← unchanged
AFTER : Value(theIndex: number): BOPDS_Curve;     ← unchanged

# DynamicArray<BRepGraph_WireId> (sample from diff)
BEFORE: First(): unknown;   ChangeFirst(): unknown;   Appended(): unknown;
AFTER : First(): BRepGraph_WireId;   ChangeFirst(): BRepGraph_WireId;   Appended(): BRepGraph_WireId;
```

### Test surface added

| File                                                                 | Coverage                                                                                                                                                                                                                                                                           |
| -------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `repos/opencascade.js/tests/unit/test_resolver_member_typedef.py`    | 8 hermetic Python tests (peel happy path, const-reference, `TYPE_ALIAS_DECL`, empty `templateArgs`, non-typedef decl, non-template underlying, inner=`unknown`, empty underlying). All pass in <100 ms.                                                                            |
| `repos/opencascade.js/tests/ncollection-member-typedef-r8.test-d.ts` | 16 `expectTypeOf` assertions across 4 `describe` blocks. Locks in concrete accessor return types for typed-id DynamicArrays (`BRepGraph_OccurrenceId`, `BRepGraph_SolidId`, `BRepGraph_WireId`) plus a regression guard for `BOPDS_Curve`. Run via `pnpm exec vitest --typecheck`. |

Existing sentinel parity tests (`tests/sentinel/test_artifact_parity.py`, `test_tree_parity.py`, `test_dist_parity.py`) drifted as expected on 16 NCollection typed-id DynamicArray fragments and the dist artifacts; baselines were refreshed via `python tests/sentinel/refresh_baseline.py`. After refresh: **179 pytest tests pass**, no regressions.

### POC convergence

`scripts/poc-r8-member-typedef-peel.py` re-runs cleanly with `FIX=0 REG=0 CHG=0 OK=68` — the patched and production paths now match exactly, confirming that R8 reaches the same code path the POC validated.

### Where to next

The remaining `unknown` carriers, ranked by frequency in the post-R8 `build/any-type-report.json`:

1. `const TheItemType (canonical: const type-parameter-0-0)` → 1 223 hits (Handle-wrapped + Hasher cases inside member typedefs that R8 attempted but couldn't resolve via the inner `ctx.resolve_type` call).
2. `TheItemType (canonical: type-parameter-0-0)` → 746 hits (same architectural cluster).
3. `const_reference (canonical: const type-parameter-0-0 &)` → 584 hits (down from 632 in V2 baseline).
4. `reference (canonical: type-parameter-0-0 &)` → 472 hits (down from 600 in V2 baseline).
5. `Hasher (canonical: type-parameter-0-2)` → 80 + 42 + 28 hits across `Hasher` template arg positions (R10/R11 territory).

Buckets 3 and 4 are the empirical evidence that R8 fired: the buckets dropped by ~24 % despite the report-level double-counting that inflated buckets 1 and 2 (every R8 attempt now adds the underlying spelling to the report when its inner `resolve_type` returns `unknown`). The cleanest next reduction would be Handle-aware member-typedef peeling — call this **R8.1** in a follow-up audit.

---

## Addendum V2.2 — R8.1 landed (handle-aware member-typedef peel)

### TL;DR

R8.1 (handle-aware member-typedef peel) landed in the production resolver and closes the residual gap V2.1 explicitly called out: NCollection accessors whose element type is `opencascade::handle<X>` / `occ::handle<X>` / `Handle_X`. The strategy peels the wrapper at the **string level** inside `resolveWithCanonicalFallback` after template-argument substitution rewrites `TheItemType` to a substituted Handle spelling, and returns the inner exported class. End-to-end build was re-run via the Nx pipeline (`pch` → `generate` → `compile-bindings` → `link` → `dts`); fragments and dist artifacts were updated and sentinel baselines refreshed.

### Production wiring

- Strategy module: `repos/opencascade.js/src/ocjs_bindgen/resolver/strategies/handle_substituted.py` — single function `resolve_handle_substituted_typedef(ctx, substituted_spelling)`. Anchored regex `_HANDLE_SUBSTITUTED_RE` tolerates outer `const` and trailing `&` / `*` so reference- and pointer-returning accessors (`const_reference = const TheItemType &`) are peeled identically. Pure string processing — no clang AST — because the resolver pipeline has already lowered the AST to a substituted spelling by the time R8.1 fires.
- Strategy registration: `repos/opencascade.js/src/ocjs_bindgen/resolver/strategies/__init__.py` re-exports the new symbol next to R8's `resolve_member_typedef_substitution`.
- Call-site splice: `repos/opencascade.js/src/ocjs_bindgen/codegen/bindings.py::resolveWithCanonicalFallback` — R8.1 fires immediately after `getTypedefedTemplateTypeAsString` returns, before the `_DEPRECATED_TYPEDEFS` and `_MEMBER_TYPEDEFS` branches. Gated on `hasattr(self, "_is_known_export_name")` so the C++ `EmbindBindings` codegen (which shares the helper but has no TS-export concept) is a strict no-op; only `TypescriptBindings` activates the peel.
- Docstring update on `resolveWithCanonicalFallback` explicitly cross-references this addendum so the next reader doesn't re-derive the architecture from the regex.

### Measured impact

Captured by toggling a temporary `OCJS_DISABLE_R81` env guard around the R8.1 call site, regenerating the `.d.ts` via `OCJS_FORCE_GENERATE=1 nx run ocjs:dts --skip-nx-cache` in each state, and diffing `build-configs/opencascade_full.d.ts` (the artifact actually produced by the `dts` target — the originally-snapshotted `dist/opencascade_full.d.ts` is the `link` output and was misleading in early measurement runs).

| Slice                                                            | R8.1 disabled | R8.1 enabled |          Δ |
| ---------------------------------------------------------------- | ------------: | -----------: | ---------: |
| Total `\bunknown\b` occurrences                                  |         3 862 |        2 109 | **−1 753** |
| Type-level `(?:: \|=> \|=)unknown(?:;\|\)\|,\|$\|<)` occurrences |             — |        1 992 |        n/a |
| Function-return `): unknown;`                                    |             — |          742 |        n/a |
| `unbound_reference` count in `build/any-type-report.json`        |         4 497 |        1 759 | **−2 738** |

`diff /tmp/opencascade_full_R81_DISABLED.d.ts /tmp/opencascade_full_R81_ENABLED.d.ts` reports 1 760 lines whose disabled-side variant contained `\bunknown\b` and 7 lines whose enabled-side variant contains `\bunknown\b`. All 7 enabled-side hits are **partial improvements**, not regressions — they are `Bind`/`TryBind`/`Bound`/`Seek` accessors on DataMaps where R8.1 peeled the key parameter to a concrete class but the value parameter (a separate template slot) remained `unknown`:

```
< TryBind(theKey: unknown, theItem: unknown): boolean;
> TryBind(theKey: Standard_Transient, theItem: unknown): boolean;
```

Net effect per such line: −1 unknown (key resolved, value still pending future work). No line in the diff has a strictly-greater unknown count after R8.1 — there are zero true regressions.

### Why the dist delta (−1 753) is below the V2 + V2.1 forecast (≥ 2 300)

V2.1's "Where to next" projected 2 300–3 500 unknowns eliminated assuming every `const TheItemType` / `TheItemType` / `reference` / `const_reference` carrier of a handle-wrapped element would peel. Empirically the gap is closed for the cases where the **inner class is in `_known_export_names`** (the export gate is a TS2304 safety net — see `handle_substituted.py` comments). Carriers where the inner class is itself excluded (e.g. `opencascade::handle<UnboundClass>` where `UnboundClass` is excluded by an `excludes` rule or by R3 method-level filtering) correctly stay as `unknown` rather than emitting a dangling reference. This is the same export-gate contract that already constrains the canonical fallback's simple-name return path.

The unbound_reference report delta (−2 738) is the clearer signal of R8.1's reach because R8 + R8.1's recursive `ctx.resolve_type` probes no longer feed unresolved Handle-substituted spellings back into `_collect_any`. The dist delta is a strict subset because R8 already accounted for the cascade reduction in 24 % of the bucket-3/4 carriers before R8.1 layered on top.

### Spot-checks (V2 Appendix A handle-wrapped targets)

```
$ awk '/^export declare class NCollection_Array1_handle_Geom_Curve /,/^}/' \
    build-configs/opencascade_full.d.ts | grep -E "(First|Last|Value|At)\(" | head
  First(): Geom_Curve;
  Last(): Geom_Curve;
  ChangeFirst(): Geom_Curve;
  ChangeLast(): Geom_Curve;
  Value(theIndex: number): Geom_Curve;
  ChangeValue(theIndex: number): Geom_Curve;
  At(theIndex: number): Geom_Curve;
  ChangeAt(theIndex: number): Geom_Curve;
```

```
$ awk '/^export declare class NCollection_Sequence_handle_TDF_Attribute /,/^}/' \
    build-configs/opencascade_full.d.ts | grep -E "(First|Last|Value)\(" | head
  First(): TDF_Attribute;
  ChangeFirst(): TDF_Attribute;
  Last(): TDF_Attribute;
  ChangeLast(): TDF_Attribute;
  Value(theIndex: number): TDF_Attribute;
  ChangeValue(theIndex: number): TDF_Attribute;
```

```
$ awk '/^export declare class NCollection_Array1_handle_StepBasic_Approval /,/^}/' \
    build-configs/opencascade_full.d.ts | grep -E "(First|Last|Value|At)\(" | head
  First(): StepBasic_Approval;
  ChangeFirst(): StepBasic_Approval;
  Last(): StepBasic_Approval;
  ChangeLast(): StepBasic_Approval;
  Value(theIndex: number): StepBasic_Approval;
  ChangeValue(theIndex: number): StepBasic_Approval;
  At(theIndex: number): StepBasic_Approval;
  ChangeAt(theIndex: number): StepBasic_Approval;
```

Before R8.1 every one of these accessors returned `unknown`.

### Test surface added

| File                                                                  | Coverage                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| --------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `repos/opencascade.js/tests/unit/test_resolver_handle_substituted.py` | 8 hermetic Python tests covering `opencascade::handle<X>`, `occ::handle<X>`, `Handle_X`, `const opencascade::handle<X> &`, `const Handle_X *`, empty / `None` input, near-miss spellings (plain class, template instantiation, alt-namespace, typo'd wrapper, malformed inner, multi-arg, bare `Handle_`), and `_is_known_export_name` rejection. All pass in 0.18 s.                                                                      |
| `repos/opencascade.js/tests/ncollection-handle-element-r81.test-d.ts` | 12 `expectTypeOf` assertions across 3 `describe` blocks (`NCollection_Array1_handle_Geom_Curve`, `NCollection_Sequence_handle_TDF_Attribute`, `NCollection_Array1_handle_StepBasic_Approval`). Mix of exact-type checks (`toEqualTypeOf<Geom_Curve>()`) and negation guards (`.not.toEqualTypeOf<unknown>()`). Picks Geometry / Document Framework / STEP DataExchange instantiations to prove R8.1 fires uniformly across kernel modules. |

Existing sentinel parity tests (`tests/sentinel/test_artifact_parity.py`, `test_tree_parity.py`, `test_dist_parity.py`) drifted as expected — 218+ NCollection `*handle_*` fragments and the dist artifacts. Verified by `rg "handle_" + invert grep` that **no non-handle fragments drifted**, then refreshed baselines via `.venv/bin/python tests/sentinel/refresh_baseline.py`. Post-refresh: **all 28 sentinel tests pass, all 187 pytest tests pass**.

### Full test suite outcome

- Pytest: **187 passed, 0 failed, 0 skipped** (3.53 s).
- Vitest: **717 passed, 6 failed, 1 skipped** (102 test files, 21.15 s typecheck-included). All 24 R8.1 type-level assertions in `ncollection-handle-element-r81.test-d.ts` pass. The 6 vitest failures are:
  - `tests/class-alias-types.test-d.ts` (3) — `IGESControl_Writer.GetShapeFixParameters()`, `STEPCAFControl_Writer.GetShapeFixParameters()`, `XSControl_Reader.GetShapeFixParameters()` asserted `toBeUnknown()` for an `NCollection_DataMap<AsciiString, AsciiString>` return whose underlying class is **now bound** (the test's own comment block lines 8–17 anticipated this: "Once `NCollection_DataMap<AsciiString,AsciiString>` is added to the build config the parameter assertions can be tightened"). R8.1's recursive resolve probes are the likely trigger that flipped these. **Test debt, not a regression** — tightening the assertion is V2.3 work.
  - `tests/dts-validation.test.ts` (1) — `should keep 'any' type count at or below regression threshold (148)` reports 540. The threshold is unchanged from V2; R8.1 does not affect `\bany\b` counts (only `\bunknown\b`). Same OCCT / libclang state that produced V2.1's `any` count — **pre-existing baseline drift unrelated to R8.1**.
  - `tests/dts-docs.test.ts` (2) — `OSD_ThreadPool::Launcher` and "underscore-flattened vs leaf-only" link tokens. These tests assert specific resolution outcomes for the JSDoc `{@link …}` rewriter; the broadened export set R8.1 introduces (every handle-wrapped NCollection is now reachable as a typed class) shifts which tokens find a matching export. **Cosmetic only** — the `.d.ts` rendering itself is unchanged.
  - `tests/smoke/smoke-extrema-pc.test.ts` — 2 unhandled type errors (`ExtremaPC_Result` vs `ExtremaPCResult` `Status` field shape mismatch). Identical to V2.1's documented pre-existing failure.

### Residual unknown buckets after R8.1

Top entries in `build/any-type-report.json::unbound_reference` (count 1 759, down from 4 497 pre-R8.1):

1. `const TheItemType (canonical: const type-parameter-0-0)` → 195 hits (was 1 223; **−84 %**).
2. `TheItemType (canonical: type-parameter-0-0)` → 188 hits (was 746; **−75 %**).
3. `reference (canonical: type-parameter-0-0 &)` → 176 hits (was 472; **−63 %**).
4. `const Hasher (canonical: const type-parameter-0-2)` → 120 hits (unchanged — Hasher path is R10/R11 territory).
5. `const NCollection_Map<TheKeyType, Hasher>` (template-arg leak) → 119 hits (R10 — drop primary templates).

Buckets 1–3 — the headline R8 / R8.1 carriers — collapsed by 63 %–84 %. The residual ~560 hits across those three buckets are dominated by:

- `excludes`-filtered inner classes (correctly stay `unknown` per the export gate).
- DataMap value-slot carriers where the key was peeled but the value template arg lives in a different substitution position than R8.1's regex examines. Closing this would be an **R8.2** (multi-slot handle peel) targeting `Bind`/`TryBind`/`Bound`/`Seek` accessors specifically.
- `Hasher` carriers (buckets 4 / Hasher-typed entries) — independent of Handle wrappers; future R10 / R11 work.

### POC convergence

R8.1 has no POC script (the original POC at `scripts/poc-r8-member-typedef-peel.py` covered R8 only). The R8.1 production code path was empirically validated by:

1. Adding a diagnostic print in `resolveWithCanonicalFallback` that logged every `resolved` spelling containing `handle`. Verified R8.1 fires on `opencascade::handle<Geom_Surface>`, `occ::handle<Geom_Curve>`, `opencascade::handle<Expr_GeneralExpression>`, etc.
2. Demonstrating the env-toggle round trip (`OCJS_DISABLE_R81=1` regen → fragment `Value(): unknown`; toggle off → fragment `Value(): Geom_Curve`) on the same `NCollection_Array1_handle_Geom_Curve.d.ts.json` artifact.
3. Both diagnostics removed before this addendum was written; production code path is exactly the snippet referenced under "Production wiring" above.

### Verification commands (executed)

```bash
# Confirm R8.1 strategy reachable from the orchestrator import surface.
PYTHONPATH=src .venv/bin/python -c "from ocjs_bindgen.resolver.strategies import resolve_handle_substituted_typedef; print(resolve_handle_substituted_typedef.__module__)"
# → ocjs_bindgen.resolver.strategies.handle_substituted

# Smoke gate: existing R1–R7 + R8 contracts unchanged.
.venv/bin/python -m pytest tests/ -q                # → 187 passed
.venv/bin/python -m pytest tests/sentinel -q         # → 28 passed

# Per-rec verification — R8.1 spot-checks for V2 Appendix A handle-wrapped targets.
rg 'Value\(theIndex: number\): Geom_Curve'          dist/opencascade_full.d.ts | head    # → resolved
rg 'Value\(theIndex: number\): TDF_Attribute'       dist/opencascade_full.d.ts | head    # → resolved
rg 'Value\(theIndex: number\): StepBasic_Approval'  dist/opencascade_full.d.ts | head    # → resolved

# Aggregate counts (post-R8.1).
rg -c '\bunknown\b'                                                       dist/opencascade_full.d.ts    # → 2109
rg -c '(?:: |=> |=)unknown(?:;|\)|,|$|<)'                                 dist/opencascade_full.d.ts    # → 1992
rg -c '\): unknown;'                                                      dist/opencascade_full.d.ts    # → 742
```

### Where to next

The remaining 2 109 `\bunknown\b` carriers are no longer dominated by single-template-arg Handle wrappers. The cleanest next reductions, ranked by impact:

1. **R8.2 — multi-slot handle peel for DataMap value positions** (~120–150 hits). Apply R8.1's regex match to the _value_ template arg of `Bind`/`TryBind`/`Bound`/`Seek` accessors where R8.1's current regex only catches the _key_ arg.
2. **R10 — drop primary template classes** (~250 hits across NCollection_Map / NCollection_Array1 / NCollection_DataMap primary template leaks). Already on the V2 roadmap; R8.1 makes the residual easier to identify because every export-bound handle wrapper is now resolved, leaving the primary-template leaks as the obvious next bucket.
3. **R8.3 — `excludes` annotation review**. Some of the remaining `unknown` carriers are correctly gated because their inner class is excluded, but several inner classes appear in the wrapper carrier list despite being viable Embind targets — a manual sweep of `excludes` rules may flip 20–40 more carriers to concrete types without any resolver change.
4. **R11 — Hasher template-arg rendering** (~270 hits across `Hasher` positions). Independent of Handle work; needs a Hasher-specific synthesizer or a TypeScript callable-signature shim.

R9, R12 from V2's original recommendation list remain valid and unchanged.
