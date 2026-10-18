import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { Tabs } from '@taucad/ui/components/tabs';
import { ChatInterfaceNav, chatTabs } from '#routes/w.$workspace.$project/chat-interface-nav.js';

const threadsFlag = vi.hoisted(() => ({ enabled: true }));
vi.mock('#flags/use-feature.js', () => ({ useFeature: () => threadsFlag.enabled }));

describe('mobile editor navigation', () => {
  it('exposes Share as a first-class drawer surface', () => {
    expect(chatTabs.map(({ id }) => id)).toContain('share');
    expect(chatTabs.find(({ id }) => id === 'share')?.label).toBe('Share');
  });

  it('exposes revision history on narrow screens', () => {
    expect(chatTabs.find(({ id }) => id === 'revisions')?.label).toBe('History');
  });
});

it('should hide the mobile Threads entry when disabled and restore it when enabled', () => {
  threadsFlag.enabled = false;
  const content = (
    <Tabs defaultValue='chat'>
      <ChatInterfaceNav />
    </Tabs>
  );
  const view = render(content);
  expect(screen.queryByRole('tab', { name: 'Threads' })).not.toBeInTheDocument();
  expect(screen.getByRole('tab', { name: 'Chat' })).toBeVisible();
  threadsFlag.enabled = true;
  view.rerender(
    <Tabs defaultValue='chat'>
      <ChatInterfaceNav />
    </Tabs>,
  );
  expect(screen.getByRole('tab', { name: 'Threads' })).toBeVisible();
});
