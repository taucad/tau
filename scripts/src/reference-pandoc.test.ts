import { tmpdir } from 'node:os';
import process from 'node:process';
import { describe, expect, it } from 'vitest';

import { runProcess } from '#reference-pandoc.js';

describe('reference Pandoc process runner', () => {
  it('should report the exit code, not an unhandled EPIPE, when the process exits before reading its input', async () => {
    // A child that exits at once leaves a large stdin write on a closed pipe (merge-queue flake F5, EPIPE).
    const result = runProcess({
      executable: process.execPath,
      args: ['-e', 'process.exit(0)'],
      input: 'x'.repeat(8 * 1024 * 1024),
      cwd: tmpdir(),
    });
    await expect(result).resolves.toEqual({ stdout: '', stderr: '' });
  });
});
