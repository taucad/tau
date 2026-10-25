import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
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
