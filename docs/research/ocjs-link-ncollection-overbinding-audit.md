---
title: 'OCJS Link NCollection Over-binding Audit'
description: 'Audit of the link-step NCollection inclusion logic showing ~75% of compiled NCollection bindings are linked into every consumer YAML regardless of reachability, and the bindgen-side fix to restore YAML-scoped reachability.'
status: active
created: '2026-05-18'
updated: '2026-05-18'
category: audit
related:
  - docs/research/ocjs-bindings-wasm-applicability-audit.md
  - docs/research/ocjs-bindgen-unknown-coverage-audit-v2.md
  - docs/research/ocjs-unified-rbv-blueprint.md
  - docs/research/ocjs-v8-bindings-remaining-issues.md
---

# OCJS Link NCollection Over-binding Audit

Audit of how `NCollection_*<…>` template instantiations end up in a consumer WASM bundle, why the current `yaml_build.shouldProcessSymbol` filter pulls in NCollection specializations that are unreachable from the consumer YAML, and the bindgen-side change required to restore per-YAML reachability filtering.

## Executive Summary

The `replicad-opencascadejs` WASM rebuild (today) grew by **+2.26 MB (+9.94 %)** despite the consumer YAML (`custom_build_single.yml`) requesting only 226 symbols. Concrete tracing of `js.symbols` shows the bundle now contains NCollection specializations whose template arguments are classes the consumer YAML never references — for example `NCollection_DynamicArray<BRepGraphInc::VertexRef>` (BRepGraph is a Tau-fork extension replicad does not bind) and `NCollection_Sequence<XCAFDimTolObjects_DimensionModif>` (GD&T metadata replicad does not request).

The root cause is in `src/ocjs_bindgen/link/yaml_build.py::shouldProcessSymbol`: every symbol present in `build/ncollection-manifest.json` is **unconditionally** linked into every consumer build, regardless of whether the consumer YAML can reach it. The manifest is computed once during the upstream (full-scope) bindgen discovery pass, so it contains every NCollection specialization any bound OCCT class touches — not just those reachable from the consumer YAML.

**Concrete impact (replicad-single)**: of 596 entries in the manifest, only 151 (25 %) have template arguments fully in the replicad YAML scope; **445 (75 %) reference classes the YAML never requests** and are pure over-binding.

**Fix**: source-tag every manifest entry with its origin bound class(es) during discovery, then in the link step compute the YAML's reachable class scope and intersect. The change is isolated to `repos/opencascade.js` and benefits every consumer YAML (`opencascade_full`, `replicad_single`, future custom builds) without per-consumer config.

**Projected wasm savings (replicad-single)**: 1.3–2.2 MB recovered (at 3–5 KB per dropped NCollection class registration), which would offset most of the post-R8/R8.1 inflation observed in the [provenance diff](#provenance-evidence-the-recent-rebuild).

## Problem Statement

The post-R8/R8.1 + post-OCCT-V8_0_0 rebuild of `replicad_single.wasm` ([this conversation, Phase B](#provenance-evidence-the-recent-rebuild)) produced:

| Metric                       | Apr 23 baseline | May 18 fresh |                      Δ |
| ---------------------------- | --------------: | -----------: | ---------------------: |
| `replicad_single.wasm`       |        22.72 MB |     24.98 MB | **+2.26 MB (+9.94 %)** |
| `replicad_single.d.ts` lines |          46,926 |       88,606 |                +88.8 % |

The d.ts near-doubling is acceptable (richer typed surface = the whole point of R8/R8.1). The wasm growth of the same magnitude is **not** acceptable: type-safety gains belong in the `.d.ts`, not in shipped wasm. Concrete `js.symbols` inspection identified specific NCollection specializations in the bundle that the consumer YAML neither requests nor can reach via its bound class graph:

```text
NCollection_DynamicArray<BRepGraphInc::VertexRef>::EraseLast()
NCollection_Sequence<XCAFDimTolObjects_DimensionModif>&  ::internalCallWithPolicy(...)
```

Neither `BRepGraph*`, `BRepGraphInc*`, nor `XCAFDimTolObjects*` appears in [`custom_build_single.yml`](repos/replicad/packages/replicad-opencascadejs/build-config/custom_build_single.yml). Yet they ship in the bundle.

## Methodology

1. **Static walk of the link driver** — read `src/ocjs_bindgen/link/yaml_build.py` to identify how `compiled-bindings/*.cpp.o` files become link inputs.
2. **Static walk of the discovery driver** — read `src/ocjs_bindgen/discover.py` and `src/ocjs_bindgen/pipeline/generate.py` to identify how NCollection instantiations are collected and recorded in `build/ncollection-manifest.json`.
3. **Manifest forensics** — `jq` over `build/ncollection-manifest.json` to enumerate entries by OCCT package prefix, then `find build/compiled-bindings -name 'NCollection_*BRepGraph*.cpp.o'` to confirm the .o objects exist and are link-eligible.
4. **Reachability simulation** — Python script that walks `manifest.declarations[*].args`, decomposes each arg (strip `opencascade::handle<…>` wrapper, take leftmost `::`-separated component), and checks set-membership against the YAML's 226 requested symbols + a small primitive allowlist. Reported as a lower bound for the "naively reachable" subset.
5. **Provenance diff** — `git diff` over the previously committed `replicad_single.provenance.json` to enumerate every changed input between the Apr 23 baseline and the May 18 rebuild (OCCT version, bindgen commit, emcc flags).

All evidence is reproducible from a workspace at the current `HEAD` plus the just-completed `nx run ocjs:link` artifacts in `/Users/rifont/git/tau/repos/opencascade.js/build/`.

## Findings

### Finding 1 — The link step always includes the entire global NCollection manifest

`src/ocjs_bindgen/link/yaml_build.py:201-211`:

```python
def shouldProcessSymbol(symbol: str, bindings) -> bool:
  if symbol in _EMBIND_OCTYPE_ALIAS_TYPENAME_SKIPS:
    return False
  if len(bindings) == 0:
    return True
  if symbol in _auto_symbols:           # ← unconditional include
    return True
  entry = next((b for b in bindings if b["symbol"] == symbol), None)
  if not entry is None:
    return True
  return False
```

`_auto_symbols` is loaded once at module import time from `build/ncollection-manifest.json` (line 183). For any consumer YAML, every `.cpp.o` whose stem name is in that manifest is linked into the bundle. The YAML's own `bindings:` list is checked **only** for symbols that are NOT in the manifest.

This means the consumer YAML controls which **OCCT classes** get bound, but has zero control over which **NCollection specializations** get bound — those are decided by the upstream full-scope discovery pass.

### Finding 2 — The manifest is computed against the full bindgen filter, not per-YAML

`src/ocjs_bindgen/discover.py:276-335` (`discover_ncollection_types`):

```python
def discover_ncollection_types(tuInfo, filter_classes_fn):
    template_typedef_names = {td.spelling for td in tuInfo.templateTypedefs if td.spelling}
    needed = set()
    for child in tuInfo.allChildren:
        if not filter_classes_fn(child, False):    # ← uses the GLOBAL filterClasses predicate
            continue
        _scan_class_methods(child, needed, template_typedef_names)
    # R5 second pass — substitute template typedefs ...
    ...
    return _dedupe_by_canonical_args(augmented, tuInfo)
```

`filter_classes_fn` is `pipeline/generate.py::filterClasses`, which is driven by `filter.filterPackages` (the global OCCT package allowlist). Every bound class — across every OCCT package the full build enables — gets its methods scanned for NCollection signatures. The resulting set is written to `build/ncollection-manifest.json` and never re-narrowed.

This is correct **for the full build** (`opencascade_full`) — every bound class IS reachable in that consumer. It is wrong for **every other consumer YAML** that requests a subset.

### Finding 3 — Concrete over-binding in replicad-single

Manifest enumeration:

```bash
$ jq '.symbols | length' build/ncollection-manifest.json
596

$ find build/compiled-bindings -name 'NCollection_*.cpp.o' | wc -l
608
```

(608 vs 596 because of `_HARRAY_TO_ARRAY` HArray↔Array twinning in `discover.py:307-316` and a small number of orphan `myMain.h` overrides.)

Reachability simulation against replicad's 226-symbol YAML:

| Metric                                                                         |            Count |
| ------------------------------------------------------------------------------ | ---------------: |
| Manifest entries (compiled NCollection specializations)                        |              596 |
| Entries whose **all** template args are in the YAML scope (or primitives)      | **151 (25.3 %)** |
| Entries whose template args reference YAML-out-of-scope classes (over-binding) | **445 (74.7 %)** |

Sample over-bound entries (each NCollection is shipped in `replicad_single.wasm` despite its argument class being unreachable from the YAML):

| Manifest entry                                          | Out-of-scope arg                   | YAML requests this class? |
| ------------------------------------------------------- | ---------------------------------- | :-----------------------: |
| `NCollection_Array1_AppParCurves_ConstraintCouple`      | `AppParCurves_ConstraintCouple`    |            no             |
| `NCollection_Array1_ChFiDS_CircSection`                 | `ChFiDS_CircSection`               |            no             |
| `NCollection_Array1_HLRAlgo_PolyHidingData`             | `HLRAlgo_PolyHidingData`           |            no             |
| `NCollection_Array1_Plate_PinpointConstraint`           | `Plate_PinpointConstraint`         |            no             |
| `NCollection_Array1_StepAP203_*Item` (12 variants)      | `StepAP203_*Item`                  |            no             |
| `NCollection_DynamicArray_BRepGraphInc_VertexRef`       | `BRepGraphInc::VertexRef`          |            no             |
| `NCollection_Sequence_XCAFDimTolObjects_DimensionModif` | `XCAFDimTolObjects_DimensionModif` |            no             |

Categorisation of the 445 over-bound entries by argument package prefix (top buckets):

| Argument package                                                                                               | Over-bound NCollection count | YAML touches package?                                                          |
| -------------------------------------------------------------------------------------------------------------- | ---------------------------: | ------------------------------------------------------------------------------ |
| `StepAP203` / `StepAP214` / `StepBasic` / `StepRepr` / `StepShape` / `StepGeom` / `StepFEA` / `StepKinematics` |                         ~150 | partial — replicad uses `STEPControl_*` for I/O but not the typed-element APIs |
| `BRepGraph*` / `BRepGraphInc*` (Tau-fork extensions)                                                           |                           45 | no                                                                             |
| `Plate_*` / `NLPlate_*` / `FairCurve_*`                                                                        |                          ~25 | no                                                                             |
| `HLRAlgo_*` (Poly data structures)                                                                             |                          ~15 | partial — replicad uses `HLRAlgo_Projector` only                               |
| `ChFiDS_*` / `ChFiKPart_*` (fillet data)                                                                       |                          ~15 | no                                                                             |
| `AppParCurves_*` / `AppDef_*` (curve approximation)                                                            |                          ~10 | no                                                                             |
| `XCAFDimTolObjects_*` (GD&T metadata)                                                                          |                            3 | no                                                                             |
| Misc (`IGES*`, `BinObjMgt_*`, `Storage_*`, …)                                                                  |                         rest | no                                                                             |

### Finding 4 — The d.ts already knows: the `replace_undeclared_with_unknown` rewriter neutralises references to unbound types

`yaml_build.py:709-726` post-processes the assembled `.d.ts` and rewrites every reference to an unbound type to `unknown`:

```python
# Post-process to neutralize references to types not actually emitted in
# this build. Fragments are pre-generated against the FULL bindgen filter,
# so a per-build subset YAML (e.g. replicad_single) inherits references like
# `Standard_Type` that the subset never declares. Replace each with `unknown`
# (no value at runtime, structural fallback at type level) to keep the
# generated `.d.ts` semantically valid (zero TS2304/TS2552 diagnostics).
```

This is the **type-side** equivalent of the filtering this audit recommends — the d.ts pipeline already accepts "fragments pre-generated against the FULL bindgen filter, subset YAML inherits references the subset never declares" and rewrites them out. The wasm-side has no equivalent: the .o objects all get linked.

Symmetry argument: if the d.ts rewriter is the right design for type-level over-inclusion (and it is — type-level it costs `unknown`s, which we then narrow), then the link-step rewriter for object-level over-inclusion is the right design for wasm-level over-inclusion.

### Finding 5 — The `compile-bindings` step is correct and shared; the bug is purely at link time

`build/compiled-bindings/myMain.h/NCollection_*.cpp.o` files are compiled exactly once per `bindgen-filters.yaml` hash and reused across every consumer YAML via Nx caching. This is correct — compiling NCollection specializations is shared work; the binding code can serve any consumer.

The bug is in **which subset of the compiled .o set is selected at link time**, not in what is compiled. The fix does not touch the compile step, does not invalidate any cache, and does not require recompiling NCollection bindings. It only changes which .o files the link command receives.

### Finding 6 — Provenance evidence (the recent rebuild)

`git diff` over `replicad_single.provenance.json`:

| Field                          | Apr 23               | May 18                | Δ                                      |
| ------------------------------ | -------------------- | --------------------- | -------------------------------------- |
| OCCT                           | `0ebbbe…` V8_0_0_rc5 | `d3056e…` V8_0_0      | release bump                           |
| opencascade.js commit          | `36c69b…`            | `90ebce…`             | R8/R8.1, mimalloc, ~3 weeks of bindgen |
| `emccFlags`                    | (no `-sMALLOC`)      | `+ -sMALLOC=mimalloc` | mimalloc replaces dlmalloc             |
| `replicad_single.d.ts` lines   | 46,926               | 88,606                | **+88.8 %**                            |
| `replicad_single.d.ts` bytes   | 1.96 MB              | 3.77 MB               | +92 %                                  |
| `replicad_single.wasm` postOpt | 22.72 MB             | 24.98 MB              | **+9.94 %**                            |

Symbol-set diff (`cut -d: -f2 *.symbols | sort -u`) decomposes the +5,496 net new symbols (+18.8 %) as:

| Driver                                                                           | Δ symbols (net) |
| -------------------------------------------------------------------------------- | --------------: |
| Out-param shim lambdas (`embind_init_X()::$_N::__invoke(…, emscripten::val, …)`) |            +891 |
| NCollection template instantiations (Handle-aware Array1/Sequence/DataMap/…)     |      **+2,509** |
| `embind_init_*` class init functions                                             |          +1,923 |
| mimalloc runtime (`_mi_*` / `mi_*`)                                              |            +106 |

NCollection instantiations are the single largest contributor. The link-side filter proposed below targets exactly this category and is expected to recover most of the +2.26 MB.

## Root Cause

The `_auto_symbols` set in `yaml_build.py` was introduced (likely alongside R5 — the template-typedef substitution pass) to ensure that auto-discovered NCollection specializations that aren't named in the YAML still get linked. The semantics chosen at the time were "if `discover.py` discovered it, link it." That was fine when most consumers were the full build; it becomes a regression as consumer YAMLs proliferate (replicad-single, future per-app subsets) and the divergence between "discovered-against-full" and "reachable-from-consumer-YAML" grows.

The fix is to qualify each manifest entry with its discovery source — which bound class's methods caused this NCollection to be discovered — and let the link step compute the YAML's reachable class scope and intersect.

## Recommendations

| #      | Action                                                                                                                                                                  | Priority | Effort | Impact                                                                                                           |
| ------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------- | ------ | ---------------------------------------------------------------------------------------------------------------- |
| **R1** | Source-tag every manifest entry with the bound class(es) it was discovered from; add `declarations[i].source_classes: list[str]` to `build/ncollection-manifest.json`   | **P0**   | M      | Enables R2; no behaviour change on its own                                                                       |
| **R2** | In `yaml_build.py`, compute the YAML's reachable class scope and intersect with each manifest entry's `source_classes`; drop entries with empty intersection            | **P0**   | M      | Recovers ~1.3–2.2 MB of `replicad_single.wasm`; no change to full build                                          |
| **R3** | Tag custom-code (`additionalCppCode` / `myMain.h`) discoveries with a sentinel source `__custom__` so they're always retained regardless of YAML scope                  | **P0**   | S      | Prevents regressions when a YAML's custom C++ legitimately uses an NCollection not named in the YAML symbol list |
| **R4** | Add a `tests/sentinel/` assertion comparing the linked NCollection set against the YAML reachability set; fails CI if a YAML pulls in an unreachable NCollection        | **P1**   | S      | Locks the fix in place; prevents future regressions if discover/link logic drifts                                |
| **R5** | Surface per-YAML over-binding stats in the provenance JSON (`provenance.linking.dropped_unreachable_ncollections: N`)                                                   | **P2**   | XS     | Observability — makes future audits trivial                                                                      |
| **R6** | Remove the `_EMBIND_OCTYPE_ALIAS_TYPENAME_SKIPS` hardcoded list once R2 lands and confirms BRepGraph alias collisions never reach the link step for non-BRepGraph YAMLs | **P3**   | XS     | Code cleanup; current list is a name-by-name band-aid for the same root cause                                    |

## Design

### R1 — Source-tag manifest entries

`discover.py::_scan_class_methods` already knows the source class (it's the `class_cursor` argument). Thread that through the `needed` set as a fourth tuple element.

Before:

```python
def _scan_class_methods(class_cursor, needed, template_typedef_names=None):
    ...
    needed.add((mangled, container, tuple(arg_spellings)))   # 3-tuple
```

After:

```python
def _scan_class_methods(class_cursor, needed, template_typedef_names=None):
    source_class = class_cursor.spelling or "<anon>"
    ...
    needed.add((mangled, container, tuple(arg_spellings), source_class))   # 4-tuple
```

`discover_ncollection_types` collapses the 4-tuples to a `dict[(mangled, container, args), set[source_class]]` during the existing dedup pass, and `write_manifest` emits:

```json
{
  "mangled_name": "NCollection_DynamicArray_BRepGraphInc_VertexRef",
  "container": "NCollection_DynamicArray",
  "args": ["BRepGraphInc_VertexRef"],
  "source_classes": ["BRepGraph_FacesOfEdge", "BRepGraph_VerticesOfEdge"]
}
```

R5's template-typedef pass already passes the typedef name through; tag those entries with the typedef as the source class.

### R2 — Per-YAML reachability filter at link time

`yaml_build.py` changes:

```python
def _compute_yaml_class_scope(buildConfig, libraryBasePath) -> set[str]:
    """Set of class names reachable from the consumer YAML.

    = YAML mainBuild.bindings ∪ extraBuilds.bindings
      ∪ ancestor chains (from compile-bindings/<sym>.d.ts.json ancestors)
      ∪ class names AST-discovered from additionalCppCode (myMain.h scan)
      ∪ {"__custom__"} sentinel for custom-code-sourced NCollections
    """
    scope = {b["symbol"] for b in buildConfig["mainBuild"]["bindings"]}
    for extra in buildConfig.get("extraBuilds", []):
        scope.update(b["symbol"] for b in extra["bindings"])
    # Ancestor lift — d.ts.json fragments already serialise this.
    for sym in list(scope):
        ancestors_path = f"{libraryBasePath}/bindings/.../{sym}.d.ts.json"
        ...   # read .ancestors[sym] and union into scope
    # Custom-code classes — already extracted by generateCustomCodeBindings.
    scope.add("__custom__")
    return scope

def _filter_auto_symbols_by_scope(manifest_path: str, yaml_scope: set[str]) -> set[str]:
    """Keep only manifest entries whose source_classes intersect yaml_scope.

    Transitive closure: an NCollection whose container is itself an NCollection
    (e.g. NCollection_DataMap<X, NCollection_List<Y>>) is kept iff every nested
    NCollection in its args is also kept.
    """
    if not os.path.isfile(manifest_path):
        return set()
    with open(manifest_path) as f:
        manifest = json.load(f)
    by_mangled = {d["mangled_name"]: d for d in manifest["declarations"]}
    kept = set()
    # First pass — direct source-class intersection.
    for d in manifest["declarations"]:
        sources = set(d.get("source_classes", []))
        if not sources or sources & yaml_scope:
            kept.add(d["mangled_name"])
    # Second pass — close over nested NCollection<NCollection<...>> via args.
    changed = True
    while changed:
        changed = False
        for d in manifest["declarations"]:
            if d["mangled_name"] in kept:
                continue
            referenced = {a for a in d["args"] if a.startswith("NCollection_")}
            if referenced and referenced.issubset(kept):
                kept.add(d["mangled_name"])
                changed = True
    return kept

# Replace the existing module-level load:
_auto_symbols = _filter_auto_symbols_by_scope(
    os.path.join(BUILD_DIR, "ncollection-manifest.json"),
    _compute_yaml_class_scope(buildConfig, libraryBasePath),
)
```

Backwards-compatibility guard: if `declarations[i].source_classes` is missing (older manifest from a pre-R1 cache), fall back to the current "include all" behaviour. The generator hash check in `pipeline/generate.py::_check_generator_hash_and_clean` already purges stale fragments when bindgen code changes, so the missing-key path is transient.

### R3 — `__custom__` sentinel for additionalCppCode discoveries

The discover pass in `pipeline/generate.py::generateCustomCodeBindings` already runs against the consumer-specific `myMain.h`. Tag every NCollection discovered during that pass with `source_classes: ["__custom__"]` so R2's filter unconditionally retains them.

### R4 — Sentinel test

`tests/sentinel/test_link_ncollection_reachability.py` (new):

```python
def test_replicad_no_unreachable_ncollections():
    yaml_scope = load_yaml_scope("replicad/.../custom_build_single.yml")
    manifest = json.load(open("build/ncollection-manifest.json"))
    linked = set(extract_linked_ncollection_symbols("dist/replicad_single.js.symbols"))
    for sym in linked:
        decl = find(manifest, sym)
        sources = set(decl["source_classes"])
        assert sources & yaml_scope, f"{sym} linked but unreachable from YAML (sources: {sources})"
```

A simpler smoke variant: assert `len(linked) <= 1.1 * naive_reachable_count` so future drift fails CI before it ships.

### Why this is the architecturally correct fix

- **Source-of-truth at the discovery site.** The bound class is the canonical reason an NCollection<X> needs to exist. Capturing it at discovery time is the cheapest and most precise possible filter.
- **Symmetric with the existing d.ts rewriter.** `replace_undeclared_with_unknown` already accepts the "fragments-against-full, narrow-per-YAML" pattern at the type level. R2 mirrors it at the link level.
- **Zero touch on the cache-warm upstream.** Compile-bindings continues to produce the same .o set; only the link command receives a smaller subset.
- **Benefits propagate automatically.** Every consumer YAML (`opencascade_full`, `replicad_single`, future per-app subsets) gets the right scope without per-consumer config — `opencascade_full` happens to have every class in scope, so its linked set is unchanged.
- **No backwards-compat debt.** All consumer YAMLs already declare their `bindings:` list; the filter reads what's already there. No YAML schema change required.

## Trade-offs

| Concern                                                                                                                                                              | Mitigation                                                                                                                                                                      |
| -------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Reachability under-estimation could break a YAML that uses an NCollection via a method whose declaring class is implicit (e.g. via inheritance from an unbound base) | Compute ancestor closure from existing `.d.ts.json` fragments (which already serialise `ancestors`); add R4 sentinel as runtime regression net.                                 |
| Custom-code (`additionalCppCode`) using an NCollection whose template arg isn't in YAML bindings                                                                     | R3: tag with `__custom__` and always retain.                                                                                                                                    |
| Manifest format change breaks older caches                                                                                                                           | Backwards-compat fallback to "include all" when `source_classes` is missing; `_check_generator_hash_and_clean` already invalidates stale fragments when generator code changes. |
| Reduced wasm = fewer linked classes = potential `Cannot register type ... twice` regressions if R5's typedef-alias dedup relied on every NCollection being present   | R5's dedup is intra-manifest (`_dedupe_by_canonical_args`) and runs before the link step's filter — independent.                                                                |
| Per-YAML link cache keys must include the filter result                                                                                                              | Already handled — the link step's Nx cache key already includes `OCJS_YAML`; the filter is a pure function of `(manifest, yaml_scope)`.                                         |

## Expected Impact

| Build              | Linked NCollection count (current) |              Linked NCollection count (after R2) |                           Δ |
| ------------------ | ---------------------------------: | -----------------------------------------------: | --------------------------: |
| `opencascade_full` |                                596 |                                              596 | 0 (every class is in scope) |
| `replicad_single`  |                                596 | ~180 (151 direct + ~30 transitive/ancestor lift) |                    **−416** |

Estimated wasm impact (replicad_single):

| Component                                                       | Per-NCollection cost (wasm) | Total dropped |          Estimated savings |
| --------------------------------------------------------------- | --------------------------: | ------------: | -------------------------: |
| `embind_init_NCollection_X` init function + lambda thunks       |                   ~1.5–3 KB |           416 |                 0.6–1.2 MB |
| `NCollection_X<…>::Append/Value/Length/IsEmpty/…` method bodies |                     ~1–2 KB |           416 |                 0.4–0.8 MB |
| `raw_destructor<NCollection_X>` explicit specializations        |                 ~0.3–0.5 KB |           416 |                 0.1–0.2 MB |
| **Total estimated wasm savings**                                |                             |               | **≈ 1.1–2.2 MB (≈ 5–9 %)** |

Recovers the **majority** of the +2.26 MB post-rebuild inflation observed in [Finding 6](#finding-6--provenance-evidence-the-recent-rebuild) — while preserving every functional gain from R8/R8.1 (out-param shim lambdas remain), mimalloc (allocator unchanged), and OCCT V8_0_0 (release bump unchanged).

For the full build, expected impact is **zero** — every NCollection's `source_classes` intersect with the full YAML scope by construction.

## Implementation Plan

| Phase                            | Step                                                                                                                                                                                    | Validation                                                                                                                                                                                  |
| -------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **A — R1 manifest extension**    | Add `source_class` 4-tuple element through `_scan_class_methods`, `_scan_template_typedef_methods`, and `discover_ncollection_types`. Update `write_manifest` to emit `source_classes`. | `pytest tests/test_discover.py` — assert manifest entries carry non-empty source_classes for representative samples (Adaptor3d_Curve, BRepGraph_FacesOfEdge).                               |
| **B — R3 custom-code sentinel**  | In `generateCustomCodeBindings`, tag discoveries with `source_classes: ["__custom__"]` before writing fragment.                                                                         | Add unit test using a minimal `additionalCppCode` with one NCollection-touching method.                                                                                                     |
| **C — R2 link filter**           | Add `_compute_yaml_class_scope` and `_filter_auto_symbols_by_scope`; replace module-level `_auto_symbols` load with per-build invocation inside `main()`.                               | `nx run ocjs:link` against both `opencascade_full.yml` and `custom_build_single.yml`; assert (i) `opencascade_full` symbol count unchanged, (ii) `replicad_single` symbol count drops ~416. |
| **D — R4 sentinel test**         | Add `tests/sentinel/test_link_ncollection_reachability.py`.                                                                                                                             | Run the test against current `dist/` and `repos/replicad/.../src/`; pass for both.                                                                                                          |
| **E — R5 provenance**            | Add `dropped_unreachable_ncollections` count to `provenance.linking`.                                                                                                                   | Read provenance JSON post-build; assert key present.                                                                                                                                        |
| **F — Full WASM rebuild + diff** | Rebuild `opencascade_full` (cache-warm except link), then `replicad_single` (same), capture wasm size deltas, run existing vitest suite + sentinel.                                     | `tests/sentinel/refresh_baseline.py` to update size sentinels; replicad smoke test (`new oc.gp_Pnt(1,2,3)`) passes.                                                                         |
| **G — Cleanup R6**               | Audit `_EMBIND_OCTYPE_ALIAS_TYPENAME_SKIPS`; remove entries no longer needed once R2 keeps them out of non-BRepGraph YAMLs.                                                             | Sentinel still green; vitest still green.                                                                                                                                                   |

Build cost: phases A–E are cache-warm except for two link re-runs (~3–6 min each on cached upstream). Phase F is the only one that may take longer if `compile-bindings` invalidates (it shouldn't — the change is link-only).

## Non-goals

- **Not** changing the OCCT package allowlist (`bindgen-filters.yaml`) — that's the right tool for "this OCCT package isn't needed by anyone." This audit addresses "this NCollection isn't needed by THIS consumer."
- **Not** removing R5's template-typedef pass — that's a separate concern (alias-form NCollection discovery) and continues to work as-is; R1's source-tagging just records the typedef as the source.
- **Not** restructuring `compile-bindings` to compile only YAML-reachable .o's — that would break Nx caching across consumer YAMLs and double the compile cost when a new YAML lands. Per-YAML link-time filtering is the correct layer.
- **Not** committing replicad rebuild artifacts — replicad rebuild stays a separate concern; this audit is about fixing the bindgen, after which a fresh replicad rebuild can capture the wasm-size win.

## References

- [Replicad rebuild provenance diff (this conversation)](#provenance-evidence-the-recent-rebuild)
- Related research: `docs/research/ocjs-bindings-wasm-applicability-audit.md` (the R1/R2/R4 package-level filter that addresses the orthogonal "OCCT package not needed at all" axis)
- Related research: `docs/research/ocjs-bindgen-unknown-coverage-audit-v2.md` (the R8/R8.1 work whose lambda thunks drove the symbol-count growth this audit isolates)
- Related research: `docs/research/ocjs-v8-bindings-remaining-issues.md` (the canonical issue tracker — recommend adding "R9: per-YAML NCollection reachability filter" once this audit's R1+R2 land)

## Appendix A — Manifest entry breakdown by OCCT package

Full categorisation of the 596 manifest entries by the leftmost package prefix of the first template argument (after stripping `opencascade::handle<…>`):

| Package prefix                                           | NCollection entries | In replicad YAML? |
| -------------------------------------------------------- | ------------------: | :---------------: |
| `TopoDS` / `TopAbs`                                      |                  23 |        yes        |
| `TCollection`                                            |                  23 |      partial      |
| `BRepGraph` / `BRepGraphInc`                             |                  45 |        no         |
| `BOPDS`                                                  |                  15 |        no         |
| `gp`                                                     |                   9 |        yes        |
| `TDF`                                                    |                   7 |      partial      |
| `IntTools`                                               |                   7 |        no         |
| `Extrema`                                                |                   3 |        yes        |
| `XCAFDimTolObjects`                                      |                   3 |        no         |
| `IntSurf`                                                |                   3 |        no         |
| `HLRAlgo`                                                |                   2 |      partial      |
| `BRepMesh`                                               |                   2 |        yes        |
| `BOPTools`                                               |                   2 |        no         |
| `Standard`                                               |                   1 |        yes        |
| `ShapeFix`                                               |                   1 |        yes        |
| `RWGltf`                                                 |                   1 |        no         |
| `Poly`                                                   |                   1 |        yes        |
| `StepAP203` / `StepAP214` / `StepFEA` / `StepKinematics` |                ~150 |        no         |
| `Plate` / `NLPlate` / `FairCurve`                        |                 ~25 |        no         |
| `ChFiDS` / `ChFiKPart`                                   |                 ~15 |        no         |
| `AppParCurves` / `AppDef`                                |                 ~10 |        no         |
| `IGES*` / `BinObjMgt_*` / `Storage_*` / misc             |                ~250 |     mostly no     |

Filed numbers are approximate where suffix matching crossed package boundaries; the 596 total is exact.

## Appendix B — Reproduction script

```bash
# 1. Verify manifest contents
jq '.symbols | length' repos/opencascade.js/build/ncollection-manifest.json
jq -r '.symbols[] | select(test("BRepGraph"))' repos/opencascade.js/build/ncollection-manifest.json

# 2. Verify .o objects exist
find repos/opencascade.js/build/compiled-bindings -name 'NCollection_*BRepGraph*.cpp.o' | wc -l

# 3. Verify symbols ship in replicad bundle
rg 'BRepGraphInc' repos/replicad/packages/replicad-opencascadejs/src/replicad_single.js.symbols | head

# 4. Reachability simulation
python3 - <<'PY'
import json, re
syms = set(open('/tmp/replicad-yaml-syms.txt').read().split())
PRIMITIVES = {'int','double','float','bool','Standard_Integer','Standard_Real',
              'Standard_Boolean','Standard_ShortReal','Standard_Character',
              'Standard_Byte','Standard_Address','Standard_GUID'}
def root(arg):
  a = arg.replace('opencascade::handle<','').replace('occ::handle<','').rstrip('>')
  return re.sub(r'<.*','',a).strip().split('::')[0]
m = json.load(open('repos/opencascade.js/build/ncollection-manifest.json'))
kept = sum(1 for d in m['declarations']
           if all(root(a) in syms | PRIMITIVES or root(a).startswith('NCollection_') or root(a) == ''
                  for a in d['args']))
print(f'manifest {len(m["declarations"])}, naively reachable {kept}, '
      f'over-bound {len(m["declarations"]) - kept}')
PY
```
