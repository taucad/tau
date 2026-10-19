---
viewer: minor
---

`@taucad/viewer` never refuses a section. Every cut commits as soon as it is made, so captures always receive it, and each source is capped as well as its surface allows:

- A source whose welded edge census balances, shown whole, keeps its exact stencil cap. The census replaces the half-edge topology certification: it runs in two stages, by index and then by position only around unbalanced edges, so the 1.05 M-triangle shade of a voxel lamp grades in about 0.4 s instead of 5 to 9 s. Slivers with three distinct indices are kept.
- Any other source (open, cracked, non-manifold, or shown in part) is capped per loop. A worker slices its shown triangles when a face moves, fans over the closed loops count into the stencil even-odd, and the usual striped cap and outline draw over them. Open chains are outlined in Tau's destructive red (`sectionCapOpenChainColor`, `#DD003F`) and left unfilled, with the source's back faces shown.
- A source whose census has not landed is cut and outlined, uncapped, until it does.

Breaking changes:

- `SectionStatus` is removed from `@taucad/viewer/cad/section-tool-row`, with its "Section unavailable for this model" text, and the "Section view unavailable" toast is gone.
- The graphics machine event `setSectionCertification` is replaced by `commitSectionCuts`, whose payload is the committed cut list, and `GraphicsContext.sectionCertification` is removed.
- `SectionContourFills` takes `onCommit(cuts)` instead of `onCertify`, and `SectionCertification` is removed.
- The `sectionCapCompleteness` debug record is always `complete` and reports `exactSourceCount`, `perLoopSourceCount`, `pendingSourceCount` and each source's grade and reason; `SectionCapStencilDiagnostics` gains `loops`, each per-loop source's closed-loop and open-chain counts, and `SectionStencilCapStats` gains `loopSourceCount` and `openChainDrawCount`.
- The span `renderer.section-cap-refused` is replaced by `renderer.section-cap-graded`.
