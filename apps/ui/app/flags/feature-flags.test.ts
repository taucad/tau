import { describe, expect, it, beforeEach } from 'vitest';
import { isFeatureEnabled, getAllFlags, resetFlagCache, setFlagOverrides } from '#flags/feature-flags.js';
import { featureFlagDefaults } from '#flags/flag.constants.js';

function createMockStorage(initial?: Record<string, string>): Storage {
  const store = new Map<string, string>(Object.entries(initial ?? {}));
  return {
    getItem: (key: string) => store.get(key) ?? null,
    setItem(key: string, value: string) {
      store.set(key, value);
    },
    removeItem(key: string) {
      store.delete(key);
    },
    clear() {
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
  it('keeps machines disabled despite saved or newly written local overrides', () => {
    const storage = createMockStorage({ 'tau:flags': JSON.stringify({ machines: true }) });
    expect(featureFlagDefaults.machines).toBe(false);
    expect(isFeatureEnabled('machines', storage)).toBe(false);
    setFlagOverrides({ machines: true }, storage);
    expect(isFeatureEnabled('machines', storage)).toBe(false);
  });
  it('should keep code-only flags at their defaults even with stored overrides', () => {
    const storage = createMockStorage({ 'tau:flags': JSON.stringify({ automaticReload: true }) });
    expect(isFeatureEnabled('automaticReload', storage)).toBe(false);
    setFlagOverrides({ automaticReload: true }, storage);
    expect(isFeatureEnabled('automaticReload', storage)).toBe(false);
  });

  it.each(['webGpu', 'webGpuShaderStacks', 'webGpuInspector', 'partsWarehouse', 'pluginsStore'] as const)(
    'should keep the hidden %s flag at its disabled default despite an override',
    (flag) => {
      const storage = createMockStorage();
      expect(isFeatureEnabled(flag, storage)).toBe(false);
      setFlagOverrides({ [flag]: true }, storage);
      expect(isFeatureEnabled(flag, storage)).toBe(false);
    },
  );

  it('should return default value when no overrides exist', () => {
    const storage = createMockStorage();
    expect(isFeatureEnabled('marketingLanding', storage)).toBe(false);
  });

  it('should return overridden value when override is set to true', () => {
    const storage = createMockStorage({
      'tau:flags': JSON.stringify({ marketingLanding: true }),
    });
    expect(isFeatureEnabled('marketingLanding', storage)).toBe(true);
  });

  it('should return overridden value when override is set to false', () => {
    const storage = createMockStorage({
      'tau:flags': JSON.stringify({ marketingLanding: false }),
    });
    expect(isFeatureEnabled('marketingLanding', storage)).toBe(false);
  });

  it('should return default when storage has empty object', () => {
    const storage = createMockStorage({
      'tau:flags': JSON.stringify({}),
    });
    expect(isFeatureEnabled('marketingLanding', storage)).toBe(false);
  });

  it('should fall back to default for non-boolean override values', () => {
    const storage = createMockStorage({
      'tau:flags': JSON.stringify({ marketingLanding: 'yes' }),
    });
    expect(isFeatureEnabled('marketingLanding', storage)).toBe(false);
  });

  it('should ignore unknown flag keys and return default', () => {
    const storage = createMockStorage({
      'tau:flags': JSON.stringify({ unknownFlag: true }),
    });
    expect(isFeatureEnabled('marketingLanding', storage)).toBe(false);
  });

  it('should fall back to defaults for malformed JSON', () => {
    const storage = createMockStorage({
      'tau:flags': 'not-json',
    });
    expect(isFeatureEnabled('marketingLanding', storage)).toBe(false);
  });

  it('should return default when storage key is absent', () => {
    const storage = createMockStorage();
    expect(isFeatureEnabled('marketingLanding', storage)).toBe(false);
  });

  it('should fall back to defaults for array JSON', () => {
    const storage = createMockStorage({
      'tau:flags': JSON.stringify([true]),
    });
    expect(isFeatureEnabled('marketingLanding', storage)).toBe(false);
  });

  it('should fall back to defaults for primitive JSON values', () => {
    const storage = createMockStorage({
      'tau:flags': JSON.stringify(42),
    });
    expect(isFeatureEnabled('marketingLanding', storage)).toBe(false);
  });

  it('should fall back to default for numeric value instead of boolean', () => {
    const storage = createMockStorage({
      'tau:flags': JSON.stringify({ marketingLanding: 1 }),
    });
    expect(isFeatureEnabled('marketingLanding', storage)).toBe(false);
  });

  it('should fall back to default for null value', () => {
    const storage = createMockStorage({
      'tau:flags': JSON.stringify({ marketingLanding: null }),
    });
    expect(isFeatureEnabled('marketingLanding', storage)).toBe(false);
  });
});

// Gates the e2e-only `SectionViewTestBridge` mount in stage.tsx. Off by
// default ⇒ the bridge is never mounted/executed in prod; the e2e suite turns
// it on via `TAU_DEBUG=true` (apps/ui-e2e/global-setup.ts).
describe('tauDebug gate for SectionViewTestBridge', () => {
  it('should be disabled by default so the test bridge is not mounted in prod', () => {
    const storage = createMockStorage();
    expect(isFeatureEnabled('tauDebug', storage)).toBe(false);
  });

  it('should be enabled when the debug override is set so the bridge mounts under e2e', () => {
    const storage = createMockStorage({
      'tau:flags': JSON.stringify({ tauDebug: true }),
    });
    expect(isFeatureEnabled('tauDebug', storage)).toBe(true);
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
      'tau:flags': JSON.stringify({ marketingLanding: true }),
    });
    const flags = getAllFlags(storage);
    expect(flags).toStrictEqual({ ...featureFlagDefaults, marketingLanding: true });
  });

  it('should ignore unknown keys in overrides', () => {
    const storage = createMockStorage({
      'tau:flags': JSON.stringify({ marketingLanding: true, somethingElse: false }),
    });
    const flags = getAllFlags(storage);
    expect(flags).toStrictEqual({ ...featureFlagDefaults, marketingLanding: true });
    expect(flags).not.toHaveProperty('somethingElse');
  });

  it('should coerce invalid values to defaults via zod', () => {
    const storage = createMockStorage({
      'tau:flags': JSON.stringify({ marketingLanding: 'not-a-boolean' }),
    });
    const flags = getAllFlags(storage);
    expect(flags.marketingLanding).toBe(false);
  });
});

describe('setFlagOverrides', () => {
  it('should write overrides to storage', () => {
    const storage = createMockStorage();
    setFlagOverrides({ marketingLanding: true }, storage);
    expect(isFeatureEnabled('marketingLanding', storage)).toBe(true);
  });

  it('should merge with existing overrides', () => {
    const storage = createMockStorage({
      'tau:flags': JSON.stringify({ marketingLanding: false }),
    });
    setFlagOverrides({ marketingLanding: true }, storage);

    const raw = storage.getItem('tau:flags');
    expect(raw).toBeTruthy();
    const parsed = JSON.parse(raw!) as Record<string, unknown>;
    expect(parsed['marketingLanding']).toBe(true);
  });

  it('should reset internal cache after writing', () => {
    const storage = createMockStorage();

    expect(isFeatureEnabled('marketingLanding', storage)).toBe(false);
    setFlagOverrides({ marketingLanding: true }, storage);
    expect(isFeatureEnabled('marketingLanding', storage)).toBe(true);
  });
});

describe('resetFlagCache', () => {
  it('should allow re-reading from storage after reset', () => {
    const storage = createMockStorage();
    expect(isFeatureEnabled('marketingLanding', storage)).toBe(false);

    storage.setItem('tau:flags', JSON.stringify({ marketingLanding: true }));
    resetFlagCache();
    expect(isFeatureEnabled('marketingLanding', storage)).toBe(true);
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
      'tau:flags': JSON.stringify({
        marketingLanding: true,
        tauDebug: true,
        planMode: true,
        extra: 'data',
        another: 42,
      }),
    });
    const flags = getAllFlags(storage);
    expect(Object.keys(flags)).toStrictEqual(Object.keys(featureFlagDefaults));
    expect(flags.marketingLanding).toBe(true);
    expect(flags.tauDebug).toBe(true);
  });
});
