import { describe, expect, it } from 'vitest';

import type { ApiEntryDraft } from '#model/api-corpus.js';
import { createApiCorpus } from '#model/api-corpus.js';
import type { ApiEntry } from '#model/api-corpus.types.js';
import { renderCoreApi } from '#render/render-core.js';
import type { UsageRanking } from '#render/render-core.js';

const metadata = {
  language: 'typescript',
  packageName: 'replicad',
  packageVersion: '1.0.0',
  extractor: 'TypeScript 5.9.3',
  extractionDate: '2026-10-08T00:00:00.000Z',
} as const;

const manyMembers = Array.from(
  { length: 40 },
  (_value, index): ApiEntryDraft => ({
    name: `member${index}`,
    kind: 'method',
    signatures: [{ parameters: [], text: `member${index}(value: number, other: number, third: number): Solid;` }],
  }),
);

const drafts: readonly ApiEntryDraft[] = [
  {
    name: 'drawCircle',
    kind: 'function',
    docs: { summary: 'Creates the drawing of a circle.' },
    signatures: [{ parameters: [], text: 'declare function drawCircle(radius: number): Drawing;' }],
  },
  {
    name: 'cuboid',
    kind: 'function',
    signatures: [{ parameters: [], text: 'declare function cuboid(options?: CuboidOptions): Solid;' }],
  },
  {
    name: 'CuboidOptions',
    kind: 'interface',
    type: { text: 'export interface CuboidOptions' },
    members: [{ name: 'size', kind: 'property', type: { text: 'Vec3' } }],
  },
  {
    name: 'unusedHelper',
    kind: 'function',
    signatures: [{ parameters: [], text: 'declare function unusedHelper(): void;' }],
  },
  {
    name: 'Solid',
    kind: 'class',
    type: { text: 'export declare class Solid extends Shape' },
    members: [
      ...manyMembers,
      { name: 'fillet', kind: 'method', signatures: [{ parameters: [], text: 'fillet(radius: number): Solid;' }] },
    ],
  },
  { name: 'oldThing', kind: 'function', deprecated: true, signatures: [{ parameters: [], text: 'oldThing(): void;' }] },
];

const corpus = createApiCorpus(metadata, drafts);
const groupBy = (entry: ApiEntry): string => (entry.kind === 'function' ? 'Functions' : 'Types');
const idOf = (name: string): string => `typescript:${name}`;
const ranking = (scores: Readonly<Record<string, number>>): UsageRanking => ({
  symbols: Object.entries(scores).map(([id, score]) => ({ id, score })),
});

describe('renderCoreApi', () => {
  it('should rank used symbols and leave unused and deprecated ones to the reference', () => {
    const core = renderCoreApi([{ corpus, groupBy }], ranking({ [idOf('drawCircle')]: 5, [idOf('oldThing')]: 9 }), {
      budgetTokens: 4000,
    });

    expect(core?.markdown).toContain('declare function drawCircle(radius: number): Drawing;');
    expect(core?.markdown).toContain('// Creates the drawing of a circle');
    expect(core?.markdown).not.toContain('unusedHelper');
    expect(core?.markdown).not.toContain('oldThing');
  });

  it('should lead with pins in their written order, even without observed use', () => {
    const core = renderCoreApi([{ corpus, groupBy }], ranking({ [idOf('drawCircle')]: 5 }), {
      budgetTokens: 4000,
      pins: ['unusedHelper'],
    });

    expect(core?.markdown.indexOf('unusedHelper')).toBeLessThan(core?.markdown.indexOf('drawCircle') ?? 0);
  });

  it('should show only the used members of a large container and count the rest', () => {
    const core = renderCoreApi([{ corpus, groupBy }], ranking({ [idOf('Solid.fillet')]: 3 }), { budgetTokens: 4000 });

    expect(core?.markdown).toContain('export declare class Solid extends Shape\n  fillet(radius: number): Solid;');
    expect(core?.markdown).not.toContain('member0(');
    expect(core?.markdown).toContain('// … 40 more members in the API reference');
  });

  it('should show every member of a container pinned with .*', () => {
    const core = renderCoreApi([{ corpus, groupBy }], undefined, { budgetTokens: 8000, pins: ['Solid.*'] });

    expect(core?.markdown).toContain('member39(');
    expect(core?.markdown).not.toContain('more members');
  });

  it('should follow a shown signature with the small option type it names', () => {
    const core = renderCoreApi([{ corpus, groupBy }], ranking({ [idOf('cuboid')]: 2 }), { budgetTokens: 4000 });

    expect(core?.markdown).toContain(
      'declare function cuboid(options?: CuboidOptions): Solid;\n\nexport interface CuboidOptions\n  size: Vec3',
    );
  });

  it('should not inline a type named only in a summary or one with nothing to show', () => {
    const prose = createApiCorpus(metadata, [
      {
        name: 'region',
        kind: 'function',
        docs: { summary: 'Create a region in a Sketch.' },
        signatures: [{ parameters: [], text: 'region(segments: [Segment; 1+], flag?: bool): Region' }],
      },
      { name: 'Sketch', kind: 'type', type: { text: 'type Sketch = { paths: Path[] }' } },
      { name: 'bool', kind: 'type' },
      { name: 'Region', kind: 'type', type: { text: 'type Region = { area: number }' } },
    ]);
    const core = renderCoreApi([{ corpus: prose, groupBy }], ranking({ [idOf('region')]: 1 }), { budgetTokens: 4000 });

    expect(core?.markdown).toContain('type Region = { area: number }');
    expect(core?.markdown).not.toContain('type Sketch');
    expect(core?.markdown).not.toMatch(/^bool$/mu);
  });

  it('should leave out an interface a shown class already implements', () => {
    const shapes = createApiCorpus(metadata, [
      {
        name: 'Drawing',
        kind: 'class',
        type: { text: 'export declare class Drawing implements DrawingInterface' },
        members: [
          { name: 'cut', kind: 'method', signatures: [{ parameters: [], text: 'cut(other: Drawing): Drawing;' }] },
        ],
      },
      {
        name: 'DrawingInterface',
        kind: 'interface',
        type: { text: 'export declare interface DrawingInterface' },
        members: [
          { name: 'cut', kind: 'method', signatures: [{ parameters: [], text: 'cut(other: Drawing): Drawing;' }] },
        ],
      },
    ]);
    const core = renderCoreApi(
      [{ corpus: shapes, groupBy }],
      ranking({ [idOf('Drawing.cut')]: 5, [idOf('DrawingInterface.cut')]: 4 }),
      { budgetTokens: 4000 },
    );

    expect(core?.markdown).toContain('class Drawing implements DrawingInterface');
    expect(core?.markdown).not.toContain('export declare interface DrawingInterface');
  });

  it('should still show an interface when the class implementing it does not fit', () => {
    const shapes = createApiCorpus(metadata, [
      {
        name: 'Drawing',
        kind: 'class',
        type: { text: 'export declare class Drawing implements DrawingInterface' },
        members: manyMembers,
      },
      {
        name: 'DrawingInterface',
        kind: 'interface',
        type: { text: 'export declare interface DrawingInterface' },
        members: [
          { name: 'cut', kind: 'method', signatures: [{ parameters: [], text: 'cut(other: Drawing): Drawing;' }] },
        ],
      },
    ]);
    const core = renderCoreApi([{ corpus: shapes, groupBy }], ranking({ [idOf('DrawingInterface.cut')]: 4 }), {
      budgetTokens: 140,
      pins: ['Drawing.*'],
    });

    expect(core?.markdown).not.toContain('class Drawing');
    expect(core?.markdown).toContain('export declare interface DrawingInterface\n  cut(other: Drawing): Drawing;');
  });

  it("should print a property's modifiers and leave out members with nothing to show", () => {
    const nodes = createApiCorpus(metadata, [
      {
        name: 'GLTFNode',
        kind: 'class',
        type: { text: 'export declare class GLTFNode' },
        members: [
          { name: 'material', kind: 'property', optional: true, type: { text: 'GLTFMaterial' } },
          { name: 'name', kind: 'property', readonly: true, type: { text: 'string' } },
          { name: 'count', kind: 'property', static: true, type: { text: 'number' } },
          { name: 'parent', kind: 'property' },
        ],
      },
    ]);
    const core = renderCoreApi([{ corpus: nodes, groupBy }], ranking({ [idOf('GLTFNode')]: 1 }), {
      budgetTokens: 4000,
    });

    expect(core?.markdown).toContain('  material?: GLTFMaterial\n  readonly name: string\n  static count: number');
    expect(core?.markdown).not.toMatch(/^ {2}parent$/mu);
  });

  it('should show the fields of a small record nested in a namespace', () => {
    const jscad = createApiCorpus(metadata, [
      {
        name: 'extrusions',
        kind: 'namespace',
        members: [
          {
            name: 'extrudeLinear',
            kind: 'function',
            signatures: [
              {
                parameters: [],
                text: 'declare function extrudeLinear(options: ExtrudeLinearOptions, geometry: Geometry): Geom3',
              },
            ],
          },
          {
            name: 'ExtrudeLinearOptions',
            kind: 'interface',
            type: { text: 'export interface ExtrudeLinearOptions' },
            members: [
              { name: 'height', kind: 'property', type: { text: 'number' } },
              { name: 'twistAngle', kind: 'property', type: { text: 'number' } },
            ],
          },
        ],
      },
    ]);
    const core = renderCoreApi([{ corpus: jscad, groupBy }], undefined, { budgetTokens: 4000, pins: ['extrusions.*'] });

    expect(core?.markdown).toContain(
      '  export interface ExtrudeLinearOptions\n    height: number\n    twistAngle: number',
    );
  });

  it('should follow an inlined option type with the small type it names in turn', () => {
    const nested = createApiCorpus(metadata, [
      {
        name: 'hole',
        kind: 'function',
        signatures: [{ parameters: [], text: 'declare function hole(expected: HoleExpectation): void;' }],
      },
      { name: 'HoleExpectation', kind: 'type', type: { text: '{ axis: AxisExpectation; diameter: number }' } },
      { name: 'AxisExpectation', kind: 'type', type: { text: '{ origin: Vec3; direction: Vec3 }' } },
    ]);
    const core = renderCoreApi([{ corpus: nested, groupBy }], ranking({ [idOf('hole')]: 1 }), { budgetTokens: 4000 });

    expect(core?.markdown).toContain('HoleExpectation: { axis: AxisExpectation; diameter: number }');
    expect(core?.markdown).toContain('AxisExpectation: { origin: Vec3; direction: Vec3 }');
  });

  it('should skip whole blocks that do not fit rather than truncate them', () => {
    const core = renderCoreApi([{ corpus, groupBy }], ranking({ [idOf('drawCircle')]: 5, [idOf('Solid')]: 4 }), {
      budgetTokens: 90,
      pins: ['Solid.*'],
    });

    expect(core?.markdown).toContain('drawCircle');
    expect(core?.markdown).not.toContain('Solid extends');
    expect(core?.tokens).toBeLessThanOrEqual(90);
  });

  it('should stop adding blocks at the line budget', () => {
    const core = renderCoreApi([{ corpus, groupBy }], undefined, {
      budgetTokens: 8000,
      budgetLines: 12,
      includeUnused: true,
    });

    expect(core?.markdown.split('\n').length).toBeLessThanOrEqual(13);
    expect(core?.markdown).not.toContain('member39(');
  });

  it('should offer every entry for a surface small enough to show whole', () => {
    const core = renderCoreApi([{ corpus, groupBy }], undefined, { budgetTokens: 8000, includeUnused: true });

    expect(core?.markdown).toContain('unusedHelper');
  });

  it('should drop excluded entries and render nothing when nothing qualifies', () => {
    expect(
      renderCoreApi([{ corpus, groupBy }], ranking({ [idOf('drawCircle')]: 5 }), {
        budgetTokens: 4000,
        exclude: (entry) => entry.name === 'drawCircle',
      }),
    ).toBeUndefined();
  });

  it('should refuse a pin that names nothing in the corpus', () => {
    expect(() => renderCoreApi([{ corpus, groupBy }], undefined, { budgetTokens: 4000, pins: ['missing'] })).toThrow(
      /core pin missing names no entry/u,
    );
  });

  it('should be deterministic for equal scores', () => {
    const scores = ranking({ [idOf('drawCircle')]: 1, [idOf('cuboid')]: 1 });
    const first = renderCoreApi([{ corpus, groupBy }], scores, { budgetTokens: 4000 });

    expect(renderCoreApi([{ corpus, groupBy }], scores, { budgetTokens: 4000 })).toStrictEqual(first);
    expect(first?.markdown.indexOf('cuboid')).toBeLessThan(first?.markdown.indexOf('drawCircle') ?? 0);
  });
});
