/** Create and inspect an install container without changing the finalized updater app. */
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { lstat, mkdir, mkdtemp, readdir, readlink, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { basename, join, resolve } from 'node:path';

export type MacosDmgTrust = {
  readonly signed: boolean;
  readonly notarized: boolean;
  readonly team?: string;
  readonly developerId?: boolean;
};
export type MacosDmgOptions = {
  readonly appPath: string;
  readonly dmgPath: string;
  readonly trust: MacosDmgTrust;
};

/** Window backdrop and pinned layout builder, both checked in beside the app icon. */
const dmgResources = resolve(import.meta.dirname, '../resources/dmg');

/** Name of the install shortcut, the volume's link to `/Applications`. */
const applicationsLink = 'Applications';

/**
 * Finder window layout of the install container, in camelCase; `dmgbuild` receives the same keys in
 * snake_case. Icon centres match the drawing in `resources/dmg/background.svg` (660×400 points); the
 * window adds Finder's title bar.
 */
export const macosDmgLayout = (appPath: string) =>
  ({
    format: 'UDZO',
    filesystem: 'HFS+',
    files: [appPath],
    symlinks: Object.fromEntries([[applicationsLink, '/Applications']]),
    background: join(dmgResources, 'background.png'),
    windowRect: [
      [200, 120],
      [660, 428],
    ],
    defaultView: 'icon-view',
    showStatusBar: false,
    showTabView: false,
    showToolbar: false,
    showPathbar: false,
    showSidebar: false,
    iconSize: 128,
    textSize: 13,
    iconLocations: Object.fromEntries([
      [basename(appPath), [165, 186]],
      [applicationsLink, [495, 186]],
    ]) as Record<string, readonly [number, number]>,
  }) as const;

/**
 * Install the hash-pinned `dmgbuild` wheels into a throwaway environment. It writes the
 * window's `.DS_Store` without driving Finder; `uv` is installed by every DMG-building job.
 */
const prepareDmgbuild = (scratch: string, execute: typeof run): string => {
  const environment = join(scratch, 'dmgbuild-env');
  execute('uv', ['venv', '--quiet', '--no-project', '--python', '>=3.10', environment]);
  const python = join(environment, 'bin/python');
  execute('uv', [
    'pip',
    'install',
    '--quiet',
    '--python',
    python,
    '--require-hashes',
    '--no-deps',
    '--only-binary',
    ':all:',
    '-r',
    join(dmgResources, 'requirements.txt'),
  ]);
  return python;
};

/** `dmgbuild` copies files with `ditto`, so the signed app keeps its signature; verification re-proves it. */
const buildDmgScript = `import json, re, sys
from dmgbuild import build_dmg
layout = json.loads(sys.argv[2])
settings = {re.sub(r"[A-Z]", lambda m: "_" + m.group(0).lower(), key): value for key, value in layout.items()}
build_dmg(sys.argv[1], "Tau", settings=settings)
`;

/** Run an Apple system tool without shell interpolation. */
const run = (command: string, arguments_: readonly string[]): string =>
  execFileSync(command, arguments_, { encoding: 'utf8', maxBuffer: 4 * 1024 * 1024 }).trim();

/** Hash content, relative paths, modes and symlink targets without following framework links. */
export const macosAppContentDigest = async (root: string): Promise<string> => {
  const hash = createHash('sha256');
  const visit = async (path: string, relativePath: string): Promise<void> => {
    const metadata = await lstat(path);
    // Mode bits are part of the installed app: executable helpers must remain executable.
    hash.update(JSON.stringify([relativePath, metadata.mode % 4096]) + '\n');
    if (metadata.isSymbolicLink()) {
      hash.update(`link:${await readlink(path)}\n`);
    } else if (metadata.isDirectory()) {
      hash.update('directory\n');
      const names = await readdir(path);
      for (const name of names.sort()) {
        // oxlint-disable-next-line no-await-in-loop -- Stable traversal makes the digest independent of filesystem enumeration.
        await visit(join(path, name), `${relativePath}/${name}`);
      }
    } else if (metadata.isFile()) {
      hash.update(`file:${metadata.size}\n`);
      for await (const bytes of createReadStream(path)) {
        if (!Buffer.isBuffer(bytes)) {
          throw new TypeError('App file stream returned non-binary content');
        }
        hash.update(bytes);
      }
    } else {
      throw new Error(`Unsupported app entry: ${path}`);
    }
  };
  await visit(root, '');
  return hash.digest('hex');
};

/** Mount read-only and prove the image contains the same finalized app and install shortcut. */
export const verifyMacosDmg = async (options: MacosDmgOptions, execute = run): Promise<string> => {
  const { appPath, dmgPath, trust } = options;
  if (trust.notarized && !trust.signed) {
    throw new TypeError('A notarized DMG must be signed');
  }
  if (trust.developerId && (!trust.signed || !trust.team || !/^[A-Z0-9]{10}$/u.test(trust.team))) {
    throw new TypeError('Release DMG requires a signing team and Developer ID signature');
  }
  execute('/usr/bin/hdiutil', ['verify', dmgPath]);
  if (trust.signed) {
    execute('/usr/bin/codesign', ['--verify', '--strict', '--verbose=2', dmgPath]);
    if (trust.team) {
      if (!/^[A-Z0-9]{10}$/u.test(trust.team)) {
        throw new TypeError('Invalid signing team identifier');
      }
      execute('/usr/bin/codesign', [
        '--verify',
        '--strict',
        '-R',
        `=${trust.developerId ? 'anchor apple generic and certificate 1[field.1.2.840.113635.100.6.2.6] exists and certificate leaf[field.1.2.840.113635.100.6.1.13] exists and ' : ''}certificate leaf[subject.OU] = "${trust.team}"`,
        dmgPath,
      ]);
    }
  }
  if (trust.notarized) {
    execute('/usr/bin/xcrun', ['stapler', 'validate', dmgPath]);
    execute('/usr/sbin/spctl', [
      '--assess',
      '--type',
      'open',
      '--context',
      'context:primary-signature',
      '--verbose=2',
      dmgPath,
    ]);
  }
  const scratch = await mkdtemp(join(tmpdir(), 'tau-dmg-verify-'));
  const mount = join(scratch, 'volume');
  await mkdir(mount);
  let mounted = false;
  try {
    execute('/usr/bin/hdiutil', ['attach', '-readonly', '-nobrowse', '-noautoopen', '-mountpoint', mount, dmgPath]);
    mounted = true;
    if ((await readlink(join(mount, applicationsLink))) !== '/Applications') {
      throw new Error('DMG Applications shortcut does not target /Applications');
    }
    for (const layout of ['.DS_Store', '.background.tiff']) {
      // oxlint-disable-next-line no-await-in-loop -- Two fixed entries; each must exist as a regular file.
      const entry = await lstat(join(mount, layout));
      if (!entry.isFile()) {
        throw new Error(`DMG window layout entry ${layout} is not a file`);
      }
    }
    const installedApp = join(mount, basename(appPath));
    const expected = await macosAppContentDigest(appPath);
    const actual = await macosAppContentDigest(installedApp);
    if (actual !== expected) {
      throw new Error('DMG app content differs from the finalized ZIP source');
    }
    if (trust.signed) {
      execute('/usr/bin/codesign', ['--verify', '--deep', '--strict', '--verbose=2', installedApp]);
    }
    if (trust.notarized) {
      execute('/usr/bin/xcrun', ['stapler', 'validate', installedApp]);
    }
    return actual;
  } finally {
    if (mounted) {
      execute('/usr/bin/hdiutil', ['detach', mount]);
    }
    await rm(scratch, { recursive: true, force: true });
  }
};

/** Build a separate DMG after app signing/stapling and ZIP creation have completed. */
export const createMacosDmg = async (
  options: MacosDmgOptions & {
    readonly identity?: string;
    readonly keychainProfile?: string;
  },
  execute = run,
): Promise<string> => {
  const { appPath, dmgPath, trust, identity, keychainProfile } = options;
  if (trust.signed && (!identity || identity === '-')) {
    throw new TypeError('Signed DMG requires an explicit signing identity');
  }
  if (trust.notarized && (!trust.signed || !keychainProfile)) {
    throw new TypeError('Notarized DMG requires signing and a keychain profile');
  }
  const expected = await macosAppContentDigest(appPath);
  const scratch = await mkdtemp(join(tmpdir(), 'tau-dmg-stage-'));
  try {
    const python = prepareDmgbuild(scratch, execute);
    execute(python, ['-I', '-c', buildDmgScript, resolve(dmgPath), JSON.stringify(macosDmgLayout(resolve(appPath)))]);
    if (trust.signed) {
      execute('/usr/bin/codesign', ['--force', '--sign', identity!, '--timestamp', dmgPath]);
    }
    if (trust.notarized) {
      const result: unknown = JSON.parse(
        execute('/usr/bin/xcrun', [
          'notarytool',
          'submit',
          dmgPath,
          '--keychain-profile',
          keychainProfile!,
          '--wait',
          '--output-format',
          'json',
        ]),
      );
      if (typeof result !== 'object' || result === null || !('status' in result) || result.status !== 'Accepted') {
        throw new Error('DMG notarization was not accepted');
      }
      execute('/usr/bin/xcrun', ['stapler', 'staple', dmgPath]);
    }
    const actual = await verifyMacosDmg(options, execute);
    if (actual !== expected) {
      throw new Error('Finalized app changed while creating DMG');
    }
    return actual;
  } finally {
    await rm(scratch, { recursive: true, force: true });
  }
};
