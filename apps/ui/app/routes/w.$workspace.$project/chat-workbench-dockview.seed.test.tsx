/**
 * A fresh Workbench dock's seed is the app's arrangement, not the person's: Dockview must not announce it while a
 * project opens (progressive-loading rule 22).
 */
import { describe, expect, it, vi } from 'vitest';
import { mock } from 'vitest-mock-extended';
import type { DockviewApi, DockviewGroupPanel, IDockviewPanel } from 'dockview-react';
import { isChangingQuietly } from '#components/panes/dockview-announcements.js';
import { seedFreshWorkbench } from '#routes/w.$workspace.$project/chat-workbench-dockview.js';

const createSeedDockview = () => {
  const group = mock<DockviewGroupPanel>();
  const quiet: boolean[] = [];
  const panels: IDockviewPanel[] = [];
  const api = mock<DockviewApi>();
  /* The recorder: whether Dockview's announcements were silenced for each panel the seed adds. Dockview's api and
   * panels carry private members, which the mock's typed initial values cannot spell, so the values are assigned. */
  const addPanel = vi.fn((options: { readonly id: string }): IDockviewPanel => {
    quiet.push(isChangingQuietly(api));
    const added = Object.assign(mock<IDockviewPanel>(), { id: options.id });
    panels.push(added);
    return added;
  });
  Object.assign(group, { id: 'group-1' });
  Object.assign(api, { id: 'workbench-seed', panels, groups: [group], activeGroup: group, addPanel });
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
