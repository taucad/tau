import { fireEvent, render, screen, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ModelSettings } from '#components/settings/model-settings.js';

const mockState = vi.hoisted(() => ({
  models: {
    data: [] as unknown[],
    isLoading: false,
    recommendedModels: [] as unknown[],
    isAvailable: () => true,
    setAvailable: () => undefined,
  },
}));

vi.mock('#hooks/use-models.js', () => ({ useModels: () => mockState.models }));

const model = {
  id: 'gpt',
  name: 'GPT',
  provider: { name: 'OpenAI' },
  details: { family: 'openai' },
};

describe('ModelSettings', () => {
  beforeEach(() => {
    mockState.models = { ...mockState.models, data: [], isLoading: false, recommendedModels: [] };
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
});
