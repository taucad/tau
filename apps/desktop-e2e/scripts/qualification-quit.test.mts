/* eslint-disable @typescript-eslint/naming-convention -- Environment variables retain their wire names. */
/** Purpose: Refuse foreign and stale process records before any native close request can run. */
import assert from 'node:assert/strict';
import { execFileSync, spawn, spawnSync } from 'node:child_process';
import { randomUUID, createHash } from 'node:crypto';
import { once } from 'node:events';
import { chmod, copyFile, mkdtemp, readFile, readlink, realpath, rm, writeFile } from 'node:fs/promises';
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
    // The refusal names what the kernel reported, so a CI mismatch is diagnosable without the guest.
    assert.match(
      String(foreign),
      /outer path \/opt\/tau-staging-appimage\/releases\/1\.5\.71\/Tau\.AppImage; .* "APPIMAGE=\/opt\/tau-staging-appimage\/releases\/1\.5\.70\/Tau\.AppImage"; \/proc\/\d+\/exe is .*; AppImage processes: /u,
    );
    // The admitted generation passes the binding and fails later, at the absent window, without closing anything.
    const admitted = await appImageQuit('/opt/tau-staging-appimage/releases/1.5.71/Tau.AppImage');
    assert.ok(admitted instanceof Error);
    assert.doesNotMatch(admitted.message, /admitted AppImage outer path/u);
    // Only the window lookup may refuse it: an environment that could not be read is not a pass.
    assert.match(admitted.message, /xdotool/u);
    // With the environment block overwritten, the AppImage runtime that serves the mount still binds the outer
    // path: its own executable is the outer file and it holds the write end of the keepalive pipe whose read end the
    // browser inherited. It is not the browser's child (it daemonizes), so here it is a sibling of the browser. A
    // portable AppImage admits its outer path directly, so a copy of `sleep` named Tau.AppImage stands in for it.
    const portable = join(profile, 'Tau.AppImage');
    await copyFile(execFileSync('sh', ['-c', 'command -v sleep'], { encoding: 'utf8' }).trim(), portable);
    await chmod(portable, 0o755);
    const runtimeQuit = async (runtimePath: string, sharePipe = true): Promise<unknown> => {
      const { APPIMAGE: _absent, ...withoutAppImage } = process.env;
      // A shell pipeline makes a kernel pipe (Node's own stdio pipes are socket pairs); `sleep` reads its end.
      const script = sharePipe ? '"$1" 60 | sleep 60 & wait' : '"$1" 60 & sleep 60 & wait';
      const shell = spawn('sh', ['-c', script, 'sh', runtimePath], { env: withoutAppImage, stdio: 'ignore' });
      try {
        await once(shell, 'spawn');
        // The stand-in browser is the shell's `sleep` child; wait until both children exist.
        let browserPid = 0;
        for (let attempt = 0; attempt < 100 && browserPid === 0; attempt += 1) {
          // oxlint-disable-next-line no-await-in-loop -- bounded wait for the children to exist
          const childrenText = await readFile(`/proc/${shell.pid}/task/${shell.pid}/children`, 'utf8').catch(() => '');
          const children = childrenText.trim().split(/\s+/u).filter(Boolean);
          for (const child of children) {
            // oxlint-disable-next-line no-await-in-loop -- at most two children
            const exe = await readlink(`/proc/${child}/exe`).catch(() => '');
            if (exe.endsWith('/sleep') && children.length === 2) {
              browserPid = Number(child);
            }
          }
          // oxlint-disable-next-line no-await-in-loop -- see above
          await new Promise((resolve) => {
            setTimeout(resolve, 20);
          });
        }
        const request = { nonce: randomUUID(), profile, installedPath: portable };
        await writeFile(join(profile, 'route-qualification.request.json'), JSON.stringify(request));
        await writeFile(
          join(profile, 'route-qualification.ready.json'),
          JSON.stringify({ ...request, pid: browserPid, route: 'linux-appimage', version: '1.5.71' }),
        );
        return await requestQualificationQuit(profile, browserPid).then(
          () => undefined,
          (error: unknown) => error,
        );
      } finally {
        // End both children first, then the shell; a child that already exited is not an error.
        spawnSync('pkill', ['-P', String(shell.pid)]);
        shell.kill();
      }
    };
    const runtimeBound = await runtimeQuit(portable);
    assert.ok(runtimeBound instanceof Error);
    assert.doesNotMatch(runtimeBound.message, /admitted AppImage outer path/u);
    assert.match(runtimeBound.message, /xdotool/u);
    // A runtime running some other file binds nothing.
    const other = join(profile, 'Other.AppImage');
    await copyFile(portable, other);
    const runtimeForeign = await runtimeQuit(other);
    assert.match(String(runtimeForeign), /admitted AppImage outer path/u);
    // The admitted file running beside the browser without sharing its pipe binds nothing either.
    const runtimeUnshared = await runtimeQuit(portable, false);
    assert.match(String(runtimeUnshared), /admitted AppImage outer path.*none is shared/u);
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
