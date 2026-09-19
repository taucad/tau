import { describe, expect, it } from 'vitest';

import type { ApiEntryDraft } from '#model/api-corpus.js';
import { callableKinds, countByKind, createApiCorpus, flattenEntries } from '#model/api-corpus.js';
import type { ApiCorpusMetadata } from '#model/api-corpus.types.js';

const metadata = (
  language: ApiCorpusMetadata['language'],
  packageName: string,
): Parameters<typeof createApiCorpus>[0] => ({
  language,
  packageName,
  packageVersion: '1.0.0',
  extractor: 'fixture',
  extractionDate: '2026-09-10T00:00:00.000Z',
});

/**
 * One fixture per language, each carrying the construct that broke the previous
 * model: overloads (TypeScript), keyword-only parameters with non-`repr` defaults
 * (Python), ref parameters plus a documentation id (C#), module-vs-function
 * (OpenSCAD), and unit types plus the experimental flag (KCL).
 */
const typescriptEntries: readonly ApiEntryDraft[] = [
  {
    name: 'makePlane',
    kind: 'function',
    category: 'construction',
    signatures: [
      { parameters: [], text: 'makePlane(): Plane', returnType: { text: 'Plane' } },
      {
        parameters: [{ name: 'origin', optional: false, type: { text: 'Point' } }],
        text: 'makePlane(origin: Point): Plane',
        returnType: { text: 'Plane' },
      },
    ],
    docs: { summary: 'Build a plane.' },
    languageSpecific: { language: 'typescript' },
  },
  {
    name: 'Solid',
    kind: 'class',
    category: 'shapes',
    members: [{ name: 'fillet', kind: 'method', signatures: [{ parameters: [], text: 'fillet(): Solid' }] }],
  },
];

const pythonEntries: readonly ApiEntryDraft[] = [
  {
    name: 'Box',
    kind: 'class',
    path: 'build123d.objects_part',
    members: [
      {
        name: '__init__',
        kind: 'constructor',
        signatures: [
          {
            parameters: [
              { name: 'length', optional: false, type: { text: 'float' } },
              {
                name: 'align',
                optional: true,
                type: { text: 'Align | tuple[Align, Align]' },
                defaultValue: 'Align.CENTER',
              },
            ],
            text: 'Box(length: float, align: Align | tuple[Align, Align] = Align.CENTER)',
          },
        ],
        languageSpecific: {
          language: 'python',
          parameterKinds: { length: 'positional-or-keyword', align: 'keyword-only' },
        },
      },
    ],
  },
];

const csharpEntries: readonly ApiEntryDraft[] = [
  {
    name: 'voxSphere',
    kind: 'method',
    path: 'PicoGK.Voxels',
    static: true,
    visibility: 'public',
    signatures: [
      {
        parameters: [
          { name: 'vecCenter', optional: false, type: { text: 'Vector3' } },
          { name: 'fRadius', optional: true, type: { text: 'float' }, defaultValue: '1.0f' },
        ],
        text: 'public static Voxels voxSphere(Vector3 vecCenter, float fRadius = 1.0f)',
        returnType: { text: 'Voxels' },
      },
    ],
    languageSpecific: {
      language: 'csharp',
      documentationId: 'M:PicoGK.Voxels.voxSphere(System.Numerics.Vector3,System.Single)',
    },
  },
];

const openscadEntries: readonly ApiEntryDraft[] = [
  {
    name: 'linear_extrude',
    kind: 'function',
    signatures: [
      {
        parameters: [{ name: 'height', optional: false, type: { text: 'number' } }],
        text: 'linear_extrude(height, center = false, twist = 0)',
      },
    ],
    languageSpecific: { language: 'openscad', isModule: true },
  },
  {
    name: '$fn',
    kind: 'constant',
    type: { text: 'number' },
    languageSpecific: { language: 'openscad', isModule: false },
  },
];

const kclEntries: readonly ApiEntryDraft[] = [
  {
    name: 'angledLine',
    kind: 'function',
    path: 'std',
    deprecated: 'Use `line` with an angle argument.',
    signatures: [
      {
        parameters: [
          { name: 'sketch', optional: false, type: { text: 'Sketch' } },
          { name: 'angle', optional: false, type: { text: 'number(Angle)' } },
        ],
        text: 'angledLine(@sketch: Sketch, angle: number(Angle)): Sketch',
        returnType: { text: 'Sketch' },
      },
    ],
    languageSpecific: { language: 'kcl', unitTypes: { angle: 'Angle' }, experimental: true },
  },
];

describe('createApiCorpus', () => {
  it.each([
    ['typescript', typescriptEntries, 3],
    ['python', pythonEntries, 2],
    ['csharp', csharpEntries, 1],
    ['openscad', openscadEntries, 2],
    ['kcl', kclEntries, 1],
  ] as const)('round-trips a %s surface', (language, entries, expectedTotal) => {
    const corpus = createApiCorpus(metadata(language, `${language}-fixture`), entries);

    expect(corpus.metadata.totalEntries).toBe(expectedTotal);
    expect([...flattenEntries(corpus)]).toHaveLength(expectedTotal);
    expect(corpus.metadata.breakdown).toStrictEqual(countByKind(corpus));
    expect(structuredClone(corpus)).toStrictEqual(corpus);
  });

  it('keeps overloads as distinct signatures rather than merging or duplicating them', () => {
    const corpus = createApiCorpus(metadata('typescript', 'replicad'), typescriptEntries);
    const makePlane = corpus.entries.find((entry) => entry.name === 'makePlane');

    expect(makePlane?.signatures).toHaveLength(2);
    expect(makePlane?.signatures?.map((signature) => signature.text)).toStrictEqual([
      'makePlane(): Plane',
      'makePlane(origin: Point): Plane',
    ]);
    // One entry, not one per overload: the replicad extractor emitted six duplicate names this way.
    expect(corpus.entries.filter((entry) => entry.name === 'makePlane')).toHaveLength(1);
  });

  it('preserves default values as source text, not as a runtime repr', () => {
    const corpus = createApiCorpus(metadata('python', 'build123d'), pythonEntries);
    const constructor = [...flattenEntries(corpus)].find((entry) => entry.kind === 'constructor');
    const align = constructor?.signatures?.[0]?.parameters.find((parameter) => parameter.name === 'align');

    expect(align?.defaultValue).toBe('Align.CENTER');
    expect(align?.defaultValue).not.toMatch(/^</u);
  });

  it('assigns unique ids across containers and members', () => {
    const corpus = createApiCorpus(metadata('typescript', 'replicad'), typescriptEntries);
    const ids = [...flattenEntries(corpus)].map((entry) => entry.id);

    expect(new Set(ids).size).toBe(ids.length);
    expect(ids).toContain('typescript:Solid.fillet');
  });

  it('disambiguates a name declared twice in one container by kind', () => {
    const corpus = createApiCorpus(metadata('typescript', 'fixture'), [
      { name: 'Shape', kind: 'class' },
      { name: 'Shape', kind: 'type' },
    ]);

    expect(corpus.entries.map((entry) => entry.id)).toStrictEqual(['typescript:Shape', 'typescript:Shape#type']);
  });

  it('carries deprecation and language-specific detail that the previous model dropped', () => {
    const corpus = createApiCorpus(metadata('kcl', 'kcl-std'), kclEntries);
    const [entry] = corpus.entries;

    expect(entry?.deprecated).toBe('Use `line` with an angle argument.');
    expect(entry?.languageSpecific).toStrictEqual({
      language: 'kcl',
      unitTypes: { angle: 'Angle' },
      experimental: true,
    });
  });

  it('names the kinds that carry signatures', () => {
    expect([...callableKinds].toSorted()).toStrictEqual(['constructor', 'function', 'method']);
  });
});
