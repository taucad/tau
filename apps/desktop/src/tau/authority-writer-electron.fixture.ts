import assert from 'node:assert/strict';
import { mkdir, symlink } from 'node:fs/promises';
import { join } from 'node:path';
import process from 'node:process';
import { app, utilityProcess } from 'electron';
import type { UtilityProcess } from 'electron';

const root = process.argv[2];
assert.ok(root);
assert.ok(process.platform === 'win32' || process.platform === 'darwin');
app.setPath('userData', join(root, 'profile'));
const children: UtilityProcess[] = [];
const receive = async (child: UtilityProcess): Promise<unknown> =>
  new Promise((resolve, reject) => {
    const responseTimer = globalThis.setTimeout(() => {
      reject(new Error('Electron utility response deadline'));
    }, 15_000);
    child.once('message', (message: unknown) => {
      globalThis.clearTimeout(responseTimer);
      resolve(message);
    });
    child.once('exit', (code) => {
      globalThis.clearTimeout(responseTimer);
      reject(new Error(`Electron utility exited before response: ${String(code)}`));
    });
  });
const launch = (authorityRoot: string): UtilityProcess => {
  const child = utilityProcess.fork(join(root, 'utility.mjs'), [authorityRoot], { stdio: 'pipe' });
  child.stderr?.setEncoding('utf8');
  child.stderr?.on('data', (chunk: string) => {
    process.stderr.write(chunk);
  });
  children.push(child);
  return child;
};
const stopChildren = (): void => {
  for (const child of children) {
    if (child.pid) {
      child.kill();
    }
  }
};

try {
  await app.whenReady();
  const authorityRoot = join(root, 'authority with spaces');
  const alias = join(root, 'alias');
  await mkdir(authorityRoot);
  await symlink(authorityRoot, alias, process.platform === 'win32' ? 'junction' : 'dir');
  const owner = launch(authorityRoot);
  const first = await receive(owner);
  assert.equal(typeof first, 'object');
  assert.ok(first && typeof first === 'object' && 'status' in first && first.status === 'owned');
  assert.ok('type' in first && first.type === 'utility');
  const competitor = await receive(launch(alias));
  assert.ok(
    competitor &&
      typeof competitor === 'object' &&
      'code' in competitor &&
      competitor.code === 'AUTHORITY_ALREADY_OWNED',
  );
  const died = new Promise<void>((resolve) => {
    owner.once('exit', () => {
      resolve();
    });
  });
  assert.ok(owner.pid);
  process.kill(owner.pid, 'SIGKILL');
  await died;
  const recovered = launch(authorityRoot);
  const recovery = await receive(recovered);
  assert.ok(recovery && typeof recovery === 'object' && 'status' in recovery && recovery.status === 'owned');
  const released = receive(recovered);
  recovered.postMessage('release');
  assert.deepEqual(await released, { status: 'released' });
  const replacement = await receive(launch(authorityRoot));
  assert.ok(
    replacement && typeof replacement === 'object' && 'status' in replacement && replacement.status === 'owned',
  );
  console.info(
    JSON.stringify({
      status: 'passed',
      platform: process.platform,
      electron: process.versions.electron,
      utilityExclusion: true,
      junctionAlias: true,
      forceKillRecovery: true,
      explicitRelease: true,
    }),
  );
  stopChildren();
  app.exit(0);
} catch (error) {
  console.error(error);
  stopChildren();
  app.exit(1);
}
