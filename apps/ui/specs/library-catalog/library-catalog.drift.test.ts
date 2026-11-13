import path from 'node:path';
import { readdirSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { driftManifestProblems, hashFiles } from '@taucad/formal/drift';

const specs = import.meta.dirname;
const workspace = path.resolve(specs, '../../../..');
const configs = readdirSync(specs)
  .filter((file) => file.endsWith('.cfg'))
  .sort();

/*
 * LibraryCatalog.tla has no machine yet: A3a adds `library-discovery`, `library-recovery` and
 * `library-access`, their alphabets, versions and `meta.tla` actions, and a conformance replay of
 * `LibraryCatalog/suite.json`. Until then the manifest ties the model to the code its `today`
 * configurations describe.
 */
describe('LibraryCatalog.tla implementation correspondence', () => {
  it('should require review of the model when the library code it describes changes', () => {
    expect(
      driftManifestProblems(path.join(specs, 'LibraryCatalog/drift.json'), {
        alphabet: [],
        tables: hashFiles(specs, ['expected.json', ...configs]),
        sources: hashFiles(workspace, ['apps/ui/app/hooks/use-project-manager.tsx']),
        specs: hashFiles(specs, ['LibraryCatalog.tla']),
      }),
    ).toEqual([]);
  });
});
