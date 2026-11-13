import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { driftManifestProblems, hashFiles } from '@taucad/formal/drift';

const specs = import.meta.dirname;

// `workbench-layout.machine` (A8a) does not exist yet. Until it lands, the manifest ties only the spec;
// A8a's conformance test takes this check over and adds the machine's alphabet, version and actions.
describe('LayoutApply.tla drift manifest', () => {
  it('should match the committed drift manifest', () => {
    expect(
      driftManifestProblems(path.join(specs, 'LayoutApply/drift.json'), {
        alphabet: [],
        tables: {},
        specs: hashFiles(specs, ['LayoutApply.tla']),
      }),
    ).toEqual([]);
  });
});
