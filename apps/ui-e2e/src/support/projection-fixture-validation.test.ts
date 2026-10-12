// @vitest-environment node
import { createHash } from 'node:crypto';
import { mkdtemp, mkdir, readFile, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
// oxlint-disable-next-line no-restricted-imports -- Node-only fixture tests run without browser aliases.
import { validateProjectionFixtureBytes, validateProjectionDirectory } from './projection-fixture-validation.ts';

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
  it('keeps the default plain-history anchor when explicit expectations are omitted', () => {
    const { bytes } = fixture();
    expect(() => validateProjectionFixtureBytes(bytes)).toThrow('SHA mismatch');
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

describe('raw directory projection fixture proof', () => {
  const withDirectory = async (
    check: (
      directory: string,
      expected: { fixtureSha256: string; historySha256: string; turns: number },
    ) => Promise<void>,
  ) => {
    const directory = await mkdtemp(join(tmpdir(), 'tau-projection-proof-'));
    try {
      const source = fixture();
      const inline = JSON.parse(source.bytes.toString('utf8')) as {
        chatId: string;
        turns: number;
        closure: {
          project: unknown;
          directories: string[];
          files: Array<{ path: string; byteLength: number; sha256: string; base64Chunks: string[] }>;
        };
      };
      const root = join(directory, 'rooted-project');
      await mkdir(join(root, '.tau/chats/chat_fixture'), { recursive: true });
      const files = [];
      for (const file of inline.closure.files) {
        const bytes = Buffer.from(file.base64Chunks.join(''), 'base64');
        // oxlint-disable-next-line no-await-in-loop -- Preserve the fixture file order without concurrent writes.
        await writeFile(join(root, file.path), bytes);
        files.push({ path: file.path, byteLength: file.byteLength, sha256: file.sha256, chunkSha256: [file.sha256] });
      }
      const manifest = Buffer.from(JSON.stringify({ id: 'proj_fixture' }));
      await writeFile(join(root, 'tau.json'), manifest);
      const manifestSha256 = createHash('sha256').update(manifest).digest('hex');
      files.push({
        path: 'tau.json',
        byteLength: manifest.length,
        sha256: manifestSha256,
        chunkSha256: [manifestSha256],
      });
      const receipt = JSON.stringify({
        version: 1,
        chatId: inline.chatId,
        turns: inline.turns,
        seedSha256: source.expected.fixtureSha256,
        project: inline.closure.project,
        directories: inline.closure.directories,
        files,
      });
      await writeFile(join(directory, 'receipt.json'), receipt);
      await check(directory, { ...source.expected, fixtureSha256: createHash('sha256').update(receipt).digest('hex') });
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  };

  it('reopens raw bytes and proves the same canonical history without an inline container', async () => {
    await withDirectory(async (directory, expected) => {
      expect(await validateProjectionDirectory(directory, expected)).toMatchObject({
        rowCount: 3,
        turnCount: 1,
        historySha256: expected.historySha256,
        historyIntact: true,
      });
    });
  });

  it('rejects changed physical bytes even with an unchanged receipt', async () => {
    await withDirectory(async (directory, expected) => {
      await writeFile(join(directory, 'rooted-project/.tau/chats/chat_fixture/events.jsonl'), 'changed\n');
      await expect(validateProjectionDirectory(directory, expected)).rejects.toThrow('proof mismatch');
    });
  });

  it('rejects an unlisted physical closure file', async () => {
    await withDirectory(async (directory, expected) => {
      await writeFile(join(directory, 'rooted-project/unlisted'), 'extra');
      await expect(validateProjectionDirectory(directory, expected)).rejects.toThrow('physical closure');
    });
  });
  it('rejects a hash-anchored backslash path before physical traversal', async () => {
    await withDirectory(async (directory, expected) => {
      const receiptPath = join(directory, 'receipt.json');
      const receipt = JSON.parse(await readFile(receiptPath, 'utf8')) as { directories: string[] };
      receipt.directories.push(String.raw`escaped\path`);
      const bytes = JSON.stringify(receipt);
      await writeFile(receiptPath, bytes);
      await expect(
        validateProjectionDirectory(directory, {
          ...expected,
          fixtureSha256: createHash('sha256').update(bytes).digest('hex'),
        }),
      ).rejects.toThrow('rooted');
    });
  });

  it('rejects a re-anchored incorrect ordered chunk hash', async () => {
    await withDirectory(async (directory, expected) => {
      const receiptPath = join(directory, 'receipt.json');
      const receipt = JSON.parse(await readFile(receiptPath, 'utf8')) as { files: Array<{ chunkSha256: string[] }> };
      receipt.files[0]!.chunkSha256[0] = '0'.repeat(64);
      const bytes = JSON.stringify(receipt);
      await writeFile(receiptPath, bytes);
      await expect(
        validateProjectionDirectory(directory, {
          ...expected,
          fixtureSha256: createHash('sha256').update(bytes).digest('hex'),
        }),
      ).rejects.toThrow('proof mismatch');
    });
  });
});
