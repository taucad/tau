import { afterEach, describe, expect, it, vi } from 'vitest';
import { searchSettings, settingsSections } from '#components/settings/settings-registry.js';
import { experimentalFeatureFlagNames } from '#flags/flag.constants.js';

afterEach(() => {
  vi.unstubAllEnvs();
  vi.doUnmock('#environment.config.js');
  vi.resetModules();
});

describe('searchSettings', () => {
  it('should include every setting when its section matches', () => {
    const result = searchSettings('agents');

    expect(result).toHaveLength(1);
    expect(result[0]?.section.id).toBe('agents');
    expect(result[0]?.entries.map(({ id }) => id)).toEqual([
      'show-credits',
      'filesystem-context',
      'active-file',
      'open-tabs',
      'testing-tools',
    ]);
  });

  it('should register every feature flag with globally unique setting ids', () => {
    const entries = settingsSections.flatMap(({ entries }) => entries);
    const featureFlagIds = settingsSections.find(({ id }) => id === 'experimental')?.entries.map(({ id }) => id);

    expect(featureFlagIds).toEqual(experimentalFeatureFlagNames.map((flag) => `flag-${flag}`));
    expect(new Set(entries.map(({ id }) => id)).size).toBe(entries.length);
  });

  it('omits Machines settings and the deployment flag by default', async () => {
    vi.stubEnv('TAU_TARGET', 'desktop');
    // eslint-disable-next-line @typescript-eslint/naming-convention -- environment module and variable names.
    vi.doMock('#environment.config.js', () => ({ ENV: {} }));
    vi.resetModules();
    const desktop = await import('#components/settings/settings-registry.js');
    expect(desktop.settingsSections.some(({ id }) => id === 'machines')).toBe(false);
    expect(desktop.searchSettings('machines')).toEqual([]);
    expect(experimentalFeatureFlagNames).not.toContain('machines');
  });

  it('should find Machines by the parts and print options its machine details show on desktop', async () => {
    vi.stubEnv('TAU_TARGET', 'desktop');
    // eslint-disable-next-line @typescript-eslint/naming-convention -- environment module and variable names.
    vi.doMock('#environment.config.js', () => ({ ENV: { TAU_MACHINES_ENABLED: true } }));
    vi.resetModules();
    const desktop = await import('#components/settings/settings-registry.js');

    for (const query of [
      'firmware',
      'nozzle',
      'build volume',
      'demo speed',
      'enclosure',
      'kinematics',
      'bed plate',
      'chamber fan',
      'ams filament',
      'camera',
      'lan mode',
      'speed profile',
      'slicing',
      'bed leveling',
      'flow calibration',
      'timelapse',
      'router',
      'cnc mill',
      'grbl',
      'carvera',
      'spindle',
    ]) {
      expect(desktop.searchSettings(query).flatMap(({ entries }) => entries.map(({ id }) => id))).toContain('machines');
    }
  });

  it('should offer no browser storage setting in the desktop app, where Home is a folder on disk', async () => {
    vi.stubEnv('TAU_TARGET', 'desktop');
    // eslint-disable-next-line @typescript-eslint/naming-convention -- environment module and variable names.
    vi.doMock('#environment.config.js', () => ({ ENV: { TAU_MACHINES_ENABLED: true } }));
    vi.resetModules();
    const desktop = await import('#components/settings/settings-registry.js');

    expect(desktop.settingsSections.flatMap(({ entries }) => entries.map(({ id }) => id))).not.toContain(
      'browser-storage',
    );
    expect(settingsSections.flatMap(({ entries }) => entries.map(({ id }) => id))).toContain('browser-storage');
  });

  it('should offer the analytics switch in Data controls on desktop only, where cookie preferences do not apply', async () => {
    const dataControls = (sections: typeof settingsSections): string[] =>
      sections.find(({ id }) => id === 'data-controls')?.entries.map(({ id }) => id) ?? [];
    expect(dataControls(settingsSections)).not.toContain('desktop-analytics');
    expect(dataControls(settingsSections)).toContain('cookie-preferences');

    vi.stubEnv('TAU_TARGET', 'desktop');
    vi.resetModules();
    const desktop = await import('#components/settings/settings-registry.js');

    expect(dataControls(desktop.settingsSections)).toContain('desktop-analytics');
    expect(dataControls(desktop.settingsSections)).not.toContain('cookie-preferences');
    expect(desktop.searchSettings('analytics').flatMap(({ entries }) => entries.map(({ id }) => id))).toEqual([
      'desktop-analytics',
    ]);
  });

  it('should hide automatic reload from search and Experimental', () => {
    expect(searchSettings('automatic reload')).toEqual([]);
    expect(experimentalFeatureFlagNames).not.toContain('automaticReload');
  });

  it('should keep API keys out of navigation and search', () => {
    expect(settingsSections.map(({ id }) => String(id))).not.toContain('api-keys');
    expect(searchSettings('API keys')).toEqual([]);
  });
});
