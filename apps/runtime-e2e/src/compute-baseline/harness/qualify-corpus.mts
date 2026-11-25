/**
 * Corpus of the compute-reuse qualification matrix (audit R5): seven Replicad examples, each with two
 * parameter edits (A and B), a scrub ladder, a comment-only source edit and a one-literal source edit.
 *
 * Six-axis-arm and planetary-gear-system use a pose parameter (a joint or input angle) for A, so their
 * A step is a pose edit. Every source edit is checked to match exactly once, so a drifted example fails
 * the run instead of silently degrading a source-edit step into a second base render.
 *
 * Sources are read from `libs/tau-examples` and copied into a scratch project; nothing here writes
 * production files.
 */
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { repoRoot } from './repo-root.mts';

export type SourceEdit = { readonly path: string; readonly from: string; readonly to: string };

export type QualifyModel = {
  readonly name: string;
  readonly mainFile: string;
  /** `base` is the example's defaults; A and B are the two edits of the matrix. */
  readonly params: {
    readonly base: Record<string, unknown>;
    readonly A: Record<string, unknown>;
    readonly B: Record<string, unknown>;
  };
  /** What kind of edit A is: a pose edit moves parts without changing their shape. */
  readonly editKind: 'parameter' | 'pose';
  /** One parameter dragged through these values, back to back, then committed at the last one. */
  readonly scrub: { readonly key: string; readonly values: readonly unknown[] };
  /** A one-literal edit that changes geometry (`code:literal`). */
  readonly literal: SourceEdit;
  /** Source directory when the model is a harness fixture rather than a Tau example. */
  readonly root?: string;
};

const examples = join(repoRoot, 'libs/tau-examples/src/kernels/replicad');

/** The seven-model matrix of the program's invariant I1, in the audit's order. */
export const qualifyModels: Record<string, QualifyModel> = {
  'gridfinity-box': {
    name: 'gridfinity-box',
    mainFile: 'main.ts',
    params: { base: {}, A: { enableMagnet: true }, B: { xSize: 3 } },
    editKind: 'parameter',
    scrub: { key: 'wallThickness', values: [1.3, 1.4, 1.5, 1.6, 1.7, 1.8] },
    literal: { path: 'main.ts', from: '  wallThickness: 1.2,', to: '  wallThickness: 1.6,' },
  },
  'stress-test': {
    name: 'stress-test',
    mainFile: 'main.ts',
    params: { base: {}, A: { loftHeight: 22 }, B: { baseLength: 130 } },
    editKind: 'parameter',
    scrub: { key: 'loftHeight', values: [19, 20, 21, 22, 23, 24] },
    literal: { path: 'main.ts', from: '  holeRadius: 3,', to: '  holeRadius: 3.5,' },
  },
  'spur-gearbox': {
    name: 'spur-gearbox',
    mainFile: 'main.ts',
    params: { base: {}, A: { inputAngle: 10 }, B: { coverLift: 20 } },
    editKind: 'parameter',
    scrub: { key: 'inputAngle', values: [2, 4, 6, 8, 10, 12] },
    literal: { path: 'main.ts', from: '  backlash: 0.18,', to: '  backlash: 0.24,' },
  },
  turbofan: {
    name: 'turbofan',
    mainFile: 'main.ts',
    params: { base: {}, A: { reverserTravel: 200 }, B: { vaneAngle: -20 } },
    editKind: 'parameter',
    scrub: { key: 'reverserTravel', values: [40, 80, 120, 160, 200, 240] },
    // One part: the outlet guide vane row moves 2 mm aft.
    literal: { path: 'main.ts', from: '  const x = 470;', to: '  const x = 472;' },
  },
  'bench-vise': {
    name: 'bench-vise',
    mainFile: 'main.ts',
    params: { base: {}, A: { opening: 80 }, B: { jawWidth: 140 } },
    editKind: 'parameter',
    scrub: { key: 'opening', values: [60, 65, 70, 75, 80, 85] },
    literal: { path: 'main.ts', from: '  guideClearance: 0.1,', to: '  guideClearance: 0.2,' },
  },
  'six-axis-arm': {
    name: 'six-axis-arm',
    mainFile: 'main.ts',
    params: { base: {}, A: { j2: 20 }, B: { reach: 600 } },
    editKind: 'pose',
    scrub: { key: 'j2', values: [5, 10, 15, 20, 25, 30] },
    literal: { path: 'main.ts', from: '  height: 300,', to: '  height: 320,' },
  },
  'planetary-gear-system': {
    name: 'planetary-gear-system',
    mainFile: 'main.ts',
    params: { base: {}, A: { inputAngle: 15 }, B: { faceWidth: 16 } },
    editKind: 'pose',
    scrub: { key: 'inputAngle', values: [3, 6, 9, 12, 15, 18] },
    // One part: the keyseat slot on the input shaft.
    literal: { path: 'main.ts', from: '  const keyseat = capsule(16, 5)', to: '  const keyseat = capsule(18, 5)' },
  },
};

/**
 * Harness fixtures that are not in the program's seven-model matrix but that a gate needs. `retained-operand`
 * keeps boolean operands alive and reuses them (and a module-scope shape across rebuilds), for the
 * history-independence gate of a change that makes booleans destructive or adds a live operation tier.
 */
export const qualifyFixtures: Record<string, QualifyModel> = {
  'retained-operand': {
    name: 'retained-operand',
    mainFile: 'main.ts',
    root: join(import.meta.dirname, 'fixtures/retained-operand'),
    params: { base: {}, A: { hole: 8 }, B: { offset: 16 } },
    editKind: 'parameter',
    scrub: { key: 'hole', values: [6.5, 7, 7.5, 8, 8.5, 9] },
    literal: { path: 'main.ts', from: 'makeBaseBox(p.width, 40, 10)', to: 'makeBaseBox(p.width, 44, 10)' },
  },
};

export const qualifyModelNames = Object.keys(qualifyModels);

/** A matrix model or a fixture by name. */
export const qualifyModelOf = (name: string): QualifyModel | undefined => qualifyModels[name] ?? qualifyFixtures[name];

/** Read an example's sources (TypeScript and JSON; GeoSpec files excluded) as a path-to-text map. */
export const readModelFiles = (
  model: QualifyModel,
  root = model.root ?? join(examples, model.name),
  prefix = '',
): Record<string, string> => {
  const files: Record<string, string> = {};
  for (const entry of readdirSync(root, { withFileTypes: true })) {
    if (entry.name.startsWith('.') || entry.name === 'node_modules') continue;
    const path = prefix + entry.name;
    if (entry.isDirectory()) Object.assign(files, readModelFiles(model, join(root, entry.name), `${path}/`));
    else if (/\.(?:ts|json)$/.test(entry.name) && !entry.name.endsWith('.geospec.ts'))
      files[path] = readFileSync(join(root, entry.name), 'utf8');
  }
  return files;
};

const applyOnce = (files: Record<string, string>, edit: SourceEdit): Record<string, string> => {
  const text = files[edit.path];
  if (text === undefined) throw new Error(`source edit: no file ${edit.path}`);
  const parts = text.split(edit.from);
  if (parts.length !== 2)
    throw new Error(
      `source edit: expected one match of ${JSON.stringify(edit.from)} in ${edit.path}, found ${parts.length - 1}`,
    );
  return { ...files, [edit.path]: parts.join(edit.to) };
};

/**
 * The model's files for a source state: `original`, `comment` (a comment-only edit, geometry-neutral)
 * or `literal` (the model's one-literal edit). Each state is derived from the original sources.
 */
export const sourceState = (
  model: QualifyModel,
  original: Record<string, string>,
  state: 'original' | 'comment' | 'literal',
): Record<string, string> => {
  if (state === 'original') return original;
  if (state === 'comment')
    return { ...original, [model.mainFile]: `${original[model.mainFile]}\n// qualification comment-only edit\n` };
  return applyOnce(original, model.literal);
};

/**
 * Matrix step tokens. `base`, `A`, `B` select a parameter set on the original sources; `comment` and
 * `literal` select a source state at base parameters; `original` restores the original sources.
 */
export type StepToken = 'base' | 'A' | 'B' | 'comment' | 'literal' | 'original';
export const stepTokens: readonly StepToken[] = ['base', 'A', 'B', 'comment', 'literal', 'original'];

/** The program's matrix sequence: base,A,base,B,base, then a comment-only edit, a literal edit and the revert. */
export const fullMatrixSteps: readonly StepToken[] = [
  'base',
  'A',
  'base',
  'B',
  'base',
  'comment',
  'literal',
  'original',
];

/** Resolve a token to the parameters and source state it renders. `original` renders base parameters. */
export const resolveStep = (model: QualifyModel, token: StepToken) => {
  switch (token) {
    case 'A':
    case 'B':
      return { parameters: model.params[token], source: 'original' as const };
    case 'comment':
    case 'literal':
      return { parameters: model.params.base, source: token };
    case 'base':
    case 'original':
      return { parameters: model.params.base, source: 'original' as const };
  }
};

/** The geometry a token renders, independent of the order it was reached in (comment renders the base geometry). */
export const geometryKey = (token: StepToken): string =>
  token === 'literal' ? 'literal' : token === 'A' || token === 'B' ? token : 'base';
