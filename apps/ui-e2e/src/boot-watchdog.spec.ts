/**
 * T-B28.3 (B28): a page whose bundle never runs still offers a way out. With the entry chunk answered 500, the
 * server-rendered document's inline watchdog shows its strip after 20 s; its safe-mode link loads Home with the
 * safe-mode bar, and the first navigation drops `safe=1`, so safe mode lasts one page load.
 *
 * The blueprint row also asserts that safe mode polls no workspace: the root file manager configures Home alone in safe
 * mode (`homeOnlyConfiguration` in `lib/boot-signals.ts`, applied through `runtime/root-configuration.ts`).
 */
import { test } from 'vitest';
import { page as selectors } from 'vitest/browser';
import * as target from '#support/external-target.js';

test('shows the boot strip without the bundle and opens Home in safe mode for one page load', async () => {
  await target.commands.uiFailEntryChunk(true);
  await target.navigate('/');

  const strip = selectors.getByCss('#tau-boot-strip');
  await target.expectHidden(strip, 5000);
  await target.expectVisible(strip, 30_000);
  await target.expectVisible(strip.getByRole('button', { name: 'Reload' }));

  await target.commands.uiFailEntryChunk(false);
  await target.click(strip.getByRole('link', { name: 'Open in safe mode' }));
  await target.expectUrl(/\/\?safe=1$/u, 30_000);

  await target.expectVisible(selectors.getByCss('[data-slot="safe-mode-bar"]'), 60_000);
  await target.expectVisible(selectors.getByCss('[data-slot="sidebar-wrapper"]'));
  await target.expectHidden(strip);

  await target.click(selectors.getByRole('link', { name: 'Projects', exact: true }).first());
  await target.expectUrl(/\/projects$/u, 30_000);
});

const workspaceName = 'boot-watchdog-safe-mode';
const workspaceProjectName = 'Safe Mode Workspace Project';
const homeProjectName = 'Safe Mode Home Project';

/** An OPFS folder the stubbed picker hands out as a granted workspace, with one valid project in it. */
const installWorkspaceWithProject = async (): Promise<void> => {
  await target.addInitScript((name: string) => {
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
  await target.navigate('/');
  await target.evaluate(
    async ({ name, projectName }) => {
      const root = await navigator.storage.getDirectory();
      const workspace = await root.getDirectoryHandle(name, { create: true });
      const directory = await workspace.getDirectoryHandle('project-0', { create: true });
      const metadata = await directory.getDirectoryHandle('.tau', { create: true });
      const identityFile = await metadata.getFileHandle('project.json', { create: true });
      const identity = await identityFile.createWritable();
      await identity.write(JSON.stringify({ version: 1, projectId: `proj_${'0'.repeat(21)}` }));
      await identity.close();
      const manifestFile = await directory.getFileHandle('tau.json', { create: true });
      const manifest = await manifestFile.createWritable();
      await manifest.write(
        JSON.stringify({
          $schema: 'https://tau.new/schemas/tau-v1.json',
          name: projectName,
          description: '',
          tags: [],
          assets: { main: { entryPath: 'main.ts' } },
        }),
      );
      await manifest.close();
    },
    { name: workspaceName, projectName: workspaceProjectName },
  );
};

/* R12 web, Home-only narrowing (WP2): safe mode configures Home alone, so the workspace's project is neither listed nor
 * polled. */
test('lists and polls no connected workspace in safe mode', async () => {
  await installWorkspaceWithProject();
  await target.navigate('/files');
  await target.click(selectors.getByRole('button', { name: 'Add Workspace' }));
  await target.expectVisible(selectors.getByText(/^1 projects? ready$/u), 30_000);

  await target.navigate('/projects/new');
  await target.expectVisible(selectors.getByRole('button', { name: 'Create in Home' }), 60_000);
  await target.fill(selectors.getByLabelText('Project Name *'), homeProjectName);
  await target.click(selectors.getByRole('button', { name: /Create Project/u }));
  await target.expectUrl(/\/w\/home\/[^/]+$/u, 60_000);

  /* Control: a normal start lists both projects. */
  await target.navigate('/projects');
  await target.expectVisible(selectors.getByText(workspaceProjectName, { exact: true }).first(), 60_000);

  await target.navigate('/?safe=1');
  await target.expectVisible(selectors.getByCss('[data-slot="safe-mode-bar"]'), 60_000);
  await target.click(selectors.getByRole('link', { name: 'Projects', exact: true }).first());
  await target.expectVisible(selectors.getByText(homeProjectName, { exact: true }).first(), 60_000);
  await target.expectCount(selectors.getByText(workspaceProjectName, { exact: true }), 0, 10_000);
});
