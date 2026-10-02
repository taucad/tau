import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { replayFixtures } from '#testing/edit-bench/fixtures.js';
import { replayFixtureSchema, replayFixtureStoreSchema } from '#testing/edit-bench/replay-fixture.schema.js';
import { replayEditFixture } from '#testing/edit-bench/runner.js';
import { editFileInputSchema } from '@taucad/chat';

const repositoryRoot = fileURLToPath(new URL('../../../../../', import.meta.url));
const legacyRowSchema = z.object({
  type: z.literal('file-edit-interface-qualification'),
  runAt: z.string(),
  modelId: z.string(),
  provider: z.string(),
  editInterface: z.string(),
  nativeToolName: z.string(),
  invocation: z.number().int().positive(),
});

describe('Tier-D edit replay store', () => {
  it('should validate every fixture and retain honest provenance', () => {
    expect(replayFixtureStoreSchema.parse(replayFixtures)).toHaveLength(20);
    expect(replayFixtures.filter((fixture) => fixture.source.kind === 'qualification-derived')).toHaveLength(5);
    expect(replayFixtures.filter((fixture) => fixture.source.kind === 'authored')).toHaveLength(15);
    expect(replayFixtures.filter((fixture) => fixture.source.kind === 'recorded')).toHaveLength(0);
  });

  it('should freeze authored starting bytes from their named Tau sources', async () => {
    for (const fixture of replayFixtures) {
      if (fixture.source.kind !== 'authored') {
        continue;
      }
      // oxlint-disable-next-line no-await-in-loop -- fixtures are checked in authored order so the first drift names itself.
      const sourceBytes = new Uint8Array(await readFile(`${repositoryRoot}${fixture.source.sourcePath}`));
      const targetBytes = fixture.initial.files.find((file) => file.path === fixture.targetFile)?.bytes;
      expect(targetBytes, fixture.id).toEqual(sourceBytes);
    }
  });

  it('should convert only the five portable legacy rows without claiming verbatim arguments', async () => {
    const evidence = await readFile(
      `${repositoryRoot}spikes/stash1-edit-reference/file-edit-interface-qualification.jsonl`,
      'utf8',
    );
    const rows = evidence
      .trim()
      .split('\n')
      .map((line) => {
        const row: unknown = JSON.parse(line);
        return legacyRowSchema.parse(row);
      })
      .filter(
        (row) =>
          row.modelId === 'xai-grok-4.5' &&
          row.provider === 'xai' &&
          row.editInterface === 'replace' &&
          row.nativeToolName === 'edit_file',
      );
    const converted = replayFixtures.filter((fixture) => fixture.source.kind === 'qualification-derived');

    expect(rows).toHaveLength(5);
    expect(converted.map((fixture) => fixture.source)).toEqual(
      rows.map((row) => ({
        kind: 'qualification-derived',
        sourceModel: row.modelId,
        provider: row.provider,
        nativeToolName: row.nativeToolName,
        invocation: row.invocation,
        recordedAt: row.runAt,
        argumentsVerbatim: false,
        evidencePath: 'spikes/stash1-edit-reference/file-edit-interface-qualification.jsonl',
      })),
    );
  });

  it.each(replayFixtures)('should replay $id through the production edit path', async (fixture) => {
    const result = await replayEditFixture(fixture);

    expect(result).toEqual({
      id: fixture.id,
      case: fixture.case,
      emissionCount: fixture.emissions.length,
      outcome:
        fixture.expected.kind === 'success'
          ? { kind: 'success', staleRecovered: fixture.expected.staleRecovered ?? false }
          : { kind: 'error', errorCode: fixture.expected.errorCode },
    });
  });

  it('replays a reviewed exact edit without changing the frozen fixture store or expected bytes', async () => {
    const source = replayFixtures.find((fixture) => fixture.id === 'unique-match-jscad-cube-size');
    const emission = source?.emissions[0];
    const original = source?.initial.files.find((file) => file.path === source.targetFile)?.bytes;
    if (source?.expected.kind !== 'success' || emission === undefined || original === undefined) {
      throw new Error('Missing unchanged exact edit fixture.');
    }
    const value: unknown = JSON.parse(emission.argumentsJson);
    const input = editFileInputSchema.parse(value);
    const fixture = replayFixtureSchema.parse({
      ...source,
      id: 'reviewed-exact-edit-control',
      emissions: [
        {
          ...emission,
          argumentsJson: JSON.stringify({
            ...input,
            expectedDigest: `sha256:${createHash('sha256').update(original).digest('hex')}`,
          }),
        },
      ],
    });
    await expect(replayEditFixture(fixture)).resolves.toMatchObject({
      outcome: { kind: 'success', staleRecovered: false },
    });
  });

  it('should fail a deliberately corrupted byte fixture and name its id', async () => {
    const source = replayFixtures.find((fixture) => fixture.id === 'unique-match-jscad-cube-size');
    if (source?.expected.kind !== 'success') {
      throw new Error('Missing unique-match corruption source fixture.');
    }
    const corruptedBytes = new Uint8Array(source.expected.files[0]!.bytes);
    const finalByteIndex = corruptedBytes.byteLength - 1;
    // oxlint-disable-next-line no-bitwise -- flipping the low bit is the corruption this canary asserts on.
    corruptedBytes[finalByteIndex] = (corruptedBytes[finalByteIndex] ?? 0) ^ 1;
    const corrupted = replayFixtureSchema.parse({
      ...source,
      id: 'red-first-corrupted-byte-canary',
      expected: {
        ...source.expected,
        files: [{ ...source.expected.files[0], bytes: corruptedBytes }],
      },
    });

    await expect(replayEditFixture(corrupted)).rejects.toThrow(
      '[red-first-corrupted-byte-canary] byte drift in main.ts.',
    );
  });
});
