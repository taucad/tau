import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, expect, test, vi } from 'vitest';
// oxlint-disable-next-line no-restricted-imports -- The standalone preflight test does not load project aliases.
import { desktopE2EIsolatedApiDirectory, desktopE2EPackagedExecutable } from './config.ts';

const directories: string[] = [];

const originalExecutable = process.env['TAU_E2E_DESKTOP_EXECUTABLE'];

afterEach(() => {
  vi.unstubAllEnvs();
  vi.resetModules();
  for (const directory of directories.splice(0)) {
    rmSync(directory, { force: true, recursive: true });
  }
  if (originalExecutable === undefined) {
    delete process.env['TAU_E2E_DESKTOP_EXECUTABLE'];
  } else {
    process.env['TAU_E2E_DESKTOP_EXECUTABLE'] = originalExecutable;
  }
});

test('requires an existing absolute completed-artifact executable', () => {
  process.env['TAU_E2E_DESKTOP_EXECUTABLE'] = 'Tau.app/Contents/MacOS/Tau';
  expect(() => desktopE2EPackagedExecutable()).toThrow(/absolute path/u);

  const root = mkdtempSync(join(tmpdir(), 'tau-e2e-artifact-'));
  directories.push(root);
  const executable = join(root, 'Tau');
  writeFileSync(executable, 'fixture');
  process.env['TAU_E2E_DESKTOP_EXECUTABLE'] = executable;
  expect(desktopE2EPackagedExecutable()).toBe(executable);
});

const isolatedEnvironment = (): NodeJS.ProcessEnv => {
  const directory = mkdtempSync(join(tmpdir(), 'tau-e2e-isolation-'));
  directories.push(directory);
  const closure = join(directory, 'physical-closure.json');
  writeFileSync(closure, '{}');
  const environment: NodeJS.ProcessEnv = {};
  environment['TAU_E2E_UNPACKAGED_WRITER_CONTROL'] = 'true';
  environment['TAU_E2E_COMPLETED_ARTIFACT'] = 'false';
  environment['TAU_E2E_EXTERNAL_SERVICES'] = 'true';
  environment['TAU_E2E_COMPLETED_CLOUD_GATEWAY'] = 'true';
  environment['TAU_E2E_API_URL'] = 'http://127.0.0.1:32789';
  environment['TAU_E2E_API_CWD'] = directory;
  environment['TAU_E2E_BROWSER_PHYSICAL_CLOSURE'] = closure;
  return environment;
};

test('should preserve the ordinary default without isolated mode', () => {
  expect(desktopE2EIsolatedApiDirectory({})).toBeUndefined();
});

test('should require isolated services without promoting the unpackaged shell to a completed artifact', async () => {
  const environment = isolatedEnvironment();
  expect(desktopE2EIsolatedApiDirectory(environment)).toBe(environment['TAU_E2E_API_CWD']);
  vi.stubEnv('TAU_E2E_COMPLETED_ARTIFACT', 'false');
  vi.stubEnv('TAU_E2E_UNPACKAGED_WRITER_CONTROL', 'true');
  vi.resetModules();
  // oxlint-disable-next-line no-restricted-imports -- The standalone preflight test does not load project aliases.
  const config = await import('./config.ts');
  expect(config.desktopE2ECompletedArtifact).toBe(false);
  expect(config.desktopE2EIsolatedServices).toBe(true);
});

test('should preserve completed-artifact isolation without requiring an unpackaged closure', () => {
  const environment = isolatedEnvironment();
  environment['TAU_E2E_COMPLETED_ARTIFACT'] = 'true';
  environment['TAU_E2E_UNPACKAGED_WRITER_CONTROL'] = undefined;
  environment['TAU_E2E_BROWSER_PHYSICAL_CLOSURE'] = undefined;
  expect(desktopE2EIsolatedApiDirectory(environment)).toBe(environment['TAU_E2E_API_CWD']);
});

test.each([
  ['TAU_E2E_UNPACKAGED_WRITER_CONTROL', 'invalid'],
  ['TAU_E2E_COMPLETED_ARTIFACT', 'true'],
  ['TAU_E2E_PUBLISHED_PACKAGED', 'true'],
  ['TAU_E2E_EXTERNAL_SERVICES', undefined],
  ['TAU_E2E_COMPLETED_CLOUD_GATEWAY', undefined],
  ['TAU_E2E_API_URL', undefined],
  ['TAU_E2E_API_URL', 'http://127.0.0.1:4014'],
  ['TAU_E2E_API_URL', 'http://example.test:32789'],
  ['TAU_E2E_API_URL', 'https://127.0.0.1:32789'],
  ['TAU_E2E_API_URL', 'not-a-url'],
  ['TAU_E2E_API_CWD', undefined],
  ['TAU_E2E_API_CWD', 'relative-api'],
  ['TAU_E2E_API_CWD', '/missing-tau-e2e-api'],
  ['TAU_E2E_BROWSER_PHYSICAL_CLOSURE', undefined],
  ['TAU_E2E_BROWSER_PHYSICAL_CLOSURE', 'relative-closure.json'],
  ['TAU_E2E_BROWSER_PHYSICAL_CLOSURE', '/missing-tau-e2e-closure.json'],
])('should deny isolated unpackaged composition with %s=%s', (key, value) => {
  const environment = isolatedEnvironment();
  environment[key] = value;
  expect(() => desktopE2EIsolatedApiDirectory(environment)).toThrow(Error);
});

test('should deny an API directory with dotenv credentials or a non-file closure', () => {
  const environment = isolatedEnvironment();
  const directory = environment['TAU_E2E_API_CWD'];
  if (directory === undefined) {
    throw new Error('The isolation fixture requires its actual directory.');
  }
  environment['TAU_E2E_BROWSER_PHYSICAL_CLOSURE'] = directory;
  expect(() => desktopE2EIsolatedApiDirectory(environment)).toThrow(/actual closure/u);
  environment['TAU_E2E_BROWSER_PHYSICAL_CLOSURE'] = join(directory, 'physical-closure.json');
  writeFileSync(join(directory, '.env'), 'private fixture');
  expect(() => desktopE2EIsolatedApiDirectory(environment)).toThrow(/without \.env/u);
});
