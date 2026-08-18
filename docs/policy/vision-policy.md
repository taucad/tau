---
title: 'Vision Policy'
description: "Tau's long-term vision for connecting hardware engineering through code, AI agents, and verification as the reward function."
status: active
created: '2026-03-04'
updated: '2026-08-17'
---

# Vision Policy

Internal reference for Tau's strategic direction. Tau's vision is to connect the five pillars of hardware engineering — systems design, analysis, CAD, software/firmware, and simulation — through code and AI agents. The connective tissue is **verification**: the trusted, machine-readable reward function that lets agents iterate generated designs into manufacturable ones. Generation is commoditizing; verification is the scarce resource, the moat, and the commercial core.

## Rationale

Hardware engineering is fragmented across disconnected tools. AI can automate execution within silos, but the silos remain. The medium that enables programmable, versionable, agent-accessible connection across disciplines is code. This policy articulates the phased path from geometry-first MCAD to end-to-end automated robotic systems.

## The Problem

Hardware engineering today is fragmented across disconnected tools: CAD packages, spreadsheets, firmware IDEs, simulation suites, and requirements trackers. Each tool is a silo. Each handoff loses fidelity. AI can automate 90% of the execution within each silo, but the silos themselves remain.

The problem isn't automating individual tasks — it's connecting them. A geometry change should propagate through stress analysis, firmware constraints, and simulation automatically. That connection must be programmable, versionable, and agent-accessible. The medium that enables all three is code.

## The Five Pillars

```
Systems/Requirements ──┐
Analysis (math)      ──┤
CAD (3D geometry)    ──┼── Code ── AI Agents ── Automated Hardware Development
Software/Firmware    ──┤
Simulation           ──┘
```

## Verification: the Reward Function

Across all five pillars, the bottleneck of agentic engineering is not generation — it is **trusted verification**. An agent that generates geometry, a circuit, or firmware without a way to check that the result is correct and manufacturable is a hallucination with a 3D viewer. Code agents have tests and CI; engineering agents need an equivalent oracle.

GeoSpec is that oracle — the reward function that scores every agent iteration against reality: is the geometry valid, does it match intent, can it be made, will it fit, will it survive, and can we prove it. It is the layer that turns a stochastic generator into a manufacturing pipeline, and it is the same verification substrate that extends from MCAD to every later pillar (physical requirements, electrical clearances, firmware-in-the-loop, full-system regression).

Verification is therefore a first-class pillar in its own right, not a feature of Phase 1. Whoever owns the trusted verification layer owns the loop — that is the strategic core of Tau, and the commercial boundary is drawn around it (see [The Commercial Boundary](#the-commercial-boundary)).

## Progression

### Phase 1: Geometry (MCAD) — Current

Solve code-first mechanical CAD. Tau today is an AI-native, multi-kernel CAD platform:

- **Multi-kernel runtime** (`@taucad/runtime`) — Replicad, JSCAD, Manifold, OpenRSCAD, KCL, any CAD kernel behind a unified `defineKernel()` API. BRep and mesh geometry, parametric models as TypeScript/OpenSCAD/KCL functions.
- **AI agent** — LangGraph agent with file editing, kernel execution, TDD via GeoSpec, screenshot verification. The agent writes geometry code, runs it, measures the result, iterates.
- **Converter** (`@taucad/converter`) — 41 input formats, 11 output formats. STEP, STL, glTF, USDZ, IFC, and more. Convert any file format to another.
- **Browser-native** — No install. Web Workers for computation, WebGL for rendering. Embeddable components for third-party apps.
- **Open source** — Published `@taucad/*` packages on npm. Apache-2.0 licensed (the GeoSpec engine is fair source, per `LICENSING.md`).
- **Files are the interface** — Everything is a file. Geometry, tests, metadata. Agent skills, subagents, scripts. A single data plane makes computational engineering precise, reproducible, with provenance by design. No lock-in on the _artifact_: designs, tests, and history stay portable and runnable outside Tau. What is monetized is high-assurance verification at scale — never access to your own files.

This phase proves the thesis: geometry defined as code can be created, modified, tested, and iterated on by AI agents with human oversight.

### Phase 2: Analysis & Simulation

Add engineering analysis:

- **FEA/CFD kernels** — FEAScript and future solvers. Stress, thermal, and fluid analysis on geometry produced by MCAD kernels.
- **Mathematical analysis** — Automated engineering calculations that feed requirements into geometry parameters.
- **Test-driven engineering** — Extend GeoSpec to physical requirements: max stress, thermal limits, weight budgets. AI agents iterate until specs are met.

### Phase 3: Systems Integration

Wire it all together:

- **Multi-agent orchestration** — Domain-specific AI agents (mechanical, electrical, firmware, simulation) coordinating through a systems agent that maintains cross-discipline constraints.
- **Requirements traceability** — From system requirements down to geometry parameters, pin assignments, and firmware constants — all in code, all version-controlled.
- **Automated iteration** — Change a requirement, and agents propagate the impact through every discipline, flagging conflicts and proposing solutions.

### Phase 4: Electrical (ECAD)

Extend the kernel architecture to circuit design:

- **ECAD kernels** — TSCircuit, Atopile. Schematics and PCB layout as code, running in the same multi-kernel runtime.
- **Electrical simulation kernels** — ngspice, CircuitJS. Validate circuits against specs without leaving the platform.
- **Cross-discipline linking** — Mechanical enclosures constrained by PCB dimensions. Mounting holes, connector cutouts, and thermal considerations flow between MCAD and ECAD models.

### Phase 5: Firmware

Bring embedded software into the same code-first workflow:

- **Firmware kernels** — Arduino, MicroPython. Write, compile, and simulate firmware alongside the hardware it runs on.
- **Firmware simulation** — QEMU, Wokwi. Virtual hardware-in-the-loop testing before physical prototyping.
- **Hardware-firmware co-design** — Pin assignments, peripheral constraints, and communication protocols linked between ECAD schematics and firmware code.

### Phase 6: Automated Robotic Systems

The endgame. When all five pillars are connected through code, the platform becomes a robotic systems factory:

- **End-to-end generation** — Describe a robot's purpose. Agents generate the mechanical design, PCB layout, firmware, and control software as a single coordinated codebase. Every artifact traces back to requirements.
- **Simulation-validated designs** — Full-system simulation (structural, electrical, firmware-in-the-loop) runs before any physical part is manufactured. Agents iterate until the simulated system meets spec.
- **Fleet management** — Robots in the field are parameterized variants of the same codebase. Update a requirement, re-run the pipeline, push firmware OTA, and queue revised parts for manufacturing. Fleet-wide changes propagate from code, not spreadsheets.
- **Continuous physical iteration** — Field telemetry feeds back into the system model. Agents identify failure modes, propose design changes, simulate fixes, and produce updated build artifacts — closing the loop between deployed hardware and the engineering workspace.

## The Commercial Boundary

Open-by-default and a defensible business are not in tension — provided the boundary is drawn in the right place. The substrate is open; the assurance is commercial.

| Open substrate (drives adoption)                              | Commercial assurance (the business)                              |
| ------------------------------------------------------------- | ---------------------------------------------------------------- |
| Kernel runtime, `defineKernel()` API, file formats            | Accelerated, hosted verification engine (GeoSpec Cloud)          |
| The `.geospec` test DSL, matcher names, diagnostics schema    | "CI for hardware" — PR-gating, concurrency, org dashboards       |
| Baseline local/WASM checks; published `@taucad/*` packages    | Signed evidence, traceability, retention, process DFM rule packs |
| The project artifacts themselves (portable, runnable offline) | The manufacturability dataset and the verification API/OEM layer |

Three positions follow from this boundary and must not drift:

- **The data flywheel is the durable moat.** Every verified run is a labeled `(design, spec, pass/fail, repair)` example — a dataset that does not exist publicly. We capture it **train-public, retrieve-private**: bootstrap models on public CAD corpora and Tau-generated synthetic labels, learn from opt-in free-tier runs, and never train on customers' proprietary designs. Engine speed commoditizes; the dataset compounds.
- **Build the oracle, rent the physics.** Tau builds and owns the geometric, manufacturability, and tolerance verification engine — the scarce, compounding layer. It does not build CFD/FEA/thermal solvers; it orchestrates them (Vanellus, Navier, OpenFOAM) behind a unified assertion contract and meters the orchestration. Surrogate/loop physics is a future option, kept open by the solver-provider seam — not a commodity-solver rebuild.
- **Independence is a feature.** A verdict from a neutral oracle is worth more than one from the tool that generated the part — you don't let the fox certify the henhouse. That independence is what lets third parties, including competitors, embed Tau's verification as the trusted standard, under a contractual no-train guarantee.

Open adoption funds the mission; the assurance layer and the dataset are what make it a business. The open substrate is never the moat.

## Design Principles

- **Code is the interface.** Every engineering artifact — geometry, circuits, firmware, test specs, requirements — is represented as code. Code is versionable, diffable, reviewable, and agent-accessible.
- **Everything is pluggable.** The `defineKernel()` pattern scales to any engineering domain. New solvers, languages, and tools plug into the same runtime, transport, and middleware stack.
- **Hosts are peers.** Any capability the browser offers an agent or user must be achievable headlessly through the same files and pathways — browser, CLI, and CI produce identical artifacts.
- **Verification is the reward function.** Generation is commoditizing; trusted verification is the scarce resource. GeoSpec is the oracle that closes the agentic loop and the connective layer across every pillar — a first-class concern, not a test harness bolted onto CAD.
- **Build the oracle, rent the physics.** Own the geometric/manufacturability/tolerance verification engine and the data it produces; orchestrate third-party physics solvers rather than rebuilding them.
- **AI agents are collaborators.** Agents don't replace engineers — they handle the thousands of micro-problems that make up a system design, while humans make the architectural decisions.
- **Open substrate, commercial assurance.** The substrate is open by default — runtime, kernels, file formats, the `.geospec` DSL, baseline checks, and published `@taucad/*` packages — because open adoption is the flywheel. The assurance layer is commercial — the accelerated verification engine, the manufacturability dataset, signed evidence, and hosted orchestration. Hardware tooling has been locked in proprietary silos for decades; we open the substrate and monetize the assurance, and never confuse the two.
