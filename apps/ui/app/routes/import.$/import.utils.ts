/**
 * Import route utilities and derived constants.
 */
import { kernelConfigurations, languageFromExtension } from '@taucad/types/constants';
import type { CodeLanguage } from '@taucad/types';

/**
 * Map of kernel language to file extension.
 * Derived by inverting languageFromExtension.
 */
// oxlint-disable-next-line unicorn/no-array-reduce -- inverting a mapping
const extensionFromLanguage = Object.entries(languageFromExtension).reduce(
  (accumulator, [extension, language]) => {
    accumulator[language] = `.${extension}`;
    return accumulator;
  },
  {} as Record<CodeLanguage, string>,
);

/**
 * Main file names for each kernel (e.g., 'main.scad', 'main.ts').
 * Derived from kernel configurations.
 */
export const kernelMainFiles = kernelConfigurations.map((config) => config.mainFile);

/**
 * Supported file extensions for kernel files.
 */
export const supportedKernelExtensions = [
  ...new Set(kernelConfigurations.map((config) => extensionFromLanguage[config.language])),
];

/**
 * All file extensions accepted for import (kernel files + common project files).
 */
export const importAcceptedExtensions = [...supportedKernelExtensions, '.json', '.txt', '.md', '.js', '.jsx'];

/**
 * File accept string for HTML file input elements.
 * Includes .zip for archive uploads.
 */
export const importFileAcceptString = ['.zip', ...importAcceptedExtensions].join(',');

/**
 * GitHub repository info parsed from URL.
 */
export type GitHubRepoInfo = {
  owner: string;
  repo: string;
  ref: string;
  mainFile: string;
};

/**
 * Parse GitHub URL and extract owner/repo.
 */
export function parseGitHubUrl(url: string): { owner: string; repo: string } | undefined {
  try {
    const parsed = new URL(url);

    // Only allow github.com
    if (parsed.hostname !== 'github.com') {
      return undefined;
    }

    // Parse /owner/repo or /owner/repo.git
    const pathParts = parsed.pathname.split('/').filter(Boolean);
    if (pathParts.length < 2) {
      return undefined;
    }

    const [owner, repoRaw] = pathParts;
    if (!owner || !repoRaw) {
      return undefined;
    }

    const repo = repoRaw.replace(/\.git$/, '');

    return { owner, repo };
  } catch {
    return undefined;
  }
}

/**
 * Normalize a GitHub URL from the path.
 * Browser may normalize https:// to https:/ in URL paths.
 */
export function normalizeGitHubUrl(splatPath: string): string {
  let repoUrl = splatPath;

  // Handle various URL formats and normalize to https://github.com/...

  // Handle fully encoded protocol (https%3A%2F%2F or https%3a%2f%2f)
  if (repoUrl.startsWith('https%3A%2F%2F') || repoUrl.startsWith('https%3a%2f%2f')) {
    repoUrl = repoUrl.replace(/^https%3[Aa]%2[Ff]%2[Ff]/, 'https://');
  }

  if (repoUrl.startsWith('http%3A%2F%2F') || repoUrl.startsWith('http%3a%2f%2f')) {
    repoUrl = repoUrl.replace(/^http%3[Aa]%2[Ff]%2[Ff]/, 'http://');
  }

  // Handle partially encoded colon (https%3A// or https%3a//)
  if (repoUrl.startsWith('https%3A//') || repoUrl.startsWith('https%3a//')) {
    repoUrl = repoUrl.replace(/^https%3[Aa]\/\//, 'https://');
  }

  if (repoUrl.startsWith('http%3A//') || repoUrl.startsWith('http%3a//')) {
    repoUrl = repoUrl.replace(/^http%3[Aa]\/\//, 'http://');
  }

  // Fix URL normalization (browser might normalize https:// to https:/)
  if (repoUrl.startsWith('https:/') && !repoUrl.startsWith('https://')) {
    repoUrl = repoUrl.replace('https:/', 'https://');
  }

  if (repoUrl.startsWith('http:/') && !repoUrl.startsWith('http://')) {
    repoUrl = repoUrl.replace('http:/', 'http://');
  }

  // Handle bare domain (github.com/owner/repo) - add https://
  if (repoUrl.startsWith('github.com/')) {
    repoUrl = `https://${repoUrl}`;
  }

  return repoUrl;
}

/**
 * Resolve the import target from the splat segment and query string.
 *
 * Pure URL parsing with no I/O, so both the route's `clientLoader` and its
 * `meta` can call it. `meta` must not depend on loader data: a `clientLoader`
 * route has none during the server render, and `/import/*` is routinely
 * arrived at cold from an external link whose crawler only sees that render.
 *
 * @param splatPath - The `*` route parameter.
 * @param search - The query string, including its leading `?`.
 * @returns The target, or `undefined` when the splat is not a GitHub repo URL.
 */
export function resolveGitHubImportTarget(splatPath: string, search: string): GitHubRepoInfo | undefined {
  const parameters = new URLSearchParams(search);
  const ref = parameters.get('ref') ?? 'main';
  const mainFile = parameters.get('main') ?? '';

  // No splat: the route renders its "enter a repository" form.
  if (!splatPath) {
    return { owner: '', repo: '', ref: 'main', mainFile: '' };
  }

  const parsed = parseGitHubUrl(normalizeGitHubUrl(splatPath));
  return parsed === undefined ? undefined : { owner: parsed.owner, repo: parsed.repo, ref, mainFile };
}

/**
 * Document title and description for a resolved import target.
 *
 * @param target - The resolved import target.
 * @returns The title and description strings.
 */
export function describeGitHubImport(target: GitHubRepoInfo): { title: string; description: string } {
  const repo = `${target.owner}/${target.repo} ${target.ref === 'main' ? '' : `@ ${target.ref}`}`;
  return {
    title: `Import ${repo} from GitHub into Tau`,
    description: `Get started with ${repo} by importing it into Tau.`,
  };
}

/**
 * Find the best main file from a list of file paths based on kernel configurations.
 */
export function findMainFile(filePaths: string[]): string | undefined {
  // First, try exact matches for kernel main files (e.g., main.scad, main.ts, main.kcl)
  for (const mainFile of kernelMainFiles) {
    const match = filePaths.find((name) => name === mainFile || name.endsWith(`/${mainFile}`));
    if (match) {
      return match;
    }
  }

  // Then, try to find any file with a supported kernel extension
  for (const extension of supportedKernelExtensions) {
    const match = filePaths.find((name) => name.endsWith(extension));
    if (match) {
      return match;
    }
  }

  // Fall back to first file if nothing matches
  return filePaths[0];
}
