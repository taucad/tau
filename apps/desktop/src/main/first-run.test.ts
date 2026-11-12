import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { isFirstRun } from '#main/first-run.js';

describe('isFirstRun (DT1)', () => {
  let directory: string;
  let windowStatePath: string;

  beforeEach(() => {
    directory = mkdtempSync(join(tmpdir(), 'tau-first-run-'));
    windowStatePath = join(directory, 'window-state.json');
  });

  afterEach(() => {
    rmSync(directory, { recursive: true, force: true });
  });

  it('is the first run with no window-state file and nothing in the launch', () => {
    expect(isFirstRun({ windowStatePath, hasLaunchLink: false, hasLaunchFiles: false })).toBe(true);
  });

  it('is not the first run when the file exists, even if it does not parse', () => {
    writeFileSync(windowStatePath, '{ not json');
    expect(isFirstRun({ windowStatePath, hasLaunchLink: false, hasLaunchFiles: false })).toBe(false);
  });

  it('is not the first run when the launch carried a tau:// link', () => {
    expect(isFirstRun({ windowStatePath, hasLaunchLink: true, hasLaunchFiles: false })).toBe(false);
  });

  it('is not the first run when the launch carried a file', () => {
    expect(isFirstRun({ windowStatePath, hasLaunchLink: false, hasLaunchFiles: true })).toBe(false);
  });
});
