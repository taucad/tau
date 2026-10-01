import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { ChatToolAction, ChatToolDescription } from '#components/chat/chat-tool-text.js';

describe('ChatToolAction', () => {
  it('should render the verb in semantic muted color with medium weight', () => {
    render(<ChatToolAction>Read</ChatToolAction>);

    const verb = screen.getByText('Read');
    expect(verb).toHaveClass('font-medium');
    expect(verb).toHaveClass('text-muted-foreground');
  });

  it('should lift to full foreground when nested inside a chat-tool trigger group on hover', () => {
    render(<ChatToolAction>Read</ChatToolAction>);

    const verb = screen.getByText('Read');
    expect(verb).toHaveClass('transition-colors');
    expect(verb).toHaveClass(
      'group-hover/chat-tool-trigger:text-foreground',
      'group-focus-visible/chat-tool-trigger:text-foreground',
    );
  });

  it('should accept and merge a custom className', () => {
    render(<ChatToolAction className='font-mono'>Read</ChatToolAction>);

    const verb = screen.getByText('Read');
    expect(verb).toHaveClass('font-mono');
    expect(verb).toHaveClass('font-medium');
  });
});

describe('ChatToolDescription', () => {
  it('should render the semantic muted color description with normal weight', () => {
    render(<ChatToolDescription>main.kcl</ChatToolDescription>);

    const desc = screen.getByText('main.kcl');
    expect(desc).toHaveClass('font-normal');
    expect(desc).toHaveClass('text-muted-foreground');
  });

  it('should lift to /80 when nested inside a chat-tool trigger group on hover (one tier behind the verb)', () => {
    render(<ChatToolDescription>main.kcl</ChatToolDescription>);

    const desc = screen.getByText('main.kcl');
    expect(desc).toHaveClass('transition-colors');
    expect(desc).toHaveClass(
      'group-hover/chat-tool-trigger:text-foreground/80',
      'group-focus-visible/chat-tool-trigger:text-foreground/80',
    );
  });

  it('should accept and merge a custom className', () => {
    render(<ChatToolDescription className='font-mono'>main.kcl</ChatToolDescription>);

    const desc = screen.getByText('main.kcl');
    expect(desc).toHaveClass('font-mono');
    expect(desc).toHaveClass('font-normal');
  });

  it('should NOT carry truncate/min-width (ancestor block container owns title-row truncation)', () => {
    render(<ChatToolDescription>main.kcl</ChatToolDescription>);

    const desc = screen.getByText('main.kcl');
    // ChatToolDescription is an inline span — overflow:hidden is ignored on
    // inline elements, so a `truncate` class here would be a no-op and would
    // also block character-level ellipsification by the outer block parent
    // (e.g. ChatToolCardTitle). Truncation is owned exclusively upstream.
    expect(desc).not.toHaveClass('truncate');
    expect(desc).not.toHaveClass('min-w-0');
  });
});
