import { existsSync, globSync, readFileSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const repositoryRoot = resolve(import.meta.dirname, '../..');
const readJson = (path: string): Record<string, unknown> =>
  JSON.parse(readFileSync(join(repositoryRoot, path), 'utf8')) as Record<string, unknown>;

describe('telemetry release partition', () => {
  it('keeps telemetry private and outside package release ownership', () => {
    expect(existsSync(join(repositoryRoot, 'packages/telemetry'))).toBe(false);

    const manifest = readJson('libs/telemetry/package.json');
    const project = readJson('libs/telemetry/project.json');
    expect(manifest['name']).toBe('@taucad/telemetry');
    expect(manifest['private']).toBe(true);
    expect(project['tags']).toContain('type:lib');

    const workflow = readFileSync(join(repositoryRoot, '.github/workflows/publish.yml'), 'utf8');
    const publishCommands = workflow
      .split('\n')
      .filter((line) => line.includes('nx-release-publish'))
      .join('\n');
    expect(publishCommands).not.toContain('telemetry');
  });

  it('keeps publishable packages independent of application telemetry', () => {
    const manifestPaths = globSync(['packages/*/package.json', 'packages/kernels/*/package.json'], {
      cwd: repositoryRoot,
    });

    for (const manifestPath of manifestPaths) {
      const manifest = readJson(manifestPath);
      if (manifest['private'] !== false) {
        continue;
      }
      for (const field of ['dependencies', 'optionalDependencies', 'peerDependencies']) {
        expect(manifest[field] ?? {}, `${manifestPath} ${field}`).not.toHaveProperty('@taucad/telemetry');
      }
    }
  });

  it('limits production imports to the API and UI applications', () => {
    const sourcePaths = globSync(['apps/**/*.{ts,tsx}', 'libs/**/*.{ts,tsx}', 'packages/**/*.{ts,tsx}'], {
      cwd: repositoryRoot,
      exclude: ['**/dist/**', '**/node_modules/**', '**/*.test.ts', '**/*.test.tsx', '**/*.spec.ts', '**/*.spec.tsx'],
    });
    const consumers = sourcePaths
      .filter((path) => readFileSync(join(repositoryRoot, path), 'utf8').includes("'@taucad/telemetry"))
      .map((path) => relative(repositoryRoot, join(repositoryRoot, path)));

    expect(consumers.length).toBeGreaterThan(0);
    expect(consumers.every((path) => path.startsWith('apps/api/') || path.startsWith('apps/ui/'))).toBe(true);
  });
});
