import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { describe, expect, it, vi } from 'vitest';

vi.mock('#components/chat/new-project-chat-composer.js', () => ({
  NewProjectChatComposer: ({ enableAutoFocus = true }: { readonly enableAutoFocus?: boolean }) => (
    <div data-autofocus={String(enableAutoFocus)} data-testid='new-project-chat-composer' />
  ),
}));
vi.mock('#hooks/active-chat-provider.js', () => ({
  ActiveChatProvider: ({ children }: { readonly children: React.ReactNode }) => (
    <div data-testid='active-chat-provider'>{children}</div>
  ),
  ChatComposerProvider: ({ children }: { readonly children: React.ReactNode }) => (
    <div data-testid='chat-composer-provider'>{children}</div>
  ),
}));
vi.mock('#hooks/use-project-manager.js', () => ({
  useProjectManager: () => ({ getChat: vi.fn(async () => ({ id: 'chat_homepage_main' })), createChat: vi.fn() }),
}));
vi.mock('#hooks/use-kernel.js', () => ({
  useKernel: () => ({ kernel: 'openscad', setKernel: vi.fn() }),
}));

const { HomepageChatHero } = await import('#routes/_index/homepage-chat-hero.js');
const { MarketingComposer } = await import('#routes/_index/marketing-composer.js');
const { CtaSection } = await import('#routes/_index/cta-section.js');

describe('new-project chat composer surfaces', () => {
  it('mounts the shared composer inside the persistent homepage provider', async () => {
    render(
      <MemoryRouter>
        <HomepageChatHero />
      </MemoryRouter>,
    );

    expect(await screen.findByTestId('active-chat-provider')).toContainElement(
      screen.getByTestId('new-project-chat-composer'),
    );
    expect(screen.getByTestId('new-project-chat-composer')).toHaveAttribute('data-autofocus', 'true');
  });

  it.each([
    ['marketing hero', <MarketingComposer key='marketing' />],
    ['final CTA', <CtaSection key='cta' />],
  ])('mounts the shared composer in the %s composer provider', (_name, surface) => {
    render(<MemoryRouter>{surface}</MemoryRouter>);

    expect(screen.getByTestId('chat-composer-provider')).toContainElement(
      screen.getByTestId('new-project-chat-composer'),
    );
    expect(screen.getByTestId('new-project-chat-composer')).toHaveAttribute('data-autofocus', 'false');
  });
});
