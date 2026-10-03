import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import type { DockviewApi, DockviewPanelApi, IDockviewPanel } from 'dockview-react';
import { mock } from 'vitest-mock-extended';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { TooltipProvider } from '@taucad/ui/components/tooltip';
import { WorkbenchToggle } from '#routes/w.$workspace.$project/workbench-toggle.js';

const createPanel = (id: string, path = `${id}.txt`): IDockviewPanel => {
  const api = mock<DockviewPanelApi>({ id, setActive: vi.fn() });
  Object.defineProperty(api, 'title', { value: path.split('/').at(-1) });
  const panel = mock<IDockviewPanel>({ id });
  Object.defineProperties(panel, { api: { value: api }, params: { value: { filePath: path } } });
  return panel;
};

/** A workbench Dockview whose panel list can change and announce it. */
const createApi = (initial: IDockviewPanel[]): { api: DockviewApi; setPanels: (panels: IDockviewPanel[]) => void } => {
  let panels = initial;
  const listeners = new Set<() => void>();
  const on = (listener: () => void): { dispose: () => void } => {
    listeners.add(listener);
    return {
      dispose() {
        listeners.delete(listener);
      },
    };
  };
  const api = mock<DockviewApi>();
  // The toggle only needs to hear that something changed, not the event payloads.
  for (const event of [
    'onDidAddPanel',
    'onDidRemovePanel',
    'onDidActivePanelChange',
    'onDidLayoutFromJSON',
    'onDidLayoutChange',
  ] as const) {
    Object.defineProperty(api, event, { value: on });
  }
  Object.defineProperties(api, {
    panels: { get: () => panels },
    activePanel: { get: () => panels[0] },
  });
  return {
    api,
    setPanels(next) {
      panels = next;
      act(() => {
        for (const listener of listeners) {
          listener();
        }
      });
    },
  };
};

const renderToggle = (properties: Partial<React.ComponentProps<typeof WorkbenchToggle>> & { api?: DockviewApi }) => {
  const onOpenChange = vi.fn();
  const view = render(
    <TooltipProvider>
      <button type='button'>Editor</button>
      <WorkbenchToggle isOpen={false} onOpenChange={onOpenChange} {...properties} />
    </TooltipProvider>,
  );
  return { onOpenChange, view, trigger: screen.getByRole('button', { name: 'Toggle Workbench lane' }) };
};

const hover = (trigger: HTMLElement): HTMLElement => {
  fireEvent.pointerEnter(trigger, { pointerType: 'mouse' });
  return screen.getByRole('dialog', { name: 'Workbench tabs' });
};

const scrollDescriptor = Object.getOwnPropertyDescriptor(Element.prototype, 'scrollIntoView');

beforeEach(() => {
  Object.defineProperty(Element.prototype, 'scrollIntoView', { configurable: true, value: vi.fn() });
});

afterEach(() => {
  if (scrollDescriptor) {
    Object.defineProperty(Element.prototype, 'scrollIntoView', scrollDescriptor);
  } else {
    Reflect.deleteProperty(Element.prototype, 'scrollIntoView');
  }
  cleanup();
  vi.useRealTimers();
});

describe('WorkbenchToggle', () => {
  it('should count workbench tabs while closed and follow panel changes', () => {
    const workbench = createApi(Array.from({ length: 12 }, (_, index) => createPanel(`tab-${index}`)));
    const { trigger } = renderToggle({ api: workbench.api });
    expect(trigger).toHaveAttribute('aria-pressed', 'false');
    expect(trigger).toHaveTextContent('9+');
    expect(trigger).toHaveAttribute('aria-description', '12 open tabs. Press Down Arrow to list them.');

    workbench.setPanels([createPanel('one'), createPanel('two')]);
    expect(trigger).toHaveTextContent('2');

    workbench.setPanels([]);
    expect(trigger).toHaveTextContent('');
    fireEvent.pointerEnter(trigger, { pointerType: 'mouse' });
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('should only toggle while open: split glyph, no count and no hover list', () => {
    const { trigger, onOpenChange } = renderToggle({ isOpen: true, api: createApi([createPanel('one')]).api });
    expect(trigger).toHaveAttribute('aria-pressed', 'true');
    expect(trigger).toHaveTextContent('');
    expect(trigger).not.toHaveAttribute('aria-description');
    fireEvent.pointerEnter(trigger, { pointerType: 'mouse' });
    fireEvent.keyDown(trigger, { key: 'ArrowDown' });
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    fireEvent.click(trigger);
    expect(onOpenChange).toHaveBeenCalledExactlyOnceWith(false);
  });

  it('should open the list on hover without stealing focus, and open the lane on the picked tab', () => {
    const first = createPanel('first', 'src/main.txt');
    const second = createPanel('second', 'docs/main.txt');
    const { trigger, onOpenChange } = renderToggle({ api: createApi([first, second]).api });
    screen.getByRole('button', { name: 'Editor' }).focus();
    const menu = hover(trigger);
    expect(screen.getByRole('button', { name: 'Editor' })).toHaveFocus();
    const rows = within(menu).getAllByRole('option');
    expect(rows[0]).toHaveTextContent('main.txtsrc');
    expect(rows[0]).toHaveAttribute('title', 'src/main.txt');
    expect(rows[0]).toHaveAttribute('aria-current', 'page');
    expect(rows[1]).toHaveTextContent('main.txtdocs');
    fireEvent.click(rows[1]!);
    expect(onOpenChange).toHaveBeenCalledExactlyOnceWith(true);
    expect(second.api.setActive).toHaveBeenCalledOnce();
    expect(first.api.setActive).not.toHaveBeenCalled();
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('should keep unique titles single-line and use the workbench tab icons', () => {
    const utility = createPanel('parameters');
    renderToggle({
      api: createApi([utility, createPanel('models/a/main.py', 'models/a/main.py')]).api,
      getIcon: (panel) => (panel.api.id === utility.api.id ? <span aria-label='Parameters icon' /> : undefined),
    });
    const menu = hover(screen.getByRole('button', { name: 'Toggle Workbench lane' }));
    expect(within(menu).getByLabelText('Parameters icon')).toBeInTheDocument();
    expect(within(menu).getAllByRole('option')[1]).toHaveTextContent(/^main.py$/);
  });

  it('should toggle the lane on click and close a hover-opened list until the pointer returns', () => {
    const { trigger, onOpenChange } = renderToggle({ api: createApi([createPanel('one')]).api });
    hover(trigger);
    fireEvent.click(trigger);
    expect(onOpenChange).toHaveBeenCalledExactlyOnceWith(true);
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    fireEvent.pointerEnter(trigger, { pointerType: 'mouse' });
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    fireEvent.pointerLeave(trigger);
    hover(trigger);
  });

  it('should keep the list reachable across the portal gap and close after leaving it', () => {
    vi.useFakeTimers();
    const { trigger } = renderToggle({ api: createApi([createPanel('one')]).api });
    const menu = hover(trigger);
    fireEvent.pointerLeave(trigger);
    act(() => {
      vi.advanceTimersByTime(100);
    });
    fireEvent.pointerEnter(menu);
    act(() => {
      vi.advanceTimersByTime(150);
    });
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    fireEvent.pointerLeave(menu);
    act(() => {
      vi.advanceTimersByTime(150);
    });
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('should list from the keyboard, filter by path and return focus on Escape', async () => {
    const first = createPanel('first', 'src/main.txt');
    const second = createPanel('second', 'docs/main.txt');
    const { trigger, onOpenChange } = renderToggle({ api: createApi([first, second]).api });
    fireEvent.keyDown(trigger, { key: 'ArrowDown' });
    const input = screen.getByRole('combobox');
    await waitFor(() => {
      expect(input).toHaveFocus();
    });
    fireEvent.change(input, { target: { value: 'docs/main' } });
    await waitFor(() => {
      expect(screen.getAllByRole('option')).toHaveLength(1);
    });
    fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Escape' });
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    await waitFor(() => {
      expect(trigger).toHaveFocus();
    });

    fireEvent.keyDown(trigger, { key: 'ArrowDown' });
    const reopened = screen.getByRole('combobox');
    fireEvent.change(reopened, { target: { value: 'docs/main' } });
    await waitFor(() => {
      expect(screen.getAllByRole('option')).toHaveLength(1);
    });
    fireEvent.keyDown(reopened, { key: 'Enter' });
    expect(onOpenChange).toHaveBeenCalledExactlyOnceWith(true);
    expect(second.api.setActive).toHaveBeenCalledOnce();
  });

  it('should cancel a pending hover dismissal on unmount', () => {
    vi.useFakeTimers();
    const { trigger, view } = renderToggle({ api: createApi([createPanel('one')]).api });
    hover(trigger);
    fireEvent.pointerLeave(trigger);
    const clearTimer = vi.spyOn(globalThis, 'clearTimeout');
    view.unmount();
    expect(clearTimer).toHaveBeenCalled();
    clearTimer.mockRestore();
  });
});
