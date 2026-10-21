/** Protected candidate workflow orchestration: resolve trusted archive run, verify/extract archives, wrap finalized Mac app. No publication. */
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { appendFile, mkdir, readFile, readdir, stat, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { z } from 'zod';
import { extractFile } from '@electron/asar';
import { desktopArchiveName, desktopReleaseBaseUrl, desktopReleaseIdentity } from '#shared/desktop-release.js';
// oxlint-disable-next-line no-restricted-imports -- Native DMG script wraps the same finalized application.
import { createMacosDmg } from './macos-dmg.mjs';

const required = (name: string): string => {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing ${name}`);
  }
  return value;
};
const command = (file: string, args: string[]): string =>
  execFileSync(file, args, { encoding: 'utf8', maxBuffer: 16 * 1024 * 1024, timeout: 120_000 }).trim();
const output = async (name: string, value: string): Promise<void> => {
  if (/[\r\n]/u.test(value)) {
    throw new Error('Invalid workflow output');
  }
  await appendFile(required('GITHUB_OUTPUT'), `${name}=${value}\n`);
};
const hash = async (path: string): Promise<string> => {
  const digest = createHash('sha256');
  for await (const chunk of createReadStream(path)) {
    if (!(chunk instanceof Uint8Array)) {
      throw new Error('Expected archive bytes');
    }
    digest.update(chunk);
  }
  return digest.digest('hex');
};
const assetSchema = z.strictObject({
  url: z.url(),
  sha256: z.string().regex(/^[a-f\d]{64}$/u),
  size: z.number().int().positive(),
});
const metadataSchema = z.strictObject({
  tag: z.string(),
  version: z.string(),
  channel: z.enum(['production', 'staging']),
  sourceCommit: z.string().regex(/^[a-f\d]{40}$/u),
  assets: z.record(z.string(), assetSchema),
});
const main = async (): Promise<void> => {
  const operation = process.argv[2];
  const tag = required('DESKTOP_RELEASE_TAG');
  const identity = desktopReleaseIdentity(tag);
  if (operation === 'resolve') {
    if (required('GITHUB_REF') !== 'refs/heads/main') {
      throw new Error('Installer candidate dispatch is main-only');
    }
    const runId = z
      .string()
      .regex(/^[1-9]\d*$/u)
      .parse(required('DESKTOP_RELEASE_RUN_ID'));
    const repository = required('GITHUB_REPOSITORY');
    /* eslint-disable @typescript-eslint/naming-convention -- Preserve GitHub REST wire fields. */
    const run = z
      .object({
        head_sha: z.string(),
        path: z.string(),
        event: z.string(),
        conclusion: z.string(),
        status: z.string(),
        head_repository: z.object({ full_name: z.string() }),
        repository: z.object({ full_name: z.string() }),
      })
      .parse(JSON.parse(command('gh', ['api', `repos/${repository}/actions/runs/${runId}`])));
    /* eslint-enable @typescript-eslint/naming-convention -- End GitHub response schema. */
    const source = command('git', ['rev-parse', `refs/tags/${tag}^{commit}`]);
    if (
      run.path !== '.github/workflows/release-build.yml' ||
      run.event !== 'push' ||
      run.status !== 'completed' ||
      run.conclusion !== 'success' ||
      run.head_sha !== source ||
      run.head_repository.full_name !== repository ||
      run.repository.full_name !== repository
    ) {
      throw new Error('Source archive run is not a successful same-repository release build for the exact tag');
    }
    command('git', ['merge-base', '--is-ancestor', source, 'HEAD']);
    await output('source', source);
    await output('channel', identity.channel);
    await output('tag', tag);
    return;
  }
  const source = z
    .string()
    .regex(/^[a-f\d]{40}$/u)
    .parse(required('TAU_DESKTOP_SOURCE_SHA'));
  const root = resolve(required('DESKTOP_CANDIDATE_ARCHIVES'));
  const metadata = metadataSchema.parse(JSON.parse(await readFile(join(root, 'download.json'), 'utf8')));
  if (
    metadata.tag !== tag ||
    metadata.sourceCommit !== source ||
    metadata.channel !== identity.channel ||
    metadata.version !== identity.version
  ) {
    throw new Error('Archive metadata does not bind the exact candidate');
  }
  if (operation === 'preflight') {
    for (const requiredTarget of ['darwin-arm64', 'darwin-x64', 'win32-x64', 'linux-x64']) {
      const requiredAsset = metadata.assets[requiredTarget];
      if (!requiredAsset) {
        throw new Error(
          'Full installer candidates require all four archives. Rebuild the prior staging release with Intel Mac enabled and notarization enabled; existing staging defaults remain unchanged.',
        );
      }
    }
    return;
  }

  const target = z
    .enum(['darwin-arm64', 'darwin-x64', 'win32-x64', 'linux-x64'])
    .parse(required('DESKTOP_CANDIDATE_TARGET'));
  const [platform, arch] = target.split('-');
  const archiveName = desktopArchiveName(platform!, arch!);
  const asset = metadata.assets[target];
  if (
    metadata.tag !== tag ||
    metadata.channel !== identity.channel ||
    metadata.version !== identity.version ||
    metadata.sourceCommit !== source ||
    !asset ||
    asset.url !== `${desktopReleaseBaseUrl(tag)}/${archiveName}`
  ) {
    throw new Error('Archive metadata does not bind the exact candidate');
  }
  const archive = join(root, archiveName);
  const archiveInfo = await stat(archive);
  if (archiveInfo.size !== asset.size || (await hash(archive)) !== asset.sha256) {
    throw new Error('Source archive differs from trusted release metadata');
  }
  if (operation !== 'stage' && !(operation === 'dmg' && target.startsWith('darwin-'))) {
    throw new Error('Unknown candidate operation');
  }
  const stage = resolve(required('DESKTOP_CANDIDATE_STAGE'));
  if (operation === 'stage') {
    await mkdir(stage);
  }
  const tar = process.platform === 'win32' ? join(required('SystemRoot'), 'System32/tar.exe') : 'tar';
  const listing = command(tar, ['-tf', archive]).split('\n');
  if (
    listing.some(
      (name) =>
        name.startsWith('/') || name.includes('\\') || name.split('/').includes('..') || /^[A-Za-z]:/u.test(name),
    )
  ) {
    throw new Error('Unsafe source archive member');
  }
  const verifyApplication = (asar: string): void => {
    const installed = z
      .object({
        version: z.string(),
        tauDesktop: z.object({
          sourceCommit: z.string(),
          channel: z.string().optional(),
          environmentOverrides: z.boolean().optional(),
        }),
      })
      .parse(JSON.parse(extractFile(asar, 'package.json').toString('utf8')));
    if (
      installed.version !== identity.version ||
      installed.tauDesktop.sourceCommit !== source ||
      (installed.tauDesktop.channel ?? 'production') !== identity.channel ||
      installed.tauDesktop.environmentOverrides
    ) {
      throw new Error('Finalized application identity or release hardening disagrees');
    }
  };
  if (target.startsWith('darwin-')) {
    if (process.platform !== 'darwin') {
      throw new Error('DMG staging requires macOS');
    }
    if (operation === 'stage') {
      command('/usr/bin/ditto', ['-x', '-k', archive, stage]);
    }
    const entries = await readdir(stage);
    const apps = entries.filter((name) => name.endsWith('.app'));
    if (apps.length !== 1) {
      throw new Error('Mac archive must contain exactly one application');
    }
    const app = join(stage, apps[0]!);
    verifyApplication(join(app, 'Contents/Resources/app.asar'));
    const info = command('/usr/libexec/PlistBuddy', [
      '-c',
      'Print :CFBundleShortVersionString',
      join(app, 'Contents/Info.plist'),
    ]);
    if (info !== identity.version) {
      throw new Error('Finalized Mac app version disagrees');
    }
    try {
      command('/usr/bin/xcrun', ['stapler', 'validate', app]);
    } catch {
      throw new Error(
        'The source Mac app lacks valid notarization. Rebuild the prior staging release with notarization enabled before making a full installer candidate; the original app will not be modified.',
      );
    }
    if (operation === 'stage') {
      await output('app', app);
      return;
    }
    const destination = resolve(required('TAU_DESKTOP_PACKAGE_OUTPUT_ROOT'));
    await mkdir(destination, { recursive: true });
    await createMacosDmg({
      appPath: app,
      dmgPath: join(destination, archiveName.replace(/\.zip$/u, '.dmg')),
      identity: required('TAU_CODESIGN_IDENTITY'),
      keychainProfile: required('TAU_NOTARYTOOL_PROFILE'),
      trust: { signed: true, notarized: true, developerId: true, team: required('APPLE_TEAM_ID') },
    });
    await output('app', app);
  } else {
    command(tar, ['-xf', archive, '-C', stage]);
    const app = join(stage, `Tau-${target}`);
    const asarInfo = await stat(join(app, 'resources/app.asar'));
    if (!asarInfo.isFile()) {
      throw new Error('Source archive has no expected application');
    }
    verifyApplication(join(app, 'resources/app.asar'));
    await output('app', app);
  }
  await writeFile(
    join(stage, 'candidate-source.json'),
    JSON.stringify({ tag, ...identity, sourceCommit: source, archive: archiveName, sha256: asset.sha256 }) + '\n',
  );
};
try {
  await main();
} catch (error) {
  console.error(error);
  process.exitCode = 1;
}
