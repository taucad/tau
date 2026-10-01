import { renderHook } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { mock } from 'vitest-mock-extended';
import type { ActorRefFrom } from 'xstate';
import type * as ReactModule from 'react';
import type { graphicsMachine } from '#machines/graphics.machine.js';
import { useMainGraphics } from '#hooks/use-project.js';

const context = vi.hoisted(() => ({
  mainEntryPath: 'main.ts',
  viewRecords: new Map(),
  viewEntryPaths: new Map<string, string>(),
  viewGraphics: new Map<string, unknown>(),
}));
vi.mock('react', async (importOriginal) => ({
  ...(await importOriginal<typeof ReactModule>()),
  useContext: () => context,
}));

describe('main graphics in a shared preview', () => {
  it('should select the main entry viewer rather than the first actor', () => {
    const other = mock<ActorRefFrom<typeof graphicsMachine>>();
    const main = mock<ActorRefFrom<typeof graphicsMachine>>();
    context.viewEntryPaths = new Map([
      ['other', 'other.ts'],
      ['main', 'main.ts'],
    ]);
    context.viewGraphics = new Map([
      ['other', other],
      ['main', main],
    ]);
    expect(renderHook(() => useMainGraphics()).result.current).toBe(main);
  });

  it('should return no viewer when the main entry has no renderer', () => {
    context.viewEntryPaths = new Map([['other', 'other.ts']]);
    context.viewGraphics = new Map([['other', mock<ActorRefFrom<typeof graphicsMachine>>()]]);
    expect(renderHook(() => useMainGraphics()).result.current).toBeUndefined();
  });
});
