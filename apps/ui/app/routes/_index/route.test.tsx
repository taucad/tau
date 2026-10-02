// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { resolveKernel } from '@taucad/types/constants';
import type { CreateProjectOptions } from '#hooks/use-project-manager.js';
import ChatStart from '#routes/_index/route.js';

const { mockNavigate, mockCreateProject, mockGetChat, mockCreateChat, mockToastError } = vi.hoisted(() => ({
  mockNavigate: vi.fn(),
  mockCreateProject: vi.fn<(options: CreateProjectOptions) => Promise<{ id: string }>>(),
  mockGetChat: vi.fn<() => Promise<{ id: string } | undefined>>(),
  mockCreateChat: vi.fn(),
  mockToastError: vi.fn(),
}));

vi.mock('react-router', () => ({
  Link({ children }: { readonly children: React.ReactNode }) {
    return <a href='/mock-link'>{children}</a>;
  },
  NavLink({
    children,
  }: {
    readonly children:
      | React.ReactNode
      | ((context: { isPending: boolean; isActive: boolean; isTransitioning: boolean }) => React.ReactNode);
  }) {
    if (typeof children === 'function') {
      return <a href='/mock-nav-link'>{children({ isPending: false, isActive: false, isTransitioning: false })}</a>;
    }

    return <a href='/mock-nav-link'>{children}</a>;
  },
  useNavigate() {
    return mockNavigate;
  },
}));

vi.mock('#hooks/use-project-manager.js', () => ({
  useProjectManager() {
    return {
      createProject: mockCreateProject,
      getChat: mockGetChat,
      createChat: mockCreateChat,
      updateChat: vi.fn(),
    };
  },
}));

vi.mock('#hooks/use-kernel.js', () => ({
  useKernel() {
    return {
      kernel: 'openscad',
      setKernel: vi.fn(),
    };
  },
}));

vi.mock('#hooks/use-chat.js', () => ({
  useChatContext() {
    return {
      draftActorRef: {
        send: vi.fn(),
      },
      persistenceActorRef: {
        send: vi.fn(),
      },
    };
  },
  useChatActions() {
    return {
      clearDraft: vi.fn(),
    };
  },
  useDraftActions() {
    return {
      clearDraft: vi.fn(),
    };
  },
}));

// Single composer-context mock. `HomepageChatInput` now reads modelId,
// kernelId and draftActorRef off the unified contract (`useChatComposer()`),
// so this one mock replaces both the legacy `useActiveChatModel` mock and
// the bespoke `useChatComposer` stub.
vi.mock('#hooks/active-chat-provider.js', () => ({
  ActiveChatProvider({ children }: { readonly children: React.ReactNode }) {
    return <div data-testid='active-chat-provider'>{children}</div>;
  },
  ChatComposerProvider({ children }: { readonly children: React.ReactNode }) {
    return <div data-testid='chat-composer-provider'>{children}</div>;
  },
  useChatComposer() {
    return {
      draftActorRef: { send: vi.fn() },
      model: {
        modelId: 'gpt-5-test-id',
        model: { id: 'gpt-5-test-id', name: 'Test GPT' },
        setActiveModel: vi.fn(),
      },
      kernel: { kernelId: 'openscad', kernel: resolveKernel('openscad'), setActiveKernel: vi.fn() },
      status: 'ready',
      stop: () => undefined,
      contextUsage: undefined,
      session: undefined,
    };
  },
}));

vi.mock('#components/chat/chat-textarea.js', () => ({
  ChatTextarea({
    onSubmit,
  }: {
    readonly onSubmit: (input: { content: string; imageUrls?: string[] }) => Promise<void>;
  }) {
    return (
      <button
        type='button'
        data-testid='submit-homepage-chat'
        onClick={() =>
          void onSubmit({
            content: 'design a bracket',
            imageUrls: ['data:image/png;base64,mock'],
          })
        }
      >
        submit
      </button>
    );
  },
}));

vi.mock('#components/chat/kernel-selector.js', () => ({
  KernelSelector() {
    return <div data-testid='kernel-selector'>kernel-selector</div>;
  },
}));

vi.mock('#components/project-grid.js', () => ({
  CommunityProjectGrid() {
    return <div data-testid='community-grid'>community-grid</div>;
  },
}));

vi.mock('#components/ui/lazy-section.js', () => ({
  LazySection({ children }: { readonly children: React.ReactNode }) {
    return <div data-testid='lazy-section'>{children}</div>;
  },
}));

vi.mock('#routes/_index/hero-viewer-gate.js', () => ({
  LazyHeroViewer() {
    return <div data-testid='lazy-hero-viewer'>lazy-hero-viewer</div>;
  },
}));

vi.mock('#routes/_index/hero-image.js', () => ({
  HeroImage() {
    return <div data-testid='hero-image'>hero-image</div>;
  },
}));

vi.mock('#routes/_index/kernels-section.js', () => ({
  KernelsSection() {
    return <div data-testid='kernels-section'>kernels-section</div>;
  },
}));

vi.mock('#routes/_index/integration-section.js', () => ({
  IntegrationSection() {
    return <div data-testid='integration-section'>integration-section</div>;
  },
}));

vi.mock('#routes/_index/coming-soon-section.js', () => ({
  ComingSoonSection() {
    return <div data-testid='coming-soon-section'>coming-soon-section</div>;
  },
}));

vi.mock('#routes/_index/cta-section.js', () => ({
  CtaSection() {
    return <div data-testid='cta-section'>cta-section</div>;
  },
}));

vi.mock('#routes/_index/section-skeletons.js', () => ({
  CommunityGridSkeleton() {
    return <div data-testid='community-grid-skeleton'>community-grid-skeleton</div>;
  },
  HeroImageSkeleton() {
    return <div data-testid='hero-image-skeleton'>hero-image-skeleton</div>;
  },
  KernelsSkeleton() {
    return <div data-testid='kernels-skeleton'>kernels-skeleton</div>;
  },
  IntegrationSkeleton() {
    return <div data-testid='integration-skeleton'>integration-skeleton</div>;
  },
  ComingSoonSkeleton() {
    return <div data-testid='coming-soon-skeleton'>coming-soon-skeleton</div>;
  },
  CtaSkeleton() {
    return <div data-testid='cta-skeleton'>cta-skeleton</div>;
  },
}));

vi.mock('#components/ui/button.js', () => ({
  Button({ children }: { readonly children: React.ReactNode }) {
    return <button type='button'>{children}</button>;
  },
}));

vi.mock('#components/ui/separator.js', () => ({
  Separator() {
    return <hr />;
  },
}));

vi.mock('#components/magicui/interactive-hover-button.js', () => ({
  InteractiveHoverButton({ children }: { readonly children: React.ReactNode }) {
    return <button type='button'>{children}</button>;
  },
}));

vi.mock('#components/ui/loader.js', () => ({
  Loader() {
    return <div data-testid='loader'>loader</div>;
  },
}));

vi.mock('#components/ui/sonner.js', () => ({
  toast: {
    error: mockToastError,
  },
}));

describe('ChatStart', () => {
  beforeEach(() => {
    mockNavigate.mockReset();
    mockCreateProject.mockReset();
    mockGetChat.mockReset();
    mockCreateChat.mockReset();
    mockToastError.mockReset();
    mockGetChat.mockResolvedValue({ id: 'chat_homepage_main' });
  });

  it('should clear persisted homepage draft after successful submission', async () => {
    mockCreateProject.mockResolvedValue({ id: 'project_123' });

    render(<ChatStart />);
    const submitButton = await screen.findByTestId('submit-homepage-chat');
    fireEvent.click(submitButton);

    await waitFor(() => {
      expect(mockCreateProject).toHaveBeenCalledOnce();
    });
    expect(mockCreateChat).toHaveBeenCalledTimes(0);
    // `HomepageChatInput` awaits a dev-only 1200ms delay before navigation (see route.tsx).
    await waitFor(
      () => {
        expect(mockNavigate).toHaveBeenCalledWith('/projects/project_123');
      },
      { timeout: 2000 },
    );
  });

  // `Chat.activeModel` is seeded so pending-tail hydration auto-regenerate runs
  // with the picker model; the agent payload comes from `useCadChatClient` /
  // `latestAgentBody` — not message metadata.
  it('should pass kernel, cookie/chat-scoped model id as activeModel, and minimal initialMessage to createProject', async () => {
    mockCreateProject.mockResolvedValue({ id: 'project_123' });

    render(<ChatStart />);
    const submitButton = await screen.findByTestId('submit-homepage-chat');
    fireEvent.click(submitButton);

    await waitFor(() => {
      expect(mockCreateProject).toHaveBeenCalledOnce();
    });
    const [firstCallArgs] = mockCreateProject.mock.calls[0] ?? [];
    expect(firstCallArgs).toMatchObject({
      kernel: 'openscad',
      activeModel: 'gpt-5-test-id',
      initialMessage: {
        content: 'design a bracket',
        imageUrls: ['data:image/png;base64,mock'],
      },
    });
    expect((firstCallArgs?.initialMessage as Record<string, unknown> | undefined)?.['model']).toBeUndefined();
  });

  it('should not clear draft when project creation fails', async () => {
    mockCreateProject.mockRejectedValue(new Error('failed to create'));

    render(<ChatStart />);
    const submitButton = await screen.findByTestId('submit-homepage-chat');
    fireEvent.click(submitButton);

    await waitFor(() => {
      expect(mockCreateProject).toHaveBeenCalledOnce();
    });
    await waitFor(() => {
      expect(mockToastError).toHaveBeenCalledWith('Failed to create project');
    });
    expect(mockCreateChat).toHaveBeenCalledTimes(0);
    expect(mockNavigate).not.toHaveBeenCalled();
  });
});
