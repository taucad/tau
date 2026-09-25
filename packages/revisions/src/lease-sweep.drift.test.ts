/*
 * `specs/lease/LeaseSweep.tla` records today's epoch sweep (L4 D-102) and has no machine: its drift
 * manifest hashes the two code slices the counterexample is about, so a change to either touches
 * the record until W8's TS-S7 deletes both (FM-R13).
 */

import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import path from 'node:path';

import { describe, expect, it } from 'vitest';
import { driftManifestProblems, hashFiles } from '@taucad/formal/drift';

const specs = path.resolve(import.meta.dirname, '../specs/lease');
const effects = readFileSync(path.resolve(import.meta.dirname, 'revision-effects.ts'), 'utf8');

/* The text from `start` through the first `end` after it. */
const slice = (start: string, end: string): string => {
  const from = effects.indexOf(start);
  const to = effects.indexOf(end, from);
  if (from === -1 || to === -1) {
    throw new Error(`revision-effects.ts no longer has the slice starting ${start}`);
  }
  return effects.slice(from, to + end.length);
};

const sha256 = (text: string): string => createHash('sha256').update(text).digest('hex');

describe('LeaseSweep.tla drift', () => {
  it('should match the committed drift manifest', () => {
    expect(
      driftManifestProblems(path.join(specs, 'LeaseSweep/drift.json'), {
        alphabet: [],
        tables: {},
        sources: {
          'revision-effects.ts#prepare.staleRunIds': sha256(
            slice('const staleRunIds = leases', '.map((lease) => lease.runId);'),
          ),
          'revision-effects.ts#sweepLeases': sha256(slice('sweepLeases: fromAuthorityPromise', '}),')),
        },
        specs: hashFiles(specs, ['LeaseSweep.tla']),
      }),
    ).toEqual([]);
  });
});
