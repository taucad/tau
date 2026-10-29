import { describe, expect, it, vi } from 'vitest';

vi.mock('#configuration/configuration.js', () => {
  throw new Error('Configuration validation must load only when a configuration is resolved or edited');
});

describe('machine settings envelope entry', () => {
  it('reads and serializes opaque settings without loading configuration validation', async () => {
    const { machineSettingsPath, readMachineSettings, serializeMachineSettings } =
      await import('#machines/settings.js');
    const record = {
      version: 1,
      typeId: 'bambu.x1c',
      activeProfile: 'default',
      profiles: {
        default: {
          name: 'Default',
          configurations: { 'unavailable.provider': { version: '1', values: { layer: 0.2 } } },
        },
      },
    } as const;
    expect(machineSettingsPath({ typeId: record.typeId })).toBe('.tau/machines/settings/bambu.x1c.json');
    const serialized = serializeMachineSettings({ record });
    expect(readMachineSettings({ bytes: new TextEncoder().encode(serialized), typeId: record.typeId })).toEqual({
      status: 'current',
      record,
    });
  });
});
