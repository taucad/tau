// @vitest-environment jsdom
import { fireEvent, render, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { ChatInterfaceNav, chatTabs } from '#routes/w.$workspace.$project/chat-interface-nav.js';
import type { MobilePanelId } from '#constants/editor.constants.js';

describe('mobile workbench navigation', () => {
  it('restores the model and keeps Files reachable through All', () => {
    const onTabChange = vi.fn<(id: MobilePanelId) => void>();
    render(<ChatInterfaceNav activeTab='chat' onTabChange={onTabChange} />);
    const navigation = screen.getByRole('navigation', { name: 'Workbench' });
    expect(within(navigation).queryByRole('button', { name: 'Files' })).not.toBeInTheDocument();
    fireEvent.click(within(navigation).getByRole('button', { name: 'Model' }));
    expect(onTabChange).toHaveBeenLastCalledWith('viewer');
    fireEvent.click(within(navigation).getByRole('button', { name: 'All' }));
    fireEvent.click(screen.getByRole('button', { name: 'Files' }));
    expect(onTabChange).toHaveBeenLastCalledWith('files');
  });
});

describe('mobile secondary surfaces', () => {
  it('keeps Share available', () => {
    expect(chatTabs.find(({ id }) => id === 'share')?.label).toBe('Share');
  });
  it('keeps revision history available', () => {
    expect(chatTabs.find(({ id }) => id === 'revisions')?.label).toBe('History');
  });
});

// Preserve the flat edge and single selected frame from current main after moving to the shared nav.
describe('mobile navigation frame', () => {
  it('should render a flat bar and one border around the active destination', () => {
    render(<ChatInterfaceNav activeTab='chat' onTabChange={vi.fn()} />);
    const navigation = screen.getByRole('navigation', { name: 'Workbench' });
    expect(navigation).toHaveClass('rounded-none', 'border-t', 'border-x-0', 'border-b-0');
    const selected = within(navigation).getByRole('button', { name: 'Chat' });
    expect(selected).toHaveAttribute('aria-current', 'page');
    expect(selected).toHaveClass('border-border', 'bg-background');
    expect(selected.querySelector('[data-slot=tabs-active-indicator]')).toBeNull();
  });
});
