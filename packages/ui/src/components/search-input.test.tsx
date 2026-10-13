// @vitest-environment jsdom
import { useState } from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { SearchInput } from '#components/search-input.js';

function Harness(): React.JSX.Element {
  const [value, setValue] = useState('bracket');
  return (
    <SearchInput
      aria-label='Search examples'
      value={value}
      onChange={(event) => {
        setValue(event.target.value);
      }}
      onClear={() => {
        setValue('');
      }}
    />
  );
}

describe('SearchInput', () => {
  it('should default the placeholder to a typographic ellipsis', () => {
    render(<SearchInput readOnly aria-label='Search' onClear={() => undefined} />);

    expect(screen.getByRole('searchbox', { name: 'Search' })).toHaveAttribute('placeholder', 'Search…');
  });

  it('should render the clear control at the 24 px icon-xs target', () => {
    render(<Harness />);

    // Jsdom has no layout, so the target is pinned through the icon-xs size class (size-6 = 24 px).
    const clear = screen.getByRole('button', { name: 'Clear search' });
    expect(clear).toHaveClass('size-6');
    expect(clear).not.toHaveClass('size-5');
  });

  it('should return focus to the input after clearing from the keyboard', async () => {
    const user = userEvent.setup();
    render(<Harness />);
    const input = screen.getByRole('searchbox', { name: 'Search examples' });

    await user.click(input);
    await user.tab();
    expect(screen.getByRole('button', { name: 'Clear search' })).toHaveFocus();
    await user.keyboard('{Enter}');

    expect(input).toHaveValue('');
    expect(input).toHaveFocus();
  });
});
