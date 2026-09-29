/*
 * `specs/SeamDelivery.tla` models the seam; its drift manifest lists the seam alphabet read off the wire module, so
 * a verb, status, effect, read refusal or listen added here forces a spec touch (FM-R13). The untimed spec does not
 * hash `timeouts.json` (RV3-F4).
 */

import path from 'node:path';

import { describe, expect, it } from 'vitest';
import { driftManifestProblems, hashFiles } from '@taucad/formal/drift';

import { commandVerbs } from '#wire/commands.schema.js';
import { agentWireProtocolSchemas } from '#wire/frames.schema.js';

const specs = path.resolve(import.meta.dirname, '../../specs');

/** The answer and read vocabularies, as the spec's alphabet names them. */
const statuses = ['applied', 'refused', 'replayed'];
const effects = ['durable', 'not-applied', 'unknown'];
const readRefusals = ['cursor-ahead', 'identity-mismatch', 'owner-fenced', 'unreadable'];

const seamAlphabet = (): string[] =>
  [
    ...readRefusals.map((reason) => `ef:${reason}`),
    ...effects.map((effect) => `effect:${effect}`),
    // The rpc hello and keepalive frames (SC T5, T6).
    'frame:lh',
    'frame:lk',
    ...Object.keys(agentWireProtocolSchemas.listens).map((name) => `listen:${name}`),
    ...statuses.map((status) => `status:${status}`),
    ...[...commandVerbs, 'read'].map((verb) => `verb:${verb}`),
  ].sort();

describe('SeamDelivery.tla drift', () => {
  it('should match the committed drift manifest', () => {
    expect(
      driftManifestProblems(path.join(specs, 'SeamDelivery/drift.json'), {
        alphabet: seamAlphabet(),
        tables: {},
        specs: hashFiles(specs, ['SeamDelivery.tla', 'SeamDeliveryTrace.tla']),
      }),
    ).toEqual([]);
  });

  it('should read the statuses, effects and refusals it lists off the wire schemas', async () => {
    const { commandAnswerSchema, readAnswerSchema } = await import('#wire/index.js');
    const answers = JSON.stringify(commandAnswerSchema.toJSONSchema());
    const reads = JSON.stringify(readAnswerSchema.toJSONSchema());
    for (const word of [...statuses, ...effects]) {
      expect(answers).toContain(`"${word}"`);
    }
    for (const reason of readRefusals) {
      expect(reads).toContain(`"${reason}"`);
    }
  });
});
