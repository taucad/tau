/** Candidate directory preparation on a receipt job that has only checked out the repository. */
import assert from 'node:assert/strict';
import { mkdir, mkdtemp, rm, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
// oxlint-disable-next-line no-restricted-imports -- Test the script's own export beside it.
import { prepareCandidateDirectory } from './fetch-desktop-installer-candidate.mjs';

const main = async (): Promise<void> => {
  const workspace = await mkdtemp(join(tmpdir(), 'tau-candidate-'));
  try {
    const directory = join(workspace, 'out', 'qualification-candidate');
    assert.equal(await prepareCandidateDirectory(directory), directory);
    const created = await stat(directory);
    assert.ok(created.isDirectory(), 'a missing out/ parent is created');
    await assert.rejects(prepareCandidateDirectory(directory), { code: 'EEXIST' }, 'an existing candidate is refused');
    const other = join(workspace, 'existing', 'qualification-candidate');
    await mkdir(join(workspace, 'existing'));
    assert.equal(await prepareCandidateDirectory(other), other);
  } finally {
    await rm(workspace, { recursive: true, force: true });
  }
};

try {
  await main();
  console.log('fetch-desktop-installer-candidate: candidate directory checks passed');
} catch (error) {
  console.error(error);
  process.exitCode = 1;
}
