import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, it } from 'vitest';

const runner = fileURLToPath(new URL('typecheck-projects.ts', import.meta.url));
const directories: string[] = [];

const createFixture = (): string => {
  const directory = mkdtempSync(join(tmpdir(), 'tau typecheck '));
  directories.push(directory);
  writeFileSync(join(directory, 'good.ts'), 'export const value: number = 1;');
  writeFileSync(join(directory, 'bad.ts'), 'export const value: number = "wrong";');
  for (const name of ['good', 'bad']) {
    writeFileSync(
      join(directory, `${name}.json`),
      JSON.stringify({
        files: [`${name}.ts`],
        compilerOptions: { types: [], target: 'ES2022' },
      }),
    );
  }
  return directory;
};

afterEach(() => {
  for (const directory of directories.splice(0)) {
    rmSync(directory, { recursive: true, force: true });
  }
});

describe('portable project typecheck runner', () => {
  it('should report the next config after a compiler failure and retain failure status', () => {
    const cwd = createFixture();
    const result = spawnSync(process.execPath, [runner, 'bad.json', 'good.json'], { cwd, encoding: 'utf8' });
    expect(result.error).toBeUndefined();
    expect(result.status).toBe(1);
    expect(result.stdout).toContain('TS2322');
    expect(result.stdout).toContain('Typechecking good.json');
    expect(result.stdout.indexOf('TS2322')).toBeLessThan(result.stdout.indexOf('Typechecking good.json'));
  });

  it('should succeed with a config path containing spaces', () => {
    const cwd = createFixture();
    const result = spawnSync(process.execPath, [runner, join(cwd, 'good.json')], { cwd, encoding: 'utf8' });
    expect(result.error).toBeUndefined();
    expect(result.status, result.stderr).toBe(0);
  });

  it('should reject an empty config selection', () => {
    const result = spawnSync(process.execPath, [runner], { encoding: 'utf8' });
    expect(result.status).toBe(1);
    expect(result.stderr).toContain('Provide at least one tsconfig path');
  });
});
