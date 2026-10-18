/*
 * `specs/GatewayInvocation.tla` models the credit operation row; no machine owns it, so its drift manifest hashes the
 * code slices its API actions describe (FM-R13). A change to how `finish()` terminalizes a cut, or to the stream's
 * cancel, forces a spec touch: taucad/tau#851 changed the client cut while the model still left it pending.
 */

import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import path from 'node:path';

import { describe, expect, it } from 'vitest';
import { driftManifestProblems, hashFiles } from '@taucad/formal/drift';

const specs = path.resolve(import.meta.dirname, '../../../specs');
const service = 'app/api/billing/billable-model-invocation.service.ts';

/** The text from `start` to the first `end` after it, hashed. */
const sliceHash = (text: string, start: string, end: string): string => {
  const from = text.indexOf(start);
  const to = text.indexOf(end, from);
  if (from === -1 || to === -1) {
    throw new Error(`${service} no longer has the slice from ${JSON.stringify(start)}; update the drift test`);
  }
  return createHash('sha256')
    .update(text.slice(from, to + end.length))
    .digest('hex');
};

describe('GatewayInvocation.tla drift', () => {
  it('should match the committed drift manifest', () => {
    const text = readFileSync(path.resolve(import.meta.dirname, '../../..', service), 'utf8');
    expect(
      driftManifestProblems(path.join(specs, 'GatewayInvocation/drift.json'), {
        alphabet: [],
        tables: {},
        sources: {
          // ApiClientCancel: the relayed body's cancel.
          [`${service}#cancel`]: sliceHash(text, '      cancel: async () => {', '\n      },\n'),
          // ApiFinish, ApiServiceStop, ApiClientCancel: which observations terminalize, and how.
          [`${service}#finish`]: sliceHash(text, '  private async finish(', '\n  }\n'),
        },
        specs: hashFiles(specs, ['GatewayInvocation.tla']),
      }),
    ).toEqual([]);
  });
});
