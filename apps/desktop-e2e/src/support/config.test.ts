import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, expect, test } from 'vitest';
// oxlint-disable-next-line no-restricted-imports -- The standalone preflight test does not load project aliases.
import { desktopE2EPackagedExecutable } from './config.ts';

const originalExecutable = process.env['TAU_E2E_DESKTOP_EXECUTABLE'];

afterEach(() => {
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
  const executable = join(root, 'Tau');
  writeFileSync(executable, 'fixture');
  process.env['TAU_E2E_DESKTOP_EXECUTABLE'] = executable;
  expect(desktopE2EPackagedExecutable()).toBe(executable);
  rmSync(root, { force: true, recursive: true });
});
