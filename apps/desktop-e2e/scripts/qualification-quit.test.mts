/** Purpose: Refuse foreign and stale process records before any native close request can run. */
import assert from 'node:assert/strict';
import { randomUUID, createHash } from 'node:crypto';
import { mkdtemp, realpath, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
/* oxlint-disable-next-line no-restricted-imports -- Test the owning native close admission seam. */
import { requestQualificationQuit } from './qualification-quit.mjs';
const profile = await realpath(await mkdtemp(join(tmpdir(), 'tau-native-quit-')));
const previousGuard = process.env['TAU_QUALIFICATION_DISPOSABLE_HOST'];
try {
  delete process.env['TAU_QUALIFICATION_DISPOSABLE_HOST'];
  await assert.rejects(requestQualificationQuit(profile, process.pid), /disposable host/u);
  process.env['TAU_QUALIFICATION_DISPOSABLE_HOST'] = '1';
  const request = { nonce: randomUUID(), profile, installedPath: '/inert/Tau.app/Contents/Resources/app.asar' };
  const requestBytes = JSON.stringify(request);
  await writeFile(join(profile, 'route-qualification.request.json'), requestBytes);
  await writeFile(
    join(profile, 'route-qualification.ready.json'),
    JSON.stringify({ ...request, pid: process.pid, route: 'macos-zip', version: '1.0.2' }),
  );
  await assert.rejects(requestQualificationQuit(profile, process.pid + 1), /differs from the admitted profile/u);
  await writeFile(
    join(profile, 'route-qualification.state.json'),
    JSON.stringify({ requestSha256: 'changed', observations: [{ stage: 'c' }] }),
  );
  await assert.rejects(requestQualificationQuit(profile, process.pid, process.pid), /unchanged completed/u);
  await writeFile(
    join(profile, 'route-qualification.state.json'),
    JSON.stringify({
      requestSha256: createHash('sha256').update(requestBytes).digest('hex'),
      observations: [{ stage: 'b' }],
    }),
  );
  await assert.rejects(requestQualificationQuit(profile, process.pid, process.pid), /unchanged completed/u);
  console.log('Native quit guard tests passed without sending a close request.');
} finally {
  if (previousGuard === undefined) {
    delete process.env['TAU_QUALIFICATION_DISPOSABLE_HOST'];
  } else {
    process.env['TAU_QUALIFICATION_DISPOSABLE_HOST'] = previousGuard;
  }
  await rm(profile, { recursive: true, force: true });
}
