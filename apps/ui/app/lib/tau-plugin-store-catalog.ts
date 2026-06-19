export type TauStoreSkill = {
  readonly slug: string;
  readonly name: string;
  readonly description: string;
  readonly version: string;
  readonly whenToUse: string;
  readonly skillMarkdown: string;
};

export const tauStoreSkills: readonly TauStoreSkill[] = [
  {
    slug: 'sheet-metal-manufacturing',
    name: 'Sheet Metal Manufacturing',
    description: 'Bend relief, K-factor, gauges, and manufacturable flat patterns',
    version: '1.0.0',
    whenToUse:
      'Use when designing sheet-metal parts, enclosures, brackets, tabs, bends, cutouts, reliefs, or flat patterns.',
    skillMarkdown: `---
name: sheet-metal-manufacturing
description: Bend relief, K-factor, gauges, and manufacturable flat patterns
source: tau-store
version: 1.0.0
when_to_use: Use when designing sheet-metal parts, enclosures, brackets, tabs, bends, cutouts, reliefs, or flat patterns.
enabled: true
---

# Sheet Metal Manufacturing

Use this skill to translate CAD intent into manufacturable sheet-metal geometry.

Check bend radius, material thickness, K-factor assumptions, relief geometry, flange length, hole-to-bend spacing, and whether the model can plausibly unfold into a flat pattern. Prefer standard gauges and call out any missing manufacturing assumptions before producing detailed geometry.
`,
  },
  {
    slug: 'woodworking',
    name: 'Woodworking',
    description: 'Joinery, grain direction, tolerances, and cut-list reasoning',
    version: '1.0.0',
    whenToUse:
      'Use when designing wood parts, furniture, fixtures, joinery, panels, shelves, cabinets, jigs, or cut lists.',
    skillMarkdown: `---
name: woodworking
description: Joinery, grain direction, tolerances, and cut-list reasoning
source: tau-store
version: 1.0.0
when_to_use: Use when designing wood parts, furniture, fixtures, joinery, panels, shelves, cabinets, jigs, or cut lists.
enabled: true
---

# Woodworking

Use this skill when geometry must respect how wood is milled, joined, and assembled.

Account for grain direction, seasonal movement, edge banding, panel goods, joinery choice, glue-up order, screw access, finishing clearance, and realistic tool paths. When dimensions are ambiguous, choose stock-friendly sizes and identify assumptions in the answer.
`,
  },
  {
    slug: 'design-for-3d-printing',
    name: 'Design for 3D Printing',
    description: 'Wall thickness, support strategy, orientation, and fit checks',
    version: '1.0.0',
    whenToUse:
      'Use when creating FDM, SLA, SLS, or general additive-manufacturing parts, fixtures, brackets, enclosures, and prototypes.',
    skillMarkdown: `---
name: design-for-3d-printing
description: Wall thickness, support strategy, orientation, and fit checks
source: tau-store
version: 1.0.0
when_to_use: Use when creating FDM, SLA, SLS, or general additive-manufacturing parts, fixtures, brackets, enclosures, and prototypes.
enabled: true
---

# Design for 3D Printing

Use this skill to make additive-manufacturing geometry robust.

Check wall thickness, bridge spans, overhang angles, support access, orientation, elephant-foot compensation, mating clearances, insert pockets, drainage holes for resin prints, and whether the part can be inspected after printing.
`,
  },
  {
    slug: 'fastener-selection',
    name: 'Fastener Selection',
    description: 'Hardware families, clearances, countersinks, and assembly notes',
    version: '1.0.0',
    whenToUse:
      'Use when a CAD task involves screws, bolts, threaded inserts, clearance holes, countersinks, or assembly fastening.',
    skillMarkdown: `---
name: fastener-selection
description: Hardware families, clearances, countersinks, and assembly notes
source: tau-store
version: 1.0.0
when_to_use: Use when a CAD task involves screws, bolts, threaded inserts, clearance holes, countersinks, or assembly fastening.
enabled: true
---

# Fastener Selection

Use this skill to make fastening details explicit and buildable.

Choose hardware families before modeling dependent geometry. Account for clearance diameter, pilot holes, tap drill sizes, countersink/counterbore geometry, wrench access, edge distance, thread engagement, material strength, and assembly/disassembly order.
`,
  },
];
