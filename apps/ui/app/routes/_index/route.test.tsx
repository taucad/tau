// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import Home, { handle, meta } from '#routes/_index/route.js';

vi.mock('#components/project-library/project-library.js', () => ({
  ProjectLibrary: () => <div data-testid='project-library' />,
}));

vi.mock('#routes/_index/homepage-chat-hero.js', () => ({
  HomepageChatHero: () => <div data-testid='homepage-chat-hero' />,
}));

describe('Home route', () => {
  it('should render the chat hero above the project library', () => {
    render(<Home />);

    const hero = screen.getByTestId('homepage-chat-hero');
    expect(hero.nextElementSibling).toBe(screen.getByTestId('project-library'));
  });

  it('should keep the app shell', () => {
    expect(handle.enablePageWrapper).toBe(true);
  });

  it('should provide an application title and description', () => {
    // MetaFunction args are unused by the homepage meta.
    const descriptors = meta({} as Parameters<typeof meta>[0]) as Array<Record<string, unknown>>;

    expect(descriptors.find((descriptor) => 'title' in descriptor)?.['title']).toContain('Tau');
    expect(typeof descriptors.find((descriptor) => descriptor['name'] === 'description')?.['content']).toBe('string');
  });
});
