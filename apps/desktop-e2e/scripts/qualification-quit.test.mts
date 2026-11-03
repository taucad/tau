/* eslint-disable @typescript-eslint/naming-convention -- Environment variables retain their wire names. */
/** Purpose: Refuse foreign and stale process records before any native close request can run. */
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { randomUUID, createHash } from 'node:crypto';
import { once } from 'node:events';
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
  if (process.platform === 'linux') {
    // A managed AppImage install admits its /usr/bin launcher; the process runs the versioned generation.
    const appImageQuit = async (outerPath: string): Promise<unknown> => {
      const child = spawn('sleep', ['60'], { env: { ...process.env, APPIMAGE: outerPath }, stdio: 'ignore' });
      try {
        // 'spawn' fires after exec, so /proc/<pid>/environ is the child's own environment.
        await once(child, 'spawn');
        const managed = { nonce: randomUUID(), profile, installedPath: '/usr/bin/tau-staging-appimage' };
        await writeFile(join(profile, 'route-qualification.request.json'), JSON.stringify(managed));
        await writeFile(
          join(profile, 'route-qualification.ready.json'),
          JSON.stringify({ ...managed, pid: child.pid, route: 'linux-appimage', version: '1.5.71' }),
        );
        return await requestQualificationQuit(profile, child.pid ?? 0).then(
          () => undefined,
          (error: unknown) => error,
        );
      } finally {
        child.kill();
      }
    };
    const foreign = await appImageQuit('/opt/tau-staging-appimage/releases/1.5.70/Tau.AppImage');
    assert.match(String(foreign), /admitted AppImage outer path/u);
    // The admitted generation passes the binding and fails later, at the absent window, without closing anything.
    const admitted = await appImageQuit('/opt/tau-staging-appimage/releases/1.5.71/Tau.AppImage');
    assert.ok(admitted instanceof Error);
    assert.doesNotMatch(admitted.message, /admitted AppImage outer path/u);
    // Only the window lookup may refuse it: an environment that could not be read is not a pass.
    assert.match(admitted.message, /xdotool/u);
  }
  console.log('Native quit guard tests passed without sending a close request.');
} finally {
  if (previousGuard === undefined) {
    delete process.env['TAU_QUALIFICATION_DISPOSABLE_HOST'];
  } else {
    process.env['TAU_QUALIFICATION_DISPOSABLE_HOST'] = previousGuard;
  }
  await rm(profile, { recursive: true, force: true });
}
