// @vitest-environment node
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const appRoot = join(import.meta.dirname, '..');

/*
 * PostHog session replay masks inputs by default but records rendered text.
 * These containers render user CAD source, chat transcripts and file names, so
 * each carries the SDK's default block class.
 */
describe('session replay privacy', () => {
  it.each([
    'components/code/code-editor.client.tsx',
    'routes/w.$workspace.$project/chat-history.tsx',
    'routes/w.$workspace.$project/chat-editor-file-tree.tsx',
  ])('should block replay of %s', (path) => {
    expect(readFileSync(join(appRoot, path), 'utf8')).toMatch(/['\s]ph-no-capture[\s']/u);
  });
});
