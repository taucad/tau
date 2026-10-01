import { describe, expect, expectTypeOf, it, vi } from 'vitest';
import { z } from 'zod';
import { defineConfiguration } from '#configuration/configuration.js';
import {
  machineSettingsPath,
  readMachineSettings,
  serializeMachineSettings,
  readMachineConfiguration,
  setMachineConfiguration,
} from '#machines/settings.js';
import type { MachineSettingsRecord, SettingsDefinition } from '#machines/settings.js';

const settings: MachineSettingsRecord = {
  version: 1,
  typeId: 'bambu.x1c',
  activeProfile: 'default',
  profiles: {
    default: { name: 'Default', configurations: {} },
    fine: {
      name: 'Fine',
      configurations: {
        'other.source': { version: '7', values: { nested: [1, true, null] } },
      },
    },
  },
};
const schema = z.strictObject({
  process: z.string().optional(),
  walls: z.number().int().positive().optional(),
});
const definition = defineConfiguration({
  id: 'slicer.settings',
  version: '1',
  schema,
  ui: { version: 1, rjsf: {} },
});
const bytes = (value: unknown) => new TextEncoder().encode(JSON.stringify(value));

describe('versioned machine preferences', () => {
  it('should admit immutable records, reject unsafe identities and preserve unsupported bytes', () => {
    expect(machineSettingsPath({ typeId: 'bambu.x1c' })).toBe('.tau/machines/settings/bambu.x1c.json');
    expect(() => machineSettingsPath({ typeId: '../x' as 'bambu.x1c' })).toThrow();
    const read = readMachineSettings({
      bytes: bytes(settings),
      typeId: 'bambu.x1c',
    });
    expect(read.status).toBe('current');
    if (read.status !== 'current') {
      throw new Error('Expected record');
    }
    expect(Object.isFrozen(read.record.profiles['fine']?.configurations)).toBe(true);
    expect(
      readMachineSettings({
        bytes: bytes({ ...settings, version: 2 }),
        typeId: 'bambu.x1c',
      }),
    ).toMatchObject({ code: 'NEWER_RECORD' });
    expect(readMachineSettings({ bytes: bytes(settings), typeId: 'bambu.a1-mini' })).toMatchObject({
      code: 'MACHINE_TYPE_MISMATCH',
    });
    for (const invalid of [
      { ...settings, activeProfile: 'missing' },
      { ...settings, profiles: {} },
      { ...settings, extra: true },
      JSON.parse(
        '{"version":1,"typeId":"bambu.x1c","activeProfile":"default","profiles":{"default":{"name":"Default","configurations":{"__proto__":{"version":"1","values":{}}}}}}',
      ),
    ]) {
      expect(readMachineSettings({ bytes: bytes(invalid), typeId: 'bambu.x1c' }).status).toBe('refused');
    }
    expect(
      readMachineSettings({
        bytes: new Uint8Array(262_145),
        typeId: 'bambu.x1c',
      }).status,
    ).toBe('refused');
    expect(readMachineSettings({ bytes: new Uint8Array([255]), typeId: 'bambu.x1c' }).status).toBe('refused');
    expect(() =>
      serializeMachineSettings({
        record: {
          ...settings,
          profiles: {
            default: {
              name: 'Default',
              configurations: {
                x: { version: '1', values: { value: Infinity } },
              },
            },
          },
        },
      }),
    ).toThrow();
  });
  it('should edit only the captured profile and retain opaque blocks through deterministic serialization', async () => {
    const edit = await setMachineConfiguration({
      settings,
      profileId: 'fine',
      definition,
      values: { process: 'Fine', walls: 3 },
    });
    expect(edit.status).toBe('current');
    if (edit.status !== 'current') {
      throw new Error('Expected edit');
    }
    expect(edit.settings.profiles['default']).toEqual(settings.profiles['default']);
    expect(edit.settings.profiles['fine']?.configurations['other.source']).toEqual(
      settings.profiles['fine']?.configurations['other.source'],
    );
    expect(settings.profiles['fine']?.configurations['slicer.settings']).toBeUndefined();
    const text = serializeMachineSettings({ record: edit.settings });
    const read = readMachineSettings({
      bytes: new TextEncoder().encode(text),
      typeId: 'bambu.x1c',
    });
    if (read.status !== 'current') {
      throw new Error('Expected round trip');
    }
    expect(serializeMachineSettings({ record: read.record })).toBe(text);
    const current = await readMachineConfiguration({
      settings: read.record,
      profileId: 'fine',
      definition,
    });
    if (current.status === 'current') {
      expectTypeOf(current.values).toEqualTypeOf<Readonly<{ process?: string; walls?: number }>>();
    }
    expect(current).toEqual({
      status: 'current',
      values: { process: 'Fine', walls: 3 },
    });
    expect(
      await readMachineConfiguration({
        settings,
        profileId: 'default',
        definition,
      }),
    ).toEqual({ status: 'absent' });
    expect(
      await setMachineConfiguration({
        settings,
        profileId: 'missing',
        definition,
        values: {},
      }),
    ).toMatchObject({ code: 'PROFILE_NOT_FOUND' });
    const removed = await setMachineConfiguration({
      settings: edit.settings,
      profileId: 'fine',
      definition,
      values: undefined,
    });
    if (removed.status !== 'current') {
      throw new Error('Expected removal');
    }
    expect(removed.settings.profiles['fine']?.configurations['slicer.settings']).toBeUndefined();
    expect(
      await setMachineConfiguration({
        settings,
        profileId: 'fine',
        definition,
        values: { walls: -1 },
      }),
    ).toMatchObject({ code: 'CONFIGURATION_INVALID' });
  });
  it('should validate an immutable block once per definition and refuse transformations or wrong versions', async () => {
    const spy = vi.spyOn(schema['~standard'], 'validate');
    const edit = await setMachineConfiguration({
      settings,
      profileId: 'fine',
      definition,
      values: { walls: 3 },
    });
    if (edit.status !== 'current') {
      throw new Error('Expected edit');
    }
    spy.mockClear();
    await Promise.all(
      [1, 2, 3].map(async () =>
        readMachineConfiguration({
          settings: edit.settings,
          profileId: 'fine',
          definition,
        }),
      ),
    );
    expect(spy).toHaveBeenCalledTimes(1);
    spy.mockRestore();
    const future = defineConfiguration({
      id: 'slicer.settings',
      version: '2',
      schema,
      ui: { version: 1, rjsf: {} },
    });
    expect(
      await readMachineConfiguration({
        settings: edit.settings,
        profileId: 'fine',
        definition: future,
      }),
    ).toMatchObject({ code: 'CONFIGURATION_VERSION_UNSUPPORTED' });
    const defaults = defineConfiguration({
      id: 'defaults',
      version: '1',
      schema: z.strictObject({ walls: z.number().default(2) }),
      ui: { version: 1, rjsf: {} },
    });
    // A same-type validator can still insert defaults; runtime checks sparse-value preservation.
    expect(
      await setMachineConfiguration({
        settings,
        profileId: 'fine',
        definition: defaults as unknown as SettingsDefinition<typeof schema>,
        values: {},
      }),
    ).toMatchObject({ code: 'CONFIGURATION_INVALID' });
    await expect(
      readMachineConfiguration({
        settings,
        profileId: 'default',
        definition,
        signal: AbortSignal.abort(),
      }),
    ).rejects.toThrow();
  });
});
