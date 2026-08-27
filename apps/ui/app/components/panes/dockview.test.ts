import { render, screen } from '@testing-library/react';
import { createElement } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { DockviewApi } from 'dockview-react';
import { Dockview, dockviewStyleOverrides, scrollActiveTabIntoView } from '#components/panes/dockview.js';

vi.mock('dockview-react', async () => {
  const { createElement } = await import('react');
  const dockviewReact = ({ className, scrollbars }: { className?: string; scrollbars?: string }) =>
    createElement(
      'div',
      { className, 'data-scrollbars': scrollbars, 'data-testid': 'dockview-react' },
      createElement(
        'div',
        { className: 'dv-tabs-container', 'data-testid': 'dockview-tabs' },
        createElement('button', { type: 'button' }, 'Tab'),
      ),
    );

  return {
    // eslint-disable-next-line @typescript-eslint/naming-convention -- Mock key mirrors the upstream export.
    DockviewReact: dockviewReact,
  };
});

// ── Test helpers ─────────────────────────────────────────────────────────────

/** Tracks root elements appended to `document.body` for cleanup. */
const roots: HTMLElement[] = [];

afterEach(() => {
  for (const root of roots) {
    root.remove();
  }

  roots.length = 0;
});

type TabLayout = {
  offsetLeft: number;
  width: number;
  isActive?: boolean;
};

type ContainerLayout = {
  scrollLeft: number;
  clientWidth: number;
};

/**
 * Builds a mock `DockviewApi` with a group element containing a
 * `.dv-tabs-container` and `.dv-tab` children with configurable layout.
 */
function buildApi(options: {
  tabs?: TabLayout[];
  container?: ContainerLayout;
  omitGroup?: boolean;
  omitTabsContainer?: boolean;
}): { api: DockviewApi; tabsContainer: HTMLElement | undefined } {
  const {
    tabs = [],
    container = { scrollLeft: 0, clientWidth: 300 },
    omitGroup = false,
    omitTabsContainer = false,
  } = options;

  if (omitGroup) {
    const api = { activeGroup: undefined } as unknown as DockviewApi;
    return { api, tabsContainer: undefined };
  }

  const groupElement = document.createElement('div');
  document.body.append(groupElement);
  roots.push(groupElement);

  let tabsContainer: HTMLElement | undefined;

  if (!omitTabsContainer) {
    tabsContainer = document.createElement('div');
    tabsContainer.classList.add('dv-tabs-container');

    Object.defineProperty(tabsContainer, 'scrollLeft', {
      value: container.scrollLeft,
      writable: true,
    });
    Object.defineProperty(tabsContainer, 'clientWidth', {
      value: container.clientWidth,
    });

    for (const tab of tabs) {
      const tabElement = document.createElement('div');
      tabElement.classList.add('dv-tab');
      if (tab.isActive) {
        tabElement.classList.add('dv-active-tab');
      }

      Object.defineProperty(tabElement, 'offsetLeft', { value: tab.offsetLeft });
      Object.defineProperty(tabElement, 'offsetWidth', { value: tab.width });

      tabsContainer.append(tabElement);
    }

    groupElement.append(tabsContainer);
  }

  const api = {
    activeGroup: { element: groupElement },
  } as unknown as DockviewApi;

  return { api, tabsContainer };
}

/** Flushes the `requestAnimationFrame` callback queued by `scrollActiveTabIntoView`. */
function flushRaf(): void {
  vi.advanceTimersByTime(16);
}

// ── scrollActiveTabIntoView ──────────────────────────────────────────────────

describe('scrollActiveTabIntoView', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  // ── Bail-out conditions ──

  describe('bail-out conditions', () => {
    it('should not throw when no active group exists', () => {
      const { api } = buildApi({ omitGroup: true });

      scrollActiveTabIntoView(api);
      flushRaf();
    });

    it('should not throw when tabs container is missing', () => {
      const { api } = buildApi({ omitTabsContainer: true });

      scrollActiveTabIntoView(api);
      flushRaf();
    });

    it('should not throw when no active tab exists', () => {
      const { api } = buildApi({
        tabs: [{ offsetLeft: 0, width: 100, isActive: false }],
      });

      scrollActiveTabIntoView(api);
      flushRaf();
    });
  });

  // ── No-op when fully visible ──

  describe('no-op when fully visible', () => {
    it('should not scroll when the active tab is fully visible', () => {
      const { api, tabsContainer } = buildApi({
        tabs: [
          { offsetLeft: 0, width: 100, isActive: false },
          { offsetLeft: 100, width: 100, isActive: true },
        ],
        container: { scrollLeft: 0, clientWidth: 300 },
      });

      scrollActiveTabIntoView(api);
      flushRaf();

      expect(tabsContainer!.scrollLeft).toBe(0);
    });

    it('should not scroll when the active tab is at the right edge but still fully visible', () => {
      const { api, tabsContainer } = buildApi({
        tabs: [
          { offsetLeft: 0, width: 100, isActive: false },
          { offsetLeft: 100, width: 100, isActive: false },
          { offsetLeft: 200, width: 100, isActive: true },
        ],
        container: { scrollLeft: 0, clientWidth: 300 },
      });

      scrollActiveTabIntoView(api);
      flushRaf();

      expect(tabsContainer!.scrollLeft).toBe(0);
    });
  });

  // ── Scroll right ──

  describe('scroll right', () => {
    it('should scroll right when the active tab is clipped on the right', () => {
      const { api, tabsContainer } = buildApi({
        tabs: [
          { offsetLeft: 0, width: 100, isActive: false },
          { offsetLeft: 100, width: 100, isActive: false },
          { offsetLeft: 200, width: 100, isActive: false },
          { offsetLeft: 300, width: 120, isActive: true },
        ],
        container: { scrollLeft: 0, clientWidth: 300 },
      });

      scrollActiveTabIntoView(api);
      flushRaf();

      // Tab right edge (300 + 120 = 420) - clientWidth (300) = 120
      expect(tabsContainer!.scrollLeft).toBe(120);
    });

    it('should scroll to show the rightmost edge of the tab at the container edge', () => {
      const { api, tabsContainer } = buildApi({
        tabs: [
          { offsetLeft: 0, width: 200, isActive: false },
          { offsetLeft: 200, width: 200, isActive: true },
        ],
        container: { scrollLeft: 0, clientWidth: 300 },
      });

      scrollActiveTabIntoView(api);
      flushRaf();

      // Tab right edge (200 + 200 = 400) - clientWidth (300) = 100
      expect(tabsContainer!.scrollLeft).toBe(100);
    });
  });

  // ── Scroll left ──

  describe('scroll left', () => {
    it('should scroll left when the active tab is clipped on the left', () => {
      const { api, tabsContainer } = buildApi({
        tabs: [
          { offsetLeft: 0, width: 100, isActive: true },
          { offsetLeft: 100, width: 100, isActive: false },
          { offsetLeft: 200, width: 100, isActive: false },
        ],
        container: { scrollLeft: 50, clientWidth: 300 },
      });

      scrollActiveTabIntoView(api);
      flushRaf();

      expect(tabsContainer!.scrollLeft).toBe(0);
    });

    it('should scroll left to the tab position when scrolled past the tab', () => {
      const { api, tabsContainer } = buildApi({
        tabs: [
          { offsetLeft: 0, width: 100, isActive: false },
          { offsetLeft: 100, width: 100, isActive: true },
          { offsetLeft: 200, width: 100, isActive: false },
        ],
        container: { scrollLeft: 200, clientWidth: 300 },
      });

      scrollActiveTabIntoView(api);
      flushRaf();

      expect(tabsContainer!.scrollLeft).toBe(100);
    });
  });

  // ── Full-tab visibility ──

  describe('full-tab visibility', () => {
    it('should prefer the left edge when the tab is wider than the container and clipped right', () => {
      const { api, tabsContainer } = buildApi({
        tabs: [
          { offsetLeft: 0, width: 100, isActive: false },
          { offsetLeft: 100, width: 400, isActive: true },
        ],
        container: { scrollLeft: 0, clientWidth: 300 },
      });

      scrollActiveTabIntoView(api);
      flushRaf();

      // Tab at [100, 500] doesn't fit in 300px container.
      // Left edge alignment: scrollLeft = 100
      expect(tabsContainer!.scrollLeft).toBe(100);
    });

    it('should prefer the left edge when a very wide tab is clipped right', () => {
      const { api, tabsContainer } = buildApi({
        tabs: [{ offsetLeft: 50, width: 1000, isActive: true }],
        container: { scrollLeft: 0, clientWidth: 200 },
      });

      scrollActiveTabIntoView(api);
      flushRaf();

      // Tab at [50, 1050] much wider than 200px container.
      // Left edge alignment: scrollLeft = 50
      expect(tabsContainer!.scrollLeft).toBe(50);
    });

    it('should show the entire tab when it fits and is clipped right', () => {
      const { api, tabsContainer } = buildApi({
        tabs: [
          { offsetLeft: 0, width: 250, isActive: false },
          { offsetLeft: 250, width: 100, isActive: true },
        ],
        container: { scrollLeft: 0, clientWidth: 300 },
      });

      scrollActiveTabIntoView(api);
      flushRaf();

      // Tab at [250, 350] fits in 300px container.
      // Right edge alignment: scrollLeft = 350 - 300 = 50
      expect(tabsContainer!.scrollLeft).toBe(50);
    });

    it('should prefer the left edge when the tab is wider than the container and clipped left', () => {
      const { api, tabsContainer } = buildApi({
        tabs: [{ offsetLeft: 0, width: 500, isActive: true }],
        container: { scrollLeft: 100, clientWidth: 300 },
      });

      scrollActiveTabIntoView(api);
      flushRaf();

      // Tab at [0, 500] wider than 300px container, left edge clipped.
      // Left edge alignment: scrollLeft = 0
      expect(tabsContainer!.scrollLeft).toBe(0);
    });
  });

  // ── requestAnimationFrame deferral ──

  describe('requestAnimationFrame deferral', () => {
    it('should not execute scroll logic synchronously', () => {
      const { api, tabsContainer } = buildApi({
        tabs: [{ offsetLeft: 300, width: 120, isActive: true }],
        container: { scrollLeft: 0, clientWidth: 300 },
      });

      scrollActiveTabIntoView(api);

      // Before rAF fires, scrollLeft should be unchanged
      expect(tabsContainer!.scrollLeft).toBe(0);

      flushRaf();

      // After rAF fires, scrollLeft should be corrected
      expect(tabsContainer!.scrollLeft).toBe(120);
    });
  });
});

describe('dockviewStyleOverrides', () => {
  it('keeps the header surface transparent', () => {
    expect(dockviewStyleOverrides).toContain('[--dv-tabs-and-actions-container-background-color:transparent]');
  });

  it('fully fades overflowing tabs beneath the header actions', () => {
    expect(dockviewStyleOverrides).toContain('[&_.dv-tabs-container]:[--scroll-fade-size:42px]');
    expect(dockviewStyleOverrides).toContain('[&_.dv-tabs-container]:[--scroll-fade-end:transparent]');
  });

  it('uses the compact 36px tab strip geometry', () => {
    expect(dockviewStyleOverrides).toContain('[--dv-tabs-and-actions-container-height:2.25rem]');
    expect(dockviewStyleOverrides).toContain('[--dv-tabs-and-actions-container-font-size:13px]');
    expect(dockviewStyleOverrides).toContain('[--dv-tab-font-size:13px]');
    expect(dockviewStyleOverrides).toContain('[--dv-tab-margin:0.25rem_0.125rem]');
    expect(dockviewStyleOverrides).toContain('[&_.dv-tabs-container:not(.dv-tabs-container-vertical)]:px-[0.125rem]');
    expect(dockviewStyleOverrides).not.toContain('[&_.dv-left-actions-container]:pl-1');

    for (const container of ['left', 'right', 'pre']) {
      expect(dockviewStyleOverrides).toContain(`[&_.dv-${container}-actions-container_button]:!h-7`);
      expect(dockviewStyleOverrides).toContain(
        `[&_.dv-${container}-actions-container_button:has(>svg:only-child)]:!w-7`,
      );
    }

    expect(dockviewStyleOverrides).toContain('[&_.dv-tabs-overflow-dropdown-default]:!size-7');
    expect(dockviewStyleOverrides).toContain(
      '[&_:is(.dv-left-actions-container,.dv-right-actions-container,.dv-pre-actions-container)_button]:!bg-transparent',
    );
    expect(dockviewStyleOverrides).toContain(
      '[&_:is(.dv-left-actions-container,.dv-right-actions-container,.dv-pre-actions-container)_button:hover]:!bg-muted-foreground/15',
    );
  });

  it('shrinks horizontal tabs equally from 160px to 112px before scrolling', () => {
    const horizontalTabSelector = '[&_.dv-tabs-container:not(.dv-tabs-container-vertical)_>_.dv-tab]';

    expect(dockviewStyleOverrides).toContain(`${horizontalTabSelector}:w-40`);
    expect(dockviewStyleOverrides).toContain(`${horizontalTabSelector}:min-w-28`);
    expect(dockviewStyleOverrides).toContain(`${horizontalTabSelector}:max-w-40`);
    expect(dockviewStyleOverrides).toContain(`${horizontalTabSelector}:grow`);
    expect(dockviewStyleOverrides).toContain(`${horizontalTabSelector}:!shrink`);
    expect(dockviewStyleOverrides).toContain(`${horizontalTabSelector}:!p-0`);
    expect(dockviewStyleOverrides).not.toContain(`${horizontalTabSelector}:basis-40`);
    expect(dockviewStyleOverrides).not.toContain('.dv-tab--dragging');
    expect(dockviewStyleOverrides).not.toContain('.dv-tab--group-collapsed');
  });

  it('uses rounded neutral selection, hover, and focus states', () => {
    expect(dockviewStyleOverrides).toContain('[--dv-activegroup-visiblepanel-tab-background-color:var(--accent)]');
    expect(dockviewStyleOverrides).toContain('[--dv-activegroup-hiddenpanel-tab-background-color:transparent]');
    expect(dockviewStyleOverrides).toContain('[&_.dv-tab]:rounded-sm');
    expect(dockviewStyleOverrides).toContain('[&_.dv-tab:not(.dv-active-tab):hover]:!bg-accent');
    expect(dockviewStyleOverrides).toContain('[&_.dv-tab:not(.dv-active-tab):hover]:!text-muted-foreground');
    expect(dockviewStyleOverrides).toContain('[&_.dv-tab:focus-visible]:ring-2');
    expect(dockviewStyleOverrides).toContain('[&_.dv-tab:focus-visible]:ring-ring/50');
  });

  it('uses a tab-matching close-action backdrop until the action itself is hovered', () => {
    const closeSelector = '[&_.dv-tab_.dv-default-tab_.dv-default-tab-action]';

    expect(dockviewStyleOverrides).not.toContain(`${closeSelector}:bg-muted-foreground/10`);
    expect(dockviewStyleOverrides).toContain(`${closeSelector}:bg-transparent`);
    expect(dockviewStyleOverrides).toContain(
      '[&_.dv-tab:hover_.dv-default-tab_.dv-default-tab-action:not(:hover)]:!bg-accent',
    );
    expect(dockviewStyleOverrides).toContain(
      '[&_.dv-tab.dv-active-tab_.dv-default-tab_.dv-default-tab-action:not(:hover)]:!bg-accent',
    );
    expect(dockviewStyleOverrides).toContain('[&_.dv-tab.dv-active-tab_.dockview-tab-title]:[--scroll-fade-size:42px]');
    expect(dockviewStyleOverrides).toContain('[&_.dv-tab_.dv-default-tab_.dv-default-tab-action:hover]:!bg-input');
  });

  it('shows short dividers only between adjacent inactive tabs', () => {
    const dividerSelector =
      '[&_.dv-tabs-container:not(.dv-tabs-container-vertical)_>_.dv-tab:not(.dv-active-tab)_+_.dv-tab:not(.dv-active-tab)::before]';

    expect(dockviewStyleOverrides).not.toContain('border-t-primary');
    expect(dockviewStyleOverrides).not.toContain('.dv-tab:not(:first-child)::before');
    expect(dockviewStyleOverrides).not.toContain('.dv-tab:last-child::after');
    expect(dockviewStyleOverrides).not.toContain('.dv-tab.dv-active-tab]:border-b-background');
    expect(dockviewStyleOverrides).toContain(`${dividerSelector}:content-['']`);
    expect(dockviewStyleOverrides).toContain(`${dividerSelector}:absolute`);
    expect(dockviewStyleOverrides).toContain(`${dividerSelector}:!left-[-0.125rem]`);
    expect(dockviewStyleOverrides).toContain(`${dividerSelector}:!w-px`);
    expect(dockviewStyleOverrides).toContain(`${dividerSelector}:!top-1/2`);
    expect(dockviewStyleOverrides).toContain(`${dividerSelector}:!h-4`);
    expect(dockviewStyleOverrides).toContain(`${dividerSelector}:!-translate-y-1/2`);
    expect(dockviewStyleOverrides).toContain(`${dividerSelector}:!bg-border`);
    expect(dockviewStyleOverrides).toContain('[&_.dv-tabs-container]:border-b-border');
  });
});

describe('Dockview', () => {
  it('should delegate vertical wheel input to native Dockview tab viewports', () => {
    render(createElement(Dockview, { className: 'caller-class', components: {}, onReady: vi.fn() }));
    const dockview = screen.getByTestId('dockview-react');
    const wrapper = dockview.parentElement;
    const tabs = screen.getByTestId('dockview-tabs');
    Object.defineProperties(tabs, {
      clientWidth: { configurable: true, value: 100 },
      scrollLeft: { configurable: true, value: 0, writable: true },
      scrollWidth: { configurable: true, value: 300 },
    });

    const event = new WheelEvent('wheel', { bubbles: true, cancelable: true, deltaY: 60 });
    screen.getByRole('button', { name: 'Tab' }).dispatchEvent(event);

    expect(wrapper).toHaveAttribute('data-slot', 'omni-scroller');
    expect(wrapper).toHaveClass('size-full');
    expect(dockview).toHaveAttribute('data-scrollbars', 'native');
    expect(dockview).toHaveClass('caller-class');
    expect(tabs.scrollLeft).toBe(60);
    expect(event.defaultPrevented).toBe(true);
  });
});
