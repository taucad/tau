import { describe, expect, test } from 'vitest';
import { page as selectors } from 'vitest/browser';
import * as target from '#support/external-target.js';
import {
  readOpfsTree,
  readOpfsWorkspaceMarker,
  readProjectStorageState,
  seedDisconnectedWorkspaceAliases,
} from '#support/project-storage-state.js';

const projectCount = 500;
const fixture = 'workspace-connection-500';
const repairFixture = 'workspace-connection-repair';

const installWorkspacePicker = async (workspaceNames: string | readonly string[] = fixture): Promise<void> => {
  await target.addInitScript((names: string | readonly string[]) => {
    const queue = [...(typeof names === 'string' ? [names] : names)];
    const fallback = queue.at(-1)!;
    Object.defineProperty(globalThis, 'showDirectoryPicker', {
      configurable: true,
      value: async () => {
        const root = await navigator.storage.getDirectory();
        const workspaceName = queue.shift() ?? fallback;
        const handle = await root.getDirectoryHandle(workspaceName, { create: true });
        Object.defineProperties(handle, {
          queryPermission: { value: async () => 'granted' },
          requestPermission: { value: async () => 'granted' },
        });
        return handle;
      },
    });
  }, workspaceNames);
};

const copyOpfsDirectory = async (sourceName: string, targetName: string): Promise<void> => {
  await target.evaluate(
    async ({ sourceName, targetName }) => {
      const root = await navigator.storage.getDirectory();
      const source = await root.getDirectoryHandle(sourceName);
      const destination = await root.getDirectoryHandle(targetName, { create: true });
      const copy = async (from: FileSystemDirectoryHandle, to: FileSystemDirectoryHandle): Promise<void> => {
        for await (const [name, entry] of from.entries()) {
          if (entry.kind === 'directory') {
            await copy(entry, await to.getDirectoryHandle(name, { create: true }));
            continue;
          }
          const output = await to.getFileHandle(name, { create: true });
          const writable = await output.createWritable();
          const file = await entry.getFile();
          await writable.write(await file.arrayBuffer());
          await writable.close();
        }
      };
      await copy(source, destination);
    },
    { sourceName, targetName },
  );
};

const seedWorkspace = async (workspaceName = fixture, count = projectCount): Promise<void> => {
  await target.evaluate(
    async ({ count, workspaceName }) => {
      const root = await navigator.storage.getDirectory();
      const workspace = await root.getDirectoryHandle(workspaceName, { create: true });
      const seedProject = async (index: number): Promise<void> => {
        const directory = await workspace.getDirectoryHandle(`project-${index}`, { create: true });
        const manifest = await directory.getFileHandle('tau.json', { create: true });
        const writable = await manifest.createWritable();
        await writable.write(
          JSON.stringify({
            $schema: 'https://tau.new/schemas/tau-schema-v1.json',
            id: `proj_${index.toString(36).padStart(21, '0')}`,
            name: `Connection Fixture ${index}`,
            description: '',
            tags: [],
            assets: { main: { entryPath: 'main.ts' } },
          }),
        );
        await writable.close();
      };
      for (let offset = 0; offset < count; offset += 25) {
        // oxlint-disable-next-line no-await-in-loop -- Bounded OPFS fixture creation avoids exhausting handles.
        await Promise.all(
          Array.from({ length: Math.min(25, count - offset) }, (_, index) => offset + index).map(async (index) => {
            await seedProject(index);
          }),
        );
      }

      const prototype = Object.getPrototypeOf(workspace) as {
        __tauDelayedManifestReads?: boolean;
        getFileHandle(name: string, options?: FileSystemGetFileOptions): Promise<FileSystemFileHandle>;
      };
      if (!prototype.__tauDelayedManifestReads) {
        const { getFileHandle } = prototype;
        prototype.getFileHandle = async function (name, options) {
          if (name === 'tau.json') {
            await new Promise((resolve) => {
              setTimeout(resolve, 40);
            });
          }
          return getFileHandle.call(this, name, options);
        };
        prototype.__tauDelayedManifestReads = true;
      }
    },
    { count, workspaceName },
  );
};

describe('large workspace connection', () => {
  test('shows continuous progress and publishes 500 project links without refresh inside the ceiling', async () => {
    await installWorkspacePicker();
    await target.navigate('/');
    await seedWorkspace();
    await target.navigate('/files');

    const startedAt = performance.now();
    await target.click(selectors.getByRole('button', { name: 'Add Workspace' }));
    await target.expectVisible(selectors.getByText('Reading project folders…'), 5000);
    await target.expectVisible(selectors.getByText('500 projects ready'), 10_000);
    const catalogReadyDuration = performance.now() - startedAt;

    expect(catalogReadyDuration).toBeLessThan(10_000);
    await target.expectCount(selectors.getByRole('link', { name: /Connection Fixture/ }), 5);
    await target.writeArtifact(
      'workspace-connection-500.json',
      JSON.stringify({ catalogReadyDuration, projectCount }, undefined, 2),
    );
  });

  test('disconnects and generically re-picks the same marked folder without splitting its identity', async () => {
    await installWorkspacePicker();
    await target.navigate('/');
    await seedWorkspace();
    await target.navigate('/files');
    await target.click(selectors.getByRole('button', { name: 'Add Workspace' }));
    await target.expectVisible(selectors.getByText('500 projects ready'), 10_000);
    const before = await readProjectStorageState();
    const markerBefore = await readOpfsWorkspaceMarker(fixture);
    expect(before.workspaces).toHaveLength(1);
    expect(before.handleWorkspaceIds).toEqual([before.workspaces[0]!.workspaceId]);

    await target.click(selectors.getByRole('button', { name: 'Disconnect workspace' }));
    await target.expectVisible(selectors.getByRole('button', { name: 'Add Workspace' }));
    await target.waitFor(() => !document.body.textContent.includes('Disconnected workspace'), undefined, {
      timeout: 10_000,
    });
    await target.click(selectors.getByRole('button', { name: 'Add Workspace' }));
    await target.expectVisible(selectors.getByText('500 projects ready'), 10_000);

    const after = await readProjectStorageState();
    const markerAfter = await readOpfsWorkspaceMarker(fixture);
    expect(after.workspaces.map(({ workspaceId }) => workspaceId)).toEqual(
      before.workspaces.map(({ workspaceId }) => workspaceId),
    );
    expect(after.handleWorkspaceIds).toEqual(before.handleWorkspaceIds);
    expect(after.configs).toEqual(before.configs);
    expect(markerAfter).toEqual(markerBefore);
    await target.navigate('/projects');
    await target.expectCount(selectors.getByLabelText('Project conflicts'), 0);
  });

  test('disconnects immediately and restores the exact workspace through toast Undo', async () => {
    const workspaceName = 'workspace-connection-undo';
    await installWorkspacePicker(workspaceName);
    await target.navigate('/');
    await seedWorkspace(workspaceName, 4);
    await target.navigate('/files');
    await target.click(selectors.getByRole('button', { name: 'Add Workspace' }));
    await target.expectVisible(selectors.getByText('4 projects ready'), 10_000);
    const before = await readProjectStorageState();
    const markerBefore = await readOpfsWorkspaceMarker(workspaceName);

    await target.click(selectors.getByRole('button', { name: 'Disconnect workspace' }));
    await target.expectVisible(selectors.getByRole('button', { name: 'Undo', exact: true }));
    await target.click(selectors.getByRole('button', { name: 'Undo', exact: true }));
    await target.expectVisible(selectors.getByText('4 projects ready'), 10_000);

    expect(await readProjectStorageState()).toEqual(before);
    expect(await readOpfsWorkspaceMarker(workspaceName)).toEqual(markerBefore);
  });

  test('reconnects the same identity through Settings after disconnect and reload', async () => {
    const workspaceName = 'workspace-connection-settings';
    await installWorkspacePicker(workspaceName);
    await target.navigate('/');
    await seedWorkspace(workspaceName, 3);
    await target.navigate('/files');
    await target.click(selectors.getByRole('button', { name: 'Add Workspace' }));
    await target.expectVisible(selectors.getByText('3 projects ready'), 10_000);
    const before = await readProjectStorageState();
    const markerBefore = await readOpfsWorkspaceMarker(workspaceName);

    await target.click(selectors.getByRole('button', { name: 'Disconnect workspace' }));
    await target.reload();
    await target.navigate('/files?settings=filesystem');
    await target.expectVisible(selectors.getByRole('button', { name: 'Reconnect', exact: true }));
    await target.click(selectors.getByRole('button', { name: 'Reconnect', exact: true }));
    await target.expectVisible(selectors.getByText(`Updated workspace folder to "${workspaceName}"`));

    expect(await readProjectStorageState()).toEqual(before);
    expect(await readOpfsWorkspaceMarker(workspaceName)).toEqual(markerBefore);
  });

  test('revokes and restores a bound project in a second tab through root-change broadcasts', async () => {
    const workspaceName = 'workspace-connection-cross-tab';
    await installWorkspacePicker(workspaceName);
    await target.navigate('/');
    await seedWorkspace(workspaceName, 1);
    await target.navigate('/files');
    await target.click(selectors.getByRole('button', { name: 'Add Workspace' }));
    await target.expectVisible(selectors.getByText('1 project ready'), 10_000);
    const state = await readProjectStorageState();
    const [connectedWorkspace] = state.workspaces;
    if (!connectedWorkspace) {
      throw new Error('Connected workspace metadata is missing');
    }
    const { slug } = connectedWorkspace;

    await target.openSecondary('/projects');
    await target.expectVisible(selectors.getByText('Connection Fixture 0', { exact: true }), 20_000, 'secondary');
    await target.navigate(`/w/${slug}/project-0`, 'secondary');
    const unavailable = selectors.getByText("The project you're looking for doesn't exist or may have been deleted.");
    await target.expectHidden(unavailable, 60_000, 'secondary');
    await target.click(selectors.getByRole('button', { name: 'Disconnect workspace' }));
    await target.expectVisible(unavailable, 20_000, 'secondary');
    await target.click(selectors.getByRole('button', { name: 'Add Workspace' }));
    await target.expectVisible(selectors.getByText('1 project ready'), 10_000);
    await target.expectHidden(unavailable, 20_000, 'secondary');
  });

  test('mints a copied marked folder without rebinding the connected original', async () => {
    const originalName = 'workspace-connection-original';
    const copyName = 'workspace-connection-copy';
    await installWorkspacePicker([originalName, copyName]);
    await target.navigate('/');
    await seedWorkspace(originalName, 2);
    await target.navigate('/files');
    await target.click(selectors.getByRole('button', { name: 'Add Workspace' }));
    await target.expectVisible(selectors.getByText('2 projects ready'), 10_000);
    const before = await readProjectStorageState();
    const originalMarker = await readOpfsWorkspaceMarker(originalName);
    await copyOpfsDirectory(originalName, copyName);

    await target.click(selectors.getByRole('button', { name: 'Add Workspace' }));
    await target.expectVisible(selectors.getByText('2 projects need attention'), 10_000);
    const after = await readProjectStorageState();
    const copyMarker = await readOpfsWorkspaceMarker(copyName);

    expect(after.workspaces).toHaveLength(2);
    expect(after.handleWorkspaceIds).toHaveLength(2);
    expect(after.configs).toEqual(before.configs);
    expect(await readOpfsWorkspaceMarker(originalName)).toEqual(originalMarker);
    expect(copyMarker?.['workspaceId']).not.toEqual(originalMarker?.['workspaceId']);
  });

  test('leaves durable state untouched when generic and exact reconnect pickers are cancelled', async () => {
    const workspaceName = 'workspace-connection-cancel';
    await target.addInitScript(() => {
      Object.defineProperty(globalThis, 'showDirectoryPicker', {
        configurable: true,
        value: async () => {
          throw new DOMException('The user aborted a request.', 'AbortError');
        },
      });
    });
    await target.navigate('/files');
    const empty = await readProjectStorageState();
    await target.click(selectors.getByRole('button', { name: 'Add Workspace' }));
    expect(await readProjectStorageState()).toEqual(empty);
    expect(await readOpfsWorkspaceMarker(workspaceName)).toBeUndefined();
    await target.expectCount(selectors.getByText('Failed to connect workspace.'), 0);

    await target.evaluate(async (name) => {
      Object.defineProperty(globalThis, 'showDirectoryPicker', {
        configurable: true,
        value: async () => {
          const root = await navigator.storage.getDirectory();
          const handle = await root.getDirectoryHandle(name, { create: true });
          Object.defineProperties(handle, {
            queryPermission: { value: async () => 'granted' },
            requestPermission: { value: async () => 'granted' },
          });
          return handle;
        },
      });
    }, workspaceName);
    await seedWorkspace(workspaceName, 2);
    await target.click(selectors.getByRole('button', { name: 'Add Workspace' }));
    await target.expectVisible(selectors.getByText('2 projects ready'), 10_000);
    await target.click(selectors.getByRole('button', { name: 'Disconnect workspace' }));
    await target.navigate('/files?settings=filesystem');
    await target.expectVisible(selectors.getByRole('button', { name: 'Reconnect', exact: true }));
    await target.evaluate(() => {
      Object.defineProperty(globalThis, 'showDirectoryPicker', {
        configurable: true,
        value: async () => {
          throw new DOMException('The user aborted a request.', 'AbortError');
        },
      });
    });
    const disconnected = await readProjectStorageState();
    await target.click(selectors.getByRole('button', { name: 'Reconnect', exact: true }));
    expect(await readProjectStorageState()).toEqual(disconnected);
    await target.expectCount(selectors.getByText('Failed to change workspace folder.'), 0);
  });

  test('repairs verified historical aliases without modifying project files or an ambiguous duplicate', async () => {
    const count = 7;
    const aliases = ['wsp_111111111111111111111', 'wsp_222222222222222222222', 'wsp_333333333333333333333'] as const;
    await installWorkspacePicker(repairFixture);
    await target.navigate('/');
    await seedWorkspace(repairFixture, count);
    await target.evaluate(async (workspaceName) => {
      const root = await navigator.storage.getDirectory();
      const workspace = await root.getDirectoryHandle(workspaceName);
      const source = await workspace.getDirectoryHandle('project-0');
      const copy = await workspace.getDirectoryHandle('ambiguous-copy', { create: true });
      await Promise.all(
        ['tau.json', 'main.ts'].map(async (filename) => {
          try {
            const sourceFile = await source.getFileHandle(filename);
            const targetFile = await copy.getFileHandle(filename, { create: true });
            const writable = await targetFile.createWritable();
            const file = await sourceFile.getFile();
            await writable.write(await file.arrayBuffer());
            await writable.close();
          } catch (error) {
            if (!(error instanceof DOMException && error.name === 'NotFoundError')) {
              throw error;
            }
          }
        }),
      );
    }, repairFixture);
    await target.navigate('/files');
    await target.click(selectors.getByRole('button', { name: 'Add Workspace' }));
    await target.expectVisible(selectors.getByText('6 projects ready'), 10_000);
    const connected = await readProjectStorageState();
    const canonicalWorkspaceId = connected.workspaces[0]!.workspaceId;
    await seedDisconnectedWorkspaceAliases({
      canonicalWorkspaceId,
      aliasWorkspaceIds: aliases,
      retainedConfig: {
        projectId: 'proj_000000000000000000000',
        backend: 'webaccess',
        workspaceId: aliases[0],
        providerBasePath: 'project-0',
      },
    });
    const filesBefore = await readOpfsTree(repairFixture);

    await target.navigate('/projects');
    await target.expectVisible(selectors.getByText('6 projects are linked to previous workspace identities.'));
    await target.click(selectors.getByRole('button', { name: 'Repair links' }));
    await target.expectVisible(selectors.getByText(/will not move or modify folder contents/u));
    await target.click(selectors.getByRole('button', { name: 'Repair 6 projects' }));
    await target.expectVisible(selectors.getByText('Repaired 6 project links'));
    await target.expectCount(selectors.getByText('This copied project shares an identity with another directory.'), 2);

    const repaired = await readProjectStorageState();
    const filesAfter = await readOpfsTree(repairFixture);
    expect(repaired.configs.filter(({ workspaceId }) => workspaceId === canonicalWorkspaceId)).toHaveLength(6);
    expect(repaired.configs.filter(({ workspaceId }) => workspaceId === aliases[0])).toHaveLength(1);
    expect(
      repaired.workspaces.map(({ workspaceId }) => workspaceId).sort((left, right) => left.localeCompare(right)),
    ).toEqual([canonicalWorkspaceId, aliases[0]].sort((left, right) => left.localeCompare(right)));
    expect(repaired.handleWorkspaceIds).toEqual([canonicalWorkspaceId]);
    expect(filesAfter).toEqual(filesBefore);
  });
});
