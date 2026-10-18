import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { KeyboardProvider } from '@taucad/ui/components/keyboard';
import { TooltipProvider } from '@taucad/ui/components/tooltip';
import { PaneLane } from '#lane/pane-lane.jsx';
import type { PaneLaneProps } from '#lane/pane-lane.jsx';
import { workbenchPaneIds, workbenchPanes } from '#registry/pane-registry.js';

const renderLane = (props: Partial<PaneLaneProps> = {}) => {
  const lane = (overrides: Partial<PaneLaneProps>) => (
    <KeyboardProvider>
      <TooltipProvider>
        <PaneLane
          panes={workbenchPaneIds}
          initialOpen={['parameters', 'model']}
          renderPane={(pane) => <p>{`${pane} body`}</p>}
          {...props}
          {...overrides}
        />
      </TooltipProvider>
    </KeyboardProvider>
  );
  const result = render(lane({}));
  return {
    ...result,
    rerenderLane: (overrides: Partial<PaneLaneProps>) => {
      result.rerender(lane(overrides));
    },
  };
};

describe('workbenchPanes', () => {
  it('should describe every pane id once, with the shortcuts the app workbench uses', () => {
    expect(Object.keys(workbenchPanes).toSorted()).toEqual([...workbenchPaneIds].toSorted());
    expect(workbenchPanes.parameters.shortcut).toEqual({ key: 'x', ctrlKey: true });
    expect(workbenchPanes.share.shortcut).toBeUndefined();
  });
});

describe('PaneLane', () => {
  it('should open with the first tab active and keep hidden panes mounted', () => {
    renderLane();

    expect(screen.getByRole('tab', { name: 'Parameters' })).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByText('parameters body')).toBeVisible();
    expect(screen.getByText('model body')).not.toBeVisible();
  });

  it('should switch tabs and close one, activating its neighbour', async () => {
    const user = userEvent.setup();
    renderLane();

    await user.click(screen.getByRole('tab', { name: 'Model' }));
    expect(screen.getByText('model body')).toBeVisible();
    await user.click(screen.getByRole('button', { name: 'Close Model' }));

    expect(screen.queryByRole('tab', { name: 'Model' })).toBeNull();
    expect(screen.getByRole('tab', { name: 'Parameters' })).toHaveAttribute('aria-selected', 'true');
  });

  it('should close the focused tab with Delete', () => {
    renderLane();

    fireEvent.keyDown(screen.getByRole('tab', { name: 'Parameters' }), { key: 'Delete' });

    expect(screen.queryByRole('tab', { name: 'Parameters' })).toBeNull();
  });

  it('should open a pane from the + menu, grouped as the workbench groups it', async () => {
    const user = userEvent.setup();
    renderLane();

    await user.click(screen.getByRole('button', { name: 'Open workbench tab' }));
    expect(screen.getByRole('group', { name: 'Design' })).toBeInTheDocument();
    await user.click(screen.getByRole('menuitem', { name: /Export/u }));

    expect(screen.getByRole('tab', { name: 'Export' })).toHaveAttribute('aria-selected', 'true');
  });

  it('should open a pane by its shortcut', () => {
    renderLane();

    fireEvent.keyDown(document, { key: 'm', ctrlKey: true });

    expect(screen.getByRole('tab', { name: 'Kinematics' })).toHaveAttribute('aria-selected', 'true');
  });

  it('should open the requested pane each time the request changes', () => {
    const { rerenderLane } = renderLane();

    rerenderLane({ openRequest: { pane: 'kinematics', requestId: 1 } });
    expect(screen.getByRole('tab', { name: 'Kinematics' })).toHaveAttribute('aria-selected', 'true');
    fireEvent.click(screen.getByRole('tab', { name: 'Parameters' }));
    rerenderLane({ openRequest: { pane: 'kinematics', requestId: 2 } });

    expect(screen.getByRole('tab', { name: 'Kinematics' })).toHaveAttribute('aria-selected', 'true');
  });

  it('should resize within its bounds from the keyboard', () => {
    renderLane();
    const edge = screen.getByRole('separator', { name: 'Resize workbench' });

    fireEvent.keyDown(edge, { key: 'ArrowLeft' });
    expect(edge).toHaveAttribute('aria-valuenow', '356');
    for (let step = 0; step < 40; step += 1) {
      fireEvent.keyDown(edge, { key: 'ArrowRight' });
    }

    expect(edge).toHaveAttribute('aria-valuenow', '260');
  });

  it('should name each tab in full and show its whole title as a tooltip beside the header buttons', () => {
    renderLane({ initialOpen: ['parameters', 'model', 'kinematics'], onHide: () => undefined });

    const tabs = screen.getAllByRole('tab');
    expect(tabs.map((tab) => [tab.textContent, tab.getAttribute('title')])).toEqual([
      ['Parameters', 'Parameters'],
      ['Model', 'Model'],
      ['Kinematics', 'Kinematics'],
    ]);
    expect(screen.getByRole('button', { name: 'Open workbench tab' })).toBeVisible();
    expect(screen.getByRole('button', { name: 'Hide workbench' })).toBeVisible();
  });

  it('should offer hiding only when the host can hide it', async () => {
    const user = userEvent.setup();
    let hidden = false;
    const { unmount } = renderLane();
    expect(screen.queryByRole('button', { name: 'Hide workbench' })).toBeNull();
    unmount();

    renderLane({
      onHide: () => {
        hidden = true;
      },
    });
    await user.click(screen.getByRole('button', { name: 'Hide workbench' }));

    expect(hidden).toBe(true);
  });
});
