import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { Toggle, toggleVariants } from '#components/toggle.js';

describe('Toggle selected state', () => {
  it('should keep selected fill and focus without a bottom marker', () => {
    render(
      <Toggle pressed aria-label='PCB view'>
        PCB
      </Toggle>,
    );
    expect(screen.getByRole('button', { name: 'PCB view', pressed: true })).toHaveClass(
      'data-[state=on]:bg-menu-highlight',
      'focus-visible:focus-outline',
    );
    expect(toggleVariants()).toContain('aria-[pressed=true]:bg-menu-highlight');
    expect(toggleVariants()).toContain('aria-[checked=true]:bg-menu-highlight');
    expect(toggleVariants()).not.toContain('after:');
  });
});
