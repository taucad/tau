/**
 * The Files tree, as every spec that drives it reads and clicks it.
 *
 * One `expandPath`: it was copied into two specs, and only the copies' shared
 * assertion proved click-to-expand at all (close-out W4, blueprint Finding 5).
 */

import { page as selectors } from 'vitest/browser';
import type { Locator } from 'vitest/browser';
import * as target from '#support/external-target.js';

/** The pane a project's tree lives in. */
export const filesPane = (): Locator => selectors.getByRole('region', { name: /^Files for /u }).first();

/** One row of the tree, by its workspace-relative path. */
export const treeItem = (path: string): Locator =>
  filesPane().getByCss(`[data-testid="file-tree-item"][data-file-tree-path="${path}"]`);

export const expectFilesPane = async (): Promise<void> => {
  await target.expectVisible(filesPane(), 15_000);
};

/**
 * Open every directory along `path`, clicking only the rows that are still
 * closed — a row's children exist in the DOM only once its parent is open.
 */
export const expandPath = async (path: string): Promise<void> => {
  await expectFilesPane();
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
};
