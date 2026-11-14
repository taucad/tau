/* eslint-disable @typescript-eslint/naming-convention -- Sentry tag names are snake_case. */
import { mkdirSync, mkdtempSync, readdirSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { randomUUID } from 'node:crypto';
import { afterEach, expect, it, vi } from 'vitest';
import { prepareRouteQualificationProbe } from '#main/route-qualification-probe.js';

const { initialize, isInitialized, captureMessage, addEventProcessor } = vi.hoisted(() => ({
  initialize: vi.fn(),
  isInitialized: vi.fn(() => false),
  captureMessage: vi.fn(),
  addEventProcessor: vi.fn(),
}));
vi.mock('@sentry/electron/main', () => ({
  init: initialize,
  isInitialized,
  captureMessage,
  addEventProcessor,
  IPCMode: { Classic: 1, Protocol: 2, Both: 3 },
}));
afterEach(() => {
  vi.unstubAllGlobals();
  vi.resetModules();
  initialize.mockReset();
  isInitialized.mockReset();
  captureMessage.mockReset();
  addEventProcessor.mockReset();
});

it('imports inertly, admits a pristine profile, then lets crash reporting create its files', async () => {
  const root = realpathSync(mkdtempSync(join(tmpdir(), 'tau-crash-order-')));
  try {
    const profile = join(root, 'profile');
    mkdirSync(profile);
    const nonce = randomUUID();
    const candidate = (version: string, source: string) => ({
      tag: `desktop@${version}`,
      version,
      sourceCommit: source.repeat(40),
    });
    writeFileSync(
      join(profile, 'route-qualification.request.json'),
      JSON.stringify({
        schemaVersion: 1,
        nonce,
        profile,
        installedPath: root,
        route: 'linux-appimage',
        target: 'linux-x64',
        channel: 'production',
        mirrorOrigin: 'https://127.0.0.1:4443',
        startedAt: Date.now(),
        a: candidate('1.0.0', 'a'),
        b: candidate('1.0.1', 'b'),
        c: candidate('1.0.2', 'c'),
      }),
    );
    vi.stubGlobal('tauSentryDsn', 'https://key@errors.example/1');
    initialize.mockImplementation(() => {
      mkdirSync(join(profile, 'Crashpad'));
    });
    const { initializeDesktopErrorReporting } = await import('#main/error-reporting.js');
    expect(initialize).not.toHaveBeenCalled();
    expect(readdirSync(profile)).toEqual(['route-qualification.request.json']);
    const probe = prepareRouteQualificationProbe({
      arguments: [`--tau-route-qualification=${nonce}`],
      profile,
      defaultProfile: profile,
      packaged: true,
      platform: 'linux',
      arch: 'x64',
      channel: 'production',
      version: '1.0.0',
      sourceCommit: 'a'.repeat(40),
      route: 'linux-appimage',
      installedPath: root,
      mirrorOrigin: 'https://127.0.0.1:4443',
    });
    expect(probe?.stage).toBe('a');
    initializeDesktopErrorReporting('production');
    expect(initialize).toHaveBeenCalledWith(
      expect.objectContaining({ dsn: 'https://key@errors.example/1', sendDefaultPii: false }),
    );
    expect(readdirSync(profile)).toContain('Crashpad');
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

it('keeps local builds inert when no release DSN is baked in', async () => {
  vi.stubGlobal('tauSentryDsn', '');
  const { initializeDesktopErrorReporting } = await import('#main/error-reporting.js');
  initializeDesktopErrorReporting('production');
  expect(initialize).not.toHaveBeenCalled();
});

it.each(['staging', 'production'] as const)('labels %s crash reports with the packaged channel', async (channel) => {
  vi.stubGlobal('tauSentryDsn', 'https://key@errors.example/1');
  const { initializeDesktopErrorReporting } = await import('#main/error-reporting.js');
  initializeDesktopErrorReporting(channel);
  expect(initialize).toHaveBeenCalledWith(expect.objectContaining({ environment: channel, sendDefaultPii: false }));
});

it('reports the release the workflow baked in, never the SDK default', async () => {
  vi.stubGlobal('tauSentryDsn', 'https://key@errors.example/1');
  vi.stubGlobal('tauSentryRelease', 'tau-desktop@0.1.0-staging.894');
  const { initializeDesktopErrorReporting } = await import('#main/error-reporting.js');
  initializeDesktopErrorReporting('staging');
  expect(initialize).toHaveBeenCalledWith(expect.objectContaining({ release: 'tau-desktop@0.1.0-staging.894' }));
});

it('leaves the release to the SDK when the build named none', async () => {
  vi.stubGlobal('tauSentryDsn', 'https://key@errors.example/1');
  vi.stubGlobal('tauSentryRelease', '');
  const { initializeDesktopErrorReporting } = await import('#main/error-reporting.js');
  initializeDesktopErrorReporting('production');
  expect(initialize).toHaveBeenCalledOnce();
  expect(initialize.mock.calls[0]?.[0]).not.toHaveProperty('release');
});

it.each(['staging', 'production'] as const)('labels an automated %s run apart from real use', async (channel) => {
  vi.stubGlobal('tauSentryDsn', 'https://key@errors.example/1');
  const { initializeDesktopErrorReporting } = await import('#main/error-reporting.js');
  initializeDesktopErrorReporting(channel, true);
  expect(initialize).toHaveBeenCalledWith(expect.objectContaining({ environment: `${channel}-e2e` }));
});

it('sends a desktop signal as one message event once Sentry is running', async () => {
  const { reportDesktopSignal } = await import('#main/error-reporting.js');
  const signal = {
    message: 'Renderer unresponsive',
    level: 'warning',
    fingerprint: ['desktop-renderer-hang'],
    tags: { hang_seconds: '12' },
    contexts: { hang: { milliseconds: 12_000 } },
  } as const;

  reportDesktopSignal(signal);
  expect(captureMessage).not.toHaveBeenCalled();

  isInitialized.mockReturnValue(true);
  reportDesktopSignal(undefined);
  reportDesktopSignal(signal);
  expect(captureMessage).toHaveBeenCalledTimes(1);
  expect(captureMessage).toHaveBeenCalledWith('Renderer unresponsive', {
    level: 'warning',
    fingerprint: ['desktop-renderer-hang'],
    tags: { hang_seconds: '12' },
    contexts: { hang: { milliseconds: 12_000 } },
  });
});

it('sends a revision-engine failure redacted, once per window for the same failure', async () => {
  const { reportRevisionEngineFailure, revisionEngineFailureWindow } = await import('#main/error-reporting.js');
  isInitialized.mockReturnValue(true);
  const frame = (path: string) => ({
    type: 'revision-engine-failed',
    code: 'ENGINE_FAILED',
    message: 'Native Git failed worktree.',
    detail: `fatal: ${path} already exists`,
  });

  expect(reportRevisionEngineFailure({ type: 'permission-answered' }, 0)).toBe(false);
  expect(reportRevisionEngineFailure(frame('/home/one/a'), 0)).toBe(true);
  expect(reportRevisionEngineFailure(frame('/home/two/b'), 1000)).toBe(true);
  expect(captureMessage).toHaveBeenCalledTimes(1);
  expect(captureMessage).toHaveBeenCalledWith(
    'Revision engine ENGINE_FAILED (git worktree): fatal: path already exists',
    {
      level: 'error',
      fingerprint: ['desktop-revision-engine-failed', 'ENGINE_FAILED', 'worktree'],
      tags: { error_code: 'ENGINE_FAILED', git_subcommand: 'worktree' },
      contexts: {
        revision_engine: { code: 'ENGINE_FAILED', subcommand: 'worktree', git_error: 'fatal: path already exists' },
      },
    },
  );

  reportRevisionEngineFailure(frame('/home/one/a'), revisionEngineFailureWindow);
  expect(captureMessage).toHaveBeenCalledTimes(2);
});

it('receives renderer events over classic IPC only, without an injected preload', async () => {
  vi.stubGlobal('tauSentryDsn', 'https://key@errors.example/1');
  const { initializeDesktopErrorReporting } = await import('#main/error-reporting.js');
  initializeDesktopErrorReporting('staging');
  const options = initialize.mock.calls[0]?.[0] as {
    ipcMode: number;
    integrations: (defaults: Array<{ name: string }>) => Array<{ name: string }>;
  };
  expect(options.ipcMode).toBe(1);
  expect(options.integrations([{ name: 'PreloadInjection' }, { name: 'ChildProcess' }])).toEqual([
    { name: 'ChildProcess' },
  ]);
});

it('hands the renderer the DSN only once main can receive its events', async () => {
  vi.stubGlobal('tauSentryDsn', 'https://key@errors.example/1');
  const { rendererErrorReportingEnvironment } = await import('#main/error-reporting.js');
  expect(rendererErrorReportingEnvironment()).toEqual({});
  isInitialized.mockReturnValue(true);
  expect(rendererErrorReportingEnvironment()).toEqual({ SENTRY_DSN: 'https://key@errors.example/1' });
  vi.stubGlobal('tauSentryDsn', '');
  expect(rendererErrorReportingEnvironment()).toEqual({});
});
