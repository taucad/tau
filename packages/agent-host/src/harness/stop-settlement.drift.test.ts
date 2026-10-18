/*
 * `specs/StopSettlement.tla` models the seam between a stopped run, the gateway attempt it cut, and the next start or
 * Resume that resolves that attempt first. No machine owns it, so its drift manifest hashes the code slices its host
 * actions describe (FM-R13): a change to either lookup's wait forces a spec touch.
 */

import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import path from 'node:path';

import { describe, expect, it } from 'vitest';
import { driftManifestProblems, hashFiles } from '@taucad/formal/drift';

const root = path.resolve(import.meta.dirname, '../..');
const specs = path.join(root, 'specs');

/** The text of `file` from `start` to the first `end` after it, hashed. */
const sliceHash = (file: string, start: string, end: string): string => {
  const text = readFileSync(path.join(root, file), 'utf8');
  const from = text.indexOf(start);
  const to = text.indexOf(end, from);
  if (from === -1 || to === -1) {
    throw new Error(`${file} no longer has the slice from ${JSON.stringify(start)}; update the drift test`);
  }
  return createHash('sha256')
    .update(text.slice(from, to + end.length))
    .digest('hex');
};

describe('StopSettlement.tla drift', () => {
  it('should match the committed drift manifest', () => {
    expect(
      driftManifestProblems(path.join(specs, 'StopSettlement/drift.json'), {
        alphabet: [],
        tables: {},
        sources: {
          // Lookup's budget: the waits between lookups.
          'src/harness/session.ts#pendingAttemptWaits': sliceHash(
            'src/harness/session.ts',
            'const pendingAttemptWaits',
            ';\n',
          ),
          // Lookup with StartWaits and ResumeWaits: one wait shared by both requests.
          'src/harness/session.ts#settledInvocation': sliceHash(
            'src/harness/session.ts',
            'export const settledInvocation',
            '\n};\n',
          ),
          // Lookup for a start: a pending answer after the waits ends the run.
          'src/harness/session.ts#prepareInvocation': sliceHash(
            'src/harness/session.ts',
            '  const prepareInvocation = async (',
            '\n  };\n',
          ),
          // Lookup for a resume: a pending answer after the waits refuses it.
          'src/host/tau-agent-host.ts#resolveInvocations': sliceHash(
            'src/host/tau-agent-host.ts',
            '  const resolveInvocations = async (',
            '\n  };\n',
          ),
        },
        specs: hashFiles(specs, ['StopSettlement.tla']),
      }),
    ).toEqual([]);
  });
});
