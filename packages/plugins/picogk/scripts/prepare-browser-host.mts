#!/usr/bin/env node
/**
 * Purpose: Build and stage a content-identified PicoGK browser host from qualified inputs.
 * Why: Browser execution must use the same verified workload/archive pair, without research-path dependencies.
 * Environment: Node 24+, the selected .NET 11 workload, prepared archives, patched PicoGK/Roslyn and retention inputs.
 * Usage: node --import @oxc-node/core/register packages/plugins/picogk/scripts/prepare-browser-host.mts <config.json>
 * Exit codes: 0 when preparation passes; non-zero on an invalid input, changed identity or failed build.
 */
/* oxlint-disable no-await-in-loop -- Hash and copy one resource at a time, bounding preparation memory. */
import { deepStrictEqual } from 'node:assert';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import type { BinaryLike } from 'node:crypto';
import { copyFile, mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import { isAbsolute, join, relative, resolve } from 'node:path';
import process from 'node:process';
import { pathToFileURL } from 'node:url';
import { z } from 'zod';
/* oxlint-disable no-restricted-imports -- The preparation script's sibling module; scripts have no `#` alias. */
import {
  patchBrowserThreadMailbox,
  patchBrowserThreadStartup,
  patchBrowserThreadMemory,
  bindBrowserThreadStartup,
} from './browser-thread-startup.mjs';
/* oxlint-enable no-restricted-imports */
import { picogkBrowserProtocolVersion } from '#picogk.protocol.js';
import { picogkBrowserManifestSchema } from '#picogk-browser-assets.js';

const absolute = z.string().refine(isAbsolute, 'Preparation paths must be absolute.');
const configSchema = z.object({
  dotnet: absolute,
  nuget: absolute,
  hostRid: z.enum(['osx-arm64', 'osx-x64', 'linux-x64', 'linux-arm64']),
  validatorRoot: absolute,
  archiveRoot: absolute,
  threadedArchiveRoot: absolute.optional(),
  picoGkProject: absolute,
  roslynRoot: absolute,
  retentionProps: absolute,
  referencesRoot: absolute,
  outputRoot: absolute,
});
const sha256 = (bytes: BinaryLike): string => createHash('sha256').update(bytes).digest('hex');
const json = async (path: string): Promise<unknown> => JSON.parse(await readFile(path, 'utf8')) as unknown;
const workspaceRoot = resolve(import.meta.dirname, '../../../..');
const projectRoot = resolve(import.meta.dirname, '../dotnet/Tau.PicoGK.Browser');
const names = ['float-trig.o', 'libblosc.a', 'libopenvdb.a', 'libtbb.a', 'libz.a', 'picogk.26.2.a'];
type PreparationConfig = z.output<typeof configSchema>;
const prepareVariant = async (
  config: PreparationConfig,
  execution: 'serial' | 'threaded',
  archiveRoot: string,
): Promise<z.output<typeof picogkBrowserManifestSchema>['single']> => {
  const prefix = execution === 'serial' ? '' : 'multi/';
  const receiptBytes = await readFile(join(archiveRoot, 'inputs.json'));
  const receipt = z
    .object({
      execution: z.literal(execution),
      driverSha256: z.string(),
      globalJsonSha256: z.string(),
      projectSha256: z.string(),
      pinsSha256: z.string(),
      toolchain: z.unknown(),
    })
    .parse(JSON.parse(new TextDecoder().decode(receiptBytes)));
  // Reuse the qualified validator rather than maintaining a second compiler-probing implementation.
  const validatorFiles = [
    ['validate-inputs.mjs', receipt.driverSha256],
    ['global.json', receipt.globalJsonSha256],
    ['toolchain.csproj', receipt.projectSha256],
    ['inputs.json', receipt.pinsSha256],
  ] as const;
  for (const [name, expected] of validatorFiles) {
    if (sha256(await readFile(join(config.validatorRoot, name))) !== expected) {
      throw new Error(`Qualified toolchain validator input changed: ${name}.`);
    }
  }
  const validator = z
    .object({
      toolchainIdentity: z.function({
        input: z.tuple([z.string(), z.string(), z.string(), z.literal(execution)]),
        output: z.unknown(),
      }),
    })
    .parse(await import(pathToFileURL(join(config.validatorRoot, 'validate-inputs.mjs')).href));
  const actual = validator.toolchainIdentity(config.dotnet, config.nuget, config.hostRid, execution);
  deepStrictEqual(actual, receipt.toolchain, 'The browser host toolchain differs from the archive toolchain.');
  const inputReceipt = sha256(receiptBytes);
  for (const name of names) {
    const metadata = z
      .object({
        execution: z.literal(execution),
        emscripten: z.literal('6.0.3'),
        emscriptenRevision: z.literal('6ea9c28c38cdd40c1032fa04400c9d16230ee180'),
        runtime: z.literal('11.0.0-rc.3.26522.148'),
        sha256: z.string(),
        inputsSha256: z.literal(inputReceipt),
      })
      .parse(await json(join(archiveRoot, `${name}.metadata.json`)));
    if (sha256(await readFile(join(archiveRoot, 'native', name))) !== metadata.sha256) {
      throw new Error(`Browser archive bytes changed: ${name}.`);
    }
  }
  await mkdir(config.outputRoot, { recursive: true });
  const artifacts = execution === 'serial' ? config.outputRoot : join(config.outputRoot, 'threaded');
  execFileSync(
    config.dotnet,
    [
      'publish',
      'Tau.PicoGK.Browser.csproj',
      '-c',
      'Release',
      '--artifacts-path',
      artifacts,
      `-p:WasmEnableThreads=${execution === 'threaded'}`,
      `-p:PicoGKProject=${config.picoGkProject}`,
      `-p:TauPicoGKRoslynRoot=${config.roslynRoot}`,
      `-p:TauPicoGKArchiveRoot=${join(archiveRoot, 'native')}`,
      `-p:TauPicoGKRetentionProps=${config.retentionProps}`,
    ],
    { cwd: projectRoot, stdio: 'inherit' },
  );
  const publish = join(artifacts, 'publish', 'Tau.PicoGK.Browser', 'release', 'wwwroot');
  const bundle = join(config.outputRoot, 'bundle');
  let bootstrap = await readFile(join(publish, '_framework', 'dotnet.js'), 'utf8');
  const embedded = /\/\*json-start\*\/([\s\S]*?)\/\*json-end\*\//u.exec(bootstrap)?.[1];
  if (!embedded) {
    throw new Error('The qualified .NET bootstrap configuration is missing.');
  }
  const overrides = new Map<string, Uint8Array<ArrayBuffer>>();
  if (execution === 'threaded') {
    const configuration = z
      .object({
        resources: z.object({
          jsModuleNative: z.array(z.object({ name: z.string() })).length(1),
          jsModuleRuntime: z.array(z.object({ name: z.string() })).length(1),
        }),
      })
      .parse(JSON.parse(embedded));
    const nativeName = configuration.resources.jsModuleNative[0]!.name;
    if (!/^dotnet\.native\.[\w-]+\.js$/u.test(nativeName)) {
      throw new Error('The qualified .NET native module name changed.');
    }
    const native = patchBrowserThreadMailbox(
      patchBrowserThreadStartup(await readFile(join(publish, '_framework', nativeName), 'utf8')),
    );
    const bound = bindBrowserThreadStartup(bootstrap, native);
    bootstrap = bound.bootstrap;
    overrides.set(`_framework/${bound.name}`, new TextEncoder().encode(native));
    const runtimeName = configuration.resources.jsModuleRuntime[0]!.name;
    if (!/^dotnet\.runtime\.[\w-]+\.js$/u.test(runtimeName)) {
      throw new Error('The qualified .NET runtime module name changed.');
    }
    const runtime = patchBrowserThreadMemory(await readFile(join(publish, '_framework', runtimeName), 'utf8'));
    const runtimeBound = bindBrowserThreadStartup(bootstrap, runtime, 'runtime');
    bootstrap = runtimeBound.bootstrap;
    overrides.set(`_framework/${runtimeBound.name}`, new TextEncoder().encode(runtime));
    overrides.set('_framework/dotnet.js', new TextEncoder().encode(bootstrap));
  }
  const resources = new Set(['dotnet.js']);
  const collect = (value: unknown): void => {
    if (typeof value !== 'object' || value === null) {
      return;
    }
    if ('name' in value && typeof value.name === 'string') {
      resources.add(value.name);
    }
    for (const child of Object.values(value)) {
      collect(child);
    }
  };
  const configuration = /\/\*json-start\*\/([\s\S]*?)\/\*json-end\*\//u.exec(bootstrap)![1]!;
  collect(z.object({ resources: z.unknown() }).parse(JSON.parse(configuration)).resources);
  const copy = async (source: string, path: string): Promise<{ path: string; sha256: string; byteLength: number }> => {
    if (!/^[\w./-]+$/u.test(path) || path.split('/').some((part) => !part || part === '.' || part === '..')) {
      throw new Error('Invalid generated browser asset path.');
    }
    const bytes = overrides.get(path) ?? (await readFile(source));
    const target = join(bundle, prefix, path);
    await mkdir(resolve(target, '..'), { recursive: true });
    await writeFile(target, bytes);
    return { path: `${prefix}${path}`, sha256: sha256(bytes), byteLength: bytes.length };
  };
  const runtimeFiles = [];
  for (const name of [...resources].sort()) {
    runtimeFiles.push(await copy(join(publish, '_framework', name), `_framework/${name}`));
  }
  const references = [];
  const referenceNames = await readdir(config.referencesRoot);
  for (const name of referenceNames.filter((name) => name.endsWith('.dll')).sort()) {
    // PicoGK must come from this build, not an older authoring reference directory.
    if (name === 'PicoGK.dll') {
      continue;
    }
    references.push(await copy(join(config.referencesRoot, name), `refs/${name}`));
  }
  const libraryName = z
    .string()
    .parse(config.picoGkProject.split('/').at(-1))
    .replace(/\.csproj$/u, '');
  references.push(await copy(join(artifacts, 'bin', libraryName, 'release', 'PicoGK.dll'), 'refs/PicoGK.dll'));
  await copyFile(join(archiveRoot, 'inputs.json'), join(artifacts, 'archive-inputs.json'));
  return {
    archiveInputReceipt: inputReceipt,
    bootstrap: `${prefix}_framework/dotnet.js`,
    compilerIdentity: sha256(new TextEncoder().encode(JSON.stringify({ runtimeFiles, references }))),
    runtimeFiles,
    references,
  };
};
const main = async (): Promise<void> => {
  const [configPath, ...extra] = process.argv.slice(2);
  if (!configPath || extra.length > 0) {
    throw new Error('Usage: prepare-browser-host.mts <config.json>');
  }
  const config = configSchema.parse(await json(resolve(configPath)));
  const outputRelative = relative(join(workspaceRoot, 'out'), config.outputRoot);
  if (!outputRelative || outputRelative.startsWith('..') || isAbsolute(outputRelative)) {
    throw new Error('Browser preparation output must be a child of this workspace out directory.');
  }
  const single = await prepareVariant(config, 'serial', config.archiveRoot);
  const multi = config.threadedArchiveRoot
    ? await prepareVariant(config, 'threaded', config.threadedArchiveRoot)
    : undefined;
  const bundle = join(config.outputRoot, 'bundle');
  const manifest = picogkBrowserManifestSchema.parse({
    format: 'tau-picogk-browser-v2',
    protocolVersion: picogkBrowserProtocolVersion,
    toolchain: {
      sdk: '11.0.100-rc.3.26522.148',
      workload: '11.0.100-rc.3.26524.4',
      emscriptenPackage: '6.0.2',
      emscriptenCompiler: '6.0.3',
      emscriptenRevision: '6ea9c28c38cdd40c1032fa04400c9d16230ee180',
    },
    single,
    ...(multi ? { multi } : {}),
  });
  const bytes = new TextEncoder().encode(JSON.stringify(manifest));
  await writeFile(join(bundle, 'assets-manifest.json'), bytes);
  await writeFile(
    join(bundle, 'assets-receipt.json'),
    JSON.stringify({ url: './assets-manifest.json', sha256: sha256(bytes) }),
  );
  console.log(`Prepared PicoGK browser assets: ${bundle}`);
};
await main();
