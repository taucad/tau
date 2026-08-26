/* oxlint-disable no-await-in-loop -- Matrix lifecycle is intentionally sequential to avoid fixture build races. */
/* eslint-disable @typescript-eslint/naming-convention -- E2E is the established project acronym. */
import { execFile, spawn } from 'node:child_process';
import { createWriteStream } from 'node:fs';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { promisify } from 'node:util';
import type { TestProject } from 'vitest/node';
import { resolvedElectronExternalization } from './support/electron-vite-contract.ts';
import type { ReactTargetInspection } from './support/external-target.js';
import { packageVersion } from './support/package-version.ts';
import { captureProcessOutput, stopProcess, waitForEndpoint } from './support/process-lifecycle.ts';
import { buildArtifactNames, runtimeBuildArtifactReport } from './support/runtime-build-artifacts.ts';
import { reactE2EEnvironment, selectedReactE2ETargets } from './support/targets.ts';
import type { ReactE2ETarget } from './support/targets.ts';

const execFileAsync = promisify(execFile);
const outputRoot = resolve(import.meta.dirname, '../../out/test-results/vitest-browser/apps/react-e2e');

export const reactE2ELogPath = (targetId: string): string => resolve(outputRoot, targetId, 'server.log');

const runBuild = async (target: ReactE2ETarget): Promise<void> => {
  if (!target.build) {
    return;
  }
  const result = await execFileAsync(target.build.file, [...target.build.args], {
    cwd: target.root,
    env: reactE2EEnvironment(target),
    maxBuffer: 100 * 1024 * 1024,
  });
  await writeFile(reactE2ELogPath(target.id), `${result.stdout}${result.stderr}`);
};

const inspectTarget = async (target: ReactE2ETarget): Promise<ReactTargetInspection> => {
  const versions = Object.fromEntries(
    Object.keys(target.metadata.expectedVersions).map((packageName) => [
      packageName,
      packageVersion(target.root, packageName),
    ]),
  );
  const report: ReactTargetInspection = { versions };
  if (target.artifactInspection?.kind === 'runtime') {
    Object.assign(report, {
      runtimeArtifacts: runtimeBuildArtifactReport(
        target.artifactInspection.root,
        target.artifactInspection.excludedRoot,
      ),
    });
  } else if (target.artifactInspection?.kind === 'electron-example') {
    const main = buildArtifactNames(target.artifactInspection.mainRoot);
    const renderer = buildArtifactNames(target.artifactInspection.rendererRoot);
    Object.assign(report, {
      electronExampleArtifacts: {
        mainIndex: main.includes('index.js'),
        mainKernelHosts: main.filter((name) => name.startsWith('kernel-host-') && name.endsWith('.js')).length,
        rendererKernelHosts: renderer.filter((name) => name.startsWith('kernel-host-')).length,
      },
    });
  }
  if (target.metadata.framework === 'electron' && target.metadata.mode !== 'development') {
    Object.assign(report, { externalization: await resolvedElectronExternalization(target.root) });
  }
  return report;
};

const startWebTarget = async (target: ReactE2ETarget, cleanups: Array<() => Promise<void>>): Promise<void> => {
  if (!target.serve) {
    throw new TypeError(`Web target ${target.id} has no serve command.`);
  }
  await runBuild(target);
  const log = createWriteStream(reactE2ELogPath(target.id), { flags: 'a' });
  const child = spawn(target.serve.file, [...target.serve.args], {
    cwd: target.root,
    detached: process.platform !== 'win32',
    env: reactE2EEnvironment(target),
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  const output: string[] = [];
  captureProcessOutput(child, output);
  child.stdout.pipe(log, { end: false });
  child.stderr.pipe(log, { end: false });
  cleanups.push(async () => {
    await stopProcess(child);
    log.end();
  });
  await waitForEndpoint({ child, output, url: target.baseURL });
};

export const setup = async (project: TestProject): Promise<() => Promise<void>> => {
  const targets = selectedReactE2ETargets();
  const cleanups: Array<() => Promise<void>> = [];
  const inspections: Record<string, ReactTargetInspection> = {};
  try {
    for (const target of targets) {
      await mkdir(resolve(reactE2ELogPath(target.id), '..'), { recursive: true });
      await writeFile(reactE2ELogPath(target.id), '');
      if (target.kind === 'web') {
        await startWebTarget(target, cleanups);
      } else if (target.kind === 'electron') {
        await runBuild(target);
      }
      inspections[target.id] = await inspectTarget(target);
    }
    project.provide('reactTargetInspections', inspections);
  } catch (error) {
    await Promise.allSettled(cleanups.toReversed().map(async (cleanup) => cleanup()));
    throw error;
  }
  return async () => {
    const results = await Promise.allSettled(cleanups.toReversed().map(async (cleanup) => cleanup()));
    const errors: unknown[] = results.flatMap((result) =>
      result.status === 'rejected' ? [result.reason as unknown] : [],
    );
    if (errors.length > 0) {
      throw new AggregateError(errors, 'React E2E server cleanup failed.');
    }
  };
};
