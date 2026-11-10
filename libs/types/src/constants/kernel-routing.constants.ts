import { kernelConfigurations } from '#constants/kernel.constants.js';
import type { KernelId } from '#constants/kernel.constants.js';

/*
 * The routing rubric's data (automatic kernel selection blueprint D5): seven narrow rules the working agent obeys,
 * the use-case zones it chooses inside, and the kernels it reaches only by name. Renderings live in
 * `@taucad/chat/prompts` (`kernel-routing.ts`); change the rubric here, never in a rendering. Kernel order and
 * which kernels sit under the selector's More level are layout, not routing.
 */

/** The kernels whose exports include analytic STEP, in catalog order. @public */
export const exactGeometryKernelIds: readonly KernelId[] = kernelConfigurations
  .filter(({ exactGeometry }) => exactGeometry)
  .map(({ id }) => id);

/** The voxel and implicit kernels, in catalog order. @public */
export const voxelKernelIds: readonly KernelId[] = kernelConfigurations
  .filter(({ representation }) => representation === 'voxel')
  .map(({ id }) => id);

/** @public */
export type KernelRoutingRuleId =
  | 'ownership'
  | 'entitlement'
  | 'explicit-request'
  | 'required-output'
  | 'required-input'
  | 'process'
  | 'representation';

/**
 * One signal of a narrow rule and the kernels that survive it. `kernels` is empty when the survivors are decided at
 * admission (the project's owner, the host's list) or by the request (the kernel it names).
 *
 * @public
 */
export type KernelRoutingOutcome = {
  readonly when: string;
  readonly kernels: readonly KernelId[];
};

/**
 * A tier 1 rule: it removes kernels, and the agent obeys it. Rules apply in array order.
 *
 * @public
 */
export type KernelRoutingRule = {
  readonly id: KernelRoutingRuleId;
  readonly name: string;
  readonly outcomes: readonly KernelRoutingOutcome[];
  /** What the agent does when no survivor is available here. */
  readonly whenUnavailable?: string;
  /** Requests that look like this rule's signal and are not, which stay in the broad zones. */
  readonly doesNotFireOn?: string;
};

/** The use-case families of the use-case landscape, U1 to U13b. @public */
export type KernelRoutingZoneId =
  | 'U1'
  | 'U2'
  | 'U3'
  | 'U4'
  | 'U5'
  | 'U6'
  | 'U7'
  | 'U8'
  | 'U9'
  | 'U10'
  | 'U11'
  | 'U12'
  | 'U13a'
  | 'U13b';

/**
 * `narrow`: a rule fixes the acceptable set. `broad`: every acceptable kernel is a correct answer and the agent
 * chooses on the signals. `none`: no kernel serves the request (tier 3).
 *
 * @public
 */
export type KernelRoutingTier = 'narrow' | 'broad' | 'none';

/** A signal inside a zone that favours some of its acceptable kernels. @public */
export type KernelRoutingPreference = {
  readonly kernels: readonly KernelId[];
  readonly when: string;
};

/**
 * One row of the D5 matrix.
 *
 * @public
 */
export type KernelRoutingZone = {
  readonly id: KernelRoutingZoneId;
  readonly useCase: string;
  readonly tier: KernelRoutingTier;
  /** The narrow rules that fix this zone's set. */
  readonly rules: readonly KernelRoutingRuleId[];
  /** Every kernel that is a correct answer, before the host's list filters it. Empty for tier 3. */
  readonly acceptable: readonly KernelId[];
  readonly preferred: readonly KernelRoutingPreference[];
  /** What the agent states when it chooses in this zone, beyond the kernel and the reason. */
  readonly announce?: string;
};

const exact = exactGeometryKernelIds;
const voxel = voxelKernelIds;

/** The seven narrow rules, in the order they apply (D5 tier 1). @public */
export const kernelRoutingRules = [
  {
    id: 'ownership',
    name: 'Ownership',
    outcomes: [{ when: 'The project has an entry file', kernels: [] }],
  },
  {
    id: 'entitlement',
    name: 'Entitlement',
    outcomes: [{ when: 'Always: only the kernels available here', kernels: [] }],
  },
  {
    id: 'explicit-request',
    name: 'Explicit request',
    outcomes: [
      { when: 'A kernel named by name', kernels: [] },
      { when: 'Python', kernels: ['build123d', 'smlibpy'] },
      { when: 'C#', kernels: ['picogk'] },
      { when: 'KCL', kernels: ['zoo'] },
      { when: 'A `.scad` file', kernels: ['openscad'] },
    ],
    whenUnavailable: 'Say it is not available here and offer the nearest available kernel.',
  },
  {
    id: 'required-output',
    name: 'Required output',
    outcomes: [
      {
        when: 'STEP or an exact B-rep hand-off; standards-based or toleranced mating geometry (a thread, a gear, an H7 bore)',
        kernels: exact,
      },
      { when: 'A board, schematic, netlist, BOM or fabrication files', kernels: ['tscircuit'] },
      { when: 'A `.scad` file, or a MakerWorld or Thingiverse customiser', kernels: ['openscad'] },
    ],
  },
  {
    id: 'required-input',
    name: 'Required input',
    outcomes: [
      { when: 'An existing mesh to repair, combine or remix', kernels: ['manifold', 'openscad'] },
      { when: 'An existing mesh to offset, hollow or lattice', kernels: voxel },
    ],
  },
  {
    id: 'process',
    name: 'Process',
    outcomes: [
      { when: 'Machining, sheet metal or casting (moulding counts as casting) named in the request', kernels: exact },
    ],
  },
  {
    id: 'representation',
    name: 'Representation',
    outcomes: [
      {
        when: 'Computational engineering: lattices and graded infill, TPMS and gyroid cores, heat exchangers and cold plates, conformal and regenerative cooling channels, porous implants, topology-optimised and lightweighted structures, additive manifolds with blended internal passages',
        kernels: voxel,
      },
    ],
    doesNotFireOn: '"Lightweight" or "organic" alone, a plate of plain holes, a honeycomb drawn as a pattern',
  },
] as const satisfies readonly KernelRoutingRule[];

/** The D5 matrix, by use case. @public */
export const kernelRoutingZones = [
  {
    id: 'U1',
    useCase: 'Everyday functional prints: brackets, mounts, clips, organisers, spare parts',
    tier: 'broad',
    rules: [],
    acceptable: ['openscad', 'replicad', 'build123d'],
    preferred: [
      { kernels: ['openscad'], when: 'boxes, cylinders and holes; a script others will adjust' },
      {
        kernels: ['replicad'],
        when: 'edge fillets or chamfers, shells, snap fits, a fit to a bought part, a likely later STEP',
      },
    ],
  },
  {
    id: 'U2',
    useCase: 'Enclosures and housings',
    tier: 'broad',
    rules: [],
    acceptable: ['replicad', 'openscad', 'build123d'],
    preferred: [
      { kernels: ['replicad'], when: 'shelled walls, filleted corners, bosses, a board or supplier fit' },
      { kernels: ['openscad'], when: 'a plain box and lid' },
    ],
  },
  {
    id: 'U3',
    useCase: 'Standard mechanical components: gears, flanges, shafts, fasteners',
    tier: 'narrow',
    rules: ['required-output'],
    acceptable: ['replicad', 'opencascadejs', 'smlib', 'build123d', 'smlibpy', 'zoo'],
    preferred: [
      { kernels: ['opencascadejs'], when: 'an operation replicad lacks' },
      { kernels: ['smlib', 'smlibpy'], when: 'NURBS surfaces' },
      { kernels: ['build123d'], when: 'Python or existing Python code' },
      { kernels: ['replicad'], when: 'none of those' },
    ],
  },
  {
    id: 'U4',
    useCase: 'Parts for a manufacturing process (machining, sheet metal, casting)',
    tier: 'narrow',
    rules: ['required-output', 'process'],
    acceptable: ['replicad', 'opencascadejs', 'smlib', 'build123d', 'smlibpy', 'zoo'],
    preferred: [
      { kernels: ['opencascadejs'], when: 'an operation replicad lacks' },
      { kernels: ['smlib', 'smlibpy'], when: 'NURBS surfaces' },
      { kernels: ['build123d'], when: 'Python or existing Python code' },
      { kernels: ['replicad'], when: 'none of those' },
    ],
  },
  {
    id: 'U5',
    useCase: 'Assemblies and mechanisms in one domain',
    tier: 'narrow',
    rules: ['required-output'],
    acceptable: ['replicad', 'opencascadejs', 'build123d', 'zoo'],
    preferred: [
      { kernels: ['zoo'], when: 'the request itself describes a large assembly' },
      { kernels: ['build123d'], when: 'Python or existing Python code' },
      { kernels: ['replicad'], when: 'otherwise' },
    ],
  },
  {
    id: 'U6',
    useCase: 'Product and consumer forms',
    tier: 'broad',
    rules: [],
    acceptable: ['replicad', 'smlib', 'build123d', 'smlibpy', 'picovoxel'],
    preferred: [
      { kernels: ['replicad'], when: 'lofts, sweeps, revolves, STEP for tooling' },
      { kernels: ['smlib'], when: 'freeform NURBS surfaces' },
      { kernels: ['picovoxel'], when: 'blended or variable-wall forms made by printing' },
    ],
  },
  {
    id: 'U7',
    useCase: 'Organic and decorative forms',
    tier: 'broad',
    rules: [],
    acceptable: ['picovoxel', 'picogk', 'replicad', 'openscad'],
    preferred: [
      { kernels: ['picovoxel', 'picogk'], when: 'blended, branching, thickened, textured or bio-inspired forms' },
      { kernels: ['replicad'], when: 'a clean revolve or loft, or STEP' },
      { kernels: ['openscad'], when: 'geometric patterns, text, polyhedra' },
    ],
  },
  {
    id: 'U8',
    useCase: 'Computational engineering',
    tier: 'narrow',
    rules: ['representation'],
    acceptable: ['picovoxel', 'picogk'],
    preferred: [
      { kernels: ['picovoxel'], when: 'the work is in the browser, or in TypeScript' },
      {
        kernels: ['picogk'],
        when: 'on desktop, and C# is asked for, PicoGK or LEAP 71 C# code is reused, or the browser runs out of memory (`PICO_OUT_OF_MEMORY`)',
      },
    ],
    announce:
      'Model the whole additive part, ports, flanges and bosses included, in the voxel model. Say the output is a mesh (STL, GLB) with no STEP, and that the voxel size sets the thinnest wall. Ask when the request also needs STEP or a machined interface.',
  },
  {
    id: 'U9',
    useCase: 'Electronics',
    tier: 'narrow',
    rules: ['required-output'],
    acceptable: ['tscircuit'],
    preferred: [],
    announce: 'A board with an enclosure is two models: build the one asked for and name the other.',
  },
  {
    id: 'U10',
    useCase: 'Architectural elements, furniture, flat stock',
    tier: 'broad',
    rules: [],
    acceptable: ['replicad', 'openscad', 'build123d'],
    preferred: [
      { kernels: ['replicad'], when: 'dimensioned joinery and panels' },
      { kernels: ['openscad'], when: 'a scale or massing model' },
    ],
  },
  {
    id: 'U11',
    useCase: 'Teaching and simple shapes',
    tier: 'broad',
    rules: [],
    acceptable: ['openscad', 'replicad'],
    preferred: [
      { kernels: ['openscad'], when: 'the shortest readable script' },
      { kernels: ['replicad'], when: 'a lesson on sketches, fillets or STEP' },
    ],
    announce: 'A lesson about one kernel uses that kernel.',
  },
  {
    id: 'U12',
    useCase: 'From an existing mesh',
    tier: 'narrow',
    rules: ['required-input'],
    acceptable: ['manifold', 'openscad', 'picovoxel', 'picogk'],
    preferred: [
      { kernels: ['manifold'], when: 'repair and booleans' },
      { kernels: ['openscad'], when: 'a script around an imported mesh' },
      { kernels: ['picovoxel', 'picogk'], when: 'offset, hollow or lattice the mesh' },
    ],
  },
  {
    id: 'U13a',
    useCase: 'Stylised characters and figurines: mascots, chess pieces, low-detail creatures',
    tier: 'broad',
    rules: [],
    acceptable: ['picovoxel', 'picogk'],
    preferred: [{ kernels: ['picovoxel', 'picogk'], when: 'blended SDF shapes give one watertight printable body' }],
    announce: 'Say the result is stylised.',
  },
  {
    id: 'U13b',
    useCase:
      'Realistic sculpts (likeness, fine anatomy, hair, cloth), textured game assets, sculpted jewellery; BIM and IFC models',
    tier: 'none',
    rules: [],
    acceptable: [],
    preferred: [],
    announce:
      'Say so in a sentence, offer the nearest thing Tau can build (a stylised version, single architectural elements) and wait for a yes.',
  },
] as const satisfies readonly KernelRoutingZone[];

/**
 * Kernels in no zone: the agent uses them only when the request names them (D5, "JSCAD is reached only by name").
 *
 * @public
 */
export const kernelsReachedByNameOnly = ['jscad'] as const satisfies readonly KernelId[];
