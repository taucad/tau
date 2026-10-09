import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterAll, describe, expect, it } from 'vitest';

import { extractTypescriptApi } from '#languages/typescript/extract.js';
import { flattenEntries } from '#model/api-corpus.js';
import type { ApiCorpus, ApiEntry } from '#model/api-corpus.types.js';

const workspaceRoot = join(import.meta.dirname, '../../../../..');

/** Read from the installed tree, not `require.resolve`: several packages hide `package.json` behind `exports`. */
const packageVersion = (packageDirectory: string): string =>
  (JSON.parse(readFileSync(join(packageDirectory, 'package.json'), 'utf8')) as { version: string }).version;

/**
 * `manifold-3d` is a transitive dependency with no link in any project's
 * `node_modules`, so resolve it out of the pnpm store.
 */
const manifoldDirectory = ((): string | undefined => {
  const store = join(workspaceRoot, 'node_modules/.pnpm');
  if (!existsSync(store)) {
    return undefined;
  }
  const match = readdirSync(store).find((name) => name.startsWith('manifold-3d@'));
  return match === undefined ? undefined : join(store, match, 'node_modules/manifold-3d');
})();

const duplicateNames = (entries: readonly ApiEntry[]): string[] => {
  const counts = new Map<string, number>();
  for (const entry of entries) {
    counts.set(entry.name, (counts.get(entry.name) ?? 0) + 1);
  }
  return [...counts].filter(([, count]) => count > 1).map(([name]) => name);
};

describe('extractTypescriptApi over replicad', () => {
  const entryPoint = join(workspaceRoot, 'node_modules/replicad/dist/replicad.d.ts');
  const corpus: ApiCorpus = extractTypescriptApi({
    packageName: 'replicad',
    packageVersion: packageVersion(join(workspaceRoot, 'node_modules/replicad')),
    entryPoints: [entryPoint],
  });

  it('emits one entry per exported name, with no duplicates', () => {
    // 223 is what `checker.getExportsOfModule` reports for replicad 1.1's
    // bundle; a syntactic count would add 17 bare `declare` statements that the
    // module never exports.
    expect(corpus.entries).toHaveLength(223);
    expect(new Set(corpus.entries.map((entry) => entry.name)).size).toBe(223);
    expect(duplicateNames(corpus.entries)).toStrictEqual([]);
  });

  it('emits nothing for non-exported ambient declarations', () => {
    const source = readFileSync(entryPoint, 'utf8');
    // Names the syntactic extractor admitted through `ModifierFlags.Ambient`.
    const ambientOnly = [
      'ApproximationOptions',
      'CartesianAxis',
      'CoordSystem',
      'FaceOrEdge',
      'Finder',
      'Finder3d',
      'GenericTopo',
      'Offset2DConfig',
      'PhysicalProperties',
      'PlaneConfig',
      'ShapeExtremumFilter',
      'SplineTangent',
      'StandardPlane',
      'StartSplineTangent',
      'TOPOLOGY_KINDS',
      'TopologyKind',
      'UVBounds',
    ];
    for (const name of ambientOnly) {
      expect(source).toMatch(new RegExp(`^declare (?:type|interface|class|abstract class|const) ${name}\\b`, 'mu'));
    }

    const emitted = new Set(corpus.entries.map((entry) => entry.name));
    expect(ambientOnly.filter((name) => emitted.has(name))).toStrictEqual([]);
  });

  it('carries every overload on one entry instead of duplicating it', () => {
    const overloaded = ['complexExtrude', 'genericSweep', 'makePlane', 'twistExtrude'];
    for (const name of overloaded) {
      const matches = corpus.entries.filter((entry) => entry.name === name);
      expect(matches).toHaveLength(1);
      expect(matches[0]?.signatures?.length ?? 0).toBeGreaterThan(1);
    }
    expect(corpus.entries.find((entry) => entry.name === 'makePlane')?.signatures).toHaveLength(4);
  });

  it('keeps JSDoc prose that the printer-based extractors stripped', () => {
    const documented = corpus.entries.filter((entry) => (entry.docs?.summary ?? '') !== '');
    expect(documented.length).toBeGreaterThan(0);
    expect(documented.length).toBeGreaterThan(40);
  });

  it('marks optional parameters and keeps verbatim signature text', () => {
    const optional = [...flattenEntries(corpus)].flatMap(
      (entry) =>
        entry.signatures?.flatMap((signature) => signature.parameters.filter((parameter) => parameter.optional)) ?? [],
    );
    expect(optional.length).toBeGreaterThan(0);

    const drawCircle = corpus.entries.find((entry) => entry.name === 'drawCircle');
    expect(drawCircle?.signatures?.[0]?.text).toContain('drawCircle');
    expect(drawCircle?.signatures?.[0]?.text).not.toContain('/**');
  });

  it('should render aliased exports under their exported name', () => {
    const textOf = (name: string): string | undefined =>
      corpus.entries.find((entry) => entry.name === name)?.signatures?.[0]?.text;
    expect(textOf('makeCylinder')).toBe(
      'export declare function makeCylinder(radius: number, height: number, location?: Point, direction?: Direction): Solid;',
    );
    expect(textOf('makeDirection')).toBe('export declare function makeDirection(direction: Direction): Point;');
  });

  it('addresses class members individually, with source locations', () => {
    const sketch = corpus.entries.find((entry) => entry.name === 'Sketch');
    expect(sketch?.kind).toBe('class');
    expect(sketch?.members?.length ?? 0).toBeGreaterThan(5);
    for (const member of sketch?.members ?? []) {
      expect(member.id).toMatch(/^typescript:Sketch\./u);
      expect(member.path).toBe('Sketch');
      expect(member.visibility).toBeDefined();
      expect(member.source?.file).toBe('replicad/dist/replicad.d.ts');
      expect(member.source?.line ?? 0).toBeGreaterThan(0);
    }
  });

  it('derives its metadata from the run rather than hand counts', () => {
    expect(corpus.metadata.language).toBe('typescript');
    expect(corpus.metadata.extractor).toMatch(/^TypeScript \d/u);
    expect(corpus.metadata.totalEntries).toBe([...flattenEntries(corpus)].length);
  });
});

describe('extractTypescriptApi over @jscad/modeling', () => {
  const corpus = extractTypescriptApi({
    packageName: '@jscad/modeling',
    packageVersion: packageVersion(join(workspaceRoot, 'node_modules/@jscad/modeling')),
    entryPoints: [join(workspaceRoot, 'node_modules/@jscad/modeling/src/index.d.ts')],
  });

  it('preserves namespaces as the members path', () => {
    const namespaces = corpus.entries.filter((entry) => entry.kind === 'namespace');
    expect(namespaces.length).toBeGreaterThanOrEqual(14);

    const primitives = namespaces.find((entry) => entry.name === 'primitives');
    expect(primitives?.members?.length ?? 0).toBeGreaterThan(10);
    expect(primitives?.members?.every((member) => member.path === 'primitives')).toBe(true);
    expect(primitives?.members?.find((member) => member.name === 'cube')?.id).toBe('typescript:primitives.cube');
  });

  it('reaches nested namespaces', () => {
    const maths = corpus.entries.find((entry) => entry.name === 'maths');
    const vec3 = maths?.members?.find((member) => member.name === 'vec3');
    expect(vec3?.kind).toBe('namespace');
    expect(vec3?.members?.find((member) => member.name === 'add')?.id).toBe('typescript:maths.vec3.add');
  });

  it('emits unique ids across every namespace', () => {
    const ids = [...flattenEntries(corpus)].map((entry) => entry.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});

describe('extractTypescriptApi over manifold-3d', () => {
  it.runIf(manifoldDirectory !== undefined)('extracts its classes with members', () => {
    const packageDirectory = manifoldDirectory ?? '';
    const corpus = extractTypescriptApi({
      packageName: 'manifold-3d',
      packageVersion: packageVersion(packageDirectory),
      entryPoints: [join(packageDirectory, 'manifold.d.ts')],
    });

    expect(corpus.entries.length).toBeGreaterThan(5);
    expect(duplicateNames(corpus.entries)).toStrictEqual([]);

    const manifold = corpus.entries.find((entry) => entry.name === 'Manifold');
    expect(manifold?.kind).toBe('class');
    expect(manifold?.members?.length ?? 0).toBeGreaterThan(20);
    expect(manifold?.members?.some((member) => member.static === true)).toBe(true);
    expect([...flattenEntries(corpus)].some((entry) => (entry.docs?.summary ?? '') !== '')).toBe(true);
  });
});

/**
 * Declaration bundles cannot carry parameter initializers, `@deprecated`
 * replacement text or accessor modifiers all at once, so the fields the old
 * model dropped are exercised against a real source module the checker
 * compiles from operating-system temporary storage.
 */
describe('extractTypescriptApi over a source module', () => {
  const directory = mkdtempSync(join(tmpdir(), 'tau-api-extractor-'));
  const entryPoint = join(directory, 'index.ts');
  writeFileSync(
    entryPoint,
    `/**
 * Build a box.
 *
 * The second paragraph becomes remarks.
 *
 * @param size - Edge length.
 * @param mode - How to combine it.
 * @deprecated Use makeSolidBox instead.
 * @throws {@link Failure} when geometry cannot be exported or
 * parsed, or when no engine is registered.
 * @throws {RangeError} when size is negative.
 * @throws When the input cannot be read.
 * @example <caption>A unit box</caption>
 * \`\`\`typescript
 * makeBox(1);
 * \`\`\`
 */
export function makeBox(size: number = 1, mode: string = 'add', ...rest: number[]): string {
  return \`\${size}\${mode}\${rest.length}\`;
}

export class Shape {
  static readonly origin: string = 'origin';
  protected tolerance = 0.001;
  private hidden = 1;
  /** Move the shape. */
  translate(delta: number = 0): Shape {
    return this;
  }
  get volume(): number {
    return 0;
  }
}

export const scale: {
  (factor: number): string;
  (x: number, y: number): string;
} = (() => '') as never;

export declare const suite: {
  <T>(name: string, callback: () => T): T;
  skip(name: string, callback?: () => void): void;
  only(name: string, callback: () => void): void;
};
export type Matcher = {
  toMatch(expected: string): boolean;
  toMatch(expected: number): boolean;
};
export declare class Failure extends Error {
  constructor(message: string);
  constructor(code: number, message: string);
}
export declare function task<T>(callback: () => T): T;
export declare namespace task {
  function skip(callback?: () => void): void;
  function only(callback: () => void): void;
}
export { task as first, task as second };
export declare const makeCylinder: <T>(radius: number, height?: T) => string;
export declare function resolveDirection(direction: string): number;
export declare const makeDirection: typeof resolveDirection;
export const halve = (value: number = 2): number => value / 2;
export declare namespace cyclic {
  export import self = cyclic;
  export function read(): string;
}
`,
  );

  const corpus = extractTypescriptApi({
    packageName: 'fixture',
    packageVersion: '0.0.0',
    entryPoints: [entryPoint],
    groupBy: ({ kind }) => (kind === 'class' ? 'shapes' : 'operations'),
  });

  afterAll(() => {
    rmSync(directory, { recursive: true, force: true });
  });

  it('records default parameter values as source text', () => {
    const [signature] = corpus.entries.find((entry) => entry.name === 'makeBox')?.signatures ?? [];
    expect(signature?.parameters.map((parameter) => parameter.defaultValue)).toStrictEqual(['1', "'add'", undefined]);
    expect(signature?.parameters.map((parameter) => parameter.optional)).toStrictEqual([true, true, false]);
    expect(signature?.parameters.at(-1)?.variadic).toBe(true);
    expect(signature?.parameters[0]?.description).toBe('Edge length.');
    expect(signature?.returnType?.text).toBe('string');
  });

  it('splits JSDoc into summary, remarks, examples and deprecation', () => {
    const makeBox = corpus.entries.find((entry) => entry.name === 'makeBox');
    expect(makeBox?.docs?.summary).toBe('Build a box.');
    expect(makeBox?.docs?.remarks).toBe('The second paragraph becomes remarks.');
    expect(makeBox?.docs?.examples).toStrictEqual([{ caption: 'A unit box', code: 'makeBox(1);' }]);
    expect(makeBox?.deprecated).toBe('Use makeSolidBox instead.');
    expect(makeBox?.category).toBe('operations');
  });

  it('should preserve throws links, types and multiline conditions', () => {
    const makeBox = corpus.entries.find((entry) => entry.name === 'makeBox');
    expect(makeBox?.docs?.throws).toEqual([
      '{@link Failure} when geometry cannot be exported or\nparsed, or when no engine is registered.',
      '{RangeError} when size is negative.',
      'When the input cannot be read.',
    ]);
  });

  it('captures member visibility, static and hidden members', () => {
    const shape = corpus.entries.find((entry) => entry.name === 'Shape');
    expect(shape?.category).toBe('shapes');
    const members = new Map((shape?.members ?? []).map((member) => [member.name, member]));
    expect([...members.keys()]).toStrictEqual(['origin', 'tolerance', 'translate', 'volume']);
    expect(members.get('origin')?.static).toBe(true);
    expect(members.get('tolerance')?.visibility).toBe('protected');
    expect(members.get('translate')?.kind).toBe('method');
    expect(members.get('translate')?.docs?.summary).toBe('Move the shape.');
    expect(members.get('translate')?.signatures?.[0]?.parameters[0]?.defaultValue).toBe('0');
  });

  it('treats a callable constant as an overloaded function', () => {
    const scale = corpus.entries.find((entry) => entry.name === 'scale');
    expect(scale?.kind).toBe('function');
    expect(scale?.signatures).toHaveLength(2);
  });

  it('should preserve generic callable members', () => {
    const suite = corpus.entries.find((entry) => entry.name === 'suite');
    expect(suite?.signatures?.[0]?.typeParameters).toEqual(['T']);
    expect(suite?.signatures?.[0]?.returnType?.text).toBe('T');
    expect(suite?.members?.map((member) => member.name)).toEqual(['skip', 'only']);
    expect(suite?.members?.[0]?.id).toBe('typescript:suite.skip');
    expect(suite?.members?.[0]?.signatures?.[0]?.parameters[1]?.optional).toBe(true);
  });

  it('should preserve addressable matcher overloads', () => {
    const matcher = corpus.entries.find((entry) => entry.name === 'Matcher');
    expect(matcher?.members?.[0]?.id).toBe('typescript:Matcher.toMatch');
    expect(matcher?.members?.[0]?.kind).toBe('method');
    expect(matcher?.members?.[0]?.signatures).toHaveLength(2);
  });

  it('should retain constructor overload parameters and constructed return type', () => {
    const constructor = corpus.entries.find((entry) => entry.name === 'Failure')?.members?.[0];
    expect(constructor?.kind).toBe('constructor');
    expect(constructor?.signatures).toHaveLength(2);
    expect(
      constructor?.signatures?.map((signature) => signature.parameters.map((parameter) => parameter.name)),
    ).toEqual([['message'], ['code', 'message']]);
    expect(constructor?.signatures?.every((signature) => signature.returnType?.text === 'Failure')).toBe(true);
  });

  it('should preserve merged callable namespaces without losing their generic call', () => {
    const task = corpus.entries.find((entry) => entry.name === 'task');
    expect(task?.kind).toBe('function');
    expect(task?.signatures?.[0]?.typeParameters).toEqual(['T']);
    expect(task?.members?.map((member) => member.id)).toEqual(['typescript:task.skip', 'typescript:task.only']);
  });

  it('should retain members for each exported callable namespace alias', () => {
    for (const name of ['first', 'second']) {
      const entry = corpus.entries.find((candidate) => candidate.name === name);
      expect(entry?.signatures?.[0]?.typeParameters).toEqual(['T']);
      expect(entry?.members?.map((member) => member.id)).toEqual([
        `typescript:${name}.skip`,
        `typescript:${name}.only`,
      ]);
    }
  });

  it('should name every callable export by its exported name', () => {
    const textsOf = (name: string): readonly string[] | undefined =>
      corpus.entries.find((entry) => entry.name === name)?.signatures?.map((signature) => signature.text);
    expect(textsOf('makeCylinder')).toEqual([
      'export declare function makeCylinder<T>(radius: number, height?: T): string;',
    ]);
    expect(textsOf('makeDirection')).toEqual(['export declare function makeDirection(direction: string): number;']);
    expect(textsOf('resolveDirection')).toEqual([
      'export declare function resolveDirection(direction: string): number;',
    ]);
    expect(textsOf('first')).toEqual(['export declare function first<T>(callback: () => T): T;']);
    expect(textsOf('scale')).toEqual([
      'export declare function scale(factor: number): string;',
      'export declare function scale(x: number, y: number): string;',
    ]);
    expect(textsOf('halve')).toEqual(['export declare function halve(value: number = 2): number;']);
  });

  it('should terminate namespace cycles while retaining noncyclic members', () => {
    const cyclic = corpus.entries.find((entry) => entry.name === 'cyclic');
    expect(cyclic?.members?.map((member) => member.id)).toEqual(['typescript:cyclic.read']);
  });
});
