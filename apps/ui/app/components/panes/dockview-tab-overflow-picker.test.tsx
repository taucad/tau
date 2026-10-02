import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
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
import { DockviewTabOverflowPicker } from '#components/panes/dockview-tab-overflow-picker.js';

const createPanel = (id: string, path = `${id}.txt`): IDockviewPanel => {
  const api = mock<DockviewPanelApi>({ id, setActive: vi.fn() });
  Object.defineProperty(api, 'title', { value: path.split('/').at(-1) });
  const panel = mock<IDockviewPanel>({ id });
  Object.defineProperties(panel, { api: { value: api }, params: { value: { filePath: path } } });
  return panel;
};

const createProperties = (panels: IDockviewPanel[]): IDockviewHeaderActionsProps => ({
  panels,
  activePanel: panels[0],
  group: mock<DockviewGroupPanel>(),
  api: mock<DockviewGroupPanelApi>(),
  containerApi: mock<DockviewApi>(),
  isGroupActive: true,
  headerPosition: 'top',
});

const openWithHover = (): HTMLElement => {
  fireEvent.pointerEnter(screen.getByRole('button', { name: 'Open tabs' }), { pointerType: 'mouse' });
  return screen.getByRole('dialog', { name: 'Open tabs' });
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

describe('DockviewTabOverflowPicker', () => {
  it('should show the count even when tabs fit and disappear when the group is empty', () => {
    const panels = Array.from({ length: 12 }, (_, index) => createPanel(`tab-${index}`));
    const properties = createProperties(panels);
    const view = render(<DockviewTabOverflowPicker {...properties} />);
    const trigger = screen.getByRole('button', { name: 'Open tabs' });
    expect(trigger).toHaveTextContent('9+');
    expect(trigger).toHaveAttribute('aria-description', '12 open tabs in this pane');
    expect(trigger).toHaveClass('size-7');
    expect(trigger).not.toHaveClass('dv-pane-action');
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();

    view.rerender(<DockviewTabOverflowPicker {...properties} panels={panels.slice(0, 2)} />);
    expect(trigger).toHaveTextContent('2');
    view.rerender(<DockviewTabOverflowPicker {...properties} panels={[]} activePanel={undefined} />);
    expect(screen.queryByRole('button', { name: 'Open tabs' })).not.toBeInTheDocument();
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('should open on hover without stealing focus and retain ordered paths and active selection', () => {
    const first = createPanel('first', 'src/main.txt');
    const second = createPanel('second', 'docs/main.txt');
    render(
      <>
        <button type='button'>Editor</button>
        <DockviewTabOverflowPicker {...createProperties([first, second])} />
      </>,
    );
    screen.getByRole('button', { name: 'Editor' }).focus();
    const menu = openWithHover();
    expect(screen.getByRole('button', { name: 'Editor' })).toHaveFocus();
    const rows = within(menu).getAllByRole('option');
    expect(rows[0]).toHaveTextContent('main.txtsrc');
    expect(rows[0]).toHaveAttribute('title', 'src/main.txt');
    expect(rows[0]).toHaveAttribute('aria-description', 'src/main.txt');
    expect(rows[0]).toHaveAttribute('aria-current', 'page');
    expect(rows[1]).toHaveTextContent('main.txtdocs');
    expect(rows[1]).toHaveAttribute('title', 'docs/main.txt');
    expect(within(menu).getByLabelText('Active tab')).toBeInTheDocument();
    fireEvent.click(rows[1]!);
    expect(second.api.setActive).toHaveBeenCalledOnce();
    expect(first.api.setActive).not.toHaveBeenCalled();
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('should keep unique titles single-line and reveal folders only for duplicate titles', () => {
    const panels = [createPanel('first', 'models/a/main.py'), createPanel('second', 'models/b/main.py')];
    const properties = createProperties(panels);
    const view = render(<DockviewTabOverflowPicker {...properties} />);
    openWithHover();
    expect(screen.getAllByRole('option')[0]).toHaveTextContent('main.pymodels/a');
    view.rerender(<DockviewTabOverflowPicker {...properties} panels={[panels[0]!]} />);
    const row = screen.getByRole('option');
    expect(row).toHaveTextContent(/^main.py$/);
    expect(row).toHaveAttribute('title', 'models/a/main.py');
    expect(row).toHaveAttribute('aria-description', 'models/a/main.py');
  });

  it('should keep the hover menu reachable across the portal gap and close after leaving it', () => {
    vi.useFakeTimers();
    render(<DockviewTabOverflowPicker {...createProperties([createPanel('one')])} />);
    const trigger = screen.getByRole('button', { name: 'Open tabs' });
    const menu = openWithHover();
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

  it('should keep a click-opened menu open until explicitly dismissed', () => {
    vi.useFakeTimers();
    render(<DockviewTabOverflowPicker {...createProperties([createPanel('one')])} />);
    const trigger = screen.getByRole('button', { name: 'Open tabs' });
    const menu = openWithHover();
    fireEvent.click(trigger);
    fireEvent.pointerLeave(trigger);
    fireEvent.pointerLeave(menu);
    act(() => {
      vi.advanceTimersByTime(150);
    });
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Escape' });
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    act(() => {
      vi.advanceTimersByTime(0);
    });
    expect(trigger).toHaveFocus();
  });

  it('should reuse the custom utility icons and viewer fallback from the tab renderer', () => {
    const utility = createPanel('parameters');
    const viewer = createPanel('viewer');
    render(
      <DockviewTabOverflowPicker
        {...createProperties([utility, viewer])}
        leadingIcon='viewer'
        getIcon={(panel) => (panel.api.id === utility.api.id ? <span aria-label='Parameters icon' /> : undefined)}
      />,
    );
    const menu = openWithHover();
    expect(within(menu).getByLabelText('Parameters icon')).toBeInTheDocument();
    expect(within(menu).getAllByRole('option')[1]).toHaveTextContent('viewer.txt');
  });

  it('should filter duplicate titles by path and activate a result with the keyboard', async () => {
    const first = createPanel('first', 'src/main.txt');
    const second = createPanel('second', 'docs/main.txt');
    render(<DockviewTabOverflowPicker {...createProperties([first, second])} />);
    fireEvent.click(screen.getByRole('button', { name: 'Open tabs' }));
    const input = screen.getByRole('combobox');
    await waitFor(() => {
      expect(input).toHaveFocus();
    });
    fireEvent.change(input, { target: { value: 'docs/main' } });
    await waitFor(() => {
      expect(screen.getAllByRole('option')).toHaveLength(1);
    });
    expect(screen.getByRole('option')).toHaveTextContent('main.txtdocs');
    expect(screen.getByRole('option')).toHaveAttribute('aria-description', 'docs/main.txt');
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(second.api.setActive).toHaveBeenCalledOnce();
    expect(first.api.setActive).not.toHaveBeenCalled();
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('should cancel a pending hover dismissal on unmount', () => {
    vi.useFakeTimers();
    const view = render(<DockviewTabOverflowPicker {...createProperties([createPanel('one')])} />);
    openWithHover();
    fireEvent.pointerLeave(screen.getByRole('button', { name: 'Open tabs' }));
    const clearTimer = vi.spyOn(globalThis, 'clearTimeout');
    view.unmount();
    expect(clearTimer).toHaveBeenCalled();
    clearTimer.mockRestore();
  });
});
