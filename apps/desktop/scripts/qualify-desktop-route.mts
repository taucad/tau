/** Run an authentic installed A→B→C chain on an explicitly disposable host; never signs or publishes. */
/* oxlint-disable no-restricted-imports -- The qualification executable composes adjacent private script owners. */
/* oxlint-disable no-await-in-loop -- Native install/restart stages and evidence reads are intentionally ordered. */
/* eslint-disable @typescript-eslint/naming-convention -- Child process environment uses its external names. */
import { execFile, spawn } from 'node:child_process';
import { createReadStream } from 'node:fs';
import { createHash, randomUUID } from 'node:crypto';
import { mkdir, readFile, realpath, rename, stat, writeFile, readdir, rm } from 'node:fs/promises';
import { homedir } from 'node:os';
import { basename, join, resolve } from 'node:path';
import { setTimeout as wait } from 'node:timers/promises';
import { z } from 'zod';
import { promisify } from 'node:util';
import { defaultPayloadStore } from '@taucad/host';
import { fetchQualificationCandidates } from './qualification-candidates.mjs';
import { qualificationArtifactObjects, qualificationFeed } from './qualification-feeds.mjs';
import { startQualificationMirrorProcess } from './qualification-mirror-process.mjs';
import { assertDisposableQualificationHost, prepareQualificationTls } from './qualification-tls.mjs';
import { createWindowsQualificationDriver } from './qualification-windows.mjs';
import { createLinuxAppImageQualificationDriver, createLinuxAptQualificationDriver } from './qualification-linux.mjs';
import { prepareQualificationAptEnrollment } from './qualification-apt-enrollment.mjs';
import type { QualificationAptEnrollment } from './qualification-apt-enrollment.mjs';
import type { LinuxAptQualificationDriver } from './qualification-linux.mjs';
import type { QualificationMirrorObject } from './qualification-mirror.mjs';
import { createMacosQualificationDriver } from './qualification-macos.mjs';
import { discoverQualificationProcesses } from './qualification-processes.mjs';
import { collectQualificationReceipt, qualificationProbeObservationSchema } from './qualification-evidence.mjs';
import type { QualificationEvidence, QualificationStageEvidence } from './qualification-evidence.mjs';
import type { QualificationCandidate, QualificationPlatformDriver } from './qualification-platform-types.mjs';

const execFileAsync = promisify(execFile);
const required = (name: string): string => z.string().min(1).parse(process.env[name]);
const json = async (path: string): Promise<unknown> => JSON.parse(await readFile(path, 'utf8'));
const digest = async (path: string): Promise<string> =>
  createHash('sha256')
    .update(await readFile(path))
    .digest('hex');
const absentOnEnoent = (error: unknown): false => {
  if (error instanceof Error && 'code' in error && error.code === 'ENOENT') {
    return false;
  }
  throw error;
};
const alive = (pid: number): boolean => {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
};
const readySchema = z.object({
  stage: z.enum(['a', 'b', 'c']),
  pid: z.number().int().positive(),
  rendererPid: z.number().int().positive(),
  nonce: z.uuid(),
});
const rendererSchema = z.object({
  stage: z.string(),
  url: z.string().startsWith('app://tau/w/'),
  project: z.object({ path: z.string(), sha256: z.string().regex(/^[a-f\d]{64}$/u) }),
  observedAt: z.iso.datetime(),
  exported: z.object({ path: z.string(), sha256: z.string(), vertices: z.number().positive() }),
  nativeEngineLogs: z.array(z.string()).min(1),
});
async function waitFor<T>(read: () => Promise<T | undefined>, message: string, timeout = 900_000): Promise<T> {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    const result = await read();
    if (result !== undefined) {
      return result;
    }
    await wait(250);
  }
  throw new Error(message);
}
const atomicJson = async (path: string, value: unknown): Promise<void> => {
  await writeFile(`${path}.tmp`, JSON.stringify(value), { mode: 0o600 });
  await rename(`${path}.tmp`, path);
};
const snapshotObjects = async (root: string, prefix = ''): Promise<Map<string, QualificationMirrorObject>> => {
  const result = new Map<string, QualificationMirrorObject>();
  for (const entry of await readdir(join(root, prefix), { withFileTypes: true })) {
    const path = join(prefix, entry.name);
    if (entry.isSymbolicLink()) {
      throw new Error('APT snapshot links forbidden');
    }
    if (entry.isDirectory()) {
      for (const [key, value] of await snapshotObjects(root, path)) {
        result.set(key, value);
      }
    } else if (entry.isFile()) {
      const absolute = join(root, path);
      const hash = createHash('sha256');
      for await (const chunk of createReadStream(absolute)) {
        if (!(chunk instanceof Uint8Array)) {
          throw new Error('Expected snapshot bytes');
        }
        hash.update(chunk);
      }
      result.set(`/${path.replaceAll('\\', '/')}`, {
        path: absolute,
        sha256: hash.digest('hex'),
        size: await stat(absolute).then((info) => info.size),
        contentType: 'application/octet-stream',
      });
    }
  }
  return result;
};
const main = async (): Promise<void> => {
  assertDisposableQualificationHost();
  if (
    process.env['GITHUB_REF'] !== 'refs/heads/main' ||
    process.env['GITHUB_EVENT_NAME'] !== 'workflow_dispatch' ||
    process.env['GITHUB_REPOSITORY'] !== 'taucad/tau'
  ) {
    throw new Error('Authentic qualification requires the protected main dispatch');
  }
  const route = z
    .enum(['macos-zip', 'macos-dmg', 'windows-nsis', 'linux-appimage', 'linux-apt'])
    .parse(required('TAU_QUALIFICATION_ROUTE'));
  const target = z
    .enum(['darwin-arm64', 'darwin-x64', 'win32-x64', 'linux-x64'])
    .parse(`${process.platform}-${process.arch}`);
  if (route === 'linux-appimage' && process.env['APPIMAGE_EXTRACT_AND_RUN']) {
    throw new Error('Qualification requires native AppImage FUSE mode, not extract-and-run');
  }
  if (process.platform === 'linux' && (!process.env['DISPLAY'] || process.env['XDG_SESSION_TYPE'] !== 'x11')) {
    throw new Error('Qualification requires the declared graphical X11 session');
  }
  const root = resolve(required('TAU_QUALIFICATION_DIRECTORY'));
  await mkdir(root, { recursive: false });
  const candidates = await fetchQualificationCandidates({
    runIds: [
      required('TAU_QUALIFICATION_RUN_A'),
      required('TAU_QUALIFICATION_RUN_B'),
      required('TAU_QUALIFICATION_RUN_C'),
    ],
    directory: root,
    sourceCommit: required('GITHUB_SHA'),
  });
  const { channel } = candidates[2].manifest;
  if (channel !== required('TAU_QUALIFICATION_CHANNEL')) {
    throw new Error('Candidate channel differs from protected job');
  }
  const name = channel === 'staging' ? 'Tau Staging' : 'Tau';
  const profile = join(
    process.platform === 'darwin'
      ? join(homedir(), 'Library/Application Support')
      : process.platform === 'win32'
        ? required('APPDATA')
        : (process.env['XDG_CONFIG_HOME'] ?? join(homedir(), '.config')),
    name,
  );
  await mkdir(profile, { recursive: false });
  const store = channel === 'staging' ? join(profile, 'config/payloads') : defaultPayloadStore();
  const coldEntries = await readdir(join(store, 'closures/sha256')).catch((error: unknown) => {
    absentOnEnoent(error);
    return [];
  });
  if (coldEntries.length > 0) {
    throw new Error('First-use qualification requires an initially cold payload store');
  }
  const nonce = randomUUID();
  const installationPath = route.startsWith('macos-')
    ? join(homedir(), 'Applications', `tau-qualification-${nonce}`, 'Tau.app')
    : route === 'windows-nsis'
      ? join(required('LOCALAPPDATA'), 'Programs', `tau-qualification-${nonce}`)
      : route === 'linux-apt'
        ? `/usr/bin/tau${channel === 'staging' ? '-staging' : ''}`
        : join(root, 'Tau.AppImage');
  const candidate = (index: number): QualificationCandidate => ({ ...candidates[index]!, route });
  let tls: Awaited<ReturnType<typeof prepareQualificationTls>> | undefined;
  let mirror: Awaited<ReturnType<typeof startQualificationMirrorProcess>> | undefined;
  const failures: unknown[] = [];
  let acceptedReceipt: ReturnType<typeof collectQualificationReceipt> | undefined;
  const feeds: Array<Awaited<ReturnType<typeof qualificationFeed>>> = [];
  let driver: QualificationPlatformDriver;
  let apt: QualificationAptEnrollment | undefined;
  let aptDriver: LinuxAptQualificationDriver | undefined;
  const scheduler: Array<NonNullable<QualificationEvidence['scheduler']>[number]> = [];
  const snapshots: Array<Map<string, QualificationMirrorObject>> = [];
  const stages: QualificationStageEvidence[] = [];
  let ordinaryQuit: QualificationEvidence['lifecycle']['ordinaryQuit'];
  let projectUrl: string | undefined;
  let offset = 0;
  let currentPid: number | undefined;
  try {
    tls = await prepareQualificationTls(root);
    const transport = await startQualificationMirrorProcess({
      key: tls.key,
      certificate: tls.certificate,
      objects: qualificationArtifactObjects(candidates),
    });
    mirror = transport;
    const keys = z.record(z.string(), z.string()).parse(JSON.parse(process.env['TAU_APPIMAGE_PUBLIC_KEYS'] ?? '{}'));
    if (route === 'linux-apt') {
      apt = await prepareQualificationAptEnrollment({
        candidates: [candidate(0), candidate(1), candidate(2)],
        bundleDirectories: candidates.map((item) => item.artifactDirectory) as [string, string, string],
        primaryFingerprint: required('TAU_APT_PRIMARY_FINGERPRINT'),
        signingFingerprint: required('TAU_APT_SIGNING_FINGERPRINT'),
        publicKeyPath: join(candidates[0].artifactDirectory, 'qualification-apt-public.asc'),
        runDirectory: join(root, 'apt'),
        origin: transport.origin,
      });
      const immutable = new Map<string, QualificationMirrorObject>();
      for (const directory of apt.snapshotDirectories) {
        const objects = await snapshotObjects(directory);
        const mutable = new Map<string, QualificationMirrorObject>();
        for (const [path, object] of objects) {
          if (path.startsWith('/dists/') && !path.includes('/by-hash/')) {
            mutable.set(path, object);
          } else {
            if (immutable.has(path) && immutable.get(path)?.sha256 !== object.sha256) {
              throw new Error('APT immutable object changed between candidates');
            }
            immutable.set(path, object);
          }
        }
        snapshots.push(mutable);
      }
      await transport.addImmutable(immutable);
      await transport.switchLatest(snapshots[0]!);
      await apt.enroll();
    }
    driver = route.startsWith('macos-')
      ? createMacosQualificationDriver({
          mode: 'release',
          installationPath,
          architecture: process.arch === 'arm64' ? 'arm64' : 'x64',
          teamId: required('APPLE_TEAM_ID'),
          installFormat: route === 'macos-dmg' ? 'dmg' : 'zip',
        })
      : route === 'windows-nsis'
        ? createWindowsQualificationDriver({
            mode: 'release',
            installationPath,
            publisher: required('TAU_WINDOWS_PUBLISHER'),
          })
        : route === 'linux-apt' && apt
          ? (aptDriver = createLinuxAptQualificationDriver({
              mode: 'release',
              installationPath: `/opt/tau${channel === 'staging' ? '-staging' : ''}`,
              repository: apt.repositories[0]!,
            }))
          : createLinuxAppImageQualificationDriver({ mode: 'release', installationPath });

    const installedA = await driver.install(candidate(0));
    if (route !== 'linux-apt') {
      for (const [index, input] of candidates.entries()) {
        const feed = await qualificationFeed({
          candidate: input,
          route,
          target,
          origin: transport.origin,
          keys,
          historical: index === 0,
        });
        feeds.push(feed);
        await transport.addImmutable(
          new Map([[`/releases/${encodeURIComponent(input.manifest.tag)}/${feed.name}`, feed.object]]),
        );
      }
    }
    const setLatest = async (index: number): Promise<void> => {
      const feed = feeds[index]!;
      await transport.switchLatest(new Map([[`/latest/${feed.name}`, feed.object]]));
    };
    if (route !== 'linux-apt') {
      await setLatest(1);
    }
    const identity = (index: number) => {
      const { manifest } = candidates[index]!;
      return { tag: manifest.tag, version: manifest.version, sourceCommit: manifest.sourceCommit };
    };
    await atomicJson(join(profile, 'route-qualification.request.json'), {
      schemaVersion: 1,
      nonce,
      profile: await realpath(profile),
      route,
      target,
      channel,
      installedPath: await realpath(
        route === 'linux-apt'
          ? installationPath
          : route === 'windows-nsis'
            ? installedA.executablePath
            : installedA.installationPath,
      ),
      mirrorOrigin: transport.origin,
      startedAt: Date.now(),
      a: identity(0),
      b: identity(1),
      c: identity(2),
    });
    const launch = async (): Promise<void> => {
      offset = await stat(join(profile, 'logs/desktop.log')).then(
        (info) => info.size,
        (error: unknown) => {
          absentOnEnoent(error);
          return 0;
        },
      );
      const child = spawn(
        route === 'linux-apt' || route === 'linux-appimage' ? installationPath : installedA.executablePath,
        [`--tau-route-qualification=${nonce}`],
        {
          env: { ...process.env, TAU_DESKTOP_UPDATE_FEED: transport.origin },
          stdio: 'ignore',
        },
      );
      await new Promise<void>((resolve, reject) => {
        child.once('spawn', resolve);
        child.once('error', reject);
      });
    };
    const render = async (stage: string, pid: number, request?: string | { action: string; openedFile: string }) => {
      const action = typeof request === 'string' ? request : request?.action;
      const openedFile = typeof request === 'string' ? undefined : request?.openedFile;
      const output = join(root, `renderer-${stage}-${pid}-${action ?? 'render'}.json`);
      await execFileAsync(
        process.execPath,
        ['--import', '@oxc-node/core/register', 'apps/desktop-e2e/scripts/qualification-renderer.mts'],
        {
          env: {
            ...process.env,
            TAU_QUALIFICATION_PROFILE: profile,
            TAU_QUALIFICATION_STAGE: stage,
            TAU_QUALIFICATION_RENDERER_OUTPUT: output,
            TAU_QUALIFICATION_LOG_OFFSET: String(offset),
            TAU_QUALIFICATION_EXPECTED_PID: String(pid),
            ...(projectUrl ? { TAU_QUALIFICATION_PROJECT_URL: projectUrl } : {}),
            ...(action ? { TAU_QUALIFICATION_RENDERER_ACTION: action } : {}),
            ...(openedFile ? { TAU_QUALIFICATION_OPEN_FILE: basename(openedFile) } : {}),
          },
          maxBuffer: 8 * 1024 * 1024,
          timeout: 1_200_000,
        },
      );
      return action && action !== 'reinstall-ui' && action !== 'active'
        ? undefined
        : rendererSchema.parse(await json(output));
    };
    await transport.setAvailable(false);
    await launch();
    if (!route.startsWith('macos-')) {
      const outageStart = Date.now();
      const offlineReady = await waitFor(async () => {
        try {
          const value = readySchema.parse(await json(join(profile, 'route-qualification.ready.json')));
          return value.stage === 'a' && value.nonce === nonce ? value : undefined;
        } catch {
          return undefined;
        }
      }, 'Offline baseline did not become ready');
      currentPid = offlineReady.pid;
      const rendered = await render('a', offlineReady.pid);
      if (!rendered) {
        throw new Error('Initial renderer evidence missing');
      }
      projectUrl = rendered.url;
      await atomicJson(join(profile, 'route-qualification.command.json'), {
        schemaVersion: 1,
        nonce,
        pid: offlineReady.pid,
        stage: 'a',
        action: 'observe',
        project: rendered.project,
      });
      const observed = await waitFor(async () => {
        try {
          const value = qualificationProbeObservationSchema.parse(
            await json(join(profile, 'route-qualification.a.json')),
          );
          return value.pid === offlineReady.pid && value.action === 'observe' ? value : undefined;
        } catch {
          return undefined;
        }
      }, 'Initial observe command did not release updater initialization');
      const beforeReconnect = await driver.observe(candidate(0));
      if (route === 'linux-apt') {
        let failed = false;
        try {
          await execFileAsync('sudo', ['-n', 'apt-get', '-o', 'APT::Update::Error-Mode=any', 'update'], {
            timeout: 180_000,
          });
        } catch {
          failed = true;
        }
        if (!failed) {
          throw new Error('Offline APT transport unexpectedly succeeded');
        }
      } else {
        await render('a', offlineReady.pid, 'offline');
      }
      const reconnectStart = Date.now();
      await transport.setAvailable(true);
      if (route === 'linux-apt') {
        await execFileAsync('sudo', ['-n', 'apt-get', '-o', 'APT::Update::Error-Mode=any', 'update'], {
          timeout: 180_000,
        });
      } else {
        await render('a', offlineReady.pid, 'check');
      }
      const afterReconnect = await driver.observe(candidate(0));
      if (
        !alive(offlineReady.pid) ||
        beforeReconnect.executableSha256 !== afterReconnect.executableSha256 ||
        beforeReconnect.asarSha256 !== afterReconnect.asarSha256
      ) {
        throw new Error('Offline/reconnect changed baseline or exited its process');
      }
      await transport.flush();
      if (
        !transport.requests.some((request) => request.status === 503 && Date.parse(request.at) >= outageStart) ||
        !transport.requests.some((request) => request.status === 200 && Date.parse(request.at) >= reconnectStart)
      ) {
        throw new Error('Offline/reconnect transport observations missing');
      }
      await writeFile(
        join(root, 'qualification-offline.json'),
        JSON.stringify(
          { pid: offlineReady.pid, beforeReconnect, afterReconnect, requests: transport.requests },
          undefined,
          2,
        ),
        { flag: 'wx' },
      );
      await render('a', offlineReady.pid, route === 'linux-apt' ? 'quit' : 'quit-ready');
      await waitFor(
        async () => (alive(offlineReady.pid) ? undefined : true),
        'Baseline ordinary quit did not exit',
        60_000,
      );
      if (route !== 'linux-apt') {
        ordinaryQuit = {
          probe: observed,
          before: beforeReconnect,
          after: await driver.observe(candidate(0)),
          exitedPid: offlineReady.pid,
        };
      }
      await launch();
    }
    for (const [index, stage] of (['a', 'b', 'c'] as const).entries()) {
      const previousPid = currentPid;
      const ready = await waitFor(async () => {
        try {
          const value = readySchema.parse(await json(join(profile, 'route-qualification.ready.json')));
          return value.stage === stage && value.nonce === nonce && value.pid !== previousPid ? value : undefined;
        } catch {
          return undefined;
        }
      }, `Installed ${stage} did not become ready`);
      currentPid = ready.pid;
      const rendered = await render(stage, ready.pid);
      if (!rendered) {
        throw new Error('Renderer evidence absent');
      }
      projectUrl = rendered.url;
      const installed = await driver.observe(candidate(index));
      const processes = discoverQualificationProcesses(ready.pid, ready.rendererPid);
      const security = await driver.measureSecurity(processes);
      const command = async (action: 'observe' | 'install') => {
        await atomicJson(join(profile, 'route-qualification.command.json'), {
          schemaVersion: 1,
          nonce,
          pid: ready.pid,
          stage,
          action,
          project: rendered.project,
        });
        return waitFor(async () => {
          try {
            const value = qualificationProbeObservationSchema.parse(
              await json(join(profile, `route-qualification.${stage}.json`)),
            );
            return value.pid === ready.pid && value.action === action ? value : undefined;
          } catch {
            return undefined;
          }
        }, 'Probe did not observe saved project');
      };
      if (apt && aptDriver && stage !== 'c') {
        const baseline = await aptDriver.captureActiveRuntime(ready.pid, 'resources/app.asar');
        const scheduled = await aptDriver.waitForScheduledUpgrade({
          candidate: candidate(index + 1),
          repository: apt.repositories[index + 1]!,
          baseline,
          upgradeTimeout: 900_000,
          publishSnapshot: async () => {
            await transport.switchLatest(snapshots[index + 1]!);
          },
        });
        const active = await render(stage, ready.pid, 'active');
        if (!active || !alive(ready.pid) || active.project.sha256 !== rendered.project.sha256) {
          throw new Error('Old APT session cannot export its retained saved project after selector upgrade');
        }
        discoverQualificationProcesses(ready.pid, ready.rendererPid);
        scheduler.push({
          ...scheduled,
          activeSession: {
            pid: ready.pid,
            projectSha256: active.project.sha256,
            exportSha256: active.exported.sha256,
            vertices: active.exported.vertices,
          },
        });
      }
      const probe = await command(stage === 'c' ? 'observe' : 'install');
      if (stage === 'a' && route.startsWith('macos-')) {
        await render(stage, ready.pid, 'offline');
        await transport.flush();
        if (!alive(ready.pid) || !transport.requests.some((request) => request.status === 503)) {
          throw new Error('Mac offline transport did not fail while baseline remained live');
        }
        const reconnectStart = Date.now();
        await transport.setAvailable(true);
        await render(stage, ready.pid, 'retry');
        await writeFile(
          join(root, 'qualification-offline.json'),
          JSON.stringify(
            { pid: ready.pid, reconnectStart, baseline: installed, requests: transport.requests },
            undefined,
            2,
          ),
          { flag: 'wx' },
        );
      }

      stages.push({
        candidate: candidates[index]!.manifest,
        installed,
        probe,
        renderer: {
          pid: ready.rendererPid,
          projectPath: join(profile, rendered.project.path),
          projectSha256: rendered.project.sha256,
          nativePids: processes.nativeChildPids,
          nativeAncestry: processes.nativeAncestry,
          saveObservedAt: Date.parse(rendered.observedAt),
        },
        security,
      });
      offset = await stat(join(profile, 'logs/desktop.log')).then((info) => info.size);
      if (stage === 'a' && route !== 'linux-apt') {
        await setLatest(2);
      }
      if (stage === 'c') {
        const scheme = channel === 'staging' && process.platform !== 'darwin' ? 'tau-staging' : 'tau';
        const uri = `${scheme}://machines`;
        if (process.platform === 'darwin') {
          await execFileAsync('open', ['-a', installationPath, uri], { timeout: 30_000 });
        } else if (process.platform === 'win32') {
          await execFileAsync(
            'powershell.exe',
            ['-NoProfile', '-NonInteractive', '-Command', 'Start-Process -FilePath $env:TAU_Q_OPEN_URI'],
            { env: { ...process.env, TAU_Q_OPEN_URI: uri }, timeout: 30_000 },
          );
        } else if (route === 'linux-apt') {
          await execFileAsync('xdg-open', [uri], { timeout: 30_000 });
        } else {
          await execFileAsync(installationPath, [uri], { timeout: 30_000 });
        }
        await render(stage, ready.pid, 'uri');
        if (process.platform === 'darwin') {
          await execFileAsync('open', ['-a', installationPath, rendered.exported.path], { timeout: 30_000 });
        } else {
          await execFileAsync(
            route === 'linux-apt' || route === 'linux-appimage' ? installationPath : installed.executablePath,
            [rendered.exported.path],
            { timeout: 30_000 },
          );
        }
        await render(stage, ready.pid, { action: 'file', openedFile: rendered.exported.path });
        await render(stage, ready.pid, 'quit');
        await waitFor(async () => (alive(ready.pid) ? undefined : true), 'Final application did not quit', 60_000);
      }
    }
    const final = stages[2]!;
    const preserved = [
      { path: final.renderer.projectPath, sha256: await digest(final.renderer.projectPath) },
      {
        path: join(profile, 'route-qualification.sentinel'),
        sha256: await digest(join(profile, 'route-qualification.sentinel')),
      },
    ];
    await driver.remove(preserved);
    const after = await Promise.all(
      preserved.map(async (file) => ({ path: file.path, sha256: await digest(file.path) })),
    );
    const removedInstallationPath = route === 'windows-nsis' ? final.installed.executablePath : installationPath;
    const existsAfter = await stat(removedInstallationPath).then(() => true, absentOnEnoent);
    if (existsAfter) {
      throw new Error('Uninstalled entry remains present');
    }
    const reinstalled = await driver.reinstall(candidate(2), preserved);
    await rm(join(profile, 'DevToolsActivePort'), { force: true });
    offset = await stat(join(profile, 'logs/desktop.log')).then((info) => info.size);
    const resumed = spawn(
      route === 'linux-apt' || route === 'linux-appimage' ? installationPath : reinstalled.executablePath,
      ['--remote-debugging-address=127.0.0.1', '--remote-debugging-port=0'],
      { env: { ...process.env, TAU_DESKTOP_UPDATES: 'off' }, stdio: 'ignore' },
    );
    await new Promise<void>((resolve, reject) => {
      resumed.once('spawn', resolve);
      resumed.once('error', reject);
    });
    if (!resumed.pid) {
      throw new Error('Reinstalled process has no PID');
    }
    currentPid = resumed.pid;
    await waitFor(
      async () => {
        try {
          await readFile(join(profile, 'DevToolsActivePort'));
          return true;
        } catch (error) {
          absentOnEnoent(error);
          return undefined;
        }
      },
      'Reinstalled renderer debugging endpoint unavailable',
      60_000,
    );
    const reopened = await render('c', resumed.pid, 'reinstall-ui');
    if (!reopened) {
      throw new Error('Reinstalled saved project evidence missing');
    }
    await render('c', resumed.pid, 'reinstall-quit');
    await waitFor(async () => (alive(resumed.pid!) ? undefined : true), 'Reinstalled app did not quit', 60_000);
    const reinstalledFiles = await Promise.all(
      preserved.map(async (file) => ({ path: file.path, sha256: await digest(file.path) })),
    );
    await driver.remove(preserved);
    await transport.flush();
    const evidence: QualificationEvidence = {
      mode: 'release',
      route,
      target,
      stages: [stages[0]!, stages[1]!, final],
      lifecycle: {
        ...(ordinaryQuit ? { ordinaryQuit } : {}),
        reinstall: {
          installed: reinstalled,
          files: reinstalledFiles,
          mainPid: resumed.pid,
          projectPath: join(profile, reopened.project.path),
          projectSha256: reopened.project.sha256,
          exportSha256: reopened.exported.sha256,
        },
        uninstall: {
          before: preserved,
          after,
          removedInstallationPath,
          existsAfter,
        },
      },
      ...(route === 'linux-apt' ? { scheduler } : {}),
      mirrorRequests: transport.requests.map((request) => ({ ...request, at: Date.parse(request.at) })),
      logs: `https://github.com/taucad/tau/actions/runs/${required('GITHUB_RUN_ID')}`,
      suite: 'installed-route-a-b-c-v1',
      trustIdentity:
        route === 'windows-nsis'
          ? required('TAU_WINDOWS_PUBLISHER')
          : route.startsWith('macos-')
            ? required('APPLE_TEAM_ID')
            : route === 'linux-apt'
              ? `${required('TAU_APT_PRIMARY_FINGERPRINT')}/${required('TAU_APT_SIGNING_FINGERPRINT')}`
              : required('TAU_APPIMAGE_KEY_ID'),
    };
    await writeFile(join(root, 'qualification-evidence.json'), JSON.stringify(evidence, undefined, 2));
    acceptedReceipt = collectQualificationReceipt(evidence);
  } catch (error) {
    failures.push(error);
  } finally {
    // Every independent cleanup must run, especially trust removal after a package-manager failure.
    for (const cleanup of [
      async () => {
        if (currentPid && alive(currentPid)) {
          process.kill(currentPid, 'SIGTERM');
        }
      },
      async () => apt?.cleanup(),
      async () => mirror?.close(),
      async () => tls?.remove(),
    ]) {
      try {
        await cleanup();
      } catch (error) {
        failures.push(error);
      }
    }
    await writeFile(
      join(root, 'qualification-status.json'),
      JSON.stringify(
        {
          status: failures.length > 0 ? 'failed' : 'passed',
          mode: 'release',
          stages,
          mirrorRequests: mirror?.requests ?? [],
          failures: failures.map((error) => (error instanceof Error ? error.message : String(error))),
        },
        undefined,
        2,
      ),
    );
  }
  if (failures.length > 0) {
    throw new AggregateError(failures, 'Qualification or its cleanup failed');
  }
  if (!acceptedReceipt) {
    throw new Error('No accepted qualification receipt');
  }
  await writeFile(join(root, 'route-receipts.json'), JSON.stringify([acceptedReceipt], undefined, 2), { flag: 'wx' });
};
await main();
