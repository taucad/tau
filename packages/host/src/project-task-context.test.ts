import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { NodeFsProvider } from '@taucad/filesystem/backend/node';
import { contextMemoryMaxBytes, contextMemoryMaxLines } from '@taucad/chat/schemas';
import { readProjectTaskContext } from '#project-task-context.js';

describe('headless project context', () => {
  it('reads current instructions on every turn and bounds UTF-8 bytes and lines', async () => {
    const root = await mkdtemp(join(tmpdir(), 'tau-project-context-'));
    try {
      const filesystem = new NodeFsProvider(root);
      const { signal } = new AbortController();
      expect(await readProjectTaskContext(filesystem, signal)).toEqual({});
      await mkdir(join(root, '.tau'));
      await writeFile(join(root, '.tau/AGENTS.md'), 'Use millimeters. See knowledge/part.md.');
      const first = await readProjectTaskContext(filesystem, signal);
      expect(first.memory?.['.tau/AGENTS.md']).toBe('Use millimeters. See knowledge/part.md.');
      await writeFile(join(root, '.tau/AGENTS.md'), 'Use centimeters.');
      const second = await readProjectTaskContext(filesystem, signal);
      expect(second.memory?.['.tau/AGENTS.md']).toBe('Use centimeters.');
      await writeFile(join(root, '.tau/AGENTS.md'), 'é'.repeat(contextMemoryMaxBytes));
      const oversized = await readProjectTaskContext(filesystem, signal);
      const bounded = oversized.memory?.['.tau/AGENTS.md'] ?? '';
      expect(new TextEncoder().encode(bounded.split('\n')[0]).byteLength).toBeLessThanOrEqual(contextMemoryMaxBytes);
      expect(bounded).toContain('truncated');
      await writeFile(
        join(root, '.tau/AGENTS.md'),
        Array.from({ length: contextMemoryMaxLines + 20 }, (_, index) => `line ${index}`).join('\n'),
      );
      const multiline = await readProjectTaskContext(filesystem, signal);
      const lines = multiline.memory?.['.tau/AGENTS.md'] ?? '';
      expect(lines).toContain(`line ${contextMemoryMaxLines - 1}`);
      expect(lines).not.toContain(`line ${contextMemoryMaxLines}\n`);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });
});
