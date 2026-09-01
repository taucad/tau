import { Children } from 'react';
import type { ReactNode } from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import type { IDockviewHeaderActionsProps } from 'dockview-react';
import { describe, expect, it, vi } from 'vitest';
import type { FileSelectorDataSource } from '#components/files/file-selector.js';
import { TooltipProvider } from '@taucad/ui/components/tooltip';

const fileSelectorSpy = vi.hoisted(() => vi.fn());

vi.mock('#components/files/file-selector.js', () => ({
  FileSelector: ({ children, ...properties }: { children: ReactNode }): React.JSX.Element => {
    fileSelectorSpy(properties);
    return Children.only(children) as React.JSX.Element;
  },
}));

const { DockviewLeftActions } = await import('#components/panes/dockview-open-file-action.js');

const createProperties = (): IDockviewHeaderActionsProps =>
  ({
    activePanel: undefined,
    containerApi: { addGroup: vi.fn() },
    group: {},
  }) as unknown as IDockviewHeaderActionsProps;

describe('DockviewLeftActions', () => {
  it('passes a viewer-specific file source to the new-tab selector', () => {
    const dataSource: FileSelectorDataSource = {
      loadDirectory: vi.fn().mockResolvedValue([]),
      searchFiles: vi.fn().mockResolvedValue([]),
    };

    render(
      <TooltipProvider>
        <DockviewLeftActions {...createProperties()} fileSelectorDataSource={dataSource} />
      </TooltipProvider>,
    );

    expect(fileSelectorSpy).toHaveBeenCalledWith(expect.objectContaining({ dataSource }));
  });

  it('places the hover-only split action after the new-tab action with the standard gap', () => {
    const properties = createProperties();

    render(
      <TooltipProvider>
        <DockviewLeftActions {...properties} />
      </TooltipProvider>,
    );

    const open = screen.getByRole('button', { name: 'Open file' });
    const split = screen.getByRole('button', { name: 'Split right' });
    expect(open.parentElement).toHaveClass('gap-[0.28125rem]');
    expect(open.nextElementSibling).toBe(split);
    expect(open).toHaveClass('dv-pane-action');
    expect(split).toHaveClass('dv-pane-action');
  });

  it('splits right on left-click and down on right-click', () => {
    const properties = createProperties();
    const addGroup = vi.mocked(properties.containerApi.addGroup);

    render(
      <TooltipProvider>
        <DockviewLeftActions {...properties} />
      </TooltipProvider>,
    );

    const split = screen.getByRole('button', { name: 'Split right' });
    fireEvent.click(split);
    expect(addGroup).toHaveBeenLastCalledWith({ referenceGroup: properties.group, direction: 'right' });

    const contextMenu = new MouseEvent('contextmenu', { bubbles: true, cancelable: true, button: 2 });
    split.dispatchEvent(contextMenu);
    expect(contextMenu.defaultPrevented).toBe(true);
    expect(addGroup).toHaveBeenLastCalledWith({ referenceGroup: properties.group, direction: 'below' });
    expect(addGroup).toHaveBeenCalledTimes(2);
  });

  it('reports the group created by the split', () => {
    const properties = createProperties();
    const createdGroup = properties.group;
    vi.mocked(properties.containerApi.addGroup).mockReturnValue(createdGroup);
    const onDidSplit = vi.fn();

    render(
      <TooltipProvider>
        <DockviewLeftActions {...properties} onDidSplit={onDidSplit} />
      </TooltipProvider>,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Split right' }));
    expect(onDidSplit).toHaveBeenCalledExactlyOnceWith(createdGroup);
  });

  it('presents both split gestures equally beneath a neutral tooltip heading', async () => {
    render(
      <TooltipProvider>
        <DockviewLeftActions {...createProperties()} />
      </TooltipProvider>,
    );

    await userEvent.hover(screen.getByRole('button', { name: 'Split right' }));

    const tooltipHeadings = await screen.findAllByText('Split view');
    const leftClickGuidance = await screen.findAllByText('Left-click to split right');
    const rightClickGuidance = await screen.findAllByText('Right-click to split down');
    expect(tooltipHeadings.length).toBeGreaterThanOrEqual(1);
    expect(leftClickGuidance.length).toBeGreaterThanOrEqual(1);
    expect(rightClickGuidance.length).toBeGreaterThanOrEqual(1);
  });
});
