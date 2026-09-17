import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

vi.mock('@xstate/react', () => ({
  useSelector: (actor: { getSnapshot: () => unknown }, selector: (state: unknown) => unknown) =>
    selector(actor.getSnapshot()),
}));

vi.mock('#hooks/use-cad-preview.js', () => ({
  useCadPreview: () => ({
    parameters: { length: 0.5 },
    defaultParameters: { length: 0.5 },
    parameterManifest: { bindings: {}, bindingDeclarations: {}, provenance: {} },
    graphicsRef: {
      getSnapshot: () => ({ context: { displayUnits: { length: { symbol: 'm' } } } }),
    },
    jsonSchema: undefined,
    setParameters: vi.fn(),
  }),
}));

vi.mock('#components/geometry/parameters/parameters.js', () => ({
  Parameters: ({ units }: { units: { length: { displaySymbol: string } } }) => (
    <div data-testid='preview-parameters' data-display-symbol={units.length.displaySymbol} />
  ),
}));

vi.mock('@taucad/ui/components/tooltip', () => ({
  Tooltip: ({ children }: { children: React.ReactNode }): React.ReactElement => children as React.ReactElement,
  TooltipContent: () => null,
  TooltipTrigger: ({ children }: { children: React.ReactNode }): React.ReactElement => children as React.ReactElement,
}));

describe('PreviewParameters', () => {
  it('passes the viewer display unit alongside the manifest', async () => {
    const { PreviewParameters } = await import('./preview-parameters.js');
    render(<PreviewParameters />);

    expect(screen.getByTestId('preview-parameters')).toHaveAttribute('data-display-symbol', 'm');
  });
});
