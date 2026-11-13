import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { describe, expect, it, vi } from 'vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { TooltipProvider } from '@taucad/ui/components/tooltip';

const renderWithRootProviders = (component: React.ReactNode): ReturnType<typeof render> =>
  render(
    <QueryClientProvider client={new QueryClient()}>
      <MemoryRouter>
        <TooltipProvider>{component}</TooltipProvider>
      </MemoryRouter>
    </QueryClientProvider>,
  );

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
  HomeNewProjectComposerProvider: ({ children }: { readonly children: React.ReactNode }) => (
    <div data-testid='home-new-project-composer-provider'>{children}</div>
  ),
  // The hero's native early input adopts into this actor, and its bar at rest reads the model.
  useChatComposer: () => ({
    draftActorRef: { send: vi.fn() },
    model: {
      model: {
        id: 'm',
        name: 'Model',
        family: 'claude',
        provider: { id: 'anthropic', name: 'Anthropic' },
        isResolved: true,
      },
      effort: undefined,
    },
    execution: { execution: { kind: 'tau' } },
    kernel: { preference: 'auto' },
  }),
}));
vi.mock('#hooks/use-kernel.js', () => ({
  useKernel: () => ({ kernel: 'openscad', preference: 'auto', setKernel: vi.fn() }),
}));

const { HomepageChatHero } = await import('#routes/_index/homepage-chat-hero.js');

describe('new-project chat composer surfaces', () => {
  it('mounts the shared composer inside the persistent homepage provider', async () => {
    renderWithRootProviders(<HomepageChatHero />);

    /* The hero now holds a native input of its own and asks for the composer in an effect, so the
     * composer arrives on a later tick; it still has to arrive, and inside the same provider. */
    expect(await screen.findByTestId('new-project-chat-composer')).toBeInTheDocument();
    expect(screen.getByTestId('home-new-project-composer-provider')).toContainElement(
      screen.getByTestId('new-project-chat-composer'),
    );
    expect(screen.queryByTestId('active-chat-provider')).not.toBeInTheDocument();
    expect(screen.getByTestId('new-project-chat-composer')).toHaveAttribute('data-autofocus', 'true');
  });
});
