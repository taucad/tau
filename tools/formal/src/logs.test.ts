import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import type { LogValidator } from '#logs.js';
import { capturedLogDirectory, validateCapturedLogs, verdictsFile } from '#logs.js';
import { sanitizeLog } from '#sanitize.js';
import type { FormalContext } from '#toolchain.js';

const roots: string[] = [];
const temporaryContext = (): FormalContext => {
  const root = mkdtempSync(path.join(tmpdir(), 'formal-logs-'));
  roots.push(root);
  return { root, env: {} };
};

afterEach(() => {
  for (const root of roots.splice(0)) {
    rmSync(root, { recursive: true, force: true });
  }
});

const compacted = {
  version: 1,
  leaderEpoch: 'epoch-a',
  sequence: 3,
  recordedAt: '2026-09-25T00:00:00.000Z',
  runId: 'r1',
  type: 'history.compacted',
  summarizerUsage: null,
  costUsd: 0.5,
  startedAtMs: 1_789_683_070_447,
};

describe('sanitizeLog', () => {
  it('should keep a log with a null summarizerUsage readable after sanitizing', () => {
    const context = temporaryContext();
    const source = path.join(context.root, 'events.jsonl');
    const destination = path.join(context.root, 'sanitized/events.jsonl');
    writeFileSync(source, `${JSON.stringify(compacted)}\n\n`);

    sanitizeLog(source, destination);

    const text = readFileSync(destination, 'utf8');
    expect(text).not.toContain('null,');
    expect(JSON.parse(text)).toEqual({
      ...compacted,
      summarizerUsage: 'null',
      costUsd: '0.5',
      startedAtMs: '1789683070447',
    });
  });
});

describe('validateCapturedLogs', () => {
  const capture = (context: FormalContext, files: Record<string, string>): void => {
    for (const [name, text] of Object.entries(files)) {
      const file = path.join(capturedLogDirectory(context, 'ui-e2e'), name);
      mkdirSync(path.dirname(file), { recursive: true });
      writeFileSync(file, text);
    }
  };

  it('should fail the step when one captured log is rejected', async () => {
    const context = temporaryContext();
    capture(context, {
      'chat.spec/a.jsonl': `${JSON.stringify(compacted)}\n`,
      'chat.spec/b.jsonl': `${JSON.stringify({ ...compacted, sequence: 9 })}\n`,
    });
    const validate: LogValidator = async (sanitized) =>
      sanitized.endsWith('b.jsonl')
        ? { outcome: { rejected: { row: 1, rules: ['EpochStartsAtZero'] } }, seconds: 1 }
        : { outcome: 'pass', seconds: 1 };

    const code = await validateCapturedLogs(context, { project: 'ui-e2e', validate, log: () => undefined });

    expect(code).toBe(1);
    expect(JSON.parse(readFileSync(verdictsFile(context, 'ui-e2e'), 'utf8'))).toEqual({
      'chat.spec/a.jsonl': { accepted: true, verdict: 'pass', seconds: 1 },
      'chat.spec/b.jsonl': { accepted: false, verdict: 'rejected at row 1 by EpochStartsAtZero', seconds: 1 },
    });
  });

  it('should pass and write empty verdicts when nothing was captured', async () => {
    const context = temporaryContext();

    const code = await validateCapturedLogs(context, {
      project: 'desktop-e2e',
      validate: async () => ({ outcome: 'pass', seconds: 0 }),
      log: () => undefined,
    });

    expect(code).toBe(0);
    expect(JSON.parse(readFileSync(verdictsFile(context, 'desktop-e2e'), 'utf8'))).toEqual({});
  });
});
