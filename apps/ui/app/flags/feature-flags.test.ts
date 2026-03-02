import { describe, expect, it, beforeEach } from 'vitest';
import { isFeatureEnabled, getAllFlags, resetFlagCache, setFlagOverrides } from '#flags/feature-flags.js';
import { featureFlagDefaults } from '#flags/flag.constants.js';

function createMockStorage(initial?: Record<string, string>): Storage {
  const store = new Map<string, string>(Object.entries(initial ?? {}));
  return {
    getItem: (key: string) => store.get(key) ?? null,
    setItem: (key: string, value: string) => {
      store.set(key, value);
    },
    removeItem: (key: string) => {
      store.delete(key);
    },
    clear: () => {
      store.clear();
    },
    get length() {
      return store.size;
    },
    key: (_index: number) => null,
  };
}

beforeEach(() => {
  resetFlagCache();
});

describe('isFeatureEnabled', () => {
  it('should return default value when no overrides exist', () => {
    const storage = createMockStorage();
    expect(isFeatureEnabled('planMode', storage)).toBe(false);
  });

  it('should return overridden value when override is set to true', () => {
    const storage = createMockStorage({
      'tau:flags': JSON.stringify({ planMode: true }),
    });
    expect(isFeatureEnabled('planMode', storage)).toBe(true);
  });

  it('should return overridden value when override is set to false', () => {
    const storage = createMockStorage({
      'tau:flags': JSON.stringify({ planMode: false }),
    });
    expect(isFeatureEnabled('planMode', storage)).toBe(false);
  });

  it('should return default when storage has empty object', () => {
    const storage = createMockStorage({
      'tau:flags': JSON.stringify({}),
    });
    expect(isFeatureEnabled('planMode', storage)).toBe(false);
  });

  it('should fall back to default for non-boolean override values', () => {
    const storage = createMockStorage({
      'tau:flags': JSON.stringify({ planMode: 'yes' }),
    });
    expect(isFeatureEnabled('planMode', storage)).toBe(false);
  });

  it('should ignore unknown flag keys and return default', () => {
    const storage = createMockStorage({
      'tau:flags': JSON.stringify({ unknownFlag: true }),
    });
    expect(isFeatureEnabled('planMode', storage)).toBe(false);
  });

  it('should fall back to defaults for malformed JSON', () => {
    const storage = createMockStorage({
      'tau:flags': 'not-json',
    });
    expect(isFeatureEnabled('planMode', storage)).toBe(false);
  });

  it('should return default when storage key is absent', () => {
    const storage = createMockStorage();
    expect(isFeatureEnabled('planMode', storage)).toBe(false);
  });

  it('should fall back to defaults for array JSON', () => {
    const storage = createMockStorage({
      'tau:flags': JSON.stringify([true]),
    });
    expect(isFeatureEnabled('planMode', storage)).toBe(false);
  });

  it('should fall back to defaults for primitive JSON values', () => {
    const storage = createMockStorage({
      'tau:flags': JSON.stringify(42),
    });
    expect(isFeatureEnabled('planMode', storage)).toBe(false);
  });

  it('should fall back to default for numeric value instead of boolean', () => {
    const storage = createMockStorage({
      'tau:flags': JSON.stringify({ planMode: 1 }),
    });
    expect(isFeatureEnabled('planMode', storage)).toBe(false);
  });

  it('should fall back to default for null value', () => {
    const storage = createMockStorage({
      'tau:flags': JSON.stringify({ planMode: null }),
    });
    expect(isFeatureEnabled('planMode', storage)).toBe(false);
  });
});

describe('getAllFlags', () => {
  it('should return all defaults when no overrides exist', () => {
    const storage = createMockStorage();
    const flags = getAllFlags(storage);
    expect(flags).toStrictEqual(featureFlagDefaults);
  });

  it('should merge overrides with defaults', () => {
    const storage = createMockStorage({
      'tau:flags': JSON.stringify({ planMode: true }),
    });
    const flags = getAllFlags(storage);
    expect(flags).toStrictEqual({ planMode: true });
  });

  it('should ignore unknown keys in overrides', () => {
    const storage = createMockStorage({
      'tau:flags': JSON.stringify({ planMode: true, somethingElse: false }),
    });
    const flags = getAllFlags(storage);
    expect(flags).toStrictEqual({ planMode: true });
    expect(flags).not.toHaveProperty('somethingElse');
  });

  it('should coerce invalid values to defaults via zod', () => {
    const storage = createMockStorage({
      'tau:flags': JSON.stringify({ planMode: 'not-a-boolean' }),
    });
    const flags = getAllFlags(storage);
    expect(flags.planMode).toBe(false);
  });
});

describe('setFlagOverrides', () => {
  it('should write overrides to storage', () => {
    const storage = createMockStorage();
    setFlagOverrides({ planMode: true }, storage);
    expect(isFeatureEnabled('planMode', storage)).toBe(true);
  });

  it('should merge with existing overrides', () => {
    const storage = createMockStorage({
      'tau:flags': JSON.stringify({ planMode: false }),
    });
    setFlagOverrides({ planMode: true }, storage);

    const raw = storage.getItem('tau:flags');
    expect(raw).toBeTruthy();
    const parsed = JSON.parse(raw!) as Record<string, unknown>;
    expect(parsed.planMode).toBe(true);
  });

  it('should reset internal cache after writing', () => {
    const storage = createMockStorage();

    expect(isFeatureEnabled('planMode', storage)).toBe(false);
    setFlagOverrides({ planMode: true }, storage);
    expect(isFeatureEnabled('planMode', storage)).toBe(true);
  });
});

describe('resetFlagCache', () => {
  it('should allow re-reading from storage after reset', () => {
    const storage = createMockStorage();
    expect(isFeatureEnabled('planMode', storage)).toBe(false);

    storage.setItem('tau:flags', JSON.stringify({ planMode: true }));
    resetFlagCache();
    expect(isFeatureEnabled('planMode', storage)).toBe(true);
  });
});

describe('zod schema fallback', () => {
  it('should produce valid defaults for completely empty input', () => {
    const storage = createMockStorage({ 'tau:flags': '{}' });
    const flags = getAllFlags(storage);
    expect(flags).toStrictEqual(featureFlagDefaults);
  });

  it('should produce valid defaults for corrupt storage', () => {
    const storage = createMockStorage({ 'tau:flags': '{{invalid' });
    const flags = getAllFlags(storage);
    expect(flags).toStrictEqual(featureFlagDefaults);
  });

  it('should strip extra keys and keep only registered flags', () => {
    const storage = createMockStorage({
      'tau:flags': JSON.stringify({ planMode: true, extra: 'data', another: 42 }),
    });
    const flags = getAllFlags(storage);
    expect(Object.keys(flags)).toStrictEqual(Object.keys(featureFlagDefaults));
    expect(flags.planMode).toBe(true);
  });
});
