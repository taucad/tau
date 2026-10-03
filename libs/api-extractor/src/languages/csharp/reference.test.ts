import { describe, expect, it } from 'vitest';

import { csharpReferenceCorpus } from '#languages/csharp/reference.js';
import { createApiCorpus, flattenEntries } from '#model/api-corpus.js';

describe('csharpReferenceCorpus', () => {
  it('partitions nested audiences exactly once while retaining declared paths and IDs', () => {
    const corpus = createApiCorpus(
      {
        language: 'csharp',
        packageName: 'PicoGK',
        packageVersion: 'fixture',
        extractor: 'fixture',
        extractionDate: 'fixture',
      },
      [
        {
          name: 'Geometry',
          path: 'PicoGK',
          kind: 'class',
          category: 'CAD authoring',
          members: [
            { name: 'Build', path: 'PicoGK.Geometry', kind: 'method', category: 'CAD authoring' },
            { name: 'Handle', path: 'PicoGK.Geometry', kind: 'property', category: 'Advanced embedding' },
            {
              name: 'Nested',
              path: 'PicoGK.Geometry',
              kind: 'class',
              category: 'CAD authoring',
              members: [
                { name: 'Hook', path: 'PicoGK.Geometry.Nested', kind: 'method', category: 'Subclass-only protected' },
              ],
            },
          ],
        },
        {
          name: 'Host',
          path: 'PicoGK',
          kind: 'class',
          category: 'Advanced embedding',
          members: [{ name: 'Value', path: 'PicoGK.Host', kind: 'property', category: 'CAD authoring' }],
        },
        { name: 'Vector3', path: 'System.Numerics', kind: 'struct', category: 'Selected BCL reference' },
      ],
    );
    const modeling = csharpReferenceCorpus(corpus, 'modeling');
    const embedding = csharpReferenceCorpus(corpus, 'embedding');
    const modelEntries = [...flattenEntries(modeling)];
    const embeddedEntries = [...flattenEntries(embedding)];
    expect(modelEntries.map(({ name }) => name)).toEqual(['Geometry', 'Build', 'Nested', 'Value', 'Vector3']);
    expect(embeddedEntries.map(({ name }) => name)).toEqual(['Handle', 'Hook', 'Host']);
    expect(embeddedEntries[0]?.path).toBe('PicoGK.Geometry');
    const ids = [...modelEntries, ...embeddedEntries].map(({ id }) => id);
    expect([...ids].sort()).toEqual([...flattenEntries(corpus)].map(({ id }) => id).sort());
    expect(new Set(ids).size).toBe(ids.length);
    expect(modeling.metadata.totalEntries).toBe(5);
    expect(embedding.metadata.totalEntries).toBe(3);
    expect(corpus.metadata.totalEntries).toBe(8);
    expect(corpus.entries[0]?.members).toHaveLength(3);
  });
});
