// @vitest-environment jsdom
import { render, screen } from '@testing-library/react';
import { renderToString } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { CommunityPageSkeleton } from '#routes/_index/community-page-skeleton.js';

describe('CommunityPageSkeleton', () => {
  it('should announce the gallery as opening while the root gate waits', () => {
    render(<CommunityPageSkeleton />);

    expect(screen.getByRole('status', { name: 'Opening examples' })).toHaveAttribute('aria-busy', 'true');
  });

  // The gate's placeholder is the server render: `/community` used to ship a body with no shell and no cards.
  it('should be the first paint of the server render', () => {
    expect(renderToString(<CommunityPageSkeleton />)).toContain('aria-label="Opening examples"');
  });
});
