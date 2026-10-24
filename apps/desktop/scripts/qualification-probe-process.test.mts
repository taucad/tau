#!/usr/bin/env node
/** Purpose: Exercise diagnostic probe file handoff across real Node processes, never qualify a packaged release. */
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createHash, randomUUID } from 'node:crypto';
import { existsSync } from 'node:fs';
import { mkdir, mkdtemp, readFile, realpath, rename, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { setTimeout as sleep } from 'node:timers/promises';
import { fileURLToPath } from 'node:url';
import { z } from 'zod';
import { prepareRouteQualificationProbe } from '#main/route-qualification-probe.js';
import type { RouteQualificationRequest } from '#main/route-qualification-probe.js';

const stageSchema = z.enum(['a', 'b', 'c']);
const record = async (path: string): Promise<Record<string, unknown>> =>
  z.record(z.string(), z.unknown()).parse(JSON.parse(await readFile(path, 'utf8')));
const writeRecord = async (path: string, value: unknown): Promise<void> => {
  await writeFile(`${path}.driver-tmp`, JSON.stringify(value));
  await rename(`${path}.driver-tmp`, path);
};
const identity = (stage: 'a' | 'b' | 'c'): RouteQualificationRequest['a'] => ({
  tag: `desktop@1.0.${stage === 'a' ? 0 : stage === 'b' ? 1 : 2}`,
  version: `1.0.${stage === 'a' ? 0 : stage === 'b' ? 1 : 2}`,
  sourceCommit: stage.repeat(40),
});
const host = (): Pick<RouteQualificationRequest, 'route' | 'target'> => {
  if (process.platform === 'darwin' && (process.arch === 'arm64' || process.arch === 'x64')) {
    return { route: 'macos-zip', target: `darwin-${process.arch}` };
  }
  assert.equal(process.arch, 'x64');
  assert.ok(process.platform === 'win32' || process.platform === 'linux');
  return process.platform === 'win32'
    ? { route: 'windows-nsis', target: 'win32-x64' }
    : { route: 'linux-appimage', target: 'linux-x64' };
};

const childMain = async (root: string, stage: 'a' | 'b' | 'c', initial: boolean): Promise<void> => {
  const profile = join(root, 'profile');
  const request = await record(join(profile, 'route-qualification.request.json'));
  const probe = prepareRouteQualificationProbe({
    arguments: initial ? [`--tau-route-qualification=${z.string().parse(request['nonce'])}`] : [],
    profile,
    defaultProfile: profile,
    // This is an inert protocol fixture, not evidence of a signed package or shipping renderer.
    packaged: true,
    platform: process.platform,
    arch: process.arch,
    channel: 'production',
    ...identity(stage),
    route: host().route,
    installedPath: join(root, 'inert-installation'),
    ...(initial ? { mirrorOrigin: z.string().parse(request['mirrorOrigin']) } : {}),
  });
  await writeRecord(join(root, `configuration-${process.pid}.json`), {
    diagnosticOnly: true,
    active: probe !== undefined,
    ...(probe
      ? {
          stage: probe.stage,
          mirrorOrigin: probe.mirrorOrigin,
          candidateTag: probe.candidateTag,
          expectedUpdate: probe.expectedUpdate,
        }
      : {}),
  });
  if (probe) {
    // No renderer or native worker is claimed. This snapshot cannot satisfy the release collector.
    const outcome = await probe.complete(() => ({ rendererPid: process.pid, children: [] }));
    await writeRecord(join(root, `outcome-${process.pid}.json`), outcome);
  }
};

const main = async (): Promise<void> => {
  const root = await realpath(await mkdtemp(join(tmpdir(), 'tau-probe-process-')));
  const children: Array<ReturnType<typeof spawn>> = [];
  const profile = join(root, 'profile');
  const launch = (stage: 'a' | 'b' | 'c', initial = false) => {
    const child = spawn(
      process.execPath,
      [
        '--import',
        '@oxc-node/core/register',
        fileURLToPath(import.meta.url),
        '--child',
        root,
        stage,
        initial ? 'initial' : 'resume',
      ],
      { stdio: ['ignore', 'pipe', 'pipe'] },
    );
    children.push(child);
    let output = '';
    child.stdout.setEncoding('utf8');
    child.stderr.setEncoding('utf8');
    child.stdout.on('data', (bytes: string) => {
      output += bytes;
    });
    child.stderr.on('data', (bytes: string) => {
      output += bytes;
    });
    const exited = new Promise<number | undefined>((resolve, reject) => {
      child.once('error', reject);
      child.once('exit', (code) => {
        resolve(code ?? undefined);
      });
    });
    const waitFor = async (path: string, expectedPid?: number): Promise<Record<string, unknown>> => {
      const deadline = Date.now() + 20_000;
      while (Date.now() < deadline) {
        if (existsSync(path)) {
          // oxlint-disable-next-line no-await-in-loop -- Poll the real process handoff file.
          const value = await record(path);
          if (expectedPid === undefined || value['pid'] === expectedPid) {
            return value;
          }
        }
        assert.equal(child.exitCode, null, output);
        // oxlint-disable-next-line no-await-in-loop -- Bounded real-process polling, without a fake clock.
        await sleep(25);
      }
      throw new Error(`Timed out waiting for ${path}: ${output}`);
    };
    const finish = async (code: number): Promise<void> => {
      const exitTimeout = setTimeout(() => child.kill(), 20_000);
      try {
        assert.equal(await exited, code, output);
      } finally {
        clearTimeout(exitTimeout);
      }
    };
    return { child, waitFor, finish };
  };
  try {
    await mkdir(profile);
    await writeFile(join(root, 'inert-installation'), 'Diagnostic fixture, never executed');
    const request: RouteQualificationRequest = {
      schemaVersion: 1,
      nonce: randomUUID(),
      profile,
      ...host(),
      channel: 'production',
      installedPath: join(root, 'inert-installation'),
      mirrorOrigin: 'https://127.0.0.1:4443',
      startedAt: Date.now(),
      a: identity('a'),
      b: identity('b'),
      c: identity('c'),
    };
    await writeRecord(join(profile, 'route-qualification.request.json'), request);
    const projectBytes = 'from build123d import Box\nresult = Box(10, 20, 30)\n';
    const project = { path: 'projects/main.py', sha256: createHash('sha256').update(projectBytes).digest('hex') };
    const commandPath = join(profile, 'route-qualification.command.json');
    const command = async (pid: number, stage: 'a' | 'b' | 'c', action: 'install' | 'observe') =>
      writeRecord(commandPath, { schemaVersion: 1, nonce: request.nonce, pid, stage, action, project });
    const a = launch('a', true);
    assert.ok(a.child.pid);
    await a.waitFor(join(profile, 'route-qualification.ready.json'), a.child.pid);
    const aConfig = await a.waitFor(join(root, `configuration-${a.child.pid}.json`));
    assert.equal(aConfig['candidateTag'], request.b.tag);
    assert.deepEqual(aConfig['expectedUpdate'], request.b);
    await mkdir(join(profile, 'projects'));
    await writeFile(join(profile, project.path), projectBytes);
    const sentinel = await readFile(join(profile, 'route-qualification.sentinel'), 'utf8');
    await command(a.child.pid, 'a', 'install');
    await a.finish(0);

    const b = launch('b');
    assert.ok(b.child.pid);
    assert.notEqual(b.child.pid, a.child.pid);
    await b.waitFor(join(profile, 'route-qualification.ready.json'), b.child.pid);
    const bConfig = await b.waitFor(join(root, `configuration-${b.child.pid}.json`));
    assert.equal(bConfig['mirrorOrigin'], request.mirrorOrigin);
    assert.equal(Object.hasOwn(bConfig, 'candidateTag'), false);
    assert.deepEqual(bConfig['expectedUpdate'], request.c);
    // The persisted A command cannot install B, even after several real polling cycles.
    await sleep(350);
    assert.equal(b.child.exitCode, null);
    assert.equal(existsSync(join(profile, 'route-qualification.b.json')), false);
    await command(b.child.pid, 'a', 'install');
    await b.finish(1);
    assert.equal(existsSync(join(profile, 'route-qualification.b.json')), false);
    const bRetry = launch('b');
    assert.ok(bRetry.child.pid);
    await bRetry.waitFor(join(profile, 'route-qualification.ready.json'), bRetry.child.pid);
    await sleep(250);
    assert.equal(bRetry.child.exitCode, null);
    await command(bRetry.child.pid, 'b', 'install');
    await bRetry.finish(0);

    const c = launch('c');
    assert.ok(c.child.pid);
    await c.waitFor(join(profile, 'route-qualification.ready.json'), c.child.pid);
    const cConfig = await c.waitFor(join(root, `configuration-${c.child.pid}.json`));
    assert.equal(cConfig['mirrorOrigin'], request.mirrorOrigin);
    assert.equal(Object.hasOwn(cConfig, 'expectedUpdate'), false);
    await command(c.child.pid, 'c', 'observe');
    await c.finish(0);
    const observations = await Promise.all(
      (['a', 'b', 'c'] as const).map(async (stage) => {
        const observation = await record(join(profile, `route-qualification.${stage}.json`));
        assert.equal(observation['diagnosticOnly'], true);
        assert.equal(observation['sourceCommit'], request[stage].sourceCommit);
        assert.equal(observation['version'], request[stage].version);
        assert.equal(observation['projectSha256'], project.sha256);
        assert.equal(observation['profileSentinel'], sentinel);
        assert.equal(observation['discovery'], stage === 'a' ? 'candidate' : stage === 'b' ? 'latest' : 'none');
        return observation;
      }),
    );
    assert.deepEqual(
      observations.map((value) => value['pid']),
      [a.child.pid, bRetry.child.pid, c.child.pid],
    );
    assert.equal(await readFile(join(profile, project.path), 'utf8'), projectBytes);
    assert.equal(await readFile(join(profile, 'route-qualification.sentinel'), 'utf8'), sentinel);
    const completed = launch('c');
    assert.ok(completed.child.pid);
    const completedConfig = await completed.waitFor(join(root, `configuration-${completed.child.pid}.json`));
    await completed.finish(0);
    assert.deepEqual(completedConfig, { diagnosticOnly: true, active: false });
    const finalReady = await record(join(profile, 'route-qualification.ready.json'));
    assert.equal(finalReady['pid'], c.child.pid);
    console.log('Diagnostic subprocess A→B→C protocol passed; no native acceptance receipt produced.');
  } finally {
    for (const child of children) {
      if (child.exitCode === null) {
        child.kill();
      }
    }
    await rm(root, { recursive: true, force: true });
  }
};

if (process.argv[2] === '--child') {
  await childMain(z.string().parse(process.argv[3]), stageSchema.parse(process.argv[4]), process.argv[5] === 'initial');
  process.exitCode = 0;
} else {
  await main();
}
