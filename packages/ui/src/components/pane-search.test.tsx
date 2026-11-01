// @vitest-environment jsdom
import { useState } from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { PaneSearchProvider, PaneSearchRegion, usePaneSearch } from '#components/pane-search.js';

function Toggle(): React.JSX.Element | undefined {
  const search = usePaneSearch();
  if (!search?.hasRegion) {
    return undefined;
  }

  return (
    <button
      type='button'
      aria-expanded={search.isOpen}
      aria-controls={search.regionId}
      data-hidden-query={search.hasHiddenQuery}
      onClick={search.toggle}
    >
      Filter
    </button>
  );
}

function Pane(): React.JSX.Element {
  const [value, setValue] = useState('');
  return (
    <>
      <Toggle />
      <PaneSearchRegion data-testid='region'>
        <input
          type='search'
          aria-label='Filter'
          value={value}
          onChange={(event) => {
            setValue(event.target.value);
          }}
        />
      </PaneSearchRegion>
    </>
  );
}

describe('PaneSearchRegion', () => {
  it('should show the filter row without a provider', () => {
    render(<Pane />);

    expect(screen.getByTestId('region')).toBeVisible();
    expect(screen.queryByRole('button', { name: 'Filter' })).toBeNull();
  });

  it('should hide the filter row under a provider until the toggle opens it and focuses its field', async () => {
    const user = userEvent.setup();
    render(
      <PaneSearchProvider>
        <Pane />
      </PaneSearchProvider>,
    );

    const toggle = screen.getByRole('button', { name: 'Filter' });
    expect(screen.getByTestId('region')).not.toBeVisible();
    expect(toggle).toHaveAttribute('aria-expanded', 'false');
    expect(toggle).toHaveAttribute('aria-controls', screen.getByTestId('region').id);

    await user.click(toggle);

    expect(screen.getByTestId('region')).toBeVisible();
    expect(toggle).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByRole('searchbox', { name: 'Filter' })).toHaveFocus();
  });

  it('should keep the query when collapsed and mark that a filter still applies', async () => {
    const user = userEvent.setup();
    render(
      <PaneSearchProvider>
        <Pane />
      </PaneSearchProvider>,
    );
    const toggle = screen.getByRole('button', { name: 'Filter' });

    await user.click(toggle);
    await user.keyboard('bolt');
    await user.click(toggle);

    expect(screen.getByTestId('region')).not.toBeVisible();
    expect(toggle).toHaveAttribute('data-hidden-query', 'true');

    await user.click(toggle);

    expect(screen.getByRole('searchbox', { name: 'Filter' })).toHaveValue('bolt');
    expect(toggle).toHaveAttribute('data-hidden-query', 'false');
  });
});

describe('PaneSearchProvider', () => {
  it('should keep a nested pane filter row shown and off the outer toggle when scoped out', () => {
    render(
      <PaneSearchProvider>
        <Toggle />
        <PaneSearchProvider isEnabled={false}>
          <PaneSearchRegion data-testid='nested'>
            <input type='search' aria-label='Nested filter' />
          </PaneSearchRegion>
        </PaneSearchProvider>
      </PaneSearchProvider>,
    );

    expect(screen.getByTestId('nested')).toBeVisible();
    expect(screen.queryByRole('button', { name: 'Filter' })).toBeNull();
  });
});
