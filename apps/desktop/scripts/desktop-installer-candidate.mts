/** Protected candidate workflow orchestration: resolve trusted archive run, verify/extract archives, wrap finalized Mac app. No publication. */
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { closeSync, createReadStream, openSync } from 'node:fs';
import { appendFile, mkdir, mkdtemp, readFile, readdir, rm, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { z } from 'zod';
import { extractFile } from '@electron/asar';
import {
  desktopArchiveName,
  desktopReleaseBaseUrl,
  desktopReleaseIdentity,
  parseDesktopArtifactManifest,
} from '#shared/desktop-release.js';
/* oxlint-disable no-restricted-imports -- Native DMG script wraps the same finalized application; publication owns scope shape. */
import { createMacosDmg } from './macos-dmg.mjs';
import { desktopCandidateRoutes } from './desktop-route-publication.mjs';
/* oxlint-enable no-restricted-imports */

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
/** Archives each candidate scope stages; a scoped candidate never reads or signs another platform's archive. */
const scopeTargets = {
  all: ['darwin-arm64', 'darwin-x64', 'win32-x64', 'linux-x64'],
  linux: ['linux-x64'],
  // Apple silicon only: hosted Intel Macs have no WebGL, so Intel is not qualified or published (operator ruling).
  macos: ['darwin-arm64'],
} as const;
/**
 * The release-build workflow artifact that carries the unsigned Linux archive. A Linux-only staging candidate takes its
 * archive from here, bound to the exact run, source and GitHub-recorded digest, so it never waits for the release's
 * other platforms to be packaged and attached (macOS signing and notarization in particular).
 */
const linuxArchiveArtifact = 'desktop-linux-x64';
const runIdSchema = z.string().regex(/^[1-9]\d*$/u);
/** Admit exactly one unexpired Linux archive artifact produced by the exact trusted release-build run and source. */
const admitLinuxArchiveArtifact = (
  repository: string,
  runId: string,
  source: string,
): { id: number; sha256: string } => {
  /* eslint-disable @typescript-eslint/naming-convention -- GitHub artifact provenance fields. */
  const list = z
    .object({
      artifacts: z.array(
        z.object({
          id: z.number().int().positive(),
          name: z.string(),
          expired: z.boolean(),
          digest: z.string().nullable(),
          workflow_run: z.object({ id: z.number().int().positive(), head_sha: z.string() }),
        }),
      ),
    })
    .parse(
      JSON.parse(
        command('gh', [
          'api',
          `repos/${repository}/actions/runs/${runId}/artifacts?name=${linuxArchiveArtifact}&per_page=100`,
        ]),
      ),
    );
  /* eslint-enable @typescript-eslint/naming-convention -- End artifact provenance fields. */
  const matches = list.artifacts.filter((artifact) => artifact.name === linuxArchiveArtifact);
  const artifact = matches[0];
  if (
    matches.length !== 1 ||
    !artifact ||
    artifact.expired ||
    String(artifact.workflow_run.id) !== runId ||
    artifact.workflow_run.head_sha !== source ||
    !/^sha256:[a-f\d]{64}$/u.test(artifact.digest ?? '')
  ) {
    throw new Error('Linux source archive artifact is not the exact trusted release-build output');
  }
  return { id: artifact.id, sha256: artifact.digest!.slice('sha256:'.length) };
};
/** Download the admitted artifact, require its GitHub digest and exactly the one archive member, then extract it. */
const fetchLinuxArchive = async (
  root: string,
  archiveName: string,
  source: string,
): Promise<{ sha256: string; size: number; artifactId: number; artifactSha256: string }> => {
  const repository = required('GITHUB_REPOSITORY');
  const runId = runIdSchema.parse(required('DESKTOP_RELEASE_RUN_ID'));
  const artifact = admitLinuxArchiveArtifact(repository, runId, source);
  const temporary = await mkdtemp(join(tmpdir(), 'tau-linux-archive-'));
  try {
    const zip = join(temporary, 'artifact.zip');
    const fd = openSync(zip, 'wx');
    try {
      execFileSync('gh', ['api', `repos/${repository}/actions/artifacts/${artifact.id}/zip`], {
        stdio: ['ignore', fd, 'pipe'],
        timeout: 600_000,
      });
    } finally {
      closeSync(fd);
    }
    if ((await hash(zip)) !== artifact.sha256) {
      throw new Error('Linux source archive artifact digest differs');
    }
    const names = command('unzip', ['-Z1', zip]).split('\n');
    if (names.length !== 1 || names[0] !== archiveName) {
      throw new Error('Linux source archive artifact must contain exactly the Linux archive');
    }
    // A fresh directory: nothing staged earlier can stand in for the authenticated archive.
    await mkdir(dirname(root), { recursive: true });
    await mkdir(root);
    execFileSync('unzip', ['-q', zip, archiveName, '-d', root], { stdio: 'inherit', timeout: 600_000 });
  } finally {
    await rm(temporary, { recursive: true, force: true });
  }
  const archive = join(root, archiveName);
  const archiveInfo = await stat(archive);
  return {
    sha256: await hash(archive),
    size: archiveInfo.size,
    artifactId: artifact.id,
    artifactSha256: artifact.sha256,
  };
};
const main = async (): Promise<void> => {
  const operation = process.argv[2];
  const tag = required('DESKTOP_RELEASE_TAG');
  const identity = desktopReleaseIdentity(tag);
  const scope = z.enum(['all', 'linux', 'macos']).parse(process.env['TAU_DESKTOP_QUALIFICATION_SCOPE'] ?? 'all');
  // D-H5: a platform candidate (Linux APT+AppImage, or Apple silicon ZIP+DMG) is admissible on either channel, since
  // production promotes each platform on its own complete receipts. Its exact shape is still checked after assembly.
  if (operation === 'resolve') {
    if (required('GITHUB_REF') !== 'refs/heads/main') {
      throw new Error('Installer candidate dispatch is main-only');
    }
    const runId = runIdSchema.parse(required('DESKTOP_RELEASE_RUN_ID'));
    const repository = required('GITHUB_REPOSITORY');
    /* eslint-disable @typescript-eslint/naming-convention -- Preserve GitHub REST wire fields. */
    const run = z
      .object({
        head_sha: z.string(),
        path: z.string(),
        event: z.string(),
        conclusion: z.string().nullable(),
        status: z.string(),
        head_repository: z.object({ full_name: z.string() }),
        repository: z.object({ full_name: z.string() }),
      })
      .parse(JSON.parse(command('gh', ['api', `repos/${repository}/actions/runs/${runId}`])));
    /* eslint-enable @typescript-eslint/naming-convention -- End GitHub response schema. */
    const source = command('git', ['rev-parse', `refs/tags/${tag}^{commit}`]);
    // A Linux-only staging candidate may start while the release run is still packaging other platforms: its own
    // prerequisite jobs below must already have succeeded. Every other scope still needs the whole run to finish.
    const finished =
      run.status === 'completed'
        ? scope === 'all'
          ? run.conclusion === 'success'
          : ['success', 'failure'].includes(run.conclusion ?? '')
        : scope === 'linux';
    if (
      run.path !== '.github/workflows/release-build.yml' ||
      run.event !== 'push' ||
      !finished ||
      run.head_sha !== source ||
      run.head_repository.full_name !== repository ||
      run.repository.full_name !== repository
    ) {
      throw new Error('Source archive run is not an admissible same-repository release build for the exact tag');
    }
    if (scope !== 'all') {
      // A failure on another platform must not erase successful archive evidence for the selected platform, so a
      // scoped candidate admits only its own exact prerequisite jobs. Full candidates retain whole-run success.
      /* eslint-disable @typescript-eslint/naming-convention -- GitHub job provenance fields. */
      const pages = z
        .array(
          z.object({
            jobs: z.array(
              z.object({
                name: z.string(),
                head_sha: z.string(),
                run_id: z.number().int().positive(),
                status: z.string(),
                conclusion: z.string().nullable(),
              }),
            ),
          }),
        )
        .parse(
          JSON.parse(
            command('gh', [
              'api',
              '--paginate',
              '--slurp',
              `repos/${repository}/actions/runs/${runId}/jobs?filter=latest&per_page=100`,
            ]),
          ),
        );
      /* eslint-enable @typescript-eslint/naming-convention -- End job provenance fields. */
      const jobs = pages.flatMap((page) => page.jobs);
      for (const name of [
        'resolve',
        `Verify ${tag}`,
        ...(scope === 'linux'
          ? // The Linux archive comes from this job's workflow artifact, never the release, so attaching the release's
            // assets (which waits for macOS signing and notarization) is not a Linux prerequisite.
            ['Package linux-x64 (unsigned)']
          : // The Mac-only scope is Apple silicon only; an Intel job's result neither admits nor blocks it.
            [
              'Package macOS arm64 (signed)',
              'Verify native macOS arm64 OTA replacement',
              'Attach immutable candidate assets',
            ]),
      ]) {
        const matches = jobs.filter((job) => job.name === name);
        if (
          matches.length !== 1 ||
          matches[0]!.head_sha !== source ||
          String(matches[0]!.run_id) !== runId ||
          matches[0]!.status !== 'completed' ||
          matches[0]!.conclusion !== 'success'
        ) {
          throw new Error(
            `${scope === 'linux' ? 'Linux' : 'Mac'} source archive prerequisite did not succeed at the exact source/run: ${name}`,
          );
        }
      }
      if (scope === 'linux') {
        admitLinuxArchiveArtifact(repository, runId, source);
      }
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
  if (operation === 'admit-scope') {
    // After assembly, a platform candidate must be exactly its platform's routes (Apple silicon ZIP/DMG, or Linux
    // APT/AppImage) and nothing else: the same shape publication will later admit.
    const manifest = parseDesktopArtifactManifest(
      JSON.parse(await readFile(join(resolve(required('DESKTOP_ASSETS_DIR')), 'desktop-artifacts.json'), 'utf8')),
    );
    if (manifest.tag !== tag || manifest.sourceCommit !== source || scope === 'all') {
      throw new Error('Scoped candidate manifest does not bind the exact platform candidate');
    }
    desktopCandidateRoutes(manifest, scope);
    return;
  }
  const root = resolve(required('DESKTOP_CANDIDATE_ARCHIVES'));
  const readMetadata = async (): Promise<z.infer<typeof metadataSchema>> => {
    const metadata = metadataSchema.parse(JSON.parse(await readFile(join(root, 'download.json'), 'utf8')));
    if (
      metadata.tag !== tag ||
      metadata.sourceCommit !== source ||
      metadata.channel !== identity.channel ||
      metadata.version !== identity.version
    ) {
      throw new Error('Archive metadata does not bind the exact candidate');
    }
    return metadata;
  };
  if (operation === 'preflight') {
    if (scope === 'linux') {
      throw new Error('Linux-only candidates read the release-build archive artifact, not attached release metadata');
    }
    const metadata = await readMetadata();
    const targets = scopeTargets[scope];
    for (const requiredTarget of targets) {
      const requiredAsset = metadata.assets[requiredTarget];
      if (!requiredAsset) {
        throw new Error(
          scope === 'macos'
            ? 'Mac-only installer candidates require the Apple silicon archive. Rebuild the release with notarization enabled; existing staging defaults remain unchanged.'
            : 'Full installer candidates require all four archives. Rebuild the prior staging release with Intel Mac enabled and notarization enabled; existing staging defaults remain unchanged.',
        );
      }
    }
    return;
  }

  const target = z
    .enum(['darwin-arm64', 'darwin-x64', 'win32-x64', 'linux-x64'])
    .parse(required('DESKTOP_CANDIDATE_TARGET'));
  if (!(scopeTargets[scope] as readonly string[]).includes(target)) {
    throw new Error(`${scope === 'linux' ? 'Linux' : 'Mac'}-only candidates cannot stage another platform`);
  }
  if (operation !== 'stage' && !(operation === 'dmg' && target.startsWith('darwin-'))) {
    throw new Error('Unknown candidate operation');
  }
  const [platform, arch] = target.split('-');
  const archiveName = desktopArchiveName(platform!, arch!);
  let asset: { sha256: string; size: number };
  let artifactProvenance: { releaseRunId: string; artifactId: number; artifactSha256: string } | undefined;
  if (scope === 'linux') {
    // No release metadata exists until every platform is attached; the exact run's artifact digest binds the bytes and
    // the packaged application identity below binds tag, version, channel and source.
    const fetched = await fetchLinuxArchive(root, archiveName, source);
    asset = fetched;
    artifactProvenance = {
      releaseRunId: required('DESKTOP_RELEASE_RUN_ID'),
      artifactId: fetched.artifactId,
      artifactSha256: fetched.artifactSha256,
    };
  } else {
    const metadata = await readMetadata();
    const attached = metadata.assets[target];
    if (!attached || attached.url !== `${desktopReleaseBaseUrl(tag)}/${archiveName}`) {
      throw new Error('Archive metadata does not bind the exact candidate');
    }
    asset = attached;
  }
  const archive = join(root, archiveName);
  const archiveInfo = await stat(archive);
  if (archiveInfo.size !== asset.size || (await hash(archive)) !== asset.sha256) {
    throw new Error('Source archive differs from trusted release metadata');
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
    JSON.stringify({
      tag,
      ...identity,
      sourceCommit: source,
      archive: archiveName,
      sha256: asset.sha256,
      ...artifactProvenance,
    }) + '\n',
  );
};
try {
  await main();
} catch (error) {
  console.error(error);
  process.exitCode = 1;
}
