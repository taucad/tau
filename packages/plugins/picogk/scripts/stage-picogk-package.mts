#!/usr/bin/env node
/**
 * Purpose: Restore PicoVoxel's local PicoGK package and stage its assets immutably for one build.
 * Why: The browser host used to consume seven separately staged directories, each correct only by
 *      hand. One restored package carries them under one manifest, and this script proves the
 *      restored bytes are the staged bytes before anything compiles against them.
 * Environment: Node 24+, the selected .NET 11 workload, a local directory feed holding the package.
 * Usage: node --import @oxc-node/core/register packages/plugins/picogk/scripts/stage-picogk-package.mts <config.json>
 * Exit codes: 0 when staging passes; non-zero on an invalid input, a changed payload or a failed restore.
 */
/* oxlint-disable no-await-in-loop -- Hash and copy one resource at a time, bounding staging memory. */
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import type { BinaryLike } from 'node:crypto';
import { chmod, copyFile, mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import { isAbsolute, join, relative, resolve } from 'node:path';
import process from 'node:process';
import { z } from 'zod';

const absolute = z.string().refine(isAbsolute, 'Staging paths must be absolute.');
const configSchema = z.object({
  dotnet: absolute,
  nuget: absolute,
  hostRid: z.enum(['osx-arm64', 'osx-x64', 'linux-x64', 'linux-arm64']),
  feed: absolute,
  version: z.string().min(1),
  outputRoot: absolute,
});
/** Only the fields this script consumes; the package's own driver owns the rest. */
const manifestSchema = z.object({
  schemaVersion: z.literal(1),
  version: z.string(),
  toolchain: z.object({ sdk: z.string(), runtime: z.string(), identitySha256: z.string() }),
  compiler: z.object({ patched: z.record(z.string(), z.string()) }),
  references: z.object({ assemblies: z.number(), files: z.record(z.string(), z.string()) }),
  base: z.object({ commit: z.string() }),
  engine: z.record(z.string(), z.object({ inputsSha256: z.string() })),
  generator: z.object({ sha256: z.string() }),
  payload: z.record(z.string(), z.string()),
});
const sha256 = (bytes: BinaryLike): string => createHash('sha256').update(bytes).digest('hex');
const json = async (path: string): Promise<unknown> => JSON.parse(await readFile(path, 'utf8')) as unknown;
const workspaceRoot = resolve(import.meta.dirname, '../../../..');
const pluginRoot = resolve(import.meta.dirname, '..');
/**
 * Tau's own patches bracket PicoVoxel's: the hosted surface comes first, the browser boundary last.
 * That order is part of the managed library's identity, so it is stated here and nowhere else.
 */
const tauPatches = { before: 'PicoGK.hosted.patch', after: 'PicoGK.browser.patch' } as const;

const main = async (): Promise<void> => {
  const [configPath, ...extra] = process.argv.slice(2);
  if (!configPath || extra.length > 0) {
    throw new Error('Usage: stage-picogk-package.mts <config.json>');
  }
  const config = configSchema.parse(await json(resolve(configPath)));
  const outputRelative = relative(join(workspaceRoot, 'out'), config.outputRoot);
  if (!outputRelative || outputRelative.startsWith('..') || isAbsolute(outputRelative)) {
    throw new Error('Package staging output must be a child of this workspace out directory.');
  }
  const packages = join(config.outputRoot, 'packages');
  await mkdir(packages, { recursive: true });
  // A restore project of this script's own making, so no checked-in project can widen the sources.
  const restoreRoot = join(config.outputRoot, 'restore');
  await mkdir(restoreRoot, { recursive: true });
  await writeFile(
    join(restoreRoot, 'nuget.config'),
    `<?xml version="1.0" encoding="utf-8"?>
<configuration>
  <packageSources>
    <clear />
    <add key="picovoxel-local" value="${config.feed}" />
  </packageSources>
  <fallbackPackageFolders>
    <clear />
  </fallbackPackageFolders>
</configuration>
`,
  );
  await writeFile(
    join(restoreRoot, 'Restore.csproj'),
    `<Project Sdk="Microsoft.NET.Sdk">
  <PropertyGroup>
    <TargetFramework>net11.0</TargetFramework>
    <EnableDefaultItems>false</EnableDefaultItems>
  </PropertyGroup>
  <ItemGroup>
    <PackageReference Include="PicoVoxel.PicoGK" Version="${config.version}" />
  </ItemGroup>
</Project>
`,
  );
  execFileSync(config.dotnet, ['restore', 'Restore.csproj', '-nologo', `--packages=${packages}`], {
    cwd: restoreRoot,
    stdio: 'inherit',
  });
  const packageRoot = join(packages, 'picovoxel.picogk', config.version);
  const manifest = manifestSchema.parse(await json(join(packageRoot, 'manifest.json')));
  if (manifest.version !== config.version) {
    throw new Error('The restored package is not the requested version.');
  }
  for (const [path, expected] of Object.entries(manifest.payload)) {
    if (sha256(await readFile(join(packageRoot, path))) !== expected) {
      throw new Error(`The restored payload differs from the packaged payload: ${path}.`);
    }
  }
  const sdk = execFileSync(config.dotnet, ['--version'], { encoding: 'utf8' }).trim();
  if (sdk !== manifest.toolchain.sdk) {
    throw new Error(`The package is qualified against SDK ${manifest.toolchain.sdk}; this host has ${sdk}.`);
  }

  // One composed tree, at the order the managed library's identity depends on.
  const base = join(config.outputRoot, 'base');
  execFileSync(
    'node',
    [
      join(packageRoot, 'base/compose.mjs'),
      base,
      '--patch',
      join(pluginRoot, 'dotnet', tauPatches.before),
      '--patch',
      join(packageRoot, 'base/patches/browser-handles.patch'),
      '--patch',
      join(pluginRoot, 'dotnet', tauPatches.after),
    ],
    { stdio: 'inherit' },
  );

  /**
   * The authoring reference set the runtime compiler compiles against: this install's framework
   * reference assemblies, verified against the package's recorded inventory, plus the one managed
   * dependency the library carries. `PicoGK.dll` is not staged here: it comes from the host build.
   */
  const references = join(config.outputRoot, 'references');
  await mkdir(references, { recursive: true });
  const sdkRoot = resolve(config.dotnet, '..');
  const frameworkRoot = join(sdkRoot, 'packs/Microsoft.NETCore.App.Ref', manifest.toolchain.runtime, 'ref/net11.0');
  const staged: Record<string, string> = {};
  const frameworkEntries = await readdir(frameworkRoot);
  const names = frameworkEntries.filter((name) => name.endsWith('.dll')).sort();
  if (names.length !== manifest.references.assemblies) {
    throw new Error(
      `This install offers ${names.length} framework reference assemblies; the package records ${manifest.references.assemblies}.`,
    );
  }
  for (const name of names) {
    const bytes = await readFile(join(frameworkRoot, name));
    if (sha256(bytes) !== manifest.references.files[name]) {
      throw new Error(`A framework reference assembly differs from the package's inventory: ${name}.`);
    }
    await writeFile(join(references, name), bytes);
    staged[name] = sha256(bytes);
  }
  // NuGet resolves the nearest implementation assembly for net11.0; the receipt records which.
  const propsText = await readFile(join(packageRoot, 'build/PicoVoxel.PicoGK.props'), 'utf8');
  const skiaVersion = /<PicoVoxelPicoGKSkiaSharp>([^<]+)</u.exec(propsText)?.[1];
  if (!skiaVersion) {
    throw new Error("The package's props record no managed dependency version.");
  }
  const skiaPath = join(config.nuget, 'skiasharp', skiaVersion, 'lib/net8.0/SkiaSharp.dll');
  await copyFile(skiaPath, join(references, 'SkiaSharp.dll'));
  staged['SkiaSharp.dll'] = sha256(await readFile(skiaPath));

  const prepareConfig = {
    dotnet: config.dotnet,
    nuget: config.nuget,
    hostRid: config.hostRid,
    packageRoot,
    picoGkProject: join(base, 'PicoGK.csproj'),
    referencesRoot: references,
    outputRoot: join(config.outputRoot, 'host'),
  };
  await writeFile(join(config.outputRoot, 'prepare-host-config.json'), `${JSON.stringify(prepareConfig, null, 2)}\n`);
  const composition = await readFile(join(base, 'composition.json'));
  const receipt = {
    package: `PicoVoxel.PicoGK.${config.version}`,
    manifestSha256: sha256(await readFile(join(packageRoot, 'manifest.json'))),
    payloadFiles: Object.keys(manifest.payload).length + 1,
    base: { commit: manifest.base.commit, compositionSha256: sha256(composition) },
    engine: Object.fromEntries(
      Object.entries(manifest.engine).map(([execution, value]) => [execution, value.inputsSha256]),
    ),
    generatorSha256: manifest.generator.sha256,
    compiler: manifest.compiler.patched,
    toolchainIdentitySha256: manifest.toolchain.identitySha256,
    skiaSharp: { version: skiaVersion, path: 'lib/net8.0/SkiaSharp.dll', sha256: staged['SkiaSharp.dll'] },
    references: staged,
  };
  await writeFile(join(config.outputRoot, 'staging-receipt.json'), `${JSON.stringify(receipt, null, 2)}\n`);
  // Staged assets are inputs to every later step in this build and are never edited in place.
  for (const [directory, entries] of [
    [references, Object.keys(staged)],
    [base, ['PicoGK.csproj', 'composition.json']],
  ] as const) {
    for (const name of entries) {
      await chmod(join(directory, name), 0o444);
    }
  }
  console.log(`Staged ${receipt.package}: ${join(config.outputRoot, 'prepare-host-config.json')}`);
};
await main();
