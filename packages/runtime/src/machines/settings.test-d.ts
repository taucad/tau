import { describe, expectTypeOf, it } from 'vitest';
import { z } from 'zod';
import { defineConfiguration } from '#configuration/configuration.js';
import { setMachineConfiguration } from '#machines/settings.js';
import type { MachineSettingsRecord, SavedSettingsValues, SettingsDefinition } from '#machines/settings.js';

const schema = z.strictObject({ points: z.array(z.strictObject({ x: z.number() })).optional() });
const definition = defineConfiguration({ id: 'cam.preferences', version: '1', schema, ui: { version: 1, rjsf: {} } });

describe('machine settings authoring', () => {
  it('should infer deeply readonly values and preserve the versioned record shape', () => {
    expectTypeOf<SavedSettingsValues<typeof schema>>().toEqualTypeOf<
      Readonly<{ points?: ReadonlyArray<Readonly<{ x: number }>> }>
    >();
    expectTypeOf<SettingsDefinition<typeof schema>>().toEqualTypeOf<typeof definition>();
    const record: MachineSettingsRecord = {
      version: 1,
      typeId: 'cnc.router',
      activeProfile: 'default',
      profiles: { default: { name: 'Default', configurations: {} } },
    };
    // @ts-expect-error -- persisted records are deeply readonly.
    record.profiles['default']!.name = 'Changed';
    void setMachineConfiguration({
      settings: record,
      profileId: 'default',
      definition,
      // @ts-expect-error -- schema-correlated authoring rejects incorrectly typed values.
      values: { points: [{ x: '1' }] },
    });
    const transformed = z.strictObject({ feed: z.string().transform(Number) });
    expectTypeOf<SettingsDefinition<typeof transformed>>().toBeNever();
    const defaults = z.strictObject({ feed: z.number().default(1) });
    expectTypeOf<SettingsDefinition<typeof defaults>>().toBeNever();
  });
});
