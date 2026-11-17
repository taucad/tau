import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import {
  createRendererTelemetryConsentRelay,
  isRendererTelemetryConsent,
  readRendererTelemetryConsent,
  writeRendererTelemetryConsent,
} from '#main/telemetry-consent.js';

const statePath = (): string => join(mkdtempSync(join(tmpdir(), 'tau-telemetry-consent-')), 'telemetry-consent.json');

describe('renderer telemetry consent', () => {
  it('should read unknown before the renderer has said anything', () => {
    expect(readRendererTelemetryConsent(statePath())).toBe('unknown');
  });

  it.each(['granted', 'denied', 'unknown'] as const)('should persist %s across launches', (consent) => {
    const path = statePath();
    writeRendererTelemetryConsent(path, consent);
    expect(readRendererTelemetryConsent(path)).toBe(consent);
  });

  it('should treat an unreadable or foreign file as unknown', () => {
    const path = statePath();
    writeFileSync(path, '{"consent":"yes"}');
    expect(readRendererTelemetryConsent(path)).toBe('unknown');
    writeFileSync(path, 'not json');
    expect(readRendererTelemetryConsent(path)).toBe('unknown');
  });

  it('should accept only the three resolved values from IPC', () => {
    expect(isRendererTelemetryConsent('granted')).toBe(true);
    expect(isRendererTelemetryConsent('on')).toBe(false);
    expect(isRendererTelemetryConsent(undefined)).toBe(false);
  });
});

describe('renderer telemetry consent relay to the services host', () => {
  const relay = (path: string) => {
    const publish = vi.fn();
    const warn = vi.fn();
    return { publish, warn, ...createRendererTelemetryConsentRelay({ path, publish, warn }) };
  };

  it('should tell the services host unknown at launch when the renderer has never said anything', () => {
    const { publish } = relay(statePath());
    expect(publish).toHaveBeenCalledExactlyOnceWith({ type: 'telemetryConsent', consent: 'unknown' });
  });

  it("should tell the services host the last launch's consent before the page loads", () => {
    const path = statePath();
    writeRendererTelemetryConsent(path, 'granted');
    const { publish } = relay(path);
    expect(publish).toHaveBeenCalledExactlyOnceWith({ type: 'telemetryConsent', consent: 'granted' });
  });

  it.each(['granted', 'denied', 'unknown'] as const)('should persist and relay %s from the renderer', (consent) => {
    const path = statePath();
    const { publish, accept } = relay(path);
    accept(consent);
    expect(publish).toHaveBeenLastCalledWith({ type: 'telemetryConsent', consent });
    expect(readRendererTelemetryConsent(path)).toBe(consent);
  });

  it('should ignore a value that is not a resolved consent', () => {
    const { publish, accept } = relay(statePath());
    accept('on');
    accept(undefined);
    expect(publish).toHaveBeenCalledOnce();
  });

  it('should still relay a change it could not persist', () => {
    const directory = mkdtempSync(join(tmpdir(), 'tau-telemetry-consent-'));
    /* A file where the state file's directory should be: persisting fails. */
    writeFileSync(join(directory, 'blocked'), '');
    const { publish, warn, accept } = relay(join(directory, 'blocked', 'telemetry-consent.json'));
    accept('denied');
    expect(warn).toHaveBeenCalledWith('telemetry-consent.write-failed', expect.any(Object));
    expect(publish).toHaveBeenLastCalledWith({ type: 'telemetryConsent', consent: 'denied' });
  });
});
