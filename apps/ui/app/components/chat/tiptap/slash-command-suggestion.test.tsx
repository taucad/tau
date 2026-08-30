import { render, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { SlashCommandDropdown } from '#components/chat/tiptap/slash-command-suggestion.js';
import type { SlashCommandItem, SuggestionPopupState } from '#components/chat/tiptap/suggestion-types.js';

Element.prototype.scrollIntoView = vi.fn();

const item: SlashCommandItem = {
  id: 'create-skill',
  label: 'Create Skill',
  description: 'Create or update Tau agent skills',
  group: 'Skills',
};

const state: SuggestionPopupState<SlashCommandItem> = {
  query: '',
  items: [item],
  command: vi.fn(),
  clientRect: () => new DOMRect(100, 300, 264, 0),
};

describe('SlashCommandDropdown', () => {
  it('keeps the scroll mask inside the shared menu surface', () => {
    const keydownHandlerRef: React.RefObject<((event: KeyboardEvent) => boolean) | undefined> = {
      current: undefined,
    };

    render(<SlashCommandDropdown state={state} keydownHandlerRef={keydownHandlerRef} />);

    const dropdown = screen.getByTestId('slash-command-dropdown');
    const scrollArea = screen.getByTestId('slash-command-scroll-area');

    expect(dropdown).toHaveClass('rounded-md', 'border-0', 'shadow-menu');
    expect(dropdown).not.toHaveClass('scroll-shadows-y', 'overflow-y-auto');
    expect(scrollArea).toHaveClass('scroll-shadows-y', 'overflow-y-auto');
    expect(scrollArea.parentElement).toBe(dropdown);
    expect(within(scrollArea).getByRole('button', { name: /Create Skill/ })).toHaveClass('rounded-sm');
  });
});
