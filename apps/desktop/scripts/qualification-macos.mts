/** Native Mac installation and signature observations; no signing or release acceptance authority. */
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { lstat, mkdir, mkdtemp, realpath, rm, writeFile } from 'node:fs/promises';
import { homedir, release, tmpdir } from 'node:os';
import { basename, dirname, join, resolve } from 'node:path';
import { extractFile, uncache } from '@electron/asar';
import { z } from 'zod';
import { parseDesktopArtifactManifest } from '#shared/desktop-release.js';
/* oxlint-disable no-restricted-imports -- Native qualification scripts share the external collector contract. */
import { createQualificationReinstallGuard, QualificationUnavailable } from './qualification-platform-types.mjs';
import type {
  QualificationCandidate,
  QualificationDriverOptions,
  QualificationInstallation,
  QualificationPlatformDriver,
} from './qualification-platform-types.mjs';
/* oxlint-enable no-restricted-imports */

const host = (architecture: 'arm64' | 'x64'): void => {
  if (
    process.platform !== 'darwin' ||
    process.arch !== architecture ||
    process.env['TAU_QUALIFICATION_DISPOSABLE_HOST'] !== '1'
  ) {
    throw new QualificationUnavailable(
      'Mac qualification requires the matching native architecture and disposable-host authorization',
    );
  }
};
const command = (file: string, args: string[]): string => {
  const result = spawnSync(file, args, { encoding: 'utf8', timeout: 180_000, maxBuffer: 4 * 1024 * 1024 });
  if (result.status !== 0) {
    throw new QualificationUnavailable(`${file} observation failed: ${result.stderr || result.error?.message}`);
  }
  return `${result.stdout}\n${result.stderr}`.trim();
};
const hashFile = async (path: string): Promise<string> => {
  const info = await lstat(path);
  if (!info.isFile() || (await realpath(path)) !== resolve(path)) {
    throw new Error('Mac qualification requires a canonical regular file');
  }
  const hash = createHash('sha256');
  for await (const bytes of createReadStream(path)) {
    if (!(bytes instanceof Uint8Array)) {
      throw new Error('Expected binary artifact bytes');
    }
    hash.update(bytes);
  }
  return hash.digest('hex');
};

/** Check candidate bytes before granting extraction or mount authority. */
export const verifyMacosQualificationArtifact = async (
  candidate: QualificationCandidate,
  architecture: 'arm64' | 'x64',
  format: 'zip' | 'dmg',
): Promise<string> => {
  if (candidate.route !== `macos-${format}`) {
    throw new Error('Wrong Mac qualification route');
  }
  const manifest = parseDesktopArtifactManifest(candidate.manifest);
  const artifact = manifest.artifacts.find(
    (entry) => entry.kind === `macos-${format}` && entry.target === `darwin-${architecture}`,
  );
  if (!artifact) {
    throw new Error('Missing Mac qualification artifact');
  }
  const path = join(candidate.artifactDirectory, artifact.name);
  const info = await lstat(path);
  const digest = await hashFile(path);
  if (info.size !== artifact.size || digest !== artifact.sha256) {
    throw new Error('Mac qualification artifact bytes differ from the manifest');
  }
  return path;
};
const extractZip = (artifact: string, destination: string): void => {
  const entries = command('/usr/bin/unzip', ['-Z1', artifact]).split('\n');
  if (entries.some((entry) => !entry.startsWith('Tau.app/') || entry.split('/').includes('..'))) {
    throw new Error('Mac ZIP contains entries outside Tau.app');
  }
  command('/usr/bin/ditto', ['-xk', artifact, destination]);
};
const expectedPayload = async (candidate: QualificationCandidate, architecture: 'arm64' | 'x64') => {
  const zip = await verifyMacosQualificationArtifact({ ...candidate, route: 'macos-zip' }, architecture, 'zip');
  const temporary = await realpath(await mkdtemp(join(tmpdir(), 'tau-qualification-payload-')));
  try {
    extractZip(zip, temporary);
    return {
      executable: await hashFile(join(temporary, 'Tau.app/Contents/MacOS/Tau')),
      asar: await hashFile(join(temporary, 'Tau.app/Contents/Resources/app.asar')),
      zip: await hashFile(zip),
    };
  } finally {
    await rm(temporary, { recursive: true, force: true });
  }
};
const metadataSchema = z.object({
  version: z.string(),
  tauDesktop: z.object({
    sourceCommit: z.string(),
    channel: z.enum(['production', 'staging']).default('production'),
    releaseTag: z.string(),
    environmentOverrides: z.literal(false).optional(),
  }),
});
/** Admission mirrors desktopManifestFields: production and disabled overrides are omitted. */
export const macosQualificationPackageSchema = metadataSchema;

/** Initial installation only; later observations never replace the installed application. */
export const createMacosQualificationDriver = (
  options: QualificationDriverOptions & {
    architecture: 'arm64' | 'x64';
    teamId: string;
    installFormat: 'zip' | 'dmg';
  },
): QualificationPlatformDriver => {
  host(options.architecture);
  const application = resolve(options.installationPath);
  const parent = dirname(application);
  const applications = join(homedir(), 'Applications');
  if (
    basename(application) !== 'Tau.app' ||
    dirname(parent) !== applications ||
    !/^tau-qualification-[a-f\d-]{36}$/u.test(basename(parent)) ||
    !/^[A-Z\d]{10}$/u.test(options.teamId)
  ) {
    throw new Error('Mac qualification requires an isolated UUID application directory and exact Apple team');
  }
  const lifecycle = createQualificationReinstallGuard();
  let initialInstalled = false;
  let created = false;
  const verifyTrust = (path: string, diskImage = false): Record<string, string> => {
    const verification = command('/usr/bin/codesign', ['--verify', '--deep', '--strict', path]);
    const signature = command('/usr/bin/codesign', ['--display', '--verbose=4', '-r-', path]);
    if (options.mode === 'fixture') {
      return { trust: 'test', verification, signature };
    }
    command('/usr/bin/codesign', [
      '--verify',
      '--strict',
      '-R',
      `=anchor apple generic and certificate 1[field.1.2.840.113635.100.6.2.6] exists and certificate leaf[field.1.2.840.113635.100.6.1.13] exists and certificate leaf[subject.OU] = "${options.teamId}"`,
      path,
    ]);
    if (!diskImage && !/flags=.*runtime/u.test(signature)) {
      throw new Error('Mac qualification requires hardened runtime');
    }
    const staple = command('/usr/bin/xcrun', ['stapler', 'validate', path]);
    const gatekeeper = command(
      '/usr/sbin/spctl',
      diskImage
        ? ['--assess', '--type', 'open', '--context', 'context:primary-signature', '--verbose=2', path]
        : ['--assess', '--type', 'execute', '--verbose=2', path],
    );
    return { trust: 'release', verification, signature, staple, gatekeeper };
  };
  const observe = async (candidate: QualificationCandidate): Promise<QualificationInstallation> => {
    host(options.architecture);
    if (candidate.route !== `macos-${options.installFormat}`) {
      throw new Error('Wrong Mac qualification route');
    }
    const manifest = parseDesktopArtifactManifest(candidate.manifest);
    if ((await realpath(application)) !== application) {
      throw new Error('Installed Mac app path changed');
    }
    const measurements = verifyTrust(application);
    const asar = join(application, 'Contents/Resources/app.asar');
    uncache(asar);
    const metadata = metadataSchema.parse(JSON.parse(extractFile(asar, 'package.json').toString()));
    if (
      metadata.version !== manifest.version ||
      metadata.tauDesktop.sourceCommit !== manifest.sourceCommit ||
      metadata.tauDesktop.releaseTag !== manifest.tag ||
      metadata.tauDesktop.channel !== manifest.channel
    ) {
      throw new Error('Installed Mac source/version/channel differs from the candidate');
    }
    for (const key of ['CFBundleVersion', 'CFBundleShortVersionString']) {
      if (
        command('/usr/bin/plutil', ['-extract', key, 'raw', '-o', '-', join(application, 'Contents/Info.plist')]) !==
        manifest.version
      ) {
        throw new Error('Installed Mac bundle version differs from the candidate');
      }
    }
    const executablePath = join(application, 'Contents/MacOS/Tau');
    const architectures = command('/usr/bin/lipo', ['-archs', executablePath]);
    if (!architectures.split(/\s+/u).includes(options.architecture === 'x64' ? 'x86_64' : 'arm64')) {
      throw new Error('Installed Mac executable architecture differs');
    }
    const expected = await expectedPayload(candidate, options.architecture);
    const executableSha256 = await hashFile(executablePath);
    const asarSha256 = await hashFile(asar);
    if (executableSha256 !== expected.executable || asarSha256 !== expected.asar) {
      throw new Error('Installed Mac executable or ASAR differs from the authenticated candidate ZIP');
    }
    lifecycle.observed(candidate);
    return {
      route: candidate.route,
      channel: manifest.channel,
      tag: manifest.tag,
      version: manifest.version,
      sourceCommit: manifest.sourceCommit,
      executablePath,
      executableSha256,
      asarSha256,
      installationPath: asar,
      measurements: {
        ...measurements,
        architectures,
        expectedExecutableSha256: expected.executable,
        expectedAsarSha256: expected.asar,
        candidateZipSha256: expected.zip,
      },
    };
  };
  const installCandidate = async (candidate: QualificationCandidate): Promise<QualificationInstallation> => {
    host(options.architecture);
    const artifact = await verifyMacosQualificationArtifact(candidate, options.architecture, options.installFormat);
    await mkdir(applications, { recursive: true });
    if ((await realpath(applications)) !== applications) {
      throw new Error('Mac Applications directory is redirected');
    }
    await mkdir(parent); // Exclusive ownership: refuse an existing directory, even an empty one.
    created = true;
    if (options.installFormat === 'zip') {
      extractZip(artifact, parent);
    } else {
      verifyTrust(artifact, true);
      const mount = await realpath(await mkdtemp(join(tmpdir(), 'tau-qualification-dmg-')));
      let mounted = false;
      try {
        command('/usr/bin/hdiutil', ['attach', '-readonly', '-nobrowse', '-mountpoint', mount, artifact]);
        mounted = true;
        verifyTrust(join(mount, 'Tau.app'));
        command('/usr/bin/ditto', [join(mount, 'Tau.app'), application]);
      } finally {
        if (mounted) {
          command('/usr/bin/hdiutil', ['detach', mount]);
        }
        await rm(mount, { recursive: true, force: true });
      }
    }
    lifecycle.installed();
    return { ...(await observe(candidate)), artifactSha256: await hashFile(artifact) };
  };
  return {
    observe,
    async install(candidate) {
      if (initialInstalled) {
        throw new Error('Mac driver installs initial baseline only');
      }
      initialInstalled = true;
      return installCandidate(candidate);
    },
    async reinstall(candidate, files) {
      lifecycle.admit(candidate, files);
      await Promise.all(
        files.map(async (file) => {
          if ((await hashFile(file.path)) !== file.sha256) {
            throw new Error('Preserved file changed before Mac reinstall');
          }
        }),
      );
      const observation = await installCandidate(candidate);
      await Promise.all(
        files.map(async (file) => {
          if ((await hashFile(file.path)) !== file.sha256) {
            throw new Error('Mac reinstall changed preserved file');
          }
        }),
      );
      return observation;
    },
    async measureSecurity(processes) {
      host(options.architecture);
      const temporary = await realpath(await mkdtemp(join(tmpdir(), 'tau-qualification-sandbox-')));
      let observations;
      try {
        const source = join(temporary, 'sandbox.c');
        const helper = join(temporary, 'sandbox-check');
        // Private Apple SPI, also used by Chromium Seatbelt::IsSandboxed; preserve its raw result.
        await writeFile(
          source,
          `#include <sys/types.h>
#include <stdlib.h>
#include <stdio.h>
#include <errno.h>
#include <signal.h>
extern int sandbox_check(pid_t, const char *, int, ...);
int main(int argc,char **argv) { if(argc!=2) return 2; pid_t pid=(pid_t)strtol(argv[1],0,10); if(pid<=0 || kill(pid,0)!=0) return 3; errno=0; int result=sandbox_check(pid,NULL,0); printf("%d %d\\n",result,errno); return result<0?4:0; }
`,
        );
        command('/usr/bin/xcrun', ['clang', '-Wall', '-Werror', source, '-lsandbox', '-o', helper]);
        observations = [processes.mainPid, ...processes.rendererPids, ...processes.nativeChildPids].map((pid) => {
          if (!Number.isSafeInteger(pid) || pid <= 0) {
            throw new Error('Invalid measured process PID');
          }
          const executable = command('/bin/ps', ['-ww', '-p', String(pid), '-o', 'comm=']);
          const commandLine = command('/bin/ps', ['-ww', '-p', String(pid), '-o', 'args=']);
          const measurements = {
            processFlags: command('/bin/ps', ['-ww', '-p', String(pid), '-o', 'flags=']),
            sandboxCheck: command(helper, [String(pid)]),
            sandboxApi: 'Apple private SPI sandbox_check(pid,NULL,0); raw result and errno',
            signature: command('/usr/bin/codesign', ['--display', '--verbose=4', executable]),
          };
          return { pid, executable, commandLine, measurements };
        });
      } finally {
        await rm(temporary, { recursive: true, force: true });
      }
      return {
        platform: 'darwin',
        architecture: options.architecture,
        osVersion: `Darwin ${release()}`,
        measurements: {
          sip: command('/usr/bin/csrutil', ['status']),
          gatekeeper: command('/usr/sbin/spctl', ['--status']),
          operatingSystem: command('/usr/bin/sw_vers', []),
          trust: options.mode,
        },
        processes: observations,
      };
    },
    async remove(preservedFiles) {
      lifecycle.assertRemoval();
      host(options.architecture);
      await Promise.all(
        preservedFiles.map(async (file) => {
          if ((await hashFile(file.path)) !== file.sha256) {
            throw new Error('Preserved file changed before Mac removal');
          }
        }),
      );
      if (!created || (await realpath(parent)) !== parent) {
        throw new Error('Mac removal lacks owned installation');
      }
      await rm(parent, { recursive: true });
      created = false;
      await Promise.all(
        preservedFiles.map(async (file) => {
          if ((await hashFile(file.path)) !== file.sha256) {
            throw new Error('Preserved file changed during Mac removal');
          }
        }),
      );
      lifecycle.removed(preservedFiles);
    },
  };
};
