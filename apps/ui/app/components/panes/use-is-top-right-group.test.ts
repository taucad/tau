import { act, renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { mock } from 'vitest-mock-extended';
import type { DockviewApi, DockviewGroupPanel, DockviewGroupPanelApi } from 'dockview-react';
import {
  checkGroupIsTopCorner,
  checkGroupIsTopRight,
  useIsTopLeftGroup,
  useIsTopRightGroup,
} from '#components/panes/use-is-top-right-group.js';

const roots: HTMLElement[] = [];

const createGroup = (): DockviewGroupPanel => {
  const element = document.createElement('div');
  element.className = 'dv-groupview';
  const group = mock<DockviewGroupPanel>({
    api: mock<DockviewGroupPanelApi>({ location: { type: 'grid' }, isVisible: true, isMaximized: () => false }),
  });
  Object.defineProperty(group, 'element', { value: element });
  return group;
};

/** Match Dockview's native split wrappers, including its visibility class. */
const split = (orientation: 'horizontal' | 'vertical', children: HTMLElement[]): HTMLElement => {
  const branch = document.createElement('div');
  branch.className = 'dv-branch-node';
  const container = document.createElement('div');
  container.className = `dv-split-view-container dv-${orientation}`;
  const views = document.createElement('div');
  views.className = 'dv-view-container';
  for (const child of children) {
    const view = document.createElement('div');
    view.className = 'dv-view visible';
    view.append(child);
    views.append(view);
  }
  container.append(views);
  branch.append(container);
  return branch;
};

const mount = (branch: HTMLElement): HTMLElement => {
  const root = document.createElement('div');
  root.className = 'dv-dockview';
  const grid = document.createElement('div');
  grid.className = 'dv-grid-view';
  grid.append(branch);
  root.append(grid);
  document.body.append(root);
  roots.push(root);
  return root;
};

const createLayoutEvents = () => {
  const listeners = new Set<() => void>();
  const subscribe = (listener: () => void) => {
    listeners.add(listener);
    return { dispose: () => listeners.delete(listener) };
  };
  return {
    api: mock<DockviewApi>({ onDidLayoutChange: subscribe, onDidMaximizedGroupChange: () => ({ dispose: vi.fn() }) }),
    fire: () => {
      for (const listener of listeners) {
        listener();
      }
    },
    listeners,
  };
};

afterEach(() => {
  for (const root of roots.splice(0)) {
    root.remove();
  }
  vi.restoreAllMocks();
});

describe('Dockview corner ownership', () => {
  it('should own both corners before dimensions are available', () => {
    const group = createGroup();
    mount(split('horizontal', [group.element]));

    expect(checkGroupIsTopCorner(group, 'left')).toBe(true);
    expect(checkGroupIsTopRight(group)).toBe(true);
  });

  it('should retain corner ownership while its outer workspace lane is hidden or resized', () => {
    const group = createGroup();
    const root = mount(split('horizontal', [group.element]));
    root.style.display = 'none';

    expect(checkGroupIsTopRight(group)).toBe(true);
    root.style.display = '';
    root.style.width = '600px';
    expect(checkGroupIsTopRight(group)).toBe(true);
  });

  it('should find unique corners through alternating nested splits', () => {
    const left = createGroup();
    const upperMiddle = createGroup();
    const upperRight = createGroup();
    const bottom = createGroup();
    mount(
      split('horizontal', [
        left.element,
        split('vertical', [split('horizontal', [upperMiddle.element, upperRight.element]), bottom.element]),
      ]),
    );

    const groups = [left, upperMiddle, upperRight, bottom];
    expect(groups.filter((group) => checkGroupIsTopCorner(group, 'left'))).toEqual([left]);
    expect(groups.filter((group) => checkGroupIsTopRight(group))).toEqual([upperRight]);
  });

  it('should ignore hidden leaves and branches with no visible groups', () => {
    const top = createGroup();
    const bottom = createGroup();
    const hidden = createGroup();
    mount(split('horizontal', [split('vertical', [top.element, bottom.element]), split('vertical', [hidden.element])]));
    top.element.parentElement?.classList.remove('visible');
    hidden.element.parentElement?.classList.remove('visible');

    expect(checkGroupIsTopRight(bottom)).toBe(true);
    expect(checkGroupIsTopCorner(bottom, 'left')).toBe(true);
    expect(checkGroupIsTopRight(top)).toBe(false);
    expect(checkGroupIsTopRight(hidden)).toBe(false);
  });

  it('should stop at the nearest Dockview when a pane contains another Dockview', () => {
    const outerLeft = createGroup();
    const outerRight = createGroup();
    mount(split('horizontal', [outerLeft.element, outerRight.element]));
    const inner = createGroup();
    const innerRoot = mount(split('horizontal', [inner.element]));
    outerLeft.element.append(innerRoot);

    expect(checkGroupIsTopRight(inner)).toBe(true);
    expect(checkGroupIsTopRight(outerLeft)).toBe(false);
    expect(checkGroupIsTopRight(outerRight)).toBe(true);
  });

  it('should reject detached and non-grid groups', () => {
    const group = createGroup();
    expect(checkGroupIsTopRight(group)).toBe(false);
    mount(split('horizontal', [group.element]));
    Object.defineProperty(group.api, 'location', { value: { type: 'floating' } });
    expect(checkGroupIsTopRight(group)).toBe(false);
  });

  it('should give both corners to the maximized visible group', () => {
    const left = createGroup();
    const right = createGroup();
    mount(split('horizontal', [left.element, right.element]));
    Object.defineProperty(left.api, 'isMaximized', { value: () => true });
    Object.defineProperty(right.api, 'isVisible', { value: false });

    expect(checkGroupIsTopCorner(left, 'left')).toBe(true);
    expect(checkGroupIsTopRight(left)).toBe(true);
    expect(checkGroupIsTopRight(right)).toBe(false);
  });

  it('should derive corner ownership without reading pixel geometry', () => {
    const group = createGroup();
    mount(split('horizontal', [group.element]));
    const measure = vi.spyOn(Element.prototype, 'getBoundingClientRect');

    expect(checkGroupIsTopRight(group)).toBe(true);
    expect(measure).not.toHaveBeenCalled();
  });
});

describe('corner hooks', () => {
  it('should expose the corner on the first render without waiting for a frame', () => {
    const group = createGroup();
    mount(split('horizontal', [group.element]));
    const events = createLayoutEvents();
    const { result } = renderHook(() => ({
      left: useIsTopLeftGroup(group, events.api),
      right: useIsTopRightGroup(group, events.api),
    }));

    expect(result.current).toEqual({ left: true, right: true });
  });

  it('should transfer ownership on a structural layout event and release its subscription', () => {
    const left = createGroup();
    const right = createGroup();
    mount(split('horizontal', [left.element, right.element]));
    const events = createLayoutEvents();
    const { result, unmount } = renderHook(() => useIsTopRightGroup(left, events.api));
    expect(result.current).toBe(false);

    act(() => {
      right.element.parentElement?.remove();
      events.fire();
    });

    expect(result.current).toBe(true);
    unmount();
    expect(events.listeners.size).toBe(0);
  });
});
