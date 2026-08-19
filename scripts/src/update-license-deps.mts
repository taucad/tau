/**
 * Script to generate the license-deps file.
 *
 * It walks the dependency closure that actually ships in the published
 * `@taucad/runtime` artifact (the file is copied into its dist as
 * THIRD_PARTY_LICENSES.md), extracts license information from each package and
 * outputs a formatted markdown file grouped by license type.
 *
 * Usage: node --import tsx scripts/src/update-license-deps.mts
 */

import { readFile, writeFile, stat, access, realpath } from 'node:fs/promises';
import { join, dirname, sep } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import process from 'node:process';

const __dirname = dirname(fileURLToPath(import.meta.url));
const rootDirectory = join(__dirname, '../..');
const runtimeDirectory = join(rootDirectory, 'packages/runtime');
const outputFile = join(rootDirectory, 'license-deps');

type PackageInfo = {
  name: string;
  version: string;
  license: string;
  repository?: string;
  author?: string;
};

/** A resolved package plus the real directory it was resolved from. */
type ScannedPackage = PackageInfo & { directory: string };

type PackageJsonRaw = {
  name?: string;
  version?: string;
  license?: string | { type?: string };
  licenses?: Array<{ type?: string }>;
  repository?: string | { url?: string };
  author?: string | { name?: string };
  dependencies?: Record<string, string>;
  optionalDependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
};

type LicenseGroup = {
  license: string;
  packages: PackageInfo[];
};

/**
 * Normalize a repository URL to a clickable HTTPS GitHub link.
 * Handles various formats: git@github.com:, github:, owner/repo shorthand, etc.
 */
function normalizeGithubUrl(url: string): string {
  let normalized = url
    // Remove git+ prefix
    .replace(/^git\+/, '')
    // Convert git:// to https://
    .replace(/^git:\/\//, 'https://')
    // Remove .git suffix
    .replace(/\.git$/, '')
    // Convert ssh://git@ to https://
    .replace(/^ssh:\/\/git@/, 'https://')
    // Convert git@github.com:owner/repo to https://github.com/owner/repo
    .replace(/^git@github\.com:/, 'https://github.com/')
    // Convert github:owner/repo to https://github.com/owner/repo
    .replace(/^github:/, 'https://github.com/')
    // Fix URLs with colon instead of slash after github.com (e.g., https://github.com:owner/repo)
    .replace(/^https:\/\/github\.com:/, 'https://github.com/');

  // Convert shorthand owner/repo format to full GitHub URL
  // Only if it looks like a GitHub shorthand (contains exactly one slash, no protocol, no spaces)
  const isShorthand =
    !normalized.startsWith('http://') && !normalized.startsWith('https://') && /^[\w-]+\/[\w.-]+$/.test(normalized);

  if (isShorthand) {
    normalized = `https://github.com/${normalized}`;
  }

  return normalized;
}

/**
 * Read and parse package.json from a directory.
 */
async function readManifest(packagePath: string): Promise<PackageJsonRaw | undefined> {
  try {
    return JSON.parse(await readFile(join(packagePath, 'package.json'), 'utf8')) as PackageJsonRaw;
  } catch {
    return undefined;
  }
}

/**
 * Extract the attribution fields Tau publishes for one package.
 */
function toPackageInfo(packageJson: PackageJsonRaw): PackageInfo | undefined {
  const {
    name,
    version,
    license: licenseField,
    licenses: licensesField,
    repository: repositoryField,
    author: authorField,
  } = packageJson;

  if (!name || !version) {
    return undefined;
  }

  let license: string | undefined;
  if (typeof licenseField === 'string') {
    license = licenseField;
  } else if (typeof licenseField === 'object') {
    license = licenseField.type;
  }

  if (Array.isArray(licensesField) && licensesField.length > 0) {
    license = licensesField.map((l) => l.type ?? JSON.stringify(l)).join(' OR ');
  }

  let repository: string | undefined;
  if (typeof repositoryField === 'string') {
    repository = repositoryField;
  } else if (typeof repositoryField === 'object') {
    repository = repositoryField.url;
  }

  repository &&= normalizeGithubUrl(repository);

  let author: string | undefined;
  if (typeof authorField === 'string') {
    author = authorField;
  } else if (typeof authorField === 'object') {
    author = authorField.name;
  }

  return {
    name,
    version,
    license: license ?? 'UNKNOWN',
    repository,
    author,
  };
}

/**
 * Check if a path is a directory (following symlinks).
 */
async function isDirectory(path: string): Promise<boolean> {
  try {
    const stats = await stat(path);
    return stats.isDirectory();
  } catch {
    return false;
  }
}

/**
 * Resolve a dependency to its real directory with Node's node_modules lookup,
 * starting at the dependent's own directory. pnpm puts a package's dependencies
 * in the node_modules beside its real path, so resolving from the real path of
 * each dependent walks the true closure rather than the hoisted root.
 */
async function resolvePackageDirectory(name: string, fromDirectory: string): Promise<string | undefined> {
  let directory = fromDirectory;

  for (;;) {
    const candidate = join(directory, 'node_modules', name);
    // oxlint-disable-next-line no-await-in-loop -- Ancestors must be probed in order.
    if (await isDirectory(candidate)) {
      return realpath(candidate);
    }

    const parent = dirname(directory);
    if (parent === directory) {
      return undefined;
    }

    directory = parent;
  }
}

/**
 * Collect the dependency closure that ships in the published runtime artifact:
 * the runtime's own production and optional dependencies, plus those of the
 * workspace libraries bundled into its dist (their code ships inside it).
 *
 * The bundled libraries are the runtime's `workspace:` devDependencies — that is
 * what `packages/runtime/scripts/runtime-bundled-packages.mts` enumerates, and a
 * library can only be bundled if it is depended on that way (a published
 * dependency would have to be a real `dependencies` entry instead).
 *
 * peerDependencies are deliberately excluded: the host application supplies
 * them, so Tau does not distribute them and owes no attribution for them.
 */
async function collectRuntimeClosure(): Promise<ScannedPackage[]> {
  const runtimeManifest = await readManifest(runtimeDirectory);
  const bundledLibraries = Object.entries(runtimeManifest?.devDependencies ?? {})
    .filter(([, specifier]) => specifier.startsWith('workspace:'))
    .map(([name]) => name);

  const queue = [
    ...Object.keys({ ...runtimeManifest?.dependencies, ...runtimeManifest?.optionalDependencies }),
    ...bundledLibraries,
  ].map((name) => ({ name, from: runtimeDirectory }));

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

    packages.push({ ...packageInfo, directory });
    for (const dependencyName of Object.keys({ ...manifest.dependencies, ...manifest.optionalDependencies })) {
      queue.push({ name: dependencyName, from: directory });
    }
  }

  return packages;
}

/**
 * Drop first-party packages from the manifest.
 *
 * A package is first-party when it is a **workspace project** — its real path is
 * inside the repository and outside any node_modules directory. The test is the
 * resolved path, never the name: `@taucad/kcl-wasm-lib` is published to the
 * registry, resolves inside node_modules and stays; `geospec` and the
 * `@taucad/*` workspace libraries resolve to source directories and go.
 *
 * Workspace versions are what made this file self-invalidating: `nx release`
 * rewrites them in the very commit the release tag points at.
 */
export function selectThirdPartyPackages(packages: ScannedPackage[], repositoryRoot: string): PackageInfo[] {
  return packages
    .filter(
      ({ directory }) =>
        !(directory.startsWith(repositoryRoot + sep) && !directory.includes(`${sep}node_modules${sep}`)),
    )
    .map(({ directory, ...packageInfo }) => packageInfo);
}

/**
 * Group packages by license type.
 */
function groupByLicense(packages: PackageInfo[]): LicenseGroup[] {
  const groups = new Map<string, PackageInfo[]>();

  for (const packageInfo of packages) {
    const { license } = packageInfo;
    const existing = groups.get(license) ?? [];
    existing.push(packageInfo);
    groups.set(license, existing);
  }

  // Convert to array and sort
  const result: LicenseGroup[] = [];

  for (const [license, pkgs] of groups) {
    result.push({
      license,
      // Version breaks ties so two copies of one package cannot reorder with the walk.
      packages: pkgs.sort((a, b) => a.name.localeCompare(b.name) || a.version.localeCompare(b.version)),
    });
  }

  // Custom sort order: GPL first, then Apache, then others alphabetically, MIT last
  const licenseOrder = (license: string): number => {
    const upper = license.toUpperCase();
    if (upper.includes('GPL')) {
      return 0;
    }

    if (upper.includes('APACHE')) {
      return 1;
    }

    if (upper === 'MIT') {
      return 100;
    }

    return 50;
  };

  result.sort((a, b) => {
    const orderA = licenseOrder(a.license);
    const orderB = licenseOrder(b.license);
    if (orderA !== orderB) {
      return orderA - orderB;
    }

    return a.license.localeCompare(b.license);
  });

  return result;
}

/**
 * Get the appropriate license notice for a license type.
 */
function getLicenseNotice(license: string): string[] {
  const upper = license.toUpperCase();

  // Check for dual-licensed packages where MIT is an option
  if (upper.includes('MIT OR') || upper.includes('OR MIT')) {
    return ['> This package is dual-licensed. Tau uses it under the **MIT License** terms.', ''];
  }

  // AGPL is distinct from GPL and must be checked before the GPL-3.0 substring match.
  if (upper.includes('AGPL')) {
    return [
      '> **AGPL-3.0 License Notice**',
      '>',
      '> This component is licensed under AGPL-3.0-only. Source is available at',
      '> https://github.com/taucad/tau, and the component ships with the AGPL text',
      "> plus Tau's applicable Section 7 additional permission.",
      '>',
      '> Full license text: https://www.gnu.org/licenses/agpl-3.0.html',
      '',
    ];
  }

  // LGPL notice (library copyleft — checked before plain GPL so LGPL-3.0 doesn't
  // fall through to the GPL-3.0 branch)
  if (upper.includes('LGPL')) {
    return [
      '> **LGPL License Notice**',
      '>',
      '> Library-style copyleft. Tau consumes these packages as libraries; the LGPL',
      '> obligation is satisfied by attribution and source availability.',
      '>',
      '> Source for Tau forks of LGPL libraries is available at: https://github.com/taucad',
      '',
    ];
  }

  // GPL-2.0 specific notice
  if (upper.includes('GPL-2.0')) {
    return [
      '> **GPL-2.0-or-later License Notice**',
      '>',
      '> A distribution of Tau that includes this component is a GPL-2.0-or-later',
      '> combined work. To comply:',
      '>',
      '> - **Make source available** — the Tau source is published at https://github.com/taucad/tau',
      '> - **Ship the GPL license text** alongside the bundled WASM/binary',
      '>',
      '> Distributions that exclude this component carry no GPL obligation.',
      '>',
      '> Full license text: https://www.gnu.org/licenses/gpl-2.0.html',
      '',
    ];
  }

  // GPL-3.0 specific notice
  if (upper.includes('GPL-3.0') || upper.includes('GPL-3')) {
    return [
      '> **GPL-3.0 License Notice**',
      '>',
      '> A distribution of Tau that includes this component is a GPL-3.0 combined',
      '> work; source must be available (https://github.com/taucad/tau) and the GPL',
      '> license text must ship with the binary.',
      '>',
      '> Full license text: https://www.gnu.org/licenses/gpl-3.0.html',
      '',
    ];
  }

  // Generic GPL notice
  if (upper.includes('GPL')) {
    return [
      '> **GPL License Notice**',
      '>',
      '> GPL-licensed packages require that derivative works be distributed under compatible licenses.',
      '> Source code is available at: https://github.com/taucad/tau',
      '',
    ];
  }

  // Apache-2.0 notice
  if (upper.includes('APACHE')) {
    return ['> Apache-2.0 licensed packages require preservation of copyright notices and disclaimers.', ''];
  }

  if (upper.includes('BSL-1.0') || upper.includes('BOOST')) {
    return [
      '> Boost Software License 1.0 packages are permissive and compatible with Tau distribution.',
      '> Preserve copyright notices and license disclaimers in third-party notices.',
      '',
    ];
  }

  return [];
}

/**
 * Generate markdown output.
 */
function generateMarkdown(groups: LicenseGroup[]): string {
  const lines: string[] = [
    '# Third-Party Licenses',
    '',
    'This file lists the third-party dependencies distributed with the published `@taucad/runtime`',
    'artifact — its production and optional dependency closure, plus that of the workspace libraries',
    'bundled into it — and their respective licenses. It ships inside the artifact as',
    '`THIRD_PARTY_LICENSES.md`.',
    '',
    '## Licensing Overview',
    '',
    'Tau source is licensed per directory. The repository root and published perimeter',
    'packages are **[Apache-2.0](./license)**; `apps/ui`, `apps/api`, and every',
    'application library under `apps/libs/*` are AGPL-3.0-only; the GeoSpec engine is fair source under',
    'FSL-1.1-Apache-2.0, converting to Apache-2.0 two years after each release.',
    'Routing map: **[LICENSING.md](./LICENSING.md)**.',
    '',
    'Some third-party dependencies impose additional obligations on **combined',
    'distributions** that include them:',
    '',
    '- **LGPL-2.1 / LGPL-3.0 libraries** (see sections below) — Library-style',
    '  copyleft; satisfied by attribution and source availability.',
    '',
    'By using Tau, you agree to comply with the license terms of all included dependencies.',
    '',
    `*Generated on ${new Date().toISOString().split('T')[0]}*`,
    '',
    '## Summary',
    '',
    '| License | Count |',
    '|---------|-------|',
  ];

  for (const group of groups) {
    lines.push(`| ${group.license} | ${group.packages.length} |`);
  }

  lines.push('');

  // Detailed sections
  for (const group of groups) {
    lines.push(`## ${group.license}`, '');

    // Add appropriate license notice
    const notice = getLicenseNotice(group.license);
    lines.push(...notice);

    for (const packageInfo of group.packages) {
      const repoLink = packageInfo.repository ? ` — [Repository](${packageInfo.repository})` : '';
      lines.push(`- **${packageInfo.name}** v${packageInfo.version}${repoLink}`);
    }

    lines.push('');
  }

  // Add footer with source code availability notice
  lines.push(
    '---',
    '',
    '## Source Code Availability',
    '',
    'The complete source code for Tau, including all modifications to third-party components,',
    'is available at: https://github.com/taucad/tau',
    '',
    'For GPL-licensed components, you may obtain the corresponding source code by:',
    '1. Cloning the repository: `git clone https://github.com/taucad/tau.git`',
    '2. Downloading from: https://github.com/taucad/tau/archive/refs/heads/main.zip',
    '',
    '---',
    '',
    'Please [file an issue](https://github.com/taucad/tau/issues/new) if you think a license',
    'or credits are missing or misrepresented!',
    '',
  );

  return lines.join('\n');
}

const stripGeneratedDate = (content: string): string =>
  content.replace(/^\*Generated on \d{4}-\d{2}-\d{2}\*$/m, '*Generated on DATE*');

/**
 * Main function.
 *
 * --check: validate that license-deps is up to date without writing (for CI)
 */
async function main(): Promise<void> {
  const isCheck = process.argv.includes('--check');

  console.log('Scanning the published runtime dependency closure for package licenses...');

  const closure = await collectRuntimeClosure();
  const thirdParty = selectThirdPartyPackages(closure, rootDirectory);
  const packages = [
    ...new Map(thirdParty.map((packageInfo) => [`${packageInfo.name}@${packageInfo.version}`, packageInfo])).values(),
  ];
  console.log(
    `Runtime closure: ${closure.length} packages, ${closure.length - thirdParty.length} first-party excluded, ${packages.length} listed`,
  );

  const groups = groupByLicense(packages);
  console.log(`Grouped into ${groups.length} license types`);

  const markdown = generateMarkdown(groups);

  if (isCheck) {
    try {
      await access(outputFile);
    } catch {
      console.error(`\n\u001B[31mERROR\u001B[0m  ${outputFile} does not exist. Run: pnpm update-license-deps\n`);
      process.exit(1);
    }

    const existing = await readFile(outputFile, 'utf8');
    const normalizedExisting = stripGeneratedDate(existing);
    const normalizedGenerated = stripGeneratedDate(markdown);

    if (normalizedExisting === normalizedGenerated) {
      console.log('\nlicense-deps is up to date.');
    } else {
      console.error('\n\u001B[31mERROR\u001B[0m  license-deps is out of date. Run: pnpm update-license-deps\n');
      process.exit(1);
    }
    return;
  }

  await writeFile(outputFile, markdown, 'utf8');
  console.log(`Written to ${outputFile}`);

  console.log('\nLicense Summary:');
  for (const group of groups) {
    console.log(`  ${group.license}: ${group.packages.length} packages`);
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await main().catch((error: unknown) => {
    console.error('Error:', error);
    throw error;
  });
}
