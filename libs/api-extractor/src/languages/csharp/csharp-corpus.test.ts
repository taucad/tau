import { describe, expect, it } from 'vitest';

import { parseCsharpSurface, toCsharpCorpus } from '#languages/csharp/csharp-corpus.js';
import picogkCorpus from '#generated/picogk/picogk.corpus.json' with { type: 'json' };
import { flattenEntries } from '#model/api-corpus.js';
import type { ApiCorpus, ApiEntry } from '#model/api-corpus.types.js';

const corpus = picogkCorpus as ApiCorpus;
const entries = [...flattenEntries(corpus)];
const byId = new Map(entries.map((entry) => [entry.id, entry]));

const surface = {
  packageName: 'PicoGK',
  packageVersion: '2.3.0.0',
  extractor: 'Roslyn 5.9.0',
  diagnosticErrors: 0,
  entries: [
    {
      name: 'Voxels',
      kind: 'struct',
      path: 'PicoGK',
      visibility: 'public',
      members: [
        {
          name: 'voxSphere',
          kind: 'method',
          path: 'PicoGK.Voxels',
          static: true,
          signatures: [
            {
              parameters: [{ name: 'fRadius', type: { text: 'float' }, optional: true, defaultValue: '1f' }],
              returnType: { text: 'Voxels' },
              text: 'public static Voxels voxSphere(float fRadius = 1)',
            },
            {
              parameters: [{ name: 'lib', type: { text: 'Library' }, optional: false }],
              returnType: { text: 'Voxels' },
              text: 'public static Voxels voxSphere(Library lib)',
            },
          ],
          languageSpecific: { language: 'csharp', documentationId: 'M:PicoGK.Voxels.voxSphere(System.Single)' },
        },
      ],
    },
  ],
} as const;

describe('parseCsharpSurface', () => {
  it('accepts a well-formed payload and rejects drift', () => {
    expect(parseCsharpSurface(structuredClone(surface)).entries).toHaveLength(1);
    expect(() => parseCsharpSurface({ ...surface, entries: [] })).toThrow('entries is empty');
    expect(() => parseCsharpSurface({ ...surface, packageName: 7 })).toThrow('packageName is not a string');
    expect(() => parseCsharpSurface({ ...surface, entries: [{ name: 'Voxels', kind: 'record' }] })).toThrow(
      'unknown kind record',
    );
  });
});

describe('toCsharpCorpus', () => {
  it('keeps overloads as signatures of one entry and defaults as source text', () => {
    const built = toCsharpCorpus(parseCsharpSurface(structuredClone(surface)), '2026-01-01T00:00:00.000Z');
    const method = [...flattenEntries(built)].find((entry) => entry.name === 'voxSphere');

    expect(method?.id).toBe('csharp:PicoGK.Voxels.voxSphere');
    expect(method?.signatures).toHaveLength(2);
    expect(method?.signatures?.[0]?.parameters[0]?.defaultValue).toBe('1f');
    expect(built.metadata.totalEntries).toBe(2);
    expect(built.metadata.breakdown).toStrictEqual({ struct: 1, method: 1 });
  });
});

describe('the committed PicoGK corpus', () => {
  it('is a C# corpus produced by Roslyn', () => {
    expect(corpus.metadata.language).toBe('csharp');
    expect(corpus.metadata.packageName).toBe('PicoGK');
    expect(corpus.metadata.extractor).toMatch(/^Roslyn /u);
    expect(corpus.metadata.totalEntries).toBe(entries.length);
  });

  it('addresses every symbol exactly once', () => {
    expect(byId.size).toBe(entries.length);
  });

  it('covers PicoGK and the reachable System.Numerics surface', () => {
    const namespaces = new Set(corpus.entries.map((entry) => entry.path));
    expect(namespaces).toContain('PicoGK');
    expect(byId.has('csharp:PicoGK.Voxels')).toBe(true);
    expect(byId.has('csharp:PicoGK.Library')).toBe(true);
    expect(byId.has('csharp:System.Numerics.Vector3')).toBe(true);
    // PicoGK alone is roughly 1,100 declarations; a walk that silently lost a
    // namespace would drop well below this.
    expect(entries.length).toBeGreaterThan(1500);
  });

  it('carries real return types, not just declaration text', () => {
    const voxSphere = byId.get('csharp:PicoGK.Voxels.voxSphere');
    expect(voxSphere?.signatures?.length).toBeGreaterThan(1);
    for (const signature of voxSphere?.signatures ?? []) {
      expect(signature.returnType?.text).toBe('Voxels');
    }
    const callables = entries.filter((entry) => entry.kind === 'method');
    expect(callables.every((entry) => entry.signatures?.every((signature) => signature.returnType !== undefined))).toBe(
      true,
    );
  });

  it('carries default values as C# source text', () => {
    const defaults = entries
      .flatMap((entry) => entry.signatures ?? [])
      .flatMap((signature) => signature.parameters)
      .map((parameter) => parameter.defaultValue)
      .filter((value): value is string => value !== undefined);

    expect(defaults.length).toBeGreaterThan(100);
    // `1f`, not `1`: the value as the upstream author wrote it.
    expect(defaults).toContain('1f');
    expect(defaults.every((value) => value.length > 0)).toBe(true);
  });

  it('puts the XML member id on languageSpecific and nothing else language-shaped elsewhere', () => {
    for (const entry of entries) {
      expect(entry.languageSpecific?.language).toBe('csharp');
    }
    const documentationId = (entry: ApiEntry | undefined): string | undefined =>
      entry?.languageSpecific?.language === 'csharp' ? entry.languageSpecific.documentationId : undefined;
    const documented = entries.filter((entry) => documentationId(entry) !== undefined);

    expect(documented.length).toBe(entries.length);
    expect(documentationId(byId.get('csharp:PicoGK.Voxels.voxSphere'))).toMatch(/^M:PicoGK\.Voxels\.voxSphere\(/u);
  });

  it('records upstream declaration sites for PicoGK symbols', () => {
    const picogk = entries.filter((entry) => entry.id.startsWith('csharp:PicoGK.'));
    const located = picogk.filter((entry: ApiEntry) => entry.source !== undefined);

    expect(located.length).toBe(picogk.length);
    expect(located[0]?.source?.file).toMatch(/\.cs$/u);
    expect(located[0]?.source?.line).toBeGreaterThan(0);
  });

  it('carries prose for the publicly documented members PicoGK.xml holds', () => {
    // PicoGK.xml holds 658 `<member>` elements, one per overload, and includes
    // non-public members that no API corpus should carry. Diffing this corpus
    // against that file recovers 645 of them; the 13 that are absent all say
    // "internal, do not use" or are private helpers. The comparable unit here is
    // one signature, or one non-callable entry.
    const documentedUnits = entries.reduce(
      (count, entry) =>
        count +
        (entry.signatures === undefined
          ? Number(entry.docs?.summary !== undefined)
          : entry.signatures.filter(
              (signature) =>
                signature.description !== undefined ||
                signature.parameters.some((parameter) => parameter.description !== undefined),
            ).length),
      0,
    );

    expect(documentedUnits).toBeGreaterThan(600);
  });
});
