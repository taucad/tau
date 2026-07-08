/**
 * Deferral and verification-class registries — transcription of the
 * Section 6 verification cross-matrix and Section 1.3 verification classes
 * from docs/research/v8-engine-rev2-sysml2-specification.md.
 *
 * Frontier-gated requirements are DOCUMENTED DEFERRALS, never fake-passing
 * geometry tests: each entry names its REQ id, frontier, gate, suite file,
 * and the quantified criterion held in reserve. A frontier landing converts
 * its entries to red tests in the same change (Section 1.3 deferral policy).
 */

export type GeoSpecFrontier =
  | 'void-continuity'
  | 'contact-area'
  | 'thread-semantics'
  | 'region-wall'
  | 'draft-measure'
  | 'gdt'
  | 'kinematic-sweep'
  | 'mass-balance'
  | 'standard-feature'
  | 'tolerance-chain'
  | 'assembly-path'
  | 'misassembly-exclusion'
  | 'surface-callout'
  | 'occurrence-congruence';

export type FrontierGate = 'rev2.1' | 'rev2.1+' | 'rev2.2';

export type SuiteFile =
  | 'census'
  | 'flow-paths'
  | 'split-lines-fasteners'
  | 'sealing'
  | 'valvetrain-drive'
  | 'pin-retention'
  | 'fits'
  | 'dfm-structure'
  | 'deferred-frontiers';

export type FrontierDeferral = {
  requirementId: string;
  frontier: GeoSpecFrontier;
  gate: FrontierGate;
  suite: SuiteFile;
  /** Quantified criterion held in reserve, verbatim numbers from the spec. */
  criterion: string;
};

export const frontierDeferrals: readonly FrontierDeferral[] = [
  {
    requirementId: 'REQ-V8R2-007',
    frontier: 'region-wall',
    gate: 'rev2.1',
    suite: 'flow-paths',
    criterion:
      'Cylinder wall between bore and jacket 4.5-7.0 over ring travel band (deck-8 to deck-140); wall to valley >= 5.0 everywhere.',
  },
  {
    requirementId: 'REQ-V8R2-017',
    frontier: 'region-wall',
    gate: 'rev2.1',
    suite: 'flow-paths',
    criterion:
      'Plenum wall 4.0 +/-1.0; runner wall >= 3.0 (nominal 3.5); header tube wall >= 1.2 (nominal 1.6) — per region.',
  },
  {
    requirementId: 'REQ-V8R2-034',
    frontier: 'thread-semantics',
    gate: 'rev2.1',
    suite: 'split-lines-fasteners',
    criterion:
      'Every threaded joint binds a T-THREADS row (callout, class, engagement, tapped depth) as hole-feature metadata; engagement >= 1.5d iron/steel, >= 2.0d aluminum; no helical geometry except where sealing is proven.',
  },
  {
    requirementId: 'REQ-V8R2-053',
    frontier: 'thread-semantics',
    gate: 'rev2.1',
    suite: 'valvetrain-drive',
    criterion:
      'Tooth-mesh semantics: backlash 0.08-0.20 at the pitch point (T-FITS-RUN F28) with extruded involute profiles in mesh — mesh-semantics analogue of the thread frontier.',
  },
  {
    requirementId: 'REQ-V8R2-078',
    frontier: 'draft-measure',
    gate: 'rev2.1',
    suite: 'dfm-structure',
    criterion:
      'All mold-normal cast walls (block, heads, manifold, covers, rear housing) drafted >= 1.0 deg (target 1.5) from declared parting planes; pan draw walls >= 3 deg equivalent.',
  },
  {
    requirementId: 'REQ-V8R2-079',
    frontier: 'region-wall',
    gate: 'rev2.1',
    suite: 'dfm-structure',
    criterion:
      'Cast sections within 4.0-8.0 walls + ribs (no >100 mm solid slabs, no <4.0 webs except declared machined lands); per-region uniformity on block, heads, manifold, covers.',
  },
  {
    requirementId: 'REQ-V8R2-086',
    frontier: 'draft-measure',
    gate: 'rev2.1',
    suite: 'dfm-structure',
    criterion:
      'Crank and rod forged envelopes carry >= 3.0 deg side draft and a declared flash plane.',
  },
  {
    requirementId: 'REQ-V8R2-098',
    frontier: 'region-wall',
    gate: 'rev2.1',
    suite: 'dfm-structure',
    criterion:
      'Piston crown 7.0 +/-1.0 thick over the cored underside; boss webs present; slipper skirt (2x 95 deg thrust arcs).',
  },
  {
    requirementId: 'REQ-V8R2-095',
    frontier: 'mass-balance',
    gate: 'rev2.1+',
    suite: 'deferred-frontiers',
    criterion:
      'Rod assembly 615 g +/-3% (big end 415 / small end 200 split for bobweight).',
  },
  {
    requirementId: 'REQ-V8R2-096',
    frontier: 'mass-balance',
    gate: 'rev2.1+',
    suite: 'deferred-frontiers',
    criterion:
      'Bobweight 1675 g per throw = rotating 918 + 50% recip 757; 6 counterweight sectors (R92 x 22 x 130 deg) close crank static + couple balance within 1%.',
  },
  {
    requirementId: 'REQ-V8R2-097',
    frontier: 'mass-balance',
    gate: 'rev2.1+',
    suite: 'deferred-frontiers',
    criterion:
      'Flywheel >= 60% mass outside R90 (rim-biased section); damper = hub + elastomer + inertia ring stack with ring inertia dominant.',
  },
  {
    requirementId: 'REQ-V8R2-112',
    frontier: 'gdt',
    gate: 'rev2.1+',
    suite: 'deferred-frontiers',
    criterion:
      'Main tunnel cylindricity 0.010; deck flatness 0.05/100 and parallelism 0.10 to A; head-bolt pattern true position Ø0.25 |A|B|C|; journal-set runout 0.05; dowel true position Ø0.10; PMI at STEP export.',
  },
  {
    requirementId: 'REQ-V8R2-113',
    frontier: 'kinematic-sweep',
    gate: 'rev2.1+',
    suite: 'deferred-frontiers',
    criterion:
      'Through 720 deg: valve-to-piston >= 1.5 axial / 1.2 radial at overlap; rod-to-block/cam/pan >= 3.0; counterweight-to-skirt >= 2.5; lobe-follower tangency continuous; all-valve seat closure at closed phases.',
  },
  {
    requirementId: 'REQ-V8R2-114',
    frontier: 'mass-balance',
    gate: 'rev2.1+',
    suite: 'deferred-frontiers',
    criterion:
      'Per-occurrence mass table +/-3% (piston 415 g, pin 96, ring set 42, clips 4, rod 615, shells 44/pair); crank balance per REQ-096; flywheel/damper inertia split; engine CG within declared box.',
  },
  {
    requirementId: 'REQ-V8R2-115',
    frontier: 'thread-semantics',
    gate: 'rev2.1',
    suite: 'deferred-frontiers',
    criterion:
      'Every T-THREADS row verified for callout binding + filled engagement (>= 1.5d iron/steel, 2.0d aluminum) + class compatibility; plug and drain sealing threads verified with crush washer stacks.',
  },
  {
    requirementId: 'REQ-V8R2-116',
    frontier: 'standard-feature',
    gate: 'rev2.2',
    suite: 'deferred-frontiers',
    criterion:
      'Every standard-governed feature matches its cited table: circlip grooves Ø23.6 x 1.30 per DIN 472 (Ø22 pin bore family), snout keyway per DIN 6885, O-ring glands 15-30% static squeeze per ISO 3601, fastener set only from the coarse series M6/M8/M10/M12/M16.',
  },
  {
    requirementId: 'REQ-V8R2-117',
    frontier: 'tolerance-chain',
    gate: 'rev2.2',
    suite: 'deferred-frontiers',
    criterion:
      'Declared dimension chains accumulate within band under T-FITS tolerances: crank endplay 0.05-0.20 (thrust chain 28.08 vs 27.95), pin axial float 0.2-1.0, gasket compressed stack 1.10-1.20 per bank; accumulation method (worst-case or RSS) recorded per chain.',
  },
  {
    requirementId: 'REQ-V8R2-118',
    frontier: 'assembly-path',
    gate: 'rev2.2',
    suite: 'deferred-frontiers',
    criterion:
      'Collision-free straight-line insertion sweep along every occurrence declared approach axis with swept clearance >= 0.5; generalizes REQ-087/088 so the 28 authored tool-probe solids in service-access.ts retire in favor of swept-tool evidence.',
  },
  {
    requirementId: 'REQ-V8R2-119',
    frontier: 'misassembly-exclusion',
    gate: 'rev2.2',
    suite: 'deferred-frontiers',
    criterion:
      'Under declared wrong poses (head gasket flipped about its long axis, main/rod caps reversed 180 deg, timing gears swapped): hole-pattern misalignment >= 2.0 or solid interference >= 100 mm3 — wrong installation geometrically impossible.',
  },
  {
    requirementId: 'REQ-V8R2-120',
    frontier: 'surface-callout',
    gate: 'rev2.2',
    suite: 'deferred-frontiers',
    criterion:
      'Every surface-class face binds its finish callout at export: honed bores Ra 0.4-0.8 with 45 +/-15 deg crosshatch, ground journals/seal lands Ra 0.2-0.4, gasket decks Ra 1.6-3.2; an unbound functional face fails.',
  },
  {
    requirementId: 'REQ-V8R2-121',
    frontier: 'occurrence-congruence',
    gate: 'rev2.2',
    suite: 'deferred-frontiers',
    criterion:
      'All same-product occurrence families pairwise congruent within 0.001 (8 pistons, 8 rods + caps, 16 valves per type, 26 bearing shells by class); Cylinder Head L is the exact mirror image of Cylinder Head R within 0.001.',
  },
];

export type ProcessOnlyRequirement = {
  requirementId: string;
  suite: SuiteFile;
  review: string;
};

/** The 10 process-only requirements — review/lint items, no geometry test. */
export const processOnlyRequirements: readonly ProcessOnlyRequirement[] = [
  {
    requirementId: 'REQ-V8R2-054',
    suite: 'valvetrain-drive',
    review:
      'Tooth counts 64/32 = 2:1 exactly; cam phase table derives from firing order 1-5-4-8-6-3-7-2 and crankpin phase 0/90/270/180.',
  },
  {
    requirementId: 'REQ-V8R2-083',
    suite: 'dfm-structure',
    review:
      'Cylinder bores run through to the crankcase; hone overtravel >= 6.0 below BDC oil-ring position before breakout.',
  },
  {
    requirementId: 'REQ-V8R2-084',
    suite: 'dfm-structure',
    review:
      'Machining datums declared and modeled: block A = crank tunnel axis, B = front face, C = pan-rail dowel; heads A = deck, B/C = dowel bores.',
  },
  {
    requirementId: 'REQ-V8R2-090',
    suite: 'dfm-structure',
    review:
      'As-cast vs machined faces annotated: decks +2.0, rails/front/rear +1.5 machining stock metadata.',
  },
  {
    requirementId: 'REQ-V8R2-091',
    suite: 'dfm-structure',
    review:
      'Feature-tree review: every part built with its Section 3 primary form-maker; no butted-primitive substitutions, no mitred duct seams.',
  },
  {
    requirementId: 'REQ-V8R2-093',
    suite: 'dfm-structure',
    review:
      'Block skirt 6 external ribs/side (4 x 12); valve cover crown rib lattice; pan stiffening — ribs instead of bulk.',
  },
  {
    requirementId: 'REQ-V8R2-094',
    suite: 'dfm-structure',
    review:
      'Rod beam is a true I-section (flanges 16x3.5, web 4.0x17) lofted into both bosses.',
  },
  {
    requirementId: 'REQ-V8R2-101',
    suite: 'census',
    review:
      'Every occurrence participates in >= 1 joint row; the orphan allowlist is EMPTY; no belt or chain occurrence exists in rev2.0. Suite lint: census.geospec.ts.',
  },
  {
    requirementId: 'REQ-V8R2-102',
    suite: 'census',
    review:
      'Each interface pair appears in exactly one authoritative row; superseded permissive bands prohibited. Suite lint: census.geospec.ts.',
  },
  {
    requirementId: 'REQ-V8R2-104',
    suite: 'census',
    review:
      'Every parameter consumed by geometry, placement, or a requirement; geometry never contradicts a parameter. Suite lint: census.geospec.ts.',
  },
];

export type VerifyTodayRequirement = {
  requirementId: string;
  suite: SuiteFile;
  matcher: string;
};

const requirementId = (n: number): string =>
  `REQ-V8R2-${String(n).padStart(3, '0')}`;

const verifyTodayRow = (
  n: number,
  suite: SuiteFile,
  matcher: string,
): VerifyTodayRequirement => ({
  requirementId: requirementId(n),
  suite,
  matcher,
});

/** The 90 verify-today requirements (Section 6 matrix + landed void-continuity and contact-area frontiers). */
export const verifyTodayRequirements: readonly VerifyTodayRequirement[] = [
  verifyTodayRow(1, 'flow-paths', 'void-continuity'),
  verifyTodayRow(2, 'flow-paths', 'circular-hole-pattern'),
  verifyTodayRow(3, 'flow-paths', 'void-continuity'),
  verifyTodayRow(4, 'flow-paths', 'void-continuity'),
  verifyTodayRow(5, 'flow-paths', 'min-wall'),
  verifyTodayRow(6, 'flow-paths', 'void-continuity'),
  verifyTodayRow(8, 'flow-paths', 'circular-hole-pattern'),
  verifyTodayRow(9, 'flow-paths', 'interference + allowance'),
  verifyTodayRow(10, 'flow-paths', 'void-continuity'),
  verifyTodayRow(11, 'flow-paths', 'circular-hole(-pattern)'),
  verifyTodayRow(12, 'flow-paths', 'circular-hole-pattern'),
  verifyTodayRow(13, 'flow-paths', 'void-continuity'),
  verifyTodayRow(14, 'flow-paths', 'coaxial'),
  verifyTodayRow(15, 'flow-paths', 'void-continuity'),
  verifyTodayRow(16, 'flow-paths', 'coaxial'),
  verifyTodayRow(18, 'flow-paths', 'clearance'),
  verifyTodayRow(19, 'split-lines-fasteners', 'contact + coplanar'),
  verifyTodayRow(20, 'split-lines-fasteners', 'coaxial + insertion + contact'),
  verifyTodayRow(21, 'split-lines-fasteners', 'clearance'),
  verifyTodayRow(22, 'split-lines-fasteners', 'containment'),
  verifyTodayRow(23, 'split-lines-fasteners', 'contact + coplanar'),
  verifyTodayRow(24, 'split-lines-fasteners', 'interference + allowance'),
  verifyTodayRow(25, 'split-lines-fasteners', 'coaxial + insertion + contact'),
  verifyTodayRow(26, 'split-lines-fasteners', 'occurrences + contact'),
  verifyTodayRow(27, 'split-lines-fasteners', 'interference + allowance'),
  verifyTodayRow(28, 'split-lines-fasteners', 'containment'),
  verifyTodayRow(29, 'split-lines-fasteners', 'coaxial + insertion + contact'),
  verifyTodayRow(
    30,
    'split-lines-fasteners',
    'interference + clearance + coaxial',
  ),
  verifyTodayRow(
    31,
    'split-lines-fasteners',
    'coaxial + contact + containment',
  ),
  verifyTodayRow(32, 'split-lines-fasteners', 'coaxial + insertion + contact'),
  verifyTodayRow(33, 'split-lines-fasteners', 'insertion + coaxial + contact'),
  verifyTodayRow(35, 'sealing', 'circular-hole-pattern'),
  verifyTodayRow(36, 'sealing', 'coaxial'),
  verifyTodayRow(37, 'sealing', 'clearance'),
  verifyTodayRow(38, 'sealing', 'contact-area'),
  verifyTodayRow(39, 'sealing', 'angle + contact'),
  verifyTodayRow(40, 'sealing', 'interference + allowance'),
  verifyTodayRow(41, 'sealing', 'interference + allowance'),
  verifyTodayRow(42, 'sealing', 'clearance'),
  verifyTodayRow(43, 'sealing', 'contact'),
  verifyTodayRow(44, 'sealing', 'contact-area'),
  verifyTodayRow(45, 'sealing', 'clearance'),
  verifyTodayRow(46, 'sealing', 'circular-hole-pattern'),
  verifyTodayRow(47, 'sealing', 'interference + allowance'),
  verifyTodayRow(48, 'sealing', 'interference + allowance'),
  verifyTodayRow(49, 'sealing', 'clearance + contact'),
  verifyTodayRow(50, 'valvetrain-drive', 'contact'),
  verifyTodayRow(51, 'valvetrain-drive', 'contact'),
  verifyTodayRow(52, 'valvetrain-drive', 'clearance (pitch tangency)'),
  verifyTodayRow(55, 'valvetrain-drive', 'clearance'),
  verifyTodayRow(56, 'valvetrain-drive', 'containment + contact'),
  verifyTodayRow(57, 'valvetrain-drive', 'clearance (installed height)'),
  verifyTodayRow(58, 'valvetrain-drive', 'contact'),
  verifyTodayRow(59, 'valvetrain-drive', 'containment + contact'),
  verifyTodayRow(60, 'pin-retention', 'containment (groove features)'),
  verifyTodayRow(61, 'pin-retention', 'containment + contact'),
  verifyTodayRow(62, 'pin-retention', 'clearance'),
  verifyTodayRow(63, 'pin-retention', 'insertion'),
  verifyTodayRow(64, 'pin-retention', 'clearance'),
  verifyTodayRow(65, 'fits', 'contact + interference-allowance audit'),
  verifyTodayRow(66, 'fits', 'clearance'),
  verifyTodayRow(67, 'fits', 'clearance'),
  verifyTodayRow(68, 'fits', 'clearance'),
  verifyTodayRow(69, 'fits', 'clearance'),
  verifyTodayRow(70, 'fits', 'clearance'),
  verifyTodayRow(71, 'fits', 'clearance'),
  verifyTodayRow(72, 'fits', 'clearance'),
  verifyTodayRow(73, 'fits', 'clearance'),
  verifyTodayRow(74, 'fits', 'interference + containment'),
  verifyTodayRow(75, 'fits', 'concentric + clearance + interference'),
  verifyTodayRow(76, 'fits', 'interference + allowance'),
  verifyTodayRow(77, 'fits', 'interference (allowance-list closure)'),
  verifyTodayRow(80, 'dfm-structure', 'chamfer-feature'),
  verifyTodayRow(81, 'dfm-structure', 'fillet-feature'),
  verifyTodayRow(82, 'dfm-structure', 'contact'),
  verifyTodayRow(85, 'dfm-structure', 'fillet-feature'),
  verifyTodayRow(87, 'dfm-structure', 'clearance (tool cylinder)'),
  verifyTodayRow(88, 'dfm-structure', 'clearance (tool cylinder)'),
  verifyTodayRow(89, 'dfm-structure', 'circular-hole-pattern'),
  verifyTodayRow(92, 'dfm-structure', 'circular-hole-pattern'),
  verifyTodayRow(99, 'dfm-structure', 'circular-hole-pattern'),
  verifyTodayRow(100, 'census', 'occurrences / product-structure'),
  verifyTodayRow(103, 'census', 'circular-hole-pattern (counts)'),
  verifyTodayRow(105, 'dfm-structure', 'circular-hole-pattern + coaxial'),
  verifyTodayRow(106, 'dfm-structure', 'circular-hole-pattern'),
  verifyTodayRow(107, 'dfm-structure', 'coplanar'),
  verifyTodayRow(108, 'dfm-structure', 'occurrences + circular-hole'),
  verifyTodayRow(109, 'dfm-structure', 'contact'),
  verifyTodayRow(110, 'dfm-structure', 'clearance + coaxial'),
  verifyTodayRow(111, 'deferred-frontiers', 'contact-area'),
];

/**
 * Section 6.1 tallies. void-continuity (7 REQs) and contact-area (3 REQs:
 * 038/044/111) have both landed (Section 1.3 deferral policy): their REQs
 * moved to verify-today, so rev2.1 frontier gates drop 19 -> 12 -> 9. Landed
 * frontiers stay pinned at 0 so the exhaustive `Record` keeps compile-time
 * coverage of every frontier name and the tally test proves no deferral
 * sneaks back under a landed frontier.
 */
export const requirementCounts = {
  total: 121,
  verifyToday: 90,
  frontierGatedRev21: 9,
  frontierGatedRev21Plus: 6,
  frontierGatedRev22: 6,
  processOnly: 10,
  byFrontier: {
    'void-continuity': 0,
    'contact-area': 0,
    'region-wall': 4,
    'draft-measure': 2,
    'thread-semantics': 3,
    'mass-balance': 4,
    gdt: 1,
    'kinematic-sweep': 1,
    'standard-feature': 1,
    'tolerance-chain': 1,
    'assembly-path': 1,
    'misassembly-exclusion': 1,
    'surface-callout': 1,
    'occurrence-congruence': 1,
  } satisfies Record<GeoSpecFrontier, number>,
} as const;

/** All 121 requirement ids, REQ-V8R2-001..121. */
export const allRequirementIds = (): string[] =>
  Array.from({ length: 121 }, (_, index) => requirementId(index + 1));

/**
 * Cluster-file deferral registration check (Section 1.3 policy): every
 * frontier-gated requirement appears in its cluster's suite file as an
 * explicitly registered deferral naming REQ id and frontier. Pure TS; passes
 * without a model — that is correct and honest.
 */
export const assertDeferralsRegistered = (
  suite: SuiteFile,
  requirementIds: readonly string[],
): void => {
  const registered = frontierDeferrals
    .filter((entry) => entry.suite === suite)
    .map((entry) => entry.requirementId);
  const missing = requirementIds.filter((id) => !registered.includes(id));
  const extra = registered.filter((id) => !requirementIds.includes(id));
  if (missing.length > 0 || extra.length > 0) {
    throw new Error(
      `Deferral registry mismatch for ${suite}: missing ${missing.join(', ') || '—'}; unexpected ${extra.join(', ') || '—'}.`,
    );
  }
  for (const id of requirementIds) {
    const entry = frontierDeferrals.find(
      (candidate) => candidate.requirementId === id,
    );
    if (!entry || entry.criterion.length === 0) {
      throw new Error(`Deferral ${id} is missing its quantified criterion.`);
    }
  }
};

/** Process-only registration check for a suite file (review/lint items). */
export const assertProcessOnlyRegistered = (
  suite: SuiteFile,
  requirementIds: readonly string[],
): void => {
  const registered = processOnlyRequirements
    .filter((entry) => entry.suite === suite)
    .map((entry) => entry.requirementId);
  const missing = requirementIds.filter((id) => !registered.includes(id));
  const extra = registered.filter((id) => !requirementIds.includes(id));
  if (missing.length > 0 || extra.length > 0) {
    throw new Error(
      `Process-only registry mismatch for ${suite}: missing ${missing.join(', ') || '—'}; unexpected ${extra.join(', ') || '—'}.`,
    );
  }
};
