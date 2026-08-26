import { Children } from 'react';
import type { ReactNode } from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import type { IDockviewHeaderActionsProps } from 'dockview-react';
import { describe, expect, it, vi } from 'vitest';
import { TooltipProvider } from '#components/ui/tooltip.js';

vi.mock('#components/files/file-selector.js', () => ({
  FileSelector: ({ children }: { children: ReactNode }): React.JSX.Element =>
    Children.only(children) as React.JSX.Element,
}));

const { DockviewLeftActions } = await import('#components/panes/dockview-open-file-action.js');

const createProperties = (): IDockviewHeaderActionsProps =>
  ({
    activePanel: undefined,
    containerApi: { addGroup: vi.fn() },
    group: {},
  }) as unknown as IDockviewHeaderActionsProps;

describe('DockviewLeftActions', () => {
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
