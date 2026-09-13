---
title: 'SysML v2 Spec Architecture v2 — File-First, Code-First, Agent-Native'
description: "A clean-slate architecture proposal for SysML v2 as Tau's primary specification, requirements, and verification language. Replaces test.json with a file-based, TDD-driven, scriptable engineering specification surface aligned with Tau's vision-policy.md."
status: draft
created: '2026-04-23'
updated: '2026-06-01'
category: architecture
related:
  - docs/policy/vision-policy.md
  - docs/research/geospec-standalone-cad-testing-blueprint.md
  - docs/research/vitest-style-parameter-geometry-testing-blueprint.md
  - docs/research/sysml-driven-cad-spec.md
  - docs/policy/testing-policy.md
  - docs/policy/library-api-policy.md
---

# SysML v2 Spec Architecture v2 — File-First, Code-First, Agent-Native

A clean-slate proposal for Tau's specification, requirements, and verification surface that adopts OMG SysML v2 textual notation as a first-class file primitive across all five vision pillars (systems, analysis, MCAD, ECAD, firmware), replacing the current `test.json` testing surface and unlocking the systems-engineering Phase 3 a release earlier than Phase 1's current trajectory implies.

This document **supersedes the additive recommendation** in `sysml-driven-cad-spec.md` (Findings 1–6 there). The earlier doc treated SysML as an extension of Tau's geometry-only `MeasurementTestRequirement` schema; user feedback redirected the investigation toward what SysML v2 makes possible if we redesign the spec layer around it instead of grafting it on.

## Executive Summary

**Finding.** SysML v2 became an OMG formal standard in September 2025. Its textual notation (KerML/SysML v2) is the only open, vendor-neutral, code-first, browser-compatible engineering specification language with: (a) a typed quantity-and-unit kernel (ISO 80000 / SI / ISQ); (b) first-class `requirement def` / `verification case` / `analysis case` / `assert constraint` constructs; (c) a TypeScript Langium parser that already runs in the browser (Sensmetry's `sysml-2ls`); and (d) a published `.sysml` file convention with package import semantics. Atopile and tscircuit prove that "engineering spec as a typed code file with assert-driven units and tolerances" works at production scale in EDA; SysML v2 generalises the same pattern across every pillar.

**Recommendation.** Make `.sysml` files the **canonical authoring surface** for all of Tau's specifications: requirements, tolerances, verification cases, analysis cases, mass/COM budgets, clearance constraints, and acceptance criteria. The current `test.json` becomes a generated artifact (or is retired entirely). A new `@taucad/spec` package owns parsing/typed-IR via Langium; a `@taucad/spec-runtime` package executes verification cases against pluggable evidence providers (geometry analyser, FEA kernel, ECAD DRC, firmware simulator). The chat agent gains `edit_spec` / `verify_spec` tools that operate on `.sysml` files with in-process parser feedback — the SysTemp multi-agent loop (TemplateGenerator → Writer → Parser) maps directly onto Tau's existing `edit_file` / `test_model` cadence.

**2026-06-01 geometry-provider alignment.** GeoSpec is the target MCAD evidence provider beneath `@taucad/spec-runtime`: it owns mesh, BRep, STEP/AP242, distance, mate/frame, and manufacturing-rule assertions. `@taucad/testing` remains the Tau adapter that can render a `GeometryArtifact` from Tau projects and bridge legacy `test.json`/chat-tool flows. In this doc, older references to `packages/testing` as the geometry analyser should now be read as "GeoSpec through the Tau adapter."

**Why now.** Phases 2–6 of `vision-policy.md` (analysis, systems, ECAD, firmware, robotics) all require a **single cross-discipline specification spine** that survives handoffs without losing fidelity. `test.json` was scoped to geometry checks on one GLB; it cannot express a thermal limit that propagates from a stress analysis into a firmware temperature-protection setpoint. SysML v2 was designed for exactly that propagation. Picking the spec spine before Phase 2 starts is cheaper than retrofitting it once five kernels have shipped against an ad-hoc schema.

## Table of Contents

- [Executive Summary](#executive-summary)
- [Problem Statement](#problem-statement)
- [Methodology](#methodology)
- [Findings](#findings)
  - [F1: SysML v2 is the only OMG-formalised, code-first cross-discipline spec language](#f1-sysml-v2-is-the-only-omg-formalised-code-first-cross-discipline-spec-language)
  - [F2: SysML v2 textual notation is browser-embeddable today](#f2-sysml-v2-textual-notation-is-browser-embeddable-today)
  - [F3: Atopile is the production proof-point for "engineering as code with units and assertions"](#f3-atopile-is-the-production-proof-point-for-engineering-as-code-with-units-and-assertions)
  - [F4: Code-first MCAD ecosystems have not solved assembly-level verification](#f4-code-first-mcad-ecosystems-have-not-solved-assembly-level-verification)
  - [F5: SysML v2 verification semantics fit TDD and property-based testing natively](#f5-sysml-v2-verification-semantics-fit-tdd-and-property-based-testing-natively)
  - [F6: Tau's current test.json schema cannot express any Phase-2 requirement](#f6-taus-current-testjson-schema-cannot-express-any-phase-2-requirement)
  - [F7: LLM authoring of SysML v2 is a solved-shape problem (SysTemp pattern)](#f7-llm-authoring-of-sysml-v2-is-a-solved-shape-problem-systemp-pattern)
- [Target Architecture](#target-architecture)
  - [Layer 1: `.sysml` files as a first-class file primitive](#layer-1-sysml-files-as-a-first-class-file-primitive)
  - [Layer 2: `@taucad/spec` parser and typed IR](#layer-2-taucadspec-parser-and-typed-ir)
  - [Layer 3: `@taucad/spec-runtime` evidence dispatcher](#layer-3-taucadspec-runtime-evidence-dispatcher)
  - [Layer 4: Evidence providers (kernels, analysers, simulators)](#layer-4-evidence-providers-kernels-analysers-simulators)
  - [Layer 5: Agent surface (chat tools, system prompt)](#layer-5-agent-surface-chat-tools-system-prompt)
  - [Layer 6: CLI and CI surface](#layer-6-cli-and-ci-surface)
- [Code Examples](#code-examples)
  - [Authoring example: bracket assembly with mass + clearance + watertight requirements](#authoring-example-bracket-assembly-with-mass--clearance--watertight-requirements)
  - [Property-based testing via parameter sweeps](#property-based-testing-via-parameter-sweeps)
  - [Cross-discipline example: enclosure spec referencing PCB dimensions](#cross-discipline-example-enclosure-spec-referencing-pcb-dimensions)
- [Diagrams](#diagrams)
- [Migration Roadmap](#migration-roadmap)
- [Trade-offs](#trade-offs)
- [Risks and Mitigations](#risks-and-mitigations)
- [Recommendations](#recommendations)
- [References](#references)
- [Appendix A: Atopile assert grammar reference](#appendix-a-atopile-assert-grammar-reference)
- [Appendix B: SysML v2 keyword inventory](#appendix-b-sysml-v2-keyword-inventory)

## Problem Statement

Tau's current testing surface (`packages/testing` + per-project `test.json`) was sized for a single geometry artifact:

```json
{
  "main.ts": {
    "requirements": [
      {
        "id": "req_width",
        "type": "measurement",
        "check": "boundingBox",
        "expected": { "size": { "x": 100 } },
        "tolerance": 1
      },
      { "id": "req_watertight", "type": "measurement", "check": "watertight" }
    ]
  }
}
```

This serves the agent loop well for "render a cube 100mm wide and verify". It cannot express any of the following, all of which are in scope for Phases 2–6 of `docs/policy/vision-policy.md`:

1. **Cross-part assembly constraints** — "the heat sink must clear the connector by ≥ 2 mm" requires referencing two distinct geometry units in one assertion.
2. **Quantity-typed budgets with units** — "total mass < 200 g (±5%)" needs unit conversion, dimensional analysis, and tolerance arithmetic; today the schema accepts a bare number with no unit.
3. **Cross-discipline traceability** — "if the FEA stress at the bracket exceeds 200 MPa, the firmware must reduce the duty cycle to 60 %" requires a single requirement that spans an analysis case (FEA) and a firmware property.
4. **Parametric verification** — "for every wall thickness in [1.5, 2.0, 2.5, 3.0] mm, mass < 200 g and stress < 150 MPa" requires sweeps over the parameter file format already present in `.tau/parameters/<entry>.json` but unconnected to test requirements.
5. **Verdict semantics beyond pass/fail** — `inconclusive` (assumption violated, e.g. stress test ran but mesh quality was insufficient) and `error` (the analyser itself failed) are first-class in engineering verification but are squashed into `pass: false` by the current schema.
6. **Requirement composition** — large systems are decomposed into nested requirement groups ("Performance → Thermal → Idle Temperature ≤ 45 °C"); flat per-file `requirements: []` arrays do not compose.
7. **Subject reuse across verification methods** — a single "max mass" requirement may be verified by inspection (BOM table), analysis (mass roll-up), and test (scale measurement); each method is an independent verification case with its own evidence path. The current schema collapses all three into one row.

The earlier research document (`sysml-driven-cad-spec.md`) proposed extending the existing schema to cover (1)–(7). User feedback rejected that approach: extending a schema that was built for one narrow case while another community has spent a decade producing a formal standard for the general case is a strict regression in long-term agility. This document re-asks the question: **what does the spec layer look like if we let SysML v2 lead?**

Out-of-scope non-goals to keep this focused:

- **In scope**: spec authoring surface (file format, IR), verification execution semantics, agent-tool surface, evidence-provider plugin contract, MCAD/ECAD/FEA hooks (Phases 1–4).
- **Out of scope**: graphical SysML editor, full SysML v2 API & Services REST server, formal proof obligations on `assert constraint`, SysML v1 interop, requirements-management imports from DOORS / Polarion.

## Methodology

Investigation proceeded in three passes.

**Pass 1 — Standard and tooling baseline.** Read OMG SysML v2 specification status (formal release September 2025), the textual BNF (`repos/SysML-v2-Release/bnf/SysML-textual-bnf.kebnf`, 1705 lines) and KerML BNF (1467 lines). Surveyed the SysML standard library (`repos/SysML-v2-Release/sysml.library/`): `Quantities and Units`, `Domain Libraries/Geometry/ShapeItems.sysml`, `Systems Library/Requirements.sysml`, `Systems Library/VerificationCases.sysml`, `Systems Library/AnalysisCases.sysml`. Catalogued example models in `repos/SysML-v2-Release/sysml/src/examples/` — particularly the `Vehicle Analysis Demo`, `MassRollup`, `HSUVRequirements`, and `CarWithEnvelopingShape`.

**Pass 2 — Browser-side parser and tooling assessment.** Identified Sensmetry's `sysml-2ls` (TypeScript + Langium) as the only OSS browser-embeddable SysML v2 parser/language server; confirmed it runs inside VS Code Web. Reviewed Eclipse SysON (web-based graphical), `sysmlv2copilot` (CMU SDK), and the SysTemp multi-agent paper (arXiv 2506.21608) to understand the LLM-authoring landscape.

**Pass 3 — Code-first engineering precedents.** Cloned and audited `atopile` (electronics-as-code with assert/units/tolerances + custom symbolic constraint solver in `repos/atopile/src/faebryk/core/solver/solver.py`), `tscircuit/props` (Zod-typed React-component PCB DSL with DRC), `build123d` and `CadQuery` test patterns, and `FEAScript` (browser-side FEA via Web Workers). Compared their spec/verification surfaces against SysML v2's grammar to determine which idioms transfer and which need adapting.

Web research (10+ queries) covered: SysML v2 OMG release status; verification/analysis case semantics; constraint solver options for browser (Z3 WASM, MiniZinc, custom symbolic); LLM-driven SysML generation; property-based geometry testing; and SysML v2 textual editors that could be embedded into Tau.

## Findings

### F1: SysML v2 is the only OMG-formalised, code-first cross-discipline spec language

OMG adopted SysML v2 as a formal specification in September 2025; the December 2024 release of the standard library is feature-complete. The textual notation (KerML 1.0 + SysML 2.0) is the canonical machine-readable form — graphical notation is a _view_, not the source of truth (`Intro to the SysML v2 Language-Textual Notation.pdf`, repos/SysML-v2-Release/doc/). This matters because Tau's vision policy commits to "code is the interface" — only a textual-first spec language is consistent with that commitment.

The standard library covers every primitive Tau needs across Phases 1–6 without invention:

| SysML v2 stdlib package                      | Tau domain coverage                                                                                                                                                                                                                          |
| -------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `ScalarValues`, `MeasurementReferences`      | ISO 80000 / SI base units (kg, m, s, A, K, mol, cd) and derived (N, Pa, J, W, V, Ω…) — used by every quantity assertion                                                                                                                      |
| `Quantities`                                 | Tolerance arithmetic on `QuantityValue`; unit conversion at the type level                                                                                                                                                                   |
| `Domain Libraries/Geometry/ShapeItems.sysml` | `Box`, `Cylinder`, `Ellipse`, `Path`, `PlanarSurface` — directly maps to Tau's `boundingBox`, `connectedComponents` checks                                                                                                                   |
| `Systems Library/Requirements.sysml`         | `RequirementCheck`, `FunctionalRequirementCheck`, `PerformanceRequirementCheck`, `PhysicalRequirementCheck`, `InterfaceRequirementCheck`, `DesignConstraintCheck` — covers MCAD geometry, FEA stress, ECAD signal integrity, firmware timing |
| `Systems Library/VerificationCases.sysml`    | `VerificationCase`, `VerdictKind {pass, fail, inconclusive, error}`, `VerificationMethodKind {inspect, analyze, demo, test}`                                                                                                                 |
| `Systems Library/AnalysisCases.sysml`        | `AnalysisCase` chains `calc def` blocks; the basis for FEA / mass roll-up / cost estimation                                                                                                                                                  |

The KerML kernel under it (`repos/SysML-v2-Release/sysml.library/Kernel Modeling Library/`) provides classification, generalisation, redefinition, expression evaluation, and connector composition — language primitives that no JSON Schema or Zod-based authoring surface can replicate without re-inventing a type system.

Searching the open-source landscape for alternatives: ReqIF and OSLC are exchange formats, not authoring languages; Modelica targets simulation and lacks requirement primitives; OPM is academic with limited tooling; AADL is avionics-specific. **No competing open standard pairs requirements + verification + units + cross-discipline composition in a textual notation.** SysML v2 is the only credible spine.

### F2: SysML v2 textual notation is browser-embeddable today

The historical objection to SysML in a browser-first stack ("the reference implementation is Java/Xtext and ships as an Eclipse plugin") is obsolete. Sensmetry built `sysml-2ls` in TypeScript on top of Langium, a TypeScript-native language-workbench framework already used by Tau peers (e.g. tscircuit-friendly tooling). Quoting the project README:

> SysIDE Editor Legacy is a free and open source SysML v2 textual editing and analysis tool […] The main enabling components are a parser and a language server for SysML v2 and KerML 2024-12 release specifications.

It runs in VS Code for the Web (no local Java required) and has been migrated to Sensmetry's newer Syside Editor codebase (also Langium/TypeScript). Critically for Tau:

- **ESM, no native deps** — fits Tau's ESM-only runtime constraint and Vite plugin pipeline.
- **Apache 2.0 / open-source** — compatible with Tau's MIT licensing for `@taucad/*` packages, and with the GPL-isolated kernel pattern (`kernels/openscad`) for the LGPL-licensed standard library.
- **Stand-alone parser API** — Langium grammars produce a typed AST that can be consumed without the LSP layer; `@taucad/spec` can ship the parser as a pure library, leaving LSP integration as an opt-in for the Monaco-based editor.
- **Sysand package manager** — Sensmetry also ships Sysand, an open-source SysML v2 package manager analogous to npm/pnpm. This means Tau's existing `pnpm` workspace pattern translates directly: `.sysml` packages can be cross-referenced and shared without a new resolver.

Eclipse SysON (web-based, graphical) provides a fallback embed for the future graphical viewer if/when Tau wants one; for now the textual surface is sufficient.

### F3: Atopile is the production proof-point for "engineering as code with units and assertions"

Atopile (`repos/atopile`) ships a `.ato` DSL whose declarative core is structurally identical to what SysML v2 expresses for ECAD. The `examples/equations/equations.ato` voltage-divider module is the cleanest illustration:

```atopile
module VoltageDivider:
    power.hv ~> r_top ~> output.line ~> r_bottom ~> power.lv

    assert v_in is power.voltage
    assert v_out is output.reference.voltage

    assert r_top.resistance is (v_in - v_out) / max_current
    assert r_bottom.resistance is v_out / max_current
    assert v_out is v_in * ratio
    assert max_current is v_in / r_total

module App:
    my_vdiv = new VoltageDivider
    assert my_vdiv.power.voltage is 10V +/- 1%
    assert my_vdiv.output.reference.voltage within 3.3V +/- 10%
    assert my_vdiv.max_current within 10uA to 100uA
```

Three lessons transfer directly to Tau's MCAD spec layer:

1. **Units are first-class lexical tokens.** `10V`, `3.3V +/- 10%`, `10uA to 100uA`. The parser knows these are `Voltage` and `Current` quantities; mismatched dimensions are compile errors. SysML v2 has the same property via its `MeasurementReferences` library.
2. **`assert` statements drive a constraint solver, not just a runtime check.** Atopile's `repos/atopile/src/faebryk/core/solver/solver.py` runs a symbolic constraint-propagation solver (idempotent unpack, involutory fold, associative fold, transitive subset, upper/lower estimation) over the `assert` graph before ever picking a component. The output is a _bound_ on each variable; component selection is a search inside those bounds. This is the model Tau wants for parameter optimization in Phase 2 (e.g. "find a wall thickness in [1, 5] mm that minimises mass while keeping stress < 150 MPa").
3. **One textual file per module.** Atopile's `.ato` files compose like Python modules; tscircuit's `.tsx` files compose like React. **Files are the interface** — exactly Tau's vision policy. SysML v2 packages compose the same way.

The atopile precedent is also a _cautionary tale_: their DSL is bespoke, so their LLM pretraining-data problem is severe. SysML v2 has the same data-scarcity issue (see F7) but at least is an OMG standard with public model corpora and academic interest.

### F4: Code-first MCAD ecosystems have not solved assembly-level verification

Surveying build123d, CadQuery, OpenSCAD, JSCAD, Manifold, KCL test suites and community examples: **the universal pattern is `assert` against a single shape's volume, bounding box, or face count**. Examples:

```python
# build123d typical pattern
box = Box(10, 20, 30)
assert box.volume == 6000
assert box.bounding_box().size.X == 10
```

```js
// JSCAD typical pattern
const part = cylinder({ height: 10, radius: 5 });
assert.closeTo(measureVolume(part), Math.PI * 25 * 10, 1e-3);
```

```scad
// OpenSCAD has no assertion library; tests live outside the language
```

None of these ecosystems ship:

- **Assembly-level requirement composition** — no equivalent of `requirement def Performance { subrequirement Thermal; subrequirement Mass; }`.
- **Cross-shape constraints** — clearance, interference, alignment between parts is left to ad-hoc Python.
- **Verdict types beyond bool** — `inconclusive` (sensor saturated, simulation didn't converge) and `error` (kernel crashed) are pass/fail-conflated.
- **Quantity-typed tolerances** — bare numeric `assert.closeTo(x, y, 1e-3)` with no unit, no relative-vs-absolute distinction.
- **Verification-method tagging** — no notion that "mass < 200 g" can be verified by inspect / analyze / demo / test (each producing distinct evidence).

This is the **smoking-gun gap**. Code-first MCAD has standardised on an assertion idiom that hits a ceiling at single-shape geometry checks. SysML v2 is the only language in the open-source landscape that crosses that ceiling without re-inventing requirements management. **Tau adopting SysML v2 here is genuinely first-mover in the OSS code-CAD space.**

### F5: SysML v2 verification semantics fit TDD and property-based testing natively

The standard library `VerificationCases.sysml` defines:

```
abstract verification def VerificationCase :> Case {
    return verdict : VerdictKind;
    requirementVerifications : RequirementCheck = obj_verifies;
}
enum def VerdictKind { pass; fail; inconclusive; error; }
enum def VerificationMethodKind { inspect; analyze; demo; test; }
```

Three TDD-friendly properties drop out:

**Property 1 — Verification cases are first-class files.** A test is a `verification case` in a `.sysml` file. Adding a new requirement is editing or creating a file; running the test is `taucad spec verify path/to/case.sysml`. The unit-test boundary is the file. This collapses Tau's two-surface authoring (`code.ts` + `test.json`) into one paradigm.

**Property 2 — `assume constraint` cleanly separates property-based input space from invariants.** SysML v2's `Vehicle Analysis Demo` shows the pattern:

```sysml
analysis def FuelEconomyAnalysis {
    in vehicle : Vehicle;
    in startSpeed : Real;
    in endSpeed : Real;

    assume constraint {
        startSpeed < endSpeed
        and vehicle.fuelEconomyClass != FuelEconomyClass::EV
    }

    require constraint {
        actualFuelEconomy >= requiredFuelEconomy
    }
}
```

This is property-based testing: `startSpeed`, `endSpeed`, `vehicle` are universally quantified inputs; `assume` filters the input space; `require` is the property. Wire `assume`/`require` to a generator (fast-check style) and you have free fuzz testing of CAD parameter spaces — directly addressing the existing `parameter-architecture-v2.md` parameter sweep gap.

**Property 3 — Verdicts compose.** A `requirement` referenced by N verification cases has `verdict = pass` only when all N pass. Decomposed requirements (`Performance.Thermal.Idle <= 45°C`) propagate verdicts up the tree. This is what Tau's `test_model` tool needs to surface "23 of 25 requirements satisfied" instead of a flat pass-fail.

These three properties together make SysML v2 a **strictly better testing surface** than the current `test.json` schema for everything Tau already does in Phase 1, before any Phase-2 analysis kernels arrive.

### F6: Tau's current test.json schema cannot express any Phase-2 requirement

Re-reading `packages/testing/src/schemas.ts` against `vision-policy.md`'s Phase-2 commitments:

```typescript
export const measurementTestRequirementSchema = baseTestRequirementSchema.extend({
  type: z.literal('measurement'),
  check: z.enum(['boundingBox', 'connectedComponents', 'watertight']),
  expected: z.record(z.string(), z.unknown()).optional(),
  tolerance: z.number().optional(),
});
```

Hard structural blockers for Phase-2 requirements:

| Phase-2 requirement                                           | Schema gap                                                                                 |
| ------------------------------------------------------------- | ------------------------------------------------------------------------------------------ |
| "Maximum von Mises stress < 200 MPa under 50 N load"          | No analysis-input model (load case); no quantity types; `expected` is opaque `z.unknown()` |
| "Total mass ≤ 200 g (±5 %)"                                   | No unit on numeric field; no relative tolerance arithmetic; no roll-up across parts        |
| "Centre of mass within ±2 mm of geometric centre on all axes" | `check` enum has no entry; `expected` shape unconstrained                                  |
| "Min wall thickness ≥ 1.5 mm everywhere"                      | Geometric query has no kernel; `check` enum has no entry; would need shape-distance solver |
| "Heat sink → connector clearance ≥ 2 mm"                      | Cross-part query; one geometry unit per `test.json` key forbids referencing two parts      |
| "All FEA mesh elements have aspect ratio < 5"                 | No mesh-quality assumption; no `inconclusive` verdict for failed mesh                      |
| "Throughout the parameter sweep, mass ∈ [150, 200] g"         | No parameter-space binding; sweeps live in `.tau/parameters/`, tests in `test.json`        |

Every one of these is an idiomatic SysML v2 `requirement def` + `verification case` pair. Extending the existing schema requires inventing — and committing to forever maintaining — an idiosyncratic JSON sub-language for each. SysML v2 already has the grammar.

### F7: LLM authoring of SysML v2 is a solved-shape problem (SysTemp pattern)

The SysTemp paper (`https://arxiv.org/html/2506.21608v1`) confirms what Tau's current chat-agent loop already does for code: a multi-agent **template-generator → writer → parser** loop produces syntactically valid SysML v2 from natural language at acceptable rates. Their architecture:

1. `TemplateGeneratorAgent` — drops a SysML v2 skeleton (package, parts, requirements stubs).
2. `WriterAgent` — fills in attributes, expressions, constraints from the spec.
3. `ParserAgent` — runs the SysML parser, returns line-level errors, refinement loop continues until parser is silent.

Tau's existing chat agent already runs this loop for TypeScript: `edit_file` (writer) → `get_kernel_result` (parser equivalent — TypeScript compile + runtime exec). Adding `edit_spec` + `verify_spec` on `.sysml` files reuses the same architecture. Critically, Tau ships the parser **in-process** (Langium runs in the worker), not as an out-of-band service like SysTemp's standalone parser — this collapses the loop latency from seconds to milliseconds.

The SysTemp paper also documents the data-scarcity problem ("less than 150 SysML v2 scenarios in the open"). Mitigation: ship a curated `@taucad/spec-examples` package of 50–100 hand-written CAD-domain examples as in-context few-shot exemplars in the system prompt, exactly as Tau already does for kernel code via `cad-agent.prompt.ts`.

## Target Architecture

Six layers, top-down. Each layer has a small, well-defined contract; replacement of any single layer should not ripple through the others.

### Layer 1: `.sysml` files as a first-class file primitive

Every project gains a conventional `spec/` directory holding `.sysml` files. The directory layout below is illustrative — actual filenames are user-chosen (`bracket.sysml`, `assembly.sysml`, etc.) — but the structure shows how requirements, verification cases, analysis cases, and shared types compose.

```
project-root/
├── src/
│   ├── bracket.ts            # replicad geometry unit
│   ├── housing.scad          # OpenSCAD geometry unit
│   └── controller.ts         # firmware (Phase 5)
├── spec/
│   ├── _common.sysml         # shared parts/types: Bracket, Housing, BillOfMaterials
│   ├── bracket.sysml         # bracket-scoped requirements + verification cases
│   ├── assembly.sysml        # cross-part: clearance, mass roll-up
│   └── thermal.sysml         # Phase 2: thermal requirements (FEA-backed)
└── .tau/parameters/          # existing parameter overrides (Phase 1)
```

**File-system contract.**

- `.sysml` extension is registered in the FM provider registry and in `mimeTypes` (`packages/converter`) as `text/sysml+plain`.
- Every `.sysml` file is one SysML v2 _package_; the package name is derived from the path (`spec/bracket.sysml` → `package Bracket`).
- Cross-file references use `import` statements (`import _common::*;`) — handled by Langium's resolver against the workspace `spec/` root.
- `.sysml` files participate in the kernel-watch fast-path (the same `registerWatchPath` machinery used by `parameterFileResolverMiddleware`) so changing a requirement triggers re-verification, not just re-render.

**Editor contract.**

- Monaco gets a `sysml` language registration backed by the Langium-generated TextMate grammar (Sensmetry ships this).
- Optional Monaco-LSP wiring to Langium gives autocomplete, hover, go-to-definition, and rename for free; until that lands, plain syntax-highlight is sufficient because parser feedback flows through the agent loop and a status panel.
- A new `chat-message-tool-edit-spec.tsx` tool card renders SysML diffs with the same chrome as `chat-message-tool-edit-file.tsx`.

### Layer 2: `@taucad/spec` parser and typed IR

A new package owning everything between raw text and executable verification.

```
packages/spec/
├── src/
│   ├── grammar/              # Langium grammar (re-exported from sysml-2ls or vendored)
│   ├── parse/
│   │   ├── parse-package.ts  # text → typed AST
│   │   └── workspace.ts      # multi-file resolver
│   ├── ir/
│   │   ├── requirement.ts    # canonical IR for RequirementDef, RequirementUsage
│   │   ├── verification.ts   # IR for VerificationCase + VerdictKind
│   │   ├── analysis.ts       # IR for AnalysisCase + calc def chains
│   │   ├── quantity.ts       # QuantityValue with unit + tolerance
│   │   └── subject.ts        # discriminated union of subjects (geometry, mesh, FEA result, …)
│   ├── compile/
│   │   ├── to-runnable.ts    # IR → RunnableSpec (ready for Layer 3)
│   │   └── to-test-json.ts   # back-compat shim during migration
│   └── index.ts
└── package.json              # name: @taucad/spec, side-effect-free, ESM-only
```

**Boundary rules.**

- **Pure** — no side effects, no kernel imports. Takes text, returns IR. Easy to unit-test with vitest.
- **Cross-target** — Node + browser + worker via `@taucad/spec` exports map (mirrors `@taucad/json-schema`).
- **No Zod-on-the-wire** — the IR is plain TypeScript discriminated unions (matches the `defineKernel`/`defineTranscoder` pattern of resolving Zod internally and shipping JSON Schema externally).
- **Single source of truth for units** — quantity arithmetic (addition, subtraction, multiplication) lives here, not duplicated in evidence providers.

### Layer 3: `@taucad/spec-runtime` evidence dispatcher

A second package that **executes** the IR by routing each `verification case` to a registered _evidence provider_.

```typescript
// packages/spec-runtime/src/index.ts (illustrative)

export interface EvidenceProvider<TSubjectKind extends string> {
  readonly id: string;
  readonly subjectKind: TSubjectKind;
  readonly methods: readonly VerificationMethodKind[];
  evaluate(input: EvidenceInput<TSubjectKind>): Promise<EvidenceResult>;
}

export interface EvidenceInput<TSubjectKind extends string> {
  readonly subject: SubjectRef<TSubjectKind>; // geometry unit path, mesh URL, FEA case…
  readonly requirement: RequirementIR;
  readonly assumptions: ConstraintIR[];
  readonly constraints: ConstraintIR[];
  readonly bindings: ReadonlyMap<string, QuantityValue>;
}

export interface EvidenceResult {
  readonly verdict: VerdictKind; // pass | fail | inconclusive | error
  readonly evaluatedConstraints: ReadonlyArray<{
    readonly source: SourceLocation; // SysML file + line/col
    readonly verdict: VerdictKind;
    readonly actual?: QuantityValue;
    readonly expected?: QuantityValue;
    readonly delta?: QuantityValue;
    readonly message?: string;
  }>;
  readonly artifacts: ReadonlyArray<EvidenceArtifact>; // GLB, FEA result, screenshot, log
}

export const createSpecRuntime = (options: { providers: readonly EvidenceProvider<string>[] }) => {
  /* … */
};
```

**Behaviour.**

- Each `verification case` in IR carries a `subject : <Type>` declaration; runtime looks up the provider whose `subjectKind` matches and dispatches.
- `assume constraint` violations short-circuit to `verdict = inconclusive` (input space exited the assumption envelope — the test was not actually run).
- `require constraint` violations produce `verdict = fail` with the actual/expected delta surfaced for chat-tool rendering.
- Provider-thrown exceptions become `verdict = error` (distinct from `fail`).
- Multiple `verifies` on one requirement compose: requirement passes iff every linked verification case passes.
- Verdicts roll up the requirement-decomposition tree.

This is the layer the chat agent directly drives via `verify_spec`. GeoSpec becomes the MCAD evidence provider inside this layer, with `@taucad/testing` supplying Tau project rendering, parameter resolution, and legacy compatibility.

### Layer 4: Evidence providers (kernels, analysers, simulators)

Each engineering domain registers one or more providers. Initial set covers Phase-1 + bridges to Phase-2:

| Provider           | Subject kind             | Methods              | Phase | Notes                                                                                                                                           |
| ------------------ | ------------------------ | -------------------- | ----- | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| `geospec-geometry` | `Geometry`               | `analyze`, `inspect` | 1     | Wraps GeoSpec mesh/BRep/STEP evidence plus bounding-box/connected-components/watertight checks through the Tau adapter                          |
| `mass-rollup`      | `Assembly`               | `analyze`            | 1     | New: density × volume per part, summed across the assembly subject; closes the existing schema gap                                              |
| `clearance`        | `Assembly`               | `analyze`            | 1     | New: minimum signed-distance solver between two named parts (replicad/OCCT have native APIs)                                                    |
| `wall-thickness`   | `Geometry`               | `analyze`            | 1     | New: medial-axis sampler; for OCCT use `BRepClass3d_SolidClassifier`                                                                            |
| `parameter-sweep`  | `Geometry` \| `Assembly` | `analyze`, `test`    | 1     | Cartesian product over `assume`-bounded inputs; parallel workers; each cell runs the geometry kernel and re-applies the inner verification case |
| `fea-stress`       | `FEAResult`              | `analyze`            | 2     | FEAScript or external solver via web worker                                                                                                     |
| `fea-thermal`      | `FEAResult`              | `analyze`            | 2     | Heat conduction; FEAScript supports it natively                                                                                                 |
| `screenshot-vlm`   | `Geometry`               | `inspect`            | 1     | Wraps existing capture-view-screenshot + LLM "is this manifold?" check; `verdict = inconclusive` allowed                                        |
| `bom-checker`      | `Assembly`               | `inspect`            | 4     | Phase 4 ECAD; verifies BOM-driven cost/availability assumptions                                                                                 |
| `firmware-trace`   | `FirmwareRun`            | `demo`, `test`       | 5     | Phase 5; QEMU/Wokwi instrumented run produces trace, asserts on signal events                                                                   |

**Plugin registration.** Mirrors `defineKernel` / `defineTranscoder` exactly:

```typescript
// packages/spec-providers/geometry-glb/src/index.ts
export default defineEvidenceProvider({
  id: 'geometry-glb',
  subjectKind: 'Geometry',
  methods: ['analyze', 'inspect'],
  options: z.object({
    /* per-provider configuration */
  }),
  evaluate: async ({ subject, requirement, bindings }) => {
    /* … */
  },
});
```

This keeps the architectural symmetry across kernels, transcoders, and providers — a Tau-wide pattern that agents and humans only need to learn once.

### Layer 5: Agent surface (chat tools, system prompt)

Three changes to the existing chat-agent surface (`apps/api/app/api/chat/`):

1. **Replace `edit_tests` with `edit_spec`.** Same shape (read+modify+write a file), but operates on `*.sysml` instead of `test.json`. Tool description points at the `spec/` directory and the `<verification_examples>` system-prompt block (single source of truth, mirroring how `<test_requirements>` references `prompt-examples.ts` today). The tool runs the Langium parser in-process before writing — refuses to write a file with syntax errors, returns line-level diagnostics for the LLM to fix (SysTemp ParserAgent pattern). On a successful write, it surfaces the normalized formatted source to the chat so the LLM sees what it actually wrote.

2. **Replace `test_model` with `verify_spec`.** Takes a `.sysml` file path (or a verification-case qualified name) and routes through the `@taucad/spec-runtime` evidence dispatcher. Returns a verdict-tree summary the chat tool card renders identically to today's per-requirement layout, but now grouped by parent requirement and decorated with verdict-kind-specific iconography (✓/✗/⚠/⛔ corresponding to pass/fail/inconclusive/error).

3. **System prompt rewires `<test_requirements>` → `<verification_cases>`.** New section in `cad-agent.prompt.ts` with a curated set of canonical SysML v2 examples (mirrors `CANONICAL_TEST_REQUIREMENTS_EXAMPLE`). Per-kernel sub-sections give kernel-specific evidence-provider hints (e.g. "Replicad parts expose `density` for mass roll-up; OpenSCAD does not — use `analyze` method with a manual density binding").

The TDD agent loop now reads:

> 1. User states intent ("the bracket should be ≤ 200 g and clear the connector by ≥ 2 mm").
> 2. Agent writes/edits `spec/bracket.sysml` with `requirement def MassReq` + `requirement def ClearanceReq` + a `verification case verifyBracket verifies massReq, clearanceReq`.
> 3. Agent writes/edits `src/bracket.ts` (geometry kernel code).
> 4. Agent runs `verify_spec spec/bracket.sysml`. Verdicts come back per requirement.
> 5. On `fail`, agent revises geometry code; on `inconclusive`, agent revises assumptions or fixes evidence-provider input; on `error`, agent inspects the artifact log.
> 6. Loop until verdict tree is all `pass`.

Steps 1–2 are unchanged in shape but operate on a richer language. Step 4 is unchanged in tool surface but evaluates a richer requirement model. The agent's mental model gets _simpler_, not more complex, because verdict semantics are explicit.

### Layer 6: CLI and CI surface

Tau's `@taucad/cli` (`packages/cli`) gains `taucad spec` subcommands so verification is first-class outside the chat:

```bash
taucad spec verify spec/bracket.sysml             # one verification case file
taucad spec verify spec/                          # whole project; exit 0 iff all pass
taucad spec verify spec/ --filter Performance     # only requirements under Performance subtree
taucad spec verify spec/ --json                   # machine-readable for CI
taucad spec verify spec/ --watch                  # rerun on file change
taucad spec format spec/                          # canonical SysML v2 reformat
taucad spec compile spec/ --to test-json          # back-compat shim during migration
```

CI integration is then a single `taucad spec verify spec/` step; failures produce GitHub-annotated diagnostics linking to the offending `.sysml` line. The same CLI runs locally in `--watch`, giving designers a sub-second TDD loop without the chat agent.

## Code Examples

### Authoring example: bracket assembly with mass + clearance + watertight requirements

A complete, real-shape example showing how a Phase-1 spec file replaces today's `test.json` and unlocks one Phase-2-class requirement (mass with units and tolerance).

```sysml
// spec/_common.sysml
package Common {
    import ScalarValues::*;
    import MeasurementReferences::*;
    import Geometry::ShapeItems::*;

    part def Bracket {
        attribute material : String;
        attribute density : MassDensityValue;
        item shape : Box;
        attribute volume : VolumeValue = shape.length * shape.width * shape.height;
        attribute mass : MassValue = volume * density;
    }

    part def Connector {
        item shape : Box;
        attribute mountingClearance : LengthValue;
    }

    part def BracketAssembly {
        part bracket : Bracket;
        part connector : Connector;
        attribute totalMass : MassValue = bracket.mass + 0[g]; // connector mass is COTS-supplied
    }
}
```

```sysml
// spec/bracket.sysml
package BracketSpec {
    import Common::*;
    import Requirements::*;
    import VerificationCases::*;

    requirement def MassRequirement {
        subject part : Bracket;
        attribute requiredMaxMass : MassValue;
        require constraint { part.mass <= requiredMaxMass }
    }

    requirement <bracketMass> bracketMassReq : MassRequirement {
        subject part = bracketAssembly.bracket;
        :>> requiredMaxMass = 200 [g];
    }

    requirement def ClearanceRequirement {
        subject pair : (Bracket, Connector);
        attribute minClearance : LengthValue;
        require constraint { distance(pair.0.shape, pair.1.shape) >= minClearance }
    }

    requirement <bracketClearance> clearanceReq : ClearanceRequirement {
        subject pair = (bracketAssembly.bracket, bracketAssembly.connector);
        :>> minClearance = 2 [mm];
    }

    requirement def WatertightRequirement {
        subject geo : Bracket;
        require constraint { geo.shape.isWatertight == true }
    }

    requirement <watertight> watertightReq : WatertightRequirement {
        subject geo = bracketAssembly.bracket;
    }

    part bracketAssembly : BracketAssembly {
        :>> bracket {
            :>> material = "AL6061";
            :>> density = 2.70 [g / cm**3];
            :>> shape {
                length = 80 [mm]; width = 60 [mm]; height = 8 [mm];
            }
        }
    }

    verification def BracketVerification {
        subject under_test : BracketAssembly;
        return verdict : VerdictKind;
        method = VerificationMethodKind::analyze;
    }

    verification case verifyBracket : BracketVerification verifies (
        bracketMassReq,
        clearanceReq,
        watertightReq
    ) {
        subject under_test = bracketAssembly;
        objective {
            doc /* Bracket meets mass, clearance, and watertightness constraints
                   when source is `src/bracket.ts`. */
        }
    }
}
```

What this replaces and what it adds:

- **Replaces** the entire `bracket.ts` entry in `test.json`: three `requirements` rows become three named `requirement def`s with proper subjects.
- **Adds units to mass**: `200 [g]` instead of a unitless `200`. The runtime can verify against densities in `g/cm³`, lengths in `mm`, and the dimensional analysis is checked at parse time.
- **Adds clearance**: a constraint over two distinct subjects, impossible in the current schema.
- **Adds verdict semantics**: the `verifyBracket` verification case returns a single `VerdictKind`, but each of the three referenced requirements has its own verdict. Chat UI can render "2 of 3 satisfied" with drill-down.

Linkage to the kernel code is by **subject binding**: when `verify_spec` runs, the `subject under_test = bracketAssembly` triggers the `geometry-glb` evidence provider to render `src/bracket.ts` (the convention is `src/<subject-name lower-case>.<ext>` resolved via the workspace's kernel detection), produce a GLB, populate `bracket.shape.isWatertight` and `bracket.shape.length` from the GLB's analysed geometry, then evaluate the `require constraint`s against the populated subject.

### Property-based testing via parameter sweeps

```sysml
// spec/parametric.sysml
package Parametric {
    import Common::*;

    analysis def WallThicknessSweep {
        in part : Bracket;
        in candidate : LengthValue;

        assume constraint {
            candidate >= 1.0 [mm] and candidate <= 5.0 [mm]
        }

        out result : MassValue = part.mass;
        out passes : Boolean = result <= 200 [g];

        require constraint { passes == true }
    }

    analysis case sweepBracket : WallThicknessSweep {
        in part = bracketAssembly.bracket;
        in candidate = sweep(1.0 [mm], 5.0 [mm], 0.5 [mm]); // 9-cell sweep
    }

    verification case verifyParametric : BracketVerification verifies sweepBracket {
        subject under_test = bracketAssembly;
    }
}
```

The `parameter-sweep` evidence provider (Layer 4) interprets `sweep(min, max, step)` as a generator, dispatches one `geometry-glb` evaluation per cell, and returns a per-cell verdict array plus an aggregated `verdict = pass` iff every cell passes (`fail` if any fail; `inconclusive` if the assumption excluded some cells).

This is property-based testing on top of native SysML semantics — no new schema, no `fast-check` integration, no parameter-file scaffolding. The same mechanism scales to multi-dimensional sweeps (cartesian product of parameters), Latin-hypercube sampling, and gradient-based search by swapping the generator strategy in the provider — none of which require changes to the `.sysml` file.

### Cross-discipline example: enclosure spec referencing PCB dimensions

Phase-4 forward-look: when ECAD lands, the same spec file references both an MCAD subject and an ECAD subject, and the `clearance` provider becomes cross-domain.

```sysml
// spec/enclosure.sysml
package Enclosure {
    import Common::*;
    import Electrical::PCBs::*;          // future @taucad/spec-electrical library

    part def Enclosure {
        item shape : Box;
        item internalCavity : Box;
    }

    part assembly : EnclosureAssembly {
        part enclosure : Enclosure;
        part board : PCB;
    }

    requirement def PCBFitsRequirement {
        subject pair : (Enclosure, PCB);
        require constraint {
            pair.0.internalCavity.length >= pair.1.boardOutline.length + 4 [mm]
            and pair.0.internalCavity.width >= pair.1.boardOutline.width + 4 [mm]
        }
    }

    requirement <pcbFit> pcbFitReq : PCBFitsRequirement {
        subject pair = (assembly.enclosure, assembly.board);
    }

    verification case verifyFit verifies pcbFitReq {
        subject under_test = assembly;
        method = VerificationMethodKind::analyze;
    }
}
```

The `assembly.board` subject resolves to a tscircuit/atopile module that exports board outline dimensions. The same `spec-runtime` dispatcher, with an `ecad-board` provider added, evaluates the requirement. **Phase-4 wiring is purely additive — no spec-file rewrite, no agent retraining, no schema migration.** This is the architectural payoff of choosing SysML v2 now rather than later.

## Diagrams

```
┌────────────────────────────────────────────────────────────────────────────────┐
│  AGENT / EDITOR / CLI                                                          │
│                                                                                │
│   chat agent ─── edit_spec ─┐         ┌── verify_spec                          │
│                             ▼         ▼                                        │
│   monaco editor ─── .sysml file (project's spec/ directory)                    │
│                             │                                                  │
│   taucad spec verify (CLI)──┤                                                  │
└─────────────────────────────┼──────────────────────────────────────────────────┘
                              ▼
┌────────────────────────────────────────────────────────────────────────────────┐
│  @taucad/spec  (parse + IR + compile)                                          │
│                                                                                │
│   text ──Langium parser──► AST ──IR builder──► RunnableSpec                    │
│                                       │                                        │
│             stdlib resolver ──────────┘                                        │
│             (Quantities, Geometry::ShapeItems, Requirements, VerificationCases)│
└──────────────────────────────────────┬─────────────────────────────────────────┘
                                       ▼
┌────────────────────────────────────────────────────────────────────────────────┐
│  @taucad/spec-runtime  (evidence dispatcher)                                   │
│                                                                                │
│   for each verification case:                                                  │
│     resolve subject ──► look up evidence provider by subject kind ──► evaluate │
│                                                                                │
│   compose verdict-tree ──► return aggregated VerdictKind + per-row diagnostics │
└──────────────────────────────────────┬─────────────────────────────────────────┘
                                       ▼
┌────────────────────────────────────────────────────────────────────────────────┐
│  EVIDENCE PROVIDERS (plugins, defineEvidenceProvider)                          │
│                                                                                │
│  Phase 1 (immediate):                                                          │
│   geometry-glb │ mass-rollup │ clearance │ wall-thickness │ parameter-sweep    │
│   screenshot-vlm                                                               │
│                                                                                │
│  Phase 2: fea-stress │ fea-thermal     Phase 4: bom-checker │ ecad-drc        │
│  Phase 5: firmware-trace                                                       │
└────────────────────────────────────────────────────────────────────────────────┘
```

```
TDD Loop (replaces the current edit_file → test_model loop)

  ┌──────────────┐    ┌────────────────┐    ┌───────────────┐    ┌──────────────┐
  │  user intent │───►│  edit_spec     │───►│  edit_file    │───►│ verify_spec  │
  │              │    │  (.sysml)      │    │  (.ts/.scad)  │    │              │
  └──────────────┘    └────────────────┘    └───────────────┘    └──────┬───────┘
                              ▲                                          │
                              │   syntax errors                          │
                              │   (in-process Langium)                   │
                              └──────────────────────────────────────────┤
                                                                         │
                                          fail / inconclusive / error    │
                              ┌──────────────────────────────────────────┤
                              │                                          │
                              ▼                                          ▼
                        revise code/spec                        verdict tree all pass
                                                                ►  done, ship
```

## Migration Roadmap

| Phase                                              | Deliverable                                                                                                                                                                                                                            | Cuts existing `test.json`?       | Approx effort                                |
| -------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------- | -------------------------------------------- |
| **M1** Parser foundation                           | `@taucad/spec` package; vendor or wrap Sensmetry's Langium grammar; JSON Schema for the typed IR; pure unit tests over fixtures from `repos/SysML-v2-Release/sysml/src/examples/`                                                      | No                               | 1–2 weeks                                    |
| **M2** Runtime + first provider                    | `@taucad/spec-runtime`; `geometry-glb` provider re-implemented on top of existing `analyzeGlb`; CLI `taucad spec verify spec/`; back-compat compiler `taucad spec compile spec/ --to test-json`                                        | No (compat shim)                 | 1 week                                       |
| **M3** Mass + clearance + wall-thickness providers | `mass-rollup`, `clearance`, `wall-thickness`; close the Phase-2-class gaps already requestable in Phase 1; first projects can ship `.sysml`-only                                                                                       | Optionally per-project           | 2 weeks                                      |
| **M4** Agent surface                               | `edit_spec`, `verify_spec` chat tools; in-process parser feedback loop; new `<verification_cases>` system-prompt section with curated examples; UI tool cards (`chat-message-tool-edit-spec.tsx`, `chat-message-tool-verify-spec.tsx`) | No                               | 1 week                                       |
| **M5** Parameter sweep                             | `parameter-sweep` provider; bind `.tau/parameters/` to `assume`/`require` over `analysis case`                                                                                                                                         | Yes for parameter-aware projects | 1 week                                       |
| **M6** Editor + LSP                                | Monaco language registration + Langium LSP wiring; hover, go-to-def, autocomplete                                                                                                                                                      | No                               | 1–2 weeks                                    |
| **M7** Migration sweep                             | Convert all internal sample projects from `test.json` to `.sysml`; remove `edit_tests` / `test_model` after a deprecation window; remove `packages/testing` Zod schemas (keep the analyser primitives)                                 | Yes (full retirement)            | 1 week                                       |
| **M8** Phase-2 providers                           | `fea-stress`, `fea-thermal` via FEAScript on Web Worker; ships in lockstep with the analysis-kernel work in `vision-policy.md` Phase 2                                                                                                 | Yes                              | 2–3 weeks (gated on FEA kernel availability) |

Total to fully retire `test.json` and ship the agent on SysML v2: **~7–9 weeks** of focused work, parallelisable across two engineers. Phase-2 FEA providers ride on top of an architecture that already exists rather than co-evolving with it.

## Trade-offs

| Dimension                             | SysML v2 spec architecture (this proposal)                                                                                        | Status quo (`test.json` + Zod)                             | Earlier additive proposal (sysml-driven-cad-spec.md)   |
| ------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------- | ------------------------------------------------------ |
| **Authoring surface**                 | One file format (`.sysml`) for every requirement                                                                                  | One JSON file plus ad-hoc Zod schemas per requirement type | Same JSON file, larger Zod sub-language                |
| **Cross-part requirements**           | First-class via `subject pair` and shared packages                                                                                | Requires schema invention                                  | Possible but bespoke                                   |
| **Units & dimensional analysis**      | Built into language; parser-checked                                                                                               | Bare numerics; runtime errors at best                      | Could be added by extending Zod, but no parser support |
| **Verdict semantics**                 | `pass / fail / inconclusive / error` standard                                                                                     | Pass/fail only                                             | Standard if we adopt SysML enums                       |
| **Parameter sweeps / property tests** | Native via `analysis case` + `assume constraint`                                                                                  | Not expressible                                            | Possible but ad-hoc                                    |
| **Cross-discipline (Phase 2–6)**      | Free; same file format spans MCAD/ECAD/firmware                                                                                   | Each discipline reinvents                                  | Each discipline reinvents                              |
| **Tooling reuse**                     | Langium grammar + Sensmetry parser, OMG stdlib, future graphical viewers (SysON), Sysand package manager, academic LLM precedents | None outside Tau                                           | Same as status quo for tooling reuse                   |
| **LLM authoring difficulty**          | Moderate (training-data scarce; mitigated by in-process parser + curated few-shot)                                                | Low (JSON is well-known)                                   | Moderate (custom JSON sub-language + free-form Zod)    |
| **Migration cost**                    | 7–9 engineer-weeks one-time                                                                                                       | Zero today, exponential per Phase-2 schema extension       | 4–6 engineer-weeks one-time + recurring per discipline |
| **Long-term DX cap**                  | Bound by SysML v2 (a 30-year-multi-vendor standard)                                                                               | Bound by what we're willing to reinvent in Zod             | Same as status quo with extra surface area             |
| **Risk profile**                      | New file format, new parser dependency                                                                                            | None                                                       | Hybrid; carries both old and new                       |

The fundamental trade is **one moderate up-front cost (M1–M7) for an unbounded ceiling versus zero up-front cost for a ceiling at "Phase 1.5"**. Everything in `vision-policy.md` past Phase 1 is the case where the ceiling matters.

## Risks and Mitigations

| Risk                                                              | Likelihood                         | Impact | Mitigation                                                                                                                                                                                                                                                                                          |
| ----------------------------------------------------------------- | ---------------------------------- | ------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Langium grammar drift from OMG SysML 2.0 spec**                 | Medium                             | Medium | Pin to a tagged Sensmetry release; track grammar in `repos/sysml-2ls` via the existing `repos.yaml` mechanism so we can patch and PR upstream                                                                                                                                                       |
| **LLM struggles to write valid SysML v2 (data scarcity)**         | High initially, low after curation | Medium | (a) Ship a curated `@taucad/spec-examples` library of 50–100 hand-written examples for in-context use; (b) in-process parser refusal-loop modelled on SysTemp ParserAgent; (c) the LLM only ever edits one verification case at a time so the search space stays small                              |
| **Standard library is LGPL v3.0**                                 | Certain                            | Low    | Tau already isolates GPL kernels (e.g. `kernels/openscad`); replicate the pattern: ship the SysML stdlib in a separately-licensed `@taucad/sysml-stdlib` package, MIT-licensed Tau code only depends on its public API                                                                              |
| **Performance: parser + IR build per file edit**                  | Low                                | Low    | Langium is incremental; the parse cost on a 200-line `.sysml` file is sub-millisecond. Run inside a Web Worker like the FM worker to keep main thread free                                                                                                                                          |
| **Migration breaks existing chat-agent muscle memory**            | Medium                             | Low    | Keep `edit_tests`/`test_model` as deprecated aliases that auto-translate to the new tools for one release; system-prompt example block makes the transition explicit                                                                                                                                |
| **Browser bundle weight from Langium + grammar**                  | Low                                | Low    | Langium is ESM, tree-shakeable; ship the parser as a worker-only dependency so it never enters the main UI bundle                                                                                                                                                                                   |
| **SysML v2 over-engineers simple "is this 100mm wide" cases**     | Medium                             | Low    | Ship a `taucad spec init` template that scaffolds the minimal `requirement def` + `verification case` for the common case in 8 lines; the agent uses the same template                                                                                                                              |
| **Constraint solver is needed for advanced inverse-design cases** | Medium                             | Medium | Defer past M8; atopile's symbolic-propagation solver in `repos/atopile/src/faebryk/core/solver/solver.py` is portable to TypeScript; Z3-WASM is a heavyweight fallback. None of this is needed for Phase-1 verification, only for inverse-search "find the parameter that satisfies the constraint" |
| **Project owners want graphical SysML diagrams**                  | Low (today)                        | Low    | Embed Eclipse SysON or generate Mermaid views from the IR — both are pure rendering of an already-parsed model                                                                                                                                                                                      |

## Recommendations

| #   | Action                                                                                                                                                                       | Priority                 | Effort     | Impact                                                                          |
| --- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------ | ---------- | ------------------------------------------------------------------------------- |
| R1  | Approve this v2 architecture as the spec direction; mark `sysml-driven-cad-spec.md` as superseded                                                                            | P0                       | Trivial    | Unblocks all downstream work                                                    |
| R2  | Spike `@taucad/spec` (M1): vendor Sensmetry Langium grammar, parse the example corpus, build IR, ship JSON Schema                                                            | P0                       | 1–2 wks    | De-risks the parser-in-browser claim before broader investment                  |
| R3  | Build `@taucad/spec-runtime` + `geometry-glb` provider (M2); CLI `taucad spec verify` operational on existing internal projects via the back-compat compiler                 | P0                       | 1 wk       | First end-to-end loop without disrupting chat agent                             |
| R4  | Add `mass-rollup`, `clearance`, `wall-thickness` providers (M3) to close gaps that the current schema cannot express                                                         | P1                       | 2 wks      | Demonstrates the unique value over `test.json` to internal stakeholders         |
| R5  | Replace `edit_tests` / `test_model` chat tools with `edit_spec` / `verify_spec` (M4); curate `<verification_cases>` system-prompt section                                    | P1                       | 1 wk       | Aligns the agent with the new spec spine                                        |
| R6  | Ship `parameter-sweep` provider (M5) and connect to `.tau/parameters/` so existing parametric models become property-tested with no extra files                              | P1                       | 1 wk       | First property-based testing capability in Tau                                  |
| R7  | Wire Langium LSP into Monaco for inline hover/autocomplete (M6)                                                                                                              | P2                       | 1–2 wks    | DX polish; not blocking but high-leverage for human authors                     |
| R8  | Migrate internal sample projects to `.sysml` and retire `test.json` (M7); remove `packages/testing` Zod schemas while keeping the analyser primitives                        | P2                       | 1 wk       | Eliminates two-surface authoring permanently                                    |
| R9  | Bring `fea-stress` / `fea-thermal` providers online (M8) in lockstep with FEAScript kernel landing; this is the Phase-2 unlock                                               | P1 (when Phase 2 starts) | 2–3 wks    | Validates the cross-discipline architecture before ECAD/firmware arrive         |
| R10 | Set up an ongoing upstream contribution path with Sensmetry (PRs against `sysml-2ls`/Syside if Tau extends the grammar or fixes parser bugs)                                 | P3                       | Ongoing    | Keeps Tau's parser dependency healthy and visible in the SysML ecosystem        |
| R11 | Codify the new architecture as a policy doc once M1–M3 ship: `docs/policy/spec-policy.md` derived from this research                                                         | P2                       | 0.5 wk     | Institutionalises decisions for future contributors                             |
| R12 | Begin a curated `@taucad/spec-examples` corpus (target 50 examples spanning bracket / housing / linkage / heat-sink / enclosure / mechanism geometry) for LLM in-context use | P1                       | Continuous | Mitigates the SysML-v2 data-scarcity risk and improves agent first-pass success |

## References

- OMG SysML v2 — formal specification announcement: <https://www.omg.org/spec/SysML/2.0>
- SysML v2 Release repository (cloned to `repos/SysML-v2-Release`): <https://github.com/Systems-Modeling/SysML-v2-Release>
- KerML 1.0 textual notation BNF: `repos/SysML-v2-Release/bnf/KerML-textual-bnf.kebnf`
- SysML v2 textual notation BNF: `repos/SysML-v2-Release/bnf/SysML-textual-bnf.kebnf`
- Standard library `VerificationCases.sysml`: `repos/SysML-v2-Release/sysml.library/Systems Library/VerificationCases.sysml`
- Standard library `Requirements.sysml`: `repos/SysML-v2-Release/sysml.library/Systems Library/Requirements.sysml`
- Standard library `AnalysisCases.sysml`: `repos/SysML-v2-Release/sysml.library/Systems Library/AnalysisCases.sysml`
- Vehicle Analysis Demo example (used as the primary `analysis case` reference): `repos/SysML-v2-Release/sysml/src/examples/Analysis Examples/Vehicle Analysis Demo.sysml`
- Mass roll-up example (basis for the `mass-rollup` provider design): `repos/SysML-v2-Release/sysml/src/examples/Mass Roll-up Example/MassRollup.sysml`
- Sensmetry sysml-2ls (Apache-2.0 TypeScript Langium parser/LSP): <https://github.com/sensmetry/sysml-2ls>
- Syside Editor (sysml-2ls successor): <https://syside.app/>
- Eclipse SysON web-based graphical editor: <https://mbse-syson.org/>
- Sysand SysML v2 package manager: <https://syside.app/>
- SysTemp multi-agent SysML v2 generation paper: <https://arxiv.org/html/2506.21608v1>
- Atopile DSL and constraint solver: <https://atopile.io>; cloned to `repos/atopile`; solver source `repos/atopile/src/faebryk/core/solver/solver.py`
- tscircuit Zod-typed component props: cloned to `repos/props`
- FEAScript browser-side FEA: <https://feascript.com/>
- Langium TypeScript language workbench: <https://langium.org/>
- Tau vision policy (the spine this architecture supports): `docs/policy/vision-policy.md`
- Superseded earlier proposal: `docs/research/sysml-driven-cad-spec.md`

## Appendix A: Atopile assert grammar reference

Distilled from `repos/atopile/examples/equations/equations.ato`, useful as a comparison point for SysML v2 `require constraint` semantics:

```
assert  <expr>  is      <expr>           // equality
assert  <expr>  within  <expr> +/- <pct> // tolerance band, percentage
assert  <expr>  within  <expr> to <expr> // tolerance band, range
```

SysML v2 expresses the same intent with explicit constraint blocks (`require constraint { x == y }`, `require constraint { (x - y) / y * 100 [%] within ±5 [%] }`, `require constraint { x >= a and x <= b }`). The atopile syntactic surface is more compact; SysML v2's is more general (any boolean expression over typed quantities; first-class composition into `requirement def`s and roll-up).

## Appendix B: SysML v2 keyword inventory

Full set of reserved keywords in SysML v2 textual notation (from `repos/SysML-v2-Release/bnf/SysML-textual-bnf.kebnf`), grouped by usage cluster — useful as an LLM-prompt reference and as a syntax-highlighting source of truth:

- **Structure**: `package`, `library`, `import`, `private`, `protected`, `public`, `alias`, `language`, `locale`, `metadata`, `meta`, `comment`, `doc`, `dependency`, `from`, `to`, `about`
- **Definitions**: `def`, `abstract`, `variation`, `variant`, `individual`, `redefines`, `specializes`, `subsets`, `references`, `defined`, `by`, `as`, `of`, `at`, `in`, `out`, `inout`
- **Parts and items**: `part`, `item`, `attribute`, `port`, `interface`, `connection`, `connect`, `flow`, `bind`, `binding`, `merge`, `succession`
- **Behaviour**: `action`, `state`, `transition`, `event`, `accept`, `send`, `do`, `entry`, `exit`, `perform`, `exhibit`, `parallel`, `fork`, `join`, `decide`, `for`, `while`, `loop`, `if`, `else`, `then`, `until`
- **Requirements and verification**: `requirement`, `concern`, `constraint`, `assume`, `require`, `assert`, `satisfy`, `subject`, `actor`, `stakeholder`, `verification`, `verify`, `case`, `objective`, `frame`, `crosses`
- **Calculation and analysis**: `calc`, `analysis`, `return`, `expose`, `view`, `viewpoint`, `render`, `rendering`, `rep`
- **Allocation**: `allocate`, `allocation`, `assign`
- **Quantities**: numeric literals `1.0`, units `[g]`/`[mm]`/`[g/cm**3]`/`[%]`, range `..`, `+/-`, comparison `==`/`!=`/`<`/`<=`/`>`/`>=`, logical `and`/`or`/`not`/`xor`/`implies`
- **Misc**: `null`, `true`, `false`, `default`, `derived`, `constant`, `ordered`, `nonunique`, `all`, `first`, `filter`, `if`, `when`, `via`, `include`, `hastype`, `istype`, `terminate`, `message`, `snapshot`, `timeslice`, `standard`

This inventory is one input to the system-prompt context for `edit_spec`. The full BNF is the parser-generator's source of truth; this list is the LLM's high-recall summary.
