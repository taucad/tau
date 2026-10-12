/**
 * Two documents on one Node-hosted client stay independent (I1/I2 of
 * `docs/research/runtime-concurrent-open-watch-fence.md`): opening them together
 * renders each once, and an external edit of one re-renders only that one.
 */
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createNodeClient } from '@taucad/runtime/node';
import type { Rendering } from '@taucad/runtime';
import { runtime } from '#runtime.definition.js';

const boxSource = (height: number): string =>
  `import { makeBaseBox } from 'replicad';\nexport default () => makeBaseBox(10, ${height}, 30);\n`;

/** The autonomous file-change debounce is 200 ms; 750 ms proves whether a render was scheduled. */
const debounceSettlingWindow = 750;

const delay = async (milliseconds: number): Promise<void> =>
  new Promise((resolve) => {
    setTimeout(resolve, milliseconds);
  });

describe('two documents on one Node client', () => {
  let projectDirectory: string | undefined;

  afterEach(async () => {
    if (projectDirectory) {
      await rm(projectDirectory, { recursive: true, force: true });
      projectDirectory = undefined;
    }
  });

  it('should render each document once when opened together and re-render only the edited one', async () => {
    projectDirectory = await mkdtemp(join(tmpdir(), 'tau-two-documents-'));
    const root = projectDirectory;
    await writeFile(join(root, 'a.ts'), boxSource(20), 'utf8');
    await writeFile(join(root, 'b.ts'), boxSource(40), 'utf8');

    const client = await createNodeClient({ runtime, projectPath: root });
    const a = client.open({ source: { path: 'a.ts' }, watch: true });
    const b = client.open({ source: { path: 'b.ts' }, watch: true });
    const aView = a.view('model');
    const bView = b.view('model');
    const aRendered: Rendering[] = [];
    const bRendered: Rendering[] = [];
    const stopA = aView.on('rendered', (rendering) => aRendered.push(rendering));
    const stopB = bView.on('rendered', (rendering) => bRendered.push(rendering));
    try {
      const [first, second] = await Promise.all([aView.rendering(), bView.rendering()]);
      expect(first).toMatchObject({ superseded: false, rendering: { success: true } });
      expect(second).toMatchObject({ superseded: false, rendering: { success: true } });
      await delay(debounceSettlingWindow);
      expect(aRendered).toHaveLength(1);
      expect(bRendered).toHaveLength(1);

      await writeFile(join(root, 'b.ts'), boxSource(45), 'utf8');
      await delay(debounceSettlingWindow);
      await vi.waitFor(
        () => {
          expect(bRendered).toHaveLength(2);
        },
        { timeout: 120_000 },
      );
      await delay(debounceSettlingWindow);
      expect(bRendered).toHaveLength(2);
      expect(aRendered).toHaveLength(1);
    } finally {
      stopA();
      stopB();
      aView.close();
      bView.close();
      a.close();
      b.close();
      await client.shutdown();
    }
  });
});
