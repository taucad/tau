import { mkdir, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import { expect, test } from '@playwright/test';
import type { JSHandle, Locator, Page, TestInfo } from '@playwright/test';

const seedRoute = '/__e2e/project-file-tree';
const seedProjectName = 'sgenoud/models file-tree e2e';

function treeItem(page: Page, path: string): Locator {
  return page.locator(`[data-testid="file-tree-item"][data-file-tree-path="${path}"]`);
}

async function openSeededProject(page: Page): Promise<void> {
  await page.goto(seedRoute);
  try {
    await expect(page).toHaveURL(/\/projects\/proj_/u, { timeout: 10_000 });
  } catch {
    const seededProject = page.getByRole('link', { name: seedProjectName }).first();
    await expect(seededProject).toBeVisible({ timeout: 60_000 });
    const projectHref = await seededProject.getAttribute('href');
    if (!projectHref) {
      throw new Error('Seeded project link did not include an href.');
    }

    await page.goto(projectHref);
    await expect(page).toHaveURL(/\/projects\/proj_/u, { timeout: 60_000 });
  }

  await expect(page.getByRole('heading', { name: 'Files' })).toBeVisible({ timeout: 60_000 });
  await expect(treeItem(page, 'public')).toBeVisible({ timeout: 60_000 });
}

async function expandPath(page: Page, path: string): Promise<void> {
  const segments = path.split('/');
  let current = '';
  for (const segment of segments) {
    current = current ? `${current}/${segment}` : segment;
    const item = treeItem(page, current);
    // oxlint-disable-next-line no-await-in-loop -- Directory expansion is sequential; each child row only exists after its parent opens.
    await expect(item).toBeVisible({ timeout: 15_000 });
    // oxlint-disable-next-line no-await-in-loop -- Directory expansion is sequential; each child row only exists after its parent opens.
    if ((await item.getAttribute('aria-expanded')) !== 'true') {
      // oxlint-disable-next-line no-await-in-loop -- Directory expansion is sequential; each child row only exists after its parent opens.
      await item.click({ position: { x: 8, y: 14 } });
    }
    // oxlint-disable-next-line no-await-in-loop -- Directory expansion is sequential; each child row only exists after its parent opens.
    await expect(item).toHaveAttribute('aria-expanded', 'true', { timeout: 15_000 });
  }
}

async function focusFolder(page: Page, path: string): Promise<void> {
  const item = treeItem(page, path);
  if ((await item.getAttribute('aria-expanded')) !== 'true') {
    await item.click({ position: { x: 8, y: 14 } });
  }
  await expect(item).toHaveAttribute('aria-expanded', 'true', { timeout: 15_000 });
  await item.click({ position: { x: 40, y: 14 } });
  if ((await item.getAttribute('aria-expanded')) !== 'true') {
    await item.click({ position: { x: 8, y: 14 } });
  }
  await expect(item).toHaveAttribute('aria-expanded', 'true', { timeout: 15_000 });
}

async function createFolder(page: Page, parentPath: string, name: string): Promise<string> {
  await focusFolder(page, parentPath);
  await page.getByRole('button', { name: 'Create new folder' }).click();
  const input = page.getByPlaceholder('Folder name');
  await input.fill(name);
  await input.press('Enter');
  const createdPath = `${parentPath}/${name}`;
  await expect(treeItem(page, createdPath)).toBeVisible();
  return createdPath;
}

async function createBlankFile(page: Page, parentPath: string, name: string): Promise<string> {
  await focusFolder(page, parentPath);
  await page.getByRole('button', { name: 'Create new file' }).click();
  const blankMenuItem = page.getByRole('menuitem', { name: 'Blank' });
  await expect(blankMenuItem).toBeVisible({ timeout: 10_000 });
  await blankMenuItem.click({ force: true });
  const input = page.getByPlaceholder('New File');
  await input.fill(name);
  await input.press('Enter');
  const createdPath = `${parentPath}/${name}`;
  await expect(treeItem(page, createdPath)).toBeVisible();
  return createdPath;
}

async function openContextMenu(page: Page, path: string): Promise<void> {
  await treeItem(page, path).click({ button: 'right' });
}

async function deletePath(page: Page, path: string): Promise<void> {
  await openContextMenu(page, path);
  await page.getByRole('menuitem', { name: 'Delete' }).click();
  const dialog = page.getByRole('alertdialog');
  await expect(dialog).toBeVisible();
  await dialog.getByRole('button', { name: /^Delete/u }).click();
  await expect(treeItem(page, path)).toHaveCount(0);
}

async function uploadFileFromMenu(options: {
  page: Page;
  menuTargetPath: string;
  expectedDirectory: string;
  testInfo: TestInfo;
  filename?: string;
}): Promise<string> {
  const { page, menuTargetPath, expectedDirectory, testInfo, filename = 'uploaded-flat.js' } = options;
  const fixturePath = testInfo.outputPath(filename);
  await mkdir(dirname(fixturePath), { recursive: true });
  await writeFile(
    fixturePath,
    "import { makeBaseBox } from 'replicad';\nexport default function main() { return makeBaseBox(4, 4, 4); }\n",
  );

  const chooserPromise = page.waitForEvent('filechooser');
  await openContextMenu(page, menuTargetPath);
  await page.getByRole('menuitem', { name: 'Upload Files' }).click();
  const chooser = await chooserPromise;
  await chooser.setFiles(fixturePath);

  const uploadedPath = expectedDirectory ? `${expectedDirectory}/${filename}` : filename;
  await expect(treeItem(page, uploadedPath)).toBeVisible();
  return uploadedPath;
}

async function uploadFileToPath(page: Page, targetPath: string, testInfo: TestInfo): Promise<string> {
  return uploadFileFromMenu({ page, menuTargetPath: targetPath, expectedDirectory: targetPath, testInfo });
}

async function expectNoMenuItem(page: Page, name: string): Promise<void> {
  await expect(page.getByRole('menuitem', { name })).toHaveCount(0);
}

async function moveKeyboardDragTargetUntil(page: Page, pattern: RegExp): Promise<void> {
  const liveRegion = page.locator('span[aria-live="assertive"]');
  for (let attempt = 0; attempt < 20; attempt++) {
    // oxlint-disable-next-line no-await-in-loop -- Keyboard DnD target navigation is inherently sequential.
    const text = (await liveRegion.textContent()) ?? '';
    if (pattern.test(text)) {
      return;
    }

    // oxlint-disable-next-line no-await-in-loop -- Keyboard DnD target navigation is inherently sequential.
    await page.keyboard.press('ArrowDown');
  }

  throw new Error(`Keyboard drag target never matched ${pattern}. Last text: ${await liveRegion.textContent()}`);
}

async function installClipboardStub(page: Page): Promise<void> {
  await page.addInitScript(() => {
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: {
        async writeText(text: string): Promise<void> {
          (globalThis as unknown as { __tauCopiedText?: string }).__tauCopiedText = text;
        },
      },
    });
  });
}

async function dispatchDataTransferDrop(options: {
  page: Page;
  targetPath: string;
  dataTransfer: JSHandle<unknown>;
}): Promise<void> {
  const { page, targetPath, dataTransfer } = options;
  const target = treeItem(page, targetPath);
  await expect(target).toBeVisible({ timeout: 15_000 });
  await target.evaluate((element, transfer) => {
    for (const eventType of ['dragenter', 'dragover', 'drop'] as const) {
      const event = new DragEvent(eventType, {
        bubbles: true,
        cancelable: true,
      });
      Object.defineProperty(event, 'dataTransfer', {
        configurable: true,
        value: transfer,
      });
      element.dispatchEvent(event);
    }
  }, dataTransfer);
}

async function dropFlatFile(page: Page, targetPath: string, filename: string): Promise<string> {
  const dataTransfer = await page.evaluateHandle(
    ({ fileName }) => {
      const transfer = new DataTransfer();
      transfer.effectAllowed = 'copy';
      transfer.items.add(
        new File(['export default function main() { return null; }\n'], fileName, {
          type: 'text/javascript',
        }),
      );
      return transfer;
    },
    { fileName: filename },
  );

  await dispatchDataTransferDrop({ page, targetPath, dataTransfer });

  const uploadedPath = `${targetPath}/${filename}`;
  await expect(treeItem(page, uploadedPath)).toBeVisible({ timeout: 15_000 });
  return uploadedPath;
}

async function dropMockRecursiveFolder(page: Page, targetPath: string): Promise<string> {
  const dataTransfer = await page.evaluateHandle(() => {
    const fileEntry = (name: string, content: string) => ({
      name,
      isFile: true,
      isDirectory: false,
      file(resolve: (file: File) => void) {
        resolve(new File([content], name, { type: 'text/javascript' }));
      },
    });
    const directoryEntry = (name: string, children: unknown[]) => ({
      name,
      isFile: false,
      isDirectory: true,
      createReader() {
        let readCount = 0;
        return {
          readEntries(resolve: (entries: unknown[]) => void) {
            readCount++;
            resolve(readCount === 1 ? children : []);
          },
        };
      },
    });
    const item = {
      kind: 'file',
      getAsFile() {
        return null;
      },
      webkitGetAsEntry() {
        return directoryEntry('recursive-drop', [
          directoryEntry('empty-child', []),
          directoryEntry('nested', [fileEntry('nested-model.js', 'export default function main() { return null; }\n')]),
        ]);
      },
    };
    return {
      dropEffect: 'copy',
      effectAllowed: 'copy',
      files: {
        length: 0,
        item() {
          return null;
        },
        *[Symbol.iterator]() {},
      },
      items: {
        0: item,
        length: 1,
        item(index: number) {
          return index === 0 ? item : null;
        },
        *[Symbol.iterator]() {
          yield item;
        },
      },
    };
  });

  await dispatchDataTransferDrop({ page, targetPath, dataTransfer });

  const droppedRoot = `${targetPath}/recursive-drop`;
  await expect(treeItem(page, droppedRoot)).toBeVisible({ timeout: 15_000 });
  return droppedRoot;
}

test.describe('project file tree', () => {
  test('supports core write actions without raw directory delete failures', async ({ page }, testInfo) => {
    await openSeededProject(page);
    await expandPath(page, 'public/models');
    await expect(treeItem(page, 'public/models/honeycomb.js')).toBeVisible();

    const createdFolderPath = await createFolder(page, 'public/models', 'zz-e2e-folder');
    const createdFilePath = await createBlankFile(page, 'public/models', 'zz-e2e-created.js');

    const uploadedPath = await uploadFileToPath(page, 'public/models', testInfo);

    const dragTargetPath = await createFolder(page, 'public/models', 'zz-e2e-dnd-target');
    await treeItem(page, uploadedPath).dragTo(treeItem(page, dragTargetPath));
    await expect(treeItem(page, `${dragTargetPath}/uploaded-flat.js`)).toBeVisible({ timeout: 15_000 });

    await deletePath(page, createdFolderPath);
    await deletePath(page, dragTargetPath);
    await deletePath(page, createdFilePath);
  });

  test('uploads from a nested file context menu into the file parent directory', async ({ page }, testInfo) => {
    await openSeededProject(page);
    await expandPath(page, 'public/models');

    const uploadedPath = await uploadFileFromMenu({
      page,
      menuTargetPath: 'public/models/honeycomb.js',
      expectedDirectory: 'public/models',
      testInfo,
      filename: 'uploaded-from-file-target.js',
    });

    await expect(treeItem(page, uploadedPath)).toBeVisible();
    await expect(treeItem(page, 'uploaded-from-file-target.js')).toHaveCount(0);

    await deletePath(page, uploadedPath);
  });

  test('supports keyboard drag and drop between folders', async ({ page }) => {
    await openSeededProject(page);
    await expandPath(page, 'public/models');

    const sourcePath = await createBlankFile(page, 'public/models', 'zzzz-e2e-keyboard-source.js');
    await treeItem(page, sourcePath).click();
    await page.keyboard.press('Control+Shift+D');
    await expect(page.locator('span[aria-live="assertive"]')).toContainText('Dragging zzzz-e2e-keyboard-source.js', {
      timeout: 10_000,
    });
    await moveKeyboardDragTargetUntil(page, /\bin public\b/u);
    await page.keyboard.press('Enter');

    const movedPath = 'public/zzzz-e2e-keyboard-source.js';
    await expect(treeItem(page, movedPath)).toBeVisible({ timeout: 15_000 });
    await expect(treeItem(page, sourcePath)).toHaveCount(0);

    await deletePath(page, movedPath);
  });

  test('handles pointer drag targets, no-ops, collisions, and read-only paths', async ({ page }) => {
    await openSeededProject(page);
    await expandPath(page, 'public/models');
    await expandPath(page, 'src');

    const fileTargetSource = await createBlankFile(page, 'src', 'zz-e2e-file-target.js');
    await treeItem(page, fileTargetSource).dragTo(treeItem(page, 'public/models/honeycomb.js'));
    await expect(treeItem(page, 'public/models/zz-e2e-file-target.js')).toBeVisible({ timeout: 15_000 });
    await expect(treeItem(page, fileTargetSource)).toHaveCount(0);

    const noOpFile = await createBlankFile(page, 'public/models', 'zz-e2e-no-op.js');
    await treeItem(page, noOpFile).dragTo(treeItem(page, 'public/models'));
    await expect(treeItem(page, noOpFile)).toBeVisible();

    const folderMove = await createFolder(page, 'public/models', 'zz-e2e-folder-move');
    const folderChild = await createBlankFile(page, folderMove, 'child.js');
    await treeItem(page, folderMove).dragTo(treeItem(page, 'public'));
    await expandPath(page, 'public/zz-e2e-folder-move');
    await expect(treeItem(page, 'public/zz-e2e-folder-move/child.js')).toBeVisible({ timeout: 15_000 });
    await expect(treeItem(page, folderChild)).toHaveCount(0);

    const collisionSource = await createBlankFile(page, 'src', 'zz-e2e-collision.js');
    const collisionTarget = await createBlankFile(page, 'public/models', 'zz-e2e-collision.js');
    await treeItem(page, collisionSource).click();
    await treeItem(page, collisionSource).dragTo(treeItem(page, collisionTarget));
    await expect(page.getByRole('alertdialog', { name: /Replace/u })).toBeVisible();
    await page.getByRole('button', { name: 'Cancel' }).click();
    await expect(treeItem(page, collisionSource)).toBeVisible();
    await expect(treeItem(page, collisionTarget)).toBeVisible();

    await treeItem(page, collisionSource).dragTo(treeItem(page, collisionTarget));
    await expect(page.getByRole('alertdialog', { name: /Replace/u })).toBeVisible();
    await page.getByRole('button', { name: 'Replace' }).click();
    await expect(treeItem(page, collisionSource)).toHaveCount(0);
    await expect(treeItem(page, collisionTarget)).toBeVisible();

    await treeItem(page, 'public/models/box-corner.js').dragTo(treeItem(page, 'node_modules'));
    await expect(treeItem(page, 'public/models/box-corner.js')).toBeVisible();
    await treeItem(page, 'node_modules').dragTo(treeItem(page, 'public'));
    await expect(treeItem(page, 'node_modules')).toBeVisible();

    await deletePath(page, 'public/models/zz-e2e-file-target.js');
    await deletePath(page, noOpFile);
    await deletePath(page, 'public/zz-e2e-folder-move');
    await deletePath(page, collisionTarget);
  });

  test('imports synthetic flat files and recursive folders from external drops', async ({ page }) => {
    await openSeededProject(page);
    await expandPath(page, 'public/models');

    const flatPath = await dropFlatFile(page, 'public/models', 'zz-e2e-flat-drop.js');
    const recursiveRoot = await dropMockRecursiveFolder(page, 'public/models');
    await expandPath(page, recursiveRoot);
    await expect(treeItem(page, `${recursiveRoot}/empty-child`)).toBeVisible({ timeout: 15_000 });
    await expandPath(page, `${recursiveRoot}/nested`);
    await expect(treeItem(page, `${recursiveRoot}/nested/nested-model.js`)).toBeVisible({ timeout: 15_000 });

    await deletePath(page, flatPath);
    await deletePath(page, recursiveRoot);
  });

  test('supports search, collapse, active delete, and deterministic import-shaped smoke', async ({ page }) => {
    await installClipboardStub(page);
    await openSeededProject(page);
    await expandPath(page, 'public/models');
    await expect(treeItem(page, 'public/models/honeycomb.js')).toBeVisible();

    await page.getByRole('button', { name: 'Search files' }).click();
    const searchInput = page.getByPlaceholder('Search files...');
    await searchInput.fill('strainer');
    await searchInput.press('Enter');
    await expandPath(page, 'public/models/nested');
    await expect(treeItem(page, 'public/models/nested/strainer.js')).toBeVisible();
    await searchInput.press('Escape');

    await page.getByRole('button', { name: 'Collapse all folders' }).click();
    await expect(treeItem(page, 'public/models/honeycomb.js')).toHaveCount(0);

    await expandPath(page, 'public/models');
    const activeDeletePath = await createBlankFile(page, 'public/models', 'zz-e2e-active-delete.js');
    await treeItem(page, activeDeletePath).click();
    await deletePath(page, activeDeletePath);

    await openContextMenu(page, 'public/models/honeycomb.js');
    await page.getByRole('menuitem', { name: 'Copy Path' }).click();
    await expect(page.getByText('Path copied to clipboard')).toBeVisible({ timeout: 15_000 });
    await expect
      .poll(async () => page.evaluate(() => (globalThis as unknown as { __tauCopiedText?: string }).__tauCopiedText))
      .toBe('public/models/honeycomb.js');
  });

  test('presents bundled dependency files as read-only', async ({ page }) => {
    await openSeededProject(page);

    await openContextMenu(page, 'node_modules');

    await expect(page.getByRole('menuitem', { name: 'Read-only' })).toBeVisible();
    await expectNoMenuItem(page, 'Rename');
    await expectNoMenuItem(page, 'Upload Files');
    await expectNoMenuItem(page, 'Delete');
    await expectNoMenuItem(page, 'Download as ZIP');
    await expect(page.getByRole('menuitem', { name: 'Copy Path' })).toBeVisible();
  });
});
