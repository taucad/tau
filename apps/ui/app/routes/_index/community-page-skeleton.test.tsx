// @vitest-environment jsdom
import { render, screen } from '@testing-library/react';
import { renderToString } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { CommunityPageSkeleton } from '#routes/_index/community-page-skeleton.js';
import { forgetClientFacts, writeClientFacts } from '#lib/client-facts.js';

describe('CommunityPageSkeleton', () => {
  it('should announce the gallery as opening while the root gate waits', () => {
    render(<CommunityPageSkeleton />);

    expect(screen.getByRole('status', { name: 'Opening examples' })).toHaveAttribute('aria-busy', 'true');
  });

  // The gate's placeholder is the server render: `/community` used to ship a body with no shell and no cards.
  it('should be the first paint of the server render', () => {
    expect(renderToString(<CommunityPageSkeleton />)).toContain('aria-label="Opening examples"');
  });

  // P2: the sidebar's state is a client fact the head script puts on `<html>`, so the markup never depends on it.
  it('should render the same markup whatever sidebar state this device stored, leaving it to the client fact', () => {
    localStorage.clear();
    forgetClientFacts();
    const neutral = renderToString(<CommunityPageSkeleton />);
    writeClientFacts({ sidebarOpen: false });
    localStorage.setItem('tau-sidebar-op', 'true');

    expect(renderToString(<CommunityPageSkeleton />)).toBe(neutral);
    expect(neutral).toContain('[:root[data-sidebar-closed]_&amp;]:md:hidden');
    expect(document.documentElement).toHaveAttribute('data-sidebar-closed');
    localStorage.clear();
    forgetClientFacts();
  });
});
