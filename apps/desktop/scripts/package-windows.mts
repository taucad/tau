#!/usr/bin/env node
/**
 * Purpose: Make a per-user NSIS installer from the existing staged Windows application.
 * Environment: Windows x64; TAU_WINDOWS_APP_DIR, DESKTOP_RELEASE_TAG, TAU_DESKTOP_SOURCE_SHA,
 * TAU_WINDOWS_PUBLISHER (complete certificate subject), TAU_WINDOWS_SIGNTOOL, TAU_WINDOWS_SIGNING_DLIB,
 * TAU_WINDOWS_SIGNING_METADATA. Signing paths are protected CI inputs, never renderer input.
 * Optional: TAU_DESKTOP_PACKAGE_OUTPUT_ROOT; --unsigned permits isolated CI assembly only.
 * Usage: pnpm nx run desktop:make-windows-installer --args=--unsigned
 * Exit: nonzero on missing identity, signing/verification failure or unexpected installer bytes.
 */
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { cp, mkdir, readFile, readdir, realpath, stat, writeFile } from 'node:fs/promises';
import { isAbsolute, join, resolve } from 'node:path';

import { extractFile } from '@electron/asar';
import { build, Platform } from 'electron-builder';
import { z } from 'zod';

import { desktopArtifactName, desktopReleaseIdentity } from '#shared/desktop-release.js';
import { verifyWindowsSignature } from '#main/windows-signature.js';

const required = (name: string): string => {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing ${name}`);
  }
  return value;
};

const sha256 = async (path: string): Promise<string> => {
  const hash = createHash('sha256');
  for await (const chunk of createReadStream(path)) {
    hash.update(Buffer.from(chunk));
  }
  return hash.digest('hex');
};

/* oxlint-disable no-await-in-loop -- Sign and inspect the PE closure serially to bound memory and signing-service requests. */
const main = async (): Promise<void> => {
  if (process.platform !== 'win32' || process.arch !== 'x64') {
    throw new Error('NSIS assembly requires a Windows x64 host');
  }
  const args = process.argv.slice(2);
  if (args.length > 1 || (args.length === 1 && args[0] !== '--unsigned')) {
    throw new Error('Expected no arguments or --unsigned for isolated assembly tests');
  }
  const unsigned = args[0] === '--unsigned';
  const tag = required('DESKTOP_RELEASE_TAG');
  const identity = desktopReleaseIdentity(tag);
  const sourceCommit = required('TAU_DESKTOP_SOURCE_SHA');
  if (!/^[a-f\d]{40}$/u.test(sourceCommit)) {
    throw new Error('Expected complete source commit');
  }
  const publisher = unsigned ? undefined : required('TAU_WINDOWS_PUBLISHER');
  const signing = unsigned
    ? undefined
    : {
        tool: required('TAU_WINDOWS_SIGNTOOL'),
        library: required('TAU_WINDOWS_SIGNING_DLIB'),
        metadata: required('TAU_WINDOWS_SIGNING_METADATA'),
      };
  if (signing && Object.values(signing).some((path) => !isAbsolute(path))) {
    throw new Error('Signing tool, library and metadata paths must be absolute');
  }
  const desktopRoot = resolve(import.meta.dirname, '..');
  const input = await realpath(required('TAU_WINDOWS_APP_DIR'));
  const stagedIdentity = z
    .object({
      version: z.string(),
      tauDesktop: z.object({
        channel: z.enum(['staging', 'production']).optional(),
        sourceCommit: z.string(),
        environmentOverrides: z.boolean().optional(),
      }),
    })
    .parse(JSON.parse(extractFile(join(input, 'resources/app.asar'), 'package.json').toString('utf8')));
  if (
    stagedIdentity.version !== identity.version ||
    (stagedIdentity.tauDesktop.channel ?? 'production') !== identity.channel ||
    stagedIdentity.tauDesktop.sourceCommit !== sourceCommit ||
    stagedIdentity.tauDesktop.environmentOverrides
  ) {
    throw new Error('Prepackaged application version, channel, source or release hardening disagrees with candidate');
  }
  const output = resolve(process.env['TAU_DESKTOP_PACKAGE_OUTPUT_ROOT'] ?? join(desktopRoot, 'package-out/nsis'));
  if (input === output || output.startsWith(input + '\\')) {
    throw new Error('Installer output must not overwrite the staged input');
  }
  // Check the existing vendored-license owner before producing any distributable.
  execFileSync(
    process.execPath,
    [resolve(desktopRoot, '../../packages/plugins/tscircuit/check-vendored-licenses.mjs')],
    { stdio: 'inherit' },
  );
  const stage = join(output, 'app');
  await mkdir(output, { recursive: true });
  // An exclusive directory avoids mixing a previous candidate with this one.
  await mkdir(stage);
  await cp(input, stage, { recursive: true, errorOnExist: true });
  const cache = identity.channel === 'staging' ? 'tau-staging-updater' : 'tau-updater';
  const appId = identity.channel === 'staging' ? 'com.taucad.tau.staging' : 'com.taucad.tau';
  const name = identity.channel === 'staging' ? 'Tau Staging' : 'Tau';
  await writeFile(
    join(stage, 'resources', 'desktop-installation.json'),
    JSON.stringify({
      schemaVersion: 1,
      route: 'windows-nsis',
      ...identity,
      tag,
      sourceCommit,
      arch: 'x64',
      trust: unsigned ? 'test' : 'release',
      publisher: publisher ?? null,
      cache,
    }) + '\n',
  );
  // --prepackaged skips builder's afterPack/config injection. JSON is valid YAML.
  await writeFile(
    join(stage, 'resources', 'app-update.yml'),
    JSON.stringify({
      updaterCacheDirName: cache,
      publisherName: publisher ? [publisher] : [],
    }) + '\n',
  );
  const signed: Array<{ path: string; sha256: string }> = [];
  const sign = async (path: string): Promise<void> => {
    if (!signing || !publisher) {
      throw new Error('Signing was requested without a configured publisher');
    }
    execFileSync(
      signing.tool,
      [
        'sign',
        '/v',
        '/fd',
        'SHA256',
        '/tr',
        'http://timestamp.acs.microsoft.com',
        '/td',
        'SHA256',
        '/dlib',
        signing.library,
        '/dmdf',
        signing.metadata,
        path,
      ],
      { stdio: 'inherit', timeout: 120_000 },
    );
    await verifyWindowsSignature({ path, publisher });
    signed.push({ path, sha256: await sha256(path) });
  };
  const peFiles: string[] = [];
  const visit = async (directory: string): Promise<void> => {
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      const path = join(directory, entry.name);
      if (entry.isSymbolicLink()) {
        throw new Error(`Unexpected link in Windows application: ${path}`);
      }
      if (entry.isDirectory()) {
        await visit(path);
      } else if (/\.(?:exe|dll|node)$/iu.test(entry.name)) {
        const bytes = await readFile(path);
        if (bytes[0] !== 0x4d || bytes[1] !== 0x5a) {
          throw new Error(`Expected PE image: ${path}`);
        }
        peFiles.push(path);
      }
    }
  };
  await visit(stage);
  if (!peFiles.includes(join(stage, 'Tau.exe'))) {
    throw new Error('Staged application has no Tau.exe');
  }
  // Sign the prepackaged PE closure ourselves; builder skips this phase.
  for (const path of peFiles) {
    if (!unsigned) {
      await sign(path);
    }
  }
  const artifactName = desktopArtifactName({ kind: 'windows-nsis', ...identity, arch: 'x64' });
  const project = join(output, 'maker-project');
  await mkdir(project);
  await writeFile(
    join(project, 'package.json'),
    JSON.stringify({
      name: 'tau-desktop',
      version: identity.version,
      description: 'Tau desktop CAD workspace',
      author: 'Tau',
      license: 'Apache-2.0',
    }),
  );
  const scheme = identity.channel === 'staging' ? 'tau-staging' : 'tau';
  const protocolKey = `Software\\Classes\\${scheme}`;
  const protocolInclude = join(project, 'tau-protocol.nsh');
  // NSIS does not consume electron-builder's top-level protocols option.
  // Remove only our exact command so uninstalling an older location cannot steal a newer handler.
  await writeFile(
    protocolInclude,
    String.raw`!macro customInstall
  WriteRegStr HKCU "${protocolKey}" "" "URL:${name}"
  WriteRegStr HKCU "${protocolKey}" "URL Protocol" ""
  WriteRegStr HKCU "${protocolKey}\shell\open\command" "" '"$INSTDIR\Tau.exe" "%1"'
!macroend
!macro customUnInstall
  Push $0
  ReadRegStr $0 HKCU "${protocolKey}\shell\open\command" ""
  StrCmp $0 '"$INSTDIR\Tau.exe" "%1"' 0 +2
  DeleteRegKey HKCU "${protocolKey}"
  Pop $0
!macroend
`,
  );
  const electronMetadata = z
    .object({ version: z.string() })
    .parse(JSON.parse(await readFile(join(desktopRoot, 'node_modules/electron/package.json'), 'utf8')));
  const artifacts = await build({
    projectDir: project,
    prepackaged: stage,
    targets: Platform.WINDOWS.createTarget(['nsis']),
    publish: 'never',
    config: {
      appId,
      electronVersion: electronMetadata.version,
      productName: name,
      executableName: 'Tau',
      artifactName,
      directories: { output },
      extraMetadata: { version: identity.version },
      forceCodeSigning: !unsigned,
      npmRebuild: false,
      publish: null,
      win: {
        target: ['nsis'],
        icon: join(desktopRoot, 'resources/icon.ico'),
        requestedExecutionLevel: 'asInvoker',
        signExecutable: !unsigned,
        ...(unsigned
          ? {}
          : {
              signtoolOptions: {
                publisherName: publisher,
                signingHashAlgorithms: ['sha256'],
                sign: async (configuration) => sign(configuration.path),
              },
            }),
      },
      nsis: {
        include: protocolInclude,
        uninstallDisplayName: name,
        oneClick: true,
        perMachine: false,
        allowElevation: false,
        packElevateHelper: false,
        deleteAppDataOnUninstall: false,
        runAfterFinish: false,
        createDesktopShortcut: false,
        createStartMenuShortcut: true,
        shortcutName: name,
      },
    },
  });
  const installer = join(output, artifactName);
  const installerMetadata = await stat(installer);
  if (!artifacts.map((path) => resolve(path)).includes(installer) || !installerMetadata.isFile()) {
    throw new Error('NSIS maker did not produce the expected installer');
  }
  if (publisher) {
    await verifyWindowsSignature({
      path: installer,
      publisher,
      expectedVersion: identity.version,
      expectedProductName: name,
    });
  }
  await writeFile(
    join(output, 'windows-assembly.json'),
    JSON.stringify(
      {
        schemaVersion: 1,
        tag,
        ...identity,
        sourceCommit,
        trust: unsigned ? 'test' : 'release',
        installer: { name: artifactName, sha256: await sha256(installer) },
        peFiles: peFiles.length,
        signed,
      },
      null,
      2,
    ) + '\n',
  );
};

/* oxlint-enable no-await-in-loop -- End serial signing boundary. */
try {
  await main();
} catch (error) {
  console.error('Windows installer assembly failed:', error);
  process.exit(1);
}
