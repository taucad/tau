import type * as ConfigurationManifest from '#components/machines/configuration-manifest.js';
// @vitest-environment jsdom
import { act, cleanup, renderHook, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { compileExportConfigurationManifest } from '#components/machines/configuration-manifest.js';
import { useCompiledConfigurationManifest } from '#components/machines/machine-section.js';
vi.mock('#components/machines/configuration-manifest.js', async (original) => {
  const actual = await original<typeof ConfigurationManifest>();
  return { compileExportConfigurationManifest: vi.fn(actual.compileExportConfigurationManifest) };
});
afterEach(cleanup);
const form = {
  schema: { type: 'object', properties: { speed: { type: 'number' } } },
  defaults: { speed: 10 },
} as const;
describe('derived machine form recovery', () => {
  it('exposes a compilation failure and retries the same form without issuing a machine command', async () => {
    vi.mocked(compileExportConfigurationManifest).mockRejectedValueOnce(new Error('Schema could not be compiled'));
    const { result } = renderHook(() => useCompiledConfigurationManifest('provider', 'action', form));
    await waitFor(() => {
      expect(result.current.error).toBe('Schema could not be compiled');
    });
    expect(result.current.manifest).toBeUndefined();
    act(() => {
      result.current.retry();
    });
    await waitFor(() => {
      expect(result.current.manifest).toBeDefined();
    });
    expect(result.current.error).toBeUndefined();
  });
  it('ignores a late failure for a replaced schema and invalidates the previous manifest immediately', async () => {
    const pending = Promise.withResolvers<Awaited<ReturnType<typeof compileExportConfigurationManifest>>>();
    vi.mocked(compileExportConfigurationManifest).mockReturnValueOnce(pending.promise);
    const next = { ...form, defaults: { speed: 20 } };
    const { result, rerender } = renderHook(
      ({ value }) => useCompiledConfigurationManifest('provider', 'action', value),
      { initialProps: { value: next } },
    );
    rerender({ value: { ...next, defaults: { speed: 30 } } });
    await waitFor(() => {
      expect(result.current.manifest).toBeDefined();
    });
    await act(async () => {
      pending.reject(new Error('Retired schema failed'));
    });
    expect(result.current.error).toBeUndefined();
  });
});
