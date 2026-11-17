import { chmod, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  beginLaunch,
  bootHealthFileName,
  buildIdentity,
  classifyLaunch,
  maxBootHealthBytes,
  readBootHealth,
  startBootHealth,
  writeBootHealth,
} from '#main/boot-health.js';
import type { BootHealthLedger, LaunchRecord } from '#main/boot-health.js';

const build = buildIdentity({ version: '1.15.0', sourceCommit: '3f2a9c1', packaged: true });

const record = (overrides: Partial<LaunchRecord>): LaunchRecord => ({
  launchId: 'launch',
  mode: 'normal',
  stage: 'main-started',
  deadlinePassed: false,
  ...overrides,
});

const ledger = (overrides: Partial<BootHealthLedger> = {}): BootHealthLedger => ({
  schemaVersion: 1,
  build,
  unhealthyCount: 0,
  ...overrides,
});

let directory: string | undefined;
const profile = async (): Promise<string> => {
  directory = await mkdtemp(join(tmpdir(), 'tau-boot-health-'));
  return directory;
};

afterEach(async () => {
  vi.useRealTimers();
  if (directory !== undefined) {
    await chmod(directory, 0o700).catch(() => undefined);
    await rm(directory, { recursive: true, force: true });
    directory = undefined;
  }
});

describe('boot-health outcomes (T-R12.1)', () => {
  it('should count a launch that reached home-ready as healthy however late', () => {
    expect(classifyLaunch(record({ stage: 'home-ready', deadlinePassed: true }))).toBe('healthy');
    expect(classifyLaunch(record({ stage: 'home-ready' }))).toBe('healthy');
    expect(classifyLaunch(record({ stage: 'home-ready', ended: 'clean' }))).toBe('healthy');
  });

  it('should count a launch without home-ready that passed its deadline as unhealthy', () => {
    expect(classifyLaunch(record({ stage: 'shell-mounted', deadlinePassed: true, ended: 'clean' }))).toBe('unhealthy');
  });

  it('should count a launch without home-ready that ended without a clean quit as unhealthy', () => {
    expect(classifyLaunch(record({ stage: 'window-loaded' }))).toBe('unhealthy');
    expect(classifyLaunch(record({ stage: 'main-started' }))).toBe('unhealthy');
  });

  it('should count a clean quit before the deadline and a window the person closed as inconclusive', () => {
    expect(classifyLaunch(record({ stage: 'window-loaded', ended: 'clean' }))).toBe('inconclusive');
    expect(classifyLaunch(record({ stage: 'shell-mounted', ended: 'user-closed-window' }))).toBe('inconclusive');
  });

  it('should count a launch whose GPU process exited as unhealthy unless home-ready still arrived', () => {
    expect(classifyLaunch(record({ stage: 'shell-mounted', ended: 'clean', gpuProcessGone: true }))).toBe('unhealthy');
    expect(classifyLaunch(record({ stage: 'home-ready', gpuProcessGone: true }))).toBe('healthy');
  });
});

describe('boot-health sequences (T-R12.2)', () => {
  /** Run one launch over the previous ledger and end it with the given record fields. */
  const launch = (
    previous: BootHealthLedger | undefined,
    end: Partial<LaunchRecord>,
    options: { build?: string; safeModeRequested?: boolean } = {},
  ): { mode: string; count: number; next: BootHealthLedger } => {
    const begun = beginLaunch({
      previous,
      build: options.build ?? build,
      version: '1.15.0',
      safeModeRequested: options.safeModeRequested ?? false,
      launchId: 'id',
    });
    return {
      mode: begun.mode,
      count: begun.ledger.unhealthyCount,
      next: { ...begun.ledger, last: { ...begun.ledger.last!, ...end } },
    };
  };
  const unhealthy = { stage: 'shell-mounted', deadlinePassed: true } as const;
  const healthy = { stage: 'home-ready', ended: 'clean' } as const;

  it('should start in safe mode after two unhealthy launches and leave probation at one', () => {
    const first = launch(undefined, unhealthy);
    expect(first.mode).toBe('normal');
    const second = launch(first.next, unhealthy);
    expect(second).toMatchObject({ mode: 'normal', count: 1 });
    const third = launch(second.next, healthy);
    expect(third).toMatchObject({ mode: 'safe-auto', count: 2 });
    /* A healthy safe launch lowers the count to one: the next launch is normal, on probation. */
    const fourth = launch(third.next, unhealthy);
    expect(fourth).toMatchObject({ mode: 'normal', count: 1 });
    /* One bad normal launch on probation is enough to return to safe mode. */
    const fifth = launch(fourth.next, healthy);
    expect(fifth).toMatchObject({ mode: 'safe-auto', count: 2 });
    const sixth = launch(fifth.next, healthy);
    expect(sixth).toMatchObject({ mode: 'normal', count: 1 });
    /* A healthy normal launch clears it. */
    const seventh = launch(sixth.next, healthy);
    expect(seventh).toMatchObject({ mode: 'normal', count: 0 });
  });

  it('should leave the count alone for an inconclusive launch', () => {
    const first = launch(ledger({ unhealthyCount: 1 }), { stage: 'window-loaded', ended: 'clean' });
    expect(first.count).toBe(1);
    const second = launch(first.next, {});
    expect(second.count).toBe(1);
  });

  it('should reset the count for another build, so a development run never counts against the installed app', () => {
    const other = buildIdentity({ version: '1.15.0', sourceCommit: '3f2a9c1', packaged: false });
    const begun = launch(ledger({ unhealthyCount: 2, last: record(unhealthy) }), {}, { build: other });
    expect(begun).toMatchObject({ mode: 'normal', count: 0 });
    expect(begun.next.build).toBe(other);
  });

  it('should honour --safe-mode as a requested safe launch whatever the count', () => {
    expect(launch(undefined, {}, { safeModeRequested: true }).mode).toBe('safe-requested');
  });

  it('should block an automatic install whose target this launch is not running', () => {
    const begun = beginLaunch({
      previous: ledger({ autoInstall: { fromBuild: build, targetVersion: '1.15.1' } }),
      build,
      version: '1.15.0',
      safeModeRequested: false,
      launchId: 'id',
    });
    expect(begun.blockedAutoInstallTarget).toBe('1.15.1');
    expect(begun.ledger.autoInstall).toEqual({ fromBuild: build, targetVersion: '1.15.1' });
  });

  it('should write the new launch at main-started with its mode', () => {
    const begun = beginLaunch({
      previous: undefined,
      build,
      version: '1.15.0',
      safeModeRequested: false,
      launchId: 'abc',
    });
    expect(begun.ledger.last).toEqual({
      launchId: 'abc',
      mode: 'normal',
      stage: 'main-started',
      deadlinePassed: false,
    });
  });
});

describe('boot-health storage (T-R12.3)', () => {
  it('should read a missing, damaged, oversized or misshapen ledger as empty without throwing', async () => {
    const userData = await profile();
    const path = join(userData, bootHealthFileName);
    expect(readBootHealth(path)).toBeUndefined();
    await writeFile(path, '{not json');
    expect(readBootHealth(path)).toBeUndefined();
    await writeFile(path, JSON.stringify({ ...ledger(), padding: 'x'.repeat(maxBootHealthBytes) }));
    expect(readBootHealth(path)).toBeUndefined();
    await writeFile(path, JSON.stringify({ schemaVersion: 2, build, unhealthyCount: 0 }));
    expect(readBootHealth(path)).toBeUndefined();
    await writeFile(path, JSON.stringify({ ...ledger(), unhealthyCount: -1 }));
    expect(readBootHealth(path)).toBeUndefined();
    await mkdir(join(userData, 'directory-ledger.json'));
    expect(readBootHealth(join(userData, 'directory-ledger.json'))).toBeUndefined();
  });

  it('should write by replacing a temporary file with mode 0600, and read back what it wrote', async () => {
    const userData = await profile();
    const path = join(userData, bootHealthFileName);
    const written = ledger({ unhealthyCount: 1, last: record({ stage: 'home-ready', ended: 'clean' }) });
    expect(writeBootHealth(path, written)).toBe(true);
    expect(readBootHealth(path)).toEqual(written);
    const { stat } = await import('node:fs/promises');
    if (process.platform !== 'win32') {
      const { mode } = await stat(path);
      expect(mode.toString(8).slice(-3)).toBe('600');
    }
    expect(JSON.parse(await readFile(path, 'utf8'))).toEqual(written);
  });

  it.runIf(process.platform !== 'win32' && process.getuid?.() !== 0)(
    'should report an unwritable ledger as a failed write and never throw',
    async () => {
      const userData = await profile();
      await chmod(userData, 0o500);
      expect(writeBootHealth(join(userData, bootHealthFileName), ledger())).toBe(false);
    },
  );

  it('should never cause safe mode from a ledger it cannot read or write', async () => {
    const userData = await profile();
    await writeFile(join(userData, bootHealthFileName), 'garbage');
    const health = startBootHealth({
      path: join(userData, 'missing', 'nested', bootHealthFileName),
      build,
      version: '1.15.0',
      safeModeRequested: false,
      launchId: 'id',
      writeFile: () => {
        throw new Error('EROFS');
      },
    });
    expect(health.mode).toBe('normal');
    expect(() => {
      health.advance('home-ready');
      health.end('clean');
    }).not.toThrow();
  });

  it('should decide as for an empty ledger when the first write fails, keeping an explicit --safe-mode', async () => {
    const userData = await profile();
    const path = join(userData, bootHealthFileName);
    /* Two unhealthy launches on record: a writable profile would start this one in safe mode. */
    await writeFile(
      path,
      JSON.stringify(ledger({ unhealthyCount: 1, last: record({ stage: 'shell-mounted', deadlinePassed: true }) })),
    );
    const unwritable = (): never => {
      throw new Error('EROFS');
    };
    const start = (safeModeRequested: boolean) =>
      startBootHealth({ path, build, version: '1.15.0', safeModeRequested, launchId: 'id', writeFile: unwritable });
    const automatic = start(false);
    expect(automatic.mode).toBe('normal');
    expect(automatic.unhealthyCount).toBe(0);
    expect(automatic.previousOutcome).toBeUndefined();
    expect(start(true).mode).toBe('safe-requested');
  });

  it('should not read the wall clock anywhere in the module', async () => {
    const source = await readFile(join(import.meta.dirname, 'boot-health.ts'), 'utf8');
    expect(source).not.toMatch(/Date\.now|new Date\b|performance\.timeOrigin|Date\(\)/u);
    const now = vi.spyOn(Date, 'now');
    const userData = await profile();
    const health = startBootHealth({
      path: join(userData, bootHealthFileName),
      build,
      version: '1.15.0',
      safeModeRequested: false,
      launchId: 'id',
    });
    health.advance('updater-started');
    health.markDeadlinePassed();
    health.end('clean');
    expect(now).not.toHaveBeenCalled();
  });

  it('should advance the stage only forward and persist each step', async () => {
    const userData = await profile();
    const path = join(userData, bootHealthFileName);
    const health = startBootHealth({ path, build, version: '1.15.0', safeModeRequested: false, launchId: 'id' });
    health.advance('shell-mounted');
    health.advance('window-loaded');
    expect(readBootHealth(path)?.last?.stage).toBe('shell-mounted');
    health.end('user-closed-window');
    health.end('clean');
    expect(readBootHealth(path)?.last?.ended).toBe('user-closed-window');
  });
});

describe('boot-health automatic install record (T-N1.2)', () => {
  it('should block the target of an automatic install that did not take, and forget one that did', async () => {
    const path = join(await profile(), bootHealthFileName);
    const first = startBootHealth({ path, build, version: '1.15.0', safeModeRequested: false, launchId: 'one' });
    expect(first.blockedAutoInstallTarget).toBeUndefined();
    first.noteAutoInstall('1.15.1');
    expect(readBootHealth(path)?.autoInstall).toEqual({ fromBuild: build, targetVersion: '1.15.1' });
    /* The installer failed quietly: the same build starts again. */
    const again = startBootHealth({ path, build, version: '1.15.0', safeModeRequested: false, launchId: 'two' });
    expect(again.blockedAutoInstallTarget).toBe('1.15.1');
    expect(readBootHealth(path)?.autoInstall).toEqual({ fromBuild: build, targetVersion: '1.15.1' });
    /* The update took: the target runs, and nothing is blocked. */
    const updated = buildIdentity({ version: '1.15.1', sourceCommit: '4b1d2e3', packaged: true });
    const next = startBootHealth({
      path,
      build: updated,
      version: '1.15.1',
      safeModeRequested: false,
      launchId: 'three',
    });
    expect(next.blockedAutoInstallTarget).toBeUndefined();
    expect(readBootHealth(path)?.autoInstall).toBeUndefined();
  });
});
