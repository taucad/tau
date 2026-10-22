// @vitest-environment jsdom
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { Tabs } from '@taucad/ui/components/tabs';
import { ChatInterfaceNav, chatTabs } from '#routes/w.$workspace.$project/chat-interface-nav.js';

describe('mobile editor navigation', () => {
  it('exposes Share as a first-class drawer surface', () => {
    expect(chatTabs.map(({ id }) => id)).toContain('share');
    expect(chatTabs.find(({ id }) => id === 'share')?.label).toBe('Share');
  });

  it('exposes revision history on narrow screens', () => {
    expect(chatTabs.find(({ id }) => id === 'revisions')?.label).toBe('History');
  });

  it('draws a flat bar with one top hairline instead of a partial rounded frame', () => {
    // The bar spans the screen edge to edge above the browser chrome: side and bottom borders
    // and rounded top corners only showed as a frame that stopped short of the edges.
    render(
      <Tabs value='viewer'>
        <ChatInterfaceNav />
      </Tabs>,
    );

    const classes = screen.getByRole('tablist').className.split(/\s+/u);
    expect(classes).toEqual(expect.arrayContaining(['border-t', 'border-x-0', 'border-b-0', 'rounded-none']));
    expect(classes.filter((name) => name.startsWith('rounded-t') || name.startsWith('rounded-b'))).toEqual([]);
  });
});
