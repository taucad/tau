import jszip from 'jszip';
import { base64ToUint8Array } from 'uint8array-extras';
import { expect, test } from 'vitest';
import { page as selectors } from 'vitest/browser';
import * as target from '#support/external-target.js';

/*
 * Download ZIP, end to end.
 *
 * The failure this pins reached the person as `Failed to create ZIP archive`
 * and nothing else: the palette handed an absolute `/projects/<id>` to the
 * workspace-relative content facade, which refused it before any provider I/O.
 * Nothing below the call site was ever exercised, so only a real download
 * proves the archive exists — and that the path registry kept the project's
 * control plane out of it.
 */

const seedRoute = '/__e2e/project-file-tree';
const seedProjectName = 'sgenoud/models file-tree e2e';

const openSeededProject = async (): Promise<void> => {
  await target.navigate(seedRoute);
  try {
    await target.expectUrl(/\/w\/[^/]+\/[^/]+/u, 10_000);
  } catch {
    const project = selectors.getByRole('link', { name: seedProjectName }).first();
    await target.expectVisible(project, 60_000);
    const href = await target.getAttribute(project, 'href');
    if (!href) {
      throw new Error('Seeded project link did not include an href.');
    }
    await target.navigate(href);
    await target.expectUrl(/\/w\/[^/]+\/[^/]+/u, 60_000);
  }

  await target.expectVisible(selectors.getByTestId('cad-viewer-canvas-region').getByCss('canvas').first(), 60_000);
  await target.click(selectors.getByRole('button', { name: /^decline$/iu }), { timeout: 5000 }).catch(() => undefined);
};

test('downloads a project archive of its own files, without its control plane', async () => {
  await target.setViewport({ width: 1440, height: 900 });
  await openSeededProject();

  await target.click(selectors.getByRole('button', { name: 'Search', exact: true }));
  await target.fill(selectors.getByPlaceholder('Search projects, chats, and actions...'), 'Download ZIP');
  const command = selectors.getByRole('option', { name: /^Download ZIP(?:\s|$)/u });
  await target.expectVisible(command, 15_000);

  const archive = await target.download(command);

  expect(archive.suggestedFilename).toMatch(/\.zip$/u);
  await target.expectVisible(selectors.getByText('ZIP downloaded successfully'), 30_000);

  const zip = await jszip.loadAsync(base64ToUint8Array(archive.base64));
  const entries = Object.values(zip.files)
    .filter((file) => !file.dir)
    .map((file) => file.name);

  expect(entries).toContain('src/readme.md');
  expect(entries).toContain('package.json');
  expect(entries).toContain('public/models/honeycomb.js');
  /* The registry's own answer, so an archive a person forwards carries their
   * design and not their revision store, chat transcripts or generated types. */
  expect(
    entries.filter((entry) => /^(?:\.git\/|\.jj\/|\.tau\/(?:revisions|chats|types|cache|runs)\/)/u.test(entry)),
  ).toEqual([]);
});
