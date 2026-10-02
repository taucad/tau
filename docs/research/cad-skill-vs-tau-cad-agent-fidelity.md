---
title: 'CAD Skill vs Tau CAD Agent Fidelity Audit'
description: 'Deep comparison of the cad-projects CAD skill workflow against Tau CAD agent prompts and API tooling, with concrete improvement recommendations for higher-fidelity CAD generation.'
status: draft
created: '2026-05-27'
updated: '2026-06-01'
category: comparison
related:
  - docs/research/geospec-standalone-cad-testing-blueprint.md
  - docs/research/vitest-style-parameter-geometry-testing-blueprint.md
  - docs/research/system-prompt-audit.md
  - docs/research/complex-task-agent-gap-analysis.md
  - docs/research/code-cad-topology-best-practices.md
  - docs/research/build123d-occt-api-usage-survey.md
  - docs/research/export-pipeline-gap-analysis.md
  - docs/research/runtime-runner-primitive.md
  - docs/research/spatial-test-feedback-architecture.md
---

# CAD Skill vs Tau CAD Agent Fidelity Audit

This research compares the CAD skill in `/Users/rifont/git/cad-projects/.agents/skills/cad` with Tau's CAD agent prompt and neighboring API/tooling under `/Users/rifont/git/tau/apps/api/app/api/chat/prompts/cad-agent.prompt.ts`.

The core conclusion is simple: **the CAD skill produces higher-fidelity models because it is a CAD production workflow, not only a system prompt.** It constrains the artifact format, source envelope, generation command, topology sidecars, validation hierarchy, render handoff, and repair loop. Tau has a substantially improved prompt and useful tools, but the platform still leaves key fidelity decisions to agent compliance and validates mainly through GLB mesh statistics rather than STEP/native CAD topology.

## Table of Contents

- [Executive Summary](#executive-summary)
- [Problem Statement](#problem-statement)
- [Methodology](#methodology)
- [System Shape](#system-shape)
- [Comparison Matrix](#comparison-matrix)
- [Findings](#findings)
- [Tau Strengths](#tau-strengths)
- [Why the CAD Skill Gets Higher Fidelity](#why-the-cad-skill-gets-higher-fidelity)
- [Tau Improvement Surface](#tau-improvement-surface)
- [Recommendations](#recommendations)
- [Implementation Roadmap](#implementation-roadmap)
- [Open Questions](#open-questions)
- [References](#references)

## Executive Summary

1. **The CAD skill is STEP-first and BREP-first.** It states that STEP is the primary CAD artifact, DXF/STL/3MF/GLB are secondary, and default output is closed positive-volume solids with labeled assembly compounds. Evidence: `/Users/rifont/git/cad-projects/.agents/skills/cad/SKILL.md:10`, `/Users/rifont/git/cad-projects/.agents/skills/cad/SKILL.md:24`, `/Users/rifont/git/cad-projects/.agents/skills/cad/SKILL.md:28`, `/Users/rifont/git/cad-projects/.agents/skills/cad/SKILL.md:82`.
2. **Tau's CAD agent is prompt-first and multi-kernel.** Its prompt now sets a production-grade role, TDD workflow, visual inspection loop, geometry-fidelity section, and per-kernel topology hints. Evidence: `apps/api/app/api/chat/prompts/cad-agent.prompt.ts:164`, `apps/api/app/api/chat/prompts/cad-agent.prompt.ts:103`, `apps/api/app/api/chat/prompts/cad-agent.prompt.ts:137`, `apps/api/app/api/chat/prompts/cad-agent.prompt.ts:298`, `apps/api/app/api/chat/prompts/kernel-prompt-configs/kernel.prompt.config.ts:10`.
3. **The CAD skill validates geometry through source-derived STEP artifacts and selector-aware topology sidecars.** `scripts/step` creates hidden Explorer GLB/topology by default, and `scripts/inspect` exposes refs, facts, planes, positioning, measure, mate, frame, and diff. Evidence: `/Users/rifont/git/cad-projects/.agents/skills/cad/references/step-generation.md:54`, `/Users/rifont/git/cad-projects/.agents/skills/cad/references/inspection-and-validation.md:37`, `/Users/rifont/git/cad-projects/.agents/skills/cad/scripts/inspect/inspect_refs/cli.py:69`.
4. **Tau validates primarily through GLB analysis.** `test_model` fetches `fetchGeometry`, receives a `glb`, and runs `GeometryAnalysisService.runMeasurementTests` over `analyzeGlb`. Evidence: `apps/api/app/api/tools/tools/tool-test-model.ts:151`, `apps/api/app/api/tools/tools/tool-test-model.ts:176`, `libs/chat/src/schemas/rpc.schema.ts:228`, `apps/api/app/api/analysis/geometry-analysis.service.ts:13`.
5. **The CAD skill has first-class assembly intent.** It pushes part-local frames, named datums, build123d joints, explicit `Location` transforms, and post-export mating validation. Evidence: `/Users/rifont/git/cad-projects/.agents/skills/cad/SKILL.md:30`, `/Users/rifont/git/cad-projects/.agents/skills/cad/references/positioning.md:5`, `/Users/rifont/git/cad-projects/.agents/skills/cad/references/positioning.md:19`, `/Users/rifont/git/cad-projects/.agents/skills/cad/references/positioning.md:136`.
6. **Tau has good prompt language for visible detail, but fewer hard platform contracts for assemblies.** The prompt tells the agent to model real fasteners, ribs, fillets, joints, and sub-components, but the runtime has no source-level joint/datums contract analogous to the CAD skill's inspection/ref workflow. Evidence: `apps/api/app/api/chat/prompts/cad-agent.prompt.ts:168`, `/Users/rifont/git/cad-projects/.agents/skills/cad/references/positioning.md:13`.
7. **Tau should not just copy the CAD skill text.** It should productize the missing contracts: high-fidelity CAD mode, native/STEP inspection, selector artifacts, validation gates after edits, render QA packets, artifact provenance, and assembly/joint metadata.

## 2026-06-01 Target-State Alignment

GeoSpec is now the target implementation path for the validation gaps identified here:

- The CAD skill's STEP/BRep/measurement/mate/frame validation vocabulary should inform GeoSpec APIs, not remain prompt-only guidance.
- `@taucad/testing` should adapt Tau projects into GeoSpec `GeometryArtifact` inputs and expose agent-friendly prompt examples.
- `test_model` and `edit_tests` are migration surfaces. The target loop is parameter-aware ESM tests plus GeoSpec diagnostics, with STEP/AP242 and BRep evidence available where kernels can emit or import it.

## Problem Statement

Tau's current CAD prompt has moved in the right direction. It explicitly says the agent is producing manufacturing-facing CAD, not a hobbyist sketch; it scopes anti-gold-plating to code rather than geometry; and it adds topology and visual-inspection guidance. The tests enforce many of these prompt properties. Evidence: `apps/api/app/api/chat/prompts/cad-agent.prompt.test.ts:18`, `apps/api/app/api/chat/prompts/cad-agent.prompt.test.ts:51`, `apps/api/app/api/chat/prompts/cad-agent.prompt.test.ts:70`, `apps/api/app/api/chat/prompts/cad-agent.prompt.test.ts:787`.

Yet models produced through the cad-projects skill can be visibly and structurally higher fidelity. This audit asks why.

The answer is not "better prose." It is that the CAD skill converts prose into a reproducible CAD brief, writes build123d source with a fixed `gen_step()` envelope, exports STEP through an XCAF-preserving pipeline, generates topology sidecars, inspects refs/planes/mating frames, renders through CAD Explorer, and repairs source-level causes. Tau asks the model to do several of these things, but the API does not yet make them unavoidable or native.

## Methodology

1. Read Tau's research workflow skills at `.agent/skills/create-research/SKILL.md` and `.agent/skills/mine/SKILL.md`.
2. Mined the CAD skill files, including `SKILL.md`, `references/step-generation.md`, `references/inspection-and-validation.md`, `references/positioning.md`, `references/build123d-modeling.md`, `references/parameters.md`, `references/render-review.md`, and `references/repair-loop.md`.
3. Mined CAD skill implementation files for the actual enforcement layer: `scripts/common/step_export.py`, `scripts/common/generation.py`, `scripts/common/step_scene.py`, `scripts/common/step_targets.py`, and `scripts/inspect/inspect_refs/cli.py`.
4. Mined Tau's prompt and prompt tests: `cad-agent.prompt.ts`, `cad-agent.prompt.test.ts`, and `kernel-prompt-configs/*`.
5. Mined Tau's API/tooling layer: `chat.service.ts`, `tool.service.ts`, `tool-test-model.ts`, `tool-screenshot.ts`, `tool-export-geometry.ts`, `geometry-analysis.service.ts`, RPC schemas, model schemas, publication schemas, and trimming middleware.
6. Cross-checked with prior Tau research docs on topology, complex task gaps, build123d/OCCT, export pipeline, and spatial testing.

## System Shape

### CAD Skill Shape

The CAD skill is organized as a progressive skill with a small root file and task-specific references. The root required workflow is explicit: classify, load needed references, create a CAD brief, plan, edit source, generate explicit targets, validate geometrically, hand off to render, tier visual review, then repair and rerun. Evidence: `/Users/rifont/git/cad-projects/.agents/skills/cad/SKILL.md:67`.

Its non-negotiables make STEP the primary validated artifact, require named parameters and labels, keep generated artifacts derived, author assembly positioning in source, and report only checks that actually ran. Evidence: `/Users/rifont/git/cad-projects/.agents/skills/cad/SKILL.md:80`.

The workflow is backed by command-line tools rather than prompt text alone:

- `scripts/step` generates explicit STEP targets and Explorer sidecars.
- `scripts/inspect` resolves CAD refs, measures, validates frames, computes mating deltas, and diffs geometry.
- `$render` starts/reuses CAD Explorer and creates snapshot packets.

Evidence: `/Users/rifont/git/cad-projects/.agents/skills/cad/SKILL.md:53`, `/Users/rifont/git/cad-projects/.agents/skills/cad/SKILL.md:75`, `/Users/rifont/git/cad-projects/.agents/skills/render/SKILL.md:12`.

### Tau CAD Agent Shape

Tau builds a kernel-aware prompt from `getKernelConfig(kernel)`, a prompt-section registry, and static/dynamic sections. Evidence: `apps/api/app/api/chat/prompts/cad-agent.prompt.ts:80`, `apps/api/app/api/chat/prompts/cad-agent.prompt.ts:160`, `apps/api/app/api/chat/prompts/cad-agent.prompt.ts:440`.

The prompt has valuable sections:

- `<role>`: production-grade, dimensionally faithful, visible details matter. Evidence: `apps/api/app/api/chat/prompts/cad-agent.prompt.ts:164`.
- `<workflow>`: decompose, plan, edit tests, implement, verify, test, screenshot, iterate. Evidence: `apps/api/app/api/chat/prompts/cad-agent.prompt.ts:101`.
- `<test_requirements>`: deterministic `test.json`, per-file requirements, top-level geometry. Evidence: `apps/api/app/api/chat/prompts/cad-agent.prompt.ts:121`.
- `<visual_inspection>`: predict properties, inspect screenshots, resist rationalization. Evidence: `apps/api/app/api/chat/prompts/cad-agent.prompt.ts:137`.
- `<geometry_fidelity>` and `<topology_hints>`: analytical primitives, topology economy, per-kernel vocabulary. Evidence: `apps/api/app/api/chat/prompts/cad-agent.prompt.ts:298`, `apps/api/app/api/chat/prompts/cad-agent.prompt.ts:247`.

The tools include `get_kernel_result`, `test_model`, `edit_tests`, `screenshot`, and `export_geometry`, but `test_model`/`edit_tests` are only included when testing is enabled. Evidence: `apps/api/app/api/chat/chat.service.ts:97`.

## Comparison Matrix

| Dimension              | CAD skill                                                      | Tau CAD agent today                                                  | Fidelity implication                                               |
| ---------------------- | -------------------------------------------------------------- | -------------------------------------------------------------------- | ------------------------------------------------------------------ |
| Primary artifact       | STEP/STP, BREP-first                                           | Kernel source plus runtime GLB, optional exports                     | CAD skill optimizes for CAD semantics before visuals.              |
| Source envelope        | build123d Python `gen_step()`                                  | Kernel-specific source file conventions                              | Tau is flexible; CAD skill is reproducible.                        |
| Assembly intent        | Part-local datums, build123d joints, frames, mate validation   | Prompt says components/joints; runtime mostly sees rendered geometry | CAD skill preserves and checks assembly relationships.             |
| Validation             | STEP refs, facts, planes, topology, measure, mate, frame, diff | `boundingBox`, `connectedComponents`, `watertight` over GLB          | Tau catches broad failures but misses many CAD semantics.          |
| Render review          | CAD Explorer handoff plus snapshot packets                     | Screenshot tool through active browser RPC                           | Tau has images; CAD skill has selector-aware CAD viewer artifacts. |
| Artifact provenance    | STEP hash checked against GLB topology                         | GLB artifact paths returned but later trimmed                        | CAD skill guards stale sidecars; Tau loses some continuity.        |
| Repair loop            | Small source repair and rerun failed validation                | Prompt-level error handling and safeguards                           | CAD skill has more CAD-specific repair classes.                    |
| Knowledge architecture | Progressive references per subproblem                          | Monolithic prompt sections plus kernel configs                       | CAD skill activates narrower expert context.                       |
| Kernel scope           | build123d/OpenCascade path                                     | Six kernels, BREP and mesh                                           | Tau breadth dilutes high-fidelity defaults.                        |
| Publication/export     | Derived from validated STEP                                    | Export tool optional, returns artifact metadata only                 | Tau needs validation/provenance around deliverables.               |

## Findings

### Finding 1: The CAD skill is a workflow contract; Tau is still mostly an instruction contract

The CAD skill's required workflow is not advisory fluff. It directly names the sequence from brief to source to STEP generation to `scripts/inspect` to render to repair. Evidence: `/Users/rifont/git/cad-projects/.agents/skills/cad/SKILL.md:67`.

Tau's prompt also has a strong workflow, including TDD and screenshot iteration. Evidence: `apps/api/app/api/chat/prompts/cad-agent.prompt.ts:103`. The gap is enforcement. `ChatService` assembles tools and prompt, but there is no final completion gate that proves the latest edited source compiled, passed tests, rendered, and remained current after the last edit. Evidence: `apps/api/app/api/chat/chat.service.ts:155`.

Impact: Tau can produce excellent models when the agent follows the prompt. The CAD skill produces higher average fidelity because the happy path is operationally narrower and every step has a concrete command or artifact contract.

### Finding 2: STEP-first BREP changes what the agent optimizes for

The CAD skill treats STEP as the primary artifact and STL/3MF/GLB/DXF as secondary. Evidence: `/Users/rifont/git/cad-projects/.agents/skills/cad/SKILL.md:10`, `/Users/rifont/git/cad-projects/.agents/skills/cad/SKILL.md:82`. The build123d modeling reference says the objective is a valid STEP-ready BREP, not a visual mesh. Evidence: `/Users/rifont/git/cad-projects/.agents/skills/cad/references/build123d-modeling.md:5`.

Tau supports six kernels. Some are BREP-oriented, like Replicad and OpenCascade.js; others are mesh/CSG-oriented, like OpenSCAD, JSCAD, and Manifold. Evidence: `apps/api/app/api/chat/prompts/kernel-prompt-configs/kernel.prompt.config.ts:10`, `apps/api/app/api/chat/prompts/kernel-prompt-configs/openscad.prompt.config.ts:15`, `apps/api/app/api/chat/prompts/kernel-prompt-configs/manifold.prompt.config.ts:15`.

Tau's breadth is a product strength, but fidelity guidance must compensate for the BREP-vs-mesh divide. The prompt now has global geometry-fidelity guidance and per-kernel topology hints. Evidence: `apps/api/app/api/chat/prompts/cad-agent.prompt.ts:298`, `apps/api/app/api/chat/prompts/kernel-prompt-configs/replicad.prompt.config.ts:23`, `apps/api/app/api/chat/prompts/kernel-prompt-configs/opencascadejs.prompt.config.ts:15`. The missing piece is routing high-fidelity mechanical work toward BREP/native/STEP paths by default.

### Finding 3: CAD skill exports preserve CAD structure, names, and colors

The CAD skill's STEP exporter creates an XCAF document, marks assemblies, applies labels and colors, turns on STEP color/layer/name modes, writes the file, verifies non-empty output, and reloads the exported scene. Evidence: `/Users/rifont/git/cad-projects/.agents/skills/cad/scripts/common/step_export.py:47`, `/Users/rifont/git/cad-projects/.agents/skills/cad/scripts/common/step_export.py:79`, `/Users/rifont/git/cad-projects/.agents/skills/cad/scripts/common/step_export.py:127`, `/Users/rifont/git/cad-projects/.agents/skills/cad/scripts/common/step_export.py:144`.

Tau's `export_geometry` is a user-driven deliverable tool. It returns `artifactPath`, `format`, `mimeType`, and `byteLength`. Evidence: `apps/api/app/api/tools/tools/tool-export-geometry.ts:10`, `apps/api/app/api/tools/tools/tool-export-geometry.ts:47`, `libs/chat/src/schemas/tools/export-geometry.tool.schema.ts:16`. That is useful, but it does not return a validation summary, topology stats, digest, export route/fidelity, or render preview metadata.

Impact: CAD skill artifacts carry more downstream structure by default. Tau exports are downloadable outputs, not yet validated CAD provenance bundles.

### Finding 4: CAD skill sidecars make GLB a CAD viewer artifact, not a substitute for CAD

The CAD skill generates adjacent hidden Explorer GLB/topology artifacts by default. Evidence: `/Users/rifont/git/cad-projects/.agents/skills/cad/references/step-generation.md:54`. Implementation loads and meshes STEP, extracts selectors, embeds assembly composition, writes GLB/topology, and reports selector-manifest changes. Evidence: `/Users/rifont/git/cad-projects/.agents/skills/cad/scripts/common/generation.py:1100`, `/Users/rifont/git/cad-projects/.agents/skills/cad/scripts/common/generation.py:1184`, `/Users/rifont/git/cad-projects/.agents/skills/cad/scripts/common/generation.py:1203`.

The topology manifest includes occurrence, shape, face, and edge columns with transforms, bboxes, centers, area, volume, surface/curve types, normals, parameters, adjacency, and picking proxies. Evidence: `/Users/rifont/git/cad-projects/.agents/skills/cad/scripts/common/step_scene.py:1407`, `/Users/rifont/git/cad-projects/.agents/skills/cad/scripts/common/step_scene.py:1572`, `/Users/rifont/git/cad-projects/.agents/skills/cad/scripts/common/step_scene.py:1666`, `/Users/rifont/git/cad-projects/.agents/skills/cad/scripts/common/step_scene.py:1771`.

Tau's GLB path is the validation input itself. `fetchGeometry` returns only a GLB and optional artifact path; `GeometryAnalysisService` runs `analyzeGlb`. Evidence: `libs/chat/src/schemas/rpc.schema.ts:228`, `apps/api/app/api/analysis/geometry-analysis.service.ts:20`.

Impact: the CAD skill uses GLB as a selector-aware rendering companion to STEP. Tau often uses GLB as the geometry truth for validation.

### Finding 5: CAD skill rejects stale topology; Tau trims away useful artifact continuity

The CAD skill validates that topology sidecars exist, include readable `STEP_topology`, use the expected schema, and match the current STEP hash. Evidence: `/Users/rifont/git/cad-projects/.agents/skills/cad/scripts/common/step_targets.py:180`, `/Users/rifont/git/cad-projects/.agents/skills/cad/scripts/common/step_targets.py:198`, `/Users/rifont/git/cad-projects/.agents/skills/cad/scripts/common/step_targets.py:223`.

Tau's `test_model` can return `geometryArtifactPaths`. Evidence: `apps/api/app/api/tools/tools/tool-test-model.ts:189`, `packages/testing/src/schemas.ts:232`. But the trimmer drops `geometryArtifactPaths` from future model context. Evidence: `apps/api/app/api/chat/middleware/tool-result-trimmer.middleware.ts:223`.

Impact: Tau's UI may have access to artifacts, but the next model turn loses a compact pointer to the latest known-good geometry. That weakens export, publication, and follow-up validation continuity.

### Finding 6: CAD skill inspection is selector-aware and CAD-semantic; Tau's test vocabulary is intentionally narrow

The CAD skill validation hierarchy includes refs/facts/planes/positioning, measure, mate, frame, diff, render links, and visual-to-deterministic follow-up. Evidence: `/Users/rifont/git/cad-projects/.agents/skills/cad/references/inspection-and-validation.md:37`.

The `inspect` CLI implements `refs`, `diff`, `frame`, `measure`, and `mate`. Evidence: `/Users/rifont/git/cad-projects/.agents/skills/cad/scripts/inspect/inspect_refs/cli.py:69`, `/Users/rifont/git/cad-projects/.agents/skills/cad/scripts/inspect/inspect_refs/cli.py:119`, `/Users/rifont/git/cad-projects/.agents/skills/cad/scripts/inspect/inspect_refs/cli.py:134`, `/Users/rifont/git/cad-projects/.agents/skills/cad/scripts/inspect/inspect_refs/cli.py:142`, `/Users/rifont/git/cad-projects/.agents/skills/cad/scripts/inspect/inspect_refs/cli.py:152`.

Tau's public measurement vocabulary is only `boundingBox`, `connectedComponents`, and `watertight`. Evidence: `packages/testing/src/schemas.ts:28`, `packages/testing/src/schemas.ts:44`, `packages/testing/src/prompt-examples.ts:90`. The schema has structured diagnostics, but still around those three checks. Evidence: `packages/testing/src/schemas.ts:154`.

Impact: Tau can detect wrong scale, missing/floating clusters, and open meshes. It cannot yet directly ask "is this face coplanar with that face?", "is this hole coaxial?", "is the lid underside flush with the base seat?", "is this edge a circle vs a polyline?", or "did the exported face area/volume remain stable?"

### Finding 7: CAD skill assembly fidelity is grounded in source-level datums and joints

The positioning reference states the core rule: positioning is authored in source and validated after generation. Evidence: `/Users/rifont/git/cad-projects/.agents/skills/cad/references/positioning.md:5`.

It distinguishes build123d joints from CLI `inspect mate`, then recommends fixed/root components, part-local coordinate systems, named datums/joints, labeled compounds, and refs/measure/frame/mate validation. Evidence: `/Users/rifont/git/cad-projects/.agents/skills/cad/references/positioning.md:13`, `/Users/rifont/git/cad-projects/.agents/skills/cad/references/positioning.md:19`.

Tau's prompt tells the agent to decompose components and model visible joints/sub-components. Evidence: `apps/api/app/api/chat/prompts/cad-agent.prompt.ts:101`, `apps/api/app/api/chat/prompts/cad-agent.prompt.ts:168`. But the API does not yet expose assembly frames, mating refs, joint limits, or per-part datums as first-class validation outputs.

Impact: complex assemblies are where the CAD skill most clearly wins. It has a way to talk about and check design relationships, not just rendered shapes.

### Finding 8: CAD skill parameter and animation guidance separates mechanical truth from viewer-time transforms

The parameters reference says parameters are part of the model contract and should map to named geometry or motion with units, bounds, affected features, and validation. Evidence: `/Users/rifont/git/cad-projects/.agents/skills/cad/references/parameters.md:5`, `/Users/rifont/git/cad-projects/.agents/skills/cad/references/parameters.md:11`.

For animations, it says to drive the smallest real degrees of freedom, preserve pivots/mating faces/contacts, separate style controls from mechanism controls, and use JavaScript sidecars for Explorer interaction while Python/build123d remains geometry truth. Evidence: `/Users/rifont/git/cad-projects/.agents/skills/cad/references/parameters.md:66`, `/Users/rifont/git/cad-projects/.agents/skills/cad/references/parameters.md:78`.

Tau has parameter architecture research and a screenshot loop, but the CAD agent prompt/tool API does not yet encode a comparable mechanism contract for live controls, source-derived sidecars, or animation validation.

Impact: CAD Explorer assemblies can animate smoothly because the runtime moves existing meshes/occurrences via JavaScript/Three.js-style transforms rather than regenerating CAD on every slider change, while the CAD skill's guidance prevents those transforms from masquerading as regenerated geometry. Tau should expose the same distinction explicitly.

### Finding 9: CAD skill render review is downstream of deterministic checks; Tau visual validation is model-vision heavy

The render-review reference says CAD Explorer links are the live handoff layer, snapshots are visual feedback, and snapshots do not replace STEP generation, inspection, measurements, mating checks, frames, or diffs. Evidence: `/Users/rifont/git/cad-projects/.agents/skills/cad/references/render-review.md:5`.

Tau's screenshot tool captures a specific geometry unit, either current camera or six orthographic views. Evidence: `apps/api/app/api/tools/tools/tool-screenshot.ts:11`. Middleware injects the latest screenshot as multimodal blocks so the LLM can inspect it. Evidence: `apps/api/app/api/chat/middleware/tool-result-trimmer.middleware.ts:440`.

The CAD skill has a stronger review model: one small diagnostic packet after geometric validation, then every visual concern must become a deterministic geometry check. Evidence: `/Users/rifont/git/cad-projects/.agents/skills/cad/references/render-review.md:19`, `/Users/rifont/git/cad-projects/.agents/skills/cad/references/render-review.md:65`.

Impact: Tau's visual loop depends more on the LLM seeing and interpreting screenshots correctly. The CAD skill treats images as a diagnostic layer attached to selector-aware CAD facts.

### Finding 10: CAD skill repair guidance is CAD-specific; Tau's repair guidance is broader

The CAD skill repair loop classifies source syntax failures, invalid geometry, fillet/chamfer failures, wrong scale, missing features, selector fragility, positioning mismatch, Explorer startup failures, and render failures. Evidence: `/Users/rifont/git/cad-projects/.agents/skills/cad/references/repair-loop.md:5`, `/Users/rifont/git/cad-projects/.agents/skills/cad/references/repair-loop.md:32`, `/Users/rifont/git/cad-projects/.agents/skills/cad/references/repair-loop.md:97`, `/Users/rifont/git/cad-projects/.agents/skills/cad/references/repair-loop.md:111`.

Tau has useful prompt-level error handling: diagnose before switching, preserve working geometry, read failure reason and suggestion, and avoid weakening tests. Evidence: `apps/api/app/api/chat/prompts/cad-agent.prompt.ts:256`.

Impact: Tau should keep the general agent safeguard layer, but add CAD-specific repair classes and structured failure hints from richer geometry inspection.

### Finding 11: Tau's export and publication APIs do not yet carry validation provenance

The publication manifest stores project ID, entry file, files, kernels, runtime, parameters, and created timestamp. Evidence: `apps/api/app/api/publications/publications.dto.ts:44`, `apps/api/app/api/publications/publications.service.ts:191`. It uses default OG/thumbnail keys in the current service path. Evidence: `apps/api/app/api/publications/publications.service.ts:157`.

There is no stored test result, geometry digest, render thumbnail generated from the model, export route/fidelity summary, or latest validated artifact reference in that manifest shape.

Impact: published models can be reproducible as source blobs, but not auditable as "this exact model passed these CAD checks and rendered like this."

### Finding 12: Tau's browser RPC transport is convenient but constrains heavy CAD validation

The RPC service has a 60 second execution timeout and routes requests to a connected browser socket. Evidence: `apps/api/app/api/chat/chat-rpc.service.ts:20`, `apps/api/app/api/chat/chat-rpc.service.ts:236`, `apps/api/app/api/chat/chat-rpc.service.ts:248`.

That works well for interactive browser-first CAD. It is less ideal for high-fidelity validation/export paths that may need large STEP/native artifacts, topology extraction, healing, multi-view renders, or long-running meshing.

Impact: high-fidelity Tau CAD needs a backend/durable-job path for expensive inspection and export, or at least artifact-backed async RPC, not only active-tab GLB roundtrips.

## Tau Strengths

Tau has real advantages that the CAD skill does not replace:

1. **Kernel breadth.** Tau supports OpenSCAD, Replicad, Manifold, KCL/Zoo, JSCAD, and OpenCascade.js through a uniform prompt/config abstraction. Evidence: `apps/api/app/api/chat/prompts/kernel-prompt-configs/kernel.prompt.config.ts:10`.
2. **Strong prompt regression tests.** Prompt tests guard production-grade role language, visual-inspection anti-rationalization, topology sections, export gating, and kernel-specific vocabulary. Evidence: `apps/api/app/api/chat/prompts/cad-agent.prompt.test.ts:51`, `apps/api/app/api/chat/prompts/cad-agent.prompt.test.ts:97`, `apps/api/app/api/chat/prompts/cad-agent.prompt.test.ts:787`, `apps/api/app/api/chat/prompts/cad-agent.prompt.test.ts:1044`.
3. **Per-kernel examples and topology hints.** `KernelConfig` includes code standards, common errors, canonical examples, topology hints, top-level export examples, and multi-file examples. Evidence: `apps/api/app/api/chat/prompts/kernel-prompt-configs/kernel.prompt.config.types.ts:31`.
4. **TDD flow is already close to the right shape.** The agent is instructed to write tests before code, compile after edits, run measurements, and inspect screenshots. Evidence: `apps/api/app/api/chat/prompts/cad-agent.prompt.ts:103`, `apps/api/app/api/chat/prompts/cad-agent.prompt.ts:117`.
5. **Structured test diagnostics exist.** Failures have IDs, requirements, reasons, suggestions, target files, and optional structured payloads. Evidence: `packages/testing/src/schemas.ts:189`.
6. **Runtime integration is productized.** The API has chat tools, RPC schemas, middleware, prompt caching, metrics, publications, and browser screenshot flows. Evidence: `apps/api/app/api/chat/chat.service.ts:117`, `apps/api/app/api/chat/chat.service.ts:141`, `apps/api/app/api/tools/tool.service.ts:46`.

The recommended path is to bring the CAD skill's operational contracts into Tau's platform, not to discard Tau's multi-kernel architecture.

## Why the CAD Skill Gets Higher Fidelity

The CAD skill is better at high-fidelity modeling because it stacks several fidelity multipliers:

1. **It starts with an engineering brief.** The natural-language-spec reference requires model type, dimensions, features, positioning/mating, outputs, validation targets, and assumptions before coding. Evidence: `/Users/rifont/git/cad-projects/.agents/skills/cad/references/natural-language-specs.md:5`.
2. **It narrows the source envelope.** build123d source defines `gen_step()`, returns a valid solid/compound/assembly, and keeps output paths under the CLI. Evidence: `/Users/rifont/git/cad-projects/.agents/skills/cad/references/build123d-modeling.md:25`.
3. **It uses a CAD-native primary artifact.** STEP remains the validated artifact; mesh outputs are derived. Evidence: `/Users/rifont/git/cad-projects/.agents/skills/cad/references/supported-exports.md:5`.
4. **It preserves semantic structure.** XCAF labels, colors, assembly structure, and STEP names make downstream review more intelligible. Evidence: `/Users/rifont/git/cad-projects/.agents/skills/cad/scripts/common/step_export.py:47`.
5. **It creates selector-aware sidecars.** The viewer can pick faces/edges and copy `@cad[...]` references from visible triangles/proxy geometry. Evidence: `/Users/rifont/git/cad-projects/.agents/skills/render/scripts/viewer/README.md:56`, `/Users/rifont/git/cad-projects/.agents/skills/render/scripts/viewer/README.md:124`.
6. **It verifies positions, not just shapes.** Frames, mating deltas, measurements, plane groups, and diffs catch the subtle errors that screenshots and bboxes miss. Evidence: `/Users/rifont/git/cad-projects/.agents/skills/cad/references/inspection-and-validation.md:82`, `/Users/rifont/git/cad-projects/.agents/skills/cad/references/inspection-and-validation.md:95`, `/Users/rifont/git/cad-projects/.agents/skills/cad/references/inspection-and-validation.md:109`.
7. **It repairs causes, not symptoms.** The repair loop points the agent at source-level fixes and reruns dependent checks. Evidence: `/Users/rifont/git/cad-projects/.agents/skills/cad/references/repair-loop.md:7`.

## Tau Improvement Surface

### Prompt Surface

Tau's prompt is already much stronger than the old complex-task gap analysis state. The remaining prompt improvements should focus on contracts the tooling can enforce:

- Add an explicit "high-fidelity CAD mode" decision rule: for mechanical assemblies, mating surfaces, STEP requests, or "production-grade" prompts, prefer BREP kernels/routes and native/STEP validation where available.
- Add a CAD brief section that mirrors the CAD skill's internal brief: model, units, coordinate convention, features, positioning/mating, validation targets, assumptions.
- Add assembly/joint/datums guidance with a tool-backed validation vocabulary, not just "components and joints."
- Add export/provenance language after a platform export bundle exists; avoid asking for exports in the happy path until validation can follow.

### Tool/API Surface

Tau should add tools or tool extensions for:

- `inspect_geometry`: bbox, volume, surface area, face/edge counts, surface/curve types, major planes, holes/cylinders, centerlines, named parts, colors/materials, and labels.
- `inspect_ref`: stable selector lookup by face/edge/occurrence/name and return copyable refs.
- `measure_geometry`: distances, clearances, offsets, thickness, hole diameters, radii, center spacing, angular spacing.
- `mate_geometry`: read-only flush/center/coaxial/offset deltas.
- `frame_geometry`: world/local frame for occurrence or selector.
- `diff_geometry`: before/after topology and measurement deltas.

These map almost directly to the CAD skill's `scripts/inspect` surface. Evidence: `/Users/rifont/git/cad-projects/.agents/skills/cad/scripts/inspect/inspect_refs/cli.py:69`.

### Runtime Surface

Tau's current `fetchGeometry` returns only GLB and an optional artifact path. Evidence: `libs/chat/src/schemas/rpc.schema.ts:228`. For high-fidelity CAD, it should return or link to a structured geometry artifact bundle:

- source file hash
- kernel ID and version
- native/STEP artifact path when available
- GLB path
- topology/index path
- artifact digest
- export route and fidelity
- validation summary
- render preview paths

### Publication Surface

Tau publication should store validation and render provenance:

- source snapshot hash
- `test.json` hash
- test result summary
- geometry artifact digests
- export route/fidelity
- generated thumbnail and OG image from the actual model
- latest validated artifact pointer
- runtime/kernel exact versions

The current stored manifest shape has no room for these fields. Evidence: `apps/api/app/api/publications/publications.dto.ts:44`.

## Recommendations

| ID  | Recommendation                                                                                                                                           | Priority | Effort | Evidence / rationale                                                                                                                                           |
| --- | -------------------------------------------------------------------------------------------------------------------------------------------------------- | -------- | ------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| R1  | Add a `high_fidelity_cad` prompt/profile that requires CAD brief, source plan, compile, geometry tests, render, and repair after latest edit.            | P0       | M      | CAD skill workflow is explicit at `/Users/rifont/git/cad-projects/.agents/skills/cad/SKILL.md:67`; Tau workflow is prompt-only at `cad-agent.prompt.ts:103`.   |
| R2  | Add a server-side CAD completion gate recording latest edit hash, latest successful compile, latest tests, and latest screenshot/render after that edit. | P0       | M      | `ChatService` creates agent/tools but no final gate at `apps/api/app/api/chat/chat.service.ts:155`.                                                            |
| R3  | Extend `test_model` beyond GLB-only checks or add `inspect_geometry` for native/STEP/BREP analysis.                                                      | P0       | L      | Tau checks are `boundingBox`, `connectedComponents`, `watertight` at `packages/testing/src/schemas.ts:44`; CAD inspection has refs/measure/mate/frame/diff.    |
| R4  | Preserve latest validated artifact pointers in model context as compact metadata instead of trimming all `geometryArtifactPaths`.                        | P1       | S      | Paths are produced at `tool-test-model.ts:189` and trimmed at `tool-result-trimmer.middleware.ts:231`.                                                         |
| R5  | Make STEP/GLB/topology bundles first-class artifacts, not incidental exports.                                                                            | P1       | L      | CAD skill writes hidden GLB/topology by default at `step-generation.md:54`; Tau export returns only size/type metadata.                                        |
| R6  | Add selector-aware topology manifests for Tau viewer/runtime artifacts.                                                                                  | P1       | L      | CAD manifests encode occurrence/shape/face/edge tables and proxies at `step_scene.py:1407` and `step_scene.py:1790`.                                           |
| R7  | Add assembly intent contracts: named parts, local frames, datums, joints, joint limits, and mating checks.                                               | P1       | M      | CAD positioning rules at `positioning.md:5`; Tau prompt has visible joint language but no tool contract.                                                       |
| R8  | Route high-fidelity mechanical tasks to BREP-capable kernels by default or warn when a mesh kernel is selected.                                          | P1       | M      | Tau has both BREP and mesh kernel configs; mesh kernels explicitly lack analytical curves.                                                                     |
| R9  | Add render QA automation: blank image detection, framing checks, multi-view contact sheet, silhouette bounds, and failed-feature highlighting.           | P2       | M      | Tau screenshot injects images at `tool-result-trimmer.middleware.ts:440`, but structured render QA is absent.                                                  |
| R10 | Store validation and render provenance in publications.                                                                                                  | P2       | M      | Stored manifest has files/kernels/runtime/parameters only at `publications.dto.ts:44`.                                                                         |
| R11 | Add durable backend jobs for heavy CAD inspection/export/render instead of only active-tab browser RPC.                                                  | P2       | L      | Browser RPC timeout/socket dependency at `chat-rpc.service.ts:20` and `chat-rpc.service.ts:248`.                                                               |
| R12 | Split CAD prompt knowledge into skill-like progressive references loaded by task type.                                                                   | P2       | M      | CAD skill uses progressive references at `/Users/rifont/git/cad-projects/.agents/skills/cad/SKILL.md:92`; Tau packs most guidance into static prompt sections. |

## Implementation Roadmap

### Phase 1: Enforce the Existing Tau Loop

1. Track `lastEditHash` per geometry unit.
2. Track latest successful `get_kernel_result` after `lastEditHash`.
3. Track latest successful `test_model` after `lastEditHash` when testing is enabled.
4. Track latest screenshot/render after `lastEditHash`.
5. Surface a completion warning if the agent tries to finish without the required latest state.

This phase improves reliability without inventing a new CAD engine.

### Phase 2: Add a CAD Inspection Tool

Start with GLB-plus-runtime stats, then add BREP/native paths where kernels support them.

Minimum useful shape:

```ts
type InspectGeometryResult = {
  targetFile: string;
  artifact: { glbPath?: string; stepPath?: string; sha256?: string };
  bbox: { min: [number, number, number]; max: [number, number, number] };
  counts: { meshes?: number; solids?: number; faces?: number; edges?: number; vertices?: number };
  labels: string[];
  materials: Array<{ name: string; color?: string }>;
  majorPlanes: Array<{ id: string; normal: [number, number, number]; center: [number, number, number]; area: number }>;
  refs: Array<{ id: string; kind: 'occurrence' | 'shape' | 'face' | 'edge'; label?: string }>;
};
```

This creates the substrate for `measure`, `mate`, `frame`, and `diff`.

### Phase 3: First-Class Artifact Bundles

Build a Tau artifact bundle that resembles the CAD skill's STEP plus hidden GLB/topology pairing:

- native source
- compiled GLB
- STEP/native BREP when available
- topology/selector JSON or binary sidecar
- validation report
- snapshot contact sheet
- digest manifest

This should become the object that export, publication, and follow-up chat turns reference.

### Phase 4: Assembly and Animation Contracts

Add prompt/tool schema support for:

- named parts and occurrence IDs
- source-local frames
- pivots and axes
- fixed/moving components
- joint type and limits
- viewer-time control vs source-regeneration parameter
- validation poses: min, max, mid, default

This is the path to making Tau's animated assemblies technically honest and smooth.

## Open Questions

1. Should Tau add a Python/build123d kernel through a runner, or should it first deepen Replicad/OpenCascade.js native inspection? Prior research already frames a future `pythonSubprocessRunner` path in `docs/research/runtime-runner-primitive.md`.
2. Should high-fidelity mode be automatic based on prompt classification, user-selectable, or both?
3. How much selector/topology data should be retained in model context versus persisted as artifact metadata with compact summaries?
4. Should publication require passing validation for public models, or only store validation status when available?
5. Should Tau define a cross-kernel "CAD facts" schema that gracefully degrades for mesh kernels?

## References

- `/Users/rifont/git/cad-projects/.agents/skills/cad/SKILL.md`
- `/Users/rifont/git/cad-projects/.agents/skills/cad/references/step-generation.md`
- `/Users/rifont/git/cad-projects/.agents/skills/cad/references/inspection-and-validation.md`
- `/Users/rifont/git/cad-projects/.agents/skills/cad/references/positioning.md`
- `/Users/rifont/git/cad-projects/.agents/skills/cad/references/build123d-modeling.md`
- `/Users/rifont/git/cad-projects/.agents/skills/cad/references/parameters.md`
- `/Users/rifont/git/cad-projects/.agents/skills/cad/references/render-review.md`
- `/Users/rifont/git/cad-projects/.agents/skills/cad/references/repair-loop.md`
- `/Users/rifont/git/cad-projects/.agents/skills/render/SKILL.md`
- `apps/api/app/api/chat/prompts/cad-agent.prompt.ts`
- `apps/api/app/api/chat/prompts/cad-agent.prompt.test.ts`
- `apps/api/app/api/chat/prompts/kernel-prompt-configs/*.ts`
- `apps/api/app/api/chat/chat.service.ts`
- `apps/api/app/api/tools/tool.service.ts`
- `apps/api/app/api/tools/tools/tool-test-model.ts`
- `apps/api/app/api/tools/tools/tool-screenshot.ts`
- `apps/api/app/api/tools/tools/tool-export-geometry.ts`
- `apps/api/app/api/analysis/geometry-analysis.service.ts`
- `packages/testing/src/schemas.ts`
- `libs/chat/src/schemas/rpc.schema.ts`
- `apps/api/app/api/publications/publications.dto.ts`
- `apps/api/app/api/publications/publications.service.ts`
