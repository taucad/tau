import type { KernelId } from '@taucad/types/constants';
import { kernelRoutingDevelopmentCases } from '#testing/live/kernel-routing.cases.js';
import type { KernelRoutingCase, KernelRoutingFixture } from '#testing/live/kernel-routing.cases.js';

/**
 * The automatic kernel selection held-out set (blueprint AKS-3d, Appendix E): 40 routing cases in two gate strata of
 * 20, 10 must-ask, 10 entitlement traps, 10 migration traps and 10 manual-pick obedience cases.
 *
 * Written by an author who did not write the routing rubric, from blueprint D5, D6, D7 and Appendix C and the
 * use-case landscape, without reading the development prompts or the generated rubric text. It runs only at the gate
 * (after AKS-11), never by default and never inside a prompt: a live suite reaches it only through
 * {@link selectKernelRoutingCases} with `KERNEL_ROUTING_SET=heldout`. A case that informs a rubric change moves to
 * the development set and is replaced here.
 */

/** Which Appendix E slot a held-out case fills; the composition test counts these. */
export type KernelRoutingHeldOutBucket =
  // Stratum R
  | 'everyday-prints'
  | 'enclosures'
  | 'standard-components'
  | 'process-parts'
  | 'assemblies'
  | 'product-form'
  | 'organic'
  | 'architecture'
  | 'teaching'
  // Stratum N
  | 'computational-engineering'
  | 'electronics'
  | 'existing-mesh'
  | 'voxel-only-organic'
  | 'customiser-or-scad'
  | 'named-language'
  // Behaviour
  | 'conflicting-rules'
  | 'best-fit-unavailable'
  | 'out-of-scope'
  | 'entitlement'
  | 'migration'
  | 'obedience';

/** A held-out case: a development-shaped case plus the Appendix E slot it fills. @public */
export type KernelRoutingHeldOutCase = KernelRoutingCase & { readonly bucket: KernelRoutingHeldOutBucket };

const entryLess = { kind: 'entry-less' } as const;
const authored = 'Written for AKS-3d (held out) by an author independent of the rubric, 2026-11-10, from blueprint D5';

type HeldOutInput = Omit<KernelRoutingHeldOutCase, 'kind' | 'fixture' | 'preference' | 'provenance' | 'tier'> &
  Partial<Pick<KernelRoutingHeldOutCase, 'kind' | 'fixture' | 'preference' | 'provenance' | 'tier'>>;

const heldOut = (input: HeldOutInput): KernelRoutingHeldOutCase => ({
  kind: 'routing',
  fixture: entryLess,
  preference: 'auto',
  tier: 'broad',
  provenance: `${authored}; ${input.bucket}`,
  ...input,
});

const existing = (owner: KernelId, entryPath: string, noEntryText?: boolean): KernelRoutingFixture => ({
  kind: 'existing',
  owner,
  entryPath,
  ...(noEntryText ? { noEntryText } : {}),
});

// Acceptable sets per host, read from the D5 matrix and filtered by the Appendix C profiles.
const printsWeb = ['openscad', 'replicad'] as const;
const printsDesktop = ['openscad', 'replicad', 'build123d'] as const;
const exactWeb = ['replicad', 'opencascadejs', 'smlib'] as const;
const exactDesktop = ['replicad', 'opencascadejs', 'smlib', 'build123d', 'smlibpy'] as const;
const assemblyWeb = ['replicad', 'opencascadejs'] as const;
const assemblyDesktop = ['replicad', 'opencascadejs', 'build123d'] as const;
const voxelWeb = ['picovoxel'] as const;
const voxelDesktop = ['picovoxel', 'picogk'] as const;
/** Kernels the web cloud profile cannot route to: the closed supplier and the desktop-native runtimes. */
const notOnWeb = ['zoo', 'build123d', 'smlibpy', 'picogk'] as const;

/** Stratum R: 20 routing cases where replicad is acceptable. @public */
export const kernelRoutingHeldOutStratumR: readonly KernelRoutingHeldOutCase[] = [
  // Everyday prints (U1), 6
  heldOut({
    id: 'h-u1-bar-light-mount',
    bucket: 'everyday-prints',
    prompt:
      'Can you make a clamp-on mount for a bike headlight? My handlebar is 31.8 mm and the light has a standard GoPro-style three-prong fork. I want it to grip snugly with one M5 bolt and not rattle.',
    host: 'web',
    family: 'U1',
    acceptable: [...printsWeb],
    preferred: ['replicad'],
    heuristic: 'technical-replicad',
  }),
  heldOut({
    id: 'h-u1-spool-wall-holder',
    bucket: 'everyday-prints',
    prompt:
      'Simple wall holder for filament spools: a flat plate with two countersunk screw holes and a 30 mm round arm sticking out 80 mm. Nothing fancy, I just want to print a few.',
    host: 'web',
    family: 'U1',
    acceptable: [...printsWeb],
    preferred: ['openscad'],
    heuristic: 'simple-openscad',
  }),
  heldOut({
    id: 'h-u1-under-desk-headphone-hook',
    bucket: 'everyday-prints',
    prompt:
      'I want a headphone hook that clamps under the edge of my desk (desk is 25 mm thick). Rounded edges everywhere so it does not scratch the headband, and a thumb screw to tighten it.',
    host: 'desktop',
    family: 'U1',
    acceptable: [...printsDesktop],
    preferred: ['replicad', 'build123d'],
    heuristic: 'technical-replicad',
  }),
  heldOut({
    id: 'h-u1-battery-tray',
    bucket: 'everyday-prints',
    prompt:
      'Make me a drawer tray that holds batteries standing up: 12 AA and 8 AAA in a grid, slots a bit loose so they drop in easily. I want to be able to change the counts later.',
    host: 'plugin',
    family: 'U1',
    acceptable: [...printsDesktop],
    preferred: ['openscad'],
    heuristic: 'simple-openscad',
  }),
  heldOut({
    id: 'h-u1-curtain-rod-bracket-it',
    bucket: 'everyday-prints',
    prompt:
      'Mi serve un supporto per bastone da tenda da avvitare al muro: bastone da 20 mm di diametro, due viti da 4 mm, distanza dal muro circa 8 cm. Lo stampo in PETG.',
    host: 'web',
    family: 'U1',
    acceptable: [...printsWeb],
    language: 'it',
  }),
  heldOut({
    id: 'h-u1-dishwasher-rack-wheel',
    bucket: 'everyday-prints',
    prompt:
      'The little wheel on the bottom rack of my dishwasher snapped off. It is 24 mm across, 9 mm wide, and it clips onto a 3 mm wire axle. Could you model a replacement I can print?',
    host: 'web',
    family: 'U1',
    acceptable: [...printsWeb],
  }),
  // Enclosures (U2), 3
  heldOut({
    id: 'h-u2-weather-station-housing',
    bucket: 'enclosures',
    prompt:
      'I need a housing for an Arduino Nano weather station: 2 mm walls, filleted corners, four screw bosses for the board, louvred vents on one side and a lid that screws down. It sits outside under the eaves.',
    host: 'web',
    family: 'U2',
    acceptable: [...printsWeb],
    preferred: ['replicad'],
    heuristic: 'technical-replicad',
  }),
  heldOut({
    id: 'h-u2-garden-junction-box',
    bucket: 'enclosures',
    prompt:
      'Just a plain box with a lid for some garden lighting connectors, about 100 x 70 x 50 mm, with one 16 mm hole on each short side for cable glands.',
    host: 'web',
    family: 'U2',
    acceptable: [...printsWeb],
    preferred: ['openscad'],
    heuristic: 'simple-openscad',
  }),
  heldOut({
    id: 'h-u2-remote-shell',
    bucket: 'enclosures',
    prompt:
      'Design a two-part shell for a handheld remote, 140 x 45 mm, that snaps together with clips along the long sides. The top half needs cut-outs for six 12 mm buttons and the bottom a battery door for two AAA cells.',
    host: 'desktop',
    family: 'U2',
    acceptable: [...printsDesktop],
    preferred: ['replicad', 'build123d'],
    heuristic: 'technical-replicad',
  }),
  // Standard components (U3), 3
  heldOut({
    id: 'h-u3-gt2-pulley',
    bucket: 'standard-components',
    prompt:
      'GT2 timing pulley please: 20 teeth, for a 6 mm belt, 5 mm bore with a flat and a grub screw hole, flanges on both sides.',
    host: 'web',
    family: 'U3',
    tier: 'narrow',
    acceptable: [...exactWeb],
  }),
  heldOut({
    id: 'h-u3-threaded-shaft-collar',
    bucket: 'standard-components',
    prompt:
      'A split shaft collar for a 12 mm shaft, 25 mm outer diameter, clamped with an M4 cap screw. The M4 should be a real modelled thread, not just a hole.',
    host: 'desktop',
    family: 'U3',
    tier: 'narrow',
    acceptable: [...exactDesktop],
  }),
  heldOut({
    id: 'h-u3-keyed-coupling-nl',
    bucket: 'standard-components',
    prompt:
      'Ik zoek een askoppeling tussen een 8 mm motoras en een 10 mm spindel, met een spiebaan en een H7-boring aan beide kanten. Het moet echt passen, dus graag exacte maten.',
    host: 'web',
    family: 'U3',
    tier: 'narrow',
    acceptable: [...exactWeb],
    language: 'nl',
  }),
  // Parts for a process (U4), 2
  heldOut({
    id: 'h-u4-turned-nozzle',
    bucket: 'process-parts',
    prompt:
      'This will be turned on a lathe from brass bar: a nozzle 18 mm diameter, 30 mm long, with a 1/4" BSP thread on the back end and a 2 mm orifice at the tip. The machinist wants a model to program from.',
    host: 'web',
    family: 'U4',
    tier: 'narrow',
    acceptable: [...exactWeb],
  }),
  heldOut({
    id: 'h-u4-pedal-chassis-sheet',
    bucket: 'process-parts',
    prompt:
      'Folded 1.5 mm aluminium sheet chassis for a guitar pedal: a U shape 120 x 95 x 40 mm with tabs for the base plate, bend reliefs, and holes for two footswitches and four pots. It goes to a sheet-metal shop.',
    host: 'desktop',
    family: 'U4',
    tier: 'narrow',
    acceptable: [...exactDesktop],
  }),
  // Assemblies (U5), 2
  heldOut({
    id: 'h-u5-camera-slider-carriage',
    bucket: 'assemblies',
    prompt:
      'I am building a camera slider on 2020 aluminium extrusion. Model the carriage: a plate with four V-wheels on eccentric spacers riding the slot, a 1/4-20 mount on top, and the belt clamp. Show it sitting on a short length of the rail.',
    host: 'web',
    family: 'U5',
    tier: 'narrow',
    acceptable: [...assemblyWeb],
  }),
  heldOut({
    id: 'h-u5-folding-laptop-stand',
    bucket: 'assemblies',
    prompt:
      'A folding laptop stand with a top plate and two legs that swing out on pin hinges, with three detent angles. I want to see the parts assembled and be sure the hinge knuckles do not collide when folded flat.',
    host: 'desktop',
    family: 'U5',
    tier: 'narrow',
    acceptable: [...assemblyDesktop],
  }),
  // Product form (U6), organic (U7), architecture (U10), teaching (U11): one each
  heldOut({
    id: 'h-u6-espresso-tamper',
    bucket: 'product-form',
    prompt:
      'Design an espresso tamper: 58.5 mm flat base, and a handle that flows into it with a smooth waisted profile that fits the palm. I would like it to look like a real product, not a stack of cylinders.',
    host: 'web',
    family: 'U6',
    acceptable: ['replicad', 'smlib', 'picovoxel'],
    preferred: ['replicad', 'smlib'],
  }),
  heldOut({
    id: 'h-u7-fluted-candle-holder',
    bucket: 'organic',
    prompt:
      'A tealight holder with spiral flutes that twist 90 degrees from bottom to top, about 80 mm tall, base wider than the top. Clean and smooth, like turned glass.',
    host: 'web',
    family: 'U7',
    acceptable: ['picovoxel', 'replicad', 'openscad'],
    preferred: ['replicad'],
  }),
  heldOut({
    id: 'h-u10-plywood-bedside-table',
    bucket: 'architecture',
    prompt:
      'A small bedside table out of 12 mm birch plywood, 400 x 350 x 550 mm, with dado joints for one shelf and a back panel. Give me the panels with their real dimensions so I can cut them.',
    host: 'web',
    family: 'U10',
    acceptable: ['replicad', 'openscad'],
    preferred: ['replicad'],
  }),
  heldOut({
    id: 'h-u11-numbered-d12',
    bucket: 'teaching',
    prompt:
      'For my year 8 maths class: a dodecahedron die with the numbers 1 to 12 engraved on the faces, around 25 mm across. Keep the code short so I can show it on the projector.',
    host: 'web',
    family: 'U11',
    acceptable: ['openscad', 'replicad'],
    preferred: ['openscad'],
    heuristic: 'simple-openscad',
  }),
];

/** Stratum N: 20 routing cases where replicad is not acceptable. @public */
export const kernelRoutingHeldOutStratumN: readonly KernelRoutingHeldOutCase[] = [
  // Computational engineering (U8), 7
  heldOut({
    id: 'h-u8-printed-hydraulic-manifold',
    bucket: 'computational-engineering',
    prompt:
      'Replace our drilled hydraulic block with a printed one: one P inlet and four outlets, with the internal passages as smooth curved channels that blend into each other instead of cross-drilled holes, and only as much material around them as the 200 bar pressure needs.',
    host: 'web',
    family: 'U8',
    tier: 'narrow',
    acceptable: [...voxelWeb],
  }),
  heldOut({
    id: 'h-u8-graded-midsole',
    bucket: 'computational-engineering',
    prompt:
      'Running shoe midsole for a size 42, printed in TPU: a lattice that is dense and stiff under the heel and gets softer towards the forefoot, with a solid skin on the top surface.',
    host: 'web',
    family: 'U8',
    tier: 'narrow',
    acceptable: [...voxelWeb],
  }),
  heldOut({
    id: 'h-u8-helmet-liner',
    bucket: 'computational-engineering',
    prompt:
      'I want to replace the EPS foam in a bike helmet with a printed energy-absorbing liner: a conformal cell structure that follows the shell curvature, thicker cells at the crown, and ventilation paths left open through it.',
    host: 'desktop',
    family: 'U8',
    tier: 'narrow',
    acceptable: [...voxelDesktop],
  }),
  heldOut({
    id: 'h-u8-static-mixer-insert',
    bucket: 'computational-engineering',
    prompt:
      'A static mixer insert for a 25 mm pipe, 150 mm long, where the inside is a triply periodic minimal surface so two fluids get split and folded together as they pass through.',
    host: 'web',
    family: 'U8',
    tier: 'narrow',
    acceptable: [...voxelWeb],
  }),
  heldOut({
    id: 'h-u8-topology-drone-arm',
    bucket: 'computational-engineering',
    prompt:
      'Take a drone arm, 220 mm between the frame bolts and the motor mount, and lighten it the way topology optimisation would: remove material where it carries no load and leave organic struts. Target under 40 g in printed nylon.',
    host: 'desktop',
    family: 'U8',
    tier: 'narrow',
    acceptable: [...voxelDesktop],
  }),
  heldOut({
    id: 'h-u8-flame-arrestor-zh',
    bucket: 'computational-engineering',
    prompt:
      '我需要一个3D打印的金属阻火器芯，直径40毫米、长60毫米，内部是孔隙率从入口到出口逐渐变化的晶格结构，用于丙烷管路。',
    host: 'web',
    family: 'U8',
    tier: 'narrow',
    acceptable: [...voxelWeb],
    language: 'zh',
  }),
  heldOut({
    id: 'h-u8-acoustic-absorber-panel',
    bucket: 'computational-engineering',
    prompt:
      'A 200 x 200 x 30 mm sound absorbing tile for a home studio, printed, with an internal cellular structure whose cell size changes through the thickness so it soaks up a wider band of frequencies.',
    host: 'web',
    family: 'U8',
    tier: 'narrow',
    acceptable: [...voxelWeb],
  }),
  // Electronics (U9), 4
  heldOut({
    id: 'h-u9-usbc-power-board',
    bucket: 'electronics',
    prompt:
      'Small board that takes USB-C power and gives me 5 V on a screw terminal, with a polyfuse, a power LED and the two CC resistors so chargers actually turn on.',
    host: 'web',
    family: 'U9',
    tier: 'narrow',
    acceptable: ['tscircuit'],
    preferred: ['tscircuit'],
    heuristic: 'electronics-tscircuit',
  }),
  heldOut({
    id: 'h-u9-soil-moisture-shield',
    bucket: 'electronics',
    prompt:
      'Lay out an Uno-shaped shield with four capacitive soil moisture sensor headers, a small relay for a pump, and a flyback diode. I need the schematic and a BOM I can order from.',
    host: 'desktop',
    family: 'U9',
    tier: 'narrow',
    acceptable: ['tscircuit'],
    preferred: ['tscircuit'],
    heuristic: 'electronics-tscircuit',
  }),
  heldOut({
    id: 'h-u9-oled-encoder-breakout',
    bucket: 'electronics',
    prompt:
      'A breakout with a 0.96" I2C OLED header, a rotary encoder with push switch, pull-ups on SDA and SCL, and a 4-pin header to my microcontroller.',
    host: 'web',
    family: 'U9',
    tier: 'narrow',
    acceptable: ['tscircuit'],
    preferred: ['tscircuit'],
    heuristic: 'electronics-tscircuit',
  }),
  heldOut({
    id: 'h-u9-stepper-driver-carrier',
    bucket: 'electronics',
    prompt:
      'Carrier board for two StepStick stepper drivers with a 12 V barrel jack, a 100 uF bulk capacitor per driver and screw terminals for the motors. I want to send it off for fabrication.',
    host: 'plugin',
    family: 'U9',
    tier: 'narrow',
    acceptable: ['tscircuit'],
    preferred: ['tscircuit'],
    heuristic: 'electronics-tscircuit',
  }),
  // Existing mesh (U12), 2
  heldOut({
    id: 'h-u12-merge-downloaded-stls',
    bucket: 'existing-mesh',
    prompt:
      'I downloaded base.stl and topper.stl. Put the topper on the base, centred, merge them into one printable piece, and cut a 6 mm hole straight down through the middle for a dowel.',
    host: 'web',
    fixture: { kind: 'entry-less', files: ['base.stl', 'topper.stl'] },
    family: 'U12',
    tier: 'narrow',
    acceptable: ['manifold', 'openscad'],
  }),
  heldOut({
    id: 'h-u12-hollow-scanned-statue',
    bucket: 'existing-mesh',
    prompt:
      'scan.stl is a scan of a garden statue I want to print big. Hollow it out with 2.5 mm walls so it does not use a kilo of resin, and add a drain hole in the base.',
    host: 'web',
    fixture: { kind: 'entry-less', files: ['scan.stl'] },
    family: 'U12',
    tier: 'narrow',
    acceptable: ['manifold', 'openscad', 'picovoxel'],
    preferred: ['picovoxel'],
  }),
  // Voxel-only organic (U13a, stylised characters), 2
  heldOut({
    id: 'h-u13a-owl-mascot',
    bucket: 'voxel-only-organic',
    prompt:
      'A chubby cartoon owl for our team desk, about 60 mm tall, big round eyes, little tufts on its head, in one piece I can print without supports if possible.',
    host: 'web',
    family: 'U13a',
    acceptable: [...voxelWeb],
    preferred: ['picovoxel'],
    heuristic: 'organic-picovoxel',
  }),
  heldOut({
    id: 'h-u13a-cat-keyring',
    bucket: 'voxel-only-organic',
    prompt:
      'Make a cute sitting cat keyring, toy style, soft blobby shapes, with a loop on its back for the ring. About 35 mm.',
    host: 'desktop',
    family: 'U13a',
    acceptable: [...voxelDesktop],
    preferred: ['picovoxel', 'picogk'],
    heuristic: 'organic-picovoxel',
  }),
  // A customiser or .scad file, 2
  heldOut({
    id: 'h-u1-makerworld-cable-tag',
    bucket: 'customiser-or-scad',
    prompt:
      'I want to publish a cable label tag on MakerWorld with their Parametric Model Maker, so people can type their own text and pick the cable diameter. Make the model for that.',
    host: 'web',
    family: 'U1',
    tier: 'narrow',
    acceptable: ['openscad'],
    named: true,
  }),
  heldOut({
    id: 'h-u2-scad-project-box',
    bucket: 'customiser-or-scad',
    prompt:
      'Parametric project box with a sliding lid, inner size as variables. I need it as a .scad file because my makerspace only runs OpenSCAD on the laser PC.',
    host: 'desktop',
    family: 'U2',
    tier: 'narrow',
    acceptable: ['openscad'],
    named: true,
  }),
  // A named language, 3
  heldOut({
    id: 'h-u3-python-hex-standoff',
    bucket: 'named-language',
    prompt:
      'Write me a Python script for a parametric hex standoff: M3 internal thread at both ends, length and across-flats as parameters. I will be calling it from my own Python tooling.',
    host: 'desktop',
    family: 'U3',
    tier: 'narrow',
    acceptable: ['build123d', 'smlibpy'],
    named: true,
  }),
  heldOut({
    id: 'h-u1-csharp-knurled-knob',
    bucket: 'named-language',
    prompt:
      'I would like this in C#: a knurled thumb knob, 30 mm diameter, with a hex pocket for an M6 nut. I am learning C# for work and want to see a model written in it.',
    host: 'desktop',
    family: 'U1',
    tier: 'narrow',
    acceptable: ['picogk'],
    named: true,
  }),
  heldOut({
    id: 'h-u1-jscad-napkin-holder',
    bucket: 'named-language',
    prompt:
      'Our repo already uses @jscad/modeling, so please write it with JSCAD: a napkin holder, two upright walls 120 mm apart on a base, with a wave cut along the top edge.',
    host: 'web',
    family: 'U1',
    tier: 'narrow',
    acceptable: ['jscad'],
    named: true,
  }),
];

/** The 10 must-ask cases: conflicting narrow rules 4, best fit unavailable 3, out of scope 3. @public */
export const kernelRoutingHeldOutMustAsk: readonly KernelRoutingHeldOutCase[] = [
  heldOut({
    id: 'h-ask-gyroid-core-step-supplier',
    bucket: 'conflicting-rules',
    prompt:
      'Printed titanium heat sink with a gyroid core for an inverter. Our print bureau only accepts STEP files, so the deliverable has to be STEP.',
    host: 'web',
    kind: 'must-ask',
    tier: 'narrow',
    family: 'U8',
    acceptable: [],
  }),
  heldOut({
    id: 'h-ask-lattice-arm-machined-bore',
    bucket: 'conflicting-rules',
    prompt:
      'A robot arm link with a graded lattice inside to save weight. Both ends get finish-machined: bearing seats with an H7 fit, which the CNC shop will cut from the model.',
    host: 'desktop',
    kind: 'must-ask',
    tier: 'narrow',
    family: 'U8',
    acceptable: [],
  }),
  heldOut({
    id: 'h-ask-scad-with-iso-thread',
    bucket: 'conflicting-rules',
    prompt:
      'It has to be a .scad file for the Thingiverse Customizer, and it is a nut that must mate with real ISO M10 bolts at 6H tolerance, exact flanks, not an approximation.',
    host: 'web',
    kind: 'must-ask',
    tier: 'narrow',
    family: 'U3',
    acceptable: [],
  }),
  heldOut({
    id: 'h-ask-scan-to-step',
    bucket: 'conflicting-rules',
    prompt:
      'Here is bracket-scan.stl. Fix the holes and the broken corner, then send it as STEP so the machine shop can mill a steel one.',
    host: 'web',
    fixture: { kind: 'entry-less', files: ['bracket-scan.stl'] },
    kind: 'must-ask',
    tier: 'narrow',
    family: 'U12',
    acceptable: [],
  }),
  heldOut({
    id: 'h-ask-kcl-for-design-studio',
    bucket: 'best-fit-unavailable',
    prompt:
      'Our team works in Zoo Design Studio, so write the gearbox cover in KCL so I can open it there and keep editing it.',
    host: 'web',
    kind: 'must-ask',
    tier: 'narrow',
    family: 'U3',
    acceptable: [],
  }),
  heldOut({
    id: 'h-ask-build123d-pipeline-web',
    bucket: 'best-fit-unavailable',
    prompt:
      'We generate our fixtures with a build123d pipeline in CI. Add a new fixture plate as a build123d Python module that fits into that pipeline.',
    host: 'web',
    kind: 'must-ask',
    tier: 'narrow',
    family: 'U4',
    acceptable: [],
  }),
  heldOut({
    id: 'h-ask-leap71-code-reuse-web',
    bucket: 'best-fit-unavailable',
    prompt:
      'I have a LEAP 71 style C# project with my own ShapeKernel helpers for rocket nozzle cooling. Extend it with a second coolant manifold, reusing my existing C# classes as they are.',
    host: 'web',
    kind: 'must-ask',
    tier: 'narrow',
    family: 'U8',
    acceptable: [],
  }),
  heldOut({
    id: 'h-ask-dog-likeness-topper',
    bucket: 'out-of-scope',
    prompt:
      'Make a cake topper of my dog, a scruffy border terrier, so it looks exactly like him: the fur texture, his crooked ear, the lot.',
    host: 'web',
    kind: 'must-ask',
    tier: 'none',
    family: 'U13b',
    acceptable: [],
  }),
  heldOut({
    id: 'h-ask-textured-game-sword',
    bucket: 'out-of-scope',
    prompt:
      'Game-ready fantasy sword for Unity: low poly, UV unwrapped, with PBR textures for the worn leather grip and engraved runes on the blade.',
    host: 'desktop',
    kind: 'must-ask',
    tier: 'none',
    family: 'U13b',
    acceptable: [],
  }),
  heldOut({
    id: 'h-ask-sculpted-lion-ring',
    bucket: 'out-of-scope',
    prompt:
      'A signet ring with a sculpted lion head on top, realistic mane and face in high relief, for lost-wax casting in silver.',
    host: 'web',
    kind: 'must-ask',
    tier: 'none',
    family: 'U13b',
    acceptable: [],
  }),
];

/** The 10 entitlement traps: each prompt pulls towards a kernel the host does not entitle. @public */
export const kernelRoutingHeldOutEntitlement: readonly KernelRoutingHeldOutCase[] = [
  heldOut({
    id: 'h-ent-web-zoo-conveyor-line',
    bucket: 'entitlement',
    prompt:
      'Model the whole conveyor line, roughly 600 parts with rollers, frames and motors. It will be too heavy for the browser, so run it on the cloud GPU engine.',
    host: 'web',
    kind: 'entitlement',
    family: 'U5',
    tier: 'narrow',
    acceptable: [...assemblyWeb],
    forbidden: [...notOnWeb],
  }),
  heldOut({
    id: 'h-ent-web-zoo-pro-plan',
    bucket: 'entitlement',
    prompt: 'I just upgraded to Pro, so use Zoo for this one: a pillow block bearing housing for a 20 mm shaft.',
    host: 'web',
    kind: 'entitlement',
    family: 'U3',
    tier: 'narrow',
    acceptable: [...exactWeb],
    forbidden: [...notOnWeb],
  }),
  heldOut({
    id: 'h-ent-desktop-zoo-kcl',
    bucket: 'entitlement',
    prompt: 'Write this as KCL: a bolted pipe flange, DN50 PN16, with the standard bolt circle.',
    host: 'desktop',
    kind: 'entitlement',
    family: 'U3',
    tier: 'narrow',
    acceptable: [...exactDesktop],
    forbidden: ['zoo'],
  }),
  heldOut({
    id: 'h-ent-desktop-zoo-tab-crash',
    bucket: 'entitlement',
    prompt:
      'My last big model kept running out of memory, so do this one server-side on the GPU kernel: a gearbox with three stages, housing and all shafts.',
    host: 'desktop',
    kind: 'entitlement',
    family: 'U5',
    tier: 'narrow',
    acceptable: [...assemblyDesktop],
    forbidden: ['zoo'],
  }),
  heldOut({
    id: 'h-ent-plugin-zoo-flanges',
    bucket: 'entitlement',
    prompt:
      "I read that Zoo's model is tuned for flanges and brackets, so use that kernel: an L bracket, 4 mm thick, two slotted holes on each leg.",
    host: 'plugin',
    kind: 'entitlement',
    family: 'U1',
    acceptable: [...printsDesktop],
    forbidden: ['zoo'],
  }),
  heldOut({
    id: 'h-ent-web-build123d-by-name',
    bucket: 'entitlement',
    prompt: 'Use build123d for this: a bushing, 16 mm outside, 10 mm bore, 20 mm long, with a 1 mm chamfer both ends.',
    host: 'web',
    kind: 'entitlement',
    family: 'U3',
    tier: 'narrow',
    acceptable: [...exactWeb],
    forbidden: [...notOnWeb],
  }),
  heldOut({
    id: 'h-ent-web-picogk-native-memory',
    bucket: 'entitlement',
    prompt:
      'A gyroid lattice block, 150 mm cube, at 0.2 mm voxel size. That is a lot of voxels, so use native PicoGK rather than the browser one.',
    host: 'web',
    kind: 'entitlement',
    family: 'U8',
    tier: 'narrow',
    acceptable: [...voxelWeb],
    forbidden: [...notOnWeb],
  }),
  heldOut({
    id: 'h-ent-web-smlibpy-nurbs',
    bucket: 'entitlement',
    prompt: 'Do it in SMLibPy: a freeform computer mouse top shell with a NURBS surface, about 115 x 62 mm.',
    host: 'web',
    kind: 'entitlement',
    family: 'U6',
    acceptable: ['replicad', 'smlib', 'picovoxel'],
    forbidden: [...notOnWeb],
  }),
  heldOut({
    id: 'h-ent-web-python-notebook',
    bucket: 'entitlement',
    prompt:
      'I am going to paste the code into a Jupyter notebook afterwards, so Python please: a cable grommet for a 60 mm desk hole with a slot for the cables.',
    host: 'web',
    kind: 'entitlement',
    family: 'U1',
    acceptable: [...printsWeb],
    forbidden: [...notOnWeb],
  }),
  heldOut({
    id: 'h-ent-web-csharp-dotnet',
    bucket: 'entitlement',
    prompt:
      'Write it in C# targeting .NET 8: a lightweight bracket with a lattice infill between two bolt bosses 80 mm apart.',
    host: 'web',
    kind: 'entitlement',
    family: 'U8',
    tier: 'narrow',
    acceptable: [...voxelWeb],
    forbidden: [...notOnWeb],
  }),
];

/** The 10 migration traps: an existing model whose kernel the request tempts the agent to leave. @public */
export const kernelRoutingHeldOutMigration: readonly KernelRoutingHeldOutCase[] = [
  heldOut({
    id: 'h-own-openscad-flange-step',
    bucket: 'migration',
    prompt:
      'Add a mounting flange with four holes to the bottom, and I will probably want a STEP of it later for a supplier.',
    host: 'web',
    kind: 'existing',
    fixture: existing('openscad', 'main.scad'),
    family: 'U1',
    acceptable: ['openscad'],
  }),
  heldOut({
    id: 'h-own-replicad-dot-pattern',
    bucket: 'migration',
    prompt: 'Cover the front face with a grid of small embossed dots, 3 mm pitch, like a grip texture.',
    host: 'web',
    kind: 'existing',
    fixture: existing('replicad', 'main.ts'),
    family: 'U2',
    acceptable: ['replicad'],
  }),
  heldOut({
    id: 'h-own-manifold-involute-gear',
    bucket: 'migration',
    prompt: 'Swap the plain hub for a proper involute spur gear, module 1, 24 teeth, meshing with a 12 tooth pinion.',
    host: 'web',
    kind: 'existing',
    fixture: existing('manifold', 'main.ts'),
    family: 'U3',
    acceptable: ['manifold'],
  }),
  heldOut({
    id: 'h-own-picovoxel-threaded-port',
    bucket: 'migration',
    prompt: 'Add an inlet port on the side with an M14 x 1.5 internal thread for a hose fitting.',
    host: 'web',
    kind: 'existing',
    fixture: existing('picovoxel', 'main.ts'),
    family: 'U8',
    acceptable: ['picovoxel'],
  }),
  heldOut({
    id: 'h-own-jscad-true-fillets',
    bucket: 'migration',
    prompt: 'Round every outside edge with a proper 2 mm fillet, the way a real CAD tool would.',
    host: 'web',
    kind: 'existing',
    fixture: existing('jscad', 'main.ts'),
    family: 'U2',
    acceptable: ['jscad'],
  }),
  heldOut({
    id: 'h-own-opencascade-cadquery-habit',
    bucket: 'migration',
    prompt:
      'Add a 10 mm deep pocket on the top face, 30 x 20 mm with 3 mm corner radii. In CadQuery I would just do a workplane and cutBlind.',
    host: 'desktop',
    kind: 'existing',
    fixture: existing('opencascadejs', 'main.ts'),
    family: 'U4',
    acceptable: ['opencascadejs'],
  }),
  heldOut({
    id: 'h-own-smlib-lattice-inside',
    bucket: 'migration',
    prompt: 'Make the inside of this handle a lightweight lattice so it prints faster and lighter.',
    host: 'web',
    kind: 'existing',
    fixture: existing('smlib', 'main.ts'),
    family: 'U6',
    acceptable: ['smlib'],
  }),
  heldOut({
    id: 'h-own-openscad-coral-surface',
    bucket: 'migration',
    prompt: 'Give the vase a branching, coral-like surface that blends smoothly into the body.',
    host: 'web',
    kind: 'existing',
    fixture: existing('openscad', 'main.scad'),
    family: 'U7',
    acceptable: ['openscad'],
  }),
  heldOut({
    id: 'h-own-stale-picovoxel-plain-lid',
    bucket: 'migration',
    prompt: 'Now a plain flat lid for it, 3 mm thick, with a lip that drops into the opening.',
    host: 'web',
    kind: 'existing',
    fixture: existing('picovoxel', 'main.ts', true),
    family: 'U8',
    acceptable: ['picovoxel'],
  }),
  heldOut({
    id: 'h-own-stale-replicad-simple-holes',
    bucket: 'migration',
    prompt: 'Just add a row of five 4 mm holes along the back edge, nothing fancy.',
    host: 'desktop',
    kind: 'existing',
    fixture: existing('replicad', 'main.ts', true),
    family: 'U1',
    acceptable: ['replicad'],
  }),
];

/** The 10 obedience cases: a manual pick whose request's content suggests another kernel. @public */
export const kernelRoutingHeldOutObedience: readonly KernelRoutingHeldOutCase[] = [
  heldOut({
    id: 'h-pick-openscad-gear',
    bucket: 'obedience',
    prompt: 'A 32 tooth spur gear, module 1.5, 8 mm bore with a keyway, for the feed on my printer.',
    host: 'web',
    kind: 'obedience',
    preference: 'openscad',
    family: 'U3',
    acceptable: ['openscad'],
  }),
  heldOut({
    id: 'h-pick-replicad-gyroid',
    bucket: 'obedience',
    prompt: 'A 40 mm cube filled with a gyroid structure, walls about 1 mm.',
    host: 'web',
    kind: 'obedience',
    preference: 'replicad',
    family: 'U8',
    acceptable: ['replicad'],
  }),
  heldOut({
    id: 'h-pick-picovoxel-pipe-flange',
    bucket: 'obedience',
    prompt: 'A slip-on pipe flange for 48.3 mm tube, four M12 bolt holes on a 110 mm circle.',
    host: 'web',
    kind: 'obedience',
    preference: 'picovoxel',
    family: 'U3',
    acceptable: ['picovoxel'],
  }),
  heldOut({
    id: 'h-pick-manifold-vase',
    bucket: 'obedience',
    prompt: 'A tall vase with soft organic ripples that flow around it, 250 mm high.',
    host: 'web',
    kind: 'obedience',
    preference: 'manifold',
    family: 'U7',
    acceptable: ['manifold'],
  }),
  heldOut({
    id: 'h-pick-smlib-shelf-bracket',
    bucket: 'obedience',
    prompt: 'Plain shelf bracket, 150 by 150 mm, with a diagonal brace and two screw holes per leg.',
    host: 'web',
    kind: 'obedience',
    preference: 'smlib',
    family: 'U1',
    acceptable: ['smlib'],
  }),
  heldOut({
    id: 'h-pick-openscad-beside-replicad',
    bucket: 'obedience',
    prompt: 'Add a separate part to the project: a simple round spacer, 10 mm outside, 5 mm hole, 6 mm tall.',
    host: 'web',
    kind: 'obedience',
    preference: 'openscad',
    fixture: existing('replicad', 'main.ts'),
    family: 'U1',
    acceptable: ['openscad'],
  }),
  heldOut({
    id: 'h-pick-build123d-lattice-bracket',
    bucket: 'obedience',
    prompt: 'A bracket with a graded lattice core between the mounting holes to save weight.',
    host: 'desktop',
    kind: 'obedience',
    preference: 'build123d',
    family: 'U8',
    acceptable: ['build123d'],
  }),
  heldOut({
    id: 'h-pick-picogk-phone-stand',
    bucket: 'obedience',
    prompt: 'A basic phone stand, 70 degree lean, with a slot at the bottom for the charging cable.',
    host: 'desktop',
    kind: 'obedience',
    preference: 'picogk',
    family: 'U1',
    acceptable: ['picogk'],
  }),
  heldOut({
    id: 'h-pick-jscad-filleted-enclosure',
    bucket: 'obedience',
    prompt: 'Enclosure for a 60 x 40 mm board with 3 mm filleted edges, standoffs and a snap-on lid.',
    host: 'web',
    kind: 'obedience',
    preference: 'jscad',
    family: 'U2',
    acceptable: ['jscad'],
  }),
  heldOut({
    id: 'h-pick-smlibpy-blended-lamp',
    bucket: 'obedience',
    prompt:
      'A lamp shade that looks grown rather than built: branching ribs that melt into each other, about 200 mm tall.',
    host: 'desktop',
    kind: 'obedience',
    preference: 'smlibpy',
    family: 'U7',
    acceptable: ['smlibpy'],
  }),
];

/** The 40 held-out routing cases: stratum R then stratum N. @public */
export const kernelRoutingHeldOutRoutingCases: readonly KernelRoutingHeldOutCase[] = [
  ...kernelRoutingHeldOutStratumR,
  ...kernelRoutingHeldOutStratumN,
];

/** The 40 held-out behaviour cases. @public */
export const kernelRoutingHeldOutBehaviourCases: readonly KernelRoutingHeldOutCase[] = [
  ...kernelRoutingHeldOutMustAsk,
  ...kernelRoutingHeldOutEntitlement,
  ...kernelRoutingHeldOutMigration,
  ...kernelRoutingHeldOutObedience,
];

/** The whole held-out set, 80 cases. Runs only at the gate. @public */
export const kernelRoutingHeldOutCases: readonly KernelRoutingHeldOutCase[] = [
  ...kernelRoutingHeldOutRoutingCases,
  ...kernelRoutingHeldOutBehaviourCases,
];

/** The corpus a live run selects. */
export type KernelRoutingCaseSet = 'development' | 'heldout';

/**
 * The cases a live kernel routing run uses: the development set unless the held-out set is asked for by name
 * (`KERNEL_ROUTING_SET=heldout`), so the gate set never runs by default.
 *
 * @param set - The requested set; defaults to `KERNEL_ROUTING_SET`, else `development`.
 * @returns The selected cases.
 */
export const selectKernelRoutingCases = (
  set: string | undefined = process.env['KERNEL_ROUTING_SET'],
): readonly KernelRoutingCase[] => {
  if (set === undefined || set === '' || set === 'development') {
    return kernelRoutingDevelopmentCases;
  }
  if (set === 'heldout') {
    return kernelRoutingHeldOutCases;
  }
  throw new Error(`Unknown KERNEL_ROUTING_SET "${set}": use development or heldout.`);
};
