import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

vi.mock('@xstate/react', () => ({
  useSelector: (actor: { getSnapshot: () => unknown }, selector: (state: unknown) => unknown) =>
    selector(actor.getSnapshot()),
}));

vi.mock('#hooks/use-cad-preview.js', () => ({
  useCadPreview: () => ({
    cadRef: {
      getSnapshot: () => ({ context: { parameters: { length: 0.5 }, units: { length: 'mm' } } }),
    },
    defaultParameters: { length: 0.5 },
    graphicsRef: {
      getSnapshot: () => ({ context: { displayUnits: { length: { symbol: 'm' } } } }),
    },
    jsonSchema: undefined,
    setParameters: vi.fn(),
  }),
}));

vi.mock('#components/geometry/parameters/parameters.js', () => ({
  Parameters: ({ units }: { units: { length: { sourceSymbol: string; displaySymbol: string } } }) => (
    <div
      data-testid='preview-parameters'
      data-source-symbol={units.length.sourceSymbol}
      data-display-symbol={units.length.displaySymbol}
    />
  ),
}));

vi.mock('#components/ui/tooltip.js', () => ({
  Tooltip: ({ children }: { children: React.ReactNode }): React.ReactElement => children as React.ReactElement,
  TooltipContent: () => null,
  TooltipTrigger: ({ children }: { children: React.ReactNode }): React.ReactElement => children as React.ReactElement,
}));

describe('PreviewParameters', () => {
  it('keeps the CAD source unit separate from the viewer display unit', async () => {
    const { PreviewParameters } = await import('./preview-parameters.js');
    render(<PreviewParameters />);

    expect(screen.getByTestId('preview-parameters')).toHaveAttribute('data-source-symbol', 'mm');
    expect(screen.getByTestId('preview-parameters')).toHaveAttribute('data-display-symbol', 'm');
  });
});
