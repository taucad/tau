import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { Command, CommandInput, CommandList } from '#components/command.js';
import { Input } from '#components/input.js';
import { Textarea } from '#components/textarea.js';

/*
 * On touch, iOS zooms into any field whose text is under 16px when it takes focus. Each field primitive draws
 * its own compact size for fine pointers and 16px on touch, and a caller's size override must not
 * strip the touch size: tailwind-merge replaces only the unprefixed size.
 */
describe('field text size on touch devices', () => {
  it.each([
    ['Input', () => <Input aria-label='field' className='text-xs' />],
    ['Textarea', () => <Textarea aria-label='field' className='text-xs' />],
    [
      'CommandInput',
      () => (
        <Command>
          <CommandInput aria-label='field' className='text-xs' />
          <CommandList />
        </Command>
      ),
    ],
  ])('should keep %s at 16px on touch through a size override', (_name, renderField) => {
    render(renderField());
    const field = screen.getByLabelText('field');
    expect(field).toHaveClass('text-xs', 'pointer-coarse:text-base');
    expect(field).not.toHaveClass('text-sm');
  });
});
