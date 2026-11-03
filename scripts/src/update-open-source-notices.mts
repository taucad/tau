/**
 * Script to generate the open-source notices the web and desktop apps show.
 *
 * It walks the production dependency closure of `apps/ui` and `apps/desktop`
 * (through the workspace libraries they bundle), lists every third-party
 * package with its declared license (the engine's platform packages from the
 * installed `geospec-engine`'s optionalDependencies, so every host lists the
 * same set), names the vendored tscircuit engine components from their own
 * license record, lists the MIT components of the desktop app's C# runtime,
 * and carries the Open CASCADE Technology notice with the unmodified LGPL-2.1
 * and Open CASCADE exception texts, read from the installed `geospec-engine`
 * package together with the OCCT revision its SOURCE-RELINK receipt pins. The
 * website (`apps/www`) renders the file at `/legal/open-source/`; the macOS package ships the same
 * file inside the app bundle.
 *
 * Usage: node --import tsx scripts/src/update-open-source-notices.mts [--check]
 */

import { readFile, writeFile } from 'node:fs/promises';
import { join, dirname, sep } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import process from 'node:process';
import {
  readManifest,
  resolvePackageDirectory,
  selectThirdPartyPackages,
  toPackageInfo,
} from '#update-license-deps.mts';
import type { PackageInfo, ScannedPackage } from '#update-license-deps.mts';

const __dirname = dirname(fileURLToPath(import.meta.url));
const rootDirectory = join(__dirname, '../..');
const appDirectories = [join(rootDirectory, 'apps/ui'), join(rootDirectory, 'apps/desktop')];
const engineName = 'geospec-engine';
const tscircuitLicenseFile = join(rootDirectory, 'packages/plugins/tscircuit/THIRD_PARTY_LICENSES.md');
export const outputFile = join(rootDirectory, 'apps/www/content/legal/open-source.md');
const desktopRuntimeFile = join(rootDirectory, 'apps/www/content/legal/desktop-runtime-notices.json');
const picoGkWorkerLockFile = join(rootDirectory, 'packages/plugins/picogk/dotnet/Tau.PicoGK.Worker/packages.lock.json');

/** Workspace devDependencies that only serve tests or the build, never the shipped bundle. */
const isBuildOnlyWorkspaceProject = (name: string): boolean => name.endsWith('-testing') || name === '@taucad/vite';

const isWorkspaceDirectory = (directory: string): boolean =>
  directory.startsWith(rootDirectory + sep) && !directory.includes(`${sep}node_modules${sep}`);

const platformSuffix =
  /([/-])(?:darwin|linux|linuxmusl|win32|freebsd|openbsd|netbsd|sunos|aix|android|wasm32)(?:-[\w-]+)?$/;

/**
 * Name a package so the notices read the same on every host. pnpm installs only
 * the host's platform build of a package such as `@img/sharp-libvips-linux-x64`,
 * so a platform build is listed under its family (`@img/sharp-libvips-{platform}`)
 * and a platform-only package outside a family is left out.
 *
 * @returns The listed name, or `undefined` when the package is not listed.
 */
export function platformFamilyName(manifest: { os?: string[]; cpu?: string[] }, name: string): string | undefined {
  if (!manifest.os && !manifest.cpu) {
    return name;
  }

  return platformSuffix.test(name) ? name.replace(platformSuffix, '$1{platform}') : undefined;
}

/** The engine's platform packages, which pnpm installs only on their own host. */
const isEnginePlatformPackage = (name: string): boolean => name.startsWith(`${engineName}-`);

/**
 * List the engine's platform packages from the installed engine's
 * optionalDependencies, so the notices name every native binding the engine
 * ships whichever host generates them. A platform package is published with
 * the engine and carries its license and repository.
 *
 * @returns One entry per platform package, sorted by name.
 */
export function enginePlatformPackages(
  engine: PackageInfo,
  optionalDependencies: Record<string, string> | undefined,
): PackageInfo[] {
  return Object.entries(optionalDependencies ?? {})
    .map(([name, version]) => {
      if (!isEnginePlatformPackage(name)) {
        throw new Error(`${engine.name} has an optional dependency outside its platform packages: ${name}`);
      }
      if (!/^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/u.test(version)) {
        throw new Error(`${engine.name} pins ${name} to "${version}", not an exact version`);
      }
      return { ...engine, name, version };
    })
    .toSorted((a, b) => a.name.localeCompare(b.name));
}

/**
 * Collect the closure the apps ship: each app's production and optional
 * dependencies, the non-test workspace libraries it bundles from its
 * devDependencies, and, transitively, the production dependencies of each.
 * peerDependencies are supplied by the dependent and already walked there.
 */
async function collectAppClosure(): Promise<ScannedPackage[]> {
  const queue: Array<{ name: string; from: string }> = [];
  for (const appDirectory of appDirectories) {
    // oxlint-disable-next-line no-await-in-loop -- Two manifests; order keeps the walk deterministic.
    const manifest = await readManifest(appDirectory);
    const devWorkspaceProjects = Object.entries(manifest?.devDependencies ?? {})
      .filter(([name, range]) => range.startsWith('workspace:') && !isBuildOnlyWorkspaceProject(name))
      .map(([name]) => name);
    for (const name of [
      ...Object.keys({ ...manifest?.dependencies, ...manifest?.optionalDependencies }),
      ...devWorkspaceProjects,
    ]) {
      queue.push({ name, from: appDirectory });
    }
  }

  const packages: ScannedPackage[] = [];
  const visited = new Set<string>();

  while (queue.length > 0) {
    const { name, from } = queue.shift()!;
    // oxlint-disable-next-line no-await-in-loop -- Breadth-first walk; each step depends on the previous resolution.
    const directory = await resolvePackageDirectory(name, from);
    if (!directory || visited.has(directory)) {
      continue;
    }

    visited.add(directory);
    // oxlint-disable-next-line no-await-in-loop -- Same walk.
    const manifest = await readManifest(directory);
    const packageInfo = manifest && toPackageInfo(manifest);
    if (!manifest || !packageInfo) {
      continue;
    }

    if (isEnginePlatformPackage(packageInfo.name)) {
      // Listed from the engine's optionalDependencies instead, so the host's platform does not decide the list.
      continue;
    }

    const platformName = platformFamilyName(manifest, packageInfo.name);
    if (platformName !== undefined) {
      packages.push({ ...packageInfo, name: platformName, directory });
    }

    const shipped = { ...manifest.dependencies, ...manifest.optionalDependencies };
    if (isWorkspaceDirectory(directory)) {
      // Workspace libraries are bundled from source, so their workspace devDependencies ship too.
      for (const [dependencyName, range] of Object.entries(manifest.devDependencies ?? {})) {
        if (range.startsWith('workspace:') && !isBuildOnlyWorkspaceProject(dependencyName)) {
          shipped[dependencyName] = range;
        }
      }
    }

    for (const dependencyName of Object.keys(shipped)) {
      queue.push({ name: dependencyName, from: directory });
    }
  }

  return packages;
}

export type VendoredComponent = { name: string; version: string; status: string; license: string };

/**
 * Read the vendored tscircuit components from the headings of their license
 * record, `## <name>@<version> — <STATUS> (<license>)`.
 */
export function parseVendoredComponents(record: string): VendoredComponent[] {
  const components: VendoredComponent[] = [];
  for (const match of record.matchAll(/^## (@?[^\s@]+)@(\S+) — ([A-Z][ A-Z]*[A-Z]) \((.+)\)$/gm)) {
    const [, name, version, status, license] = match;
    components.push({ name: name!, version: version!, status: status!, license: license! });
  }

  return components;
}

export type DesktopRuntimeComponent = {
  name: string;
  package: string;
  version: string;
  copyright: string;
  source: string;
};

export type DesktopRuntimeNotices = { components: DesktopRuntimeComponent[]; mitLicense: string };

/**
 * Check each listed NuGet package against the version the PicoGK worker's lock resolves, so the
 * notices cannot name a Roslyn or SkiaSharp the desktop app no longer ships.
 *
 * @returns The packages whose listed version differs from the lock, as `<package> <listed> != <locked>`.
 */
export function desktopRuntimeDrift(
  notices: DesktopRuntimeNotices,
  lock: { dependencies: Record<string, Record<string, { resolved: string }>> },
): string[] {
  const locked = lock.dependencies['net10.0'] ?? {};
  return notices.components.flatMap((component) => {
    const resolved = locked[component.package]?.resolved;
    return resolved === undefined || resolved === component.version
      ? []
      : [`${component.package} ${component.version} != ${resolved}`];
  });
}

/** Fence a license text so Markdown renders it verbatim. */
const fence = (text: string): string[] => ['```text', text.replace(/\s+$/, ''), '```'];

const repositoryLink = (packageInfo: PackageInfo): string =>
  packageInfo.repository?.startsWith('https://') ? ` ([source](${packageInfo.repository}))` : '';

/** The installed GeoSpec engine release and the OCCT revision it compiles in. */
export type EngineRelease = { version: string; occtRevision: string };

/**
 * Read the OCCT upstream revision from the engine's SOURCE-RELINK receipt.
 *
 * @returns The 40-hex revision the receipt's OCCT source archive URL pins.
 */
export function parseOcctRevision(receipt: string): string {
  const parsed = JSON.parse(receipt) as { occtSourceArchive?: { url?: unknown } };
  const url = parsed.occtSourceArchive?.url;
  const match = typeof url === 'string' ? /\/archive\/([0-9a-f]{40})\.tar\.gz$/u.exec(url) : null;
  if (!match) {
    throw new Error('The GeoSpec engine SOURCE-RELINK receipt names no OCCT upstream revision.');
  }

  return match[1]!;
}

export function generateNotices(input: {
  packages: PackageInfo[];
  vendored: VendoredComponent[];
  desktopRuntime: DesktopRuntimeNotices;
  lgpl: string;
  occtException: string;
  engine: EngineRelease;
}): string {
  const { packages, vendored, desktopRuntime, lgpl, occtException, engine } = input;
  const sorted = packages.toSorted((a, b) => a.name.localeCompare(b.name) || a.version.localeCompare(b.version));
  const occtPackages = sorted.filter(({ name }) =>
    ['libcascade', 'occt-import-js', 'replicad-opencascadejs'].includes(name),
  );

  const lines: string[] = [
    '# Open-Source Notices',
    '',
    'Tau is open-source software. All Tau-authored source, including the GeoSpec engine, is licensed under the',
    '[Apache License 2.0](https://github.com/taucad/tau/blob/main/license). The complete source of Tau is published at',
    '[github.com/taucad/tau](https://github.com/taucad/tau), and that of the GeoSpec engine at',
    '[github.com/taucad/geospec](https://github.com/taucad/geospec).',
    '',
    'Tau includes third-party software, listed on this page with its licenses. Each component remains under its own',
    'license, and nothing in our [Terms of Service](/legal/terms) limits the rights those licenses give you.',
    '',
    '## Open CASCADE Technology',
    '',
    'Tau makes use of, and is based in part on, facilities provided by the **Open CASCADE Technology** software',
    '(OCCT), Copyright © Open CASCADE SAS. OCCT is licensed under the',
    '[GNU Lesser General Public License version 2.1](#gnu-lesser-general-public-license-version-2.1) with the',
    '[Open CASCADE exception version 1.0](#open-cascade-exception-version-1.0), both reproduced in full below.',
    '',
    'OCCT runs in the web and desktop apps as WebAssembly and, in the desktop app, as a native library, through these',
    'components:',
    '',
    `- The GeoSpec engine (\`${engineName}\` ${engine.version}), built from OCCT upstream`,
    `  revision \`${engine.occtRevision}\` ([source](https://github.com/taucad/geospec))`,
    ...occtPackages.map((packageInfo) => `- ${packageInfo.name} ${packageInfo.version}${repositoryLink(packageInfo)}`),
    '',
    'You may modify the OCCT portions of Tau for your own use, and reverse engineer them to debug such modifications.',
    'Every Tau web and desktop release on [GitHub Releases](https://github.com/taucad/tau/releases) attaches the',
    'corresponding OCCT source and relink kit, these license texts and the GeoSpec engine notices. The macOS app also',
    'carries the kit inside the app bundle, under `Tau.app/Contents/Resources/SOURCES`. The source of the GeoSpec engine,',
    'including how it builds and links OCCT, is at [github.com/taucad/geospec](https://github.com/taucad/geospec).',
    '',
    '## Third-Party Packages',
    '',
    `The web and desktop apps include the following ${String(sorted.length)} packages, with the license each declares.`,
    'Their copyright notices and full license texts ship inside each package and are available from its source.',
    '',
    '| Package | Version | License |',
    '|---------|---------|---------|',
    ...sorted.map(
      (packageInfo) =>
        `| ${packageInfo.repository?.startsWith('https://') ? `[${packageInfo.name}](${packageInfo.repository})` : packageInfo.name} | ${packageInfo.version} | ${packageInfo.license === 'UNKNOWN' ? 'Not declared' : packageInfo.license} |`,
    ),
    '',
    '## Vendored tscircuit Engine',
    '',
    'The circuit kernel bundles the following components. Their full license texts accompany the',
    '[tscircuit plugin](https://github.com/taucad/tau/blob/main/packages/plugins/tscircuit/THIRD_PARTY_LICENSES.md).',
    '',
    '| Component | Version | License |',
    '|-----------|---------|---------|',
    ...vendored.map(
      (component) =>
        `| ${component.name} | ${component.version} | ${component.status === 'CLEARED' ? component.license : `${component.license}, license text pending`} |`,
    ),
    '',
    '## Desktop C# Runtime',
    '',
    "The desktop app's PicoGK C# kernel runs on the following components, each licensed under the",
    '[MIT License](#mit-license) reproduced below with its copyright notice. Their license files, and the',
    'third-party notices of the .NET runtime and SkiaSharp, ship beside the kernel inside the app bundle, under',
    '`Tau.app/Contents/Resources/picogk/darwin-arm64`.',
    '',
    '| Component | Package | Version | Copyright |',
    '|-----------|---------|---------|-----------|',
    ...desktopRuntime.components.map(
      (component) =>
        `| [${component.name}](${component.source}) | ${component.package} | ${component.version} | ${component.copyright} |`,
    ),
    '',
    '## MIT License',
    '',
    ...fence(desktopRuntime.mitLicense),
    '',
    '## GNU Lesser General Public License version 2.1',
    '',
    ...fence(lgpl),
    '',
    '## Open CASCADE Exception version 1.0',
    '',
    ...fence(occtException),
    '',
    '---',
    '',
    'If you think a license or credit is missing or wrong, please',
    '[file an issue](https://github.com/taucad/tau/issues/new).',
    '',
  ];

  return lines.join('\n');
}

async function main(): Promise<void> {
  const isCheck = process.argv.includes('--check');

  const closure = await collectAppClosure();
  const engineDirectory = await resolvePackageDirectory(engineName, appDirectories[0]!);
  if (!engineDirectory) {
    throw new Error(`${engineName} is not installed for apps/ui; run pnpm install.`);
  }
  const engineManifest = await readManifest(engineDirectory);
  const engineInfo = engineManifest && toPackageInfo(engineManifest);
  if (engineManifest?.name !== engineName || !engineManifest.version || !engineInfo) {
    throw new Error(`The installed ${engineName} manifest is invalid.`);
  }
  const packages = [
    ...new Map(
      [
        ...selectThirdPartyPackages(closure, rootDirectory),
        ...enginePlatformPackages(engineInfo, engineManifest.optionalDependencies),
      ].map((packageInfo) => [`${packageInfo.name}@${packageInfo.version}`, packageInfo]),
    ).values(),
  ];
  const occtLicenseDirectory = join(engineDirectory, 'licenses');
  const [tscircuitRecord, desktopRuntimeRecord, picoGkWorkerLock, lgpl, occtException, sourceRelink] =
    await Promise.all([
      readFile(tscircuitLicenseFile, 'utf8'),
      readFile(desktopRuntimeFile, 'utf8'),
      readFile(picoGkWorkerLockFile, 'utf8'),
      readFile(join(occtLicenseDirectory, 'OCCT-LGPL-2.1.txt'), 'utf8'),
      readFile(join(occtLicenseDirectory, 'OCCT-LGPL-exception.txt'), 'utf8'),
      readFile(join(occtLicenseDirectory, 'SOURCE-RELINK.json'), 'utf8'),
    ]);
  const desktopRuntime = JSON.parse(desktopRuntimeRecord) as DesktopRuntimeNotices;
  const drift = desktopRuntimeDrift(
    desktopRuntime,
    JSON.parse(picoGkWorkerLock) as Parameters<typeof desktopRuntimeDrift>[1],
  );
  if (drift.length > 0) {
    console.error(
      `\n\u001B[31mERROR\u001B[0m  ${desktopRuntimeFile} disagrees with the PicoGK worker lock: ${drift.join('; ')}\n`,
    );
    process.exit(1);
  }
  const notices = generateNotices({
    packages,
    vendored: parseVendoredComponents(tscircuitRecord),
    desktopRuntime,
    lgpl,
    occtException,
    engine: { version: engineManifest.version, occtRevision: parseOcctRevision(sourceRelink) },
  });
  console.log(`App closure: ${String(closure.length)} packages, ${String(packages.length)} third-party listed`);

  if (isCheck) {
    const existing = await readFile(outputFile, 'utf8').catch(() => undefined);
    if (existing !== notices) {
      console.error(
        '\n\u001B[31mERROR\u001B[0m  Open-source notices are out of date. Run: pnpm update-open-source-notices\n',
      );
      process.exit(1);
    }

    console.log('Open-source notices are up to date.');
    return;
  }

  await writeFile(outputFile, notices, 'utf8');
  console.log(`Written to ${outputFile}`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await main();
}
