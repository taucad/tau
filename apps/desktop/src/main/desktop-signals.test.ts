/* eslint-disable @typescript-eslint/naming-convention -- Sentry tag names are snake_case. */
import { describe, expect, it } from 'vitest';
import {
  appLoadFailureSignal,
  rendererGoneSignal,
  rendererHangSignal,
  rendererHangThreshold,
  scrubFailureText,
  updaterFailureSignal,
} from '#main/desktop-signals.js';

describe('rendererGoneSignal', () => {
  it('should report the exits the SDK only leaves breadcrumbs for', () => {
    expect(rendererGoneSignal({ reason: 'oom', exitCode: 9 })).toStrictEqual({
      message: 'Renderer gone: oom',
      level: 'error',
      fingerprint: ['desktop-renderer-gone', 'oom'],
      tags: { reason: 'oom', exit_code: '9' },
    });
    expect(rendererGoneSignal({ reason: 'killed' })?.tags).toStrictEqual({ reason: 'killed' });
  });

  it('should leave clean exits and the reasons the SDK reports itself', () => {
    for (const reason of ['clean-exit', 'crashed', 'abnormal-exit', 'launch-failed', 'integrity-failure']) {
      expect(rendererGoneSignal({ reason })).toBeUndefined();
    }
    expect(rendererGoneSignal(undefined)).toBeUndefined();
  });
});

describe('rendererHangSignal', () => {
  it('should report a long hang with its duration and ignore a short one', () => {
    expect(rendererHangSignal(rendererHangThreshold)).toBeUndefined();
    expect(rendererHangSignal(12_400)).toStrictEqual({
      message: 'Renderer unresponsive',
      level: 'warning',
      fingerprint: ['desktop-renderer-hang'],
      tags: { hang_seconds: '12' },
      contexts: { hang: { milliseconds: 12_400 } },
    });
  });
});

describe('appLoadFailureSignal', () => {
  it('should report a failed main-frame load by error code and scheme, without the URL', () => {
    const signal = appLoadFailureSignal({
      errorCode: -6,
      errorDescription: 'ERR_FILE_NOT_FOUND',
      url: 'app://tau/w/home/secret',
      isMainFrame: true,
    });
    expect(signal).toStrictEqual({
      message: 'App document failed to load: ERR_FILE_NOT_FOUND',
      level: 'error',
      fingerprint: ['desktop-app-load-failed', '-6'],
      tags: { error_code: '-6', url_scheme: 'app' },
    });
    expect(JSON.stringify(signal)).not.toContain('secret');
  });

  it('should ignore subframes and aborted loads', () => {
    expect(appLoadFailureSignal({ errorCode: -6, errorDescription: 'x', url: 'app://tau/', isMainFrame: false })).toBe(
      undefined,
    );
    expect(
      appLoadFailureSignal({ errorCode: -3, errorDescription: 'ERR_ABORTED', url: 'app://tau/', isMainFrame: true }),
    ).toBeUndefined();
  });
});

describe('updaterFailureSignal', () => {
  const update = { channel: 'production', version: '1.2.3' };

  it('should report check, download and restart failures by stage', () => {
    expect(updaterFailureSignal('updater.error', { message: 'net::ERR_TIMED_OUT' }, update)).toStrictEqual({
      message: 'Update failed (check-or-download): net::ERR_TIMED_OUT',
      level: 'error',
      fingerprint: ['desktop-update-failed', 'check-or-download'],
      tags: { update_stage: 'check-or-download', update_channel: 'production', update_from_version: '1.2.3' },
    });
    expect(updaterFailureSignal('updater.restart-failed', {}, update)?.message).toBe(
      'Update failed (restart): unknown',
    );
  });

  it('should ignore every other updater line', () => {
    expect(updaterFailureSignal('updater.release-failed', { message: 'x' }, update)).toBeUndefined();
    expect(updaterFailureSignal('updater.checking', undefined, update)).toBeUndefined();
  });
});

describe('scrubFailureText', () => {
  it('should replace home directories and cap the length', () => {
    expect(scrubFailureText("EACCES: open '/Users/dana/Library/Caches/tau/update.zip'")).toBe(
      "EACCES: open '~/Library/Caches/tau/update.zip'",
    );
    expect(scrubFailureText(String.raw`EPERM C:\Users\dana\AppData\Local\tau`)).toBe(
      String.raw`EPERM ~\AppData\Local\tau`,
    );
    expect(scrubFailureText('/home/dana/.cache/tau')).toBe('~/.cache/tau');
    expect(scrubFailureText('x'.repeat(500))).toHaveLength(200);
  });
});
