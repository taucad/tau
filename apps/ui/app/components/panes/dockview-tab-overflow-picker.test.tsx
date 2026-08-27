import type { ReactNode } from 'react';
import { act, render, screen } from '@testing-library/react';
import type {
  DockviewApi,
  DockviewGroupPanel,
  DockviewGroupPanelApi,
  DockviewPanelApi,
  IDockviewHeaderActionsProps,
  IDockviewPanel,
} from 'dockview-react';
import { mock } from 'vitest-mock-extended';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Mock } from 'vitest';
import { TooltipProvider } from '#components/ui/tooltip.js';

const mobileState = vi.hoisted(() => ({ current: false }));
const comboBoxSpy = vi.hoisted(() => vi.fn());

vi.mock('#components/ui/combobox-responsive.js', async () => {
  const { createElement } = await import('react');
  return {
    ComboBoxResponsive: (properties: { readonly children: ReactNode; readonly isNested?: boolean }) => {
      comboBoxSpy(properties);
      return createElement(
        'div',
        {
          'data-is-nested': String(properties.isNested ?? false),
          'data-testid': mobileState.current ? 'drawer-root' : 'popover-root',
        },
        properties.children,
      );
    },
  };
});

const { DockviewTabOverflowPicker } = await import('#components/panes/dockview-tab-overflow-picker.js');

type CapturedComboBoxProperties = {
  readonly groupedItems: Array<{ readonly name: string; readonly items: IDockviewPanel[] }>;
  readonly value: IDockviewPanel | undefined;
  readonly getValue: (panel: IDockviewPanel) => string;
  readonly renderLabel: (panel: IDockviewPanel, activePanel: IDockviewPanel | undefined) => ReactNode;
  readonly onSelect: (value: string) => void;
  readonly title: string;
  readonly description: string;
  readonly searchPlaceHolder: string;
  readonly emptyListMessage: string;
  readonly popoverProperties: { readonly align: string };
};

type ObserverRecord = {
  readonly callback: ResizeObserverCallback;
  readonly disconnect: Mock<() => void>;
  readonly observe: Mock<(target: Element) => void>;
};

const observers: ObserverRecord[] = [];
const roots: HTMLElement[] = [];

const createPanel = ({
  id,
  title,
  params,
}: {
  readonly id: string;
  readonly title?: string;
  readonly params?: Record<string, unknown>;
}): IDockviewPanel => {
  const api = mock<DockviewPanelApi>({ setActive: vi.fn() });
  Object.defineProperty(api, 'title', { value: title });
  const panel = mock<IDockviewPanel>({ id });
  Object.defineProperties(panel, {
    api: { value: api },
    params: { value: params },
  });
  return panel;
};

const createProperties = ({
  panels,
  activePanel = panels[0],
  clientWidth,
  scrollWidth,
}: {
  readonly panels: IDockviewPanel[];
  readonly activePanel?: IDockviewPanel;
  readonly clientWidth: number;
  readonly scrollWidth: number;
}): { readonly properties: IDockviewHeaderActionsProps; readonly tabs: HTMLElement } => {
  const groupElement = document.createElement('div');
  const tabs = document.createElement('div');
  tabs.className = 'dv-tabs-container';
  Object.defineProperties(tabs, {
    clientWidth: { configurable: true, value: clientWidth },
    scrollWidth: { configurable: true, value: scrollWidth },
  });
  groupElement.append(tabs);
  document.body.append(groupElement);
  roots.push(groupElement);

  const group = mock<DockviewGroupPanel>();
  Object.defineProperty(group, 'element', { value: groupElement });

  return {
    tabs,
    properties: {
      activePanel,
      panels,
      group,
      api: mock<DockviewGroupPanelApi>(),
      containerApi: mock<DockviewApi>(),
      isGroupActive: true,
      headerPosition: 'top',
    },
  };
};

const renderPicker = (properties: IDockviewHeaderActionsProps) =>
  render(
    <TooltipProvider>
      <DockviewTabOverflowPicker {...properties} />
    </TooltipProvider>,
  );

const flushMeasurement = (): void => {
  act(() => {
    vi.advanceTimersByTime(16);
  });
};

const getComboBoxProperties = (): CapturedComboBoxProperties =>
  comboBoxSpy.mock.lastCall?.[0] as CapturedComboBoxProperties;

beforeEach(() => {
  vi.useFakeTimers();
  mobileState.current = false;
  comboBoxSpy.mockClear();
  observers.length = 0;

  globalThis.ResizeObserver = class ResizeObserver {
    public readonly record: ObserverRecord;

    public constructor(callback: ResizeObserverCallback) {
      this.record = { callback, disconnect: vi.fn(), observe: vi.fn() };
      observers.push(this.record);
    }

    public observe(target: Element): void {
      this.record.observe(target);
    }

    public unobserve(): void {
      // No-op: the production hook only needs observe/disconnect.
    }

    public disconnect(): void {
      this.record.disconnect();
    }
  };
});

afterEach(() => {
  vi.useRealTimers();
  for (const root of roots.splice(0)) {
    root.remove();
  }
});

describe('DockviewTabOverflowPicker', () => {
  it('stays absent while all tabs fit', () => {
    const panel = createPanel({ id: 'one', title: 'One' });
    const { properties } = createProperties({ panels: [panel], clientWidth: 300, scrollWidth: 300 });

    renderPicker(properties);
    flushMeasurement();

    expect(screen.queryByRole('button', { name: 'Open tabs' })).not.toBeInTheDocument();
    expect(comboBoxSpy).not.toHaveBeenCalled();
  });

  it('renders a named 28px action and exposes every group panel with searchable identity', () => {
    const source = createPanel({ id: 'file-1', title: 'main.ts', params: { filePath: 'src/main.ts' } });
    const viewer = createPanel({ id: 'view-2', title: 'assembly.step', params: { entryPath: 'models/assembly.step' } });
    const fallback = createPanel({ id: 'panel-without-title' });
    const { properties } = createProperties({
      panels: [source, viewer, fallback],
      activePanel: viewer,
      clientWidth: 200,
      scrollWidth: 480,
    });

    renderPicker(properties);
    flushMeasurement();

    expect(screen.getByRole('button', { name: 'Open tabs' })).toHaveClass('size-7', 'dv-pane-action');
    const comboBox = getComboBoxProperties();
    expect(comboBox.groupedItems).toEqual([{ name: 'Open tabs', items: [source, viewer, fallback] }]);
    expect(comboBox.value).toBe(viewer);
    expect(comboBox.getValue(source)).toBe('main.ts src/main.ts file-1');
    expect(comboBox.getValue(viewer)).toBe('assembly.step models/assembly.step view-2');
    expect(comboBox.getValue(fallback)).toBe('panel-without-title panel-without-title');
    expect(comboBox).toMatchObject({
      title: 'Open tabs',
      description: 'Search and activate an open tab in this pane.',
      searchPlaceHolder: 'Search open tabs...',
      emptyListMessage: 'No open tabs found.',
      popoverProperties: { align: 'end' },
    });

    render(<>{comboBox.renderLabel(viewer, viewer)}</>);
    expect(screen.getByText('models/assembly.step')).toBeInTheDocument();
    expect(screen.getByLabelText('Active tab')).toBeInTheDocument();
  });

  it('activates only the selected panel', () => {
    const first = createPanel({ id: 'first', title: 'First' });
    const second = createPanel({ id: 'second', title: 'Second' });
    const { properties } = createProperties({ panels: [first, second], clientWidth: 100, scrollWidth: 300 });

    renderPicker(properties);
    flushMeasurement();
    const comboBox = getComboBoxProperties();
    comboBox.onSelect(comboBox.getValue(second));

    expect(first.api.setActive).not.toHaveBeenCalled();
    expect(second.api.setActive).toHaveBeenCalledOnce();
  });

  it('remeasures when the group panel count changes', () => {
    const first = createPanel({ id: 'first', title: 'First' });
    const second = createPanel({ id: 'second', title: 'Second' });
    const { properties, tabs } = createProperties({ panels: [first], clientWidth: 300, scrollWidth: 300 });
    const view = renderPicker(properties);
    flushMeasurement();
    expect(screen.queryByRole('button', { name: 'Open tabs' })).not.toBeInTheDocument();

    Object.defineProperty(tabs, 'scrollWidth', { configurable: true, value: 500 });
    view.rerender(
      <TooltipProvider>
        <DockviewTabOverflowPicker {...properties} panels={[first, second]} />
      </TooltipProvider>,
    );
    flushMeasurement();

    expect(screen.getByRole('button', { name: 'Open tabs' })).toBeInTheDocument();
    expect(observers).toHaveLength(2);
    expect(observers[0]?.disconnect).toHaveBeenCalledOnce();
  });

  it('responds to tab-strip resize and disposes its observer', () => {
    const panel = createPanel({ id: 'one', title: 'One' });
    const { properties, tabs } = createProperties({ panels: [panel], clientWidth: 100, scrollWidth: 300 });
    const view = renderPicker(properties);
    flushMeasurement();
    expect(screen.getByRole('button', { name: 'Open tabs' })).toBeInTheDocument();

    Object.defineProperty(tabs, 'scrollWidth', { configurable: true, value: 100 });
    act(() => {
      observers[0]?.callback([], {} as ResizeObserver);
    });
    flushMeasurement();
    expect(screen.queryByRole('button', { name: 'Open tabs' })).not.toBeInTheDocument();

    view.unmount();
    expect(observers[0]?.disconnect).toHaveBeenCalledOnce();
  });

  it('cancels a pending post-layout measurement when unmounted', () => {
    const cancelFrame = vi.spyOn(globalThis, 'cancelAnimationFrame');
    const panel = createPanel({ id: 'one', title: 'One' });
    const { properties } = createProperties({ panels: [panel], clientWidth: 100, scrollWidth: 300 });

    const view = renderPicker(properties);
    view.unmount();

    expect(cancelFrame).toHaveBeenCalledOnce();
    expect(observers[0]?.disconnect).toHaveBeenCalledOnce();
  });

  it('uses the responsive combobox as a desktop popover and standalone mobile drawer', () => {
    const panel = createPanel({ id: 'one', title: 'One' });
    const desktop = createProperties({ panels: [panel], clientWidth: 100, scrollWidth: 300 });
    const view = renderPicker(desktop.properties);
    flushMeasurement();
    expect(screen.getByTestId('popover-root')).toHaveAttribute('data-is-nested', 'false');

    view.unmount();
    mobileState.current = true;
    const mobile = createProperties({ panels: [panel], clientWidth: 100, scrollWidth: 300 });
    renderPicker(mobile.properties);
    flushMeasurement();
    expect(screen.getByTestId('drawer-root')).toHaveAttribute('data-is-nested', 'false');
  });
});
