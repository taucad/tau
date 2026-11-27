/**
 * G2 (cloud backup admission blueprint D10 (b)): every writer leg's output is pinned. The working tree's writer,
 * run over every leg's scenarios, must produce exactly `corpus/writers/current.json`. A change to a record writer
 * therefore fails here until the corpus is re-pinned (`node packages/revisions/scripts/pin-writer-corpus.ts`),
 * which also re-runs G1 over the new bytes and P8 in `api-git-core` (testing policy).
 */
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { encodeCommit, encodeTag } from '#git-objects.js';
import {
  deriveChangeId,
  revisionAuthorSignature,
  revisionCommitMessage,
  revisionCommitterSignature,
  revisionTagMessage,
  taggerSignature,
} from '#revision-headers.js';
import { writeScenarios } from '#test/writer-scenarios.js';
import type { PinnedWriter, WriterFunctions } from '#test/writer-scenarios.js';

const pinned = JSON.parse(
  readFileSync(path.join(import.meta.dirname, 'corpus/writers/current.json'), 'utf8'),
) as PinnedWriter;

describe('G2: the working tree writes what the corpus pins', () => {
  it('reproduces every leg’s pinned object byte for byte', () => {
    const writer = {
      revisionAuthorSignature,
      revisionCommitterSignature,
      revisionCommitMessage,
      deriveChangeId,
      taggerSignature,
      revisionTagMessage,
      encodeCommit,
      encodeTag,
    } as unknown as WriterFunctions;
    expect(writeScenarios(writer)).toEqual(pinned.objects);
  });

  it('pins every leg', () => {
    expect(new Set(pinned.objects.map(({ leg }) => leg))).toEqual(
      new Set(['browser', 'desktop', 'cli', 'serve', 'cloud']),
    );
  });
});
