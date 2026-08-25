/**
 * Flagship regression for the watchable Node filesystem adapter (crossover X5).
 *
 * `fromNodeFs` used to expose no `watch`, so a Node- or Electron-hosted runtime
 * never re-rendered when something outside the runtime edited a dependency —
 * the "worker watches its own dependencies" topology was unreachable off the
 * bridge arm. This pins the hardening charter's acceptance criterion: an
 * external `node:fs` edit produces exactly one autonomous re-render, an
 * editor-style atomic save produces exactly one, and a `.tau/cache` write
 * burst produces none.
 */
import { mkdtemp, mkdir, rename, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createNodeClient } from '@taucad/runtime/node';
import type { WorkerState } from '@taucad/runtime/types';
import { runtime } from '#runtime.definition.js';

const mainSource = (height: number): string =>
  `import { makeBaseBox } from 'replicad';\nexport default () => makeBaseBox(10, ${height}, 30);\n`;

/** The autonomous file-change debounce is 200 ms; 750 ms proves whether a render was scheduled. */
const debounceSettlingWindow = 750;

const delay = async (milliseconds: number): Promise<void> =>
  new Promise((resolve) => {
    setTimeout(resolve, milliseconds);
  });

describe('autonomous re-render on the Node filesystem adapter', () => {
  let projectDirectory: string | undefined;

  afterEach(async () => {
    if (projectDirectory) {
      await rm(projectDirectory, { recursive: true, force: true });
      projectDirectory = undefined;
    }
  });

  it('should render once per external edit and never for excluded cache writes', { timeout: 300_000 }, async () => {
    projectDirectory = await mkdtemp(join(tmpdir(), 'tau-node-fs-watch-'));
    const root = projectDirectory;
    const entryPath = join(root, 'main.ts');
    await writeFile(entryPath, mainSource(20), 'utf8');

    const client = await createNodeClient(root, { runtime });
    const states: WorkerState[] = [];
    const stopStates = client.on('state', (state) => states.push(state));
    const settle = async (): Promise<void> => {
      await vi.waitFor(
        () => {
          expect(states.at(-1)).toBe('idle');
        },
        { timeout: 120_000, interval: 50 },
      );
    };

    try {
      const initial = await client.render({ source: { path: 'main.ts' } });
      expect(initial.superseded).toBe(false);
      if (initial.superseded || !initial.geometry.success) {
        throw new Error('Expected the initial Replicad preview to render successfully');
      }
      await settle();

      // 1. A plain external write through raw node:fs.
      let mark = states.length;
      await writeFile(entryPath, mainSource(25), 'utf8');
      await delay(debounceSettlingWindow);
      expect(states.slice(mark).filter((state) => state === 'rendering')).toEqual(['rendering']);
      await settle();

      // 2. An editor-style atomic save: write a sibling temp file, rename it over the target.
      mark = states.length;
      const temporaryPath = join(root, '.main.ts.editor.tmp');
      await writeFile(temporaryPath, mainSource(30), 'utf8');
      await rename(temporaryPath, entryPath);
      await delay(debounceSettlingWindow);
      expect(states.slice(mark).filter((state) => state === 'rendering')).toEqual(['rendering']);
      await settle();

      // 3. Tau's own cache writes are excluded and must never feed back into a render.
      mark = states.length;
      const cacheDirectory = join(root, '.tau/cache/geometry');
      await mkdir(cacheDirectory, { recursive: true });
      for (let index = 0; index < 20; index++) {
        // oxlint-disable-next-line no-await-in-loop -- sequential burst mirrors the cache writer's own ordering
        await writeFile(join(cacheDirectory, `burst-${index}.bin`), new Uint8Array([index]));
      }
      await delay(debounceSettlingWindow);
      expect(states.slice(mark).filter((state) => state === 'rendering')).toEqual([]);
    } finally {
      stopStates();
      await client.shutdown({ drain: true });
      client.terminate();
    }
  });
});
