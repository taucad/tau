import { base64ToUint8Array } from 'uint8array-extras';
import { afterEach, expect, test } from 'vitest';
import { page as selectors } from 'vitest/browser';
import * as target from '#support/external-target.js';
import { openChat, reply } from '#support/chat-admission.js';
import {
  exportProjectionProjectClosure,
  projectionProject,
  writeProjectionProjectFile,
} from '#support/filesystem-projection.js';
import { readProjectStorageState, readProjectTree } from '#support/project-storage-state.js';
import type { WorkbenchObservationEvidence } from '#support/workbench-files.js';
import { controlWorkbenchObservation, restoreWorkbenchObservation } from '#support/workbench-files.js';

afterEach(async () => {
  await target.closeSecondary();
});

test('converges project and chat metadata from an independent rooted writer without navigating', async () => {
  const [chatId] = await openChat([reply('Metadata fixture response.')]);
  expect(chatId).toBeDefined();
  const project = await projectionProject();
  const tree = await readProjectTree(project);
  const manifest = JSON.parse(tree['/tau.json']!) as Record<string, unknown>;
  const chatPath = `.tau/chats/${chatId!}/chat.json`;
  const chat = JSON.parse(tree[`/${chatPath}`]!) as Record<string, unknown>;
  const name = 'Filesystem metadata current project';
  const chatName = 'Filesystem metadata current chat';
  const identity = await target.evaluate(() => ({ href: location.href, timeOrigin: performance.timeOrigin }));
  await target.openSecondary('/projects');
  await target.expectVisible(
    selectors.getByRole('link', { name: `Open ${String(manifest['name'])}`, exact: true }),
    30_000,
    'secondary',
  );
  const libraryIdentity = await target.evaluate(
    () => ({ href: location.href, timeOrigin: performance.timeOrigin }),
    undefined,
    'secondary',
  );
  const manifestReceipt = await writeProjectionProjectFile(project, 'tau.json', JSON.stringify({ ...manifest, name }));
  const chatReceipt = await writeProjectionProjectFile(project, chatPath, JSON.stringify({ ...chat, name: chatName }));
  expect(manifestReceipt.events.length).toBeGreaterThan(0);
  expect(chatReceipt.events.length).toBeGreaterThan(0);
  expect(chatReceipt.storageRootKey).toBe(manifestReceipt.storageRootKey);
  let stage = 'primary-project-name-after-independent-writes';
  try {
    await target.expectVisible(selectors.getByText(name, { exact: true }).first(), 30_000);
    stage = 'primary-chat-name-after-independent-writes';
    await target.expectVisible(selectors.getByText(chatName, { exact: true }).first(), 30_000);
  } catch (error) {
    const captureDocument = () => ({
      href: location.href,
      timeOrigin: performance.timeOrigin,
      title: document.title,
      text: document.body.textContent.slice(-16_000),
      names: [...document.querySelectorAll('[data-slot="project-trigger"], [data-slot="chat-trigger"], a')]
        .slice(0, 64)
        .map((node) => node.textContent.slice(0, 512)),
      statuses: [...document.querySelectorAll('[role="status"], [role="alert"]')]
        .slice(0, 16)
        .map((node) => node.textContent.slice(0, 1024)),
    });
    const screenshotErrors: Array<{ surface: string; error: string }> = [];
    const screenshots: Array<{ path: string; sha256: string; byteLength: number }> = [];
    try {
      const primary = await target.evaluate(captureDocument);
      const secondary = await target.evaluate(captureDocument, undefined, 'secondary');
      const physical = await exportProjectionProjectClosure(project, ['tau.json', chatPath]);
      for (const surface of ['primary', 'secondary'] as const) {
        try {
          const artifactName = `projection-metadata-failure-${surface}.png`;
          // oxlint-disable-next-line no-await-in-loop -- Serialize captures on the shared target before the secondary document closes.
          const screenshot = await target.screenshot(undefined, artifactName, surface);
          const bytes = base64ToUint8Array(screenshot);
          if (bytes.length > 8 * 1024 * 1024) {
            throw new Error('Metadata screenshot exceeded the bounded diagnostic budget.');
          }
          // oxlint-disable-next-line no-await-in-loop -- Hash the exact captured screenshot bytes independently for each surface.
          const digest = await crypto.subtle.digest('SHA-256', bytes);
          screenshots.push({
            path: artifactName,
            byteLength: bytes.length,
            sha256: [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join(''),
          });
        } catch (screenshotError) {
          screenshotErrors.push({ surface, error: String(screenshotError) });
        }
      }
      await target.writeArtifact(
        'projection-metadata-primary-name-failure.json',
        JSON.stringify(
          {
            phase: stage,
            capturedAt: Date.now(),
            expected: { name, chatName },
            identity,
            libraryIdentity,
            primary,
            secondary,
            project,
            manifestReceipt,
            chatReceipt,
            physical,
            screenshots,
            screenshotErrors,
          },
          null,
          2,
        ),
      );
    } catch (diagnosticError) {
      try {
        await target.writeArtifact(
          'projection-metadata-capture-failure.json',
          JSON.stringify(
            {
              phase: stage,
              originalFailure: String(error),
              diagnosticFailure: String(diagnosticError),
              screenshots,
              manifestReceipt,
              chatReceipt,
            },
            null,
            2,
          ),
        );
      } catch {
        // Preserve the original assertion even if the diagnostic artifact transport fails.
      }
    }
    throw error;
  }
  expect(await target.evaluate(() => ({ href: location.href, timeOrigin: performance.timeOrigin }))).toEqual(identity);
  await target.expectVisible(selectors.getByRole('link', { name: `Open ${name}`, exact: true }), 30_000, 'secondary');
  expect(
    await target.evaluate(() => ({ href: location.href, timeOrigin: performance.timeOrigin }), undefined, 'secondary'),
  ).toEqual(libraryIdentity);
});

test('updates and retires decoded thumbnail URLs in the mounted project library', async () => {
  await openChat([reply('Thumbnail fixture response.')]);
  const project = await projectionProject();
  const tree = await readProjectTree(project);
  const manifest = JSON.parse(tree['/tau.json']!) as { name: string };
  await target.openSecondary('/projects');
  const card = selectors.getByCss(`[data-slot="card"]:has(a:has-text("Open ${manifest.name}"))`);
  const thumbnail = card.getByCss('img');
  await target.expectVisible(thumbnail, 30_000, 'secondary');
  const imageIdentity = await target.evaluateLocator(
    thumbnail,
    (element) => {
      const identity = crypto.randomUUID();
      if (!(element instanceof HTMLElement)) {
        throw new Error('The thumbnail is not an HTML element.');
      }
      element.dataset['projectionThumbnail'] = identity;
      return identity;
    },
    undefined,
    'secondary',
  );
  const identity = await target.evaluate(
    () => ({ href: location.href, timeOrigin: performance.timeOrigin }),
    undefined,
    'secondary',
  );
  const image = async (color: string): Promise<Uint8Array<ArrayBuffer>> =>
    base64ToUint8Array(
      await target.evaluate((fill) => {
        const canvas = document.createElement('canvas');
        canvas.width = 16;
        canvas.height = 16;
        const context = canvas.getContext('2d');
        if (!context) {
          throw new Error('The real browser canvas is unavailable.');
        }
        context.fillStyle = fill;
        context.fillRect(0, 0, 16, 16);
        return canvas.toDataURL('image/webp').split(',')[1]!;
      }, color),
    );
  const current = async (): Promise<{ source: string; width: number }> =>
    target.evaluateLocator(
      thumbnail,
      (element) => {
        const image = element as HTMLImageElement;
        return { source: image.currentSrc || image.src, width: image.naturalWidth };
      },
      undefined,
      'secondary',
    );
  await writeProjectionProjectFile(project, 'thumbnail.webp', await image('#c026d3'));
  await expect
    .poll(
      async () => {
        const state = await current();
        return state.width;
      },
      { timeout: 30_000 },
    )
    .toBe(16);
  const first = await current();
  expect(first.source.startsWith('blob:')).toBe(true);
  await writeProjectionProjectFile(project, 'thumbnail.webp', await image('#0891b2'));
  await expect
    .poll(
      async () => {
        const state = await current();
        return state.source;
      },
      { timeout: 30_000 },
    )
    .not.toBe(first.source);
  await expect
    .poll(
      async () => {
        const state = await current();
        return state.width;
      },
      { timeout: 30_000 },
    )
    .toBe(16);
  expect(
    await target.evaluate(
      async (source) =>
        fetch(source).then(
          () => false,
          () => true,
        ),
      first.source,
      'secondary',
    ),
  ).toBe(true);
  expect(await target.getAttribute(thumbnail, 'data-projection-thumbnail', 'secondary')).toBe(imageIdentity);
  await writeProjectionProjectFile(project, 'thumbnail.webp');
  await expect
    .poll(
      async () => {
        const state = await current();
        return state.source;
      },
      { timeout: 30_000 },
    )
    .toContain('/placeholder.svg');
  expect(
    await target.evaluate(() => ({ href: location.href, timeOrigin: performance.timeOrigin }), undefined, 'secondary'),
  ).toEqual(identity);
});

type MetadataManualAction = 'project' | 'chat' | 'thumbnail-a' | 'thumbnail-b' | 'delete-thumbnail' | 'capture' | 'end';
const installMetadataManualControls = () => {
  const state = { requests: [] as Array<{ action: MetadataManualAction; gesture: string }> };
  Object.assign(globalThis, { __tauMetadataManual: state });
  document.title = 'Tau metadata manual';
  const panel = document.createElement('aside');
  panel.setAttribute('aria-label', 'Metadata fixture controls');
  panel.style.cssText =
    'position:fixed;top:8px;right:8px;z-index:2147483647;background:white;color:black;padding:8px;border:1px solid black';
  const name = document.createElement('input');
  name.setAttribute('aria-label', 'Gesture checkpoint name');
  panel.append(name);
  const actions: MetadataManualAction[] = [
    'project',
    'chat',
    'thumbnail-a',
    'thumbnail-b',
    'delete-thumbnail',
    'capture',
    'end',
  ];
  for (const action of actions) {
    const button = document.createElement('button');
    button.textContent = `Fixture ${action}`;
    button.addEventListener('click', () => {
      if (action === 'capture' && !name.value.trim()) {
        name.focus();
        return;
      }
      if (state.requests.length < 16) {
        state.requests.push({ action, gesture: name.value.trim().slice(0, 160) });
      }
    });
    panel.append(button);
  }
  document.body.append(panel);
  return { href: location.href, title: document.title, timeOrigin: performance.timeOrigin };
};
const takeMetadataManualRequests = () =>
  (
    globalThis as typeof globalThis & {
      __tauMetadataManual: { requests: Array<{ action: MetadataManualAction; gesture: string }> };
    }
  ).__tauMetadataManual.requests.splice(0);
const metadataManualImage = (color: string): string => {
  const canvas = document.createElement('canvas');
  canvas.width = 16;
  canvas.height = 16;
  const context = canvas.getContext('2d');
  if (!context) {
    throw new Error('The actual metadata renderer canvas is unavailable.');
  }
  context.fillStyle = color;
  context.fillRect(0, 0, 16, 16);
  return canvas.toDataURL('image/webp').split(',')[1]!;
};

const metadataManualEnabled =
  (import.meta as ImportMeta & { readonly env: Readonly<Record<string, string | undefined>> }).env[
    'VITE_TAU_E2E_METADATA_MANUAL'
  ] === 'true';
test.skipIf(!metadataManualEnabled)('manual browser metadata inventory and thumbnails', async () => {
  const [chatId] = await openChat([reply('Manual metadata fixture response.')]);
  if (!chatId) {
    throw new Error('The manual metadata fixture has no actual chat.');
  }
  const project = await projectionProject();
  const tree = await readProjectTree(project);
  const manifest = JSON.parse(tree['/tau.json']!) as Record<string, unknown>;
  const chatPath = `.tau/chats/${chatId}/chat.json`;
  const chat = JSON.parse(tree[`/${chatPath}`]!) as Record<string, unknown>;
  const thumbnailA = base64ToUint8Array(await target.evaluate(metadataManualImage, '#c026d3'));
  const thumbnailB = base64ToUint8Array(await target.evaluate(metadataManualImage, '#0891b2'));
  const identity = await target.evaluate(installMetadataManualControls);
  const digest = async (bytes: Uint8Array<ArrayBuffer>): Promise<string> => {
    const hash = await crypto.subtle.digest('SHA-256', bytes);
    return [...new Uint8Array(hash)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
  };
  const sourceSha256 = await digest(
    new TextEncoder().encode(
      await target.commands.readFile('../../apps/ui-e2e/src/filesystem-projection-metadata.spec.ts'),
    ),
  );
  const deadline = Date.now() + 240_000;
  const receipt = {
    identity,
    project,
    chatId,
    chatPath,
    sourceSha256,
    deadline,
    instructions:
      'Principal owns all workspace/library/chat/command-palette gestures. Only explicit independent rooted mutations, named capture and End are executed by the driver. No automated metadata mutation occurs before READY.',
  };
  await target.writeArtifact('metadata-manual-ready.json', JSON.stringify(receipt, null, 2));
  console.info('METADATA MANUAL READY', JSON.stringify(receipt));
  let ended = false;
  let checkpoint = 0;
  while (!ended && Date.now() < deadline) {
    // oxlint-disable-next-line no-await-in-loop -- Only explicit bounded requests after READY.
    const requests = await target.evaluate(takeMetadataManualRequests);
    for (const { action, gesture } of requests) {
      if (action === 'end') {
        ended = true;
        break;
      }
      // oxlint-disable-next-line unicorn-js/prefer-switch -- Preserve explicit ordered Capture versus mutation requests in this bounded operator loop.
      if (action === 'capture') {
        const capturedAt = Date.now();
        // oxlint-disable-next-line no-await-in-loop -- Record actual Principal navigation, never navigate for the operator.
        const currentIdentity = await target.evaluate(() => ({
          href: location.href,
          title: document.title,
          timeOrigin: performance.timeOrigin,
        }));
        const screenshotFile = `metadata-manual-${++checkpoint}.png`;
        // oxlint-disable-next-line no-await-in-loop -- Capture exactly the Principal-requested named checkpoint.
        const bytes = base64ToUint8Array(await target.screenshot(undefined, screenshotFile));
        // oxlint-disable-next-line no-await-in-loop -- Hash exact PNG bytes saved by the existing screenshot command.
        const screenshotSha256 = await digest(bytes);
        // oxlint-disable-next-line no-await-in-loop -- Pair source/root/gesture with exact screenshot bytes.
        await target.writeArtifact(
          `${screenshotFile}.json`,
          JSON.stringify(
            {
              ...receipt,
              screenshotFile,
              screenshotSha256,
              bytes: bytes.byteLength,
              gesture,
              capturedAt,
              currentIdentity,
            },
            null,
            2,
          ),
        );
      } else if (action === 'project') {
        // oxlint-disable-next-line no-await-in-loop -- Explicit independent production rooted writer only.
        await writeProjectionProjectFile(
          project,
          'tau.json',
          JSON.stringify({ ...manifest, name: 'Manual browser current project' }),
        );
      } else if (action === 'chat') {
        // oxlint-disable-next-line no-await-in-loop -- Explicit independent production rooted writer only.
        await writeProjectionProjectFile(
          project,
          chatPath,
          JSON.stringify({ ...chat, name: 'Manual browser current chat' }),
        );
      } else {
        // oxlint-disable-next-line no-await-in-loop -- Actual bytes/delete through existing rooted authority, never forged events.
        await writeProjectionProjectFile(
          project,
          'thumbnail.webp',
          action === 'delete-thumbnail' ? undefined : action === 'thumbnail-a' ? thumbnailA : thumbnailB,
        );
      }
    }
    // oxlint-disable-next-line no-await-in-loop -- Bounded fixture cadence only; Principal performs product gestures.
    await new Promise<void>((resolve) => {
      setTimeout(resolve, 100);
    });
  }
  expect(ended).toBe(true);
});

test('recovers one project metadata watch while a healthy sibling keeps converging without navigation', async () => {
  await target.setViewport({ width: 1440, height: 900 });
  await target.navigate('/__e2e/project-file-tree?observation=1&metadataPair=1&chat=1&watch=.tau%2Fchats');
  await target.expectUrl(/\/w\/[^/]+\/[^/]+/u, 60_000);
  const storage = await readProjectStorageState();
  const projects = await Promise.all(
    storage.configs.map(async (config) => {
      const tree = await readProjectTree(config);
      const manifest = JSON.parse(tree['/tau.json']!) as Record<string, unknown>;
      return { config, tree, manifest };
    }),
  );
  const healthy = projects.find(({ manifest }) => manifest['name'] === 'Metadata healthy A');
  const sibling = projects.find(({ manifest }) => manifest['name'] === 'Metadata sibling B');
  if (!healthy || !sibling) {
    throw new Error('The metadata pair fixture did not persist both actual projects.');
  }
  const chatRecord = (tree: Readonly<Record<string, string>>, name: string) => {
    for (const [path, content] of Object.entries(tree)) {
      if (/^\/\.tau\/chats\/[^/]+\/chat\.json$/u.test(path)) {
        const record = JSON.parse(content) as Record<string, unknown>;
        if (record['name'] === name) {
          return { path: path.slice(1), record };
        }
      }
    }
    throw new Error(`Missing physical chat metadata for ${name}.`);
  };
  const healthyChat = chatRecord(healthy.tree, 'Metadata A retained');
  const siblingChat = chatRecord(sibling.tree, 'Metadata B retained');
  expect(healthyChat.record['resourceId']).toBe(healthy.config.projectId);
  expect(siblingChat.record['resourceId']).toBe(sibling.config.projectId);
  const healthyRoot = `/projects/${healthy.config.projectId}/.tau/chats`;
  const siblingRoot = `/projects/${sibling.config.projectId}/.tau/chats`;
  const healthyList = selectors.getByCss(`[id="project-chats-${healthy.config.projectId}"]`);
  const siblingList = selectors.getByCss(`[id="project-chats-${sibling.config.projectId}"]`);
  for (const name of ['Metadata healthy A', 'Metadata sibling B']) {
    const expand = selectors.getByRole('button', { name: `Expand ${name}`, exact: true });
    // oxlint-disable-next-line no-await-in-loop -- Each actual disclosure must be inspected before its gesture.
    if (await target.isVisible(expand)) {
      // oxlint-disable-next-line no-await-in-loop -- Expand the two independent sidebar owners in order.
      await target.click(expand);
    }
  }
  await target.expectVisible(healthyList.getByText('Metadata A retained', { exact: true }));
  await target.expectVisible(siblingList.getByText('Metadata B retained', { exact: true }));
  const evidence = async (): Promise<WorkbenchObservationEvidence> =>
    target.evaluate(() => {
      const control = (
        globalThis as typeof globalThis & {
          __tauE2eObservationWatch?: { evidence(): WorkbenchObservationEvidence };
        }
      ).__tauE2eObservationWatch;
      if (!control) {
        throw new Error('The rooted metadata watch fixture is unavailable.');
      }
      return control.evidence();
    });
  const initial = await evidence();
  expect(initial.registrations[healthyRoot]).toBeGreaterThan(0);
  expect(initial.registrations[siblingRoot]).toBeGreaterThan(0);
  const identity = await target.evaluate(() => ({ href: location.href, timeOrigin: performance.timeOrigin }));
  const retry = siblingList.getByRole('button', { name: 'Retry loading chats', exact: true });
  try {
    const closed = await controlWorkbenchObservation('close', siblingRoot);
    expect(closed.closed).toBeGreaterThan(0);
    await target.expectVisible(retry);
    await target.expectVisible(siblingList.getByText('Metadata B retained', { exact: true }));
    await controlWorkbenchObservation('hold', siblingRoot);
    await target.click(retry);
    await expect
      .poll(async () => {
        const current = await evidence();
        return current.registrations[siblingRoot];
      })
      .toBeGreaterThan(initial.registrations[siblingRoot]!);
    const healthyText = JSON.stringify({ ...healthyChat.record, name: 'Metadata A while B held' });
    const siblingText = JSON.stringify({ ...siblingChat.record, name: 'Metadata B after acknowledgment' });
    const healthyWrite = await writeProjectionProjectFile(healthy.config, healthyChat.path, healthyText);
    const siblingWrite = await writeProjectionProjectFile(sibling.config, siblingChat.path, siblingText);
    const heldHealthyTree = await readProjectTree(healthy.config);
    const heldSiblingTree = await readProjectTree(sibling.config);
    expect(heldHealthyTree[`/${healthyChat.path}`]).toBe(healthyText);
    expect(heldSiblingTree[`/${siblingChat.path}`]).toBe(siblingText);
    await target.expectVisible(healthyList.getByText('Metadata A while B held', { exact: true }));
    await target.expectVisible(siblingList.getByText('Metadata B retained', { exact: true }));
    await target.expectCount(siblingList.getByText('Metadata B after acknowledgment', { exact: true }), 0);
    const held = await evidence();
    expect(held.registrations[healthyRoot]).toBe(initial.registrations[healthyRoot]);
    await controlWorkbenchObservation('release', siblingRoot);
    await target.expectCount(retry, 0);
    await target.expectVisible(siblingList.getByText('Metadata B after acknowledgment', { exact: true }));

    await controlWorkbenchObservation('close', siblingRoot);
    await target.expectVisible(retry);
    await controlWorkbenchObservation('reject', siblingRoot);
    const beforeRejected = await evidence();
    await target.click(retry);
    await expect
      .poll(async () => {
        const current = await evidence();
        return current.registrations[siblingRoot];
      })
      .toBeGreaterThan(beforeRejected.registrations[siblingRoot]!);
    await target.expectVisible(retry);
    const rejectedHealthyText = JSON.stringify({ ...healthyChat.record, name: 'Metadata A while B failed' });
    const rejectedHealthyWrite = await writeProjectionProjectFile(
      healthy.config,
      healthyChat.path,
      rejectedHealthyText,
    );
    await target.expectVisible(healthyList.getByText('Metadata A while B failed', { exact: true }));
    const rejected = await evidence();
    expect(rejected.registrations[healthyRoot]).toBe(initial.registrations[healthyRoot]);
    await controlWorkbenchObservation('release', siblingRoot);
    await target.click(retry);
    await target.expectCount(retry, 0);
    await target.expectVisible(siblingList.getByText('Metadata B after acknowledgment', { exact: true }));
    const final = await evidence();
    expect(final.registrations[healthyRoot]).toBe(initial.registrations[healthyRoot]);
    expect(final.active.find(({ path }) => path === healthyRoot)).toEqual(
      initial.active.find(({ path }) => path === healthyRoot),
    );
    const finalIdentity = await target.evaluate(() => ({ href: location.href, timeOrigin: performance.timeOrigin }));
    expect(finalIdentity).toEqual(identity);
    await target.writeArtifact(
      'metadata-scoped-retry.json',
      JSON.stringify(
        {
          healthy: healthy.config,
          sibling: sibling.config,
          healthyRoot,
          siblingRoot,
          initial,
          held,
          rejected,
          final,
          identity,
          finalIdentity,
          healthyWrite,
          siblingWrite,
          rejectedHealthyWrite,
        },
        null,
        2,
      ),
    );
  } finally {
    await restoreWorkbenchObservation();
  }
});
