/**
 * Script to generate the open-source notices the web and desktop apps show.
 *
 * It walks the production dependency closure of `apps/ui` and `apps/desktop`
 * (through the workspace libraries they bundle), lists every third-party
 * package with its declared license, names the vendored tscircuit engine
 * components from their own license record, and carries the Open CASCADE
 * Technology notice with the unmodified LGPL-2.1 and Open CASCADE exception
 * texts. The UI renders the file at `/legal/open-source`; the macOS package
 * ships the same file inside the app bundle.
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
const occtLicenseDirectory = join(rootDirectory, 'packages/geospec-engine-native/licenses');
const tscircuitLicenseFile = join(rootDirectory, 'packages/plugins/tscircuit/THIRD_PARTY_LICENSES.md');
export const outputFile = join(rootDirectory, 'apps/ui/app/routes/legal.open-source/open-source-notices.txt');

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

/** Fence a license text so Markdown renders it verbatim. */
const fence = (text: string): string[] => ['```text', text.replace(/\s+$/, ''), '```'];

const repositoryLink = (packageInfo: PackageInfo): string =>
  packageInfo.repository?.startsWith('https://') ? ` ([source](${packageInfo.repository}))` : '';

export function generateNotices(input: {
  packages: PackageInfo[];
  vendored: VendoredComponent[];
  lgpl: string;
  occtException: string;
}): string {
  const { packages, vendored, lgpl, occtException } = input;
  const sorted = packages.toSorted((a, b) => a.name.localeCompare(b.name) || a.version.localeCompare(b.version));
  const occtPackages = sorted.filter(({ name }) =>
    ['libcascade', 'occt-import-js', 'replicad-opencascadejs'].includes(name),
  );

  const lines: string[] = [
    '# Open-Source Notices',
    '',
    'Tau is open-source software. All Tau-authored source, including the GeoSpec engine, is licensed under the',
    '[Apache License 2.0](https://github.com/taucad/tau/blob/main/license), and its complete source is published at',
    '[github.com/taucad/tau](https://github.com/taucad/tau).',
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
    '- The GeoSpec engine (`@taucad/geospec-engine-native`), built from OCCT upstream',
    '  revision `3d097a0328e71b826377d4814ab05ec3c3d23871`',
    ...occtPackages.map((packageInfo) => `- ${packageInfo.name} ${packageInfo.version}${repositoryLink(packageInfo)}`),
    '',
    'You may modify the OCCT portions of Tau for your own use, and reverse engineer them to debug such modifications.',
    'Every Tau web and desktop release on [GitHub Releases](https://github.com/taucad/tau/releases) attaches the',
    'corresponding OCCT source and relink kit, these license texts and the GeoSpec engine notices. The macOS app also',
    'carries the kit inside the app bundle, under `Tau.app/Contents/Resources/SOURCES`. The source of Tau, including how',
    'it builds and links OCCT, is at [github.com/taucad/tau](https://github.com/taucad/tau).',
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
  const packages = [
    ...new Map(
      selectThirdPartyPackages(closure, rootDirectory).map((packageInfo) => [
        `${packageInfo.name}@${packageInfo.version}`,
        packageInfo,
      ]),
    ).values(),
  ];
  const [tscircuitRecord, lgpl, occtException] = await Promise.all([
    readFile(tscircuitLicenseFile, 'utf8'),
    readFile(join(occtLicenseDirectory, 'OCCT-LGPL-2.1.txt'), 'utf8'),
    readFile(join(occtLicenseDirectory, 'OCCT-LGPL-exception.txt'), 'utf8'),
  ]);
  const notices = generateNotices({
    packages,
    vendored: parseVendoredComponents(tscircuitRecord),
    lgpl,
    occtException,
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
