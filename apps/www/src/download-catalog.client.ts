import {
  createDesktopDownloadCatalog,
  desktopDownloadHref,
  desktopDownloadLabel,
  desktopDownloads,
  desktopFileLabel,
  detectDesktopPlatform,
} from '#www/downloads.js';
import type { QualifiedDesktopDownload } from '#www/downloads.js';
import { downloadsOrigin, environmentHref, stagingDesktopNote } from '#www/environment.js';

/**
 * Recommend the visitor's build before any catalog is read. Direct Mac links name the ZIP they serve.
 * @param hostname - The hostname serving the page, which selects the download origin and staging note.
 */
export const initializeHostDownload = (hostname: string): void => {
  const hostPlatform = detectDesktopPlatform(navigator);
  if (!hostPlatform) {
    return;
  }
  const download = desktopDownloads[hostPlatform];
  for (const link of document.querySelectorAll('[data-host-download]')) {
    if (link instanceof HTMLElement && link.dataset['hostDownload'] === 'direct') {
      link.innerHTML = desktopFileLabel(hostPlatform);
      link.setAttribute('href', environmentHref(desktopDownloadHref(hostPlatform), hostname));
    } else {
      link.innerHTML = desktopDownloadLabel(hostPlatform);
    }
  }
  const intelDownload = document.querySelector('[data-mac-intel]');
  if (intelDownload instanceof HTMLElement) {
    intelDownload.hidden = hostPlatform !== 'mac';
  }
  const detail = document.querySelector('[data-download-detail]');
  const instructions = document.querySelector('[data-install-instructions]');
  const note = document.querySelector('[data-platform-note]');
  if (detail) {
    detail.textContent = download.detail;
  }
  if (instructions) {
    instructions.textContent = download.install;
  }
  if (note) {
    note.textContent = (hostPlatform === 'mac' ? stagingDesktopNote(hostname) : undefined) ?? download.updates;
  }
};

/**
 * A Mac link may say DMG only over a disk image URL, and only with its ZIP still offered beside it.
 * @param choice - A qualified route.
 * @returns The Mac platform and its paired ZIP, or undefined for anything else.
 */
const macDiskImage = (
  choice: QualifiedDesktopDownload,
): { platform: 'mac' | 'macIntel'; archive: { name: string; href: string } } | undefined => {
  const archive = choice.alternatives.find((artifact) => new URL(artifact.href).pathname.endsWith('.zip'));
  return (choice.platform === 'mac' || choice.platform === 'macIntel') &&
    choice.primaryKind === 'macos-dmg' &&
    new URL(choice.href).pathname.endsWith('.dmg') &&
    archive
    ? { platform: choice.platform, archive }
    : undefined;
};

/**
 * Show a qualified Mac disk image's detail with its paired ZIP as a visible secondary link.
 * @param element - A download detail line.
 * @param choice - The qualified Mac route.
 * @param archive - Its ZIP alternative.
 */
const describeDiskImage = (
  element: Element,
  choice: QualifiedDesktopDownload,
  archive: { name: string; href: string },
) => {
  const link = document.createElement('a');
  link.className = 'text-link';
  link.href = archive.href;
  link.textContent = archive.name;
  link.dataset['downloadAlternative'] = choice.platform;
  element.replaceChildren(`${choice.detail} · ZIP: `, link);
};

/** Upgrade the shipping download surface only after explicit server configuration and verified route qualification. */
export const initializeInstallerCatalog = async (signal: AbortSignal): Promise<void> => {
  if (document.body.dataset['installerCatalog'] !== 'true') {
    return;
  }
  const channel = location.hostname === 'taucad.dev' ? 'staging' : 'production';
  const origin = channel === 'staging' ? 'https://downloads.taucad.dev' : downloadsOrigin;
  const requestLifetime = AbortSignal.any([signal, AbortSignal.timeout(10_000)]);
  try {
    const url = `${origin}/latest/installers.json`;
    const response = await fetch(url, {
      signal: requestLifetime,
      redirect: 'error',
      credentials: 'omit',
      cache: 'no-store',
    });
    if (!response.ok || (response.url && response.url !== url)) {
      return;
    }
    const reader = response.body?.getReader();
    if (!reader) {
      return;
    }
    let body = '';
    let bytes = 0;
    const decoder = new TextDecoder('utf-8', { fatal: true });
    try {
      for (;;) {
        // oxlint-disable-next-line no-await-in-loop -- Bound the single streamed catalog before parsing it.
        const chunk = await reader.read();
        if (chunk.done) {
          break;
        }
        bytes += chunk.value.byteLength;
        if (bytes > 65_536) {
          throw new Error('Installer catalog exceeds its size limit');
        }
        body += decoder.decode(chunk.value, { stream: true });
      }
      body += decoder.decode();
    } finally {
      await reader.cancel();
    }
    const catalog = createDesktopDownloadCatalog({
      enabled: true,
      channel,
      qualification: JSON.parse(body) as unknown,
    });
    if (requestLifetime.aborted || !catalog) {
      return;
    }
    const host = detectDesktopPlatform(navigator);
    const choices = document.querySelector('[data-qualified-downloads]');
    const fragment = document.createDocumentFragment();
    const guideHeading = document.createElement('h2');
    guideHeading.textContent = 'Installation and alternatives';
    fragment.append(guideHeading);
    for (const choice of catalog) {
      const primaryHref = choice.platform === 'linux' ? '/download/#linux-installation' : choice.href;
      const mac = choice.platform === 'mac' || choice.platform === 'macIntel';
      const diskImage = macDiskImage(choice);
      if (mac && !diskImage) {
        continue;
      }
      const label = (link: HTMLAnchorElement): void => {
        link.href = primaryHref;
        if (choice.platform === 'linux') {
          link.textContent = 'Set up Linux with APT';
        } else if (diskImage) {
          link.innerHTML = desktopFileLabel(diskImage.platform, 'DMG');
        }
      };
      const describe = (detail: Element): void => {
        if (diskImage) {
          describeDiskImage(detail, choice, diskImage.archive);
        } else {
          detail.textContent = choice.detail;
        }
      };
      for (const link of document.querySelectorAll<HTMLAnchorElement>(
        `a[data-download-platform="${choice.platform}"]`,
      )) {
        label(link);
      }
      for (const detail of document.querySelectorAll(`[data-download-detail="${choice.platform}"]`)) {
        describe(detail);
      }
      if (choice.platform === host) {
        for (const link of document.querySelectorAll<HTMLAnchorElement>('a[data-host-download="direct"]')) {
          label(link);
        }
        const detail = document.querySelector('[data-download-detail="host"]');
        if (detail) {
          describe(detail);
        }
        const instructions = document.querySelector('[data-install-instructions]');
        if (instructions) {
          instructions.textContent = choice.install;
        }
        const note = document.querySelector('[data-platform-note]');
        if (note) {
          note.textContent = (mac ? stagingDesktopNote(location.hostname) : undefined) ?? choice.updates;
        }
      }
      const section = document.createElement('details');
      if (choice.platform === 'linux') {
        section.id = 'linux-installation';
        section.open = location.hash === '#linux-installation';
      }
      const heading = document.createElement('summary');
      heading.textContent = `${choice.label} — installation and archive downloads`;
      section.append(heading);
      const body = document.createElement('div');
      body.className = 'installer-guide-body';
      section.append(body);
      const instructions = document.createElement('p');
      instructions.textContent = choice.install;
      body.append(instructions);
      const updates = document.createElement('p');
      updates.textContent = choice.updates;
      body.append(updates);
      if (choice.platform === 'linux') {
        const guidance = document.createElement('p');
        guidance.textContent = `Ask your administrator to review configure-linux-apt.sh and independently verify the published APT public key fingerprint before enrollment. Choose --manual or --automatic explicitly; automatic mode requires the distribution’s enabled unattended-upgrades timers. Use --disable-automatic to remove Tau’s automatic enrollment, --remove-repository to remove its source, or apt-mark hold ${channel === 'staging' ? 'tau-staging' : 'tau'} to hold the selected version. TAU_DESKTOP_UPDATES=off does not change APT policy. Preserve projects and installed runtime generations.`;
        body.append(guidance);
      }
      if (choice.platform === 'linuxPortable') {
        const primary = document.createElement('a');
        primary.className = 'text-link';
        primary.href = choice.href;
        primary.textContent = 'Download Linux AppImage';
        body.append(primary);
      }
      const alternatives = document.createElement('ul');
      for (const artifact of choice.alternatives) {
        const item = document.createElement('li');
        const link = document.createElement('a');
        link.className = 'text-link';
        link.href = artifact.href;
        link.textContent = artifact.name;
        item.append(link);
        alternatives.append(item);
      }
      body.append(alternatives);
      fragment.append(section);
    }
    if (choices instanceof HTMLElement) {
      choices.replaceChildren(fragment);
      choices.hidden = false;
      for (const link of document.querySelectorAll<HTMLAnchorElement>('a[href="/download/#linux-installation"]')) {
        link.addEventListener(
          'click',
          () => {
            const enrollment = document.querySelector<HTMLDetailsElement>('#linux-installation');
            if (enrollment) {
              enrollment.open = true;
            }
          },
          { signal },
        );
      }
    }
  } catch {
    // Qualification/network failure retains all existing manual archive links and their truthful copy.
  }
};
