// @vitest-environment node
import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
// oxlint-disable-next-line no-restricted-imports -- Node-only fixture tests run without browser aliases.
import { validateProjectionFixtureBytes } from './projection-fixture-validation.ts';

const fixture = (sequences = [0, 1, 2], expectedTurns = 1, declaredTurns = 1) => {
  const rows = sequences.map((sequence, index) => ({
    version: 1,
    leaderEpoch: 'fixture',
    sequence,
    recordedAt: '2026-10-08T00:00:00.000Z',
    runId: 'r',
    type: 'run.lifecycle',
    state: ['admitted', 'running', 'failed'][index],
  }));
  const history = Buffer.from(rows.map((row) => JSON.stringify(row) + '\n').join(''));
  const historySha256 = createHash('sha256').update(history).digest('hex');
  const bytes = Buffer.from(
    JSON.stringify({
      chatId: 'chat_fixture',
      turns: declaredTurns,
      closure: {
        version: 2,
        project: { projectId: 'proj_fixture' },
        directories: ['.tau', '.tau/chats', '.tau/chats/chat_fixture'],
        files: [
          {
            path: '.tau/chats/chat_fixture/events.jsonl',
            byteLength: history.length,
            sha256: historySha256,
            base64Chunks: [history.toString('base64')],
          },
        ],
      },
    }),
  );
  return {
    bytes,
    expected: { fixtureSha256: createHash('sha256').update(bytes).digest('hex'), historySha256, turns: expectedTurns },
  };
};

describe('immutable projection fixture Node proof', () => {
  it('returns a scalar exact-byte manifest and canonical count without decoded history', () => {
    const { bytes, expected } = fixture();
    expect(validateProjectionFixtureBytes(bytes, expected)).toMatchObject({
      turnCount: 1,
      rowCount: 3,
      historyIntact: true,
      anomalyCount: 0,
      fixtureSha256: expected.fixtureSha256,
    });
  });
  it('rejects changed bytes even when the same fixture path would be used', () => {
    const { bytes, expected } = fixture();
    expect(() => validateProjectionFixtureBytes(Buffer.concat([bytes, Buffer.from(' ')]), expected)).toThrow(
      'SHA mismatch',
    );
  });
  it('rejects a canonical turn-count mismatch before browser import', () => {
    const { bytes, expected } = fixture([0, 1, 2], 2, 2);
    expect(() => validateProjectionFixtureBytes(bytes, expected)).toThrow('canonical');
  });
  it('rejects same-hash-anchored malformed sequence history before browser import', () => {
    const { bytes, expected } = fixture([0, 2, 3]);
    expect(() => validateProjectionFixtureBytes(bytes, expected)).toThrow('canonical');
  });
});
