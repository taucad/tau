import { serializeTodoList, todoListPath } from '@taucad/chat';
import { afterEach, expect, test } from 'vitest';
import { base64ToUint8Array } from 'uint8array-extras';
import { page as selectors } from 'vitest/browser';
import * as target from '#support/external-target.js';
import { expandPath, filesPane, treeItem } from '#support/file-tree.js';
import { writeProjectionProjectFile, writeProjectionHomeFile } from '#support/filesystem-projection.js';
import { readProjectStorageState, readProjectTree } from '#support/project-storage-state.js';
import type { StoredProjectConfig } from '#support/project-storage-state.js';
import { controlWorkbenchObservation, restoreWorkbenchObservation } from '#support/workbench-files.js';
import {
  prepareComposerPage,
  readHomeJson,
  readHomeText,
  recordDraftText,
  recordPaths,
  seededChatIds,
} from '#support/chat-attachments.js';
import type { RecordFile } from '#support/chat-attachments.js';

const source = 'public/models/honeycomb.js';
const editor = () => selectors.getByCss('.monaco-editor:visible').last();
const lines = () => editor().getByCss('.view-lines');
const visibleEditorText = async (): Promise<string | undefined> => {
  const text = await target.textContent(lines());
  return text?.replaceAll('\u00A0', ' ');
};
afterEach(async (context) => {
  if (context.task.result?.state !== 'fail') {
    return;
  }
  const dom = await target.evaluate(() => ({
    href: location.href,
    active: document.activeElement
      ? { tag: document.activeElement.tagName, className: document.activeElement.className }
      : undefined,
    editors: [...document.querySelectorAll('.monaco-editor')].slice(0, 4).map((element) => ({
      rect: { width: element.getBoundingClientRect().width, height: element.getBoundingClientRect().height },
      visibleLines: element.querySelector('.view-lines')?.textContent.slice(0, 4096),
      input: element.querySelector('.native-edit-context, textarea.inputarea')?.outerHTML.slice(0, 1024),
    })),
    statuses: [...document.querySelectorAll('[role="status"], [role="alert"], [role="dialog"]')]
      .slice(0, 8)
      .map((element) => element.textContent.slice(0, 2048)),
  }));
  const storage = await readProjectStorageState();
  const slug = new URL(dom.href).pathname.split('/').at(-1);
  const config = storage.configs.find((candidate) => candidate.providerBasePath.split('/').findLast(Boolean) === slug);
  let provider: { backend: string; root: string; sourceLength: number; sourceSha256: string } | undefined;
  if (config) {
    const tree = await readProjectTree(config);
    const text = tree[`/${source}`] ?? '';
    const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
    provider = {
      backend: config.backend,
      root: config.providerBasePath,
      sourceLength: text.length,
      sourceSha256: [...new Uint8Array(digest)].map((value) => value.toString(16).padStart(2, '0')).join(''),
    };
  }
  await target.writeArtifact('observation-failure-dom', JSON.stringify({ test: context.task.name, dom, provider }));
});

const captureObservationPrecondition = async (stage: string, config: StoredProjectConfig): Promise<void> => {
  const dom = await target.evaluate(() => {
    const control = (globalThis as typeof globalThis & { __tauE2eObservationWatch?: { evidence(): unknown } })
      .__tauE2eObservationWatch;
    return {
      href: location.href,
      title: document.title,
      capturedAt: Date.now(),
      modelApi: 'unavailable: no existing runtime model accessor exposed',
      activeElement: document.activeElement
        ? {
            tag: document.activeElement.tagName,
            role: document.activeElement.getAttribute('role'),
            className: document.activeElement.className,
            text: document.activeElement.textContent.slice(0, 1024),
            ...(document.activeElement instanceof HTMLTextAreaElement
              ? {
                  value: document.activeElement.value.slice(0, 2048),
                  selectionStart: document.activeElement.selectionStart,
                  selectionEnd: document.activeElement.selectionEnd,
                }
              : {}),
          }
        : null,
      editors: [...document.querySelectorAll('.monaco-editor')].slice(0, 4).map((element) => ({
        width: element.getBoundingClientRect().width,
        height: element.getBoundingClientRect().height,
        scrollTop: element.scrollTop,
        scrollLeft: element.scrollLeft,
        scrollHeight: element.scrollHeight,
        scrollWidth: element.scrollWidth,
        text: element.querySelector('.view-lines')?.textContent.slice(0, 4096),
        cursors: [...element.querySelectorAll('.cursor')].slice(0, 4).map((cursor) => ({
          top: cursor.getBoundingClientRect().top,
          left: cursor.getBoundingClientRect().left,
          width: cursor.getBoundingClientRect().width,
          height: cursor.getBoundingClientRect().height,
        })),
      })),
      editorClickTargets: [...document.querySelectorAll('.monaco-editor .view-lines')].slice(0, 4).map((element) => {
        const rect = element.getBoundingClientRect();
        const hit = document.elementFromPoint(rect.left + rect.width / 2, rect.top + rect.height / 2);
        return {
          rect: { left: rect.left, top: rect.top, width: rect.width, height: rect.height },
          hit: hit ? { tag: hit.tagName, className: hit.className, role: hit.getAttribute('role') } : undefined,
          ownsCenterHit: hit === element || (hit !== null && element.contains(hit)),
        };
      }),
      saveAndRevision: [...document.querySelectorAll('button[aria-label]')]
        .filter((element) => /sav|revision|dirty|modified|refus/iu.test(element.getAttribute('aria-label') ?? ''))
        .slice(0, 12)
        .map((element) => ({ label: element.getAttribute('aria-label'), text: element.textContent.slice(0, 256) })),
      regions: [...document.querySelectorAll('[role="region"]')].slice(0, 16).map((element) => ({
        label: element.getAttribute('aria-label'),
        text: element.textContent.slice(0, 2048),
        width: element.getBoundingClientRect().width,
        height: element.getBoundingClientRect().height,
      })),
      filesRegions: [...document.querySelectorAll('[role="region"]')]
        .filter((element) => (element.getAttribute('aria-label') ?? '').startsWith('Files for '))
        .slice(0, 32)
        .map((element) => {
          const rect = element.getBoundingClientRect();
          const style = getComputedStyle(element);
          return {
            label: element.getAttribute('aria-label'),
            rect: { left: rect.left, top: rect.top, width: rect.width, height: rect.height },
            display: style.display,
            visibility: style.visibility,
            ariaHidden: element.getAttribute('aria-hidden'),
            hiddenAncestor: element.closest('[aria-hidden="true"], [hidden]')?.className,
            rows: element.querySelectorAll('[data-file-tree-path]').length,
          };
        }),
      dockviewTabs: [...document.querySelectorAll('.dv-tab, [role="tab"]')].slice(0, 32).map((element) => ({
        text: element.textContent.slice(0, 256),
        className: element.className,
        selected: element.getAttribute('aria-selected'),
        width: element.getBoundingClientRect().width,
        height: element.getBoundingClientRect().height,
      })),
      fileActions: [...document.querySelectorAll('[aria-label^="File actions for "]')].slice(0, 16).map((element) => ({
        label: element.getAttribute('aria-label'),
        controls: [...element.querySelectorAll('button')]
          .slice(0, 8)
          .map((button) => button.getAttribute('aria-label')),
        width: element.getBoundingClientRect().width,
        height: element.getBoundingClientRect().height,
      })),
      settingsFlags: localStorage.getItem('tau:flags')?.slice(0, 2048),
      tree: [...document.querySelectorAll('[data-file-tree-path]')].slice(0, 32).map((element) => ({
        path: element instanceof HTMLElement ? element.dataset['fileTreePath'] : undefined,
        expanded: element.getAttribute('aria-expanded'),
      })),
      options: [...document.querySelectorAll('[role="option"], [role="status"], [role="dialog"]')]
        .slice(0, 16)
        .map((element) => element.textContent.slice(0, 2048)),
      composer: document.querySelector('[aria-label="Ask Tau to build anything..."]')?.textContent.slice(0, 2048),
      composerHtml: document.querySelector('[aria-label="Ask Tau to build anything..."]')?.innerHTML.slice(0, 8192),
      watches: control?.evidence(),
    };
  });
  const tree = await readProjectTree(config);
  const files = [source, '.agents/skills/gateway-observation/SKILL.md'].map((path) => ({
    path,
    text: tree[`/${path}`]?.slice(0, 4096) ?? null,
  }));
  const screenshotFile = `observation-precondition-${stage}.png`;
  const bytes = base64ToUint8Array(await target.screenshot(undefined, screenshotFile));
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  const screenshotSha256 = [...new Uint8Array(digest)].map((value) => value.toString(16).padStart(2, '0')).join('');
  await target.writeArtifact(
    `${screenshotFile}.json`,
    JSON.stringify({ stage, config, dom, files, screenshotFile, screenshotSha256 }),
  );
};

const openFixture = async (
  extraWatch?: string,
  { shouldOpenFiles = true }: { shouldOpenFiles?: boolean } = {},
): Promise<StoredProjectConfig> => {
  const query = new URLSearchParams({ observation: '1', chat: '1' });
  if (extraWatch) {
    query.append('watch', extraWatch);
  }
  query.append('watch', source);
  query.append('watch', 'public/models');
  query.append('watch', '.agents');
  query.append('watch', 'public/models/observation-image.png');
  await target.setViewport({ width: 1440, height: 900 });
  await target.navigate(`/__e2e/project-file-tree?${query}`);
  await target.expectUrl(/\/w\/[^/]+\/[^/]+/u, 60_000);
  const acquiredValue1 = await target.currentUrl();
  const slug = new URL(acquiredValue1).pathname.split('/').at(-1)!;
  let config: StoredProjectConfig | undefined;
  await expect
    .poll(
      async () => {
        const acquiredValue2 = await readProjectStorageState();
        config = acquiredValue2.configs.find(
          (candidate) => candidate.providerBasePath.split('/').findLast(Boolean) === slug,
        );
        return config;
      },
      { timeout: 60_000 },
    )
    .toBeDefined();
  expect(['opfs', 'indexeddb']).toContain(config!.backend);
  if (!shouldOpenFiles) {
    return config!;
  }
  if (!(await target.isVisible(filesPane()))) {
    await target.click(selectors.getByRole('button', { name: /Search/u }));
    await target.fill(selectors.getByPlaceholder('Search projects, chats, and actions…'), 'Open files');
    await target.click(selectors.getByText('Open files', { exact: true }));
  }
  try {
    await expandPath('public/models');
  } catch (error) {
    await captureObservationPrecondition('files-pane', config!);
    throw error;
  }
  return config!;
};

test('keeps the actual editor mounted through watch closure and acknowledged authoritative retry', async () => {
  const config = await openFixture();
  try {
    await target.click(treeItem(source));
    await target.expectVisible(lines(), 60_000);
    const acquiredValue3 = await readProjectTree(config);
    const original = acquiredValue3[`/${source}`]!;
    expect(original).toContain('makeBaseBox');
    const first = `// external first observation\n${original}`;
    const receipt = await writeProjectionProjectFile(config, source, first);
    expect(receipt.events).toContain('fileWritten');
    await expect.poll(async () => visibleEditorText(), { timeout: 30_000 }).toContain('external first observation');
    await target.evaluateLocator(editor(), (element) => {
      if (!(element instanceof HTMLElement)) {
        throw new Error('The editor container is not an HTML element.');
      }
      if (!(element instanceof HTMLElement)) {
        throw new Error('The editor container is not an HTML element.');
      }
      element.dataset['observationRetained'] = 'yes';
    });
    const closed = await controlWorkbenchObservation('close', source);
    expect(closed.closed).toBeGreaterThan(0);
    await target.expectVisible(selectors.getByText('File updates unavailable', { exact: true }), 15_000);
    await writeProjectionProjectFile(config, source, `// external retry observation\n${original}`);
    await controlWorkbenchObservation('hold', source);
    await target.click(selectors.getByRole('button', { name: 'Retry file updates', exact: true }));
    await target.expectCount(selectors.getByCss('.monaco-editor[data-observation-retained="yes"]'), 1);
    const acquiredValue4 = await visibleEditorText();
    expect(acquiredValue4).toContain('external first observation');
    await controlWorkbenchObservation('release', source);
    await expect.poll(async () => visibleEditorText(), { timeout: 30_000 }).toContain('external retry observation');
    await target.expectCount(selectors.getByCss('.monaco-editor[data-observation-retained="yes"]'), 1);
    await target.expectCount(selectors.getByText('File updates unavailable', { exact: true }), 0);
  } finally {
    await restoreWorkbenchObservation();
  }
});

test('retries the mounted project manifest through held acknowledgment and retains valid details through invalid bytes', async () => {
  const config = await openFixture('tau.json');
  const originalTree = await readProjectTree(config);
  const original = originalTree['/tau.json'];
  if (original === undefined) {
    throw new Error('The actual project has no tau.json bytes.');
  }
  const manifest = JSON.parse(original) as Record<string, unknown>;
  if (typeof manifest['name'] !== 'string') {
    throw new TypeError('The seeded manifest has no project name.');
  }
  const freshName = 'Acknowledged current manifest project';
  const freshBytes = JSON.stringify({ ...manifest, name: freshName });
  const identity = await target.evaluate(() => ({ href: location.href, timeOrigin: performance.timeOrigin }));
  try {
    await target.click(
      selectors.getByRole('group', { name: 'Project', exact: true }).getByRole('button', { name: /Details/u }),
    );
    const name = selectors.getByCss('[data-slot="details-panel-body"] #project-name');
    await target.expectValue(name, manifest['name']);
    const closed = await controlWorkbenchObservation('close', 'tau.json');
    expect(closed.closed).toBeGreaterThan(0);
    const unavailable = selectors.getByRole('alert').filter({ hasText: 'Project updates unavailable' });
    await target.expectVisible(unavailable);
    await target.expectValue(name, manifest['name']);
    await controlWorkbenchObservation('hold', 'tau.json');
    await target.click(unavailable.getByRole('button', { name: 'Retry', exact: true }));
    const receipt = await writeProjectionProjectFile(config, 'tau.json', freshBytes);
    expect(receipt.events).toContain('fileWritten');
    const freshTree = await readProjectTree(config);
    expect(freshTree['/tau.json']).toBe(freshBytes);
    await target.expectValue(name, manifest['name']);
    await target.expectVisible(unavailable);
    await controlWorkbenchObservation('release', 'tau.json');
    await target.expectValue(name, freshName, 30_000);
    await target.expectCount(unavailable, 0, 30_000);
    expect(await target.evaluate(() => ({ href: location.href, timeOrigin: performance.timeOrigin }))).toEqual(
      identity,
    );
    await writeProjectionProjectFile(config, 'tau.json', '{');
    const issue = selectors.getByRole('alert').filter({ hasText: 'tau.json needs attention' });
    await target.expectVisible(issue, 30_000);
    await target.expectValue(name, freshName);
    await target.expectCount(issue.getByRole('button', { name: 'Repair', exact: true }), 0);
    const invalidTree = await readProjectTree(config);
    expect(invalidTree['/tau.json']).toBe('{');
    await writeProjectionProjectFile(config, 'tau.json', freshBytes);
    await target.expectCount(issue, 0, 30_000);
    await target.expectValue(name, freshName);
  } catch (error) {
    try {
      const failedTree = await readProjectTree(config);
      await target.writeArtifact(
        'observation-project-manifest-failure',
        JSON.stringify({
          config,
          identity,
          physicalManifest: failedTree['/tau.json'],
          displayedName: await target.evaluate(
            () => document.querySelector<HTMLInputElement>('[data-slot="details-panel-body"] #project-name')?.value,
          ),
        }),
      );
      await captureObservationPrecondition('project-manifest', config);
    } catch (diagnosticError) {
      try {
        await target.writeArtifact(
          'observation-project-manifest-capture-failure',
          JSON.stringify({ originalFailure: String(error), diagnosticFailure: String(diagnosticError) }),
        );
      } catch {
        // Preserve the original assertion if diagnostic transport is unavailable.
      }
    }
    throw error;
  } finally {
    await restoreWorkbenchObservation();
    const finalTree = await readProjectTree(config);
    if (finalTree['/tau.json'] !== original) {
      await writeProjectionProjectFile(config, 'tau.json', original);
    }
  }
});

test('recovers persistent export settings in the same panel while preserving pending local choices', async () => {
  const path = '.tau/export/preferences.json';
  const config = await openFixture(path, { shouldOpenFiles: false });
  await writeProjectionProjectFile(
    config,
    path,
    JSON.stringify({ selectedFormats: ['stl'], shouldDownload: true, shouldSaveToProject: false }),
  );
  await target.click(selectors.getByRole('button', { name: 'Search', exact: true }));
  await target.fill(selectors.getByPlaceholder('Search projects, chats, and actions…'), 'Export');
  await target.click(selectors.getByRole('option', { name: /^Export(?:\s|$)/u }));
  const panel = selectors.getByCss('[data-slot="export-panel-body"]');
  const download = panel.getByRole('checkbox', { name: 'Download to disk', exact: true });
  const save = panel.getByRole('checkbox', { name: 'Save to project', exact: true });
  const unavailable = panel.getByRole('alert', { name: 'Export settings unavailable' });
  try {
    await target.expectVisible(panel, 60_000);
  } catch (error) {
    await captureObservationPrecondition('export-panel', config);
    throw error;
  }
  await target.expectAttribute(download, 'data-state', 'checked');
  await target.expectAttribute(save, 'data-state', 'unchecked');
  const identity = await target.evaluate(() => ({ href: location.href, timeOrigin: performance.timeOrigin }));
  try {
    const closed = await controlWorkbenchObservation('close', path);
    expect(closed.closed).toBeGreaterThan(0);
    await target.expectVisible(unavailable);
    await target.click(download);
    await target.expectAttribute(download, 'data-state', 'unchecked');
    await controlWorkbenchObservation('hold', path);
    await target.click(unavailable.getByRole('button', { name: 'Retry export settings', exact: true }));
    const remote = JSON.stringify({ selectedFormats: ['stl'], shouldDownload: true, shouldSaveToProject: true });
    await writeProjectionProjectFile(config, path, remote);
    const remoteTree = await readProjectTree(config);
    expect(remoteTree[`/${path}`]).toBe(remote);
    await target.expectAttribute(download, 'data-state', 'unchecked');
    await target.expectAttribute(save, 'data-state', 'unchecked');
    // Export preference writes are debounced by 100ms; keep acknowledgment held beyond that due time.
    await target.delay(200);
    // Retrying clears the prior error; the pending local patch must not overwrite the remote bytes.
    const heldTree = await readProjectTree(config);
    expect(heldTree[`/${path}`]).toBe(remote);
    await controlWorkbenchObservation('release', path);
    await target.expectCount(unavailable, 0, 30_000);
    await target.expectAttribute(download, 'data-state', 'unchecked');
    await target.expectAttribute(save, 'data-state', 'checked');
    await expect
      .poll(
        async () => {
          const currentTree = await readProjectTree(config);
          const bytes = currentTree[`/${path}`];
          return bytes === undefined ? undefined : (JSON.parse(bytes) as Record<string, unknown>);
        },
        { timeout: 30_000 },
      )
      .toMatchObject({ shouldDownload: false, shouldSaveToProject: true });
    expect(await target.evaluate(() => ({ href: location.href, timeOrigin: performance.timeOrigin }))).toEqual(
      identity,
    );
  } finally {
    await restoreWorkbenchObservation();
  }
});

test('retries a failed export preference write with the same pending choice in the mounted panel', async () => {
  const path = '.tau/export/preferences.json';
  const config = await openFixture(path, { shouldOpenFiles: false });
  expect(config.backend).toBe('opfs');
  const initial = JSON.stringify({ selectedFormats: ['stl'], shouldDownload: true, shouldSaveToProject: false });
  await writeProjectionProjectFile(config, path, initial);
  await target.click(selectors.getByRole('button', { name: 'Search', exact: true }));
  await target.fill(selectors.getByPlaceholder('Search projects, chats, and actions…'), 'Export');
  await target.click(selectors.getByRole('option', { name: /^Export(?:\s|$)/u }));
  const panel = selectors.getByCss('[data-slot="export-panel-body"]');
  const download = panel.getByRole('checkbox', { name: 'Download to disk', exact: true });
  const unavailable = panel.getByRole('alert', { name: 'Export settings unavailable' });
  await target.expectVisible(panel, 60_000);
  await target.expectAttribute(download, 'data-state', 'checked');
  const identity = await target.evaluate(() => ({ href: location.href, timeOrigin: performance.timeOrigin }));
  const release = async (): Promise<void> =>
    target.evaluate(async (heldPath) => {
      const control = (
        globalThis as typeof globalThis & {
          __tauE2eReleaseProjectFile?: (path: string) => Promise<void>;
        }
      ).__tauE2eReleaseProjectFile;
      if (!control) {
        throw new Error('The actual OPFS release fixture is missing.');
      }
      await control(heldPath);
    }, path);
  let held = false;
  try {
    await target.evaluate(async (heldPath) => {
      const control = (
        globalThis as typeof globalThis & {
          __tauE2eHoldProjectFile?: (path: string) => Promise<void>;
        }
      ).__tauE2eHoldProjectFile;
      if (!control) {
        throw new Error('The actual OPFS refusal fixture is missing.');
      }
      await control(heldPath);
    }, path);
    held = true;
    await target.click(download);
    await target.expectAttribute(download, 'data-state', 'unchecked');
    await target.expectVisible(unavailable);
    await target.expectVisible(unavailable.getByText('Export settings could not be saved.', { exact: true }));
    const failedTree = await readProjectTree(config);
    expect(failedTree[`/${path}`]).toBe(initial);
    await release();
    held = false;
    await target.click(unavailable.getByRole('button', { name: 'Retry export settings', exact: true }));
    await expect
      .poll(
        async () => {
          const tree = await readProjectTree(config);
          const bytes = tree[`/${path}`];
          return bytes === undefined ? undefined : (JSON.parse(bytes) as Record<string, unknown>);
        },
        { timeout: 30_000 },
      )
      .toMatchObject({ selectedFormats: ['stl'], shouldDownload: false, shouldSaveToProject: false });
    await target.expectCount(unavailable, 0);
    await target.expectAttribute(download, 'data-state', 'unchecked');
    expect(await target.evaluate(() => ({ href: location.href, timeOrigin: performance.timeOrigin }))).toEqual(
      identity,
    );
  } finally {
    if (held) {
      await release();
    }
    await restoreWorkbenchObservation();
  }
});

test('projects independent persistent directory mutations and exposes the browser machine-host boundary', async () => {
  const config = await openFixture();
  try {
    const path = 'public/models/observation-peer.js';
    const receipt = await writeProjectionProjectFile(config, path, 'export default function main() { return []; }\n');
    expect(receipt.events).toContain('fileWritten');
    await target.expectVisible(treeItem(path), 30_000);
    await writeProjectionProjectFile(config, path);
    await target.expectCount(treeItem(path), 0, 30_000);
    const settings = new URL(await target.currentUrl());
    settings.searchParams.set('settings', 'machines');
    await target.navigate(settings.href);
    await target.expectVisible(
      selectors.getByText('Machines are unavailable in this runtime (unsupported).', { exact: true }),
      30_000,
    );
    await target.expectCount(selectors.getByRole('button', { name: 'Add simulated X1C', exact: true }), 0);
  } finally {
    await restoreWorkbenchObservation();
  }
});

test('preserves actual unsaved Monaco bytes through closure and a held acknowledged retry', async () => {
  const config = await openFixture();
  expect(config.backend).toBe('opfs');
  try {
    await target.click(treeItem(source));
    await target.expectVisible(lines(), 60_000);
    const acquiredValue5 = await readProjectTree(config);
    const original = acquiredValue5[`/${source}`]!;
    await target.evaluate(async (path) => {
      const hold = (
        globalThis as typeof globalThis & {
          __tauE2eHoldProjectFile?: (path: string) => Promise<void>;
        }
      ).__tauE2eHoldProjectFile;
      if (!hold) {
        throw new Error('The actual OPFS refusal fixture is missing.');
      }
      await hold(path);
    }, source);
    // Match the existing revision-session fixture: activate Monaco through its rendered source, then real keyboard gestures.
    try {
      await target.click(lines());
    } catch (error) {
      await captureObservationPrecondition('dirty-editor-focus', config);
      throw error;
    }
    await target.keyboardPress('ControlOrMeta+Home');
    for (const key of '// Unsaved observation editor bytes') {
      // oxlint-disable-next-line no-await-in-loop -- Each actual key must follow the preceding key in the dirty editor gesture.
      await target.keyboardPress(key === ' ' ? 'Space' : key);
    }
    await target.keyboardPress('Enter');
    await target.keyboardPress('Escape');
    await target.keyboardPress('ControlOrMeta+Home');
    try {
      await expect.poll(async () => visibleEditorText()).toContain('Unsaved observation editor bytes');
    } catch (error) {
      await captureObservationPrecondition('dirty-typing', config);
      throw error;
    }
    await captureObservationPrecondition('dirty-before-close', config);
    const acquiredValue6 = await readProjectTree(config);
    expect(acquiredValue6[`/${source}`]).toBe(original);
    const acquiredValue7 = await controlWorkbenchObservation('close', source);
    expect(acquiredValue7.closed).toBeGreaterThan(0);
    await target.expectVisible(selectors.getByText('File updates unavailable', { exact: true }));
    await controlWorkbenchObservation('hold', source);
    await target.click(selectors.getByRole('button', { name: 'Retry file updates', exact: true }));
    const acquiredValue8 = await visibleEditorText();
    expect(acquiredValue8).toContain('Unsaved observation editor bytes');
    await controlWorkbenchObservation('release', source);
    await target.expectCount(selectors.getByText('File updates unavailable', { exact: true }), 0, 30_000);
    const acquiredValue9 = await visibleEditorText();
    expect(acquiredValue9).toContain('Unsaved observation editor bytes');
    const acquiredValue10 = await readProjectTree(config);
    expect(acquiredValue10[`/${source}`]).toBe(original);
  } finally {
    await restoreWorkbenchObservation();
    // The existing physical OPFS refusal holder has document lifetime.
    await target.navigate('/');
  }
});

test('updates the real composer catalog from settled skill topology and retries a rejected watch', async () => {
  const config = await openFixture();
  const composer = selectors.getByCss('[aria-label="Ask Tau to build anything..."]').last();
  try {
    await target.expectVisible(composer, 30_000);
    const path = '.agents/skills/observation-peer/SKILL.md';
    await writeProjectionProjectFile(
      config,
      path,
      '---\nname: observation-peer\ndescription: Observation integration skill\n---\nUse this skill to qualify settled discovery.\n',
    );
    await target.type(composer, '/observation-peer');
    await target.expectVisible(selectors.getByText('Observation integration skill', { exact: true }), 30_000);
    const closed = await controlWorkbenchObservation('close', '.agents');
    expect(closed.closed).toBeGreaterThan(0);
    await target.expectVisible(selectors.getByText('Skill updates unavailable', { exact: true }), 15_000);
    await target.expectCount(selectors.getByText('Observation integration skill', { exact: true }), 0);
    await controlWorkbenchObservation('reject', '.agents');
    await target.click(selectors.getByRole('button', { name: 'Retry skill updates', exact: true }));
    await target.expectVisible(selectors.getByText('Skill updates unavailable', { exact: true }), 15_000);
    await controlWorkbenchObservation('release', '.agents');
    await target.click(selectors.getByRole('button', { name: 'Retry skill updates', exact: true }));
    await target.expectCount(selectors.getByText('Skill updates unavailable', { exact: true }), 0, 30_000);
    await target.expectVisible(selectors.getByText('Observation integration skill', { exact: true }), 30_000);
    await writeProjectionProjectFile(config, path);
    await target.expectCount(selectors.getByText('Observation integration skill', { exact: true }), 0, 30_000);
  } finally {
    await restoreWorkbenchObservation();
  }
});

test('acknowledges the mounted FileSelector directory and retries its isolated watch', async () => {
  const config = await openFixture();
  try {
    await target.click(treeItem(source));
    await target.expectVisible(lines(), 60_000);
    await writeProjectionProjectFile(config, source);
    await target.expectVisible(selectors.getByText('File not found', { exact: true }));
    await target.click(selectors.getByRole('button', { name: 'Select file to edit…', exact: true }));
    const picker = selectors.getByCss('[data-slot="popover-content"]:has(input[placeholder="Search files…"])');
    await target.click(picker.getByRole('option').getByText('public', { exact: true }));
    await target.click(picker.getByRole('option').getByText('models', { exact: true }));
    const peer = 'public/models/picker-peer.js';
    const peerBytes = '// picker peer authoritative bytes\nexport default function pickerPeerMain() { return []; }\n';
    await writeProjectionProjectFile(config, peer, peerBytes);
    await target.expectVisible(picker.getByText('picker-peer.js', { exact: true }), 30_000);
    const acquiredValue11 = await controlWorkbenchObservation('close', 'public/models');
    expect(acquiredValue11.closed).toBeGreaterThan(0);
    await target.expectVisible(picker.getByRole('button', { name: 'Retry', exact: true }));
    await writeProjectionProjectFile(
      config,
      'public/models/picker-after-close.js',
      'export default function main() { return []; }\n',
    );
    await controlWorkbenchObservation('hold', 'public/models');
    await target.click(picker.getByRole('button', { name: 'Retry', exact: true }));
    await target.expectCount(picker.getByText('picker-after-close.js', { exact: true }), 0);
    const released = await controlWorkbenchObservation('release', 'public/models');
    const releasedTree = await readProjectTree(config);
    const releasedPicker = await target.textContent(picker);
    await target.writeArtifact(
      'observation-picker-release',
      JSON.stringify({
        config,
        released,
        providerHasPeer: releasedTree['/public/models/picker-after-close.js'] !== undefined,
        picker: releasedPicker?.slice(0, 4096) ?? null,
      }),
    );
    try {
      await target.expectVisible(picker.getByText('picker-after-close.js', { exact: true }), 30_000);
    } catch (error) {
      const failedTree = await readProjectTree(config);
      const failedPicker = await target.textContent(picker);
      await target.writeArtifact(
        'observation-picker-convergence-failure',
        JSON.stringify({
          config,
          picker: failedPicker?.slice(0, 4096) ?? null,
          providerHasPeer: failedTree['/public/models/picker-after-close.js'] !== undefined,
          watches: await target.evaluate(() => {
            const control = (globalThis as typeof globalThis & { __tauE2eObservationWatch?: { evidence(): unknown } })
              .__tauE2eObservationWatch;
            return control?.evidence();
          }),
        }),
      );
      throw error;
    }
    await target.click(picker.getByText('picker-peer.js', { exact: true }));
    try {
      const peerTab = selectors.getByCss(`.dv-tab[aria-label="${peer}"]`);
      await target.expectAttribute(peerTab, 'aria-selected', 'true');
      const peerLines = selectors.getByCss(
        `.dv-groupview:has(.dv-tab[aria-label="${peer}"]) .monaco-editor:visible .view-lines`,
      );
      await target.expectVisible(peerLines);
      await expect
        .poll(async () => {
          const text = await target.textContent(peerLines);
          return text?.replaceAll('\u00A0', ' ');
        })
        .toContain('// picker peer authoritative bytes');
      const readGeometry = async () =>
        target.evaluate((path) => {
          const tab = [...document.querySelectorAll('.dv-tab')].find(
            (element) => element.getAttribute('aria-label') === path,
          );
          const group = tab?.closest('.dv-groupview');
          const monaco = group?.querySelector<HTMLElement>('.monaco-editor');
          const pane = monaco?.closest('[data-file-pane-id]');
          const parent = [...(pane?.children ?? [])].find((element) => monaco && element.contains(monaco));
          const overflow = monaco?.querySelector('.overflow-guard');
          const line = monaco?.querySelector('.view-line');
          return {
            editorHeight: monaco?.getBoundingClientRect().height ?? 0,
            overflowHeight: overflow?.getBoundingClientRect().height ?? 0,
            parentHeight: parent?.getBoundingClientRect().height ?? 0,
            lineHeight: line?.getBoundingClientRect().height ?? 0,
          };
        }, peer);
      await target.writeArtifact('observation-picker-selected-geometry', JSON.stringify(await readGeometry()));
      await expect
        .poll(
          async () => {
            const geometry = await readGeometry();
            return (
              geometry.lineHeight > 0 &&
              geometry.editorHeight >= geometry.lineHeight * 3 &&
              geometry.overflowHeight >= geometry.lineHeight * 3 &&
              geometry.editorHeight <= geometry.parentHeight + 1
            );
          },
          { timeout: 30_000 },
        )
        .toBe(true);
      await expect
        .poll(
          async () => {
            const text = await target.textContent(peerLines);
            return text?.replaceAll('\u00A0', ' ');
          },
          { timeout: 30_000 },
        )
        .toContain('pickerPeerMain');
      const peerTree = await readProjectTree(config);
      expect(peerTree[`/${peer}`]).toBe(peerBytes);
    } catch (error) {
      await captureObservationPrecondition('picker-selected-editor', config);
      throw error;
    }
  } finally {
    await restoreWorkbenchObservation();
  }
});

test('retries the same mounted Home plugin manifest through held acknowledgment and refuses unhealthy installs', async () => {
  await target.addInitScript(() => {
    localStorage.setItem('tau:flags', JSON.stringify({ pluginsStore: true }));
  });
  const path = '.agents/plugins/installed.json';
  const config = await openFixture(path);
  const storage = await readProjectStorageState();
  if (storage.pin !== 'opfs') {
    throw new Error(
      `This Home byte oracle requires actual OPFS; received ${storage.pin ?? 'unpinned'}. IDB qualification remains separate.`,
    );
  }
  const original = await readHomeText(path);
  const skillPath = '.agents/skills/woodworking/SKILL.md';
  const originalSkill = await readHomeText(skillPath);
  expect(originalSkill).toBeUndefined();
  try {
    await writeProjectionHomeFile(path, '{}\n');
    await target.click(selectors.getByRole('link', { name: 'Plugins', exact: true }));
    await target.expectVisible(selectors.getByRole('heading', { name: 'Plugins', exact: true }));
    const install = selectors.getByRole('button', { name: 'Install Woodworking', exact: true });
    await target.expectVisible(install);
    await target.expectCount(selectors.getByText('Skill updates pending', { exact: true }), 0, 30_000);
    await target.expectCount(selectors.getByText('Plugin updates pending', { exact: true }), 0, 30_000);
    const identity = await target.evaluate(() => ({ href: location.href, timeOrigin: performance.timeOrigin }));
    const closed = await controlWorkbenchObservation('close', path);
    expect(closed.closed).toBeGreaterThan(0);
    await target.expectVisible(selectors.getByText('Plugin updates unavailable', { exact: true }));
    await target.expectVisible(selectors.getByText('Skill updates unavailable', { exact: true }));
    await target.click(install);
    expect(await readHomeText(path)).toBe('{}\n');
    expect(await readHomeText(skillPath)).toBe(originalSkill);
    await controlWorkbenchObservation('hold', path);
    await target.click(selectors.getByRole('button', { name: 'Retry plugin updates', exact: true }));
    await target.expectVisible(selectors.getByText('Plugin updates pending', { exact: true }));
    // The exact manifest path is also a catalog dependency; both real owners require recovery.
    await target.click(selectors.getByRole('button', { name: 'Retry skill updates', exact: true }));
    await target.expectVisible(selectors.getByText('Skill updates pending', { exact: true }));
    const fresh =
      JSON.stringify({
        skills: {
          'sheet-metal-manufacturing': {
            status: 'installed',
            source: 'tau-store',
            installedPath: '.agents/skills/sheet-metal-manufacturing/SKILL.md',
            version: '1.0.0',
            updatedAt: '2026-10-08T00:00:00.000Z',
          },
        },
      }) + '\n';
    const receipt = await writeProjectionHomeFile(path, fresh);
    expect(receipt.events.length).toBeGreaterThan(0);
    expect(receipt.providerBasePath).toBe('');
    expect(receipt.backend).toBe('opfs');
    expect(receipt.homePin).toBe(storage.pin);
    expect(receipt.storageRootKey).toBeTruthy();
    expect(receipt.databasePrefix).toBeTruthy();
    await target.writeArtifact(
      'plugins-manifest-home-write',
      JSON.stringify({ receipt, manifest: await readHomeText(path) }),
    );
    await target.click(install);
    expect(await readHomeText(path)).toBe(fresh);
    expect(await readHomeText(skillPath)).toBe(originalSkill);
    await target.expectCount(
      selectors.getByRole('button', { name: 'Sheet Metal Manufacturing installed', exact: true }),
      0,
    );
    await controlWorkbenchObservation('release', path);
    await target.expectVisible(
      selectors.getByRole('button', { name: 'Sheet Metal Manufacturing installed', exact: true }),
      30_000,
    );
    await target.expectCount(selectors.getByText('Plugin updates pending', { exact: true }), 0);
    await target.expectCount(selectors.getByText('Skill updates pending', { exact: true }), 0);
    await target.expectCount(selectors.getByText('Skill updates unavailable', { exact: true }), 0);
    expect(await target.evaluate(() => ({ href: location.href, timeOrigin: performance.timeOrigin }))).toEqual(
      identity,
    );
    await target.click(install);
    await target.expectVisible(selectors.getByRole('button', { name: 'Woodworking installed', exact: true }), 30_000);
    const installed = await readHomeJson<{ skills?: Record<string, { status: string }> }>(path);
    expect(installed?.skills?.['woodworking']?.status).toBe('installed');
  } catch (error) {
    await captureObservationPrecondition('plugins-manifest', config);
    throw error;
  } finally {
    await restoreWorkbenchObservation();
    if ((await readHomeText(path)) !== original) {
      await writeProjectionHomeFile(path, original);
    }
    if ((await readHomeText(skillPath)) !== originalSkill) {
      await writeProjectionHomeFile(skillPath, originalSkill);
    }
  }
});

test('exposes real Plugins catalog health and acknowledged retry at the Home root', async () => {
  await target.addInitScript(() => {
    localStorage.setItem('tau:flags', JSON.stringify({ pluginsStore: true }));
  });
  await openFixture();
  try {
    await target.click(selectors.getByRole('link', { name: 'Plugins', exact: true }));
    await target.expectVisible(selectors.getByRole('heading', { name: 'Plugins', exact: true }));
    const acquiredValue12 = await controlWorkbenchObservation('close', '.agents');
    expect(acquiredValue12.closed).toBeGreaterThan(0);
    await target.expectVisible(selectors.getByText('Skill updates unavailable', { exact: true }));
    await controlWorkbenchObservation('hold', '.agents');
    await target.click(selectors.getByRole('button', { name: 'Retry skill updates', exact: true }));
    await target.expectVisible(selectors.getByText('Skill updates pending', { exact: true }));
    await controlWorkbenchObservation('release', '.agents');
    await target.expectCount(selectors.getByText('Skill updates unavailable', { exact: true }), 0, 30_000);
  } finally {
    await restoreWorkbenchObservation();
  }
});

test('refreshes an unchanged open skill query and refuses withdrawn selection in the actual gateway prompt', async () => {
  await target.installAgentHostGatewayFixture([
    { text: 'Withdrawn selection excluded.', usage: { inputTokens: 10, outputTokens: 4 } },
  ]);
  const config = await openFixture();
  const composer = selectors.getByCss('[aria-label="Ask Tau to build anything..."]').last();
  const popup = selectors.getByCss('[data-testid="slash-command-dropdown"]');
  const path = '.agents/skills/gateway-observation/SKILL.md';
  const description = 'Open query gateway catalog qualification';
  const chip = composer.getByCss(
    '[data-type="context-chip"][data-chip-type="skill"][data-label="/gateway-observation"]',
  );
  try {
    await target.type(composer, '/gateway-');
    await target.expectVisible(popup.getByText('No commands found', { exact: true }));
    await writeProjectionProjectFile(
      config,
      path,
      `---\nname: gateway-observation\ndescription: ${description}\n---\nQualify unchanged query settlement.\n`,
    );
    try {
      await target.expectVisible(popup.getByText(description, { exact: true }), 30_000);
      await target.expectContainingText(composer, '/gateway-');
      await target.expectCount(chip, 0);
      await writeProjectionProjectFile(config, path);
      await target.expectVisible(popup.getByText('No commands found', { exact: true }), 30_000);
      await target.expectCount(popup.getByText(description, { exact: true }), 0);
      // The real open menu handles Enter; its former selected item must neither insert a chip nor submit.
      await target.keyboardPress('Enter');
      await target.expectCount(chip, 0);
      await target.expectContainingText(composer, '/gateway-');
      expect(await target.readAgentHostGatewayRequests()).toEqual([]);
    } catch (error) {
      await captureObservationPrecondition('skill-open-query', config);
      throw error;
    }
    await target.fill(composer, 'Describe the catalog after withdrawal.');
    await target.click(selectors.getByRole('button', { name: /^Agent and model:/u }).last());
    await target.click(selectors.getByRole('button', { name: /^Model: .*\. Change$/u }));
    await target.expectVisible(selectors.getByPlaceholder('Search models…'));
    await target.click(selectors.getByCss('[role="option"][data-value="anthropic-claude-haiku-4.5"]'));
    await target.keyboardPress('Escape');
    await target.expectCount(selectors.getByPlaceholder('Search models…'), 0);
    await target.expectVisible(selectors.getByRole('button', { name: 'Agent and model: Haiku 4.5', exact: true }));
    await target.click(selectors.getByCss('button:has(svg.lucide-arrow-up)').last());
    await target.expectVisible(selectors.getByText('Withdrawn selection excluded.', { exact: true }), 120_000);
    const requests = await target.readAgentHostGatewayRequests();
    const request = requests.at(-1) as { readonly system?: unknown } | undefined;
    expect(request).toBeDefined();
    expect(JSON.stringify(request?.system)).not.toContain(description);
  } finally {
    await restoreWorkbenchObservation();
  }
});

test('includes only the settled available skill in actual gateway system prompts', async () => {
  await target.installAgentHostGatewayFixture([
    { text: 'Skill context received.', usage: { inputTokens: 10, outputTokens: 4 } },
  ]);
  const config = await openFixture();
  const composer = selectors.getByCss('[aria-label="Ask Tau to build anything..."]').last();
  const description = 'Gateway observation catalog qualification';
  try {
    await writeProjectionProjectFile(
      config,
      '.agents/skills/gateway-observation/SKILL.md',
      `---\nname: gateway-observation\ndescription: ${description}\n---\nQualify actual prompt selection.\n`,
    );
    await target.type(composer, '/gateway-observation');
    try {
      await target.expectVisible(
        composer.getByCss('[data-node-view-wrapper]').getByText('/gateway-observation', { exact: true }),
        30_000,
      );
    } catch (error) {
      await captureObservationPrecondition('skill-suggestion', config);
      throw error;
    }
    await target.fill(composer, 'Describe the settled skill catalog.');
    await target.click(selectors.getByRole('button', { name: /^Agent and model:/u }).last());
    await target.click(selectors.getByRole('button', { name: /^Model: .*\. Change$/u }));
    await target.expectVisible(selectors.getByPlaceholder('Search models…'));
    await target.click(selectors.getByCss('[role="option"][data-value="anthropic-claude-haiku-4.5"]'));
    await target.keyboardPress('Escape');
    await target.expectCount(selectors.getByPlaceholder('Search models…'), 0);
    await target.expectVisible(selectors.getByRole('button', { name: 'Agent and model: Haiku 4.5', exact: true }));
    await target.click(selectors.getByCss('button:has(svg.lucide-arrow-up)').last());
    await target.expectVisible(selectors.getByText('Skill context received.', { exact: true }), 120_000);
    const acquiredValue13 = await target.readAgentHostGatewayRequests();
    const first = acquiredValue13.at(-1) as { readonly system?: unknown } | undefined;
    expect(JSON.stringify(first?.system)).toContain(description);
    const acquiredValue14 = await controlWorkbenchObservation('close', '.agents');
    expect(acquiredValue14.closed).toBeGreaterThan(0);
    await target.expectVisible(selectors.getByText('Skill updates unavailable', { exact: true }));
    await target.installAgentHostGatewayFixture([
      { text: 'Unavailable skill excluded.', usage: { inputTokens: 10, outputTokens: 4 } },
    ]);
    await target.fill(composer, 'Describe the currently available catalog.');
    await target.click(selectors.getByCss('button:has(svg.lucide-arrow-up)').last());
    await target.expectVisible(selectors.getByText('Unavailable skill excluded.', { exact: true }), 120_000);
    const acquiredValue15 = await target.readAgentHostGatewayRequests();
    const closed = acquiredValue15.at(-1) as { readonly system?: unknown } | undefined;
    expect(closed).toBeDefined();
    expect(JSON.stringify(closed?.system)).not.toContain(description);
  } finally {
    await restoreWorkbenchObservation();
  }
});

test('restores a real per-chat composer draft after chat replacement and reload', async () => {
  await prepareComposerPage();
  await target.navigate('/__e2e/chat-attachments?chats=2&seed=drafts');
  await target.expectUrl(/\/w\/[^/]+\/[^/?]+\?/u, 60_000);
  const { projectId, chatIds } = await seededChatIds();
  const composer = selectors.getByCss('[aria-label="Ask Tau to build anything..."]').first();
  await target.expectVisible(composer, 60_000);
  const draft = 'Filesystem observation retained browser draft.';
  await target.type(composer, draft);
  await expect
    .poll(async () => recordDraftText(await readHomeJson<RecordFile>(recordPaths.chat(projectId, chatIds[0]!))), {
      timeout: 30_000,
    })
    .toBe(draft);
  await target.click(selectors.getByRole('link', { name: 'Second chat', exact: true }));
  await target.expectUrl(new RegExp(`[?&]chat=${chatIds[1]}(?:&|$)`, 'u'), 30_000);
  const acquiredValue16 = await target.textContent(composer);
  expect(acquiredValue16).not.toContain(draft);
  await target.click(selectors.getByRole('link', { name: 'Attachments chat', exact: true }));
  await target.expectContainingText(composer, draft, 30_000);
  await target.reload();
  await target.expectContainingText(composer, draft, 60_000);
  expect(recordDraftText(await readHomeJson<RecordFile>(recordPaths.chat(projectId, chatIds[0]!)))).toBe(draft);
});

test('replaces, deletes and recovers real decoded image content in its mounted file viewer', async () => {
  const config = await openFixture();
  const path = 'public/models/observation-image.png';
  const image = selectors.getByRole('img', { name: 'observation-image.png', exact: true });
  const bytes = async (width: number, height: number): Promise<Uint8Array<ArrayBuffer>> =>
    new Uint8Array(
      await target.evaluate(
        async ({ width, height }) => {
          const canvas = document.createElement('canvas');
          canvas.width = width;
          canvas.height = height;
          const context = canvas.getContext('2d');
          if (!context) {
            throw new Error('Browser PNG fixture canvas is unavailable.');
          }
          context.fillStyle = '#c026d3';
          context.fillRect(0, 0, width, height);
          const blob = await new Promise<Blob>((resolve, reject) => {
            canvas.toBlob((value) => {
              if (value) {
                resolve(value);
              } else {
                reject(new Error('PNG fixture encoding failed.'));
              }
            }, 'image/png');
          });
          return [...new Uint8Array(await blob.arrayBuffer())];
        },
        { width, height },
      ),
    );
  const dimensions = async (): Promise<readonly number[]> =>
    target.evaluateLocator(image, (element) => {
      if (!(element instanceof HTMLImageElement)) {
        throw new Error('The actual image viewer did not render an image.');
      }
      return [element.naturalWidth, element.naturalHeight];
    });
  try {
    await writeProjectionProjectFile(config, path, await bytes(8, 6));
    await target.expectVisible(treeItem(path), 30_000);
    await target.click(treeItem(path));
    await expect.poll(dimensions, { timeout: 30_000 }).toEqual([8, 6]);
    const previousUrl = await target.getAttribute(image, 'src');
    await writeProjectionProjectFile(config, path, await bytes(13, 9));
    await expect.poll(dimensions, { timeout: 30_000 }).toEqual([13, 9]);
    const acquiredValue17 = await target.getAttribute(image, 'src');
    expect(acquiredValue17).not.toBe(previousUrl);
    expect(
      await target.evaluate(async (url) => {
        if (!url) {
          throw new Error('The replaced image had no captured URL.');
        }
        try {
          await fetch(url);
          return true;
        } catch {
          return false;
        }
      }, previousUrl),
    ).toBe(false);
    await writeProjectionProjectFile(config, path);
    await target.expectVisible(selectors.getByText('File not found', { exact: true }), 30_000);
    await target.expectCount(image, 0);
    await writeProjectionProjectFile(config, path, await bytes(11, 7));
    await expect.poll(dimensions, { timeout: 30_000 }).toEqual([11, 7]);
    const acquiredValue18 = await controlWorkbenchObservation('close', path);
    expect(acquiredValue18.closed).toBeGreaterThan(0);
    await target.expectVisible(selectors.getByText('File updates unavailable', { exact: true }));
    await controlWorkbenchObservation('hold', path);
    await target.click(selectors.getByRole('button', { name: 'Retry file updates', exact: true }));
    const acquiredValue19 = await dimensions();
    expect(acquiredValue19).toEqual([11, 7]);
    await controlWorkbenchObservation('release', path);
    await target.expectCount(selectors.getByText('File updates unavailable', { exact: true }), 0, 30_000);
    const acquiredValue20 = await dimensions();
    expect(acquiredValue20).toEqual([11, 7]);
  } finally {
    await restoreWorkbenchObservation();
  }
});

const observationManualModes = [
  'files',
  'directory',
  'catalog',
  'settings',
  'drafts',
  'media',
  'parameters',
  'todo',
  'plugins',
] as const;
type ObservationManualAction = 'close' | 'hold' | 'reject' | 'release' | 'mutate' | 'delete' | 'screenshot' | 'end';
type ObservationManualRequest = { id: number; action: ObservationManualAction; gesture: string };
const installObservationManualControls = ({
  mode,
  actions,
}: {
  mode: string;
  actions: readonly ObservationManualAction[];
}) => {
  const state = { actions: [] as ObservationManualRequest[], nextId: 0 };
  Object.assign(globalThis, { __tauObservationManual: state });
  document.title = `Tau observation manual · ${mode}`;
  const controls = document.createElement('aside');
  controls.setAttribute('aria-label', 'Observation fixture controls');
  controls.style.cssText =
    'position:fixed;top:8px;right:8px;z-index:2147483647;background:white;color:black;padding:8px;border:1px solid black';
  const gesture = document.createElement('input');
  gesture.placeholder = 'Gesture checkpoint name';
  gesture.setAttribute('aria-label', 'Gesture checkpoint name');
  controls.append(gesture);
  const status = document.createElement('output');
  status.setAttribute('aria-label', 'Fixture action status');
  status.dataset['observationActionStatus'] = '';
  status.textContent = 'No fixture action requested';
  controls.append(status);
  for (const action of actions) {
    const button = document.createElement('button');
    button.textContent = `Fixture ${action}`;
    button.addEventListener('click', () => {
      if (action === 'screenshot' && !gesture.value.trim()) {
        gesture.focus();
        return;
      }
      if (state.actions.length < 16) {
        const id = ++state.nextId;
        status.dataset['requestId'] = String(id);
        status.textContent = `Fixture ${action} #${id}: pending`;
        state.actions.push({ id, action, gesture: gesture.value.trim().slice(0, 160) });
      }
    });
    controls.append(button);
  }
  document.body.append(controls);
  return { href: location.href, title: document.title, timeOrigin: performance.timeOrigin };
};
const takeObservationManualActions = (): ObservationManualRequest[] => {
  const state = (
    globalThis as typeof globalThis & {
      __tauObservationManual: { actions: ObservationManualRequest[] };
    }
  ).__tauObservationManual;
  return state.actions.splice(0);
};

const browserObservationManualMode = (
  import.meta as ImportMeta & { readonly env: Readonly<Record<string, string | undefined>> }
).env['VITE_TAU_E2E_OBSERVATION_MANUAL'];
for (const mode of observationManualModes) {
  test.skipIf(browserObservationManualMode !== mode)(`manual observation ${mode}`, async () => {
    let config: StoredProjectConfig | undefined;
    if (mode === 'drafts') {
      await prepareComposerPage();
      await target.navigate('/__e2e/chat-attachments?chats=2&seed=drafts');
      await target.expectUrl(/\/w\//u, 60_000);
    } else if (mode === 'parameters') {
      await target.navigate('/__e2e/user-project-thumbnail-generation');
      await target.expectUrl(/\/w\//u, 60_000);
    } else {
      if (mode === 'plugins') {
        await target.addInitScript(() => {
          localStorage.setItem('tau:flags', JSON.stringify({ pluginsStore: true }));
        });
      }
      config = await openFixture(mode === 'plugins' ? '.agents/plugins/installed.json' : undefined, {
        shouldOpenFiles: mode !== 'plugins',
      });
      if (mode === 'settings') {
        await target.keyboardPress('ControlOrMeta+,');
      }
    }
    const watchPath =
      mode === 'plugins'
        ? '.agents/plugins/installed.json'
        : mode === 'directory'
          ? 'public/models'
          : mode === 'catalog'
            ? '.agents'
            : mode === 'media'
              ? 'public/models/observation-image.png'
              : source;
    const manualChatId = new URL(await target.currentUrl()).searchParams.get('chat');
    if (mode === 'todo' && !manualChatId) {
      throw new Error('The todo manual fixture requires its actual active chat.');
    }
    const mutationPath =
      mode === 'todo'
        ? todoListPath(manualChatId!)
        : mode === 'catalog'
          ? '.agents/skills/manual-observation/SKILL.md'
          : mode === 'media'
            ? watchPath
            : mode === 'files'
              ? 'public/models/honeycomb.js'
              : 'public/models/manual-observation-peer.js';
    const contents =
      mode === 'todo'
        ? serializeTodoList({
            version: 1,
            items: [
              { id: 'manual-task', title: 'Inspect manual task observation', status: 'in_progress' },
              { id: 'manual-finish', title: 'Finish manual task observation', status: 'pending' },
            ],
          })
        : mode === 'catalog'
          ? '---\nname: manual-observation\ndescription: Manual observation skill\n---\nActual rooted skill.\n'
          : 'export default function main() { return []; }\n';
    const imageBytes = base64ToUint8Array(
      'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a9XkAAAAASUVORK5CYII=',
    );
    const actions: ObservationManualAction[] =
      mode === 'plugins'
        ? ['close', 'hold', 'reject', 'release', 'screenshot', 'end']
        : mode === 'todo'
          ? ['mutate', 'delete', 'screenshot', 'end']
          : config && mode !== 'settings'
            ? ['close', 'hold', 'reject', 'release', 'mutate', 'delete', 'screenshot', 'end']
            : ['screenshot', 'end'];
    const identity = await target.evaluate(installObservationManualControls, { mode: `${mode} · browser`, actions });
    const specSource = await target.commands.readFile(
      '../../apps/ui-e2e/src/filesystem-projection-observation.spec.ts',
    );
    const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(specSource));
    const sourceSha256 = [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
    const deadline = Date.now() + 240_000;
    await target.writeArtifact(
      `observation-manual-${mode}-ready.json`,
      JSON.stringify(
        {
          identity,
          mode,
          config,
          watchPath,
          mutationPath,
          sourceSha256,
          deadline,
          instructions:
            'Principal performs all product gestures. Fixture buttons only request watch controls, fixed rooted mutations, screenshots or end. Browser Machines unsupported boundary; no native host is invented.',
        },
        null,
        2,
      ),
    );
    console.info('OBSERVATION MANUAL READY', JSON.stringify({ identity, mode, config, sourceSha256, deadline }));
    let ended = false;
    let checkpoint = 0;
    try {
      while (!ended && Date.now() < deadline) {
        // oxlint-disable-next-line no-await-in-loop -- Poll only bounded explicit fixture requests after handoff.
        const requested = await target.evaluate(takeObservationManualActions);
        for (const request of requested) {
          const { id, action, gesture } = request;
          if (action === 'end') {
            ended = true;
            break;
          }
          // oxlint-disable-next-line no-await-in-loop -- Only explicit operator fixture actions are executed; never product gestures.
          if (action === 'screenshot') {
            const screenshotFile = `observation-manual-${mode}-${++checkpoint}.png`;
            // oxlint-disable-next-line no-await-in-loop -- Passive actual Home installed manifest after Principal install/guard gestures.
            const installedManifest =
              mode === 'plugins'
                ? // oxlint-disable-next-line no-await-in-loop -- Read only this requested operator checkpoint before its screenshot.
                  await readHomeJson<Record<string, unknown>>('.agents/plugins/installed.json')
                : undefined;
            // oxlint-disable-next-line no-await-in-loop -- Capture the actual page identity immediately before its screenshot.
            const capturedIdentity = await target.evaluate(() => ({
              href: location.href,
              title: document.title,
              timeOrigin: performance.timeOrigin,
            }));
            const capturedAt = Date.now();
            // oxlint-disable-next-line no-await-in-loop -- Explicit operator checkpoint saves these exact returned PNG bytes.
            const encoded = await target.screenshot(undefined, screenshotFile);
            const bytes = base64ToUint8Array(encoded);
            // oxlint-disable-next-line no-await-in-loop -- Hash only the PNG bytes saved by the screenshot command.
            const digest = await crypto.subtle.digest('SHA-256', bytes);
            const screenshotSha256 = [...new Uint8Array(digest)]
              .map((byte) => byte.toString(16).padStart(2, '0'))
              .join('');
            // oxlint-disable-next-line no-await-in-loop -- Receipt is a sibling of the exact screenshot artifact within this session directory.
            await target.writeArtifact(
              `${screenshotFile}.json`,
              JSON.stringify(
                {
                  screenshotFile,
                  screenshotSha256,
                  installedManifest,
                  bytes: bytes.byteLength,
                  sourceSha256,
                  identity: capturedIdentity,
                  initialIdentity: identity,
                  config,
                  watchPath,
                  mutationPath,
                  mode,
                  gesture,
                  capturedAt,
                  pathBase: 'same session directory as this receipt',
                },
                null,
                2,
              ),
            );
          } else if (config && action === 'mutate') {
            // oxlint-disable-next-line no-await-in-loop -- An explicit fixed-path fixture mutation uses the actual rooted writer.
            await writeProjectionProjectFile(config, mutationPath, mode === 'media' ? imageBytes : contents);
          } else if (config && action === 'delete') {
            // oxlint-disable-next-line no-await-in-loop -- Operator requested fixed-path deletion.
            await writeProjectionProjectFile(config, mutationPath);
          } else if (action === 'close' || action === 'hold' || action === 'reject' || action === 'release') {
            // oxlint-disable-next-line no-await-in-loop -- Existing allowlisted watch fixture only.
            const evidence = await controlWorkbenchObservation(action, watchPath);
            const completedAt = Date.now();
            // oxlint-disable-next-line no-await-in-loop -- Preserve the actual acknowledged fixture result before reporting completion.
            await target.writeArtifact(
              `observation-manual-${mode}-action-${id}.json`,
              JSON.stringify({ id, action, watchPath, evidence, completedAt, sourceSha256 }, null, 2),
            );
          }
          // oxlint-disable-next-line no-await-in-loop -- Complete only this acknowledged request, never a newer queued action.
          await target.evaluate(
            ({ id, action }) => {
              const status = document.querySelector<HTMLOutputElement>('[data-observation-action-status]');
              if (status?.dataset['requestId'] === String(id)) {
                status.textContent = `Fixture ${action} #${id}: complete`;
              }
            },
            { id, action },
          );
        }
        // oxlint-disable-next-line no-await-in-loop -- Bounded fixture flag cadence; no product-state polling.
        await target.delay(100);
      }
    } finally {
      await restoreWorkbenchObservation();
    }
    expect(ended).toBe(true);
  });
}
