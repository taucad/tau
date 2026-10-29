/* eslint-disable @typescript-eslint/naming-convention -- environment variable names */
import { mkdtempSync, readFileSync, rmSync, statSync, utimesSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { nodeTelemetryPreference, telemetryConfigFileName } from '#node.js';

describe('nodeTelemetryPreference', () => {
  let configDirectory: string;
  let clock: number;
  const origin = 'https://api.tau.test';
  const create = (env: Record<string, string | undefined> = {}) =>
    nodeTelemetryPreference({ env, configDir: configDirectory, apiOrigin: `${origin}/v1`, now: () => clock });

  beforeEach(() => {
    configDirectory = mkdtempSync(path.join(tmpdir(), 'tau-telemetry-'));
    clock = 0;
  });
  afterEach(() => {
    rmSync(configDirectory, { recursive: true, force: true });
  });

  it.each(['0', 'false', 'OFF', ' off '])('should honour TAU_TELEMETRY=%j as off', (value) => {
    expect(create({ TAU_TELEMETRY: value, DO_NOT_TRACK: '1' }).current()).toEqual({
      preference: 'off',
      explicitOptIn: false,
      source: 'env',
    });
  });

  it('should honour DO_NOT_TRACK=1 next', () => {
    expect(create({ TAU_TELEMETRY: '1', DO_NOT_TRACK: '1' }).current()).toMatchObject({ source: 'do-not-track' });
  });

  it('should be unset without a config file or with a broken one', () => {
    const preference = create({ DO_NOT_TRACK: '0' });
    expect(preference.current()).toEqual({ preference: 'unset', explicitOptIn: false, source: 'default' });
    writeFileSync(path.join(configDirectory, telemetryConfigFileName), '{broken');
    clock = 5000;
    expect(preference.current()).toMatchObject({ preference: 'unset' });
    writeFileSync(
      path.join(configDirectory, telemetryConfigFileName),
      JSON.stringify({ origins: { [origin]: 'maybe' } }),
    );
    utimesSync(path.join(configDirectory, telemetryConfigFileName), 100, 100);
    clock = 10_000;
    expect(preference.current()).toMatchObject({ preference: 'unset' });
  });

  it('should write the preference per origin and read it back, as an explicit opt-in only when on', async () => {
    const preference = create();
    await preference.write('on');
    expect(preference.current()).toEqual({ preference: 'on', explicitOptIn: true, source: 'config' });
    const file = path.join(configDirectory, telemetryConfigFileName);
    expect(JSON.parse(readFileSync(file, 'utf8'))).toEqual({ origins: { [origin]: 'on' } });
    expect(statSync(file).mode.toString(8).slice(-3)).toBe('600');
    await preference.write('off');
    expect(preference.current()).toEqual({ preference: 'off', explicitOptIn: false, source: 'config' });
  });

  it('should check the config file at most once a second', () => {
    const preference = create();
    expect(preference.current().preference).toBe('unset');
    writeFileSync(path.join(configDirectory, telemetryConfigFileName), JSON.stringify({ origins: { [origin]: 'on' } }));
    clock = 999;
    expect(preference.current().preference).toBe('unset');
    clock = 1000;
    expect(preference.current().preference).toBe('on');
    rmSync(path.join(configDirectory, telemetryConfigFileName));
    clock = 2000;
    expect(preference.current().preference).toBe('unset');
  });

  it('should default its clock', () => {
    expect(
      nodeTelemetryPreference({ env: {}, configDir: configDirectory, apiOrigin: origin }).current().preference,
    ).toBe('unset');
  });
});
