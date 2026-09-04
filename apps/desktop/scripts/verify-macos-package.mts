#!/usr/bin/env node

/**
 * Purpose: Exercise the packaged Tau app and its Quick Look extensions through macOS system APIs.
 * Why: A compiled extension is not useful until Launch Services discovers it and Finder can render with it.
 * Environment: macOS with the packaged app produced by package-macos.mts; optional
 * TAU_MACOS_PACKAGE_OUTPUT_ROOT matching the package command.
 * Usage: node --import @oxc-node/core/register scripts/verify-macos-package.mts [--release]
 * Exit codes: 0 when signing, architecture, discovery, preview, thumbnail, cancellation, and cleanup checks pass.
 */

import { spawn, spawnSync } from 'node:child_process';
import { createHash, randomUUID } from 'node:crypto';
import {
  copyFileSync,
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

import quickLookManifest from '#macos/quick-look-formats.json' with { type: 'json' };

const desktopRoot = resolve(import.meta.dirname, '..');
const workspaceRoot = resolve(desktopRoot, '../..');
const outputRoot = resolve(process.env['TAU_MACOS_PACKAGE_OUTPUT_ROOT'] ?? resolve(desktopRoot, 'package-out'));
const appPath = resolve(outputRoot, 'Tau-darwin-arm64/Tau.app');
const appExecutable = resolve(appPath, 'Contents/MacOS/Tau');
const brandingRoot = resolve(appPath, 'Contents/Resources/branding');
const extensionTemporaryRoot = resolve(tmpdir(), 'tau-quick-look');
const release = process.argv.slice(2).includes('--release');

if (process.platform !== 'darwin') {
  throw new Error('The macOS package can only be verified on macOS.');
}
if (process.argv.slice(2).some((argument) => argument !== '--release')) {
  throw new TypeError('Usage: verify-macos-package.mts [--release]');
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
    manifest.hostApiVersion !== 1 ||
    manifest.protocolVersion !== 3 ||
    manifest.sceneArtifactVersion !== 3
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
  return resolve(root, manifest.workerPath);
};

run('codesign', ['--verify', '--deep', '--strict', '--verbose=2', appPath]);
for (const icon of ['icon.png', 'icon-dark.png']) {
  if (!existsSync(resolve(brandingRoot, icon))) {
    throw new Error(`The packaged app is missing branding/${icon}.`);
  }
}
if (release) {
  run('xcrun', ['stapler', 'validate', appPath]);
  run('spctl', ['--assess', '--type', 'execute', '--verbose=2', appPath]);
}

const libassimpAddon = resolve(
  appPath,
  'Contents/Resources/app.asar.unpacked/node_modules/libassimp-darwin-arm64/libassimp.darwin-arm64.node',
);
if (!existsSync(libassimpAddon)) {
  throw new Error('The packaged app does not contain the adjacent libassimp-darwin-arm64 addon.');
}
const nativeIdentity = run('env', [
  'ELECTRON_RUN_AS_NODE=1',
  appExecutable,
  '-e',
  `const addon=require(${JSON.stringify(libassimpAddon)});process.stdout.write(JSON.stringify([addon.buildIdentity,addon.napiVersion,addon.packageVersion]))`,
]);
if (nativeIdentity !== '["darwin-arm64-napi8",8,"0.2.0"]') {
  throw new Error(`The packaged Electron runtime loaded an unexpected libassimp addon: ${nativeIdentity}`);
}

const openrscadNativeEntry = resolve(
  appPath,
  'Contents/Resources/app.asar/node_modules/@taulabs/openrscad-engine-native/dist/node.js',
);
const openrscadVersion = run('env', [
  'ELECTRON_RUN_AS_NODE=1',
  appExecutable,
  '-e',
  `import(${JSON.stringify(openrscadNativeEntry)}).then(async ({version})=>process.stdout.write(await version())).catch((error)=>{console.error(error);process.exitCode=1})`,
]);
if (openrscadVersion !== '0.11.0-beta.2') {
  throw new Error(`The packaged Electron runtime loaded an unexpected OpenRSCAD engine: ${openrscadVersion}`);
}

let arm64MachObjectCount = 0;
for (const path of filesUnder(appPath)) {
  if (!isMachObject(path)) {
    continue;
  }
  const architectures = run('lipo', ['-archs', path]).trim().split(/\s+/u).sort();
  if (architectures.join(' ') !== 'arm64') {
    throw new Error(`${path} is not arm64-only: ${architectures.join(', ')}`);
  }
  arm64MachObjectCount += 1;
}

verifyPythonResource('arm64');
const picoGkWorker = verifyPicoGkResource();
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
  { protocolVersion: 3, requestId: 'verify-analyze', method: 'analyze', params: { entryPath: 'main.cs' } },
  { protocolVersion: 3, requestId: 'verify-build', method: 'build', params: { entryPath: 'main.cs', parameters: {} } },
  { protocolVersion: 3, requestId: 'verify-shutdown', method: 'shutdown', params: {} },
]
  .map((request) => JSON.stringify(request))
  .join('\n');
const picoGkRun = spawnSync(
  'env',
  [
    '-i',
    'LANG=C.UTF-8',
    picoGkWorker,
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
  throw new Error(`The packaged PicoGK worker failed its JIT/native probe:\n${picoGkRun.stdout}${picoGkRun.stderr}`, {
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
      readonly components?: unknown;
    }
  | undefined;
const picoGkArtifact = typeof picoGkResult?.artifactPath === 'string' ? resolve(picoGkResult.artifactPath) : '';
if (
  picoGkReady?.['protocolVersion'] !== 3 ||
  !picoGkArtifact.startsWith(`${picoGkArtifacts}/`) ||
  typeof picoGkResult?.byteLength !== 'number' ||
  picoGkResult.byteLength <= 0 ||
  typeof picoGkResult.sha256 !== 'string' ||
  !Array.isArray(picoGkResult.components) ||
  picoGkResult.components.length !== 1 ||
  !existsSync(picoGkArtifact) ||
  readFileSync(picoGkArtifact).byteLength !== picoGkResult.byteLength ||
  sha256(picoGkArtifact) !== picoGkResult.sha256
) {
  rmSync(picoGkProbe, { recursive: true, force: true });
  throw new Error(
    `The packaged PicoGK worker did not complete a valid Roslyn/JIT/native sphere build: ${picoGkRun.stdout}`,
  );
}
rmSync(picoGkProbe, { recursive: true, force: true });
const python = resolve(appPath, 'Contents/Resources/python/darwin-arm64/bin/python3');
run(
  'env',
  [
    '-i',
    'LANG=C.UTF-8',
    '/usr/bin/arch',
    '-arm64',
    python,
    '-I',
    '-B',
    '-c',
    'import build123d,OCP; print(build123d.__version__)',
  ],
  300_000,
);

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

const classifications = [
  ['packages/plugins/gltf/src/fixtures/cube.glb', ['org.khronos.glb']],
  ['packages/plugins/brep/src/fixtures/cube.step', ['com.taucad.step', 'com.shapr3d.step', 'com.shapr3d.stp']],
  ['packages/plugins/rhino/src/fixtures/cube-mesh.3dm', ['com.mcneel.rhinoceros.3dm', 'com.shapr3d.rhino.3dm']],
  ['packages/plugins/assimp/src/fixtures/cube-ascii.fbx', ['com.autodesk.mac.fbx']],
] as const;
for (const [relativePath, expectedTypes] of classifications) {
  const path = resolve(workspaceRoot, relativePath);
  const metadata = run('mdls', ['-raw', '-name', 'kMDItemContentType', path]).trim();
  if (!(expectedTypes as readonly string[]).includes(metadata)) {
    throw new Error(`${relativePath} resolved to unexpected UTI ${metadata}`);
  }
}

const testRoot = mkdtempSync(join(tmpdir(), 'tau-quick-look-verify-'));
const thumbnailProbe = resolve(testRoot, 'quick-look-thumbnail-probe');
const previewProbe = resolve(testRoot, 'quick-look-preview-probe');
const initialSessions = temporarySessions();
const measurements: string[] = [];
try {
  run('xcrun', [
    'swiftc',
    '-O',
    resolve(desktopRoot, 'scripts/quick-look-thumbnail-probe.swift'),
    '-o',
    thumbnailProbe,
  ]);
  run('xcrun', ['swiftc', '-O', resolve(desktopRoot, 'scripts/quick-look-preview-probe.swift'), '-o', previewProbe]);

  for (const format of quickLookManifest.formats.filter(({ systemPreview }) => !systemPreview)) {
    const source = copyFixture(format, testRoot);
    const output = resolve(testRoot, `${randomUUID()}-${basename(source)}.png`);
    // oxlint-disable-next-line no-await-in-loop -- Quick Look hosts are measured one fixture at a time.
    const measured = await runMeasured({
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
    const measured = await runMeasured({
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
  const preview = await runMeasured({
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

console.log(`Verified ${String(arm64MachObjectCount)} arm64 Mach-O files and both extension registrations.`);
console.log(
  'Verified Finder-equivalent interactive preview, thumbnails, malformed input, cancellation, cleanup, and Open With.',
);
console.log(`Quick Look while Tau stopped: ${measurements.join(', ')}`);
