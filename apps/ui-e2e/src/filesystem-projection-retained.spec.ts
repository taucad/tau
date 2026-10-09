import { base64ToUint8Array } from 'uint8array-extras';
import { expect, test } from 'vitest';
import { page as selectors } from 'vitest/browser';
import * as target from '#support/external-target.js';
import { readProjectStorageState, readProjectTree } from '#support/project-storage-state.js';
import {
  validateProjectionClosure,
  encodeProjectionFile,
  decodeProjectionFile,
} from '#support/filesystem-projection-writer.js';
import type { ProjectionClosure } from '#support/filesystem-projection-writer.js';
import { openChat, reply, expectLogInvariant } from '#support/chat-admission.js';
import { sendDraft } from '#support/chat-attachments.js';
import {
  exportProjectionProjectClosure,
  importProjectionProjectClosure,
  projectionProject,
  projectionLog,
  writeProjectionProjectFile,
} from '#support/filesystem-projection.js';

const readHashedDownloads = async () => {
  const downloads = await target.readObservedDownloads();
  return Promise.all(
    downloads.map(async (download) => {
      const bytes = base64ToUint8Array(download.base64);
      const digest = await crypto.subtle.digest('SHA-256', bytes);
      return {
        ...download,
        byteLength: bytes.length,
        sha256: [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join(''),
      };
    }),
  );
};

test('adopts independent rooted layout and view records in the retained browser document', async () => {
  await target.navigate('/__e2e/project-file-tree');
  await target.expectUrl(/\/w\/[^/]+\/[^/]+/u, 60_000);
  const initialTimeOrigin = await target.evaluate(() => performance.timeOrigin);
  const route = await target.evaluate(() => location.pathname.split('/').at(-1));
  const state = await readProjectStorageState();
  const config = state.configs.find(
    (candidate) => candidate.providerBasePath.split('/').findLast((part) => part !== '') === route,
  );
  if (!config) {
    throw new Error('The mounted project has no persistent provider configuration.');
  }
  try {
    expect(['opfs', 'indexeddb']).toContain(config.backend);
  } catch (error) {
    try {
      await target.writeArtifact(
        'projection-retained-provider-precondition.json',
        JSON.stringify(
          {
            config,
            handleWorkspaceIds: state.handleWorkspaceIds,
            originalFailure: String(error),
            document: await target.evaluate(() => ({
              pathname: location.pathname,
              text: document.body.textContent.slice(-8000),
            })),
          },
          null,
          2,
        ),
      );
      await target.screenshot(undefined, 'projection-retained-provider-precondition.png');
      const physical = await readProjectTree(config);
      await target.writeArtifact(
        'projection-retained-provider-physical.json',
        JSON.stringify({ config, physicalPaths: Object.keys(physical).slice(0, 128) }, null, 2),
      );
    } catch (captureError) {
      await target
        .writeArtifact(
          'projection-retained-provider-capture-error.json',
          JSON.stringify({
            originalFailure: String(error),
            captureFailure: String(captureError),
          }),
        )
        .catch(() => undefined);
    }
    throw error;
  }
  // The route resolves its default chat asynchronously and replaces the URL once that durable chat is ready.
  await expect
    .poll(
      async () => {
        const chatId = await target.evaluate(() => new URL(location.href).searchParams.get('chat'));
        if (!chatId) {
          return false;
        }
        const physical = await readProjectTree(config);
        return physical[`/.tau/chats/${chatId}/chat.json`] !== undefined;
      },
      { timeout: 60_000 },
    )
    .toBe(true);
  const before = await target.evaluate(() => ({
    href: location.href,
    timeOrigin: performance.timeOrigin,
  }));
  expect(before.timeOrigin).toBe(initialTimeOrigin);
  const layoutPath = '/.tau/workbench/layout.json';
  await expect
    .poll(
      async () => {
        const tree = await readProjectTree(config);
        return tree[layoutPath];
      },
      { timeout: 60_000 },
    )
    .toBeDefined();
  const tree = await readProjectTree(config);
  const initial = JSON.parse(tree[layoutPath]!) as {
    viewer: { kind: 'group'; tabs: Array<{ kind: 'view'; view: string }> };
  };
  const viewId = 'projection-retained-front';
  const receipt = await writeProjectionProjectFile(
    config,
    `.tau/workbench/views/${viewId}.json`,
    JSON.stringify({
      version: 1,
      entryPath: 'public/models/honeycomb.js',
      name: 'Retained front',
      camera: { kind: 'look', direction: [1, 0, 0] },
      grid: { unit: 'in' },
      section: { active: true, cuts: [{ kind: 'plane', plane: 'xy', offset: 0.012, isFlipped: false }] },
    }),
  );
  expect(receipt.events.length).toBeGreaterThan(0);
  await writeProjectionProjectFile(
    config,
    '.tau/workbench/layout.json',
    JSON.stringify({
      ...initial,
      viewer: {
        ...initial.viewer,
        tabs: [...initial.viewer.tabs, { kind: 'view', view: viewId }],
        active: initial.viewer.tabs.length,
      },
    }),
  );
  await target.expectVisible(selectors.getByCss(`.dv-tab[data-tab-panel-id="${viewId}"]`), 60_000);
  await target.expectVisible(selectors.getByRole('button', { name: /Grid .* in, units and grid/iu }), 60_000);
  await expect
    .poll(
      async () =>
        target.evaluate(() => {
          const bridges =
            (
              globalThis as {
                __TAU_SECTION_VIEW_TEST_BRIDGES__?: Array<{
                  getCamera(): { position: number[]; target: number[] };
                  getSectionState(): {
                    isActive: boolean;
                    cuts: Array<{ kind: string; plane?: string; offset?: number }>;
                  };
                }>;
              }
            ).__TAU_SECTION_VIEW_TEST_BRIDGES__ ?? [];
          return bridges.some((bridge) => {
            const camera = bridge.getCamera();
            const direction = camera.position.map((value, index) => value - camera.target[index]!);
            const length = Math.hypot(...direction);
            const section = bridge.getSectionState();
            return (
              direction[0]! / length > 0.95 &&
              Math.abs(direction[1]! / length) < 0.05 &&
              Math.abs(direction[2]! / length) < 0.05 &&
              section.isActive &&
              section.cuts.some((cut) => cut.kind === 'plane' && cut.plane === 'xy' && cut.offset === 0.012)
            );
          });
        }),
      { timeout: 60_000 },
    )
    .toBe(true);
  await writeProjectionProjectFile(
    config,
    'public/models/honeycomb.js',
    `import { makeBaseBox } from 'replicad';
export default function main() { return [{ name: 'Base', shape: makeBaseBox(20, 14, 4) }, { name: 'Cap', shape: makeBaseBox(10, 10, 5).translate([30, 0, 0]) }]; }
`,
  );
  // S20: renderer state, rather than just successful filesystem writes, witnesses adoption.
  const components = async (): Promise<Array<{ id: string; name: string }>> =>
    target.evaluate(() => {
      const bridge = (
        globalThis as {
          __TAU_SECTION_VIEW_TEST__?: {
            getModelComponents(): Array<{ id: string; name: string }>;
          };
        }
      ).__TAU_SECTION_VIEW_TEST__;
      return bridge?.getModelComponents() ?? [];
    });
  // The previous honeycomb manifest already has multiple nodes. Wait for the authored
  // sibling parts, rather than accepting an old manifest or an ancestor/descendant pair.
  await expect
    .poll(
      async () => {
        const current = await components();
        return current.some(({ name }) => name === 'Base') && current.some(({ name }) => name === 'Cap');
      },
      { timeout: 60_000 },
    )
    .toBe(true);
  const currentComponents = await components();
  const componentId = currentComponents.find(({ name }) => name === 'Base')?.id;
  const otherComponentId = currentComponents.find(({ name }) => name === 'Cap')?.id;
  if (!componentId || !otherComponentId || componentId === otherComponentId) {
    throw new Error('The authored Base and Cap must be distinct rendered component identities.');
  }
  await writeProjectionProjectFile(
    config,
    '.tau/workbench/entries.json',
    JSON.stringify({
      version: 1,
      entries: { 'public/models/honeycomb.js': { renderTimeout: 0, components: { hidden: [componentId] } } },
    }),
  );
  await expect
    .poll(
      async () =>
        target.evaluate((id) => {
          const bridges =
            (
              globalThis as {
                __TAU_SECTION_VIEW_TEST_BRIDGES__?: Array<{ getModelVisibility(): { hiddenComponentIds: string[] } }>;
              }
            ).__TAU_SECTION_VIEW_TEST_BRIDGES__ ?? [];
          return bridges.some((bridge) => bridge.getModelVisibility().hiddenComponentIds.includes(id));
        }, componentId),
      { timeout: 60_000 },
    )
    .toBe(true);
  await writeProjectionProjectFile(
    config,
    '.tau/workbench/entries.json',
    JSON.stringify({
      version: 1,
      entries: {
        'public/models/honeycomb.js': {
          renderTimeout: 0,
          components: { hidden: [], isolated: [componentId], opacity: [{ id: componentId, opacity: 0.25 }] },
        },
      },
    }),
  );
  try {
    await expect
      .poll(
        async () =>
          target.evaluate(
            ({ id, otherId }) => {
              const bridges =
                (
                  globalThis as {
                    __TAU_SECTION_VIEW_TEST_BRIDGES__?: Array<{
                      getModelVisibility(): { isolatedComponentIds: string[] };
                      getRenderedModelComponentState(id: string): {
                        meshCount: number;
                        visibleMeshCount: number;
                        surfaceMaterialOpacities: number[];
                        edgeMaterialOpacities: number[];
                      };
                    }>;
                  }
                ).__TAU_SECTION_VIEW_TEST_BRIDGES__ ?? [];
              return bridges.some((bridge) => {
                const chosen = bridge.getRenderedModelComponentState(id);
                const other = bridge.getRenderedModelComponentState(otherId);
                return (
                  bridge.getModelVisibility().isolatedComponentIds.includes(id) &&
                  chosen.visibleMeshCount > 0 &&
                  other.meshCount > 0 &&
                  other.visibleMeshCount === 0 &&
                  chosen.surfaceMaterialOpacities.length > 0 &&
                  chosen.surfaceMaterialOpacities.every((opacity) => Math.abs(opacity - 0.25) < 0.001) &&
                  chosen.edgeMaterialOpacities.length > 0 &&
                  chosen.edgeMaterialOpacities.every((opacity) => opacity === 1)
                );
              });
            },
            { id: componentId, otherId: otherComponentId },
          ),
        { timeout: 60_000 },
      )
      .toBe(true);
  } catch (error) {
    await target.writeArtifact(
      'projection-retained-component-state.json',
      JSON.stringify(
        {
          originalFailure: String(error),
          componentId,
          otherComponentId,
          config,
          state: await target.evaluate(
            ({ id, otherId }) => {
              const bridges = Reflect.get(globalThis, '__TAU_SECTION_VIEW_TEST_BRIDGES__') as
                | Array<{
                    getModelComponents(): unknown;
                    getModelVisibility(): unknown;
                    getRenderedModelComponentState(id: string): unknown;
                  }>
                | undefined;
              return {
                href: location.href,
                timeOrigin: performance.timeOrigin,
                text: document.body.textContent.slice(-8000),
                bridges: bridges?.map((bridge) => ({
                  components: bridge.getModelComponents(),
                  visibility: bridge.getModelVisibility(),
                  chosen: bridge.getRenderedModelComponentState(id),
                  other: bridge.getRenderedModelComponentState(otherId),
                })),
              };
            },
            { id: componentId, otherId: otherComponentId },
          ),
          physical: await readProjectTree(config),
        },
        null,
        2,
      ),
    );
    await target.screenshot(undefined, 'projection-retained-component-state.png');
    throw error;
  }
  await target.click(selectors.getByRole('button', { name: 'Viewer settings' }).last());
  await target.expectVisible(
    selectors.getByCss('[data-slot="dropdown-menu-select-item"] [role="combobox"]').filter({ hasText: 'Disabled' }),
    60_000,
  );
  await target.keyboardPress('Escape');
  // S15: keep the export panel mounted while independently authored preferences arrive.
  await target.click(selectors.getByRole('button', { name: 'Search', exact: true }));
  await target.fill(selectors.getByPlaceholder('Search projects, chats, and actions…'), 'Export');
  await target.click(selectors.getByRole('option', { name: /^Export(?:\s|$)/u }));
  await target.expectVisible(selectors.getByCss('[data-slot="export-panel-body"]'), 60_000);
  await writeProjectionProjectFile(
    config,
    '.tau/export/preferences.json',
    JSON.stringify({
      selectedFormats: ['stl'],
      shouldDownload: false,
      shouldSaveToProject: true,
    }),
  );
  await target.expectAttribute(selectors.getByRole('button', { name: /^STL$/iu }), 'aria-pressed', 'true');
  await target.expectAttribute(
    selectors.getByRole('checkbox', { name: 'Download to disk', exact: true }),
    'data-state',
    'unchecked',
  );
  await target.expectAttribute(
    selectors.getByRole('checkbox', { name: 'Save to project', exact: true }),
    'data-state',
    'checked',
  );
  expect(await target.evaluate(() => ({ href: location.href, timeOrigin: performance.timeOrigin }))).toEqual(before);
});

test('qualifies binary closure hashes and rejects tampered or escaping fixture bytes before import', async () => {
  const manifest = [...new TextEncoder().encode(JSON.stringify({ id: 'fixture-project' }))];
  const binary = [0, 255, 128, 1];
  const closure: ProjectionClosure = {
    version: 2,
    project: {
      projectId: 'fixture-project',
      backend: 'opfs',
      providerBasePath: 'fixture-project',
      databasePrefix: 'tau-',
    },
    directories: ['.git', '.git/objects'],
    files: [
      await encodeProjectionFile('tau.json', new Uint8Array(manifest)),
      await encodeProjectionFile('.git/objects/binary', new Uint8Array(binary)),
    ],
  };
  await expect(validateProjectionClosure(closure)).resolves.toBeUndefined();
  await expect(
    validateProjectionClosure({
      ...closure,
      files: [closure.files[0]!, { ...closure.files[1]!, base64Chunks: ['AP6AAQ=='] }],
    }),
  ).rejects.toThrow('byte proof failed');
  await expect(
    validateProjectionClosure({ ...closure, files: [closure.files[0]!, { ...closure.files[1]!, path: '../outside' }] }),
  ).rejects.toThrow('rooted fixture path');
  await expect(
    validateProjectionClosure({ ...closure, project: { ...closure.project, projectId: 'foreign-project' } }),
  ).rejects.toThrow('manifest identity');
});

const retainedManualEnabled =
  (import.meta as ImportMeta & { readonly env: Readonly<Record<string, string | undefined>> }).env[
    'VITE_TAU_E2E_RETAINED_MANUAL'
  ] === 'true';

const installRetainedControls = (title: string): void => {
  const state = { writes: [] as string[], checkpoints: [] as string[], end: false };
  Object.assign(globalThis, { __tauRetainedManual: state });
  document.title = title;
  const controls = document.createElement('aside');
  controls.setAttribute('aria-label', 'Retained fixture controls');
  controls.style.cssText =
    'position:fixed;top:8px;right:8px;z-index:2147483647;background:white;color:black;padding:8px;border:1px solid black';
  for (const kind of ['view', 'entries', 'preferences']) {
    const button = document.createElement('button');
    button.textContent = `Apply independent ${kind}`;
    button.addEventListener('click', () => {
      state.writes.push(kind);
    });
    controls.append(button);
  }
  const name = document.createElement('input');
  name.setAttribute('aria-label', 'Checkpoint name');
  const capture = document.createElement('button');
  capture.textContent = 'Capture checkpoint';
  capture.addEventListener('click', () => {
    state.checkpoints.push(name.value.trim() || `checkpoint-${Date.now()}`);
  });
  const end = document.createElement('button');
  end.textContent = 'End manual fixture';
  end.addEventListener('click', () => {
    state.checkpoints.push('end');
    state.end = true;
  });
  controls.append(name, capture, end);
  document.body.append(controls);
};

const readRetainedFlags = (): { writes: string[]; checkpoints: string[]; end: boolean } => {
  const state = (
    globalThis as typeof globalThis & { __tauRetainedManual: { writes: string[]; checkpoints: string[]; end: boolean } }
  ).__tauRetainedManual;
  const flags = { writes: [...state.writes], checkpoints: [...state.checkpoints], end: state.end };
  state.writes = [];
  state.checkpoints = [];
  return flags;
};

test.describe.skipIf(!retainedManualEnabled)('retained browser manual fixture', () => {
  const prepare = async () => {
    await target.navigate('/__e2e/project-file-tree?workspace=projection-retained-manual');
    await target.expectUrl(/\/w\/[^/]+\/[^/]+/u, 60_000);
    const slug = await target.evaluate(() => location.pathname.split('/').at(-1));
    const state = await readProjectStorageState();
    const config = state.configs.find(
      (candidate) => candidate.providerBasePath.split('/').findLast((part) => part !== '') === slug,
    );
    if (!config) {
      throw new Error('Retained manual seed has no persistent provider identity.');
    }
    const model = `import { makeBaseBox } from 'replicad';
export default function main() { return [{ name: 'Base', shape: makeBaseBox(20, 14, 4) }, { name: 'Cap', shape: makeBaseBox(10, 10, 5).translate([30, 0, 0]) }]; }
`;
    await writeProjectionProjectFile(config, 'public/models/honeycomb.js', model);
    const components = async (): Promise<string[]> =>
      target.evaluate(
        () =>
          (
            globalThis as { __TAU_SECTION_VIEW_TEST__?: { getModelComponents(): Array<{ id: string }> } }
          ).__TAU_SECTION_VIEW_TEST__
            ?.getModelComponents()
            .map(({ id }) => id) ?? [],
      );
    await expect
      .poll(
        async () => {
          const ids = await components();
          return ids.length;
        },
        { timeout: 60_000 },
      )
      .toBeGreaterThanOrEqual(2);
    const componentIds = await components();
    await expect
      .poll(
        async () => {
          const tree = await readProjectTree(config);
          return tree['/.tau/workbench/layout.json'];
        },
        { timeout: 60_000 },
      )
      .toBeDefined();
    const tree = await readProjectTree(config);
    const layout = JSON.parse(tree['/.tau/workbench/layout.json']!) as {
      viewer: { tabs: Array<{ view: string }> };
    };
    const viewId = layout.viewer.tabs[0]!.view;
    const view = {
      version: 1,
      entryPath: 'public/models/honeycomb.js',
      camera: { kind: 'look', direction: [1, 0, 0] },
      grid: { unit: 'in' },
      section: { active: true, cuts: [{ kind: 'plane', plane: 'xy', offset: 0.012, isFlipped: false }] },
    };
    const entries = {
      version: 1,
      entries: {
        'public/models/honeycomb.js': {
          renderTimeout: 0,
          components: { isolated: [componentIds[0]], opacity: [{ id: componentIds[0], opacity: 0.25 }] },
        },
      },
    };
    const preferences = { selectedFormats: ['stl'], shouldDownload: false, shouldSaveToProject: true };
    await target.evaluate(installRetainedControls, 'Tau candidate retained browser manual · 3317');
    const identity = await target.evaluate(() => ({
      href: location.href,
      timeOrigin: performance.timeOrigin,
      title: document.title,
    }));
    const source = await target.commands.readFile('../../apps/ui/app/workbench-records/view-store.ts');
    const sourceSha256 = [...new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(source)))]
      .map((byte) => byte.toString(16).padStart(2, '0'))
      .join('');
    const initialClosure = await exportProjectionProjectClosure(config);
    return { config, componentIds, viewId, view, entries, preferences, identity, sourceSha256, initialClosure };
  };
  let fixture: Awaited<ReturnType<typeof prepare>> | undefined;
  test.beforeEach(async () => {
    fixture = await prepare();
  });
  test('manual retained browser workbench view entries converter window', async () => {
    if (!fixture) {
      throw new Error('Retained browser manual setup did not finish.');
    }
    const { config, identity, sourceSha256, initialClosure } = fixture;
    await target.startObservedDownloads();
    const readyAt = Date.now();
    const receipt = {
      ...fixture,
      readyAt,
      operatorDeadline: readyAt + 300_000,
      instructions:
        'Principal owns all product gestures. Open Viewer settings/section/Export before applying named independent writes. Perform actual conversion/export through product gestures; checkpoints preserve changed saved output bytes/hash. Actual browser downloads are passively captured at checkpoints. Capture named checkpoints. End closes fixture; driver never clicks/navigates product after READY.',
    };
    await target.writeArtifact('retained-browser-manual-handoff.json', JSON.stringify(receipt, null, 2));
    console.info('Retained browser manual ready', JSON.stringify(receipt));
    while (Date.now() < readyAt + 300_000) {
      // oxlint-disable-next-line no-await-in-loop -- Only explicit fixture controls are polled during the bounded operator window.
      const flags = await target.evaluate(readRetainedFlags);
      for (const kind of flags.writes) {
        const path =
          kind === 'view'
            ? `.tau/workbench/views/${fixture.viewId}.json`
            : kind === 'entries'
              ? '.tau/workbench/entries.json'
              : '.tau/export/preferences.json';
        const value = kind === 'view' ? fixture.view : kind === 'entries' ? fixture.entries : fixture.preferences;
        // oxlint-disable-next-line no-await-in-loop -- Each actual rooted write requires an explicit named operator request.
        const write = await writeProjectionProjectFile(config, path, JSON.stringify(value));
        // oxlint-disable-next-line no-await-in-loop -- Persist the physical writer receipt for the requested mutation.
        await target.writeArtifact(
          `retained-browser-write-${kind}-${Date.now()}.json`,
          JSON.stringify({ identity, sourceSha256, write, path, value }, null, 2),
        );
      }
      for (const name of flags.checkpoints) {
        // oxlint-disable-next-line no-await-in-loop -- Explicit operator checkpoint drains actual passive download bytes.
        const downloadReceipts = await readHashedDownloads();
        const artifactName = `retained-browser-${Date.now()}-${name.replaceAll(/[^a-zA-Z0-9._-]+/gu, '-')}.png`;
        // oxlint-disable-next-line no-await-in-loop -- Capture only on explicit Principal request, without changing product state.
        const screenshot = await target.screenshot(undefined, artifactName);
        // oxlint-disable-next-line no-await-in-loop -- Hash exact durable screenshot bytes for the requested checkpoint.
        const digest = await crypto.subtle.digest('SHA-256', base64ToUint8Array(screenshot));
        // oxlint-disable-next-line no-await-in-loop -- Explicit checkpoint captures actual saved output bytes without invoking export.
        const currentClosure = await exportProjectionProjectClosure(config);
        const outputs = currentClosure.files.filter(
          (file) =>
            /\.(?:stl|step|stp|3mf|obj|glb|gltf|usdz|ply|svg|dxf)$/iu.test(file.path) &&
            initialClosure.files.find((old) => old.path === file.path)?.sha256 !== file.sha256,
        );
        // oxlint-disable-next-line no-await-in-loop -- Persist each checkpoint immediately before any later timeout/cleanup.
        await target.writeArtifact(
          artifactName.replace(/\.png$/u, '.json'),
          JSON.stringify(
            {
              artifactName,
              name,
              outputs,
              downloads: downloadReceipts,
              identity,
              sourceSha256,
              config,
              capturedAt: Date.now(),
              screenshotSha256: [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join(''),
            },
            null,
            2,
          ),
        );
      }
      if (flags.end) {
        break;
      }
      // oxlint-disable-next-line no-await-in-loop -- Fixture-only operator cadence; no product data polling or automatic navigation.
      await target.delay(100);
    }
    expect(
      await target.evaluate(() => ({ href: location.href, timeOrigin: performance.timeOrigin, title: document.title })),
    ).toEqual(identity);
  });
});

const readRevisionPresentation = () => ({
  chatId: new URL(location.href).searchParams.get('chat'),
  revisionControls: [...document.querySelectorAll('button')]
    .filter((node) =>
      /revision|restore|compare|comparison|read.only/iu.test(
        node.textContent + (node.getAttribute('aria-label') ?? ''),
      ),
    )
    .slice(0, 32)
    .map((node) => ({ text: node.textContent, label: node.getAttribute('aria-label'), disabled: node.disabled })),
  readonly: [...document.querySelectorAll('[readonly], [aria-readonly="true"]')].length,
  canvases: [...document.querySelectorAll('canvas')].map((node) => ({ width: node.width, height: node.height })),
});

const revisionsManualEnabled =
  (import.meta as ImportMeta & { readonly env: Record<string, string | undefined> }).env[
    'VITE_TAU_E2E_REVISIONS_MANUAL'
  ] === 'true';

test.describe.skipIf(!revisionsManualEnabled)('production revisions browser manual fixture', () => {
  const prepare = async () => {
    const script = [10, 20].flatMap((size) => [
      reply(`Build size ${size}.`, {
        toolCalls: [
          {
            name: 'create_file',
            args: {
              targetFile: 'main.ts',
              content: `import { makeBaseBox } from 'replicad';\nexport default () => makeBaseBox(${size}, 10, 10);\n`,
            },
          },
          { name: 'evaluate_model', args: { targetFile: 'main.ts' } },
        ],
      }),
      reply(`Completed size ${size}.`),
    ]);
    const [chatId] = await openChat(script);
    if (!chatId) {
      throw new Error('Revision fixture has no actual chat.');
    }
    await sendDraft('Build the first revision.');
    await target.expectVisible(selectors.getByText('Completed size 10.', { exact: true }).last(), 120_000);
    await expectLogInvariant(chatId, 1);
    await sendDraft('Change the geometry for a second revision.');
    await target.expectVisible(selectors.getByText('Completed size 20.', { exact: true }).last(), 120_000);
    await expectLogInvariant(chatId, 2);
    await target.expectVisible(selectors.getByRole('button', { name: /^Open Revisions\..*Rev [2-9]/u }), 120_000);
    const project = await projectionProject();
    const closure = await exportProjectionProjectClosure(project);
    expect(closure.files.some((file) => file.path.startsWith('.git/'))).toBe(true);
    await target.writeArtifact('revisions-browser-initial-closure.json', JSON.stringify(closure));
    await target.evaluate(installRetainedControls, 'Tau candidate browser revisions restore comparison manual');
    await target.evaluate(() => {
      for (const button of document.querySelectorAll('button')) {
        if (button.textContent.startsWith('Apply independent ')) {
          button.remove();
        }
      }
    });
    return {
      chatId,
      project,
      closure,
      identity: await target.evaluate(() => ({
        href: location.href,
        timeOrigin: performance.timeOrigin,
        title: document.title,
      })),
    };
  };
  let fixture: Awaited<ReturnType<typeof prepare>> | undefined;
  test.beforeEach(async () => {
    fixture = await prepare();
  });
  test('manual browser production revisions restore comparison sidebar window', async () => {
    if (!fixture) {
      throw new Error('Revision browser preparation did not finish.');
    }
    const { chatId, project, closure, identity } = fixture;
    await target.startObservedDownloads();
    const checkpoints = new Set<string>();
    let observedExportBytes = 0;
    const requireCheckpoints =
      (import.meta as ImportMeta & { readonly env: Record<string, string | undefined> }).env[
        'VITE_TAU_E2E_REVISIONS_ACCEPTANCE'
      ] === 'true';
    const readyAt = Date.now();
    const source = await target.commands.readFile('../../apps/ui-e2e/src/filesystem-projection-retained.spec.ts');
    const sourceDigest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(source));
    const receipt = {
      sourceSha256: [...new Uint8Array(sourceDigest)].map((byte) => byte.toString(16).padStart(2, '0')).join(''),
      chatId,
      project,
      identity,
      readyAt,
      operatorDeadline: readyAt + 300_000,
      closureHashes: Object.fromEntries(closure.files.map((file) => [file.path, file.sha256])),
      instructions:
        'Principal alone opens Revisions/history/comparison, restores an older revision, switches sidebar and exports/converts using actual product controls. Only Capture checkpoint and End are active in this focused fixture. Saved output bytes/hashes are captured with checkpoints; passively observed actual browser download bytes/hashes are captured with checkpoints.',
    };
    await target.writeArtifact('revisions-browser-manual-handoff.json', JSON.stringify(receipt, null, 2));
    console.info('Production revisions browser manual ready', JSON.stringify(receipt));
    while (Date.now() < readyAt + 300_000) {
      // oxlint-disable-next-line no-await-in-loop -- Drain only explicit operator controls, without product gestures.
      const flags = await target.evaluate(readRetainedFlags);
      for (const name of flags.checkpoints) {
        checkpoints.add(name);
        // oxlint-disable-next-line no-await-in-loop -- Explicit operator checkpoint drains actual passive download bytes.
        const downloadReceipts = await readHashedDownloads();
        const prefix = `revisions-browser-${Date.now()}-${name.replaceAll(/[^a-zA-Z0-9._-]+/gu, '-')}`;
        // oxlint-disable-next-line no-await-in-loop -- Capture the Principal's requested actual product state.
        const png = await target.screenshot(undefined, `${prefix}.png`);
        // oxlint-disable-next-line no-await-in-loop -- Reacquire physical rooted bytes only at explicit checkpoint.
        const [current, log] = await Promise.all([exportProjectionProjectClosure(project), projectionLog(chatId)]);
        const outputs = current.files.filter(
          (file) =>
            /\.(?:stl|step|stp|3mf|obj|glb|gltf|usdz|ply|svg|dxf)$/iu.test(file.path) &&
            closure.files.find((old) => old.path === file.path)?.sha256 !== file.sha256,
        );
        const screenshotBytes = base64ToUint8Array(png);
        // oxlint-disable-next-line no-await-in-loop -- Finish each requested checkpoint receipt before reading the next operator checkpoint.
        const screenshotDigest = await crypto.subtle.digest('SHA-256', screenshotBytes);
        const screenshot = {
          artifactName: `${prefix}.png`,
          byteLength: screenshotBytes.length,
          sha256: [...new Uint8Array(screenshotDigest)].map((byte) => byte.toString(16).padStart(2, '0')).join(''),
        };
        // oxlint-disable-next-line no-await-in-loop -- Observe only the Principal-selected presentation at the checkpoint.
        const presentation = await target.evaluate(readRevisionPresentation);
        observedExportBytes +=
          outputs.reduce((sum, file) => sum + file.byteLength, 0) +
          downloadReceipts.reduce((sum, file) => sum + file.byteLength, 0);
        // oxlint-disable-next-line no-await-in-loop -- Durable source/physical-log/output evidence precedes cleanup.
        await target.writeArtifact(
          `${prefix}.json`,
          JSON.stringify({
            receipt,
            name,
            capturedAt: Date.now(),
            screenshot,
            presentation,
            outputs,
            downloads: downloadReceipts,
            closureHashes: Object.fromEntries(current.files.map((file) => [file.path, file.sha256])),
            log,
          }),
        );
      }
      if (flags.end) {
        break;
      }
      // oxlint-disable-next-line no-await-in-loop -- Bounded fixture flag cadence only.
      await target.delay(100);
    }
    if (requireCheckpoints) {
      for (const name of ['restore', 'comparison', 'export']) {
        expect(checkpoints.has(name)).toBe(true);
      }
      expect(observedExportBytes).toBeGreaterThan(0);
    }
    expect(
      await target.evaluate(() => ({ href: location.href, timeOrigin: performance.timeOrigin, title: document.title })),
    ).toEqual(identity);
  });
});

test('roundtrips bounded fixture artifact bytes across multibyte boundaries', async () => {
  const text = `${'a'.repeat(65_535)}🌏${'é'.repeat(65_536)}\n`;
  await target.writeArtifact('projection-transfer-multibyte.txt', text);
  expect(await target.readFixtureText('projection-transfer-multibyte.txt')).toBe(text);
});

test('roundtrips bounded independent rooted binary closure without changing bytes', async () => {
  await openChat([]);
  const config = await projectionProject();
  const bytes = Uint8Array.from({ length: 262_145 }, (_, index) => index % 256);
  await writeProjectionProjectFile(config, 'projection-transfer.bin', bytes);
  const closure = await exportProjectionProjectClosure(config);
  const file = closure.files.find((candidate) => candidate.path === 'projection-transfer.bin');
  if (!file) {
    throw new Error('Transferred binary closure file missing.');
  }
  expect(decodeProjectionFile(file)).toEqual(bytes);
  expect(file.base64Chunks.every((chunk) => chunk.length <= 65_536)).toBe(true);
  expect(file.byteLength).toBe(bytes.byteLength);
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  expect(file.sha256).toBe([...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join(''));
  const imported = {
    ...closure,
    project: { ...closure.project, providerBasePath: `${closure.project.providerBasePath}-closure-roundtrip` },
  };
  expect(await importProjectionProjectClosure(imported)).toEqual(imported);
});

test('encodes bounded binary chunks without splitting or coercing multibyte source bytes', async () => {
  const text = `${'x'.repeat(49_151)}🌏é${'z'.repeat(49_152)}`;
  const bytes = new TextEncoder().encode(text);
  const file = await encodeProjectionFile('unicode.bin', bytes);
  expect(file.base64Chunks.length).toBeGreaterThan(1);
  expect(file.base64Chunks.every((chunk) => chunk.length <= 65_536)).toBe(true);
  expect(decodeProjectionFile(file)).toEqual(bytes);
  expect(new TextDecoder('utf-8', { fatal: true }).decode(decodeProjectionFile(file))).toBe(text);
  expect(() => decodeProjectionFile({ ...file, byteLength: file.byteLength - 1 })).toThrow('exceed');
  expect(() => decodeProjectionFile({ ...file, base64Chunks: ['A'.repeat(65_540)] })).toThrow('oversized');
});
