#!/usr/bin/env node
/**
 * Purpose: Build the C# language server's browser bundle: the Roslyn browser-wasm host, its reference bundle (the
 *   .NET 10 reference pack, Tau's patched PicoGK and SkiaSharp, with stripped XML documentation) and a
 *   content-addressed stage the UI serves.
 * Why: The editor binds C# exactly as the PicoGK compiler does, from pinned inputs, without a system .NET or a
 *   runtime download. See docs/research/csharp-browser-language-server-blueprint.md.
 * Environment: Node 24+, git and network on first run (SDK, NuGet, PicoGK source). TAU_DOTNET may name an existing
 *   SDK 10.0.400 `dotnet` executable instead of the pinned download. CI=true restores NuGet in locked mode.
 * Usage: node --import @oxc-node/core/register apps/libs/csharp-language/scripts/prepare-csharp-language-server.mts
 *   [--references-only]
 *   Writes out/csharp-language/references.bin and, unless --references-only, out/csharp-language/stage/ with
 *   the gzip-compressed bundle.
 * Exit codes: 0 when the stage is current or rebuilt; non-zero on an unsupported host, integrity or build failure.
 */
/* oxlint-disable no-await-in-loop -- Files are hashed and copied one at a time to bound memory. */
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { chmod, cp, mkdir, readFile, readdir, rename, rm, stat, writeFile } from 'node:fs/promises';
import { join, relative, resolve } from 'node:path';
import process from 'node:process';
import { constants, gzipSync } from 'node:zlib';

const dotnetVersion = '10.0.400';
const runtimeVersion = '10.0.11';
const skiaSharpVersion = '3.119.0';
// The PicoGK commit and patch the desktop worker compiles against (apps/desktop/scripts/prepare-picogk-dotnet.mts).
const picoGkCommit = '0e6cf6b6f4993ec16dbcd72d8f27f26b999980f3';
const sdks: Readonly<Record<string, { readonly archive: string; readonly sha512: string }>> = {
  'linux-x64': {
    archive: `dotnet-sdk-${dotnetVersion}-linux-x64.tar.gz`,
    sha512:
      '1033977dd837150e0814cf0c5d5b17ceb63925fda7ba2158b47258a4bd7c048cf82eac3bc1166f3146f53124a3f5fba09db1de1260d2ce96399860303b404b48',
  },
  'darwin-arm64': {
    archive: `dotnet-sdk-${dotnetVersion}-osx-arm64.tar.gz`,
    sha512:
      'e440e9a58d4ff7741c8342ac3e086fa9ee2dadc25e01c0449a88317a74cfbd63625b8092c3b2a131ae14b16ab3401e9cc470e578e4c65a72a0b5786bd2308cde',
  },
};
/** BCL documentation shipped for hover and completion; the rest of the reference pack binds without it. */
const documentedFrameworkAssemblies = [
  'System.Runtime',
  'System.Collections',
  'System.Linq',
  'System.Numerics.Vectors',
  'System.Console',
  'System.ComponentModel.Annotations',
];

const workspaceRoot = resolve(import.meta.dirname, '../../../..');
const projectRoot = resolve(import.meta.dirname, '..');
const dotnetRoot = resolve(projectRoot, 'dotnet');
const outputRoot = resolve(workspaceRoot, 'out/csharp-language');
// Shared with prepare-picogk-dotnet.mts so one machine downloads the pinned SDK once.
const sdkCacheRoot = resolve(workspaceRoot, 'out/cache/picogk');
const picoGkHostedPatch = resolve(workspaceRoot, 'packages/plugins/picogk/dotnet/PicoGK.hosted.patch');
const reproducible = [
  '-p:Deterministic=true',
  '-p:ContinuousIntegrationBuild=true',
  '-p:EnableSourceLink=false',
  '-p:EnableSourceControlManagerQueries=false',
  '-p:IncludeSourceRevisionInInformationalVersion=false',
  '-p:DeterministicSourcePaths=false',
  `-p:PathMap=${workspaceRoot}/=/_/`,
];

const sha = (bytes: Uint8Array, algorithm: 'sha256' | 'sha512' = 'sha256'): string =>
  createHash(algorithm).update(bytes).digest('hex');

const exists = async (path: string): Promise<boolean> => {
  try {
    await stat(path);
    return true;
  } catch {
    return false;
  }
};

const run = (command: string, args: readonly string[], cwd: string): void => {
  execFileSync(command, args, {
    cwd,
    stdio: 'inherit',
    // eslint-disable-next-line @typescript-eslint/naming-convention -- environment variables are not camelCase
    env: {
      ...process.env,
      DOTNET_CLI_TELEMETRY_OPTOUT: '1',
      DOTNET_NOLOGO: '1',
      DOTNET_SKIP_FIRST_TIME_EXPERIENCE: '1',
    },
  });
};

/** Resolve the pinned SDK: TAU_DOTNET when it reports the pinned version, else the verified download. */
const ensureDotnet = async (): Promise<string> => {
  const override = process.env['TAU_DOTNET'];
  if (override) {
    const version = execFileSync(override, ['--version'], { encoding: 'utf8' }).trim();
    if (version !== dotnetVersion) {
      throw new Error(`TAU_DOTNET reports SDK ${version}; the C# language server pins ${dotnetVersion}.`);
    }
    return override;
  }
  const target = `${process.platform}-${process.arch}`;
  const sdk = sdks[target];
  if (!sdk) {
    throw new Error(`No pinned .NET SDK for ${target}; set TAU_DOTNET to a ${dotnetVersion} SDK.`);
  }
  const root = resolve(sdkCacheRoot, `dotnet-${dotnetVersion}-${target}`);
  const marker = resolve(root, '.tau-dotnet-archive-sha512');
  if (!(await exists(marker)) || (await readFile(marker, 'utf8')).trim() !== sdk.sha512) {
    await mkdir(sdkCacheRoot, { recursive: true });
    const archive = resolve(sdkCacheRoot, sdk.archive);
    if (!(await exists(archive)) || sha(await readFile(archive), 'sha512') !== sdk.sha512) {
      const response = await fetch(`https://builds.dotnet.microsoft.com/dotnet/Sdk/${dotnetVersion}/${sdk.archive}`);
      if (!response.ok) {
        throw new Error(`.NET SDK download failed with HTTP ${String(response.status)}`);
      }
      const bytes = new Uint8Array(await response.arrayBuffer());
      if (sha(bytes, 'sha512') !== sdk.sha512) {
        throw new Error('.NET SDK integrity mismatch');
      }
      await writeFile(archive, bytes);
    }
    const temporary = `${root}.${String(process.pid)}.tmp`;
    await rm(temporary, { recursive: true, force: true });
    await mkdir(temporary, { recursive: true });
    execFileSync('tar', ['-xzf', archive, '-C', temporary]);
    await writeFile(resolve(temporary, '.tau-dotnet-archive-sha512'), `${sdk.sha512}\n`);
    await rm(root, { recursive: true, force: true });
    await rename(temporary, root);
  }
  const dotnet = resolve(root, 'dotnet');
  await chmod(dotnet, 0o755);
  return dotnet;
};

/** Fetch the pinned PicoGK commit by its content hash and apply Tau's hosted patch once. */
const ensurePicoGkSource = async (): Promise<string> => {
  const patchSha256 = sha(await readFile(picoGkHostedPatch));
  const root = resolve(outputRoot, 'cache', `PicoGK-${picoGkCommit}`);
  const markerPath = resolve(root, '.tau-picogk-hosted-source');
  const expected = `${picoGkCommit}:${patchSha256}`;
  if ((await exists(markerPath)) && (await readFile(markerPath, 'utf8')).trim() === expected) {
    return root;
  }
  const temporary = `${root}.${String(process.pid)}.tmp`;
  await rm(temporary, { recursive: true, force: true });
  await mkdir(temporary, { recursive: true });
  run('git', ['init', '--quiet'], temporary);
  run('git', ['fetch', '--quiet', '--depth', '1', 'https://github.com/leap71/PicoGK', picoGkCommit], temporary);
  run('git', ['-c', 'advice.detachedHead=false', 'checkout', '--quiet', 'FETCH_HEAD'], temporary);
  const head = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: temporary, encoding: 'utf8' }).trim();
  if (head !== picoGkCommit) {
    throw new Error(`PicoGK checkout is ${head}, expected ${picoGkCommit}.`);
  }
  run('git', ['apply', '--whitespace=error-all', picoGkHostedPatch], temporary);
  await rm(resolve(temporary, '.git'), { recursive: true, force: true });
  await writeFile(markerPath.replace(root, temporary), `${expected}\n`);
  await rm(root, { recursive: true, force: true });
  await rename(temporary, root);
  return root;
};

const strippedSections =
  'remarks|example|exception|seealso|permission|threadsafety|related|altmember|forInternalUseOnly';

/**
 * Keep the documentation hover, completion and declarations show (summary, parameters, returns): drop long-form
 * sections and indentation. The XML is compiler-generated, so these elements are balanced and never self-nested.
 */
export const stripDocumentation = (xml: string): string =>
  xml
    .replaceAll(new RegExp(`<(${strippedSections})\\b[^>]*/>`, 'gu'), '')
    .replaceAll(new RegExp(`<(${strippedSections})\\b[^>]*>[\\s\\S]*?</\\1>`, 'gu'), '')
    .replaceAll(/\n\s+/gu, '\n');

/** Serialize the reference bundle format read by ReferenceSet.FromBundle. */
export const writeReferenceBundle = (
  entries: ReadonlyArray<{ readonly name: string; readonly image: Uint8Array; readonly documentation?: Uint8Array }>,
): Uint8Array<ArrayBuffer> => {
  const sorted = [...entries].sort((left, right) => (left.name < right.name ? -1 : left.name > right.name ? 1 : 0));
  const header = new TextEncoder().encode(
    `${sorted
      .map((entry) => `${entry.name}\t${String(entry.image.length)}\t${String(entry.documentation?.length ?? 0)}`)
      .join('\n')}\n\n`,
  );
  const total = sorted.reduce(
    (sum, entry) => sum + entry.image.length + (entry.documentation?.length ?? 0),
    header.length,
  );
  const bundle = new Uint8Array(total);
  bundle.set(header, 0);
  let offset = header.length;
  for (const entry of sorted) {
    bundle.set(entry.image, offset);
    offset += entry.image.length;
    if (entry.documentation) {
      bundle.set(entry.documentation, offset);
      offset += entry.documentation.length;
    }
  }
  return bundle;
};

const buildReferences = async (dotnet: string): Promise<Uint8Array<ArrayBuffer>> => {
  const picoGk = await ensurePicoGkSource();
  const picoGkOutput = resolve(outputRoot, 'picogk-reference');
  await rm(picoGkOutput, { recursive: true, force: true });
  run(
    dotnet,
    [
      'build',
      resolve(picoGk, 'PicoGK.csproj'),
      '-c',
      'Release',
      '-o',
      picoGkOutput,
      '-p:GeneratePackageOnBuild=false',
      '-p:TreatWarningsAsErrors=false',
      ...reproducible,
    ],
    picoGk,
  );
  const sdkRoot = resolve(dotnet, '..');
  const referencePack = resolve(sdkRoot, 'packs/Microsoft.NETCore.App.Ref', runtimeVersion, 'ref/net10.0');
  const entries: Array<{ name: string; image: Uint8Array; documentation?: Uint8Array }> = [];
  const encode = (text: string): Uint8Array => new TextEncoder().encode(text);
  for (const name of (await readdir(referencePack)).filter((file) => file.endsWith('.dll')).sort()) {
    const assembly = name.slice(0, -'.dll'.length);
    const documentation = documentedFrameworkAssemblies.includes(assembly)
      ? encode(stripDocumentation(await readFile(resolve(referencePack, `${assembly}.xml`), 'utf8')))
      : undefined;
    entries.push({ name, image: await readFile(resolve(referencePack, name)), documentation });
  }
  entries.push({
    name: 'PicoGK.dll',
    image: await readFile(resolve(picoGkOutput, 'PicoGK.dll')),
    documentation: encode(stripDocumentation(await readFile(resolve(picoGkOutput, 'PicoGK.xml'), 'utf8'))),
  });
  const nuget = process.env['NUGET_PACKAGES'] ?? resolve(process.env['HOME'] ?? '', '.nuget/packages');
  entries.push({
    name: 'SkiaSharp.dll',
    image: await readFile(resolve(nuget, 'skiasharp', skiaSharpVersion, 'lib/net8.0/SkiaSharp.dll')),
  });
  return writeReferenceBundle(entries);
};

const listFiles = async (root: string): Promise<string[]> => {
  const files: string[] = [];
  for (const entry of await readdir(root, { withFileTypes: true, recursive: true })) {
    if (entry.isFile()) {
      files.push(relative(root, join(entry.parentPath, entry.name)).replaceAll('\\', '/'));
    }
  }
  return files.sort();
};

const main = async (): Promise<void> => {
  const referencesOnly = process.argv.includes('--references-only');
  const dotnet = await ensureDotnet();
  await mkdir(outputRoot, { recursive: true });
  const restore = process.env['CI'] === 'true' ? ['--locked-mode'] : [];
  const references = await buildReferences(dotnet);
  await writeFile(resolve(outputRoot, 'references.bin'), references);
  console.log(`C# reference bundle: ${String(references.length)} bytes, sha256 ${sha(references)}`);
  if (referencesOnly) {
    return;
  }
  const publish = resolve(outputRoot, 'publish');
  await rm(publish, { recursive: true, force: true });
  run(dotnet, ['restore', ...restore], resolve(dotnetRoot, 'Tau.CSharp.LanguageServer.Browser'));
  run(
    dotnet,
    ['publish', '-c', 'Release', '--no-restore', '-o', publish, ...reproducible],
    resolve(dotnetRoot, 'Tau.CSharp.LanguageServer.Browser'),
  );
  const framework = resolve(publish, 'wwwroot/_framework');
  const stage = resolve(outputRoot, 'stage');
  const temporary = `${stage}.${String(process.pid)}.tmp`;
  await rm(temporary, { recursive: true, force: true });
  await cp(framework, resolve(temporary, '_framework'), { recursive: true });
  // Static hosts do not reliably compress octet streams; the worker inflates the bundle with DecompressionStream.
  await writeFile(
    resolve(temporary, 'references.bin.gz'),
    gzipSync(references, { level: constants.Z_BEST_COMPRESSION }),
  );
  const files = [];
  for (const path of await listFiles(temporary)) {
    const bytes = await readFile(resolve(temporary, path));
    files.push({ path, sha256: sha(bytes), byteLength: bytes.length });
  }
  const manifest = {
    format: 'tau-csharp-language-v1',
    toolchain: { sdk: dotnetVersion, runtime: runtimeVersion, picoGk: picoGkCommit },
    bootstrap: '_framework/dotnet.js',
    references: 'references.bin.gz',
    files,
  };
  await writeFile(resolve(temporary, 'assets-manifest.json'), `${JSON.stringify(manifest, undefined, 2)}\n`);
  await rm(stage, { recursive: true, force: true });
  await rename(temporary, stage);
  const total = files.reduce((sum, file) => sum + file.byteLength, 0);
  console.log(
    `C# language stage: ${String(files.length)} files, ${String(total)} bytes at ${relative(workspaceRoot, stage)}`,
  );
};

if (import.meta.main) {
  await main();
}
