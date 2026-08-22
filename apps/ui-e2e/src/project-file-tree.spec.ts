import { expect, test } from 'vitest';
import { page as selectors } from 'vitest/browser';
import type { Locator } from 'vitest/browser';
import { stringToBase64 } from 'uint8array-extras';
import * as target from '#support/external-target.js';

const seedRoute = '/__e2e/project-file-tree';
const seedProjectName = 'sgenoud/models file-tree e2e';

function treeItem(path: string): Locator {
  return selectors.getByCss(`[data-testid="file-tree-item"][data-file-tree-path="${path}"]`);
}

async function openSeededProject(): Promise<void> {
  await target.navigate(seedRoute);
  try {
    await target.expectUrl(/\/w\/[^/]+\/[^/]+/u, 10_000);
  } catch {
    const seededProject = selectors.getByRole('link', { name: seedProjectName }).first();
    await target.expectVisible(seededProject, 60_000);
    const projectHref = await target.getAttribute(seededProject, 'href');
    if (!projectHref) {
      throw new Error('Seeded project link did not include an href.');
    }

    await target.navigate(projectHref);
    await target.expectUrl(/\/w\/[^/]+\/[^/]+/u, 60_000);
  }

  await target.expectVisible(selectors.getByRole('heading', { name: 'Files' }), 60_000);
  await target.expectVisible(treeItem('public'), 60_000);
}

async function expandPath(path: string): Promise<void> {
  const segments = path.split('/');
  let current = '';
  for (const segment of segments) {
    current = current ? `${current}/${segment}` : segment;
    const item = treeItem(current);
    // oxlint-disable-next-line no-await-in-loop -- Directory expansion is sequential; each child row only exists after its parent opens.
    await target.expectVisible(item, 15_000);
    // oxlint-disable-next-line no-await-in-loop -- Directory expansion is sequential; each child row only exists after its parent opens.
    if ((await target.getAttribute(item, 'aria-expanded')) !== 'true') {
      // oxlint-disable-next-line no-await-in-loop -- Directory expansion is sequential; each child row only exists after its parent opens.
      await target.click(item, { position: { x: 8, y: 14 } });
    }
    // oxlint-disable-next-line no-await-in-loop -- Directory expansion is sequential; each child row only exists after its parent opens.
    await target.expectAttribute(item, 'aria-expanded', 'true', 15_000);
  }
}

async function focusFolder(path: string): Promise<void> {
  const item = treeItem(path);
  if ((await target.getAttribute(item, 'aria-expanded')) !== 'true') {
    await target.click(item, { position: { x: 8, y: 14 } });
  }
  await target.expectAttribute(item, 'aria-expanded', 'true', 15_000);
  await target.click(item, { position: { x: 40, y: 14 } });
  if ((await target.getAttribute(item, 'aria-expanded')) !== 'true') {
    await target.click(item, { position: { x: 8, y: 14 } });
  }
  await target.expectAttribute(item, 'aria-expanded', 'true', 15_000);
}

async function createFolder(parentPath: string, name: string): Promise<string> {
  await focusFolder(parentPath);
  await target.click(selectors.getByRole('button', { name: 'Create new folder' }));
  const input = selectors.getByPlaceholder('Folder name');
  await target.fill(input, name);
  await target.press(input, 'Enter');
  const createdPath = `${parentPath}/${name}`;
  await target.expectVisible(treeItem(createdPath));
  return createdPath;
}

async function createBlankFile(parentPath: string, name: string): Promise<string> {
  await focusFolder(parentPath);
  await target.click(selectors.getByRole('button', { name: 'Create new file' }));
  const blankMenuItem = selectors.getByRole('menuitem', { name: 'Blank' });
  await target.expectVisible(blankMenuItem, 10_000);
  await target.click(blankMenuItem, { force: true });
  const input = selectors.getByPlaceholder('New File');
  await target.fill(input, name);
  await target.press(input, 'Enter');
  const createdPath = `${parentPath}/${name}`;
  await target.expectVisible(treeItem(createdPath));
  return createdPath;
}

async function openContextMenu(path: string): Promise<void> {
  await target.click(treeItem(path), { button: 'right' });
}

async function deletePath(path: string): Promise<void> {
  await openContextMenu(path);
  await target.click(selectors.getByRole('menuitem', { name: 'Delete' }));
  const dialog = selectors.getByRole('alertdialog');
  await target.expectVisible(dialog);
  await target.click(dialog.getByRole('button', { name: /^Delete/u }));
  await target.expectCount(treeItem(path), 0);
}

async function uploadFileFromMenu(options: {
  menuTargetPath: string;
  expectedDirectory: string;
  filename?: string;
}): Promise<string> {
  const { menuTargetPath, expectedDirectory, filename = 'uploaded-flat.js' } = options;
  await openContextMenu(menuTargetPath);
  await target.chooseFile(selectors.getByRole('menuitem', { name: 'Upload Files' }), {
    base64: stringToBase64(
      "import { makeBaseBox } from 'replicad';\nexport default function main() { return makeBaseBox(4, 4, 4); }\n",
    ),
    mimeType: 'text/javascript',
    name: filename,
  });

  const uploadedPath = expectedDirectory ? `${expectedDirectory}/${filename}` : filename;
  await target.expectVisible(treeItem(uploadedPath));
  return uploadedPath;
}

async function uploadFileToPath(targetPath: string): Promise<string> {
  return uploadFileFromMenu({ menuTargetPath: targetPath, expectedDirectory: targetPath });
}

async function expectNoMenuItem(name: string): Promise<void> {
  await target.expectCount(selectors.getByRole('menuitem', { name }), 0);
}

async function moveKeyboardDragTargetUntil(pattern: RegExp): Promise<void> {
  const liveRegion = selectors.getByCss('span[aria-live="assertive"]');
  for (let attempt = 0; attempt < 20; attempt++) {
    // oxlint-disable-next-line no-await-in-loop -- Keyboard DnD target navigation is inherently sequential.
    const text = (await target.textContent(liveRegion)) ?? '';
    if (pattern.test(text)) {
      return;
    }

    // oxlint-disable-next-line no-await-in-loop -- Keyboard DnD target navigation is inherently sequential.
    await target.keyboardPress('ArrowDown');
  }

  throw new Error(`Keyboard drag target never matched ${pattern}. Last text: ${await target.textContent(liveRegion)}`);
}

async function installClipboardStub(): Promise<void> {
  await target.addInitScript(() => {
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
  targetPath: string;
  recursive: boolean;
  filename?: string;
}): Promise<void> {
  const item = treeItem(options.targetPath);
  await target.expectVisible(item, 15_000);
  await target.evaluateLocator(
    item,
    (element, transferOptions) => {
      const dataTransfer = transferOptions.recursive
        ? (() => {
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
            const entry = {
              kind: 'file',
              getAsFile: () => null,
              webkitGetAsEntry: () =>
                directoryEntry('recursive-drop', [
                  directoryEntry('empty-child', []),
                  directoryEntry('nested', [
                    fileEntry('nested-model.js', 'export default function main() { return null; }\n'),
                  ]),
                ]),
            };
            return {
              dropEffect: 'copy',
              effectAllowed: 'copy',
              files: {
                length: 0,
                item: () => null,
                *[Symbol.iterator]() {
                  yield* [];
                },
              },
              items: {
                length: 1,
                item: (index: number) => (index === 0 ? entry : null),
                *[Symbol.iterator]() {
                  yield entry;
                },
              },
            };
          })()
        : (() => {
            const transfer = new DataTransfer();
            transfer.effectAllowed = 'copy';
            transfer.items.add(
              new File(['export default function main() { return null; }\n'], transferOptions.filename!, {
                type: 'text/javascript',
              }),
            );
            return transfer;
          })();
      for (const eventType of ['dragenter', 'dragover', 'drop'] as const) {
        const event = new DragEvent(eventType, {
          bubbles: true,
          cancelable: true,
        });
        Object.defineProperty(event, 'dataTransfer', {
          configurable: true,
          value: dataTransfer,
        });
        element.dispatchEvent(event);
      }
    },
    options,
  );
}

async function dropFlatFile(targetPath: string, filename: string): Promise<string> {
  await dispatchDataTransferDrop({ targetPath, recursive: false, filename });

  const uploadedPath = `${targetPath}/${filename}`;
  await target.expectVisible(treeItem(uploadedPath), 15_000);
  return uploadedPath;
}

async function dropMockRecursiveFolder(targetPath: string): Promise<string> {
  await dispatchDataTransferDrop({ targetPath, recursive: true });

  const droppedRoot = `${targetPath}/recursive-drop`;
  await target.expectVisible(treeItem(droppedRoot), 15_000);
  return droppedRoot;
}

test.describe('project file tree', () => {
  test('supports core write actions without raw directory delete failures', async () => {
    await openSeededProject();
    await expandPath('public/models');
    await target.expectVisible(treeItem('public/models/honeycomb.js'));

    const createdFolderPath = await createFolder('public/models', 'zz-e2e-folder');
    const createdFilePath = await createBlankFile('public/models', 'zz-e2e-created.js');

    const uploadedPath = await uploadFileToPath('public/models');

    const dragTargetPath = await createFolder('public/models', 'zz-e2e-dnd-target');
    await target.drag(treeItem(uploadedPath), treeItem(dragTargetPath));
    await target.expectVisible(treeItem(`${dragTargetPath}/uploaded-flat.js`), 15_000);

    await deletePath(createdFolderPath);
    await deletePath(dragTargetPath);
    await deletePath(createdFilePath);
  });

  test('uploads from a nested file context menu into the file parent directory', async () => {
    await openSeededProject();
    await expandPath('public/models');

    const uploadedPath = await uploadFileFromMenu({
      menuTargetPath: 'public/models/honeycomb.js',
      expectedDirectory: 'public/models',
      filename: 'uploaded-from-file-target.js',
    });

    await target.expectVisible(treeItem(uploadedPath));
    await target.expectCount(treeItem('uploaded-from-file-target.js'), 0);

    await deletePath(uploadedPath);
  });

  test('supports keyboard drag and drop between folders', async () => {
    await openSeededProject();
    await expandPath('public/models');

    const sourcePath = await createBlankFile('public/models', 'zzzz-e2e-keyboard-source.js');
    await target.click(treeItem(sourcePath));
    await target.keyboardPress('Control+Shift+D');
    await target.expectContainingText(
      selectors.getByCss('span[aria-live="assertive"]'),
      'Dragging zzzz-e2e-keyboard-source.js',
    );
    await moveKeyboardDragTargetUntil(/\bin public\b/u);
    await target.keyboardPress('Enter');

    const movedPath = 'public/zzzz-e2e-keyboard-source.js';
    await target.expectVisible(treeItem(movedPath), 15_000);
    await target.expectCount(treeItem(sourcePath), 0);

    await deletePath(movedPath);
  });

  test('handles pointer drag targets, no-ops, collisions, and read-only paths', async () => {
    await openSeededProject();
    await expandPath('public/models');
    await expandPath('src');

    const fileTargetSource = await createBlankFile('src', 'zz-e2e-file-target.js');
    await target.drag(treeItem(fileTargetSource), treeItem('public/models/honeycomb.js'));
    await target.expectVisible(treeItem('public/models/zz-e2e-file-target.js'), 15_000);
    await target.expectCount(treeItem(fileTargetSource), 0);

    const noOpFile = await createBlankFile('public/models', 'zz-e2e-no-op.js');
    await target.drag(treeItem(noOpFile), treeItem('public/models'));
    await target.expectVisible(treeItem(noOpFile));

    const folderMove = await createFolder('public/models', 'zz-e2e-folder-move');
    const folderChild = await createBlankFile(folderMove, 'child.js');
    await target.drag(treeItem(folderMove), treeItem('public'));
    await expandPath('public/zz-e2e-folder-move');
    await target.expectVisible(treeItem('public/zz-e2e-folder-move/child.js'), 15_000);
    await target.expectCount(treeItem(folderChild), 0);

    const collisionSource = await createBlankFile('src', 'zz-e2e-collision.js');
    const collisionTarget = await createBlankFile('public/models', 'zz-e2e-collision.js');
    await target.click(treeItem(collisionSource));
    await target.drag(treeItem(collisionSource), treeItem(collisionTarget));
    await target.expectVisible(selectors.getByRole('alertdialog', { name: /Replace/u }));
    await target.click(selectors.getByRole('button', { name: 'Cancel' }));
    await target.expectVisible(treeItem(collisionSource));
    await target.expectVisible(treeItem(collisionTarget));

    await target.drag(treeItem(collisionSource), treeItem(collisionTarget));
    await target.expectVisible(selectors.getByRole('alertdialog', { name: /Replace/u }));
    await target.click(selectors.getByRole('button', { name: 'Replace' }));
    await target.expectCount(treeItem(collisionSource), 0);
    await target.expectVisible(treeItem(collisionTarget));

    await target.drag(treeItem('public/models/box-corner.js'), treeItem('node_modules'));
    await target.expectVisible(treeItem('public/models/box-corner.js'));
    await target.drag(treeItem('node_modules'), treeItem('public'));
    await target.expectVisible(treeItem('node_modules'));

    await deletePath('public/models/zz-e2e-file-target.js');
    await deletePath(noOpFile);
    await deletePath('public/zz-e2e-folder-move');
    await deletePath(collisionTarget);
  });

  test('imports synthetic flat files and recursive folders from external drops', async () => {
    await openSeededProject();
    await expandPath('public/models');

    const flatPath = await dropFlatFile('public/models', 'zz-e2e-flat-drop.js');
    const recursiveRoot = await dropMockRecursiveFolder('public/models');
    await expandPath(recursiveRoot);
    await target.expectVisible(treeItem(`${recursiveRoot}/empty-child`), 15_000);
    await expandPath(`${recursiveRoot}/nested`);
    await target.expectVisible(treeItem(`${recursiveRoot}/nested/nested-model.js`), 15_000);

    await deletePath(flatPath);
    await deletePath(recursiveRoot);
  });

  test('supports search, collapse, active delete, and deterministic import-shaped smoke', async () => {
    await installClipboardStub();
    await openSeededProject();
    await expandPath('public/models');
    await target.expectVisible(treeItem('public/models/honeycomb.js'));

    await target.click(selectors.getByRole('button', { name: 'Search files' }));
    const searchInput = selectors.getByPlaceholder('Search files...');
    await target.fill(searchInput, 'strainer');
    await target.press(searchInput, 'Enter');
    await expandPath('public/models/nested');
    await target.expectVisible(treeItem('public/models/nested/strainer.js'));
    await target.press(searchInput, 'Escape');

    await target.click(selectors.getByRole('button', { name: 'Collapse all folders' }));
    await target.expectCount(treeItem('public/models/honeycomb.js'), 0);

    await expandPath('public/models');
    const activeDeletePath = await createBlankFile('public/models', 'zz-e2e-active-delete.js');
    await target.click(treeItem(activeDeletePath));
    await deletePath(activeDeletePath);

    await openContextMenu('public/models/honeycomb.js');
    await target.click(selectors.getByRole('menuitem', { name: 'Copy Path' }));
    await target.expectVisible(selectors.getByText('Path copied to clipboard'), 15_000);
    await expect
      .poll(async () => target.evaluate(() => (globalThis as unknown as { __tauCopiedText?: string }).__tauCopiedText))
      .toBe('public/models/honeycomb.js');
  });

  test('presents bundled dependency files as read-only', async () => {
    await openSeededProject();

    await openContextMenu('node_modules');

    await target.expectVisible(selectors.getByRole('menuitem', { name: 'Read-only' }));
    await expectNoMenuItem('Rename');
    await expectNoMenuItem('Upload Files');
    await expectNoMenuItem('Delete');
    await expectNoMenuItem('Download as ZIP');
    await target.expectVisible(selectors.getByRole('menuitem', { name: 'Copy Path' }));
  });
});
