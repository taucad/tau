// @vitest-environment jsdom
import { render, screen } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { TooltipProvider } from '@taucad/ui/components/tooltip';
import { GridSizeIndicator } from '#components/geometry/cad/grid-control.js';

type GraphicsState = {
  readonly context: {
    readonly gridSizes: { readonly smallSize: number };
    readonly isGridSizeLocked: boolean;
    readonly displayUnits: { readonly length: { readonly metersPerUnit: number; readonly symbol: string } };
  };
};

vi.mock('#hooks/use-graphics.js', () => ({
  useGraphics: () => ({ send: vi.fn() }),
  useGraphicsSelector: <T,>(selector: (state: GraphicsState) => T): T =>
    selector({
      context: {
        gridSizes: { smallSize: 0.05 },
        isGridSizeLocked: false,
        displayUnits: { length: { metersPerUnit: 0.001, symbol: 'mm' } },
      },
    }),
}));

describe('GridSizeIndicator', () => {
  it('should name the trigger by grid size and open the unit settings', async () => {
    const user = userEvent.setup();
    render(
      <TooltipProvider>
        <GridSizeIndicator />
      </TooltipProvider>,
    );

    await user.click(screen.getByRole('button', { name: 'Grid 50 mm, unit settings' }));

    expect(await screen.findByRole('menu')).toBeVisible();
  });
});
