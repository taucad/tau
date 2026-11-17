import { describe, expect, it } from 'vitest';

import { acceptableLoginCommands, locatedFallback, posixQuote } from '#support/acp-install.js';
import type { FallbackFileSystem } from '#support/acp-install.js';
/* oxlint-disable no-restricted-imports -- This projectless e2e harness cannot resolve the host package export. */
// eslint-disable-next-line @nx/enforce-module-boundaries -- Its desktop sibling owns the host package dependency.
import { acpAgentProfiles } from '../../../../packages/host/src/acp/registry.js';
/* oxlint-enable no-restricted-imports */

const bundle = '/home/u/Library/Application Support/Claude/claude-code';
const tree: Readonly<Record<string, readonly string[]>> = {
  [bundle]: ['2.1.9', 'latest', '2.1.325', '2.1.40', 'beta'],
  [`${bundle}/2.1.325`]: ['h1'],
  [`${bundle}/2.1.40`]: ['h2'],
};
const executables: ReadonlySet<string> = new Set([
  `${bundle}/2.1.40/h2/claude.app/Contents/MacOS/claude`,
  '/home/u/.grok/bin/grok',
]);
const fileSystem: FallbackFileSystem = {
  home: '/home/u',
  listDirectory: (path) => tree[path] ?? [],
  isExecutableFile: (path) => executables.has(path),
};
const claudeApp = '~/Library/Application Support/Claude/claude-code/*/*/claude.app/Contents/MacOS/claude';

describe('locatedFallback', () => {
  it('should return the first executable expansion across declared entries, newest version first', () => {
    const profile = { cli: 'claude', fallbackExecutables: { darwin: ['~/.local/bin/claude', claudeApp] } };

    expect(locatedFallback(profile, 'darwin', fileSystem)).toBe(`${bundle}/2.1.40/h2/claude.app/Contents/MacOS/claude`);
  });

  it('should return undefined when the platform declares no fallback or none is executable', () => {
    const profile = { cli: 'claude', fallbackExecutables: { darwin: [claudeApp] } };

    expect(locatedFallback(profile, 'linux', fileSystem)).toBeUndefined();
    expect(locatedFallback({ cli: 'claude' }, 'darwin', fileSystem)).toBeUndefined();
    expect(
      locatedFallback({ cli: 'tool', fallbackExecutables: { darwin: ['/nowhere/*/tool'] } }, 'darwin', fileSystem),
    ).toBeUndefined();
  });

  it('should return undefined for a profile with no CLI', () => {
    expect(
      locatedFallback({ fallbackExecutables: { darwin: ['~/.grok/bin/grok'] } }, 'darwin', fileSystem),
    ).toBeUndefined();
  });

  it('should read every reviewed profile on both platforms without throwing', () => {
    for (const profile of acpAgentProfiles) {
      expect(() => locatedFallback(profile, 'darwin', fileSystem)).not.toThrow();
      expect(() => locatedFallback(profile, 'linux', fileSystem)).not.toThrow();
    }
  });
});

describe('posixQuote', () => {
  it('should quote only what a POSIX shell would split or expand', () => {
    expect(posixQuote('/usr/local/bin/codex')).toBe('/usr/local/bin/codex');
    expect(posixQuote('/a b/claude')).toBe("'/a b/claude'");
    expect(posixQuote("it's")).toBe(String.raw`'it'\''s'`);
  });
});

describe('acceptableLoginCommands', () => {
  it('should accept the plain login command, and the quoted fallback form when a fallback exists', () => {
    const profile = { cli: 'claude', loginCommand: 'claude auth login' };

    expect(acceptableLoginCommands(profile, undefined)).toEqual(['claude auth login']);
    expect(acceptableLoginCommands(profile, '/x y/claude')).toEqual(['claude auth login', "'/x y/claude' auth login"]);
  });

  it('should accept a login command that is the bare CLI in its fallback form', () => {
    expect(acceptableLoginCommands({ cli: 'tool', loginCommand: 'tool' }, '/x y/tool')).toEqual([
      'tool',
      "'/x y/tool'",
    ]);
  });

  it('should accept nothing when the profile declares no login command', () => {
    expect(acceptableLoginCommands({ cli: 'grok', loginCommand: undefined }, '/g')).toEqual([]);
  });
});
