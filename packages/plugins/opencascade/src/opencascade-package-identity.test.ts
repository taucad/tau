// @vitest-environment node
import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';

import { opencascadeKernel } from '#opencascade.kernel.js';

describe('opencascade package identity', () => {
  it('should declare the installed libcascade runtime for standalone projects', async () => {
    const installed = JSON.parse(
      await readFile(new URL('../node_modules/libcascade/package.json', import.meta.url), 'utf8'),
    ) as { name: string; version: string };
    expect(installed.name).toBe('libcascade');
    expect(opencascadeKernel().builtinDependencies).toEqual({ libcascade: installed.version });
  });
});
