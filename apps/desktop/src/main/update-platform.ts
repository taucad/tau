/** Explicit installed-route updater; archives retain the legacy manual update experience. */
import { createHash } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { readFile, stat, realpath } from 'node:fs/promises';
import { join, isAbsolute } from 'node:path';
import { spawn } from 'node:child_process';

import { app, net } from 'electron';
import { z } from 'zod';
import type { ProviderRuntimeOptions } from 'electron-updater/out/providers/Provider.js';
import type { AppUpdater, UpdateInfo, ResolvedUpdateFileInfo } from 'electron-updater';

import { linuxInstallation } from '#shared/linux-installation.js';
import { isManagedAppImage } from '#main/managed-appimage.js';
import { startPlatformUpdateController } from '#main/update-controller.js';
import type { PlatformUpdateOptions, PlatformUpdateBackend } from '#main/update-controller.js';
import {
  allowedUpdateRequest,
  parseDesktopInstallation,
  parseDesktopUpdateDescriptor,
  verifyDesktopDescriptor,
  validateWindowsUpdateConfig,
} from '#main/update-identity.js';
import type { DesktopUpdateDescriptor } from '#main/update-identity.js';
import { updateSource, isNewerVersion } from '#main/updater.js';
import type { DesktopUpdater, AvailableUpdate } from '#main/updater.js';
import { verifyWindowsSignature } from '#main/windows-signature.js';

/** Bound metadata and refuse redirects rather than giving the server another origin's authority. */
export const fetchUpdateDescriptor = async (url: string): Promise<unknown> => {
  const response = await net.fetch(url, { redirect: 'manual', signal: AbortSignal.timeout(30_000) });
  if (!response.ok || (response.url && !allowedUpdateRequest(response.url, url))) {
    throw new Error('Update descriptor request or redirect was refused');
  }
  const reader = response.body?.getReader();
  if (!reader) {
    throw new Error('Update descriptor has no body');
  }
  const chunks: Array<Uint8Array<ArrayBuffer>> = [];
  let length = 0;
  try {
    for (;;) {
      // Stream a bounded document; never allocate a server-selected response size.
      // oxlint-disable-next-line no-await-in-loop -- Each bounded stream read depends on the previous chunk.
      const next = await reader.read();
      if (next.done) {
        break;
      }
      length += next.value.length;
      if (length > 32_768) {
        throw new Error('Update descriptor exceeds the metadata limit');
      }
      chunks.push(next.value);
    }
  } finally {
    await reader.cancel();
  }
  return JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(Buffer.concat(chunks))) as unknown;
};

/** Revalidate cache bytes immediately before installation, including previously cached downloads. */
export const verifyDownloadedUpdate = async (path: string, descriptor: DesktopUpdateDescriptor): Promise<void> => {
  if (!isAbsolute(path)) {
    throw new Error('Downloaded update path must be absolute');
  }
  const info = await stat(path);
  if (!info.isFile() || info.size !== descriptor.size) {
    throw new Error('Downloaded update size changed');
  }
  const hash = createHash('sha512');
  for await (const chunk of createReadStream(path)) {
    if (!(chunk instanceof Uint8Array)) {
      throw new TypeError('Expected binary download bytes');
    }
    hash.update(chunk);
  }
  if (hash.digest('base64') !== descriptor.sha512) {
    throw new Error('Downloaded update hash changed');
  }
};

/** No shell/elevation fallback: spawn failure is observable before the shutdown owner disposes services. */
export const launchWindowsUpdate = async (path: string): Promise<void> => {
  if (!isAbsolute(path)) {
    throw new Error('Installer path must be absolute');
  }
  await new Promise<void>((resolve, reject) => {
    const child = spawn(path, ['--updated', '/S', '--force-run'], {
      shell: false,
      detached: true,
      stdio: 'ignore',
      windowsHide: true,
    });
    child.once('error', reject);
    child.once('spawn', () => {
      child.unref();
      resolve();
    });
  });
};

const release = (descriptor: { version: string; tag: string }): AvailableUpdate => ({
  version: descriptor.version,
  tag: descriptor.tag,
  releasePage: `https://github.com/taucad/tau/releases/tag/${encodeURIComponent(descriptor.tag)}`,
});

/** Called lazily only on non-macOS after normal bootstrap has become ready. */
export const startPlatformUpdater = async (options: PlatformUpdateOptions): Promise<DesktopUpdater | undefined> => {
  if (!options.packaged || options.platform === 'darwin') {
    return undefined;
  }
  let marker: unknown;
  try {
    marker = JSON.parse(await readFile(join(process.resourcesPath, 'desktop-installation.json'), 'utf8'));
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      return undefined;
    }
    throw error;
  }
  const installation = parseDesktopInstallation(marker, {
    platform: options.platform,
    arch: options.arch,
    channel: options.channel ?? 'production',
    version: options.currentVersion,
  });
  const packageIdentity = z
    .object({
      version: z.string(),
      tauDesktop: z.object({ sourceCommit: z.string(), channel: z.enum(['production', 'staging']).optional() }),
    })
    .parse(JSON.parse(await readFile(join(app.getAppPath(), 'package.json'), 'utf8')));
  if (
    packageIdentity.version !== installation.version ||
    packageIdentity.tauDesktop.sourceCommit !== installation.sourceCommit ||
    (packageIdentity.tauDesktop.channel ?? 'production') !== installation.channel
  ) {
    throw new Error('Installed route source differs from packaged application');
  }
  const managedImage =
    installation.route === 'linux-appimage' &&
    (await isManagedAppImage({
      path: process.env['APPIMAGE'],
      channel: installation.channel,
      version: installation.version,
    }));
  if (installation.route === 'linux-apt' || managedImage) {
    const { launcher, root, executable } = linuxInstallation(installation.channel, managedImage);
    const selector = `${root}/current`;
    let selected: string | undefined;
    const inspect = async (): Promise<AvailableUpdate | undefined> => {
      const runtime = await realpath(selector);
      const marker: unknown = JSON.parse(await readFile(join(runtime, 'resources/desktop-installation.json'), 'utf8'));
      const { version } = z.object({ version: z.string() }).parse(marker);
      const selectedMarker = parseDesktopInstallation(marker, {
        platform: 'linux',
        arch: 'x64',
        channel: installation.channel,
        version,
      });
      if (
        selectedMarker.route !== installation.route ||
        selectedMarker.trust !== installation.trust ||
        runtime !== `${root}/releases/${version}`
      ) {
        throw new Error('APT selected runtime is outside its immutable generation');
      }
      if (managedImage) {
        await isManagedAppImage({ path: `${runtime}/${executable}`, channel: installation.channel, version });
      }
      if (!isNewerVersion(selectedMarker.version, installation.version)) {
        return undefined;
      }
      if (
        options.expectedUpdate &&
        (selectedMarker.version !== options.expectedUpdate.version ||
          selectedMarker.tag !== options.expectedUpdate.tag ||
          selectedMarker.sourceCommit !== options.expectedUpdate.sourceCommit)
      ) {
        throw new Error('Qualification APT selection differs from the expected release source');
      }
      selected = runtime;
      return release(selectedMarker);
    };
    return startPlatformUpdateController(options, {
      systemManaged: true,
      check: inspect,
      download: async () => undefined,
      prepare: async () => {
        if (selected === undefined || (await realpath(selector)) !== selected) {
          throw new Error('APT selection changed; check again before restarting');
        }
        return {
          commit: async () => {
            if ((await realpath(selector)) !== selected) {
              throw new Error('APT selection changed during save');
            }
          },
          release: () => undefined,
        };
      },
      finish: () => {
        app.relaunch({ execPath: launcher });
        app.quit();
      },
    });
  }
  const source = updateSource(options.environment, installation.channel);
  if (source.kind === 'disabled') {
    return startPlatformUpdateController(options, {
      systemManaged: false,
      disabledReason: source.reason,
      check: async () => undefined,
      download: async () => undefined,
      prepare: async () => {
        throw new Error(source.reason);
      },
      finish: () => undefined,
    });
  }
  const { origin } = source;
  if (installation.route === 'windows-nsis') {
    validateWindowsUpdateConfig(
      JSON.parse(await readFile(join(process.resourcesPath, 'app-update.yml'), 'utf8')),
      installation,
    );
  }
  const electronUpdater = await import('electron-updater');
  let candidate: DesktopUpdateDescriptor | undefined;
  let file: string | undefined;
  let url: string | undefined;
  const descriptorUrl = `${origin}/${options.candidateTag ? `releases/${encodeURIComponent(options.candidateTag)}` : 'latest'}/desktop-update-${installation.route}-x64.json`;
  class InstalledProvider extends electronUpdater.Provider<UpdateInfo> {
    public constructor(_config: unknown, _updater: AppUpdater, runtime: ProviderRuntimeOptions) {
      super(runtime);
    }
    public async getLatestVersion(): Promise<UpdateInfo> {
      const document = await fetchUpdateDescriptor(descriptorUrl);
      candidate = parseDesktopUpdateDescriptor(
        installation.route === 'linux-appimage' ? verifyDesktopDescriptor(document, installation.keys) : document,
        installation,
      );
      if (options.candidateTag && candidate.tag !== options.candidateTag) {
        throw new Error('Candidate descriptor tag mismatch');
      }
      if (
        options.expectedUpdate &&
        (candidate.version !== options.expectedUpdate.version ||
          candidate.tag !== options.expectedUpdate.tag ||
          candidate.sourceCommit !== options.expectedUpdate.sourceCommit)
      ) {
        throw new Error('Qualification descriptor differs from the expected release source');
      }
      url = `${origin}/${candidate.path}`;
      return {
        version: candidate.version,
        path: url,
        sha512: candidate.sha512,
        releaseDate: candidate.issuedAt,
        files: [{ url, sha512: candidate.sha512, size: candidate.size }],
      };
    }
    public resolveFiles(info: UpdateInfo): ResolvedUpdateFileInfo[] {
      if (!candidate || !url || info.version !== candidate.version) {
        throw new Error('Candidate snapshot is missing');
      }
      return [{ url: new URL(url), info: { url, sha512: candidate.sha512, size: candidate.size } }];
    }
  }
  const provider = { provider: 'custom', updateProvider: InstalledProvider } as const;
  const imageModule = installation.route === 'linux-appimage' ? await import('#main/update-appimage.js') : undefined;
  const image =
    installation.route === 'linux-appimage'
      ? imageModule?.createSafeAppImageUpdater(provider, installation)
      : undefined;
  const updater = image ?? new electronUpdater.NsisUpdater(provider);
  updater.autoDownload = false;
  updater.autoInstallOnAppQuit = false;
  updater.channel = 'latest';
  updater.allowDowngrade = false;
  updater.allowPrerelease = false;
  updater.disableDifferentialDownload = true;
  updater.disableWebInstaller = true;
  updater.on('error', (error: Error) => {
    options.log('warn', 'updater.backend-error', { message: error.message });
  });
  updater.netSession.webRequest.onBeforeRequest((details, callback) => {
    callback({ cancel: !url || !allowedUpdateRequest(details.url, url) });
  });
  if (updater instanceof electronUpdater.NsisUpdater) {
    updater.verifyUpdateCodeSignature = async (publishers, path) => {
      if (
        installation.route !== 'windows-nsis' ||
        !installation.publisher ||
        publishers.length !== 1 ||
        publishers[0] !== installation.publisher
      ) {
        throw new Error('Windows publisher configuration changed');
      }
      if (!candidate) {
        throw new Error('Missing Windows candidate identity');
      }
      await verifyWindowsSignature({
        path,
        publisher: installation.publisher,
        expectedVersion: candidate.version,
        expectedProductName: installation.channel === 'staging' ? 'Tau Staging' : 'Tau',
      });
      return null;
    };
  }
  const acknowledgeRunningImage = async (): Promise<void> => {
    if (!image) {
      return;
    }
    // Fetch the running release's immutable identity, not the latest offered candidate. A failed
    // lookup leaves existing health untouched and is retried by the next check without restarting.
    const baselineUrl = `${origin}/releases/${encodeURIComponent(installation.tag)}/desktop-update-linux-appimage-x64.json`;
    const document = await fetchUpdateDescriptor(baselineUrl);
    if (!(await options.confirmHealthy?.())) {
      throw new Error('AppImage workspace has not acknowledged a healthy startup');
    }
    image.markHealthy(document);
  };
  const backend: PlatformUpdateBackend = {
    systemManaged: false,
    check: async () => {
      await acknowledgeRunningImage();
      await updater.checkForUpdates();
      return candidate && isNewerVersion(candidate.version, installation.version) ? release(candidate) : undefined;
    },
    download: async () => {
      const paths = await updater.downloadUpdate();
      if (paths.length !== 1) {
        throw new Error('Expected one complete update file');
      }
      file = paths[0];
    },
    prepare: async () => {
      if (!file || !candidate) {
        throw new Error('No verified downloaded candidate');
      }
      parseDesktopUpdateDescriptor(candidate, installation);
      await verifyDownloadedUpdate(file, candidate);
      if (image) {
        await acknowledgeRunningImage();
        const prepared = await image.prepareInstallation({
          path: file,
          sha512: candidate.sha512,
          size: candidate.size,
          version: candidate.version,
        });
        const descriptor = candidate;
        return {
          commit: () => {
            parseDesktopUpdateDescriptor(descriptor, installation);
            prepared.commit();
          },
          release: () => {
            prepared.release();
          },
        };
      }
      if (installation.route !== 'windows-nsis' || !installation.publisher) {
        throw new Error('Missing Windows publisher');
      }
      const path = file;
      const descriptor = candidate;
      const { publisher } = installation;
      await verifyWindowsSignature({
        path,
        publisher,
        expectedVersion: descriptor.version,
        expectedProductName: installation.channel === 'staging' ? 'Tau Staging' : 'Tau',
      });
      return {
        commit: async () => {
          parseDesktopUpdateDescriptor(descriptor, installation);
          await verifyDownloadedUpdate(path, descriptor);
          await verifyWindowsSignature({
            path,
            publisher,
            expectedVersion: descriptor.version,
            expectedProductName: installation.channel === 'staging' ? 'Tau Staging' : 'Tau',
          });
          await launchWindowsUpdate(path);
        },
        release: () => undefined,
      };
    },
    finish: () => {
      if (image) {
        app.relaunch({ execPath: image.outerImagePath });
      }
      app.quit();
    },
  };
  return startPlatformUpdateController(options, backend);
};
