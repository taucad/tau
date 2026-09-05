#!/usr/bin/env node

/**
 * Purpose: Run locked PicoGK worker tests and enforce complete Tau C# coverage.
 * Why: The native worker is a production trust boundary that TypeScript coverage cannot observe.
 * Environment: Prepared darwin-arm64 PicoGK/.NET caches from desktop:prepare-picogk-dotnet.
 * Usage: node --import @oxc-node/core/register packages/plugins/picogk/scripts/test-dotnet.mts
 * Exit codes: 0 for passing tests at 100% line/branch coverage; 1 otherwise.
 */

import { execFileSync } from 'node:child_process';
import { mkdir, mkdtemp, readFile, readdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import process from 'node:process';

type CoverageMethod = {
  readonly Lines?: Readonly<Record<string, number>>;
  readonly Branches?: ReadonlyArray<{ readonly Hits: number; readonly Line: number }>;
};
type CoverageMethods = Readonly<Record<string, CoverageMethod>>;
type CoverageClasses = Readonly<Record<string, CoverageMethods>>;
type CoverageDocuments = Readonly<Record<string, CoverageClasses>>;
type Coverage = Readonly<Record<string, CoverageDocuments>>;

const workspaceRoot = resolve(import.meta.dirname, '../../../..');
const cacheRoot = resolve(workspaceRoot, 'out/cache/picogk');
const dotnetRoot = resolve(cacheRoot, 'dotnet-10.0.400-darwin-arm64');
const picoGkRoot = resolve(cacheRoot, 'PicoGK-0e6cf6b6f4993ec16dbcd72d8f27f26b999980f3');
const project = resolve(
  workspaceRoot,
  'packages/plugins/picogk/dotnet/Tau.PicoGK.Worker.Tests/Tau.PicoGK.Worker.Tests.csproj',
);

const findCoverage = async (root: string): Promise<string> => {
  for (const entry of await readdir(root, { withFileTypes: true })) {
    const path = resolve(root, entry.name);
    if (entry.isDirectory()) {
      // oxlint-disable-next-line no-await-in-loop -- the test result contains one bounded attachment tree.
      const found = await findCoverage(path).catch(() => '');
      if (found) {
        return found;
      }
    } else if (entry.name === 'coverage.json') {
      return path;
    }
  }
  throw new Error('The .NET coverage collector did not produce coverage.json.');
};

const collectCoverage = (
  documents: CoverageDocuments,
  uncovered: string[],
): { readonly lines: number; readonly branches: number } => {
  let lines = 0;
  let branches = 0;
  for (const [document, classes] of Object.entries(documents)) {
    const methods = Object.values(classes).flatMap((value) => Object.values(value));
    for (const method of methods) {
      for (const [line, hits] of Object.entries(method.Lines ?? {})) {
        lines += 1;
        if (hits === 0) {
          uncovered.push(`${document}:${line}`);
        }
      }
      for (const branch of method.Branches ?? []) {
        branches += 1;
        if (branch.Hits === 0) {
          uncovered.push(`${document}:${String(branch.Line)} branch`);
        }
      }
    }
  }
  return { lines, branches };
};

const assertCompleteCoverage = (coverage: Coverage): void => {
  const expectedModules = ['Tau.PicoGK.Worker.dll'];
  const uncovered: string[] = [];
  let lineCount = 0;
  let branchCount = 0;
  for (const moduleName of expectedModules) {
    if (!Object.hasOwn(coverage, moduleName)) {
      throw new Error(`Coverage is missing ${moduleName}.`);
    }
    const documents = coverage[moduleName]!;
    const counts = collectCoverage(documents, uncovered);
    lineCount += counts.lines;
    branchCount += counts.branches;
  }
  if (lineCount === 0 || branchCount === 0) {
    throw new Error('Tau C# coverage contained no executable lines or branches.');
  }
  if (uncovered.length > 0) {
    throw new Error(`Tau C# coverage is below 100%:\n${uncovered.join('\n')}`);
  }
  console.log(`✓ Tau C# coverage: 100% lines (${String(lineCount)}), 100% branches (${String(branchCount)})`);
};

const main = async (): Promise<void> => {
  if (process.platform !== 'darwin' || process.arch !== 'arm64') {
    throw new Error(`PicoGK .NET tests require darwin-arm64; received ${process.platform}-${process.arch}.`);
  }
  const reportsRoot = resolve(workspaceRoot, 'out/reports/coverage/packages/plugins/picogk-dotnet');
  await mkdir(reportsRoot, { recursive: true });
  const results = await mkdtemp(resolve(reportsRoot, 'run-'));
  const dotnet = resolve(dotnetRoot, 'dotnet');
  const projectProperty = `-p:PicoGKProject=${resolve(picoGkRoot, 'PicoGK.csproj')}`;
  const environment: NodeJS.ProcessEnv = { ...process.env };
  environment['DOTNET_CLI_TELEMETRY_OPTOUT'] = '1';
  environment['DOTNET_MULTILEVEL_LOOKUP'] = '0';
  environment['DOTNET_NOLOGO'] = '1';
  environment['DOTNET_ROOT'] = dotnetRoot;
  environment['DYLD_LIBRARY_PATH'] = resolve(picoGkRoot, 'native/osx-arm64');
  environment['NUGET_PACKAGES'] = resolve(cacheRoot, 'nuget-packages');
  environment['TAU_PICOGK_COMPATIBILITY_FIXTURE'] = resolve(
    workspaceRoot,
    'packages/plugins/picogk/dotnet/fixtures/helix-heat-exchanger',
  );
  environment['TAU_PICOGK_OFFICIAL_EXAMPLES_FIXTURE'] = resolve(
    workspaceRoot,
    'packages/plugins/picogk/dotnet/fixtures/official-examples',
  );
  environment['TAU_PICOGK_ROVER_FIXTURE'] = resolve(
    workspaceRoot,
    'packages/plugins/picogk/dotnet/fixtures/rover-wheel',
  );
  console.log('→ Restoring locked PicoGK test dependencies');
  execFileSync(dotnet, ['restore', project, '--runtime', 'osx-arm64', '--locked-mode', projectProperty], {
    env: environment,
    stdio: 'inherit',
  });
  console.log('→ Running PicoGK C# tests');
  execFileSync(
    dotnet,
    [
      'test',
      project,
      '--configuration',
      'Release',
      '--runtime',
      'osx-arm64',
      '--no-restore',
      projectProperty,
      '--collect:XPlat Code Coverage',
      '--results-directory',
      results,
      '--',
      'DataCollectionRunSettings.DataCollectors.DataCollector.Configuration.Format=json',
    ],
    { env: environment, stdio: 'inherit' },
  );
  const coveragePath = await findCoverage(results);
  const coverageText = await readFile(coveragePath, 'utf8');
  assertCompleteCoverage(JSON.parse(coverageText) as Coverage);
};

try {
  await main();
} catch (error) {
  console.error('PicoGK .NET tests failed:', error);
  process.exit(1);
}
