import { fireEvent, render, screen, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { TooltipProvider } from '@taucad/ui/components/tooltip';
import { ModelSettings as Settings } from '#components/settings/model-settings.js';

/* The pin's tooltip needs the provider the app root supplies. */
function ModelSettings(): React.JSX.Element {
  return (
    <TooltipProvider>
      <Settings />
    </TooltipProvider>
  );
}

const mockState = vi.hoisted(() => {
  const overrides: Record<string, boolean> = {};
  return {
    models: {
      data: [] as unknown[],
      isLoading: false,
      recommendedModels: [] as unknown[],
      overrides,
      isAvailable: () => true,
      setAvailable: vi.fn(),
      resetAvailability: vi.fn(),
      isPinned: () => false,
      setPinned: vi.fn(),
    },
  };
});

vi.mock('#hooks/use-models.js', () => ({ useModels: () => mockState.models }));

const model = {
  id: 'gpt',
  name: 'GPT',
  provider: { name: 'OpenAI' },
  details: { family: 'openai' },
};

describe('ModelSettings', () => {
  beforeEach(() => {
    mockState.models = {
      ...mockState.models,
      data: [],
      isLoading: false,
      recommendedModels: [],
      overrides: {},
      setAvailable: vi.fn(),
      resetAvailability: vi.fn(),
      setPinned: vi.fn(),
    };
  });

  it('should show a loading state while the catalog loads', () => {
    mockState.models = { ...mockState.models, isLoading: true };
    render(<ModelSettings />);

    expect(screen.getByText('Loading models')).toBeInTheDocument();
  });

  it('should offer the full catalog when no model is recommended', () => {
    mockState.models = { ...mockState.models, data: [model] };
    render(<ModelSettings />);

    expect(screen.getByText('No recommended models')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'View all models' }));
    expect(screen.getByText('GPT')).toBeInTheDocument();
  });

  it('should offer to clear a search that matches nothing', () => {
    mockState.models = { ...mockState.models, data: [model], recommendedModels: [model] };
    render(<ModelSettings />);

    fireEvent.change(screen.getByLabelText('Search models'), { target: { value: 'claude' } });
    const emptyState = screen.getByText('No models match “claude”').closest('[data-slot="panel-empty-state"]');
    fireEvent.click(within(emptyState as HTMLElement).getByRole('button', { name: 'Clear search' }));
    expect(screen.getByText('GPT')).toBeInTheDocument();
  });

  it('should pin a model without flipping its switch', () => {
    mockState.models = { ...mockState.models, data: [model], recommendedModels: [model] };
    render(<ModelSettings />);

    const pin = screen.getByRole('button', { name: 'Pin GPT' });
    expect(pin).toHaveAttribute('aria-pressed', 'false');
    fireEvent.click(pin);
    expect(mockState.models.setPinned).toHaveBeenCalledWith(model, true);
    expect(mockState.models.setAvailable).not.toHaveBeenCalled();
  });

  it('should offer a reset only once a model has been toggled', () => {
    mockState.models = { ...mockState.models, data: [model], recommendedModels: [model] };
    const { rerender } = render(<ModelSettings />);
    expect(screen.queryByRole('button', { name: 'Reset to recommended' })).toBeNull();

    mockState.models = { ...mockState.models, overrides: { gpt: false } };
    rerender(<ModelSettings />);
    fireEvent.click(screen.getByRole('button', { name: 'Reset to recommended' }));
    expect(mockState.models.resetAvailability).toHaveBeenCalledOnce();
  });
});
