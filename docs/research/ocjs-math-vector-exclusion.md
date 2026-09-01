---
title: 'OCJS math_Vector Exclusion: Retiring 4 Dead Approx_ComputeLine Bindings'
description: 'Why 4 internal Approx_ComputeLine template instantiations are filter-excluded from the OCJS bindgen — their ctors take an unbound const math_Vector& — and the 4 sub-2b regression pins they backed are retired.'
status: active
created: '2026-05-29'
updated: '2026-05-29'
category: investigation
related:
  - docs/research/ocjs-phase-4-build-outcome.md
  - docs/research/ocjs-occt-surface-audit.md
---

# OCJS math_Vector Exclusion: Retiring 4 Dead Approx_ComputeLine Bindings

Why four internal `Approx_ComputeLine` template instantiations are permanently unreachable from JS, why their sub-2b regression pins are retired rather than fixed, and what (if anything) is lost.

## Executive Summary

Four OCCT classes that the sub-2b regression-pin generator was emitting `it.skip` pins for are **permanently unreachable from JS**, not merely pending a dispatch fix. Each is an internal `Approx_ComputeLine` template instantiation whose every constructor overload takes a `const math_Vector&` parameter. `math_Vector`'s underlying type is `math_VectorBase<double>` (mangled `15math_VectorBaseIdE`), which the bindgen never emits because template-typedef discovery is gated on the `NCOLLECTION_CONTAINERS` allowlist and the generic template-typedef discovery follow-up (tracked as R9 in the optional-overload blueprint) never landed. Every call shape therefore throws `Cannot construct ... due to unbound types`. These are dead `class_<>` registrations, not live dispatch surfaces, so the pins test nothing. We filter-exclude the 4 classes at the bindgen layer and retire the 4 pins; no public CAD modeling capability is lost.

## The 4 Excluded Classes

| Class                                     | Module     | Role                                                                    |
| ----------------------------------------- | ---------- | ----------------------------------------------------------------------- |
| `BRepApprox_TheComputeLineOfApprox`       | TKTopAlgo  | B-Rep approximation Walking-Line compute-line helper                    |
| `BRepApprox_TheComputeLineBezierOfApprox` | TKTopAlgo  | B-Rep approximation Bezier compute-line helper                          |
| `GeomInt_TheComputeLineOfWLApprox`        | TKGeomAlgo | `GeomInt` surface/surface intersection Walking-Line compute-line helper |
| `GeomInt_TheComputeLineBezierOfWLApprox`  | TKGeomAlgo | `GeomInt` surface/surface intersection Bezier compute-line helper       |

All four are internal `Approx_ComputeLine` template instantiations used inside the Walking-Line intersection / B-Rep approximation pipelines. None is ever user-constructed in normal OCCT usage.

## Problem Statement

`scripts/generate-sub2b-regression-pins.py` emitted `it.skip` regression pins for these 4 classes with a skip-reason noting they "reach an unbound base class (`math_VectorBase<double>`)". A sub-2b pin's job is to prove the bindgen's sibling-aliasing dispatch routes a larger-arity ctor correctly versus its smaller-arity sibling. But if the ctor cannot be invoked from JS _at all_, there is no dispatch to test — the pin is dead weight that re-appears on every regeneration.

## Root Cause

The constructors of all four classes accept `const math_Vector&`. In OCCT, `math_Vector` resolves to `math_VectorBase<double>` (Itanium-mangled `15math_VectorBaseIdE`). The bindgen never binds this type:

- Template-typedef discovery (the mechanism that would surface `math_VectorBase<double>` as a bindable type) is keyed on the `NCOLLECTION_CONTAINERS` allowlist.
- The generic template-typedef discovery fix (R9 in `docs/research/ocjs-optional-overload-resolution-blueprint.md`) — which would discover arbitrary template instantiations beyond the NCollection allowlist — never landed.

With the base type unbound, every JS call shape (`new oc.BRepApprox_TheComputeLineOfApprox(...)`, etc.) throws `Cannot construct ... due to unbound types`. The `class_<>` registration exists in the linked artifact but is uninvokable: a dead binding.

## Impact Scope

| Tier                       | Scope                                                            | Effect                                                                                                                                                                                                                                           |
| -------------------------- | ---------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Tier 1                     | These 4 internal `Approx_ComputeLine` helpers                    | Uninvokable from JS. No loss — they are never user-constructed; the public B-Rep approximation (`BRepBuilderAPI`/`BRepApprox` higher-level APIs) and `GeomInt`/`GeomAPI` surface/surface intersection APIs that drive them remain fully exposed. |
| Tier 2                     | TKMath `math_Matrix` / `math_SVD` / similar vector-typed methods | Methods that take or return `math_Vector` render as `unknown` in the `.d.ts`. These are low-level linear-algebra primitives, not CAD modeling surfaces.                                                                                          |
| Public modeling capability | —                                                                | None lost. Curve/surface approximation and surface/surface intersection are reached through their public façades, which do not require constructing these internal helpers.                                                                      |

## Resolution

1. **Filter exclusion (realized at next rebuild).** The 4 classes are added to `exclude.classes` in `repos/opencascade.js/bindgen-filters.yaml`, with a self-documenting block comment citing the `math_Vector` / `math_VectorBase<double>` root cause and the NCollection-allowlist discovery gap. The `bindgen-filters-no-deprecated.yaml` overlay inherits this via `extends: bindgen-filters.yaml`, and `build-wasm.sh` defaults to the base config — so production builds are covered by the single base-file edit. **The dead `class_<>` registrations remain in the current `dist/` artifacts until the next WASM rebuild picks up the filter change; the exclusion is realized at rebuild time.**

2. **Generator skip-set (idempotent).** `scripts/generate-sub2b-regression-pins.py` gains a `_BINDGEN_EXCLUDED_CLASSES` frozenset; the emit loop skips these 4 so regeneration never re-introduces the retired pins. The inventory itself is retained (the audit-count validation still reflects the surface audit's enumeration); the classes are skipped only at emit time.

3. **Pins retired.** The 4 `tests/regression/sub-2b/test_<ClassName>.test.ts` files are removed and `MANIFEST.txt` regenerated (down from 15 to 11 entries). The sub-2b suite now runs 11 pins with **0 skips** (previously 4 skips), all passing.

## Durable Fix Path

If direct TKMath vector access (or these `Approx_ComputeLine` helpers specifically) ever becomes a real consumer need, the durable include-path fix is **R9: generic template-typedef discovery** — discovering arbitrary template instantiations such as `math_VectorBase<double>` rather than restricting discovery to the `NCOLLECTION_CONTAINERS` allowlist. That would make `math_Vector` bindable and these constructors reachable, at which point the regression pins could be re-introduced with real fixtures. Until then, exclusion is the correct treatment.

## References

- Root-cause lineage: `docs/research/ocjs-phase-4-build-outcome.md`
- Surface audit (sub-2b enumeration): `docs/research/ocjs-occt-surface-audit.md`
- Generic template-typedef discovery (R9): `docs/research/ocjs-optional-overload-resolution-blueprint.md`
- Filter config: `repos/opencascade.js/bindgen-filters.yaml`
- Pin generator: `repos/opencascade.js/scripts/generate-sub2b-regression-pins.py`
