// @vitest-environment node
import { describe, expect, it } from 'vitest';

import { resolveElectronNumericParameterOverride } from './parameter-override-sync.js';

describe('resolveElectronNumericParameterOverride', () => {
  const cubeSideDefaultNumeric3 = { name: 'len', defaultValue: 3 } as const;
  const cubeSideDefaultNumeric300 = { name: 'len', defaultValue: 300 } as const;

  it('starts from undefined previous + last snapshots with the extracted default', () => {
    expect(resolveElectronNumericParameterOverride(cubeSideDefaultNumeric3, undefined, undefined)).toEqual({
      name: 'len',
      value: 3,
    });
  });

  it('tracks a growing literal (`3` → `300`): override follows the kernel default without a rename', () => {
    expect(
      resolveElectronNumericParameterOverride(
        cubeSideDefaultNumeric300,
        { name: 'len', value: 3 },
        { name: 'len', value: 3 },
      ),
    ).toEqual({ name: 'len', value: 300 });
  });

  it('keeps a slider-only divergence while the extracted default is unchanged', () => {
    expect(
      resolveElectronNumericParameterOverride(
        { name: 'len', defaultValue: 200 },
        { name: 'len', value: 400 },
        {
          name: 'len',
          value: 200,
        },
      ),
    ).toEqual({ name: 'len', value: 400 });
  });

  it('re-bases identity when the first numeric parameter is renamed (`len` → `length`)', () => {
    expect(
      resolveElectronNumericParameterOverride(
        { name: 'length', defaultValue: 200 },
        { name: 'len', value: 200 },
        { name: 'len', value: 200 },
      ),
    ).toEqual({ name: 'length', value: 200 });
  });

  it('clears when no numeric literal remains', () => {
    expect(
      resolveElectronNumericParameterOverride(undefined, { name: 'len', value: 3 }, { name: 'len', value: 3 }),
    ).toBeUndefined();
  });
});
