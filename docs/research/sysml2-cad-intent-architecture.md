---
title: 'SysML v2 CAD Intent Architecture'
description: 'Evaluation of SysML v2, STEP AP242, and OpenCASCADE for standards-based CAD intent, requirements, and geometry analysis in Tau.'
status: active
created: '2026-05-03'
updated: '2026-05-03'
category: architecture
related:
  - docs/policy/vision-policy.md
  - docs/research/agentic-cad-geometric-intent-preservation.md
---

# SysML v2 CAD Intent Architecture

This document investigates whether Tau can use SysML v2 and adjacent standards instead of inventing a custom design-spec file for CAD-agent geometric intent.

## Executive Summary

SysML v2 fits Tau's long-term vision well, but not as a full replacement for CAD geometry. The best standards split is: SysML v2 textual notation for system intent, requirements, part hierarchy, parameters, constraints, coordinate frames, allocations, verification cases, and traceability; STEP AP242 for exact CAD geometry, topology, assembly structure, PMI, validation properties, and long-term exchange; OpenCASCADE.js for executing geometry queries against STEP/AP242 and native kernel outputs.

The recommendation is to make `.sysml` a first-class Tau project artifact for non-trivial models, not to create a custom `.intent.json` or proprietary design-spec format. Tau should treat SysML v2 as the standards-based "design intent layer" and STEP AP242 as the standards-based "geometry evidence layer", with Tau kernel source files remaining the executable generation layer.

## Problem Statement

The companion research in `docs/research/agentic-cad-geometric-intent-preservation.md` recommends an internal design ledger so CAD agents preserve dimensions, part relationships, materials, visual-reference observations, and verification targets. The open question is whether that ledger should become a durable Tau-specific spec file, or whether an existing standard can own it.

The strategic constraint from `docs/policy/vision-policy.md` is that Tau should connect systems design, analysis, CAD, software/firmware, and simulation through code and AI agents. Inventing a proprietary CAD-intent standard would work against the open, platform-capability direction unless there is no applicable existing standard.

## Scope and Non-Goals

**In scope**:

- SysML v2 language, textual notation, standard libraries, API, and OSLC representation.
- STEP AP242 as a CAD/PMI/geometry evidence standard.
- OpenCASCADE.js/OCCT feasibility for geometry and STEP analysis.
- How these standards map onto Tau's current multi-kernel runtime and converter transcoder.

**Out of scope**:

- Implementing a SysML parser or API client.
- Defining a complete Tau SysML profile.
- Replacing Tau's CAD kernels or TypeScript/OpenSCAD/KCL geometry code.
- Claiming feature-tree recovery from STEP; STEP exchange commonly preserves final geometry, not native parametric history.

## Methodology

Research combined source review and web research:

| Evidence                            | Source                                                                                                                      |
| ----------------------------------- | --------------------------------------------------------------------------------------------------------------------------- |
| Tau strategic direction             | `docs/policy/vision-policy.md`                                                                                              |
| Prior CAD-agent intent research     | `docs/research/agentic-cad-geometric-intent-preservation.md`                                                                |
| Runtime STEP conversion route       | `packages/runtime/src/transcoders/converter/converter.transcoder.ts`                                                        |
| SysML v2 standard library source    | `repos/SysML-v2-Release/sysml.library/Domain Libraries/Geometry/*.sysml`                                                    |
| SysML v2 example models             | `repos/SysML-v2-Release/sysml/src/examples/Geometry Examples/VehicleGeometryAndCoordinateFrames.sysml` and Vehicle examples |
| OMG SysML v2 2.0 language/API specs | OMG formal September 2025 specifications and 2026-02 release notes                                                          |
| OSLC SysML v2                       | OASIS OSLC SysML v2 draft vocabulary/constraints                                                                            |
| STEP AP242                          | ISO 10303-242:2022, AP242 Ed4 project notes, prostep ivip/AP242 material                                                    |
| OCCT STEP analysis                  | OCCT documentation and issue discussions for STEP, XDE, validation properties, PMI/tolerance handling                       |
| SysML v2 geometry tooling           | Open-MBEE `sysmlv2_dls` geometry API and Onshape connector                                                                  |

## Findings

### Finding 1: SysML v2 is the right standard for intent, not a mesh or B-Rep format

OMG describes SysML v2 as a general-purpose systems modeling language for requirements, behavior, structure, analysis, and verification, with formal semantics from KerML and both textual and graphical notation. This aligns with Tau's "code is the interface" principle because SysML v2 textual notation is diffable, reviewable, and agent-writable.

SysML v2 should own:

| Intent category                 | SysML v2 fit       | Notes                                                                                               |
| ------------------------------- | ------------------ | --------------------------------------------------------------------------------------------------- |
| Requirements                    | Strong             | Native `requirement`, subjects, constraints, derivations, satisfy/allocate links                    |
| Part hierarchy                  | Strong             | Native `part def`, `part`, multiplicities, subsets, redefines                                       |
| Parameters and units            | Strong             | ISQ/SI quantities and unit expressions such as `220 [mm]`                                           |
| Interfaces and flows            | Strong             | Ports, interfaces, item flows, allocations                                                          |
| Verification and analysis cases | Strong             | Native verification/analysis concepts support Tau's test-driven engineering direction               |
| Coordinate frames and placement | Moderate to strong | Geometry domain library has `SpatialItem`, coordinate frames, transformations                       |
| Primitive shape intent          | Moderate           | ShapeItems include boxes, cylinders, cones, spheres, torus-like items, polygons                     |
| Exact CAD topology              | Weak               | SysML shapes are semantic/structural descriptions, not OCCT B-Rep entities                          |
| Native CAD feature history      | Weak               | SysML can describe intent, but does not replace kernel-specific parametric code                     |
| Manufacturing PMI/GD&T exchange | Limited            | SysML can reference requirements; STEP AP242 is the correct standard for semantic PMI tied to faces |

Conclusion: SysML v2 can replace a custom "design ledger" file for non-trivial design intent, but it should not replace Tau geometry source files or STEP artifacts.

### Finding 2: SysML v2 geometry libraries go farther than expected, but stop before exact CAD

The SysML v2 standard library includes a Geometry domain library. Source review found:

- `SpatialItems.sysml` defines `SpatialItem` as an item with three-dimensional spatial extent, a coordinate frame, an origin point, sub-spatial items, component items, and position/displacement calculations.
- `ShapeItems.sysml` defines primitive shape concepts such as `Circle`, `CircularDisc`, `Sphere`, `Torus`, `CircularCylinder`, `RightCircularCylinder`, `Box`, pyramids, wedges, and polyhedra.
- `VehicleGeometryAndCoordinateFrames.sysml` demonstrates a vehicle model using `ShapeItems::*`, `SpatialItems::*`, `Box`, `Cylinder`, coordinate-frame transforms, wheel placement, and lug-bolt distribution constraints.

Example pattern from the SysML v2 release model:

```sysml
part def Chassis :> SpatialItem {
    item :>> shape = new Box(4800 [mm], 1840 [mm], 1350 [mm]);
}

part def Wheel :> SpatialItem {
    item :>> shape : Cylinder {
        :>> radius = 22/2*25.4 + 110 [mm];
        :>> height = 220 [mm];
    }
}
```

This is directly applicable to Tau's CAD-agent intent layer. It can express that a hydraulic cylinder has a barrel, rod, two clevis eyes, coaxial bores, flange bolts, and named coordinate frames. It cannot express the full OCCT topology of filleted faces, boolean construction sequence, robust kernel operations, or exact STEP PMI associations by itself.

### Finding 3: SysML v2 textual notation is a better "spec file" than custom JSON for Tau

SysML v2 textual notation is machine-processable and version-control friendly. The 2026-02 SysML v2 release includes formal SysML 2.0 and KerML 1.0 specification documents, standard library models, textual notation packages, XMI exports, and BNF. The Systems Modeling API and Services specification defines REST/HTTP APIs and JSON schemas for model access, persistence, querying, validation, and tool interoperability.

Compared with a custom Tau design-spec JSON:

| Criterion                   | Custom Tau JSON                            | SysML v2 textual notation      |
| --------------------------- | ------------------------------------------ | ------------------------------ |
| Standards alignment         | Poor                                       | Strong OMG standard            |
| Agent writability           | Strong                                     | Strong                         |
| Human readability           | Moderate                                   | Moderate to strong             |
| Units/quantities            | Need to invent or depend on another schema | Built-in ISQ/SI libraries      |
| Requirements traceability   | Need to invent                             | Native                         |
| Systems/CAD/analysis bridge | Need to invent                             | Native MBSE purpose            |
| Tool ecosystem              | Tau-only                                   | Growing OMG/API/OSLC ecosystem |
| Exact geometry              | Still insufficient                         | Still insufficient             |

Recommendation: Tau should create and edit `.sysml` files for design intent instead of inventing `.intent.json`. Any Tau-specific metadata should be a SysML package/annotation or OSLC link namespace, not a standalone standard.

### Finding 4: STEP AP242 is the correct standard for geometry evidence and CAD exchange

ISO 10303-242:2022 (STEP AP242) is the managed model-based 3D engineering application protocol. Its scope includes 2D/3D wireframe, surface, boundary representation, compound shape, constructive solid geometry, parametric and constrained geometry, sketches, tessellated geometry, scan data, PMI/GD&T, product structure, validation properties, kinematics, and related PLM/PDM concerns.

AP242 is the correct layer for:

- B-Rep geometry, topology, and assemblies.
- Colors, layers, names, and shape-associated metadata.
- Semantic PMI/GD&T tied to geometry where supported.
- Geometric validation properties such as area, volume, and centroid.
- Long-term neutral CAD exchange and comparison.
- Supplier/interoperability handoff.

This complements SysML v2. SysML v2 can say "this barrel outside diameter shall be 48 mm and the rod axis shall be coaxial with the barrel"; STEP AP242 can carry the actual faces/edges/solids and validation properties used to verify whether the generated model satisfies that requirement.

### Finding 5: Tau's current converter path can emit STEP syntax from GLB, but it is a mesh-fidelity route

`packages/runtime/src/transcoders/converter/converter.transcoder.ts` declares `glb -> step` with `fidelity: 'mesh'`. This is useful for a universal "any kernel can produce a STEP file" escape hatch, but it should not be treated as equivalent to native AP242 B-Rep export.

Recommended interpretation:

| Export route                                            | Use for                                                                             | Avoid relying on it for                                         |
| ------------------------------------------------------- | ----------------------------------------------------------------------------------- | --------------------------------------------------------------- |
| Native kernel STEP export from OpenCASCADE/Replicad/Zoo | B-Rep/topology analysis, AP242-like CAD exchange, shape names/materials where wired | Cross-kernel universal fallback                                 |
| GLB -> STEP via converter transcoder                    | Universal artifact syntax, mesh-based handoff, coarse geometry comparison           | Exact topology, feature semantics, PMI, face-level requirements |
| GLB direct analysis                                     | Visual/mesh metrics, bounding boxes, connected components                           | Parametric design intent or semantic PMI                        |

For SysML-driven verification, Tau should prefer native STEP export when available. The converter route remains useful as a lowest common denominator, but the research doc should not overstate it as a canonical AP242 geometry source.

### Finding 6: OpenCASCADE.js should be the geometry-query execution engine

OCCT's XDE STEP translator reads shape geometry, assemblies, colors, layers, names, validation properties, and other metadata into XDE documents. OCCT provides packages for B-Rep/topology traversal, bounding boxes, mass properties, shape validity, meshing, and STEP validation properties. OpenCASCADE.js gives Tau a browser-compatible path to many of these operations.

High-value query capabilities for Tau:

| Query                     | OCCT/STEP basis                                          | SysML use                                    |
| ------------------------- | -------------------------------------------------------- | -------------------------------------------- |
| Bounding box              | `Bnd_Box`/shape traversal                                | Verify size requirements                     |
| Volume / surface area     | `BRepGProp`/validation properties                        | Verify mass/volume/area requirements         |
| Center of mass / centroid | `GProp`/validation properties                            | Verify balance/placement                     |
| Topology counts           | OCCT topology traversal                                  | Compare part complexity and feature presence |
| Watertight/valid solid    | B-Rep check tools                                        | Gate manufacturing/simulation readiness      |
| Assembly transforms       | XDE shape tool and labels                                | Verify SysML `SpatialItem` transforms        |
| Colors/materials/names    | XDE document attributes                                  | Verify visual/material intent                |
| PMI/GD&T                  | XCAF dimension/tolerance tools where bindings support it | Future requirement-to-face validation        |

Known caveat: OCCT STEP validation-property and PMI support is imperfect across all AP242 files. OCCT issue discussions show some AP242 tolerance magnitudes and older validation-property naming conventions have caused read failures. This argues for incremental adoption with test fixtures, not for abandoning AP242.

### Finding 7: OSLC and Systems Modeling API matter for platform capability

SysML v2 is not just a text syntax. The OMG Systems Modeling API and Services specification defines APIs and JSON schemas for model access and tool interoperability. OSLC SysML v2 defines RESTful resource interfaces and RDF vocabularies/constraints so SysML resources can link to requirements, tests, change requests, and architecture-management resources.

For Tau's platform direction, this means `.sysml` files are only the local representation. A future platform-capability implementation can also:

- Import/export through a SysML v2 repository API.
- Link Tau geometry files, STEP artifacts, tests, and screenshots as resources.
- Preserve traceability through OSLC-style URIs.
- Let external MBSE/PLM tools inspect the same intent model instead of consuming Tau-only JSON.

### Finding 8: Open-MBEE `sysmlv2_dls` is relevant, but not the full answer

Open-MBEE's `sysmlv2_dls` provides a public SysML-based geometry specification and tooling. Its current focus is a CAD-agnostic assembly representation with translation, rotation, and ownership relationships, plus an Onshape connector. This is highly relevant prior art for Tau because it proves the "SysML as geometry integration layer" direction is already being explored.

However, `sysmlv2_dls` appears focused on assembly transforms and connector plumbing, not full exact B-Rep/PMI semantics. Tau should study and potentially align with it, but still use STEP AP242 and OCCT for geometry evidence.

### Finding 9: SysML v2 is aligned with Tau's five-pillar vision

The vision policy says Tau should connect systems/requirements, analysis, CAD, software/firmware, and simulation through code and agents. SysML v2 is designed exactly for this middle layer:

| Tau pillar           | SysML v2 role                                             | Companion standard/tool           |
| -------------------- | --------------------------------------------------------- | --------------------------------- |
| Systems/Requirements | Requirements, constraints, allocation, verification cases | OSLC, SysML API                   |
| Analysis             | Analysis cases, parametric constraints, quantities        | AP243/MoSSEC, future solvers      |
| CAD                  | Part hierarchy, coordinate frames, primitive shape intent | STEP AP242, OpenCASCADE.js        |
| Software/Firmware    | Interfaces, flows, behavior/state                         | Future firmware kernels           |
| Simulation           | Requirements, cases, inputs/outputs, traceability         | AP209/AP243, FMI where applicable |

This makes SysML v2 a better long-term platform primitive than a narrow CAD-only spec.

## Recommended Architecture

### Layered Standards Split

```text
User prompt / images / project context
              |
              v
SysML v2 textual model (.sysml)
- requirements
- part hierarchy
- parameters and units
- coordinate frames and assembly constraints
- verification cases and allocations
              |
              v
Tau kernel source files (.ts / .scad / .kcl / ...)
- executable parametric geometry
- kernel-specific operations
- native export options
              |
              v
STEP AP242 / GLB artifacts
- B-Rep or mesh geometry evidence
- assembly structure
- colors/materials/names
- PMI and validation properties where supported
              |
              v
OpenCASCADE.js analysis
- bbox, volume, area, centroid
- topology, validity, assembly transforms
- comparisons against SysML requirements
              |
              v
Tau test/report surfaces
- test.json or future SysML-derived verification cases
- screenshots and visual inspection
- traceability back to SysML requirements
```

### Proposed File Roles

| File                               | Standard                          | Owner                       | Purpose                                                                   |
| ---------------------------------- | --------------------------------- | --------------------------- | ------------------------------------------------------------------------- |
| `system.sysml` or `design.sysml`   | OMG SysML v2 textual notation     | Systems/design intent agent | Requirements, part hierarchy, parameters, constraints, verification cases |
| `main.ts`, `main.scad`, `main.kcl` | Kernel language                   | CAD agent                   | Executable geometry generation                                            |
| `test.json`                        | Current Tau test format           | CAD/testing agent           | Transitional deterministic geometry tests                                 |
| `exports/*.step`                   | STEP AP242 where possible         | Runtime/export pipeline     | Geometry evidence and CAD exchange                                        |
| `reports/*.json`                   | Tau report, later OSLC/API-backed | Analysis agent              | Query results, traceability, pass/fail evidence                           |

Longer term, `test.json` can become a generated compatibility artifact from SysML verification cases instead of the primary source of truth.

### Minimal SysML v2 Modeling Pattern

Tau should begin with a small, standard-library-based modeling pattern rather than a custom schema:

```sysml
package HydraulicCylinderIntent {
    private import SI::*;
    private import ISQ::*;
    private import ShapeItems::*;
    private import SpatialItems::*;

    part def HydraulicCylinder :> SpatialItem {
        attribute overallLength : LengthValue = 300 [mm];
        attribute barrelLength : LengthValue = 128 [mm];
        attribute barrelRadius : LengthValue = 24 [mm];
        attribute rodRadius : LengthValue = 13 [mm];
        attribute boltCount = 12;

        part barrel : SpatialItem {
            item :>> shape : RightCircularCylinder {
                :>> radius = barrelRadius;
                :>> height = barrelLength;
            }
        }

        part rod : SpatialItem {
            item :>> shape : RightCircularCylinder {
                :>> radius = rodRadius;
                :>> height = 88 [mm];
            }
        }

        assert constraint { boltCount == 12 }
    }

    requirement overallEnvelope {
        subject cylinder : HydraulicCylinder;
        require constraint { cylinder.overallLength <= 305 [mm] }
    }
}
```

This is not enough to generate final manufacturable geometry alone, but it captures the design intent in a standard language. Tau's CAD source then refines that intent into exact kernel operations.

## How Far SysML v2 Can Go for 3D Object Description

| Capability                        | How far SysML v2 can go              | Recommended Tau handling                                                                  |
| --------------------------------- | ------------------------------------ | ----------------------------------------------------------------------------------------- |
| Named product breakdown           | Very far                             | Use `part def`, `part`, multiplicities, subsets/redefines                                 |
| Dimensions and parameters         | Very far                             | Use ISQ/SI quantity values; mirror into kernel params                                     |
| Requirements                      | Very far                             | Use SysML requirements and constraints as source of truth                                 |
| Assembly relationships            | Far                                  | Use interfaces, connections, `SpatialItem`, coordinate frames, transforms; verify in OCCT |
| Repeated features                 | Moderate to far                      | Model multiplicities and constraints; CAD code generates pattern geometry                 |
| Primitive shapes                  | Moderate                             | Use ShapeItems for intent, not final B-Rep                                                |
| Complex surfaces/fillets/booleans | Limited                              | Keep in kernel source and STEP evidence                                                   |
| Exact face/edge identity          | Limited                              | Use STEP/XDE labels and future PMI/face links                                             |
| Materials/appearance              | Moderate                             | SysML attributes plus STEP/XDE material/color; verify through exports                     |
| PMI/GD&T                          | Limited to requirements-level intent | Use STEP AP242 for semantic PMI attached to geometry                                      |
| Motion/joints/kinematics          | Moderate                             | SysML behavior/constraints plus AP242 kinematics/future assembly solver                   |
| Feature history                   | Limited                              | Preserve in Tau source code, not STEP or SysML primitives                                 |
| Cross-domain traceability         | Very far                             | Use SysML v2 API/OSLC links                                                               |

## Recommendations

| #   | Action                                                                                                                                                                 | Priority | Effort | Impact |
| --- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------- | ------ | ------ |
| R1  | Adopt SysML v2 textual notation as Tau's durable design-intent/spec artifact for non-trivial CAD work                                                                  | P0       | Medium | High   |
| R2  | Treat STEP AP242, not SysML, as the canonical neutral geometry evidence format                                                                                         | P0       | Low    | High   |
| R3  | Prefer native kernel STEP export for OCCT-based geometry queries; use GLB-to-STEP mesh export only as fallback                                                         | P0       | Low    | High   |
| R4  | Build a SysML-to-Tau verification bridge that derives current `test.json` checks from SysML requirements/constraints                                                   | P1       | Medium | High   |
| R5  | Add an OpenCASCADE.js analysis service that imports STEP and reports bbox, volume, area, centroid, validity, topology, names/colors/materials, and assembly transforms | P1       | Medium | High   |
| R6  | Keep Tau-specific linkage as SysML metadata/OSLC resource references, not a custom standard                                                                            | P1       | Medium | Medium |
| R7  | Track Open-MBEE `sysmlv2_dls` and SysML v2 2.1 RTF geometry-library fixes before designing any geometry package extensions                                             | P2       | Low    | Medium |
| R8  | Use AP242 validation-property and PMI test fixtures to measure what OpenCASCADE.js can reliably extract before promising face-level requirements                       | P2       | Medium | Medium |

## Implementation Roadmap

### Phase 1: SysML as Optional Intent Source

- Add docs/examples for `design.sysml` alongside `main.ts`.
- Teach the CAD-agent prompt to produce or update `.sysml` for complex assemblies before code.
- Keep `test.json` as the executable test surface, but cite SysML requirement IDs in requirement descriptions.
- Export native STEP from kernels that support it and use current GLB analysis where native STEP is unavailable.

### Phase 2: SysML-Derived Tests and OCCT Analysis

- Parse a constrained subset of SysML v2 textual notation or integrate an existing SysML v2 parser/API implementation.
- Derive bounding-box, count, material, and relationship tests from SysML requirements.
- Add OpenCASCADE.js analysis for native STEP artifacts.
- Store analysis reports with traceability back to SysML requirement IDs.

### Phase 3: Platform Integration

- Add SysML v2 API/OSLC import/export for external MBSE/PLM tools.
- Use AP242 validation properties and PMI where available.
- Link geometry, analysis, simulation, ECAD, and firmware artifacts through SysML allocations and OSLC-style URIs.

## Risks and Open Questions

| Risk                             | Analysis                                                      | Mitigation                                                                                              |
| -------------------------------- | ------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------- |
| SysML v2 parser/tooling maturity | SysML v2 is formal as of 2025, but ecosystems are still early | Start with textual examples and optional import/export; avoid blocking core CAD on full parser maturity |
| Geometry library limitations     | ShapeItems are useful but not a full CAD kernel               | Keep exact geometry in Tau source and STEP/AP242                                                        |
| AP242 implementation variance    | OCCT and other tools vary in PMI/validation-property support  | Build fixture suite from NIST/CAX-IF/AP242 examples                                                     |
| GLB-to-STEP overstatement        | Tau's converter route is mesh-fidelity                        | Document and encode route fidelity in UX/agent guidance                                                 |
| Custom Tau metadata creep        | Linkage needs may tempt proprietary schemas                   | Use SysML metadata annotations and OSLC resource links                                                  |

## Verdict

Tau should not invent a custom CAD-intent spec. SysML v2 is the most applicable existing standard for the design-intent layer because it covers requirements, structure, constraints, quantities, coordinate frames, verification, and cross-domain traceability in a textual, agent-writable form. STEP AP242 is the complementary standard for CAD geometry evidence. OpenCASCADE.js is the execution bridge that can query and validate AP242/native STEP artifacts against SysML requirements.

The pragmatic architecture is therefore not "SysML instead of CAD", but "SysML plus executable Tau CAD plus AP242 evidence". This preserves standards alignment while keeping Tau's code-first, multi-kernel geometry strengths.

## References

- Related: `docs/research/agentic-cad-geometric-intent-preservation.md`
- Policy: `docs/policy/vision-policy.md`
- OMG SysML v2: [SysML v2.0 Language Specification](https://www.omg.org/spec/SysML/2.0/Language/PDF)
- OMG SysML release: [Systems-Modeling/SysML-v2-Release](https://github.com/Systems-Modeling/SysML-v2-Release)
- OMG Systems Modeling API: [Systems Modeling API and Services](https://www.omg.org/spec/SystemsModelingAPI/1.0/Beta2)
- OSLC SysML v2: [OSLC Systems Modeling Language v2.0](https://open-services.net/spec/sysml/latest-draft)
- STEP AP242: [ISO 10303-242:2022](https://committee.iso.org/standard/84667.html)
- prostep ivip: [ISO 10303-242 STEP AP242 fact sheet](https://www.prostep.org/en/medialibrary/fact-sheets/iso-10303-242-step-ap242)
- AP242 Ed4: [AP242 Edition 4 project](https://www.ap242.org/edition-4.html)
- OCCT STEP documentation: [STEP processor](https://dev.opencascade.org/doc/occt-6.7.0/overview/html/user_guides__step.html)
- OCCT validation properties: [STEPConstruct_ValidationProps](https://dev.opencascade.org/doc/refman/html/class_s_t_e_p_construct___validation_props.html)
- Open-MBEE: [sysmlv2_dls](https://github.com/Open-MBEE/sysmlv2_dls)
