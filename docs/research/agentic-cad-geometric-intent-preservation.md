---
title: 'Agentic CAD Geometric Intent Preservation'
description: 'Research-backed guidance for preserving geometric intent in CAD-agent prompts and verification loops.'
status: active
created: '2026-05-03'
updated: '2026-05-03'
category: architecture
related:
  - docs/policy/context-engineering-policy.md
  - docs/policy/vision-policy.md
  - docs/research/sysml2-cad-intent-architecture.md
  - docs/research/agent-image-region-clipping-tool.md
---

# Agentic CAD Geometric Intent Preservation

This document investigates May 2026 agentic CAD research and recommends prompt changes that help Tau's CAD agent preserve full geometric intent from text, images, and optional project context.

## Executive Summary

Recent CAD-agent systems converge on the same pattern: do not translate a user prompt directly into CAD code. First convert the prompt and optional visual/context input into a structured design specification, clarify only blocking ambiguities, then implement against measurable dimensions, part hierarchy, spatial constraints, and visual features. The strongest results combine exact kernel measurements with rendered visual inspection; neither text-only planning nor numeric checks alone reliably preserves geometric intent.

For Tau, the highest-impact prompt change is a compact `intent_capture` section that makes the agent produce an internal design ledger before modeling. The ledger should preserve explicit dimensions, inferred assumptions, part hierarchy, spatial relationships, colors/materials, visual-reference observations, and verification targets without adding a verbose second tool manual.

Follow-up standards research in `docs/research/sysml2-cad-intent-architecture.md` concludes that this internal ledger should evolve into SysML v2 textual notation for durable design intent, with STEP AP242 artifacts and OpenCASCADE.js queries providing geometry evidence. Tau should avoid inventing a proprietary CAD-intent spec file when `.sysml` can carry requirements, part hierarchy, quantities, coordinate frames, constraints, verification cases, and traceability.

Follow-up image-tool research in `docs/research/agent-image-region-clipping-tool.md` recommends a provenance-preserving `clip_image_region` capability so the agent can inspect specific visual features from attached images and canvas screenshots without losing global context.

## Problem Statement

The current CAD-agent prompt already asks the model to decompose multi-component models, write tests, render, and inspect. In practice, generated geometry still loses intent: components are omitted, proportions drift, colors/materials are simplified, visual-reference details are ignored, and tests cover only a small subset of the expected shape.

The question for this investigation is: what should the CAD-agent system prompt say so the model keeps more of the user's geometric intent before implementation and during verification?

## Methodology

Research was conducted with web search and local PDF extraction on 2026-era agentic CAD papers, CAD-code generation papers, and industry CAD-agent documentation. Representative PDFs were downloaded to `tmp/pdfs/agentic-cad/` and converted with the root `pdf-parse` CLI already available through `package.json`.

Sources reviewed:

| Source                                            | Type                      | Relevance                                                       |
| ------------------------------------------------- | ------------------------- | --------------------------------------------------------------- |
| ProCAD / Clarify Before You Draw                  | 2026 arXiv PDF            | Proactive clarification before CadQuery code generation         |
| CADSmith                                          | 2026 arXiv PDF            | Multi-agent planning, execution, kernel validation, VLM judging |
| CADReasoner                                       | 2026 arXiv PDF            | Iterative code editing from geometric discrepancy feedback      |
| AADvark                                           | 2026 arXiv HTML           | Dynamic assemblies, joints, and solver-backed verification      |
| Graph-CAD                                         | ICLR 2026 OpenReview text | Hierarchical geometry-aware intermediate representation         |
| OBJ2CAD                                           | OpenReview text           | Object-oriented hierarchy and geometric assembly reasoning      |
| CADCodeVerify                                     | ICLR 2025 PDF             | VLM-generated validation questions for render-based refinement  |
| CAD-Coder                                         | MIT 2025 PDF              | Image-conditioned editable CadQuery generation                  |
| Aligning Constraint Generation with Design Intent | Autodesk 2025 PDF         | Constraint-solver feedback and parametric design intent         |
| Text2CAD                                          | 2024 arXiv HTML           | Multi-level natural language annotations for CAD                |
| Zoo Zookeeper documentation                       | Industry docs             | CAD-agent workflow, model context, snapshots, measurements      |

## Findings

### Finding 1: Specification audit matters more than immediate code generation

ProCAD directly identifies the failure mode Tau is seeing: natural-language CAD descriptions are often under-specified or internally inconsistent, so a coding model "reactively" follows the prompt and hallucinates dimensions. ProCAD pairs a clarifying agent with a coding agent; the clarifier audits the prompt, asks targeted questions only when needed, and produces a self-consistent specification before code synthesis. The reported result is a 79.9% mean Chamfer-distance reduction and invalidity ratio improvement from 4.8% to 0.9% versus strong closed-source baselines.

Tau's prompt currently starts with decomposition, but does not explicitly require an ambiguity audit or a self-consistent design specification. The agent can therefore proceed with guessed proportions even when the input image or text contains unresolved feature counts, dimensions, or part relationships.

### Finding 2: Hierarchical intermediate representations preserve more geometry than flat prose

Graph-CAD, OBJ2CAD, and CADSmith all introduce a structured intermediate representation before code:

| System    | Intermediate representation                                                             | Why it helps                                                                   |
| --------- | --------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------ |
| Graph-CAD | Hierarchical geometry-aware graph with nodes as parts and edges as constraints          | Prevents long-horizon prompt-to-code drift                                     |
| OBJ2CAD   | Object hierarchy plus geometric-mathematical assembly constraints                       | Keeps LLM reasoning focused on design logic, not low-level operation sequences |
| CADSmith  | Structured design plan with components, sub-parts, bounding box, constraints, and notes | Gives coder and validator a shared target                                      |

The shared lesson is that component hierarchy, constraints, and assembly relationships should be made explicit before code. For Tau, this maps naturally to an internal "intent ledger": parts, key dimensions, axes, attachment relationships, symmetry, repetitions, holes/slots/fillets/chamfers, and appearances.

### Finding 3: Design intent is behavioral, not just visual

Autodesk's constraint-generation work defines design intent as the expected behavior of a CAD model when altered. Their alignment strategy uses a constraint solver as feedback and targets sketches that are fully constrained without being over-constrained, distorted, or unsolvable; aligned models fully constrained 93% of sketches compared with 34% for a naive supervised baseline and 8.9% without alignment.

This matters for Tau because parametric CAD output should preserve relationships, not just match a static render. If two bosses are concentric, if a rod remains coaxial with a barrel, or if bolts are evenly spaced on a flange, those relationships need to be represented as parameters and constraints in source code and tests.

### Finding 4: Visual references need feature extraction before modeling

CAD-Coder and CADCodeVerify show that visual inputs improve CAD generation when they are translated into editable CAD code or validation questions. CADCodeVerify asks a VLM to generate and answer 2-5 yes/no validation questions, then uses the answers as corrective feedback; it reports a 7.30% point-cloud-distance reduction and a 5.5% compile-rate improvement.

For Tau's prompt, optional image/reference input should not be treated as vibe or style guidance. The agent should extract observable geometry: silhouette, approximate axis, relative proportions, visible feature counts, repeated fasteners, bores, materials/colors, and occluded/uncertain regions. The prompt should also tell the model to label assumptions instead of silently turning uncertainty into geometry.

For small or dense features, a full-image pass should be followed by targeted region clipping rather than more generic prose. The companion image-region research recommends using crops as supplemental evidence tied back to the original image, especially for bores, fastener counts, labels, edge treatments, and one panel of a multi-angle screenshot.

### Finding 5: Numeric checks and screenshots catch different failures

CADSmith's ablations are especially relevant. Its validator combines exact OpenCASCADE measurements (bounding box, volume, face/edge/vertex counts, center of mass, solid validity) with rendered visual inspection. The full pipeline reduces mean Chamfer Distance from 28.37 to 0.74 and reaches 100% execution success. Removing rendered vision causes large degradation on complex tier-3 shapes; the paper notes kernel metrics alone can miss "false convergence" where volume and bounding box are plausible but structure is wrong.

Tau already has `test_model` and screenshots. The missing link is to make both verification paths compare against the same captured intent ledger. Tests should cover measurable requirements, while screenshot review should count visible features and check silhouette, proportions, materials, and assembly relationships.

### Finding 6: Iterative refinement should target specific discrepancies

CADReasoner treats CAD generation as a closed-loop program-editing task: render the current program, compare it to target evidence, encode geometric discrepancy through multi-view overlays and nearest-surface offsets, then edit the program. CADSmith similarly feeds exact numeric discrepancies and visual judge feedback into the refiner.

Tau's existing prompt asks the agent to iterate when defects are found, but it can still make vague retries. Better prompt language should force every iteration to name the specific missing or incorrect intent element before editing: e.g. "rear blue eye lacks through-bore", "flange has 8 bolts but reference shows 12", or "rod is off-axis relative to barrel."

### Finding 7: Dynamic assemblies require joints and degrees of freedom

AADvark argues that industrially relevant CAD agents must handle moving assemblies, not just static solids. It represents parts and joints explicitly, then uses an assembly constraint solver as a verifier. The key lesson for Tau's prompt is to preserve mechanical roles when the user describes pistons, hinges, scissors, linkages, or actuators. Even if Tau's current kernels output static geometry, the agent should model joint axes, coaxial relationships, clearances, and intended motion as explicit geometry and comments/tests where possible.

### Finding 8: Prompt changes should be compact and high-signal

Tau's context-engineering policy favors minimal high-signal tokens, single-source-of-truth separation, examples over repeated rules, and stable static sections. The system prompt should not restate tool mechanics. The right prompt altitude is a compact CAD-specific decision contract: capture intent, clarify only blocking uncertainty, implement from the ledger, and verify against the ledger.

## Recommendations

| #   | Action                                                                                                                                                             | Priority | Effort | Impact |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ | -------- | ------ | ------ |
| 1   | Add a static `<intent_capture>` section to `cad-agent.prompt.ts`                                                                                                   | P0       | Low    | High   |
| 2   | Update workflow step 0 from generic decomposition to intent-ledger capture                                                                                         | P0       | Low    | High   |
| 3   | Add prompt tests that assert the section preserves explicit dimensions, inferred assumptions, visual-reference features, and clarification rules                   | P0       | Low    | Medium |
| 4   | Instruct screenshot review to compare against captured intent, not just generic visual quality                                                                     | P1       | Low    | Medium |
| 5   | Future: introduce SysML v2 textual notation as the durable design-intent artifact so tests, implementation, and visual inspection share one standards-based target | P1       | Medium | High   |
| 6   | Future: add richer geometry metrics, including face/edge/vertex counts, center of mass, and volume when available                                                  | P2       | Medium | Medium |
| 7   | Future: add a provenance-preserving image region clipping tool for focused visual feature inspection                                                               | P1       | Medium | High   |
| 8   | Future: add assembly/joint verification for moving mechanisms                                                                                                      | P2       | High   | High   |

## Proposed Prompt Shape

The prompt should include a compact section with this contract:

```xml
<intent_capture>
Before modeling, build an internal design ledger from the user's text, images, files, and current project state.
- Preserve explicit dimensions, counts, coordinate axes, proportions, fit/clearance, and manufacturing constraints.
- Extract reference-image observations: silhouette, visible parts, bores, fasteners, symmetry, colors/materials, and uncertain/occluded areas.
- Represent assemblies as parts plus relationships: coaxial, concentric, mirrored, evenly spaced, tangent, flush, sliding, hinged, or fixed.
- Label inferred values as assumptions. Ask targeted clarification questions only when missing/conflicting information blocks a faithful model; otherwise choose conservative parametric defaults and keep them editable.
- Translate every important intent element into either source structure, a deterministic test requirement, or a screenshot-inspection target.
</intent_capture>
```

This is intentionally short: it changes the agent's decision process without duplicating tool descriptions or adding brittle modeling steps.

## References

- ProCAD: [Clarify Before You Draw: Proactive Agents for Robust Text-to-CAD Generation](https://arxiv.org/html/2602.03045v1)
- CADSmith: [Multi-Agent CAD Generation with Programmatic Geometric Validation](https://wiki.charleschen.ai/arxiv/raw/2603-26512v1-cadsmith-multi-agent-cad-generation-with-programmatic-geometric-val)
- CADReasoner: [Iterative Program Editing for CAD Reverse Engineering](https://arxiv.org/abs/2603.29847)
- AADvark: [Agent-Aided Design for Dynamic CAD Models](https://arxiv.org/html/2604.15184v2)
- Graph-CAD: [Learning Hierarchical and Geometry-Aware Graph Representations for Text-to-CAD](https://github.com/EESJGong/Graph-CAD)
- CADCodeVerify: [Generating CAD Code with Vision-Language Models for 3D Designs](https://proceedings.iclr.cc/paper_files/paper/2025/hash/81a934cd364e18ea6fdeaf57a93c17d4-Abstract-Conference.html)
- CAD-Coder: [An Open-Source Vision-Language Model for Computer-Aided Design Code Generation](https://arxiv.org/html/2505.14646v1)
- Text2CAD: [Generating Sequential CAD Models from Beginner-to-Expert Level Text Prompts](https://arxiv.org/html/2409.17106v1)
- Autodesk Research: [Aligning Constraint Generation with Design Intent in Parametric CAD](https://www.research.autodesk.com/app/uploads/2025/10/Aligning-Constraint-Generation-with-Design-Intent-in-Parametric-CAD.pdf)
- Zoo: [Zookeeper, the Conversational CAD Agent](https://zoo.dev/research/introducing-text-to-cad)
- Follow-up: `docs/research/sysml2-cad-intent-architecture.md`
- Follow-up: `docs/research/agent-image-region-clipping-tool.md`
