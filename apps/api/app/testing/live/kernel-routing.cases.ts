import { kernelConfigurations } from '@taucad/types/constants';
import type { KernelId, KernelPreference, KernelRoutingTier, KernelRoutingZoneId } from '@taucad/types/constants';
import type { KernelRoutingProfile } from '@taucad/chat/prompts';

/**
 * The automatic kernel selection development corpus (blueprint AKS-3a, Appendix E): 50 routing cases stratified by
 * use-case family and 30 behaviour cases. Labels never enter a model's context; a runner sends `prompt`, `host`,
 * `preference` and `fixture` only. Seeds from the Jev and KS-S1 corpora are development-only, and every case that
 * informs a rubric change stays here: the held-out set (AKS-3d) is written by someone else and runs only at the gate.
 */

/** The host profiles of blueprint Appendix C that the corpus uses. Zoo is closed on every cloud profile (E9). */
export type KernelRoutingHostId = 'web' | 'desktop' | 'plugin';

const catalogOrder: readonly KernelId[] = kernelConfigurations.map(({ id }) => id);
const except = (...ids: readonly KernelId[]): KernelId[] => catalogOrder.filter((id) => !ids.includes(id));

/**
 * The available kernels per host, in catalog order. Web cloud lacks Zoo and the desktop-native kernels (PicoGK's
 * browser assets are treated as not shipped); desktop cloud lacks Zoo; the plugin lacks Zoo and ships no OpenCascade
 * skill.
 */
export const kernelRoutingHosts: Readonly<Record<KernelRoutingHostId, KernelRoutingProfile>> = {
  web: { available: except('zoo', 'build123d', 'smlibpy', 'picogk') },
  desktop: { available: except('zoo') },
  plugin: { available: except('zoo'), withoutSkill: ['opencascadejs'] },
};

/**
 * What a case is checking. `routing` and `ambiguous-safe` pass on an acceptable kernel (and the latter also fails on a
 * question); `must-ask` passes on a question or an out-of-scope statement before any write; `entitlement` fails only
 * on a write in a `forbidden` kernel; `existing` fails on a write in any kernel but the owner's; `obedience` passes on
 * the manual pick.
 */
export type KernelRoutingCaseKind =
  | 'routing'
  | 'ambiguous-safe'
  | 'must-ask'
  | 'entitlement'
  | 'existing'
  | 'obedience';

/** The operator's five heuristics (blueprint Problem Statement 8), each reported as a preferred-kernel rate. */
export type KernelRoutingHeuristic =
  | 'simple-openscad'
  | 'technical-replicad'
  | 'large-zoo'
  | 'electronics-tscircuit'
  | 'organic-picovoxel';

/**
 * The project a case starts from. `entry-less` has a manifest and no model file. `existing` already has an entry in
 * `owner`; with `noEntryText` the runner still sends the Auto no-entry text, the state that text meets after its own
 * write or a compaction (Appendix E). `files` are other files already in the project, such as a mesh to repair.
 */
export type KernelRoutingFixture =
  | { readonly kind: 'entry-less'; readonly files?: readonly string[] }
  | {
      readonly kind: 'existing';
      readonly owner: KernelId;
      readonly entryPath: string;
      readonly noEntryText?: boolean;
    };

/** One labelled development case. @public */
export type KernelRoutingCase = {
  readonly id: string;
  readonly prompt: string;
  readonly host: KernelRoutingHostId;
  readonly preference: KernelPreference;
  readonly fixture: KernelRoutingFixture;
  readonly family: KernelRoutingZoneId;
  readonly tier: KernelRoutingTier;
  readonly kind: KernelRoutingCaseKind;
  /** Every kernel that passes; for a narrow case the survivor set, for a broad case the zone's set on this host. */
  readonly acceptable: readonly KernelId[];
  /** The kernels the request's signal favours, reported and never gated. */
  readonly preferred?: readonly KernelId[];
  readonly heuristic?: KernelRoutingHeuristic;
  /** Kernels whose file is a failure whatever else happens: the entitlement tripwire. */
  readonly forbidden?: readonly KernelId[];
  /** Whether the request names a kernel, language, file type or customiser (Appendix E counts six). */
  readonly named?: boolean;
  /** BCP 47 tag; `en` unless stated. */
  readonly language?: string;
  readonly provenance: string;
};

const entryLess = { kind: 'entry-less' } as const;
const authored = 'Written for AKS-3a by the Technical Lead, 2026-11-10, from the use-case landscape';

type RoutingInput = Omit<KernelRoutingCase, 'kind' | 'fixture' | 'preference' | 'provenance'> &
  Partial<Pick<KernelRoutingCase, 'fixture' | 'preference' | 'provenance'>>;

const routing = (input: RoutingInput): KernelRoutingCase => ({
  kind: 'routing',
  fixture: entryLess,
  preference: 'auto',
  provenance: `${authored} family ${input.family}`,
  ...input,
});

const openscadOrReplicad = ['openscad', 'replicad'] as const;
const printsDesktop = ['openscad', 'replicad', 'build123d'] as const;
const exactWeb = ['replicad', 'opencascadejs', 'smlib'] as const;
const exactDesktop = ['replicad', 'opencascadejs', 'smlib', 'build123d', 'smlibpy'] as const;
const voxelWeb = ['picovoxel'] as const;
const voxelDesktop = ['picovoxel', 'picogk'] as const;

/** The 50 routing cases (Appendix E counts per family). @public */
export const kernelRoutingRoutingCases: readonly KernelRoutingCase[] = [
  // U1 Everyday functional prints: 10, two of them customisers.
  routing({
    id: 'u1-wall-hook',
    prompt: 'A wall hook for a coat, 60 mm tall, with two countersunk screw holes. I will 3D print it.',
    host: 'web',
    family: 'U1',
    tier: 'broad',
    acceptable: openscadOrReplicad,
    preferred: ['openscad'],
    heuristic: 'simple-openscad',
  }),
  routing({
    id: 'u1-cable-clip',
    prompt: 'Make a desk-edge cable clip that holds three 6 mm cables and clamps onto a 25 mm desk.',
    host: 'web',
    family: 'U1',
    tier: 'broad',
    acceptable: openscadOrReplicad,
  }),
  routing({
    id: 'u1-shelf-bracket',
    prompt: 'A shelf bracket for an 18 mm board with a filleted inside corner and chamfered edges so it prints strong.',
    host: 'desktop',
    family: 'U1',
    tier: 'broad',
    acceptable: printsDesktop,
    preferred: ['replicad'],
    heuristic: 'technical-replicad',
  }),
  routing({
    id: 'u1-drawer-organiser',
    prompt: 'A drawer organiser grid, 3 by 4 cells, 40 mm tall walls, sized for a 300 by 400 mm drawer.',
    host: 'web',
    family: 'U1',
    tier: 'broad',
    acceptable: openscadOrReplicad,
    preferred: ['openscad'],
    heuristic: 'simple-openscad',
  }),
  routing({
    id: 'u1-phone-stand',
    prompt: 'Design a phone stand with a 65 degree viewing angle and a slot for the charging cable.',
    host: 'web',
    family: 'U1',
    tier: 'broad',
    acceptable: openscadOrReplicad,
  }),
  routing({
    id: 'u1-knob-replacement',
    prompt:
      'Replacement knob for my oven: D-shaped 6 mm shaft with a 4.6 mm flat, 35 mm grip, snap fit onto the shaft. I may want STEP later.',
    host: 'web',
    family: 'U1',
    tier: 'broad',
    acceptable: openscadOrReplicad,
    preferred: ['replicad'],
    heuristic: 'technical-replicad',
  }),
  routing({
    id: 'u1-customiser-box',
    prompt: 'A parametric storage box I can publish as a MakerWorld customiser: width, depth, height and wall sliders.',
    host: 'web',
    family: 'U1',
    tier: 'narrow',
    acceptable: ['openscad'],
    named: true,
  }),
  routing({
    id: 'u1-thingiverse-tag',
    prompt: 'A luggage tag with my name embossed, as a .scad file so people on Thingiverse can change the text.',
    host: 'web',
    family: 'U1',
    tier: 'narrow',
    acceptable: ['openscad'],
    named: true,
  }),
  routing({
    id: 'u1-hose-adapter-de',
    prompt: 'Ein Schlauchadapter von 32 mm auf 25 mm Innendurchmesser für meinen Staubsauger, zum 3D-Drucken.',
    host: 'web',
    family: 'U1',
    tier: 'broad',
    acceptable: openscadOrReplicad,
    language: 'de',
  }),
  routing({
    id: 'u1-plant-pot-saucer',
    prompt: 'A round plant pot, 120 mm diameter, with drainage holes and a matching saucer.',
    host: 'desktop',
    family: 'U1',
    tier: 'broad',
    acceptable: printsDesktop,
  }),
  // U2 Enclosures and housings: 5, one in Python.
  routing({
    id: 'u2-pi-case',
    prompt:
      'An enclosure for a Raspberry Pi 5 with filleted corners, 2 mm shelled walls, standoffs on the board holes and a snap-on lid.',
    host: 'web',
    family: 'U2',
    tier: 'broad',
    acceptable: openscadOrReplicad,
    preferred: ['replicad'],
    heuristic: 'technical-replicad',
  }),
  routing({
    id: 'u2-plain-box',
    prompt: 'A plain box with a lift-off lid, 100 by 60 by 40 mm, for storing SD cards.',
    host: 'web',
    family: 'U2',
    tier: 'broad',
    acceptable: openscadOrReplicad,
    preferred: ['openscad'],
    heuristic: 'simple-openscad',
  }),
  routing({
    id: 'u2-sensor-housing-es',
    prompt: 'Una carcasa para un sensor de temperatura con rejillas de ventilación y orejas para tornillos M3.',
    host: 'web',
    family: 'U2',
    tier: 'broad',
    acceptable: openscadOrReplicad,
    language: 'es',
  }),
  routing({
    id: 'u2-battery-housing',
    prompt: 'A housing for two 18650 cells with a sliding cover and bosses for M2.5 heat-set inserts.',
    host: 'desktop',
    family: 'U2',
    tier: 'broad',
    acceptable: printsDesktop,
    preferred: ['replicad'],
  }),
  routing({
    id: 'u2-python-enclosure',
    prompt: 'Write it in Python: a wall-mount enclosure for a small router, 150 by 110 by 35 mm, with keyhole slots.',
    host: 'desktop',
    family: 'U2',
    tier: 'narrow',
    acceptable: ['build123d', 'smlibpy'],
    named: true,
  }),
  // U3 Standard mechanical components: 5, one in Python.
  routing({
    id: 'u3-spur-gear',
    prompt: 'A spur gear, module 1.5, 24 teeth, 20 degree pressure angle, 8 mm bore with a 2 mm keyway.',
    host: 'web',
    family: 'U3',
    tier: 'narrow',
    acceptable: exactWeb,
    preferred: ['replicad'],
  }),
  routing({
    id: 'u3-flange',
    prompt: 'A DN50 PN16 weld-neck flange to EN 1092-1, with the standard bolt circle.',
    host: 'web',
    family: 'U3',
    tier: 'narrow',
    acceptable: exactWeb,
  }),
  routing({
    id: 'u3-m8-bolt',
    prompt: 'An M8 x 40 hex bolt with a modelled ISO metric thread.',
    host: 'desktop',
    family: 'U3',
    tier: 'narrow',
    acceptable: exactDesktop,
  }),
  routing({
    id: 'u3-stepped-shaft-python',
    prompt: 'In Python, a stepped shaft: 20 mm for 60 mm, 25 mm h6 bearing seat for 18 mm, then a 12 mm keyed end.',
    host: 'desktop',
    family: 'U3',
    tier: 'narrow',
    acceptable: ['build123d', 'smlibpy'],
    named: true,
  }),
  routing({
    id: 'u3-bearing-block-fr',
    prompt: 'Un palier pour un roulement 608 avec un alésage H7 et deux trous de fixation.',
    host: 'web',
    family: 'U3',
    tier: 'narrow',
    acceptable: exactWeb,
    language: 'fr',
  }),
  // U4 Parts for a manufacturing process: 4.
  routing({
    id: 'u4-cnc-bracket',
    prompt: 'An aluminium bracket to be CNC machined from 10 mm plate, with two tapped M6 holes; I need the STEP.',
    host: 'web',
    family: 'U4',
    tier: 'narrow',
    acceptable: exactWeb,
  }),
  routing({
    id: 'u4-sheet-metal-cover',
    prompt:
      'A sheet metal cover, 1.5 mm steel, bent on four sides with relief cuts, for a laser cutter and press brake.',
    host: 'web',
    family: 'U4',
    tier: 'narrow',
    acceptable: exactWeb,
  }),
  routing({
    id: 'u4-cast-housing',
    prompt:
      'A gearbox housing that will be sand cast, with 2 degree draft and machining allowance on the bearing bores.',
    host: 'desktop',
    family: 'U4',
    tier: 'narrow',
    acceptable: exactDesktop,
  }),
  routing({
    id: 'u4-injection-moulded-clip',
    prompt: 'An injection-moulded battery door clip with uniform 1.2 mm walls and a living hinge.',
    host: 'web',
    family: 'U4',
    tier: 'narrow',
    acceptable: exactWeb,
  }),
  // U5 Assemblies and mechanisms: 3.
  routing({
    id: 'u5-hinge',
    prompt: 'A two-part print-in-place hinge with 0.3 mm clearance and a pin, as an assembly I can animate.',
    host: 'web',
    family: 'U5',
    tier: 'narrow',
    acceptable: ['replicad', 'opencascadejs'],
  }),
  routing({
    id: 'u5-planetary',
    prompt: 'A planetary gearset with a 4:1 ratio: sun, three planets, ring and carrier, as a mated assembly.',
    host: 'desktop',
    family: 'U5',
    tier: 'narrow',
    acceptable: ['replicad', 'opencascadejs', 'build123d'],
  }),
  routing({
    id: 'u5-vise',
    prompt: 'A bench vise assembly: base, sliding jaw, lead screw and handle, with the screw driving the jaw.',
    host: 'web',
    family: 'U5',
    tier: 'narrow',
    acceptable: ['replicad', 'opencascadejs'],
  }),
  // U6 Product and consumer forms: 3, one naming SMLib.
  routing({
    id: 'u6-bottle',
    prompt: 'A 500 ml water bottle body with a lofted grip waist and a threaded neck, for a blow-mould supplier.',
    host: 'web',
    family: 'U6',
    tier: 'narrow',
    acceptable: ['replicad', 'smlib'],
    preferred: ['replicad'],
  }),
  routing({
    id: 'u6-mouse-shell',
    prompt: 'A computer mouse shell with freeform curved surfaces and a smooth palm rest.',
    host: 'web',
    family: 'U6',
    tier: 'broad',
    acceptable: ['replicad', 'smlib', 'picovoxel'],
    preferred: ['smlib'],
  }),
  routing({
    id: 'u6-smlib-handle',
    prompt: 'Use SMLib: a kitchen knife handle with NURBS surfaces and a full-tang slot.',
    host: 'web',
    family: 'U6',
    tier: 'narrow',
    acceptable: ['smlib'],
    named: true,
  }),
  // U7 Organic and decorative forms: 3, one voxel-only.
  routing({
    id: 'u7-vase',
    prompt: 'A decorative vase, 200 mm tall, with a gently twisted profile.',
    host: 'web',
    family: 'U7',
    tier: 'broad',
    acceptable: ['picovoxel', 'replicad', 'openscad'],
    preferred: ['replicad'],
  }),
  routing({
    id: 'u7-coral-lamp',
    prompt: 'A lamp shade that looks like branching coral, with smoothly blended, thickened branches.',
    host: 'web',
    family: 'U7',
    tier: 'broad',
    acceptable: ['picovoxel', 'replicad', 'openscad'],
    preferred: ['picovoxel'],
    heuristic: 'organic-picovoxel',
  }),
  routing({
    id: 'u7-grown-sculpture',
    prompt:
      'An organic desk sculpture grown from a smooth field: three blobs that melt into each other with variable wall thickness and internal voids.',
    host: 'desktop',
    family: 'U7',
    tier: 'narrow',
    acceptable: voxelDesktop,
    preferred: ['picovoxel'],
    heuristic: 'organic-picovoxel',
    provenance: `${authored} family U7; voxel-only organic (field blends and internal voids no BRep kernel represents)`,
  }),
  // U8 Computational engineering: 7, none naming "lattice" twice.
  routing({
    id: 'u8-gyroid-cube',
    prompt: 'A 40 mm test cube filled with a gyroid lattice, 1 mm wall, graded denser towards the bottom.',
    host: 'web',
    family: 'U8',
    tier: 'narrow',
    acceptable: voxelWeb,
  }),
  routing({
    id: 'u8-heat-exchanger',
    prompt: 'A compact counterflow heat exchanger core for two fluids, about 60 mm cube, for metal additive printing.',
    host: 'web',
    family: 'U8',
    tier: 'narrow',
    acceptable: voxelWeb,
  }),
  routing({
    id: 'u8-cooling-jacket',
    prompt:
      'An injection-mould insert with conformal cooling channels following the cavity surface, to be printed in steel.',
    host: 'desktop',
    family: 'U8',
    tier: 'narrow',
    acceptable: voxelDesktop,
  }),
  routing({
    id: 'u8-porous-implant',
    prompt: 'A porous acetabular cup implant with 600 micron pores and 70 percent porosity for bone ingrowth.',
    host: 'web',
    family: 'U8',
    tier: 'narrow',
    acceptable: voxelWeb,
  }),
  routing({
    id: 'u8-cold-plate',
    prompt: 'A liquid cold plate for a 100 by 100 mm GPU die with a TPMS internal structure and two barbed ports.',
    host: 'desktop',
    family: 'U8',
    tier: 'narrow',
    acceptable: voxelDesktop,
  }),
  routing({
    id: 'u8-lightweight-bracket-ja',
    prompt: '金属3Dプリント用に、トポロジー最適化したような軽量ブラケットを作ってください。内部はラティス構造で。',
    host: 'web',
    family: 'U8',
    tier: 'narrow',
    acceptable: voxelWeb,
    language: 'ja',
  }),
  routing({
    id: 'u8-rocket-regen',
    prompt: 'A small rocket nozzle with regenerative cooling channels inside the wall, for laser powder bed fusion.',
    host: 'desktop',
    family: 'U8',
    tier: 'narrow',
    acceptable: voxelDesktop,
  }),
  // U9 Electronics: 4, two with an enclosure.
  routing({
    id: 'u9-led-blinker',
    prompt: 'A small board with a 555 timer that blinks an LED, with a USB-C power input.',
    host: 'web',
    family: 'U9',
    tier: 'narrow',
    acceptable: ['tscircuit'],
    heuristic: 'electronics-tscircuit',
  }),
  routing({
    id: 'u9-esp32-breakout',
    prompt: 'An ESP32 breakout PCB with headers on both sides; I need the BOM and gerbers.',
    host: 'web',
    family: 'U9',
    tier: 'narrow',
    acceptable: ['tscircuit'],
    heuristic: 'electronics-tscircuit',
  }),
  routing({
    id: 'u9-sensor-board-enclosure',
    prompt: 'Design the circuit board for a temperature logger; later it will need a printed enclosure.',
    host: 'web',
    family: 'U9',
    tier: 'narrow',
    acceptable: ['tscircuit'],
    heuristic: 'electronics-tscircuit',
  }),
  routing({
    id: 'u9-keypad-pt',
    prompt:
      'Uma placa de circuito para um teclado de 4x4 botões com resistores de pull-up, e depois uma caixa para ela.',
    host: 'desktop',
    family: 'U9',
    tier: 'narrow',
    acceptable: ['tscircuit'],
    heuristic: 'electronics-tscircuit',
    language: 'pt',
  }),
  // U10 Architecture, furniture, flat stock: 1.
  routing({
    id: 'u10-bookshelf',
    prompt: 'A bookshelf from 18 mm plywood panels, 800 wide and 1800 tall, with dado joints for five shelves.',
    host: 'web',
    family: 'U10',
    tier: 'broad',
    acceptable: openscadOrReplicad,
    preferred: ['replicad'],
  }),
  // U11 Teaching and simple shapes: 2, one naming OpenSCAD.
  routing({
    id: 'u11-first-shape',
    prompt: 'I am new to CAD. Show me how to make a simple cube with a hole through it.',
    host: 'web',
    family: 'U11',
    tier: 'broad',
    acceptable: openscadOrReplicad,
    preferred: ['openscad'],
    heuristic: 'simple-openscad',
  }),
  routing({
    id: 'u11-learn-openscad',
    prompt: 'Teach me OpenSCAD with a snowman made of three spheres and a cone nose.',
    host: 'web',
    family: 'U11',
    tier: 'narrow',
    acceptable: ['openscad'],
    named: true,
  }),
  // U12 From an existing mesh: 3.
  routing({
    id: 'u12-repair-stl',
    prompt: 'This STL has holes and flipped faces. Repair it and add a flat base so it prints.',
    host: 'web',
    fixture: { kind: 'entry-less', files: ['figure.stl'] },
    family: 'U12',
    tier: 'narrow',
    acceptable: ['manifold', 'openscad'],
    preferred: ['manifold'],
  }),
  routing({
    id: 'u12-remix-mount',
    prompt: 'Take mount.stl and cut a 22 mm hole through its centre, then merge it with a 5 mm base plate.',
    host: 'web',
    fixture: { kind: 'entry-less', files: ['mount.stl'] },
    family: 'U12',
    tier: 'narrow',
    acceptable: ['manifold', 'openscad'],
    preferred: ['manifold'],
  }),
  routing({
    id: 'u12-hollow-scan',
    prompt: 'Hollow this scanned bust (bust.stl) to a 2 mm shell with an inner lattice so it uses less resin.',
    host: 'desktop',
    fixture: { kind: 'entry-less', files: ['bust.stl'] },
    family: 'U12',
    tier: 'narrow',
    acceptable: voxelDesktop,
    preferred: ['picovoxel'],
  }),
];

type BehaviourInput = Omit<KernelRoutingCase, 'fixture' | 'preference' | 'provenance' | 'tier'> &
  Partial<Pick<KernelRoutingCase, 'fixture' | 'preference' | 'provenance' | 'tier'>>;

const behaviour = (input: BehaviourInput): KernelRoutingCase => ({
  fixture: entryLess,
  preference: 'auto',
  tier: 'broad',
  provenance: `${authored}: ${input.kind}`,
  ...input,
});

const ambiguousSafe = (input: RoutingInput): KernelRoutingCase => ({
  ...routing(input),
  kind: 'ambiguous-safe',
  provenance: `${authored}: ambiguous-safe`,
});

const nativeKernels = ['build123d', 'smlibpy', 'picogk'] as const;

/** The 30 behaviour cases (Appendix E). @public */
export const kernelRoutingBehaviourCases: readonly KernelRoutingCase[] = [
  // Entitlement, Zoo and scale: 5.
  behaviour({
    id: 'ent-zoo-large-assembly',
    kind: 'entitlement',
    prompt: 'A full 6-axis robot arm assembly with every motor, gear and fastener: about 400 parts.',
    host: 'web',
    family: 'U5',
    tier: 'narrow',
    acceptable: ['replicad', 'opencascadejs'],
    forbidden: ['zoo'],
    heuristic: 'large-zoo',
  }),
  behaviour({
    id: 'ent-zoo-kcl',
    kind: 'entitlement',
    prompt: 'Write this in KCL: a parametric 20 by 20 aluminium extrusion profile, 300 mm long.',
    host: 'web',
    family: 'U3',
    tier: 'narrow',
    acceptable: exactWeb,
    forbidden: ['zoo'],
    named: true,
  }),
  behaviour({
    id: 'ent-zoo-cloud-capacity',
    kind: 'entitlement',
    prompt: 'This engine block is too big for my browser. Use the cloud engine to model the full V8 block.',
    host: 'desktop',
    family: 'U5',
    tier: 'narrow',
    acceptable: ['replicad', 'opencascadejs', 'build123d'],
    forbidden: ['zoo'],
    heuristic: 'large-zoo',
  }),
  behaviour({
    id: 'ent-zoo-named',
    kind: 'entitlement',
    prompt: 'Use Zoo to model a gear pump housing with two meshing gears.',
    host: 'desktop',
    family: 'U5',
    tier: 'narrow',
    acceptable: ['replicad', 'opencascadejs', 'build123d'],
    forbidden: ['zoo'],
    named: true,
  }),
  behaviour({
    id: 'ent-zoo-factory-layout',
    kind: 'entitlement',
    prompt: 'A conveyor line assembly: 12 rollers, frame, motor mount and guards, all mated.',
    host: 'web',
    family: 'U5',
    tier: 'narrow',
    acceptable: ['replicad', 'opencascadejs'],
    forbidden: ['zoo'],
    heuristic: 'large-zoo',
  }),
  // Entitlement, desktop-native kernels on a web profile: 5.
  behaviour({
    id: 'ent-web-python',
    kind: 'entitlement',
    prompt: 'Can you do this in Python with build123d: a pulley for a 6 mm GT2 belt, 20 teeth.',
    host: 'web',
    family: 'U3',
    tier: 'narrow',
    acceptable: exactWeb,
    forbidden: nativeKernels,
    named: true,
  }),
  behaviour({
    id: 'ent-web-smlibpy',
    kind: 'entitlement',
    prompt: 'Use SMLibPy for a NURBS door handle with a smooth grip.',
    host: 'web',
    family: 'U6',
    tier: 'narrow',
    acceptable: ['smlib', 'replicad'],
    forbidden: nativeKernels,
    named: true,
  }),
  behaviour({
    id: 'ent-web-picogk',
    kind: 'entitlement',
    prompt: 'Build a lattice-filled drone arm in PicoGK C#.',
    host: 'web',
    family: 'U8',
    tier: 'narrow',
    acceptable: voxelWeb,
    forbidden: nativeKernels,
    named: true,
  }),
  behaviour({
    id: 'ent-web-csharp-heat-sink',
    kind: 'entitlement',
    prompt: 'A heat sink with gyroid fins, written in C#.',
    host: 'web',
    family: 'U8',
    tier: 'narrow',
    acceptable: voxelWeb,
    forbidden: nativeKernels,
    named: true,
  }),
  behaviour({
    id: 'ent-web-python-bracket',
    kind: 'entitlement',
    prompt: 'Make me a python script for a simple L bracket with two holes.',
    host: 'web',
    family: 'U1',
    tier: 'narrow',
    acceptable: openscadOrReplicad,
    forbidden: nativeKernels,
    named: true,
  }),
  // Existing project: 6, two with the no-entry text over an existing entry.
  behaviour({
    id: 'own-openscad-add-fillets',
    kind: 'existing',
    prompt: 'Add fillets to every outside edge of the bracket.',
    host: 'web',
    fixture: { kind: 'existing', owner: 'openscad', entryPath: 'main.scad' },
    family: 'U1',
    acceptable: ['openscad'],
  }),
  behaviour({
    id: 'own-replicad-add-lattice',
    kind: 'existing',
    prompt: 'Fill the inside of this housing with a gyroid infill to save weight.',
    host: 'web',
    fixture: { kind: 'existing', owner: 'replicad', entryPath: 'main.ts' },
    family: 'U2',
    acceptable: ['replicad'],
  }),
  behaviour({
    id: 'own-jscad-step',
    kind: 'existing',
    prompt: 'Make the gear teeth involute and give me a STEP file.',
    host: 'web',
    fixture: { kind: 'existing', owner: 'jscad', entryPath: 'main.ts' },
    family: 'U3',
    acceptable: ['jscad'],
  }),
  behaviour({
    id: 'own-picovoxel-thread',
    kind: 'existing',
    prompt: 'Add an M20 thread to the inlet port of the heat exchanger.',
    host: 'web',
    fixture: { kind: 'existing', owner: 'picovoxel', entryPath: 'main.ts' },
    family: 'U8',
    acceptable: ['picovoxel'],
  }),
  behaviour({
    id: 'own-stale-text-replicad',
    kind: 'existing',
    prompt: 'Now make the lid slide on instead of snapping on.',
    host: 'web',
    fixture: { kind: 'existing', owner: 'replicad', entryPath: 'main.ts', noEntryText: true },
    family: 'U2',
    acceptable: ['replicad'],
  }),
  behaviour({
    id: 'own-stale-text-openscad',
    kind: 'existing',
    prompt: 'Round off the corners and add a chamfer on the base.',
    host: 'web',
    fixture: { kind: 'existing', owner: 'openscad', entryPath: 'main.scad', noEntryText: true },
    family: 'U1',
    acceptable: ['openscad'],
  }),
  // Must ask: conflicting narrow rules 3, out of scope 2, best fit unavailable 1.
  behaviour({
    id: 'ask-lattice-step',
    kind: 'must-ask',
    prompt: 'A gyroid lattice core for a heat exchanger. I need it as a STEP file for our CAD system.',
    host: 'web',
    family: 'U8',
    tier: 'narrow',
    acceptable: [],
  }),
  behaviour({
    id: 'ask-tpms-machined',
    kind: 'must-ask',
    prompt: 'A TPMS cold plate that our machine shop will CNC mill from a solid block.',
    host: 'web',
    family: 'U8',
    tier: 'narrow',
    acceptable: [],
  }),
  behaviour({
    id: 'ask-customiser-step',
    kind: 'must-ask',
    prompt: 'A Thingiverse customiser for a pipe clamp, and I also need a STEP file of it with an H7 bore.',
    host: 'web',
    family: 'U1',
    tier: 'narrow',
    acceptable: [],
  }),
  behaviour({
    id: 'ask-portrait-bust',
    kind: 'must-ask',
    prompt: 'A realistic bust of my grandfather from this description: wrinkles, beard and a flat cap.',
    host: 'web',
    family: 'U13b',
    tier: 'none',
    acceptable: [],
  }),
  behaviour({
    id: 'ask-ifc-building',
    kind: 'must-ask',
    prompt: 'A two-storey house as an IFC model with walls, slabs, doors and windows for my architect.',
    host: 'web',
    family: 'U13b',
    tier: 'none',
    acceptable: [],
  }),
  behaviour({
    id: 'ask-csharp-unavailable',
    kind: 'must-ask',
    prompt: 'Port our LEAP 71 C# ShapeKernel code for a rocket injector to Tau; it must stay C#.',
    host: 'web',
    family: 'U8',
    tier: 'narrow',
    acceptable: [],
    forbidden: nativeKernels,
  }),
  // Manual pick against content: 5.
  behaviour({
    id: 'pick-openscad-fillets',
    kind: 'obedience',
    prompt: 'An enclosure with filleted edges and snap fits for a small PCB.',
    host: 'web',
    preference: 'openscad',
    family: 'U2',
    acceptable: ['openscad'],
  }),
  behaviour({
    id: 'pick-replicad-box',
    kind: 'obedience',
    prompt: 'A plain cube with a hole through it.',
    host: 'web',
    preference: 'replicad',
    family: 'U11',
    acceptable: ['replicad'],
  }),
  behaviour({
    id: 'pick-picovoxel-bracket',
    kind: 'obedience',
    prompt: 'A simple L-shaped shelf bracket with two screw holes.',
    host: 'web',
    preference: 'picovoxel',
    family: 'U1',
    acceptable: ['picovoxel'],
  }),
  behaviour({
    id: 'pick-jscad-gear',
    kind: 'obedience',
    prompt: 'A spur gear with 18 teeth and a 5 mm bore.',
    host: 'web',
    preference: 'jscad',
    family: 'U3',
    acceptable: ['jscad'],
  }),
  behaviour({
    id: 'pick-manifold-stand',
    kind: 'obedience',
    prompt: 'A headphone stand with a weighted base.',
    host: 'web',
    preference: 'manifold',
    family: 'U1',
    acceptable: ['manifold'],
  }),
  // Ambiguous but safe: asking is the miss. 3.
  ambiguousSafe({
    id: 'safe-cup',
    prompt: 'Make a cup.',
    host: 'web',
    family: 'U11',
    tier: 'broad',
    acceptable: openscadOrReplicad,
  }),
  ambiguousSafe({
    id: 'safe-hook',
    prompt: 'I need a hook.',
    host: 'web',
    family: 'U1',
    tier: 'broad',
    acceptable: openscadOrReplicad,
  }),
  ambiguousSafe({
    id: 'safe-coaster',
    prompt: 'A coaster with a pattern on top.',
    host: 'web',
    family: 'U7',
    tier: 'broad',
    acceptable: ['picovoxel', 'replicad', 'openscad'],
  }),
];

/** The development set: routing then behaviour. @public */
export const kernelRoutingDevelopmentCases: readonly KernelRoutingCase[] = [
  ...kernelRoutingRoutingCases,
  ...kernelRoutingBehaviourCases,
];

/**
 * Estimated share of routing requests per family (use-case landscape, "Proposed corpus weights"). U13 is behaviour,
 * not routing, and carries no weight. The tuning loop re-estimates these (D10).
 */
export const kernelRoutingFamilyShares: ReadonlyMap<KernelRoutingZoneId, number> = new Map([
  ['U1', 0.2],
  ['U2', 0.1],
  ['U3', 0.1],
  ['U4', 0.08],
  ['U5', 0.07],
  ['U6', 0.06],
  ['U7', 0.06],
  ['U8', 0.12],
  ['U9', 0.08],
  ['U10', 0.03],
  ['U11', 0.04],
  ['U12', 0.04],
]);
