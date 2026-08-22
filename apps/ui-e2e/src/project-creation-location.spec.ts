import { describe, expect, test } from 'vitest';
import { page as selectors, server } from 'vitest/browser';
import * as target from '#support/external-target.js';
import {
  deleteWorkspaceHandle,
  readOpfsProjectEvidence,
  readOpfsTree,
  readProjectStorageState,
} from '#support/project-storage-state.js';
import type { StoredProjectConfig } from '#support/project-storage-state.js';
import { installProjectCreationFixture } from '#support/project-creation-location-fixture.js';

type SeededWorkspace = {
  readonly fixture: string;
  readonly workspaceId: string;
  readonly name: string;
  readonly slug: string;
};

const editorFor = () =>
  selectors.getByCss('.tiptap[contenteditable="true"], textarea[placeholder="Ask Tau to build anything..."]').first();

const seedWorkspace = async (fixture: string): Promise<SeededWorkspace> => {
  await target.navigate(`/__e2e/project-creation-location?fixture=${fixture}`);
  const status = selectors.getByTestId('project-creation-location-fixture');
  await target.expectVisible(status, 60_000);
  return {
    fixture,
    workspaceId: (await target.getAttribute(status, 'data-workspace-id'))!,
    name: (await target.getAttribute(status, 'data-workspace-name'))!,
    slug: (await target.getAttribute(status, 'data-workspace-slug'))!,
  };
};

const openHomepage = async (): Promise<void> => {
  await target.navigate('/');
  await target.expectVisible(editorFor(), 60_000);
};

const selectReplicad = async (): Promise<void> => {
  await target.click(selectors.getByRole('button', { name: 'Replicad', exact: true }));
};

const selectLocation = async (currentLabel: string | RegExp, targetLabel: string): Promise<void> => {
  await target.click(selectors.getByRole('button', { name: currentLabel }));
  await target.click(selectors.getByRole('option', { name: targetLabel }));
};

const projectSlugFromPath = (path: string): string => path.slice(path.lastIndexOf('/') + 1);

const waitForCurrentConfig = async (
  excludedProjectIds: ReadonlySet<string> = new Set(),
): Promise<StoredProjectConfig> => {
  const projectSlug = await target.evaluate(() => location.pathname.slice(location.pathname.lastIndexOf('/') + 1));
  await expect
    .poll(
      async () => {
        const state = await readProjectStorageState();
        return state.configs.some(
          ({ projectId, providerBasePath }) =>
            !excludedProjectIds.has(projectId) && projectSlugFromPath(providerBasePath) === projectSlug,
        );
      },
      { timeout: 60_000 },
    )
    .toBe(true);
  const state = await readProjectStorageState();
  return state.configs.find(
    ({ projectId, providerBasePath }) =>
      !excludedProjectIds.has(projectId) && projectSlugFromPath(providerBasePath) === projectSlug,
  )!;
};

const createFromHomepage = async (prompt: string): Promise<StoredProjectConfig> => {
  const priorState = await readProjectStorageState();
  const priorProjectIds = new Set(priorState.configs.map(({ projectId }) => projectId));
  const editor = editorFor();
  await target.fill(editor, prompt);
  await target.press(editor, 'Enter');
  await target.expectUrl(/\/w\/[^/]+\/[^/]+$/u, 60_000);
  return waitForCurrentConfig(priorProjectIds);
};

const expectManifest = (
  evidence: Awaited<ReturnType<typeof readOpfsProjectEvidence>>,
  expected: { readonly id: string; readonly name: string },
): void => {
  expect(evidence).toBeDefined();
  const manifest = JSON.parse(evidence!.manifestText) as { id: string; name: string };
  expect({ id: manifest.id, name: manifest.name }).toEqual(expected);
};

describe('project creation locations', () => {
  test('uses Home on first-use homepage creation and writes Home OPFS bytes', async ({ skip }) => {
    skip(server.browser !== 'chromium', 'File System Access workflows run in Chromium.');
    await installProjectCreationFixture({
      pickerFixture: 'unused-home-picker',
      projectName: 'Home Browser Project',
    });
    await openHomepage();
    await target.expectVisible(selectors.getByRole('button', { name: 'Create in Home' }));
    await selectReplicad();

    const config = await createFromHomepage('Create a precise browser fixture');

    expect(config.backend).toBe('opfs');
    const evidence = await readOpfsProjectEvidence({ providerBasePath: config.providerBasePath });
    expectManifest(evidence, { id: config.projectId, name: 'Home Browser Project' });
    expect(evidence!.sourceText).toContain("import {} from 'replicad'");
    const state = await readProjectStorageState();
    expect(state.preference).toEqual({ kind: 'home' });
  });

  test('creates in the selected disk workspace with exact bytes and no Home copy', async ({ skip }) => {
    skip(server.browser !== 'chromium', 'File System Access workflows run in Chromium.');
    const fixture = 'disk-physical-workspace';
    await installProjectCreationFixture({ pickerFixture: fixture, projectName: 'Disk Browser Project' });
    const workspace = await seedWorkspace(fixture);
    await openHomepage();
    await target.click(selectors.getByRole('button', { name: /^Create in Home/u }));
    await target.expectCount(selectors.getByPlaceholder('Search locations...'), 0);
    const homeOption = selectors.getByRole('option', { name: 'Home in this browser' });
    const workspaceOption = selectors.getByRole('option', { name: `${workspace.name} on your disk` });
    await target.expectVisible(homeOption.getByLabelText('Selected location'));
    await target.expectCount(workspaceOption.getByLabelText('Selected location'), 0);
    await target.click(workspaceOption);
    await selectReplicad();

    const config = await createFromHomepage('Create on the selected disk');

    expect(config).toMatchObject({ backend: 'webaccess', workspaceId: workspace.workspaceId });
    await target.expectUrl(new RegExp(`/w/${workspace.slug}/[^/]+$`, 'u'));
    const evidence = await readOpfsProjectEvidence({
      fixture,
      providerBasePath: config.providerBasePath,
    });
    expectManifest(evidence, { id: config.projectId, name: 'Disk Browser Project' });
    expect(evidence!.sourceText).toContain("import {} from 'replicad'");
    expect(await readOpfsProjectEvidence({ providerBasePath: config.providerBasePath })).toBeUndefined();
  });

  test('remembers a successful disk choice across homepage reload', async ({ skip }) => {
    skip(server.browser !== 'chromium', 'File System Access workflows run in Chromium.');
    const fixture = 'remembered-disk-workspace';
    await installProjectCreationFixture({ pickerFixture: fixture, projectName: 'Remember Disk Project' });
    const workspace = await seedWorkspace(fixture);
    await openHomepage();
    await selectLocation(/^Create in Home/u, `${workspace.name} on your disk`);
    await createFromHomepage('Remember this disk location');

    await openHomepage();
    await target.reload();

    await target.expectVisible(selectors.getByRole('button', { name: `Create in ${workspace.name}` }), 60_000);
    const state = await readProjectStorageState();
    expect(state.preference).toEqual({
      kind: 'workspace',
      workspaceId: workspace.workspaceId,
    });
  });

  test('a later successful Home creation replaces the disk preference', async ({ skip }) => {
    skip(server.browser !== 'chromium', 'File System Access workflows run in Chromium.');
    const fixture = 'replace-with-home-workspace';
    await installProjectCreationFixture({ pickerFixture: fixture, projectName: 'Replace Preference Project' });
    const workspace = await seedWorkspace(fixture);
    await openHomepage();
    await selectLocation(/^Create in Home/u, `${workspace.name} on your disk`);
    await createFromHomepage('First create on disk');
    await openHomepage();
    await selectLocation(`Create in ${workspace.name}`, 'Home in this browser');

    const config = await createFromHomepage('Then create in Home');

    expect(config.backend).toBe('opfs');
    const state = await readProjectStorageState();
    expect(state.preference).toEqual({ kind: 'home' });
    await openHomepage();
    await target.reload();
    await target.expectVisible(selectors.getByRole('button', { name: 'Create in Home' }), 60_000);
  });

  test('/projects/new reads the same preference and creates in the exact workspace', async ({ skip }) => {
    skip(server.browser !== 'chromium', 'File System Access workflows run in Chromium.');
    const fixture = 'route-shared-workspace';
    await installProjectCreationFixture({ pickerFixture: fixture, projectName: 'Seed Route Preference' });
    const workspace = await seedWorkspace(fixture);
    await openHomepage();
    await selectLocation(/^Create in Home/u, `${workspace.name} on your disk`);
    await createFromHomepage('Seed the shared route preference');

    await target.navigate('/projects/new');
    await target.expectVisible(selectors.getByRole('button', { name: `Create in ${workspace.name}` }), 60_000);
    await target.fill(selectors.getByLabelText('Project Name *'), 'Shared Route Destination');
    await target.click(selectors.getByRole('button', { name: /Create Project/u }));
    await target.expectUrl(new RegExp(`/w/${workspace.slug}/shared-route-destination$`, 'u'), 60_000);

    const config = await waitForCurrentConfig();
    expect(config).toMatchObject({ backend: 'webaccess', workspaceId: workspace.workspaceId });
    const evidence = await readOpfsProjectEvidence({ fixture, providerBasePath: config.providerBasePath });
    expectManifest(evidence, { id: config.projectId, name: 'Shared Route Destination' });
  });

  test('/projects/new uses a root location drawer on mobile', async ({ skip }) => {
    skip(server.browser !== 'chromium', 'File System Access workflows run in Chromium.');
    const fixture = 'mobile-route-workspace';
    await target.setViewport({ width: 390, height: 844 });
    await installProjectCreationFixture({ pickerFixture: fixture, projectName: 'Mobile Route Project' });
    const workspace = await seedWorkspace(fixture);

    await target.navigate('/projects/new');
    await target.expectVisible(selectors.getByLabelText('Project Name *'), 60_000);
    await target.click(selectors.getByRole('button', { name: 'Create in Home' }));
    const locationDrawer = selectors.getByRole('dialog', { name: 'Select a project location' });
    await target.expectVisible(locationDrawer);
    await target.expectCount(locationDrawer.getByPlaceholder('Search locations...'), 0);
    await target.click(locationDrawer.getByRole('option', { name: `${workspace.name} on your disk` }));
    await target.expectCount(locationDrawer, 0);

    const projectNameInput = selectors.getByLabelText('Project Name *');
    await target.fill(projectNameInput, 'Mobile Route Destination');
    await target.press(projectNameInput, 'Enter');
    await target.expectUrl(new RegExp(`/w/${workspace.slug}/mobile-route-destination$`, 'u'), 60_000);

    const config = await waitForCurrentConfig();
    expect(config).toMatchObject({ backend: 'webaccess', workspaceId: workspace.workspaceId });
    const evidence = await readOpfsProjectEvidence({ fixture, providerBasePath: config.providerBasePath });
    expectManifest(evidence, { id: config.projectId, name: 'Mobile Route Destination' });
  });

  test('Connect a folder preserves the draft and the new workspace can receive the project', async ({ skip }) => {
    skip(server.browser !== 'chromium', 'File System Access workflows run in Chromium.');
    const fixture = 'connected-from-composer';
    await installProjectCreationFixture({ pickerFixture: fixture, projectName: 'Connected Draft Project' });
    await openHomepage();
    await selectReplicad();
    const editor = editorFor();
    await target.fill(editor, 'Keep this draft through folder selection');
    await target.click(selectors.getByRole('button', { name: 'Create in Home' }));
    await target.click(selectors.getByText('Connect a folder…', { exact: true }));

    await target.expectVisible(selectors.getByRole('button', { name: `Create in ${fixture}` }), 60_000);
    expect(await target.textContent(editor)).toBe('Keep this draft through folder selection');
    await target.press(editor, 'Enter');
    await target.expectUrl(/\/w\/connected-from-composer\/[^/]+$/u, 60_000);

    const config = await waitForCurrentConfig();
    expect(config.backend).toBe('webaccess');
    expect(await readOpfsProjectEvidence({ fixture, providerBasePath: config.providerBasePath })).toBeDefined();
  });

  test('handle eviction blocks submit without clearing the draft or falling back to Home', async ({ skip }) => {
    skip(server.browser !== 'chromium', 'File System Access workflows run in Chromium.');
    const fixture = 'evicted-handle-workspace';
    await installProjectCreationFixture({ pickerFixture: fixture, projectName: 'Must Not Be Created' });
    const workspace = await seedWorkspace(fixture);
    await openHomepage();
    await selectLocation(/^Create in Home/u, `${workspace.name} on your disk`);
    const editor = editorFor();
    await target.fill(editor, 'Do not silently place this in Home');
    const beforeTree = await readOpfsTree(fixture);
    await deleteWorkspaceHandle(workspace.workspaceId);

    await target.press(editor, 'Enter');

    await target.expectVisible(
      selectors.getByText('This project location is no longer connected.', { exact: true }),
      60_000,
    );
    expect(await target.textContent(editor)).toBe('Do not silently place this in Home');
    const state = await readProjectStorageState();
    expect(state.configs).toEqual([]);
    expect(state.handleWorkspaceIds).not.toContain(workspace.workspaceId);
    expect(await readOpfsTree(fixture)).toEqual(beforeTree);
  });

  test('mobile Location selection closes options, restores focus, and creates on disk', async ({ skip }) => {
    skip(server.browser !== 'chromium', 'File System Access workflows run in Chromium.');
    const fixture = 'mobile-disk-workspace';
    await target.setViewport({ width: 390, height: 844 });
    await installProjectCreationFixture({ pickerFixture: fixture, projectName: 'Mobile Disk Project' });
    const workspace = await seedWorkspace(fixture);
    await openHomepage();
    await selectReplicad();
    const editor = editorFor();
    await target.fill(editor, 'Create this from mobile options');
    await target.click(selectors.getByRole('button', { name: 'Open chat options' }));
    const chatOptions = selectors.getByRole('dialog', { name: 'Chat Options' });
    await target.expectVisible(chatOptions);
    await target.click(selectors.getByRole('button', { name: 'Create in Home' }));
    const locationDrawer = selectors.getByRole('dialog', { name: 'Select a project location' });
    await target.expectVisible(locationDrawer);
    await target.expectCount(locationDrawer.getByPlaceholder('Search locations...'), 0);
    await target.press(locationDrawer.getByRole('option', { name: 'Home in this browser' }), 'Escape');
    await target.expectCount(locationDrawer, 0);
    await target.expectVisible(chatOptions);
    expect(await target.textContent(editor)).toBe('Create this from mobile options');

    await target.click(selectors.getByRole('button', { name: 'Create in Home' }));
    await target.click(
      selectors
        .getByRole('dialog', { name: 'Select a project location' })
        .getByRole('option', { name: `${workspace.name} on your disk` }),
    );

    await target.expectCount(chatOptions, 0);
    await target.expectFocused(editor);
    expect(await target.textContent(editor)).toBe('Create this from mobile options');
    await target.press(editor, 'Enter');
    await target.expectUrl(new RegExp(`/w/${workspace.slug}/[^/]+$`, 'u'), 60_000);

    const config = await waitForCurrentConfig();
    expect(config).toMatchObject({ backend: 'webaccess', workspaceId: workspace.workspaceId });
    expect(await readOpfsProjectEvidence({ fixture, providerBasePath: config.providerBasePath })).toBeDefined();
  });
});
