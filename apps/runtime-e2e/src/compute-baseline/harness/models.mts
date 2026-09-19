/** Model registry for the lane-b harness. Sources are copied read-only into scratch stores; nothing here edits production. */
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { hostLocalWorkspace, repoRoot } from './repo-root.mts';

export type Kernel = 'replicad' | 'build123d' | 'openrscad';
export type ModelSpec = {
  readonly name: string;
  readonly kernel: Kernel;
  readonly files: () => Record<string, string>;
  readonly mainFile: string;
  /** Parameter sets: base (cold/warm), late (affects only late features), early (affects the expensive prefix). */
  readonly params: {
    readonly base: Record<string, unknown>;
    readonly late: Record<string, unknown>;
    readonly early: Record<string, unknown>;
  };
  /** Unrelated source edit: returns a modified file map whose geometry is identical. */
  readonly unrelated: (files: Record<string, string>) => Record<string, string>;
  readonly notes: string;
};

const examples = join(repoRoot, 'libs/tau-examples/src/kernels');
const workspace = hostLocalWorkspace;

const readTree = (root: string, extensions: readonly string[], prefix = ''): Record<string, string> => {
  const files: Record<string, string> = {};
  for (const entry of readdirSync(root, { withFileTypes: true })) {
    if (entry.name.startsWith('.') || entry.name === 'node_modules' || entry.name === '__pycache__') continue;
    const path = prefix + entry.name;
    if (entry.isDirectory()) Object.assign(files, readTree(join(root, entry.name), extensions, path + '/'));
    else if (extensions.some((extension) => entry.name.endsWith(extension)))
      files[path] = readFileSync(join(root, entry.name), 'utf8');
  }
  return files;
};

const comment = (main: string, marker: string) => (files: Record<string, string>) => ({
  ...files,
  [main]: `${files[main]}\n${marker}\n`,
});

/** Spike-side v8 entry: the production `test-exports/block.ts` takes no parameters, so a late probe cut is appended here (never in production). */
const v8LateEntry = (part: string, builder: string, name: string) => `import { makeCylinder } from 'replicad';
import { Placement } from '../lib/frame.js';
import { ${builder} } from '../lib/${part}.js';
export const defaultParams = { probeRadius: 4, probeX: 250 };
export default function main(p = defaultParams) {
  const { shape, interfaces } = ${builder}(Placement.identity);
  const probed = shape.cut(makeCylinder(p.probeRadius, 400, [p.probeX, 0, -200], [0, 0, 1]));
  return [{ shape: probed, name: '${name}', interfaces, color: '#79808a', density: 7.2 }];
}
`;

/**
 * W0 fault-injection fixture (Tau-authored, no external rights): an exact known
 * shape built only from allow-listed compute-reuse operations
 * (`makeBox`/`makeCylinder` primitives, `cut` boolean, `translate` transform),
 * so its volume and bounding box are analytic and a wrong cached BRep is
 * detectable without any reference to the cache itself.
 *
 * Base geometry: 40 x 30 x 20 box minus a full-height cylinder of radius 5 on
 * the box centre, translated by (100, 0, 0).
 */
const parityBoxSource = `import { makeBox, makeCylinder } from 'replicad';
export const defaultParams = { boreRadius: 5, width: 40 };
export default function main(p = defaultParams) {
  const block = makeBox([0, 0, 0], [p.width, 30, 20]);
  const bore = makeCylinder(p.boreRadius, 60, [p.width / 2, 15, -20], [0, 0, 1]);
  return [{ shape: block.cut(bore).translate([100, 0, 0]), name: 'ParityBox', color: '#79808a' }];
}
`;

export const models: Record<string, ModelSpec> = {
  'parity-box': {
    name: 'parity-box',
    kernel: 'replicad',
    mainFile: 'main.ts',
    files: () => ({ 'main.ts': parityBoxSource }),
    params: { base: {}, late: { boreRadius: 7 }, early: { width: 52 } },
    unrelated: comment('main.ts', '// compute-baseline unrelated edit'),
    notes:
      'Exact known shape (box minus centred bore, translated) over the allow-listed primitive/boolean/transform ops. Analytic volume and bounds make the geometry oracle independent of the cache; cheap enough for fault injection and concurrency arms.',
  },
  'hollow-box': {
    name: 'hollow-box',
    kernel: 'replicad',
    mainFile: 'main.ts',
    files: () => readTree(join(examples, 'replicad/hollow-box'), ['.ts', '.json']),
    params: { base: {}, late: { thickness: 3 }, early: { width: 110 } },
    unrelated: comment('main.ts', '// lane-b unrelated edit'),
    notes:
      'Cheap negative control: one extrude + one shell (no allow-listed op except nothing; cache-on overhead must be ~0).',
  },
  'stress-test': {
    name: 'stress-test',
    kernel: 'replicad',
    mainFile: 'main.ts',
    files: () => readTree(join(examples, 'replicad/stress-test'), ['.ts', '.json']),
    params: { base: {}, late: { loftHeight: 22 }, early: { baseLength: 130 } },
    unrelated: comment('main.ts', '// lane-b unrelated edit'),
    notes:
      'Heavy sequential feature tree (fuse ribs, 30 circular cuts, grid cuts, pockets, lofts, sphere cuts, helical sweep, fillets, chamfer). Steps 10-11 (fillets) are try/catch and fail on this geometry (see trace `failed`), and the step-9 helical channel cut leaves the BRep unchanged (channelRadius edit = identical BRep digest), so the last effective parameterised feature is step 7 (corner lofts): late = loftHeight; steps 8 (hemisphere cuts), 10-11 (failing fillets, ~2.8 s wasted) and 12 (hard-coded chamfer) always recompute after it.',
  },
  drone: {
    name: 'drone',
    kernel: 'replicad',
    mainFile: 'main.ts',
    files: () => readTree(join(workspace, 'racing-drone-frame-fork'), ['.ts', '.json']),
    params: { base: {}, late: { wheelbase: 369 }, early: { propPitch: 120 } },
    unrelated: comment('main.ts', '// lane-b unrelated edit'),
    notes:
      'Racing drone (43 parts). wheelbase affects the frame plate + placements but not the lofted propellers/motors; propPitch changes the loft (expensive prefix).',
  },
  quadcopter: {
    name: 'quadcopter',
    kernel: 'replicad',
    mainFile: 'main.ts',
    files: () => readTree(join(workspace, 'quadcopter'), ['.ts', '.json', '.step']),
    params: { base: {}, late: { topPlateThicknessMm: 4 }, early: { wheelbaseMm: 250 } },
    unrelated: comment('main.ts', '// lane-b unrelated edit'),
    notes: 'Quadcopter workspace model (frame + COTS hardware).',
  },
  'v8-block': {
    name: 'v8-block',
    kernel: 'replicad',
    mainFile: 'test-exports/block.ts',
    files: () => readTree(join(examples, 'replicad/v8-engine-rev2'), ['.ts', '.json']),
    params: { base: {}, late: {}, early: {} },
    unrelated: comment('test-exports/block.ts', '// lane-b unrelated edit'),
    notes: 'V8 rev2 block (production entry, no parameters): cold/warm/unrelated only.',
  },
  'v8-block-late': {
    name: 'v8-block-late',
    kernel: 'replicad',
    mainFile: 'test-exports/lane-b-block.ts',
    files: () => ({
      ...readTree(join(examples, 'replicad/v8-engine-rev2'), ['.ts', '.json']),
      'test-exports/lane-b-block.ts': v8LateEntry('block', 'buildBlock', 'Block 1'),
    }),
    params: { base: {}, late: { probeRadius: 5 }, early: { probeX: 260 } },
    unrelated: comment('test-exports/lane-b-block.ts', '// lane-b unrelated edit'),
    notes:
      'V8 block + one spike-side trailing probe cut; late = probe radius (only the last cut changes). early here also only changes the last cut (no parameterised early feature exists in the production block).',
  },
  'v8-head': {
    name: 'v8-head',
    kernel: 'replicad',
    mainFile: 'test-exports/cylinder-head.ts',
    files: () => readTree(join(examples, 'replicad/v8-engine-rev2'), ['.ts', '.json']),
    params: { base: {}, late: {}, early: {} },
    unrelated: comment('test-exports/cylinder-head.ts', '// lane-b unrelated edit'),
    notes: 'V8 rev2 cylinder head (production entry, no parameters).',
  },
  'v8-brep-py': {
    name: 'v8-brep-py',
    kernel: 'build123d',
    mainFile: 'main.py',
    files: () => readTree(join(examples, 'build123d/v8-engine-brep'), ['.py']),
    params: { base: {}, late: { valve_cover_height: 60 }, early: { bore_pitch: 104 } },
    unrelated: comment('main.py', '# lane-b unrelated edit'),
    notes:
      'build123d V8 (bundled CPython toolchain). valve_cover_height only drives make_valve_cover (built last); bore_pitch drives crank stations/block/heads.',
  },
  'kitchen-sink': {
    name: 'kitchen-sink',
    kernel: 'openrscad',
    mainFile: 'main.scad',
    // Spike-side workaround for a production defect: grouped customizer parameters are sent to the engine as
    // `Group.name` (openrscad.kernel.ts flattenParameters), which the engine ignores (render_with_params: names are
    // top-level). Stripping the `/* [Group] */` headers leaves the geometry identical and lets flat params take effect.
    files: () => {
      const tree = readTree(join(examples, 'openscad/kitchen-sink'), ['.scad']);
      tree['main.scad'] = tree['main.scad']!.replace(/^\/\* \[[^\]]+\] \*\/\n/gm, '');
      return tree;
    },
    params: { base: {}, late: { label_text: 'Lane B' }, early: { length: 60 } },
    unrelated: comment('main.scad', '// lane-b unrelated edit'),
    notes:
      'OpenSCAD customizer kitchen sink (cheap); label_text only changes the trailing text extrude, length changes the base plate + pillar positions.',
  },
  'csg-grid': {
    name: 'csg-grid',
    kernel: 'openrscad',
    mainFile: 'main.scad',
    files: () => ({ 'main.scad': readFileSync(join(import.meta.dirname, 'fixtures/csg-grid.scad'), 'utf8') }),
    params: { base: {}, late: { lid_height: 6 }, early: { cells_x: 6 } },
    unrelated: comment('main.scad', '// lane-b unrelated edit'),
    notes:
      'Spike-authored gridfinity-style CSG model: unioned rounded bins differenced by hole/magnet patterns, then a late lid feature.',
  },
};

export const modelNames = Object.keys(models);
