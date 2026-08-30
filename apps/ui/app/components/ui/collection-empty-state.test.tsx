// @vitest-environment jsdom
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { CollectionEmptyState } from '#components/ui/collection-empty-state.js';

describe('CollectionEmptyState', () => {
  it('renders children and forwards caller-owned attributes', () => {
    render(
      <CollectionEmptyState role='status' aria-label='Measurements unavailable' className='min-h-16'>
        No measurements
      </CollectionEmptyState>,
    );

    const state = screen.getByRole('status', { name: 'Measurements unavailable' });
    expect(state).toHaveAttribute('data-slot', 'collection-empty-state');
    expect(state).toHaveClass('min-h-16');
    expect(state).toHaveTextContent('No measurements');
  });
});
