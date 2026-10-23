// @vitest-environment jsdom
import { act, renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

const loaded: Array<{ readonly closeBuildSkewChannel: () => void }> = [];

/** Fresh module graph per test: the superseding build lives at module scope. */
const load = async () => {
  vi.resetModules();
  const skew = await import('#filesystem/build-skew.js');
  loaded.push(skew);
  const { useSupersedingBuild } = await import('#hooks/use-superseding-build.js');
  return { ...skew, useSupersedingBuild };
};

afterEach(() => {
  for (const skew of loaded.splice(0)) {
    skew.closeBuildSkewChannel();
  }
});

describe('useSupersedingBuild', () => {
  it('should name this build until another supersedes it', async () => {
    const { buildId, useSupersedingBuild } = await load();

    const { result } = renderHook(() => useSupersedingBuild());

    expect(result.current).toStrictEqual({ supersedingBuildId: buildId, isRolledBack: false });
  });

  it('should follow the build the server names, a rollback included', async () => {
    const { buildId, queryLiveBuild, useSupersedingBuild } = await load();
    const { result } = renderHook(() => useSupersedingBuild());
    vi.stubGlobal('fetch', async () => Response.json({ buildId: buildId - 1 }));

    await act(async () => {
      await queryLiveBuild();
    });

    expect(result.current).toStrictEqual({ supersedingBuildId: buildId - 1, isRolledBack: true });
  });
});
