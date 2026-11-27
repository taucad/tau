/**
 * Purpose: Check the desktop entry embedded in a Tau AppImage, which AppImageLauncher and appimaged install when a
 * person integrates a portable build (operator ruling D4=C, 2026-11-27): it must hand `tau://` links to the image.
 * Why: portable builds never register a handler themselves, so this entry is the only route for share links.
 * Environment: Node.js 24+; no filesystem or network access.
 * Usage: import { desktopEntryProblems } from './appimage-desktop-entry.mts'
 * Exit codes: n/a (library module).
 */

/** The `[Desktop Entry]` group of a desktop entry file, key to value. Later duplicates win, as in GLib. */
const desktopEntryGroup = (content: string): Map<string, string> => {
  const keys = new Map<string, string>();
  let inGroup = false;
  for (const line of content.split(/\r?\n/u)) {
    const trimmed = line.trim();
    if (trimmed.startsWith('[')) {
      inGroup = trimmed === '[Desktop Entry]';
      continue;
    }
    const equals = trimmed.indexOf('=');
    if (inGroup && equals > 0 && !trimmed.startsWith('#')) {
      keys.set(trimmed.slice(0, equals).trim(), trimmed.slice(equals + 1).trim());
    }
  }
  return keys;
};

/**
 * What is wrong with an embedded desktop entry, for the channel's link scheme.
 *
 * @param content - The `.desktop` file at the root of the extracted image.
 * @param scheme - `tau` for production, `tau-staging` for staging.
 * @returns One sentence per problem; empty when the entry hands the scheme's links to the image.
 */
export const desktopEntryProblems = (content: string, scheme: string): string[] => {
  const entry = desktopEntryGroup(content);
  const problems: string[] = [];
  if (entry.get('Type') !== 'Application') {
    problems.push('Type is not Application');
  }
  const mimeTypes = (entry.get('MimeType') ?? '').split(';').filter(Boolean);
  if (!mimeTypes.includes(`x-scheme-handler/${scheme}`)) {
    problems.push(`MimeType does not claim x-scheme-handler/${scheme}`);
  }
  const otherSchemes = mimeTypes.filter(
    (mimeType) => mimeType.startsWith('x-scheme-handler/') && mimeType !== `x-scheme-handler/${scheme}`,
  );
  if (otherSchemes.length > 0) {
    problems.push(`MimeType claims another channel's scheme: ${otherSchemes.join(', ')}`);
  }
  const exec = (entry.get('Exec') ?? '').split(/\s+/u);
  if (exec[0] !== 'AppRun' || !exec.slice(1).includes('%U')) {
    problems.push('Exec does not launch AppRun with %U');
  }
  return problems;
};
