// @vitest-environment jsdom
import { act, fireEvent, render, screen } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { TooltipProvider } from '@taucad/ui/components/tooltip';
import { GridSizeIndicator } from '#components/geometry/cad/grid-control.js';

type GraphicsState = {
  readonly context: {
    readonly gridSizes: { readonly smallSize: number };
    readonly isGridSizeLocked: boolean;
    readonly displayUnits: { readonly length: { readonly metersPerUnit: number; readonly symbol: string } };
  };
};

const mocks = vi.hoisted(() => ({
  graphicsSend: vi.fn(),
  smallSize: 0.05,
  isGridSizeLocked: false,
}));

vi.mock('#hooks/use-graphics.js', () => ({
  useGraphics: () => ({ send: mocks.graphicsSend }),
  useGraphicsSelector: <T,>(selector: (state: GraphicsState) => T): T =>
    selector({
      context: {
        gridSizes: { smallSize: mocks.smallSize },
        isGridSizeLocked: mocks.isGridSizeLocked,
        displayUnits: { length: { metersPerUnit: 0.001, symbol: 'mm' } },
      },
    }),
}));

/** Waits one task: a menu starts listening for presses outside, and returns focus, a task after it opens or closes. */
const nextTask = async (): Promise<void> => {
  await act(async () => {
    await new Promise((resolve) => {
      setTimeout(resolve, 0);
    });
  });
};

const renderGridSizeIndicator = (): void => {
  render(
    <TooltipProvider>
      <GridSizeIndicator />
    </TooltipProvider>,
  );
};

describe('GridSizeIndicator', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.smallSize = 0.05;
    mocks.isGridSizeLocked = false;
  });

  it('should read the grid size on one line of 12 px mono figures', () => {
    renderGridSizeIndicator();

    const trigger = screen.getByRole('button', { name: 'Grid 50 mm, units and grid' });
    expect(trigger).toHaveTextContent(/^50 mm$/);
    expect(trigger).toHaveClass('h-7', 'font-mono', 'text-xs', 'tabular-nums');
    expect(trigger.className).not.toMatch(/text-\[/);
    expect(trigger.querySelector('.lucide-lock')).toBeNull();
  });

  it('should show the lock glyph when the grid size is locked', () => {
    mocks.isGridSizeLocked = true;
    renderGridSizeIndicator();

    const trigger = screen.getByRole('button', { name: 'Grid 50 mm, units and grid' });
    expect(trigger.querySelector('.lucide-lock')).toBeInTheDocument();
  });

  it('should open the unit and grid lock settings and keep them open while choosing a unit', async () => {
    const user = userEvent.setup();
    renderGridSizeIndicator();

    await user.click(screen.getByRole('button', { name: 'Grid 50 mm, units and grid' }));

    expect(await screen.findByRole('menu')).toBeVisible();
    expect(screen.getByRole('menuitemradio', { name: /^Millimeter/ })).toHaveAttribute('aria-checked', 'true');
    expect(screen.getByRole('menuitem', { name: 'Lock Grid Size (50 mm)' })).toBeVisible();

    await user.click(screen.getByRole('menuitemradio', { name: /^Centimeter/ }));

    expect(mocks.graphicsSend).toHaveBeenLastCalledWith({ type: 'setGridUnit', payload: { unit: 'cm' } });
    expect(screen.getByRole('menu')).toBeVisible();
  });

  it('should return focus to the readout when Escape closes its menu', async () => {
    const user = userEvent.setup();
    renderGridSizeIndicator();
    const trigger = screen.getByRole('button', { name: 'Grid 50 mm, units and grid' });
    act(() => {
      trigger.focus();
    });

    await user.keyboard('{Enter}');
    expect(screen.getByRole('menu')).toBeInTheDocument();
    await user.keyboard('{Escape}');

    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
    expect(trigger).toHaveFocus();
  });

  it('should leave focus with the pointer when a press outside closes its menu', async () => {
    const user = userEvent.setup();
    renderGridSizeIndicator();
    await user.click(screen.getByRole('button', { name: 'Grid 50 mm, units and grid' }));
    await nextTask();

    fireEvent.pointerDown(document.body);
    await nextTask();

    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Grid 50 mm, units and grid' })).not.toHaveFocus();
  });

  it('should render nothing before the grid has a size', () => {
    mocks.smallSize = 0;
    renderGridSizeIndicator();

    expect(screen.queryByRole('button', { name: /^Grid/ })).not.toBeInTheDocument();
  });
});
