/**
 * The drift manifest of `specs/discovery-index/DiscoveryIndex.tla` (formal verification policy rule 12): the module,
 * its configurations and `expected.json`, and the index and the sources that feed it evidence. A change to any of them
 * fails here until the manifest is re-pinned with a dated note in the module and its README
 * (`FORMAL_UPDATE=1 npx vitest run src/project-directory-index.drift.test.ts`). Its conformance adapter is
 * `project-directory-index.differential.test.ts`.
 */
import path from 'node:path';
import { readdirSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { driftManifestProblems, hashFiles } from '@taucad/formal/drift';

const specs = path.resolve(import.meta.dirname, '../specs/discovery-index');
const sources = import.meta.dirname;
const configs = readdirSync(specs)
  .filter((file) => file.endsWith('.cfg'))
  .sort();

describe('DiscoveryIndex.tla implementation correspondence', () => {
  it('should require review of the model when the index or the evidence it takes changes', () => {
    expect(
      driftManifestProblems(path.join(specs, 'DiscoveryIndex/drift.json'), {
        alphabet: [],
        tables: hashFiles(specs, ['expected.json', ...configs]),
        sources: hashFiles(sources, [
          'project-directory-index.ts',
          'project-directories.ts',
          'provider-registry.ts',
          'remote-changes.ts',
          'external-change-ingest.ts',
        ]),
        specs: hashFiles(specs, ['DiscoveryIndex.tla']),
      }),
    ).toEqual([]);
  });
});
