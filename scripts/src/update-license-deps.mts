/**
 * Script to scan node_modules and generate license-deps file.
 *
 * This script extracts license information from all installed packages
 * and outputs a formatted markdown file grouped by license type.
 *
 * Usage: node --import tsx scripts/src/update-license-deps.mts
 */

import { readdir, readFile, writeFile, stat, access } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import process from 'node:process';

const __dirname = dirname(fileURLToPath(import.meta.url));
const rootDirectory = join(__dirname, '../..');
const nodeModulesDirectory = join(rootDirectory, 'node_modules');
const outputFile = join(rootDirectory, 'license-deps');

type PackageInfo = {
  name: string;
  version: string;
  license: string;
  repository?: string;
  author?: string;
};

type PackageJsonRaw = {
  name?: string;
  version?: string;
  license?: string | { type?: string };
  licenses?: Array<{ type?: string }>;
  repository?: string | { url?: string };
  author?: string | { name?: string };
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
async function readPackageJson(packagePath: string): Promise<PackageInfo | undefined> {
  try {
    const packageJsonPath = join(packagePath, 'package.json');
    const content = await readFile(packageJsonPath, 'utf8');
    const packageJson = JSON.parse(content) as PackageJsonRaw;

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
  } catch {
    return undefined;
  }
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
 * Scan a directory for packages.
 * Handles pnpm's symlinked structure by following symlinks.
 */
async function scanDirectory(directory: string): Promise<PackageInfo[]> {
  const packages: PackageInfo[] = [];

  try {
    const entries = await readdir(directory);

    for (const entryName of entries) {
      // Skip hidden files and special pnpm directories
      if (entryName.startsWith('.')) {
        continue;
      }

      const packagePath = join(directory, entryName);

      // Check if it's a directory (follows symlinks)
      // oxlint-disable-next-line no-await-in-loop -- Sequential scanning is intentional for memory efficiency
      const isDirectoryResult = await isDirectory(packagePath);
      if (!isDirectoryResult) {
        continue;
      }

      // Handle scoped packages (@org/package)
      if (entryName.startsWith('@')) {
        // oxlint-disable-next-line no-await-in-loop -- Sequential scanning is intentional for memory efficiency
        const scopedPackages = await scanDirectory(packagePath);
        packages.push(...scopedPackages);
      } else {
        // oxlint-disable-next-line no-await-in-loop -- Sequential scanning is intentional for memory efficiency
        const packageInfo = await readPackageJson(packagePath);
        if (packageInfo) {
          packages.push(packageInfo);
        }
      }
    }
  } catch {
    // Directory doesn't exist or can't be read
  }

  return packages;
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
      packages: pkgs.sort((a, b) => a.name.localeCompare(b.name)),
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

  // GPL-2.0 specific notice (applies to openscad-wasm-prebuilt — the only
  // plain-GPL dependency in Tau)
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
    'This file lists all third-party dependencies used by Tau and their respective licenses.',
    '',
    '## Licensing Overview',
    '',
    'Tau source is **[MIT-licensed](./license)**. The MIT license applies to all',
    'files authored by the Tau project.',
    '',
    'Some third-party dependencies impose additional obligations on **combined',
    'distributions** that include them:',
    '',
    '- **`openscad-wasm-prebuilt` (GPL-2.0-or-later)** — Bundled exclusively by',
    '  the standalone `@taucad/openscad` package, which is itself published under',
    '  GPL-2.0-or-later for license clarity. A distribution that includes',
    '  `@taucad/openscad` is a GPL-2.0-or-later combined work; source must be',
    '  available (it is, at https://github.com/taucad/tau) and the GPL license',
    '  text must accompany the OpenSCAD WASM.',
    '- **LGPL-2.1 / LGPL-3.0 libraries** (see sections below) — Library-style',
    '  copyleft; satisfied by attribution and source availability.',
    '',
    'Distributions that exclude `@taucad/openscad` carry no GPL obligation.',
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

  console.log('Scanning node_modules for package licenses...');

  const packages = await scanDirectory(nodeModulesDirectory);
  console.log(`Found ${packages.length} packages`);

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

await main().catch((error: unknown) => {
  console.error('Error:', error);
  throw error;
});
