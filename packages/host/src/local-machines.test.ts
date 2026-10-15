/**
 * The shared printer store for a host beside project folders (agent plugin UI blueprint W11): which project each
 * folder's prints name, and that only one host holds the store at a time.
 */

import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { defaultMachineProviders } from '#machine-host.js';
import { openLocalMachines } from '#local-machines.js';
import type { LocalMachines } from '#local-machines.js';

describe('openLocalMachines', () => {
  let providers: Awaited<ReturnType<typeof defaultMachineProviders>> = [];
  let scratch: string;

  beforeAll(async () => {
    const served = await defaultMachineProviders();
    providers = served.filter(({ id }) => id === 'bambu-simulator');
  });
  let project: string;
  let storeRoot: string;

  beforeEach(async () => {
    scratch = await mkdtemp(join(tmpdir(), 'tau-local-machines-'));
    project = join(scratch, 'project');
    storeRoot = join(scratch, 'machines');
    await mkdir(project);
  });

  afterEach(async () => {
    await rm(scratch, { recursive: true, force: true });
  });

  const open = async (requireProject?: boolean) =>
    openLocalMachines({
      workspaceRoot: project,
      requireProject,
      providers,
      actorId: 'test',
      storeRoot,
      onWarning: () => undefined,
    });

  const opened = async (requireProject?: boolean): Promise<LocalMachines> => {
    const machines = await open(requireProject);
    if ('refused' in machines) {
      throw new Error(`The store was refused: ${machines.refused}`);
    }
    return machines;
  };

  it("should serve the store's providers and name each folder's project", async () => {
    await writeFile(join(project, 'tau.json'), JSON.stringify({ id: 'proj_abcdefghijklmnopqrstu' }));
    const machines = await opened();
    try {
      expect(await machines.projectOf(project)).toBe('proj_abcdefghijklmnopqrstu');
      const { facet } = machines;
      if (!facet.available) {
        throw new Error('The store was not served.');
      }
      const { signal } = new AbortController();
      const providers = await facet.listProviders({ signal });
      expect(providers.length).toBe(1);
      const bindings = await facet.list({ signal });
      expect(bindings.entries).toEqual([]);
    } finally {
      await machines.close();
    }
  });

  it('should leave a folder without tau.json unnamed until it gains one', async () => {
    const machines = await opened();
    try {
      expect(await machines.projectOf(project)).toBeUndefined();
      await writeFile(join(project, 'tau.json'), JSON.stringify({ id: 'proj_abcdefghijklmnopqrstu' }));
      expect(await machines.projectOf(project)).toBe('proj_abcdefghijklmnopqrstu');
      expect(await machines.projectOf(join(scratch, 'missing'))).toBeUndefined();
    } finally {
      await machines.close();
    }
  });

  it('should leave the store to other apps when every call works in a folder that holds no project', async () => {
    expect(await open(true)).toEqual({ refused: 'no-project' });
    /* Nothing holds the store: another host opens it. */
    const other = await opened();
    await other.close();
    await writeFile(join(project, 'tau.json'), JSON.stringify({ id: 'proj_abcdefghijklmnopqrstu' }));
    const named = await opened(true);
    await named.close();
  });

  it('should refuse a second holder of the store until the first closes', async () => {
    const first = await opened();
    expect(await open()).toEqual({ refused: 'in-use' });
    await first.close();
    const again = await opened();
    await again.close();
  });
});
