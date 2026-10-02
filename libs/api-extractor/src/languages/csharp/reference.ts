/** Split PicoGK reference audiences without changing source identities or accessibility. @module */

import { countByKind } from '#model/api-corpus.js';
import type { ApiCorpus, ApiEntry } from '#model/api-corpus.types.js';

/** Select the modeling or embedding view of the complete C# corpus. @internal */
export const csharpReferenceCorpus = (corpus: ApiCorpus, audience: 'modeling' | 'embedding'): ApiCorpus => {
  const selected = (entry: ApiEntry): boolean =>
    (entry.category === 'CAD authoring' || entry.category === 'Selected BCL reference') === (audience === 'modeling');
  const filter = (entries: readonly ApiEntry[]): ApiEntry[] =>
    entries.flatMap(({ members, ...entry }) => {
      const children = members === undefined ? undefined : filter(members);
      return selected(entry)
        ? [{ ...entry, ...(children === undefined ? {} : { members: children }) }]
        : (children ?? []);
    });
  const entries = filter(corpus.entries);
  const view = { ...corpus, entries };
  const breakdown = countByKind(view);
  return {
    ...view,
    metadata: {
      ...corpus.metadata,
      breakdown,
      totalEntries: Object.values(breakdown).reduce((sum, count) => sum + count, 0),
    },
  };
};
