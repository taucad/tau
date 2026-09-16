// @vitest-environment jsdom
import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import DesktopHome, { handle } from '#routes/_index/home-surface.desktop.js';

vi.mock('#routes/_index/homepage-chat-hero.js', () => ({ HomepageChatHero: () => <div>desktop hero</div> }));
vi.mock('#components/project-library/project-library.js', () => ({ ProjectLibrary: () => <div>project library</div> }));

describe('desktop home surface', () => {
  it('should always render the product home without web document chrome', () => {
    render(<DesktopHome />);

    expect(screen.getByText('desktop hero')).toBeInTheDocument();
    expect(screen.getByText('project library')).toBeInTheDocument();
    expect(handle.enablePageFooter).toBe(false);
    expect(handle.enablePageWrapper).toBe(true);
  });
});
