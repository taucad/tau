/**
 * T-R12.11 (R12): the renderer's boot signals. `shell-mounted` and `home-ready` are each reported once, in that order,
 * to the page global the web watchdog reads and through the desktop bridge when it exists.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createActor, setup } from 'xstate';
import { eventSchemas } from '@taucad/ui-core/lib/xstate.lib';
import {
  followHomeReady,
  homeOnlyConfiguration,
  isSafeModeRequested,
  reportBootStage,
  resetBootSignals,
} from '#lib/boot-signals.js';
import type { BootStage } from '#lib/boot-signals.js';

type DesktopHolder = { tau?: { boot?: { report: (stage: BootStage) => void } } };
type BootHolder = { __tauBoot?: { shellMounted?: boolean; homeReady?: boolean } };

/** A stand-in for `rootFiles`: `connecting` until it is told it is ready. */
const rootFilesMachine = setup({ schemas: { events: eventSchemas<{ type: 'ready' }>() } }).createMachine({
  initial: 'connecting',
  states: { connecting: { on: { ready: { target: 'ready' } } }, ready: {} },
});

describe('boot signals', () => {
  const reports: BootStage[] = [];

  beforeEach(() => {
    resetBootSignals();
    reports.length = 0;
    vi.stubEnv('TAU_TARGET', 'desktop');
    (globalThis as DesktopHolder).tau = { boot: { report: (stage) => reports.push(stage) } };
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    delete (globalThis as DesktopHolder).tau;
    resetBootSignals();
    document.body.innerHTML = '';
  });

  it('should report shell-mounted then home-ready once each when rootFiles becomes ready after the shell', () => {
    const rootFiles = createActor(rootFilesMachine).start();
    const stop = followHomeReady(rootFiles);

    reportBootStage('shell-mounted');
    reportBootStage('shell-mounted');
    rootFiles.send({ type: 'ready' });
    reportBootStage('home-ready');
    stop();

    expect(reports).toEqual(['shell-mounted', 'home-ready']);
    expect((globalThis as BootHolder).__tauBoot).toEqual({ shellMounted: true, homeReady: true });
  });

  it('should hold home-ready until the shell has mounted', () => {
    const rootFiles = createActor(rootFilesMachine).start();
    followHomeReady(rootFiles);
    rootFiles.send({ type: 'ready' });

    expect(reports).toEqual([]);

    reportBootStage('shell-mounted');

    expect(reports).toEqual(['shell-mounted', 'home-ready']);
  });

  it('should write the page global without a desktop bridge on the web', () => {
    vi.stubEnv('TAU_TARGET', 'web');
    delete (globalThis as DesktopHolder).tau;

    reportBootStage('shell-mounted');

    expect((globalThis as BootHolder).__tauBoot?.shellMounted).toBe(true);
  });

  it('should hide the watchdog strip when the shell mounts after it was shown', () => {
    document.body.innerHTML = '<div id="tau-boot-strip"></div>';

    reportBootStage('shell-mounted');

    expect(document.querySelector<HTMLElement>('#tau-boot-strip')?.hidden).toBe(true);
  });

  it('should read safe mode from ?safe=1 only', () => {
    expect(isSafeModeRequested('?safe=1')).toBe(true);
    expect(isSafeModeRequested('?safe=0')).toBe(false);
    expect(isSafeModeRequested('')).toBe(false);
  });

  it('should narrow a configuration to Home, its projects and no checkouts', () => {
    const handle = Object.create(null) as FileSystemDirectoryHandle;
    const home = { projectId: 'p1', backend: 'opfs', providerBasePath: 'one' } as const;
    expect(
      homeOnlyConfiguration({
        roots: [{ backend: 'opfs' }, { backend: 'webaccess', directoryHandle: handle, workspaceId: 'w1' }],
        projects: [home, { projectId: 'p2', backend: 'webaccess', workspaceId: 'w1', providerBasePath: 'two' }],
        checkouts: [{ ...home, checkoutId: 'c1' }],
      }),
    ).toEqual({ roots: [{ backend: 'opfs' }], projects: [home] });
  });
});
