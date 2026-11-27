/**
 * A fresh Workbench dock's seed is the app's arrangement, not the person's: Dockview must not announce it while a
 * project opens (progressive-loading rule 22).
 */
import { describe, expect, it, vi } from 'vitest';
import type { DockviewApi, DockviewGroupPanel } from 'dockview-react';
import { isChangingQuietly } from '#components/panes/dockview-announcements.js';
import { seedFreshWorkbench } from '#routes/w.$workspace.$project/chat-workbench-dockview.js';

const createSeedDockview = () => {
  const group: Pick<DockviewGroupPanel, 'id'> = { id: 'group-1' };
  const quiet: boolean[] = [];
  const panels: unknown[] = [];
  const fake = { id: 'workbench-seed', panels, groups: [group], activeGroup: group, addPanel: vi.fn() };
  const api = fake as unknown as DockviewApi;
  fake.addPanel.mockImplementation((options: { readonly id: string }) => {
    quiet.push(isChangingQuietly(api));
    const added = { id: options.id, api: { setActive: vi.fn(), updateParameters: vi.fn(), setTitle: vi.fn() } };
    panels.push(added);
    return added;
  });
  return { api, quiet };
};

describe('seedFreshWorkbench', () => {
  it.each(['editor', 'shared'] as const)('seeds the %s profile without Dockview announcing it', (profile) => {
    const { api, quiet } = createSeedDockview();

    seedFreshWorkbench({ api, profile });

    expect(quiet.length).toBeGreaterThan(0);
    expect(quiet.every(Boolean)).toBe(true);
    expect(isChangingQuietly(api)).toBe(false);
  });
});
