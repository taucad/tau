import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

/** Read the simple string assignments exported during Netlify dependency installation. */
const bootstrapEnvironment = (): NodeJS.ProcessEnv => {
  const configuration = readFileSync(join(import.meta.dirname, 'netlify.toml'), 'utf8');
  const section = configuration.split('[build.environment]')[1]?.split('\n[')[0] ?? '';
  const environment = { ...process.env };
  // The test runner may need a loader, but a clean Netlify checkout has no packages yet.
  delete environment['NODE_OPTIONS'];
  for (const match of section.matchAll(/^(\w+)\s*=\s*("(?:[^"\\]|\\.)*")\s*$/gmu)) {
    const [, name, value] = match;
    if (name && value) {
      environment[name] = JSON.parse(value) as string;
    }
  }
  return environment;
};

describe('Netlify dependency bootstrap', () => {
  it('starts Node in a checkout with no installed dependencies', () => {
    const directory = mkdtempSync(join(tmpdir(), 'tau-docs-bootstrap-'));
    try {
      const version = execFileSync(process.execPath, ['-e', 'console.log(process.version)'], {
        cwd: directory,
        env: bootstrapEnvironment(),
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'pipe'],
      });
      expect(version.trim()).toBe(process.version);
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  });
});
