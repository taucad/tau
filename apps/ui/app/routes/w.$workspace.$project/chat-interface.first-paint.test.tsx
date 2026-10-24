// @vitest-environment jsdom
/**
 * D13: a phone paints the phone layout first, on a client mount and through
 * server rendering and hydration alike. The real `useIsMobile` reads a
 * stubbed viewport here; each layout module records when it is imported, so
 * "never fetched" is what the assertions observe, not a mocked branch.
 */
import { act, render, screen } from '@testing-library/react';
import { hydrateRoot } from 'react-dom/client';
import { renderToString } from 'react-dom/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ChatInterface as ChatInterfaceComponent } from '#routes/w.$workspace.$project/chat-interface.js';

const loaded = vi.hoisted(() => new Set<string>());

/* Each factory runs only when its module is imported, so `loaded` records which layout chunks a render requested. */
const layout = vi.hoisted(() => (name: string, label: string) => () => {
  loaded.add(name);
  return { [name]: () => <main aria-label={label} /> };
});

vi.mock('#providers/part-thumbnail-provider.js', () => ({
  PartThumbnailProvider: ({ children }: { children: React.ReactNode }): React.ReactNode => children,
}));
vi.mock('#components/geometry/cad/part-gallery.js', () => ({
  PartGalleryProvider: ({ children }: { children: React.ReactNode }): React.ReactNode => children,
}));
vi.mock('#routes/w.$workspace.$project/workspace-skeleton.js', () => ({
  WorkspaceSkeleton: () => <div role='status' aria-label='Opening project' />,
}));

function stubViewport(mobile: boolean): void {
  vi.stubGlobal(
    'matchMedia',
    vi.fn((query: string) => ({
      matches: mobile,
      media: query,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    })),
  );
}

describe('ChatInterface first paint (D13)', () => {
  /* A fresh module graph and layout factories per test, so a layout imported by an earlier test is
   * requested again here. */
  let ChatInterface: typeof ChatInterfaceComponent;
  beforeEach(async () => {
    loaded.clear();
    vi.resetModules();
    vi.doMock('#routes/w.$workspace.$project/chat-interface-mobile.js', layout('ChatInterfaceMobile', 'Phone layout'));
    vi.doMock(
      '#routes/w.$workspace.$project/chat-interface-desktop.js',
      layout('ChatInterfaceDesktop', 'Desktop layout'),
    );
    ({ ChatInterface } = await import('#routes/w.$workspace.$project/chat-interface.js'));
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('mounts only the phone layout on a client render at a phone viewport', async () => {
    stubViewport(true);

    render(<ChatInterface />);

    expect(await screen.findByRole('main', { name: 'Phone layout' })).toBeInTheDocument();
    expect([...loaded]).toEqual(['ChatInterfaceMobile']);
  });

  it('mounts only the desktop layout on a client render at a desktop viewport', async () => {
    stubViewport(false);

    render(<ChatInterface />);

    expect(await screen.findByRole('main', { name: 'Desktop layout' })).toBeInTheDocument();
    expect([...loaded]).toEqual(['ChatInterfaceDesktop']);
  });

  it('server renders the skeleton and hydrates a phone without requesting the desktop layout', async () => {
    stubViewport(true);
    const html = renderToString(<ChatInterface />);
    expect(html).toContain('aria-label="Opening project"');
    expect(html).not.toContain('layout');
    const container = document.createElement('div');
    container.innerHTML = html;
    document.body.append(container);
    const recoverableErrors: unknown[] = [];

    const root = await act(async () =>
      hydrateRoot(container, <ChatInterface />, {
        onRecoverableError(error) {
          recoverableErrors.push(error);
        },
      }),
    );

    expect(await screen.findByRole('main', { name: 'Phone layout' })).toBeInTheDocument();
    expect([...loaded]).toEqual(['ChatInterfaceMobile']);
    expect(recoverableErrors).toEqual([]);
    act(() => {
      root.unmount();
    });
    container.remove();
  });
});
