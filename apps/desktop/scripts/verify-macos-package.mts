#!/usr/bin/env node

/**
 * Purpose: Exercise the packaged Tau app and its Quick Look extensions through macOS system APIs.
 * Why: A compiled extension is not useful until Launch Services discovers it and Finder can render with it.
 * Environment: macOS with the packaged app produced by package-macos.mts; optional
 * TAU_MACOS_PACKAGE_OUTPUT_ROOT matching the package command; --unsigned skips signing-specific checks.
 * Usage: node --import @oxc-node/core/register scripts/verify-macos-package.mts [--release | --unsigned]
 * Exit codes: 0 when applicable signing, architecture, discovery, preview, thumbnail, cancellation, and cleanup checks pass.
 */

import { spawn, spawnSync } from 'node:child_process';
import { createHash, randomUUID } from 'node:crypto';
import {
  copyFileSync,
  cpSync,
  closeSync,
  existsSync,
  lstatSync,
  mkdirSync,
  mkdtempSync,
  openSync,
  readFileSync,
  readSync,
  readdirSync,
  readlinkSync,
  realpathSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, dirname, join, relative, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

import { FuseState, FuseV1Options, getCurrentFuseWire } from '@electron/fuses';

import quickLookManifest from '#macos/quick-look-formats.json' with { type: 'json' };
import { isQuickLookEnabled } from '#shared/quick-look.js';

// oxlint-disable-next-line no-restricted-imports -- Operational scripts are outside the app's # source alias.
import { macosPackageArchitecture, macosPackageFuses, parseMacosPackageMode } from './macos-package-mode.mjs';
// oxlint-disable-next-line no-restricted-imports -- Operational scripts share their packaging contract.
import { desktopPackageChannel, desktopPackageVersion } from './runtime-stage.mjs';

const desktopRoot = resolve(import.meta.dirname, '..');
const workspaceRoot = resolve(desktopRoot, '../..');
const outputRoot = resolve(process.env['TAU_MACOS_PACKAGE_OUTPUT_ROOT'] ?? resolve(desktopRoot, 'package-out'));
const architecture = macosPackageArchitecture(process.platform, process.arch);
const machArchitecture = architecture === 'arm64' ? 'arm64' : 'x86_64';
const appPath = resolve(outputRoot, `Tau-darwin-${architecture}/Tau.app`);
const appExecutable = resolve(appPath, 'Contents/MacOS/Tau');
const brandingRoot = resolve(appPath, 'Contents/Resources/branding');
const extensionTemporaryRoot = resolve(tmpdir(), 'tau-quick-look');
const {
  release,
  unsigned,
  notarize: shouldNotarize,
} = parseMacosPackageMode(process.argv.slice(2), desktopPackageChannel(process.env['TAU_DESKTOP_CHANNEL']));
const { picogkRuntimeManifestSchema } = await import('@taucad/picogk');
/** The PicoGK worker protocol, which the prepared resource manifest also records. */
const picoGkWireProtocol = picogkRuntimeManifestSchema.shape.protocolVersion.value;

if (process.platform !== 'darwin') {
  throw new Error('The macOS package can only be verified on macOS.');
}
const run = (command: string, arguments_: readonly string[], timeout = 60_000): string => {
  const result = spawnSync(command, arguments_, { encoding: 'utf8', timeout });
  if (result.error) {
    throw result.error;
  }
  if (result.status !== 0) {
    throw new Error(`${command} ${arguments_.join(' ')} failed:\n${result.stdout}${result.stderr}`);
  }
  return `${result.stdout}${result.stderr}`;
};

const filesUnder = (root: string): readonly string[] => {
  const files: string[] = [];
  const visit = (path: string): void => {
    const metadata = lstatSync(path);
    if (metadata.isSymbolicLink()) {
      const target = resolve(path, '..', readlinkSync(path));
      if (target.startsWith(root)) {
        visit(realpathSync(path));
      }
      return;
    }
    if (metadata.isDirectory()) {
      for (const name of readdirSync(path)) {
        visit(join(path, name));
      }
    } else if (metadata.isFile()) {
      files.push(path);
    }
  };
  visit(root);
  return files;
};

const machObjectMagics = new Set([
  0xfe_ed_fa_ce, 0xce_fa_ed_fe, 0xfe_ed_fa_cf, 0xcf_fa_ed_fe, 0xca_fe_ba_be, 0xbe_ba_fe_ca, 0xca_fe_ba_bf,
  0xbf_ba_fe_ca,
]);
const isMachObject = (path: string): boolean => {
  const file = openSync(path, 'r');
  const bytes = Buffer.allocUnsafe(4);
  try {
    return (
      readSync(file, bytes, 0, bytes.byteLength, 0) === bytes.byteLength && machObjectMagics.has(bytes.readUInt32BE())
    );
  } finally {
    closeSync(file);
  }
};

type ProcessRow = { readonly command: string; readonly pid: number; readonly ppid: number; readonly rss: number };

const processRows = (): readonly ProcessRow[] =>
  run('ps', ['-axo', 'pid=,ppid=,rss=,comm='])
    .trim()
    .split('\n')
    .flatMap((line) => {
      const match = /^\s*(\d+)\s+(\d+)\s+(\d+)\s+(.+)$/u.exec(line);
      return match
        ? [{ pid: Number(match[1]), ppid: Number(match[2]), rss: Number(match[3]), command: match[4]! }]
        : [];
    });

const residentKilobytes = (processName: string): number => {
  const rows = processRows();
  const included = new Set(rows.filter((row) => basename(row.command) === processName).map((row) => row.pid));
  let changed = true;
  while (changed) {
    changed = false;
    for (const row of rows) {
      if (included.has(row.ppid) && !included.has(row.pid)) {
        included.add(row.pid);
        changed = true;
      }
    }
  }
  return rows.filter((row) => included.has(row.pid)).reduce((sum, row) => sum + row.rss, 0);
};

const runMeasured = async (options: {
  readonly arguments: readonly string[];
  readonly command: string;
  readonly processName: string;
  readonly processTimeoutMilliseconds?: number;
}): Promise<{ readonly milliseconds: number; readonly peakResidentKilobytes: number }> => {
  const started = performance.now();
  let peakResidentKilobytes = 0;
  const child = spawn(options.command, options.arguments, { stdio: ['ignore', 'pipe', 'pipe'] });
  let output = '';
  child.stdout.on('data', (chunk: Uint8Array<ArrayBuffer>) => {
    output += Buffer.from(chunk).toString();
  });
  child.stderr.on('data', (chunk: Uint8Array<ArrayBuffer>) => {
    output += Buffer.from(chunk).toString();
  });
  const sampler = setInterval(() => {
    peakResidentKilobytes = Math.max(peakResidentKilobytes, residentKilobytes(options.processName));
  }, 100);
  const timer = setTimeout(() => {
    child.kill('SIGKILL');
  }, options.processTimeoutMilliseconds ?? 60_000);
  const status = await new Promise<number | undefined>((resolve, reject) => {
    child.once('error', reject);
    child.once('exit', (code) => {
      resolve(code ?? undefined);
    });
  });
  clearInterval(sampler);
  clearTimeout(timer);
  if (status !== 0) {
    throw new Error(`${options.command} ${options.arguments.join(' ')} failed:\n${output}`);
  }
  return { milliseconds: performance.now() - started, peakResidentKilobytes };
};

const stopPackagedApp = (): void => {
  for (const row of processRows()) {
    if (row.command === appExecutable) {
      process.kill(row.pid, 'SIGTERM');
    }
  }
};

/**
 * Prints what macOS recorded about a Quick Look request that failed twice. The
 * probe only sees `QLThumbnailErrorDomain error 0`; the reason (sandbox denial,
 * launch refusal, extension crash) is in the unified log and crash reports.
 */
const printQuickLookDiagnostics = async (): Promise<void> => {
  const predicate = [
    'subsystem == "com.taucad.tau.desktop"',
    'process BEGINSWITH "TauQuickLook"',
    'process == "ThumbnailsAgent"',
    'process == "quicklookd"',
    'process == "pkd"',
    'eventMessage CONTAINS[c] "TauQuickLook"',
    'eventMessage CONTAINS[c] "com.taucad.tau.desktop.quicklook"',
  ].join(' OR ');
  const log = spawnSync(
    '/usr/bin/log',
    ['show', '--last', '3m', '--info', '--style', 'compact', '--predicate', predicate],
    {
      encoding: 'utf8',
      maxBuffer: 64 * 1024 * 1024,
      timeout: 60_000,
    },
  );
  const failed = log.error !== undefined || log.status !== 0;
  if (failed) {
    // A timeout or maxBuffer overflow still returns what was captured; print it below as partial.
    console.error(
      `Could not fully collect the Quick Look unified log (status ${String(log.status)}): ${String(log.error ?? log.stderr)}`,
    );
  }
  // ponytail: last 300 lines keeps the CI log readable; widen --last or the slice if the cause scrolls off.
  const lines = log.stdout
    .trim()
    .split('\n')
    .filter((line) => line.length > 0)
    .slice(-300);
  if (lines.length === 0) {
    console.error('The Quick Look unified log has no matching entries in the last 3 minutes.');
  } else {
    console.error(
      `::group::Quick Look unified log${failed ? ' (partial)' : ''} (last ${String(lines.length)} lines)\n${lines.join('\n')}\n::endgroup::`,
    );
  }
  // ReportCrash writes the .ips a moment after the process dies.
  await new Promise((resolve) => {
    setTimeout(resolve, 3000);
  });
  const home = process.env['HOME'] ?? '';
  const reportRoots = [
    join(home, 'Library/Logs/DiagnosticReports'),
    join(home, 'Library/Logs/DiagnosticReports/Retired'),
    '/Library/Logs/DiagnosticReports',
  ];
  const reports = reportRoots
    .filter((root) => existsSync(root))
    .flatMap((root) =>
      readdirSync(root)
        .filter((name) => name.includes('TauQuickLook'))
        .map((name) => join(root, name)),
    )
    .toSorted();
  for (const report of reports) {
    console.error(`::group::${report}\n${readFileSync(report, 'utf8').slice(0, 20_000)}\n::endgroup::`);
  }
  if (reports.length === 0) {
    console.error(`No TauQuickLook crash reports in ${reportRoots.join(', ')}.`);
  }
};

const temporarySessions = (): ReadonlySet<string> =>
  new Set(existsSync(extensionTemporaryRoot) ? readdirSync(extensionTemporaryRoot) : []);

const dimensions = (path: string): { readonly height: number; readonly width: number } => {
  const output = run('sips', ['-g', 'pixelWidth', '-g', 'pixelHeight', path]);
  const width = /pixelWidth:\s+(\d+)/u.exec(output)?.[1];
  const height = /pixelHeight:\s+(\d+)/u.exec(output)?.[1];
  if (!width || !height) {
    throw new Error(`Could not read image dimensions for ${path}`);
  }
  return { width: Number(width), height: Number(height) };
};

const copyFixture = (format: (typeof quickLookManifest.formats)[number], destinationRoot: string): string => {
  const sourceEntry = resolve(workspaceRoot, format.fixture.entry);
  const sourceRoot = dirname(sourceEntry);
  const fixtureRoot = resolve(destinationRoot, randomUUID());
  for (const fixturePath of format.fixture.files) {
    const source = resolve(workspaceRoot, fixturePath);
    const relativePath = relative(sourceRoot, source);
    if (relativePath.startsWith('..')) {
      throw new Error(`${fixturePath} is outside the fixture entry directory`);
    }
    const destination = resolve(fixtureRoot, relativePath);
    mkdirSync(dirname(destination), { recursive: true });
    copyFileSync(source, destination);
  }
  return resolve(fixtureRoot, relative(sourceRoot, sourceEntry));
};

const assertThumbnailDimensions = (path: string, maximumPixels: number): void => {
  const image = dimensions(path);
  if (image.width <= 0 || image.height <= 0 || image.width > maximumPixels || image.height > maximumPixels) {
    throw new Error(`${basename(path)} returned invalid dimensions ${String(image.width)}x${String(image.height)}`);
  }
};

type IntegrityEntry = { readonly path: string; readonly sha256: string };
type PythonResourceManifest = {
  readonly build123dVersion: string;
  readonly distributions: ReadonlyArray<{ readonly name: string; readonly version: string }>;
  readonly ocpVersion: string;
  readonly pythonRelativePath: string;
  readonly pythonSha256: string;
  readonly pythonVersion: string;
  readonly sbom: IntegrityEntry;
  readonly schemaVersion: number;
  readonly supportFiles: readonly IntegrityEntry[];
  readonly target: string;
  readonly topologySchema: IntegrityEntry;
  readonly workerPath: string;
  readonly workerSha256: string;
};
type PicoGkResourceManifest = {
  readonly dotnetRuntimeVersion: string;
  readonly hostApiVersion: number;
  readonly picoGkArchiveSha256: string;
  readonly picoGkCommit: string;
  readonly picoGkHostedPatchSha256: string;
  readonly protocolVersion: number;
  readonly resourceFiles: ReadonlyArray<IntegrityEntry & { readonly label: string }>;
  readonly sceneArtifactVersion: number;
  readonly schemaVersion: number;
  readonly target: string;
  readonly workerPath: string;
  readonly workerSha256: string;
};

const sha256 = (path: string): string => createHash('sha256').update(readFileSync(path)).digest('hex');

const verifyPythonResource = (architecture: 'arm64' | 'x64'): void => {
  const target = `darwin-${architecture}`;
  const root = resolve(appPath, `Contents/Resources/python/${target}`);
  const manifest = JSON.parse(
    readFileSync(resolve(root, 'tau-runtime-manifest.json'), 'utf8'),
  ) as PythonResourceManifest;
  if (manifest.schemaVersion !== 1 || manifest.target !== target) {
    throw new Error(`Invalid Build123d resource manifest for ${target}`);
  }
  const integrityEntries = [
    { path: manifest.pythonRelativePath, sha256: manifest.pythonSha256 },
    { path: manifest.workerPath, sha256: manifest.workerSha256 },
    ...manifest.supportFiles,
    manifest.topologySchema,
    manifest.sbom,
  ];
  for (const entry of integrityEntries) {
    const path = resolve(root, entry.path);
    if (relative(root, path).startsWith('..') || sha256(path) !== entry.sha256) {
      throw new Error(`Build123d resource integrity failed for ${target}/${entry.path}`);
    }
  }
  const sbom = JSON.parse(readFileSync(resolve(root, manifest.sbom.path), 'utf8')) as {
    readonly bomFormat?: string;
    readonly components?: ReadonlyArray<{ readonly name?: string; readonly version?: string }>;
    readonly metadata?: {
      readonly properties?: ReadonlyArray<{ readonly name?: string; readonly value?: string }>;
    };
    readonly specVersion?: string;
  };
  const components = new Map(sbom.components?.map((component) => [component.name, component.version]));
  const targetProperty = sbom.metadata?.properties?.find((property) => property.name === 'taucad:target');
  if (
    sbom.bomFormat !== 'CycloneDX' ||
    sbom.specVersion !== '1.6' ||
    targetProperty?.value !== target ||
    components.get('CPython') !== manifest.pythonVersion ||
    components.get('build123d') !== manifest.build123dVersion ||
    components.get('cadquery-ocp-novtk') !== manifest.ocpVersion ||
    manifest.distributions.some((distribution) => components.get(distribution.name) !== distribution.version)
  ) {
    throw new Error(`Invalid Build123d SBOM for ${target}`);
  }
};

/**
 * The PicoGK payload carries the MIT notices of the .NET runtime, Roslyn and SkiaSharp, lists SkiaSharp
 * in its SBOM, and ships no localized Roslyn satellite assemblies.
 */
const verifyPicoGkNoticesAndTrims = (
  root: string,
  resourcePaths: readonly string[],
  sbomListsSkiaSharp: boolean,
): void => {
  if (resourcePaths.some((path) => path.endsWith('.resources.dll'))) {
    throw new Error(
      'PicoGK resources carry localized satellite assemblies; publish with SatelliteResourceLanguages=en.',
    );
  }
  const missingNotices = [
    'DotNet-LICENSE.txt',
    'DotNet-THIRD-PARTY-NOTICES.txt',
    'Roslyn-NOTICES.rtf',
    'SkiaSharp-LICENSE.txt',
    'SkiaSharp-THIRD-PARTY-NOTICES.txt',
  ].filter((name) => !existsSync(resolve(root, name)));
  if (missingNotices.length > 0 || !sbomListsSkiaSharp) {
    throw new Error(`PicoGK resources omit MIT notices or the SkiaSharp SBOM entry: ${missingNotices.join(', ')}`);
  }
};

/** Where `picogk:prepare-layer` writes the Tau PicoGK layer, its record and the offline seed. */
const picoGkLayerRoot = resolve(workspaceRoot, 'out/picogk-layer');

/**
 * The Tau PicoGK layer the macOS release job publishes (charter W4, D6), when this job built it: its archive matches
 * its record, it is framework-dependent (no apphost, no `dotnet` launcher, no symbols) and it unpacks beside
 * Microsoft's runtime archive into the closure layout `tau prepare picogk` seals, where the archive's `dotnet` muxer
 * is the launcher. The inverse of the bundled resource's apphost rule above.
 * @returns The muxer and the worker assembly to probe, or nothing when no layer was built.
 */
const verifyPicoGkLayer = (): readonly string[] | undefined => {
  const recordPath = resolve(picoGkLayerRoot, 'darwin-arm64/tau-layer.json');
  if (!existsSync(recordPath)) {
    return undefined;
  }
  const record = JSON.parse(readFileSync(recordPath, 'utf8')) as {
    readonly asset: string;
    readonly sha256: string;
    readonly protocolVersion: number;
    readonly dotnetRuntimeVersion: string;
  };
  const archive = resolve(picoGkLayerRoot, 'darwin-arm64', basename(record.asset));
  if (sha256(archive) !== record.sha256 || record.protocolVersion !== picoGkWireProtocol) {
    throw new Error(`The Tau PicoGK layer ${archive} does not match its record or the worker protocol.`);
  }
  const seed = JSON.parse(readFileSync(resolve(picoGkLayerRoot, 'seed/tau-seed.json'), 'utf8')) as {
    readonly closures: ReadonlyArray<{ readonly payloads: ReadonlyArray<{ readonly blob: string }> }>;
  };
  const runtimeBlob = seed.closures[0]?.payloads[0]?.blob;
  if (runtimeBlob === undefined || !/^blobs\/sha256\/[\da-f]{64}$/u.test(runtimeBlob)) {
    throw new Error('The PicoGK layer seed does not index the .NET runtime archive.');
  }
  const closure = mkdtempSync(resolve(tmpdir(), 'tau-picogk-closure-'));
  const layer = resolve(closure, 'tau-worker');
  mkdirSync(resolve(closure, 'dotnet'));
  mkdirSync(layer);
  run('tar', ['-xzf', resolve(picoGkLayerRoot, 'seed', runtimeBlob), '-C', resolve(closure, 'dotnet')]);
  run('tar', ['-xzf', archive, '-C', layer]);
  const layerPaths = filesUnder(layer);
  if (
    layerPaths.some((path) => ['dotnet', 'Tau.PicoGK.Worker'].includes(basename(path))) ||
    layerPaths.some((path) => path.endsWith('.pdb') || path.endsWith('.xml')) ||
    !existsSync(resolve(layer, 'Tau.PicoGK.Worker.dll'))
  ) {
    throw new Error(
      'The Tau PicoGK layer must be the framework-dependent worker assembly, with no apphost or symbols.',
    );
  }
  const muxer = resolve(closure, 'dotnet/dotnet');
  if (
    !existsSync(muxer) ||
    !existsSync(resolve(closure, `dotnet/shared/Microsoft.NETCore.App/${record.dotnetRuntimeVersion}`))
  ) {
    throw new Error(`The .NET runtime archive does not carry the dotnet muxer and ${record.dotnetRuntimeVersion}.`);
  }
  const sbom = JSON.parse(readFileSync(resolve(layer, 'tau-picogk-sbom.cdx.json'), 'utf8')) as {
    readonly components?: ReadonlyArray<{ readonly name: string }>;
  };
  verifyPicoGkNoticesAndTrims(layer, layerPaths, sbom.components?.some(({ name }) => name === 'SkiaSharp') === true);
  return [muxer, resolve(layer, 'Tau.PicoGK.Worker.dll')];
};

/**
 * Drive a PicoGK worker command through `analyze`, `build` and `shutdown` with an empty environment and check the
 * sphere artifact against the digest the worker reports.
 * @param command - The executable and the arguments before the worker's own.
 * @param label - What the command is, for error messages.
 */
const probePicoGkWorker = (command: readonly string[], label: string): void => {
  const picoGkProbe = mkdtempSync(resolve(tmpdir(), 'tau-picogk-probe-'));
  const picoGkWorkspace = resolve(picoGkProbe, 'workspace');
  const picoGkArtifacts = resolve(picoGkProbe, 'artifacts');
  mkdirSync(picoGkWorkspace);
  mkdirSync(picoGkArtifacts);
  writeFileSync(
    resolve(picoGkWorkspace, 'main.cs'),
    `using System.Numerics;
using PicoGK;
Library.Go(1f, () =>
{
    Library.oViewer().SetGroupMaterial(0, "4f7dd9", 0f, 0.7f);
    Library.oViewer().Add(Voxels.voxSphere(Vector3.Zero, 3f), 0);
});
`,
  );
  const picoGkInput = [
    {
      protocolVersion: picoGkWireProtocol,
      requestId: 'verify-analyze',
      method: 'analyze',
      params: { entryPath: 'main.cs' },
    },
    {
      protocolVersion: picoGkWireProtocol,
      requestId: 'verify-build',
      method: 'build',
      params: { entryPath: 'main.cs', parameters: {} },
    },
    { protocolVersion: picoGkWireProtocol, requestId: 'verify-shutdown', method: 'shutdown', params: {} },
  ]
    .map((request) => JSON.stringify(request))
    .join('\n');
  const picoGkRun = spawnSync(
    'env',
    [
      '-i',
      'LANG=C.UTF-8',
      ...command,
      '--workspace',
      picoGkWorkspace,
      '--artifacts',
      picoGkArtifacts,
      '--parent-pid',
      String(process.pid),
    ],
    { encoding: 'utf8', input: `${picoGkInput}\n`, timeout: 300_000 },
  );
  if (picoGkRun.error !== undefined || picoGkRun.status !== 0) {
    rmSync(picoGkProbe, { recursive: true, force: true });
    throw new Error(`The ${label} failed its JIT/native probe:\n${picoGkRun.stdout}${picoGkRun.stderr}`, {
      cause: picoGkRun.error,
    });
  }
  const picoGkFrames = picoGkRun.stdout
    .trim()
    .split('\n')
    .map((line) => JSON.parse(line) as Record<string, unknown>);
  const picoGkReady = picoGkFrames.find((frame) => frame['type'] === 'ready');
  const picoGkBuild = picoGkFrames.find((frame) => frame['requestId'] === 'verify-build');
  const picoGkResult = picoGkBuild?.['result'] as
    | {
        readonly artifactPath?: unknown;
        readonly byteLength?: unknown;
        readonly sha256?: unknown;
        readonly prototypes?: unknown;
        readonly occurrences?: unknown;
      }
    | undefined;
  const picoGkArtifact = typeof picoGkResult?.artifactPath === 'string' ? resolve(picoGkResult.artifactPath) : '';
  if (
    picoGkReady?.['protocolVersion'] !== picoGkWireProtocol ||
    !picoGkArtifact.startsWith(`${picoGkArtifacts}/`) ||
    typeof picoGkResult?.byteLength !== 'number' ||
    picoGkResult.byteLength <= 0 ||
    typeof picoGkResult.sha256 !== 'string' ||
    !Array.isArray(picoGkResult.prototypes) ||
    picoGkResult.prototypes.length !== 1 ||
    !Array.isArray(picoGkResult.occurrences) ||
    picoGkResult.occurrences.length !== 1 ||
    !existsSync(picoGkArtifact) ||
    readFileSync(picoGkArtifact).byteLength !== picoGkResult.byteLength ||
    sha256(picoGkArtifact) !== picoGkResult.sha256
  ) {
    rmSync(picoGkProbe, { recursive: true, force: true });
    throw new Error(`The ${label} did not complete a valid Roslyn/JIT/native sphere build: ${picoGkRun.stdout}`);
  }
  rmSync(picoGkProbe, { recursive: true, force: true });
};

const verifyPicoGkResource = (): string => {
  const target = 'darwin-arm64';
  const root = resolve(appPath, `Contents/Resources/picogk/${target}`);
  const manifest = JSON.parse(
    readFileSync(resolve(root, 'tau-runtime-manifest.json'), 'utf8'),
  ) as PicoGkResourceManifest;
  if (
    manifest.schemaVersion !== 2 ||
    manifest.target !== target ||
    manifest.dotnetRuntimeVersion !== '10.0.11' ||
    manifest.picoGkCommit !== '0e6cf6b6f4993ec16dbcd72d8f27f26b999980f3' ||
    manifest.picoGkArchiveSha256 !== '6e188832832241ce5fad3639e2cab63982e4b392eaea367c49a32aac361f4ca5' ||
    !/^[\da-f]{64}$/u.test(manifest.picoGkHostedPatchSha256) ||
    manifest.hostApiVersion !== 2 ||
    manifest.protocolVersion !== picoGkWireProtocol ||
    manifest.sceneArtifactVersion !== 4
  ) {
    throw new Error(`Invalid PicoGK resource manifest for ${target}`);
  }
  for (const entry of [{ path: manifest.workerPath, sha256: manifest.workerSha256 }, ...manifest.resourceFiles]) {
    const path = resolve(root, entry.path);
    if (relative(root, path).startsWith('..') || sha256(path) !== entry.sha256) {
      throw new Error(`PicoGK resource integrity failed for ${target}/${entry.path}`);
    }
  }
  const sbom = JSON.parse(readFileSync(resolve(root, 'tau-picogk-sbom.cdx.json'), 'utf8')) as {
    readonly bomFormat?: string;
    readonly components?: ReadonlyArray<{
      readonly hashes?: ReadonlyArray<{ readonly alg?: string; readonly content?: string }>;
      readonly name?: string;
      readonly version?: string;
    }>;
    readonly specVersion?: string;
  };
  const components = new Map(sbom.components?.map((component) => [component.name, component]));
  const picoGk = components.get('PicoGK');
  if (
    sbom.bomFormat !== 'CycloneDX' ||
    sbom.specVersion !== '1.6' ||
    components.get('.NET Runtime')?.version !== manifest.dotnetRuntimeVersion ||
    picoGk?.version !== manifest.picoGkCommit ||
    !picoGk.hashes?.some(({ alg, content }) => alg === 'SHA-256' && content === manifest.picoGkHostedPatchSha256)
  ) {
    throw new Error(`Invalid PicoGK SBOM for ${target}`);
  }
  const resourcePaths = filesUnder(root);
  if (resourcePaths.some((path) => basename(path) === 'dotnet')) {
    throw new Error('PicoGK resource must use its self-contained apphost, not a dotnet launcher.');
  }
  if (resourcePaths.some((path) => path.endsWith('.pdb') || path.endsWith('.xml'))) {
    throw new Error('PicoGK production resources contain development-only symbols or XML documentation.');
  }
  verifyPicoGkNoticesAndTrims(root, resourcePaths, components.has('SkiaSharp'));
  return resolve(root, manifest.workerPath);
};

if (!unsigned) {
  run('codesign', ['--verify', '--deep', '--strict', '--verbose=2', appPath]);
}
for (const icon of ['icon.png', 'icon-dark.png']) {
  if (!existsSync(resolve(brandingRoot, icon))) {
    throw new Error(`The packaged app is missing branding/${icon}.`);
  }
}
/* `tau://` deep links only work from a packaged app, and only because this key
 * is in the bundle: without it Launch Services never routes a link here and
 * `open-url` never fires (R4). The Quick Look document types are merged into
 * the same plist, so this also proves the two did not displace each other. */
const bundledUrlSchemes = run('plutil', [
  '-extract',
  'CFBundleURLTypes.0.CFBundleURLSchemes',
  'json',
  '-o',
  '-',
  resolve(appPath, 'Contents/Info.plist'),
]).trim();
if (!(JSON.parse(bundledUrlSchemes) as string[]).includes('tau')) {
  throw new Error(`The packaged app does not claim the tau:// scheme: ${bundledUrlSchemes}`);
}
run('plutil', ['-extract', 'CFBundleDocumentTypes', 'json', '-o', '-', resolve(appPath, 'Contents/Info.plist')]);
if (release) {
  const identity = run('codesign', ['--display', '--verbose=4', appPath]);
  const team = process.env['APPLE_TEAM_ID'];
  if (
    !team ||
    !identity.includes(`TeamIdentifier=${team}`) ||
    !identity.includes('Authority=Developer ID Application:')
  ) {
    throw new Error('Release signature must be Developer ID Application for APPLE_TEAM_ID');
  }
}
if (release) {
  const source = JSON.parse(readFileSync(resolve(desktopRoot, 'package.json'), 'utf8')) as { version: string };
  const expectedVersion = desktopPackageVersion(source.version);
  for (const key of ['CFBundleVersion', 'CFBundleShortVersionString']) {
    const actualVersion = run('plutil', [
      '-extract',
      key,
      'raw',
      '-o',
      '-',
      resolve(appPath, 'Contents/Info.plist'),
    ]).trim();
    if (actualVersion !== expectedVersion) {
      throw new Error(`${key} disagrees with the release version: ${actualVersion}`);
    }
  }
  const packaged = JSON.parse(
    run('env', [
      'ELECTRON_RUN_AS_NODE=1',
      appExecutable,
      '-e',
      `process.stdout.write(JSON.stringify(require(${JSON.stringify(resolve(appPath, 'Contents/Resources/app.asar/package.json'))})))`,
    ]),
  ) as {
    version: string;
    tauDesktop?: { channel?: string; environmentOverrides?: boolean; releaseTag?: string; sourceCommit?: string };
  };
  if (
    packaged.version !== expectedVersion ||
    (packaged.tauDesktop?.channel ?? 'production') !== desktopPackageChannel(process.env['TAU_DESKTOP_CHANNEL']) ||
    packaged.tauDesktop?.environmentOverrides === true ||
    !process.env['TAU_DESKTOP_RELEASE_TAG'] ||
    packaged.tauDesktop?.releaseTag !== process.env['TAU_DESKTOP_RELEASE_TAG'] ||
    !process.env['TAU_DESKTOP_SOURCE_SHA'] ||
    packaged.tauDesktop.sourceCommit !== process.env['TAU_DESKTOP_SOURCE_SHA']
  ) {
    throw new Error('Packaged release identity or environment override policy disagrees with CI');
  }
}
if (shouldNotarize) {
  run('xcrun', ['stapler', 'validate', appPath]);
  run('spctl', ['--assess', '--type', 'execute', '--verbose=2', appPath]);
}

/* The sandbox runtime's Linux and Windows helpers stay out of the macOS package (runtime-stage.mts). */
const sandboxRuntimeRoot = resolve(appPath, 'Contents/Resources/app.asar/node_modules/@anthropic-ai/sandbox-runtime');
const stagedSandboxHelpers = run('env', [
  'ELECTRON_RUN_AS_NODE=1',
  appExecutable,
  '-e',
  `const {existsSync}=require('node:fs');process.stdout.write(JSON.stringify(['package.json','vendor/seccomp','vendor/srt-win'].map((path)=>existsSync(require('node:path').join(${JSON.stringify(sandboxRuntimeRoot)},path)))))`,
]);
if (stagedSandboxHelpers !== JSON.stringify([true, false, false])) {
  throw new Error(`The macOS package stages Linux or Windows sandbox helpers: ${stagedSandboxHelpers}`);
}

if (architecture === 'arm64') {
  const libassimpAddon = resolve(
    appPath,
    `Contents/Resources/app.asar.unpacked/node_modules/libassimp-darwin-${architecture}/libassimp.darwin-${architecture}.node`,
  );
  if (!existsSync(libassimpAddon)) {
    throw new Error(`The packaged app does not contain the adjacent libassimp-darwin-${architecture} addon.`);
  }
  const nativeIdentity = run('env', [
    'ELECTRON_RUN_AS_NODE=1',
    appExecutable,
    '-e',
    `const addon=require(${JSON.stringify(libassimpAddon)});process.stdout.write(JSON.stringify([addon.buildIdentity,addon.napiVersion,addon.packageVersion]))`,
  ]);
  const libassimpVersion = run('env', [
    'ELECTRON_RUN_AS_NODE=1',
    appExecutable,
    '-e',
    `process.stdout.write(require(${JSON.stringify(resolve(appPath, 'Contents/Resources/app.asar/node_modules/libassimp/package.json'))}).version)`,
  ]);
  if (nativeIdentity !== JSON.stringify([`darwin-${architecture}-napi8`, 8, libassimpVersion])) {
    throw new Error(`The packaged Electron runtime loaded an unexpected libassimp addon: ${nativeIdentity}`);
  }
} else {
  const assimpEntry = pathToFileURL(
    resolve(appPath, 'Contents/Resources/app.asar/node_modules/libassimp/dist/index.node.mjs'),
  ).href;
  const conversion = run('env', [
    'ELECTRON_RUN_AS_NODE=1',
    appExecutable,
    '--input-type=module',
    '-e',
    `const {createAssimp}=await import(${JSON.stringify(assimpEntry)});
const engine=await createAssimp({backend:"wasm"});
try {
  const result=await engine.convert({name:"triangle.obj",bytes:new TextEncoder().encode("v 0 0 0\\nv 1 0 0\\nv 0 1 0\\nf 1 2 3\\n")},{to:"glb"});
  if(engine.backend!=="wasm" || !result.files.some(file=>file.bytes.length>0)) throw Error("Intel Assimp conversion failed");
  process.stdout.write("wasm-conversion-passed");
} finally {engine.dispose();}`,
  ]);
  if (conversion !== 'wasm-conversion-passed') {
    throw new Error(`The packaged Intel Assimp backend failed conversion: ${conversion}`);
  }
}

/* One package, two payloads. The engine always renders, so the version alone
 * cannot tell the packaged app apart from one that quietly fell back to the
 * WebAssembly build; `backend` is what says which payload the platform package
 * gave it, and it is read from the engine itself inside the packaged runtime. */
const openrscadAddon = resolve(
  appPath,
  `Contents/Resources/app.asar.unpacked/node_modules/@taulabs/openrscad-engine-darwin-${architecture}/openrscad.darwin-${architecture}.node`,
);
if (!existsSync(openrscadAddon)) {
  throw new Error(
    `The packaged app does not contain the adjacent @taulabs/openrscad-engine-darwin-${architecture} addon.`,
  );
}
const openrscadEntry = resolve(
  appPath,
  'Contents/Resources/app.asar/node_modules/@taulabs/openrscad-engine/dist/node.js',
);
const openrscadEngineVersion = run('env', [
  'ELECTRON_RUN_AS_NODE=1',
  appExecutable,
  '-e',
  `process.stdout.write(require(${JSON.stringify(resolve(appPath, 'Contents/Resources/app.asar/node_modules/@taulabs/openrscad-engine/package.json'))}).version)`,
]);
const openrscadIdentity = run('env', [
  'ELECTRON_RUN_AS_NODE=1',
  appExecutable,
  '-e',
  `import(${JSON.stringify(openrscadEntry)}).then(async ({version,backend})=>process.stdout.write(JSON.stringify([await version(),backend]))).catch((error)=>{console.error(error);process.exitCode=1})`,
]);
if (openrscadIdentity !== JSON.stringify([openrscadEngineVersion, 'native'])) {
  throw new Error(
    `The packaged Electron runtime loaded an unexpected OpenRSCAD engine: ${openrscadIdentity} (expected ${JSON.stringify([openrscadEngineVersion, 'native'])})`,
  );
}

const esbuildExecutable = resolve(
  appPath,
  `Contents/Resources/app.asar.unpacked/node_modules/@esbuild/darwin-${architecture}/bin/esbuild`,
);
if (!existsSync(esbuildExecutable)) {
  throw new Error(`The packaged app does not contain the adjacent @esbuild/darwin-${architecture} executable.`);
}
const esbuildEntry = resolve(appPath, 'Contents/Resources/app.asar/node_modules/esbuild/lib/main.js');
const esbuildIdentity = run('env', [
  'ELECTRON_RUN_AS_NODE=1',
  `ESBUILD_BINARY_PATH=${esbuildExecutable}`,
  appExecutable,
  '-e',
  `const esbuild=require(${JSON.stringify(esbuildEntry)});const result=esbuild.transformSync('const answer: number = 42',{loader:'ts'});if(!result.code.includes('answer = 42'))throw new Error('esbuild transform returned unexpected output');process.stdout.write(esbuild.version)`,
]);
const esbuildVersion = run('env', [
  'ELECTRON_RUN_AS_NODE=1',
  appExecutable,
  '-e',
  `process.stdout.write(require(${JSON.stringify(resolve(appPath, 'Contents/Resources/app.asar/node_modules/esbuild/package.json'))}).version)`,
]);
if (esbuildIdentity !== esbuildVersion) {
  throw new Error(`The packaged Electron runtime used an unexpected esbuild version: ${esbuildIdentity}`);
}

const nanorasterAddon = resolve(
  appPath,
  `Contents/Resources/app.asar.unpacked/node_modules/nanoraster-darwin-${architecture}/nanoraster.darwin-${architecture}.node`,
);
if (!existsSync(nanorasterAddon)) {
  throw new Error(`The packaged app does not contain the adjacent nanoraster-darwin-${architecture} addon.`);
}
const nanorasterEntry = resolve(appPath, 'Contents/Resources/app.asar/node_modules/nanoraster/dist/index.node.mjs');
const nanorasterIdentity = run('env', [
  'ELECTRON_RUN_AS_NODE=1',
  appExecutable,
  '-e',
  `import(${JSON.stringify(nanorasterEntry)}).then(async ({describeAdapter})=>{const adapter=await describeAdapter();const loaded=process.report.getReport().sharedObjects.filter((path)=>path.endsWith('nanoraster.darwin-${architecture}.node'));const rootVersion=require(${JSON.stringify(resolve(appPath, 'Contents/Resources/app.asar/node_modules/nanoraster/package.json'))}).version;const platformVersion=require(${JSON.stringify(resolve(appPath, `Contents/Resources/app.asar/node_modules/nanoraster-darwin-${architecture}/package.json`))}).version;process.stdout.write(JSON.stringify([adapter.backend,loaded,rootVersion,platformVersion]))}).catch((error)=>{console.error(error);process.exitCode=1})`,
]);
const [nanorasterBackend, loadedNanorasterAddons, nanorasterVersion, nanorasterPlatformVersion] = JSON.parse(
  nanorasterIdentity,
) as [string, string[], string, string];
if (
  nanorasterBackend !== 'metal' ||
  loadedNanorasterAddons.length !== 1 ||
  realpathSync(loadedNanorasterAddons[0]!) !== realpathSync(nanorasterAddon) ||
  nanorasterVersion !== nanorasterPlatformVersion
) {
  throw new Error(
    `The packaged Electron runtime loaded an unexpected nanoraster backend or addon: ${nanorasterIdentity}`,
  );
}

let machObjectCount = 0;
for (const path of filesUnder(appPath)) {
  if (!isMachObject(path)) {
    continue;
  }
  const architectures = run('lipo', ['-archs', path]).trim().split(/\s+/u).sort();
  if (architectures.join(' ') !== machArchitecture) {
    throw new Error(`${path} is not ${machArchitecture}-only: ${architectures.join(', ')}`);
  }
  machObjectCount += 1;
}

/* A package with Electron's default fuses is a general-purpose Node runtime that
 * honours NODE_OPTIONS and loads an unchecked ASAR (security assessment F-3). */
const fuseWire = await getCurrentFuseWire(appPath);
for (const [fuse, enabled] of Object.entries(macosPackageFuses({ release }))) {
  const option = Number(fuse) as FuseV1Options;
  const expected = enabled ? FuseState.ENABLE : FuseState.DISABLE;
  if (fuseWire[option] !== expected) {
    throw new Error(
      `Electron fuse ${FuseV1Options[option]} is ${String(fuseWire[option])}, expected ${String(expected)}.`,
    );
  }
}

verifyPythonResource(architecture);
if (architecture === 'arm64') {
  const picoGkWorker = verifyPicoGkResource();
  if (!unsigned) {
    const picoGkEntitlements = run('codesign', ['-d', '--entitlements', ':-', picoGkWorker]);
    if (!picoGkEntitlements.includes('com.apple.security.cs.allow-jit')) {
      throw new Error('The PicoGK worker is missing the CoreCLR JIT entitlement.');
    }
    const disablesLibraryValidation = picoGkEntitlements.includes('com.apple.security.cs.disable-library-validation');
    if ((!release && !disablesLibraryValidation) || (release && disablesLibraryValidation)) {
      throw new Error(
        release
          ? 'The release PicoGK worker unnecessarily disables library validation.'
          : 'The ad-hoc PicoGK worker must disable library validation for its independently signed CoreCLR dylibs.',
      );
    }
    if (picoGkEntitlements.includes('com.apple.security.get-task-allow')) {
      throw new Error('The PicoGK worker carries the debug get-task-allow entitlement.');
    }
  }
  probePicoGkWorker([picoGkWorker], 'packaged PicoGK worker');
  const layerCommand = verifyPicoGkLayer();
  if (layerCommand !== undefined) {
    probePicoGkWorker(layerCommand, 'Tau PicoGK layer launched through the dotnet muxer');
    rmSync(dirname(dirname(layerCommand[0]!)), { recursive: true, force: true });
  }
}
if (!unsigned) {
  for (const helper of ['Tau Helper', 'Tau Helper (GPU)', 'Tau Helper (Plugin)', 'Tau Helper (Renderer)']) {
    const helperPath = resolve(appPath, `Contents/Frameworks/${helper}.app`);
    const entitlements = run('codesign', ['-d', '--entitlements', ':-', helperPath]);
    const helperDisablesLibraryValidation = entitlements.includes('com.apple.security.cs.disable-library-validation');
    if ((!release && !helperDisablesLibraryValidation) || (release && helperDisablesLibraryValidation)) {
      throw new Error(
        release
          ? `${helper} unnecessarily disables library validation.`
          : `${helper} must disable library validation for an ad-hoc Electron bundle.`,
      );
    }
  }
}
const python = resolve(appPath, `Contents/Resources/python/darwin-${architecture}/bin/python3`);
run(
  'env',
  [
    '-i',
    'LANG=C.UTF-8',
    '/usr/bin/arch',
    `-${machArchitecture}`,
    python,
    '-I',
    '-B',
    '-c',
    'import build123d,OCP; print(build123d.__version__)',
  ],
  300_000,
);

if (!isQuickLookEnabled() || architecture === 'x64') {
  console.log(
    `Verified ${String(machObjectCount)} ${machArchitecture} Mach-O files. Quick Look is disabled (isQuickLookEnabled()); its checks were skipped.`,
  );
} else if (unsigned) {
  const probeRoot = mkdtempSync(join(tmpdir(), 'tau-quick-look-converter-probe-'));
  const probeBundle = resolve(probeRoot, 'TauQuickLookConverterProbe.app');
  const probeExecutable = resolve(probeBundle, 'Contents/MacOS/TauQuickLookConverterProbe');
  const probeResources = resolve(probeBundle, 'Contents/Resources');
  const probeTemporaryRoot = resolve(probeRoot, 'temporary');
  const probeSessionRoot = resolve(probeTemporaryRoot, 'tau-quick-look');
  const assertNoProbeSessions = (): void => {
    const leaked = existsSync(probeSessionRoot) ? readdirSync(probeSessionRoot) : [];
    if (leaked.length > 0) {
      throw new Error(`Unsigned Quick Look converter left temporary sessions behind: ${leaked.join(', ')}`);
    }
  };
  try {
    mkdirSync(dirname(probeExecutable), { recursive: true });
    mkdirSync(probeResources, { recursive: true });
    cpSync(
      resolve(appPath, 'Contents/PlugIns/TauQuickLookPreview.appex/Contents/Resources/runtime'),
      resolve(probeResources, 'runtime'),
      { recursive: true },
    );
    writeFileSync(
      resolve(probeBundle, 'Contents/Info.plist'),
      '<?xml version="1.0" encoding="UTF-8"?><plist version="1.0"><dict><key>CFBundleExecutable</key><string>TauQuickLookConverterProbe</string><key>CFBundleIdentifier</key><string>com.taucad.tau.quicklook-converter-probe</string><key>CFBundlePackageType</key><string>APPL</string></dict></plist>',
    );
    run('xcrun', [
      'swiftc',
      '-O',
      resolve(desktopRoot, 'macos/generated/FormatManifest.generated.swift'),
      resolve(desktopRoot, 'macos/TauQuickLookCore/TauConverter.swift'),
      resolve(desktopRoot, 'scripts/quick-look-converter-probe.swift'),
      '-framework',
      'AppKit',
      '-framework',
      'WebKit',
      '-o',
      probeExecutable,
    ]);
    const source = resolve(probeRoot, 'cube.step');
    copyFileSync(resolve(workspaceRoot, 'packages/plugins/brep/src/fixtures/cube.step'), source);
    const preview = resolve(probeRoot, 'preview.usdz');
    const thumbnail = resolve(probeRoot, 'thumbnail.png');
    run(probeExecutable, [source, 'usdz', preview, 'convert', probeTemporaryRoot], 60_000);
    if (
      !readFileSync(preview)
        .subarray(0, 4)
        .equals(Buffer.from([0x50, 0x4b, 0x03, 0x04]))
    ) {
      throw new Error('The unsigned Quick Look converter probe returned invalid USDZ data.');
    }
    run('unzip', ['-t', preview]);
    const previewMembers = run('unzip', ['-Z1', preview]);
    if (!previewMembers.split('\n').some((name) => /\.usd[ac]?$/u.test(name))) {
      throw new Error(`The unsigned Quick Look converter USDZ contains no USD member: ${previewMembers}`);
    }
    run(probeExecutable, [source, 'png', thumbnail, 'convert', probeTemporaryRoot], 60_000);
    assertThumbnailDimensions(thumbnail, 128);

    const malformed = resolve(probeRoot, 'malformed.off');
    writeFileSync(malformed, 'OFF\n8 12 0\nnot geometry\n');
    const malformedResult = spawnSync(
      probeExecutable,
      [malformed, 'png', resolve(probeRoot, 'malformed.png'), 'convert', probeTemporaryRoot],
      {
        encoding: 'utf8',
        timeout: 60_000,
      },
    );
    if (
      malformedResult.status !== 1 ||
      malformedResult.signal !== null ||
      !/(?:convert|geometry|invalid|OFF|failed)/iu.test(malformedResult.stderr)
    ) {
      throw new Error(
        `Malformed input did not produce the expected conversion diagnostic: status=${String(malformedResult.status)} signal=${String(malformedResult.signal)} stderr=${malformedResult.stderr}`,
      );
    }
    run(probeExecutable, [source, 'png', resolve(probeRoot, 'cancelled.png'), 'cancel', probeTemporaryRoot], 10_000);
    assertNoProbeSessions();
  } finally {
    rmSync(probeRoot, { recursive: true, force: true });
  }
  console.log(
    `Verified ${String(machObjectCount)} ${machArchitecture} Mach-O files and the unsigned Quick Look converter.`,
  );
} else {
  run('open', ['-gj', appPath]);
  const extensionIdentifiers = [
    'com.taucad.tau.desktop.quicklook-preview',
    'com.taucad.tau.desktop.quicklook-thumbnail',
  ] as const;
  const delay = async (milliseconds: number): Promise<void> =>
    new Promise((resolve) => {
      setTimeout(resolve, milliseconds);
    });
  const waitForExtensionDiscovery = async (attempt = 0): Promise<void> => {
    const plugins = run('pluginkit', ['-m', '-A', '-D']);
    if (extensionIdentifiers.every((identifier) => plugins.includes(identifier))) {
      return;
    }
    if (attempt === 19) {
      throw new Error('Launch Services did not discover both Tau Quick Look extensions');
    }
    await delay(250);
    await waitForExtensionDiscovery(attempt + 1);
  };
  await waitForExtensionDiscovery();
  stopPackagedApp();
  await delay(500);
  if (processRows().some((row) => row.command === appExecutable)) {
    throw new Error('Tau remained running; offline extension verification is invalid');
  }

  const testRoot = mkdtempSync(join(tmpdir(), 'tau-quick-look-verify-'));
  const contentTypeProbe = resolve(testRoot, 'content-type-probe');
  const thumbnailProbe = resolve(testRoot, 'quick-look-thumbnail-probe');
  const previewProbe = resolve(testRoot, 'quick-look-preview-probe');
  const initialSessions = temporarySessions();
  const measurements: string[] = [];
  try {
    const classifications = [
      ['packages/plugins/gltf/src/fixtures/cube.glb', ['org.khronos.glb']],
      ['packages/plugins/brep/src/fixtures/cube.step', ['com.taucad.step', 'com.shapr3d.step', 'com.shapr3d.stp']],
      ['packages/plugins/rhino/src/fixtures/cube-mesh.3dm', ['com.mcneel.rhinoceros.3dm', 'com.shapr3d.rhino.3dm']],
      ['packages/plugins/assimp/src/fixtures/cube-ascii.fbx', ['com.autodesk.mac.fbx']],
    ] as const;
    // Ask Launch Services rather than Spotlight: kMDItemContentType is indexed
    // when the checkout is written, before the packaged app declares its types.
    run('xcrun', ['swiftc', '-O', resolve(desktopRoot, 'scripts/content-type-probe.swift'), '-o', contentTypeProbe]);
    const contentTypes = run(
      contentTypeProbe,
      classifications.map(([relativePath]) => resolve(workspaceRoot, relativePath)),
    )
      .trim()
      .split('\n');
    for (const [index, [relativePath, expectedTypes]] of classifications.entries()) {
      const contentType = contentTypes[index] ?? '';
      if (!(expectedTypes as readonly string[]).includes(contentType)) {
        throw new Error(`${relativePath} resolved to unexpected UTI ${contentType}`);
      }
    }

    run('xcrun', [
      'swiftc',
      '-O',
      resolve(desktopRoot, 'scripts/quick-look-thumbnail-probe.swift'),
      '-o',
      thumbnailProbe,
    ]);
    run('xcrun', ['swiftc', '-O', resolve(desktopRoot, 'scripts/quick-look-preview-probe.swift'), '-o', previewProbe]);

    /**
     * One retry per Quick Look request (thumbnail and preview appexes alike). macOS RunningBoard kills the thumbnail
     * extension after every request on some hosts (`0xDEAD10CC`, a system
     * framework holding `/System/Library/Caches/com.apple.IntlDataCache.le`
     * while the appex is suspended); a request that lands on an instance being
     * torn down fails with the generic `QLThumbnailErrorDomain error 0` and no
     * Tau-side record. The request is idempotent, and the repeat has succeeded
     * in every observation (lane 20-iges-quicklook, 2026-09-09). A second
     * failure is a real defect and propagates.
     */
    const runQuickLookMeasured = async (options: Parameters<typeof runMeasured>[0]) => {
      try {
        return await runMeasured(options);
      } catch (error) {
        console.warn(`thumbnail request failed once, retrying (host-side Quick Look teardown race): ${String(error)}`);
        try {
          return await runMeasured(options);
        } catch (retryError) {
          try {
            await printQuickLookDiagnostics();
          } catch (diagnosticError) {
            // Diagnostics are supplementary; never let them replace the probe failure.
            console.error(`Could not collect Quick Look diagnostics: ${String(diagnosticError)}`);
          }
          throw retryError;
        }
      }
    };

    for (const format of quickLookManifest.formats.filter(({ systemPreview }) => !systemPreview)) {
      const source = copyFixture(format, testRoot);
      const output = resolve(testRoot, `${randomUUID()}-${basename(source)}.png`);
      // oxlint-disable-next-line no-await-in-loop -- Quick Look hosts are measured one fixture at a time.
      const measured = await runQuickLookMeasured({
        command: thumbnailProbe,
        arguments: [source, output, '128', '1'],
        processName: 'TauQuickLookThumbnail',
        processTimeoutMilliseconds: 50_000,
      });
      assertThumbnailDimensions(output, 128);
      measurements.push(
        `${format.extensions.join('/')}=${String(Math.round(measured.milliseconds))}ms/${String(Math.round(measured.peakResidentKilobytes / 1024))}MB`,
      );
    }

    const thumbnailCases = [
      ['packages/plugins/brep/src/fixtures/cube.step', 128, 1],
      ['packages/plugins/brep/src/fixtures/cube.step', 256, 2],
      ['packages/plugins/brep/src/fixtures/cube-brep.iges', 256, 2],
      ['packages/plugins/brep/src/fixtures/cube.brep', 256, 2],
      ['packages/plugins/assimp/src/fixtures/cube.off', 256, 2],
    ] as const;
    for (const [relativePath, size, scale] of thumbnailCases) {
      const source = resolve(testRoot, `${randomUUID()}-${basename(relativePath)}`);
      const output = resolve(testRoot, `${basename(source)}.png`);
      copyFileSync(resolve(workspaceRoot, relativePath), source);
      // oxlint-disable-next-line no-await-in-loop -- Serial order preserves cold-then-warm measurements.
      const measured = await runQuickLookMeasured({
        command: thumbnailProbe,
        arguments: [source, output, String(size), String(scale)],
        processName: 'TauQuickLookThumbnail',
        processTimeoutMilliseconds: 50_000,
      });
      assertThumbnailDimensions(output, size * scale);
      measurements.push(
        `${basename(relativePath)} thumbnail=${String(Math.round(measured.milliseconds))}ms/${String(Math.round(measured.peakResidentKilobytes / 1024))}MB`,
      );
    }

    const previewSource = resolve(testRoot, `${randomUUID()}-cube.step`);
    copyFileSync(resolve(workspaceRoot, 'packages/plugins/brep/src/fixtures/cube.step'), previewSource);
    const previewStartedAt = Math.floor(Date.now() / 1000);
    const preview = await runQuickLookMeasured({
      command: previewProbe,
      arguments: [previewSource],
      processName: 'TauQuickLookPreview',
      processTimeoutMilliseconds: 50_000,
    });
    const previewLog = run('/usr/bin/log', [
      'show',
      '--start',
      `@${String(previewStartedAt)}`,
      '--style',
      'compact',
      '--predicate',
      'process == "TauQuickLookPreview" AND subsystem == "com.taucad.tau.desktop"',
    ]);
    if (!previewLog.includes('Interactive preview ready')) {
      throw new Error('Quick Look did not report a loaded interactive preview');
    }
    measurements.push(
      `cube.step preview=${String(Math.round(preview.milliseconds))}ms/${String(Math.round(preview.peakResidentKilobytes / 1024))}MB`,
    );

    const malformed = resolve(testRoot, `${randomUUID()}-malformed.off`);
    writeFileSync(malformed, 'OFF\n8 12 0\nnot geometry\n');
    const malformedResult = spawnSync(thumbnailProbe, [malformed, resolve(testRoot, 'malformed.png'), '128', '1'], {
      encoding: 'utf8',
      timeout: 50_000,
    });
    if (malformedResult.status === 0) {
      throw new Error('Malformed OFF input unexpectedly produced a thumbnail');
    }

    const cancellationSource = resolve(testRoot, `${randomUUID()}-cancel.step`);
    copyFileSync(resolve(workspaceRoot, 'packages/plugins/brep/src/fixtures/cube.step'), cancellationSource);
    run(thumbnailProbe, [cancellationSource, resolve(testRoot, 'cancelled.png'), '256', '2', '1'], 10_000);

    run('open', ['-gj', '-a', appPath, resolve(workspaceRoot, 'packages/plugins/brep/src/fixtures/cube.step')]);
    await delay(500);
    stopPackagedApp();
    await delay(1000);

    const leaked = [...temporarySessions()].filter((name) => !initialSessions.has(name));
    if (leaked.length > 0) {
      throw new Error(`Quick Look left temporary sessions behind: ${leaked.join(', ')}`);
    }
  } finally {
    rmSync(testRoot, { recursive: true, force: true });
  }

  console.log(`Verified ${String(machObjectCount)} ${machArchitecture} Mach-O files and both extension registrations.`);
  console.log(
    'Verified Finder-equivalent interactive preview, thumbnails, malformed input, cancellation, cleanup, and Open With.',
  );
  console.log(`Quick Look while Tau stopped: ${measurements.join(', ')}`);
}
