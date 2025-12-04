/**
 * Script to scan node_modules and generate license-deps file.
 *
 * This script extracts license information from all installed packages
 * and outputs a formatted markdown file grouped by license type.
 *
 * Usage: node --import tsx scripts/update-license-deps.mts
 */

import { readdir, readFile, writeFile, stat } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const rootDir = join(__dirname, '..');
const nodeModulesDir = join(rootDir, 'node_modules');
const outputFile = join(rootDir, 'license-deps');

type PackageInfo = {
  name: string;
  version: string;
  license: string;
  repository?: string;
  author?: string;
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
    const pkg = JSON.parse(content) as Record<string, unknown>;

    const name = pkg['name'] as string | undefined;
    const version = pkg['version'] as string | undefined;
    let license = pkg['license'] as string | undefined;

    if (!name || !version) {
      return undefined;
    }

    // Handle license objects
    if (typeof pkg['license'] === 'object' && pkg['license'] !== null) {
      const licenseObject = pkg['license'] as Record<string, unknown>;
      license = licenseObject['type'] as string | undefined;
    }

    // Handle licenses array
    if (Array.isArray(pkg['licenses']) && pkg['licenses'].length > 0) {
      const licenses = pkg['licenses'] as Array<Record<string, unknown>>;
      license = licenses
        .map((l) => {
          const { type } = l as { type?: unknown };
          return typeof type === 'string' ? type : JSON.stringify(l);
        })
        .join(' OR ');
    }

    // Extract repository URL
    let repository: string | undefined;
    if (typeof pkg['repository'] === 'string') {
      repository = pkg['repository'];
    } else if (typeof pkg['repository'] === 'object' && pkg['repository'] !== null) {
      const repositoryObject = pkg['repository'] as Record<string, unknown>;
      repository = repositoryObject['url'] as string | undefined;
    }

    // Normalize repository URL to a clickable HTTPS link
    repository &&= normalizeGithubUrl(repository);

    // Extract author
    let author: string | undefined;
    if (typeof pkg['author'] === 'string') {
      author = pkg['author'];
    } else if (typeof pkg['author'] === 'object' && pkg['author'] !== null) {
      const authorObject = pkg['author'] as Record<string, unknown>;
      author = authorObject['name'] as string | undefined;
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
async function scanDirectory(dir: string): Promise<PackageInfo[]> {
  const packages: PackageInfo[] = [];

  try {
    const entries = await readdir(dir);

    for (const entryName of entries) {
      // Skip hidden files and special pnpm directories
      if (entryName.startsWith('.')) {
        continue;
      }

      const packagePath = join(dir, entryName);

      // Check if it's a directory (follows symlinks)
      // eslint-disable-next-line no-await-in-loop -- Sequential scanning is intentional for memory efficiency
      const isDir = await isDirectory(packagePath);
      if (!isDir) {
        continue;
      }

      // Handle scoped packages (@org/package)
      if (entryName.startsWith('@')) {
        // eslint-disable-next-line no-await-in-loop -- Sequential scanning is intentional for memory efficiency
        const scopedPackages = await scanDirectory(packagePath);
        packages.push(...scopedPackages);
      } else {
        // eslint-disable-next-line no-await-in-loop -- Sequential scanning is intentional for memory efficiency
        const pkgInfo = await readPackageJson(packagePath);
        if (pkgInfo) {
          packages.push(pkgInfo);
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

  for (const pkg of packages) {
    const { license } = pkg;
    const existing = groups.get(license) ?? [];
    existing.push(pkg);
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

  // GPL-2.0 specific notice
  if (upper.includes('GPL-2.0')) {
    return [
      '> **GPL-2.0 License Notice**',
      '>',
      '> This component is licensed under the GNU General Public License v2.0 or later.',
      '> When you use Tau with this component, you have the following rights:',
      '>',
      '> - **Freedom to use** the software for any purpose',
      '> - **Freedom to study** how the program works (source code available)',
      '> - **Freedom to redistribute** copies',
      '> - **Freedom to modify** and distribute modified versions',
      '>',
      '> The complete source code is available at: https://github.com/taucad/tau',
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
      '> This component is licensed under the GNU General Public License v3.0.',
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
    'Tau is dual-licensed:',
    '',
    '- **MIT License** — For all components except the OpenSCAD kernel',
    '- **GPL-2.0-or-later** — When using the OpenSCAD kernel (due to `openscad-wasm-prebuilt`)',
    '',
    'If you use Tau **without** the OpenSCAD kernel, the entire codebase is available under',
    'the permissive [MIT License](./LICENSE). If you use Tau **with** the OpenSCAD kernel,',
    'the combined work is subject to GPL-2.0-or-later terms.',
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

    for (const pkg of group.packages) {
      const repoLink = pkg.repository ? ` — [Repository](${pkg.repository})` : '';
      lines.push(`- **${pkg.name}** v${pkg.version}${repoLink}`);
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

/**
 * Main function.
 */
async function main(): Promise<void> {
  console.log('Scanning node_modules for package licenses...');

  const packages = await scanDirectory(nodeModulesDir);
  console.log(`Found ${packages.length} packages`);

  const groups = groupByLicense(packages);
  console.log(`Grouped into ${groups.length} license types`);

  const markdown = generateMarkdown(groups);

  await writeFile(outputFile, markdown, 'utf8');
  console.log(`Written to ${outputFile}`);

  // Print summary
  console.log('\nLicense Summary:');
  for (const group of groups) {
    console.log(`  ${group.license}: ${group.packages.length} packages`);
  }
}

await main().catch((error: unknown) => {
  console.error('Error:', error);
  throw error;
});
