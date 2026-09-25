/* eslint-disable @typescript-eslint/naming-convention -- Environment variable names. */
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { setup } from '#setup.js';
import type { FormalContext, ToolchainLock } from '#toolchain.js';
import { javaMajor, locateTools, missingTools, readLock, toolchainId } from '#toolchain.js';

const digest = (text: string): string => createHash('sha256').update(text).digest('hex');

const roots: string[] = [];
const temporaryRoot = (): string => {
  const root = mkdtempSync(path.join(tmpdir(), 'formal-setup-'));
  roots.push(root);
  return root;
};

afterEach(() => {
  for (const root of roots.splice(0)) {
    rmSync(root, { recursive: true, force: true });
  }
});

const fixture = (): { context: FormalContext; from: string; lock: ToolchainLock } => {
  const root = temporaryRoot();
  const from = path.join(root, 'downloads');
  mkdirSync(from);
  writeFileSync(path.join(from, 'tla2tools.jar'), 'tlc bytes');
  writeFileSync(path.join(from, 'CommunityModules-deps.jar'), 'community bytes');
  const real = readLock();
  const lock: ToolchainLock = {
    ...real,
    tlc: { ...real.tlc, sha256: digest('tlc bytes') },
    community: { ...real.community, sha256: digest('community bytes') },
  };
  return { context: { root, env: { PATH: '' } }, from, lock };
};

const refusingFetch: typeof fetch = async () => {
  throw new Error('no network in tests');
};

describe('setup', () => {
  it('should install tools whose bytes match the lock', async () => {
    const { context, from, lock } = fixture();

    await setup(context, { tools: ['tlc'], from, lock, fetch: refusingFetch, log: () => undefined });

    expect(locateTools(context, lock).tlc).toEqual({
      jar: expect.stringMatching(/tla2tools\.jar$/) as string,
      community: expect.stringMatching(/CommunityModules-deps\.jar$/) as string,
    });
  });

  it('should refuse an archive whose sha256 differs from the lock', async () => {
    const { context, from, lock } = fixture();
    writeFileSync(path.join(from, 'tla2tools.jar'), 'tampered bytes');

    await expect(
      setup(context, { tools: ['tlc'], from, lock, fetch: refusingFetch, log: () => undefined }),
    ).rejects.toThrow(`sha256 ${digest('tampered bytes')} does not match the lock (${digest('tlc bytes')})`);
    expect(
      existsSync(path.join(context.root, 'node_modules/.cache/formal', `tlc-${lock.tlc.build}`, 'tla2tools.jar')),
    ).toBe(false);
  });

  it('should print a different toolchain id when a tool is absent', async () => {
    const { context, from, lock } = fixture();
    const before = toolchainId(locateTools(context, lock), lock);

    await setup(context, { tools: ['tlc'], from, lock, fetch: refusingFetch, log: () => undefined });
    const after = toolchainId(locateTools(context, lock), lock);

    expect(before).toContain('tlc:absent');
    expect(after).toContain(`tlc:${lock.tlc.build}`);
    expect(after).not.toBe(before);
  });
});

describe('missingTools', () => {
  it('should report SKIPPED and exit 0 without Java when CI is unset', () => {
    const lines: string[] = [];
    const context: FormalContext = { root: temporaryRoot(), env: { PATH: '' } };

    const code = missingTools(
      context,
      { tools: locateTools(context), needed: ['java', 'tlc'], target: 'agent-host:formal' },
      (line) => lines.push(line),
    );

    expect(code).toBe(0);
    expect(lines).toEqual(['SKIPPED agent-host:formal: java, tlc not found; run pnpm nx run formal:setup']);
  });

  it('should exit 1 without Java when CI is set', () => {
    const context: FormalContext = { root: temporaryRoot(), env: { PATH: '', CI: 'true' } };

    expect(
      missingTools(context, { tools: locateTools(context), needed: ['java'], target: 'host:formal' }, () => undefined),
    ).toBe(1);
  });
});

describe('javaMajor', () => {
  it('should read modern and legacy version strings', () => {
    expect([
      javaMajor('openjdk version "26.0.2.1" 2026-08-18'),
      javaMajor('openjdk version "21.0.4" 2024-07-16'),
      javaMajor('java version "1.8.0_392"'),
      javaMajor('no version here'),
    ]).toEqual([26, 21, 8, undefined]);
  });
});
