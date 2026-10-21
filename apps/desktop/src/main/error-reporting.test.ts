import { mkdirSync, mkdtempSync, readdirSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { randomUUID } from 'node:crypto';
import { afterEach, expect, it, vi } from 'vitest';
import { prepareRouteQualificationProbe } from '#main/route-qualification-probe.js';

const { initialize } = vi.hoisted(() => ({ initialize: vi.fn() }));
vi.mock('@sentry/electron/main', () => ({ init: initialize }));
afterEach(() => {
  vi.unstubAllGlobals();
  vi.resetModules();
  initialize.mockReset();
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
    initializeDesktopErrorReporting();
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
  initializeDesktopErrorReporting();
  expect(initialize).not.toHaveBeenCalled();
});
