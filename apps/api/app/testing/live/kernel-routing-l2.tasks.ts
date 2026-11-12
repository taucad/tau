import { kernelRoutingZones } from '@taucad/types/constants';
import type { KernelId, KernelRoutingZoneId } from '@taucad/types/constants';
import { tauMcpKernelProfile } from '@taucad/chat/prompts';

/**
 * The L2 tasks of the automatic kernel selection eval (blueprint AKS-3b, Appendix E): eight full turns on the host tool
 * registry `tau mcp` builds, each judged by a GeoSpec oracle the agent never sees. L1 asks which kernel a turn
 * chooses; L2 asks whether the chosen kernel then succeeds. Two tasks are computational engineering. Zoo is excluded,
 * because its benchmarking terms are unchecked (Appendix F), so the host is the `tau mcp` profile, which has no Zoo.
 *
 * Each oracle states the request's own numbers and nothing kernel-specific, so any kernel that meets the request
 * passes. `reference` and `wrong` are the instrument's own proof: the reference model, written in one acceptable
 * kernel, must pass its oracle, and the wrong model (a 10 mm cube in the same kernel) must fail it.
 */

/** A GeoSpec numeric claim: an exact value or a range. */
export type L2Numeric =
  | number
  | Readonly<{ greaterThanOrEqual?: number; lessThanOrEqual?: number; greaterThan?: number; lessThan?: number }>;

/** What a task's oracle checks, rendered into one GeoSpec file by {@link renderL2Oracle}. */
export type L2Oracle = Readonly<{
  boundingBox: Readonly<{ size: Readonly<{ x?: L2Numeric; y?: L2Numeric; z?: L2Numeric }>; tolerance: number }>;
  volume?: Readonly<{ value: L2Numeric; relativeTolerance?: number }>;
  /** One connected piece. Left out where a voxel boundary may leave islands. */
  singlePiece?: boolean;
  watertight?: boolean;
}>;

/** A model file the instrument writes itself, to prove the oracle. */
export type L2ModelFile = Readonly<{ path: string; source: string; kernel: KernelId }>;

/** One L2 task. @public */
export type L2Task = Readonly<{
  id: string;
  family: KernelRoutingZoneId;
  prompt: string;
  /** The family's acceptable kernels that `tau mcp` runs, reported beside the verdict and never gated here. */
  acceptable: readonly KernelId[];
  oracle: L2Oracle;
  reference: L2ModelFile;
  wrong: L2ModelFile;
}>;

/** The kernels a standalone `tau mcp` host runs: every catalog kernel but Zoo. */
export const l2Kernels: readonly KernelId[] = tauMcpKernelProfile.available;

/** A family's acceptable kernels on this host, from the routing zones themselves. */
const acceptableIn = (family: KernelRoutingZoneId): readonly KernelId[] =>
  (kernelRoutingZones.find(({ id }) => id === family)?.acceptable ?? []).filter((id) => l2Kernels.includes(id));

const wrongOpenscad = (path = 'main.scad'): L2ModelFile => ({ path, source: 'cube(10);\n', kernel: 'openscad' });
const wrongReplicad: L2ModelFile = {
  path: 'main.ts',
  source:
    "import { makeBaseBox } from 'replicad';\n\nexport default function main() {\n  return makeBaseBox(10, 10, 10);\n}\n",
  kernel: 'replicad',
};
const wrongPicovoxel: L2ModelFile = {
  path: 'main.ts',
  source: [
    "import type { Pico, Voxels } from 'picovoxel';",
    "import { BaseBox, localFrame } from 'picovoxel/shapekernel';",
    '',
    'export const defaultParams = { voxelSize: 0.5 };',
    'export default function main(pico: Pico): Voxels {',
    '  return new BaseBox(localFrame.identity, 10).voxConstruct(pico);',
    '}',
    '',
  ].join('\n'),
  kernel: 'picovoxel',
};

/** The eight tasks, in family order. @public */
export const l2Tasks: readonly L2Task[] = [
  {
    id: 'l2-u1-spacer',
    family: 'U1',
    prompt:
      'Make a round spacer for 3D printing: 20 mm outside diameter, an 8.4 mm through hole, 10 mm tall, standing on the XY plane with its axis along Z.',
    acceptable: acceptableIn('U1'),
    oracle: {
      boundingBox: { size: { x: 20, y: 20, z: 10 }, tolerance: 0.3 },
      volume: { value: 2587, relativeTolerance: 0.04 },
      singlePiece: true,
      watertight: true,
    },
    reference: {
      path: 'main.scad',
      source:
        '$fn = 128;\ndifference() {\n  cylinder(h = 10, d = 20);\n  translate([0, 0, -1]) cylinder(h = 12, d = 8.4);\n}\n',
      kernel: 'openscad',
    },
    wrong: wrongOpenscad(),
  },
  {
    id: 'l2-u1-angle-bracket',
    family: 'U1',
    prompt:
      'An L-shaped angle bracket to print: one leg 40 mm long and 30 mm wide lies flat on the XY plane, the other rises 40 mm along Z from one of its 30 mm edges, both legs 4 mm thick. No holes or fillets.',
    acceptable: acceptableIn('U1'),
    oracle: {
      boundingBox: { size: { x: 40, y: 30, z: 40 }, tolerance: 0.3 },
      volume: { value: 9120, relativeTolerance: 0.02 },
      singlePiece: true,
      watertight: true,
    },
    reference: {
      path: 'main.scad',
      source: 'union() {\n  cube([40, 30, 4]);\n  cube([4, 30, 40]);\n}\n',
      kernel: 'openscad',
    },
    wrong: wrongOpenscad(),
  },
  {
    id: 'l2-u2-open-box',
    family: 'U2',
    prompt:
      'An open-top project box, 80 × 50 × 30 mm outside (X × Y × Z), with 2 mm walls and a 2 mm floor, sitting on the XY plane. Sharp corners are fine.',
    acceptable: acceptableIn('U2'),
    oracle: {
      boundingBox: { size: { x: 80, y: 50, z: 30 }, tolerance: 0.3 },
      volume: { value: 22_112, relativeTolerance: 0.03 },
      singlePiece: true,
      watertight: true,
    },
    reference: {
      path: 'main.ts',
      source: [
        "import { makeBaseBox } from 'replicad';",
        '',
        'export default function main() {',
        "  return makeBaseBox(80, 50, 30).shell(2, (face) => face.inPlane('XY', 30));",
        '}',
        '',
      ].join('\n'),
      kernel: 'replicad',
    },
    wrong: wrongReplicad,
  },
  {
    id: 'l2-u3-mounting-plate',
    family: 'U3',
    prompt:
      'A 3 mm thick mounting plate, 100 × 60 mm, lying on the XY plane, with four 5 mm through holes whose centres are 8 mm in from both edges at each corner. I need a STEP file for the supplier afterwards.',
    acceptable: acceptableIn('U3'),
    oracle: {
      boundingBox: { size: { x: 100, y: 60, z: 3 }, tolerance: 0.3 },
      volume: { value: 17_764, relativeTolerance: 0.01 },
      singlePiece: true,
      watertight: true,
    },
    reference: {
      path: 'main.ts',
      source: [
        "import { makeBaseBox, makeCylinder } from 'replicad';",
        '',
        'export default function main() {',
        '  let plate = makeBaseBox(100, 60, 3);',
        '  for (const [x, y] of [[-42, -22], [42, -22], [42, 22], [-42, 22]] as const) {',
        '    plate = plate.cut(makeCylinder(2.5, 3, [x, y, 0], [0, 0, 1]));',
        '  }',
        '  return plate;',
        '}',
        '',
      ].join('\n'),
      kernel: 'replicad',
    },
    wrong: wrongReplicad,
  },
  {
    id: 'l2-u4-stepped-shaft',
    family: 'U4',
    prompt:
      'A turned shaft along Z for the lathe: 12 mm diameter and 60 mm long, stepping down to 8 mm diameter for its last 20 mm, so 80 mm overall. Export it as STEP.',
    acceptable: acceptableIn('U4'),
    oracle: {
      boundingBox: { size: { x: 12, y: 12, z: 80 }, tolerance: 0.3 },
      volume: { value: 7791, relativeTolerance: 0.03 },
      singlePiece: true,
      watertight: true,
    },
    reference: {
      path: 'main.ts',
      source: [
        "import { makeCylinder } from 'replicad';",
        '',
        'export default function main() {',
        '  return makeCylinder(6, 60, [0, 0, 0], [0, 0, 1]).fuse(makeCylinder(4, 20, [0, 0, 60], [0, 0, 1]));',
        '}',
        '',
      ].join('\n'),
      kernel: 'replicad',
    },
    wrong: wrongReplicad,
  },
  {
    id: 'l2-u7-vase',
    family: 'U7',
    prompt:
      'A smooth vase to print in vase mode: 150 mm tall along Z, 80 mm across at its widest, open at the top, with a 2 mm wall and a closed 2 mm base.',
    acceptable: acceptableIn('U7'),
    oracle: {
      boundingBox: {
        size: {
          x: { greaterThanOrEqual: 76, lessThanOrEqual: 84 },
          y: { greaterThanOrEqual: 76, lessThanOrEqual: 84 },
          z: 150,
        },
        tolerance: 1,
      },
      /* No connected-components claim: GeoSpec refuses it on the sliver triangles an OpenSCAD revolve leaves, and a
       * refusal is not a geometry verdict. */
      watertight: true,
    },
    reference: {
      path: 'main.scad',
      source:
        '$fn = 96;\nrotate_extrude()\n  polygon([[0, 0], [30, 0], [40, 50], [32, 120], [28, 150], [26, 150], [30, 120], [38, 50], [28, 2], [0, 2]]);\n',
      kernel: 'openscad',
    },
    wrong: wrongOpenscad(),
  },
  {
    id: 'l2-u8-bcc-lattice',
    family: 'U8',
    prompt:
      'A 40 mm cube of body-centred cubic beam lattice for metal printing: 10 mm cells, beams about 1.5 mm thick, the cube spanning 0 to 40 mm on each axis.',
    acceptable: acceptableIn('U8'),
    oracle: {
      boundingBox: { size: { x: 40, y: 40, z: 40 }, tolerance: 2 },
      volume: { value: { greaterThanOrEqual: 1920, lessThanOrEqual: 32_000 } },
    },
    reference: {
      path: 'main.ts',
      source: [
        "import type { Pico, Voxels } from 'picovoxel';",
        '',
        'export const defaultParams = { voxelSize: 0.25 };',
        'export default function main(pico: Pico): Voxels {',
        '  const lattice = pico.createLattice();',
        '  const cell = 10;',
        '  const radius = 0.75;',
        '  for (let i = 0; i < 4; i += 1) {',
        '    for (let j = 0; j < 4; j += 1) {',
        '      for (let k = 0; k < 4; k += 1) {',
        '        const centre: [number, number, number] = [(i + 0.5) * cell, (j + 0.5) * cell, (k + 0.5) * cell];',
        '        for (const [dx, dy, dz] of [[0, 0, 0], [1, 0, 0], [0, 1, 0], [1, 1, 0], [0, 0, 1], [1, 0, 1], [0, 1, 1], [1, 1, 1]]) {',
        '          const corner: [number, number, number] = [(i + dx) * cell, (j + dy) * cell, (k + dz) * cell];',
        '          lattice.addBeam({ start: centre, end: corner, startRadius: radius, endRadius: radius, roundCap: true });',
        '        }',
        '      }',
        '    }',
        '  }',
        '  return lattice.toVoxels();',
        '}',
        '',
      ].join('\n'),
      kernel: 'picovoxel',
    },
    wrong: wrongPicovoxel,
  },
  {
    id: 'l2-u8-gyroid-core',
    family: 'U8',
    prompt:
      'A cylindrical heat-exchanger core, 30 mm diameter and 30 mm tall along Z from the XY plane, filled with a gyroid of 6 mm period and 0.8 mm walls.',
    acceptable: acceptableIn('U8'),
    oracle: {
      boundingBox: { size: { x: 30, y: 30, z: 30 }, tolerance: 2 },
      volume: { value: { greaterThanOrEqual: 2000, lessThanOrEqual: 15_000 } },
    },
    reference: {
      path: 'main.ts',
      source: [
        "import type { Pico, Voxels } from 'picovoxel';",
        "import { BaseCylinder, ImplicitGyroid, localFrame } from 'picovoxel/shapekernel';",
        '',
        'export const defaultParams = { voxelSize: 0.25 };',
        'export default function main(pico: Pico): Voxels {',
        '  const core = new BaseCylinder(localFrame.identity, 30, 15).voxConstruct(pico);',
        '  return core.maskedByImplicit({ sdf: new ImplicitGyroid(6, 0.8).expression });',
        '}',
        '',
      ].join('\n'),
      kernel: 'picovoxel',
    },
    wrong: wrongPicovoxel,
  },
];

const literal = (value: unknown): string => JSON.stringify(value);

/**
 * The oracle as one GeoSpec file: one test per claim, so a verdict names the claim that failed.
 *
 * @param input - The task's oracle and the entry the turn wrote, relative to the project root.
 * @returns GeoSpec source.
 * @public
 */
export const renderL2Oracle = (input: Readonly<{ id: string; oracle: L2Oracle; entryPath: string }>): string => {
  const { oracle } = input;
  const claims: string[] = [
    `it('has the requested envelope', async () => {\n    expectGeo(await load()).toHaveBoundingBox(${literal(oracle.boundingBox)});\n  });`,
  ];
  if (oracle.volume !== undefined) {
    claims.push(
      `it('has the requested volume', async () => {\n    expectGeo(await load()).toHaveVolume(${literal(oracle.volume)});\n  });`,
    );
  }
  if (oracle.singlePiece === true) {
    claims.push(
      `it('is one piece', async () => {\n    expectGeo(await load()).toHaveConnectedComponents({ count: 1 });\n  });`,
    );
  }
  if (oracle.watertight === true) {
    claims.push(`it('is watertight', async () => {\n    expectGeo(await load()).toBeWatertight();\n  });`);
  }
  return [
    "import { describe, expectGeo, it } from 'geospec';",
    "import { loadModel } from 'geospec/model';",
    '',
    `const load = async () => loadModel({ file: ${literal(input.entryPath)} });`,
    '',
    `describe(${literal(input.id)}, () => {`,
    ...claims.map((claim) => `  ${claim}`),
    '});',
    '',
  ].join('\n');
};
