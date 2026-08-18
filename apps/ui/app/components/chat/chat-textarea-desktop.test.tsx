// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import type { ResolvedModel } from '#hooks/use-models.js';
import { kernelConfigurations } from '@taucad/types/constants';
import type { KernelConfiguration } from '@taucad/types/constants';
import type { ChatComposerContextValue } from '#hooks/active-chat-provider.js';

const manifoldKernel = kernelConfigurations.find((k) => k.id === 'manifold')!;
const openscadKernel = kernelConfigurations.find((k) => k.id === 'openscad')!;
const mockKernelByConsumer: { current: KernelConfiguration | undefined } = {
  current: manifoldKernel,
};

vi.mock('#hooks/use-chat.js', () => ({
  useChatActions: () => ({ setDraftMode: vi.fn() }),
  useChatContext: () => ({ persistenceActorRef: { send: vi.fn() } }),
  useChatSelector: (selector: (state: unknown) => unknown) => selector({ draftMode: 'agent', status: 'idle' }),
  useDraftActions: () => ({ setDraftMode: vi.fn() }),
  useDraftSelector: (selector: (state: unknown) => unknown) => selector({ draftMode: 'agent' }),
}));

// Single composer-context mock backs every chat-scoped read the desktop
// controls perform — kernel label is the only field the visible-label
// tests assert on, but we populate the full contract so the unified
// `useChatComposer()` hook stays type-correct.
const mockUseChatComposer = vi.fn(
  (): ChatComposerContextValue =>
    ({
      draftActorRef: { send: vi.fn() },
      model: { modelId: 'm', model: undefined, setActiveModel: vi.fn() },
      kernel: {
        kernelId: mockKernelByConsumer.current?.id,
        kernel: mockKernelByConsumer.current,
        setActiveKernel: vi.fn(),
      },
      status: 'ready',
      stop: () => undefined,
      contextUsage: undefined,
      session: undefined,
    }) as unknown as ChatComposerContextValue,
);

vi.mock('#hooks/active-chat-provider.js', () => ({
  useChatComposer: () => mockUseChatComposer(),
}));

vi.mock('#hooks/use-keyboard.js', () => ({
  useKeybinding: () => ({ formattedKeyCombination: 'm' }),
}));

vi.mock('@xstate/react', () => ({
  useSelector: () => undefined,
}));

vi.mock('#flags/use-feature.js', () => ({
  useFeature: () => false,
}));

vi.mock('#components/chat/chat-model-selector.js', () => ({
  openModelSelectorKeyCombination: { key: '/', modKey: true },
  ChatModelSelector: ({ children }: { readonly children: (props: unknown) => React.ReactNode }) => (
    <div>{children({})}</div>
  ),
}));

vi.mock('#components/chat/chat-kernel-selector.js', () => ({
  ChatKernelSelector: ({
    children,
  }: {
    readonly children: (props: { selectedKernel: KernelConfiguration | undefined }) => React.ReactNode;
  }) => <div>{children({ selectedKernel: mockKernelByConsumer.current })}</div>,
}));

vi.mock('#components/chat/chat-tool-selector.js', () => ({
  ChatToolSelector: ({ children }: { readonly children: (props: unknown) => React.ReactNode }) => (
    <div>{children({ selectedMode: undefined, selectedTools: [], toolMetadata: {} })}</div>
  ),
}));

vi.mock('#components/chat/chat-mode-selector.js', () => ({
  ChatAgentSelector: () => <div data-testid='mode-selector' />,
  toggleModeKeyCombination: { key: 'm' },
}));

vi.mock('#components/icons/svg-icon.js', () => ({
  SvgIcon: ({ id }: { readonly id?: string }) => <span data-testid='svg-icon'>{id}</span>,
}));

vi.mock('#components/ui/key-shortcut.js', () => ({
  KeyShortcut: ({ children }: { readonly children: React.ReactNode }) => <span>{children}</span>,
}));

vi.mock('#components/ui/tooltip.js', () => ({
  Tooltip: ({ children }: { readonly children: React.ReactNode }) => <div>{children}</div>,
  TooltipTrigger: ({ children }: { readonly children: React.ReactNode }) => <div>{children}</div>,
  TooltipContent: ({ children }: { readonly children: React.ReactNode }) => (
    <div data-testid='tooltip-content'>{children}</div>
  ),
}));

vi.mock('#components/ui/button.js', () => ({
  Button: ({ children }: { readonly children: React.ReactNode }) => <button type='button'>{children}</button>,
}));

const { ChatTextareaLeftControls } = await import('#components/chat/chat-textarea-desktop.js');

const stubModel: ResolvedModel = {
  id: 'm',
  name: 'M',
  family: 'gpt',
  provider: { id: 'openai', name: 'OpenAI' },
  isResolved: true,
};
// oxlint-disable-next-line @typescript-eslint/no-restricted-types -- React ref objects are typed with `null` upstream
const stubFileInput: React.RefObject<HTMLInputElement | null> = { current: null };
const noop = (): void => undefined;

function renderControls() {
  return render(
    <ChatTextareaLeftControls
      selectedModel={stubModel}
      enableKernelSelector
      selectedToolChoice='auto'
      focusEditor={noop}
      setDraftToolChoice={noop}
      fileInputReference={stubFileInput}
      handleFileChange={noop}
    />,
  );
}

describe('ChatTextareaLeftControls — chat-scoped kernel label', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockKernelByConsumer.current = manifoldKernel;
  });

  it('should render the kernel label from useChatComposer().kernel (no direct useKernel)', () => {
    renderControls();

    expect(mockUseChatComposer).toHaveBeenCalled();
    expect(screen.getAllByText('Manifold').length).toBeGreaterThan(0);
  });

  it('should reflect the new kernel name when active chat kernel changes', () => {
    const { unmount } = renderControls();
    expect(screen.getAllByText('Manifold').length).toBeGreaterThan(0);
    unmount();

    mockKernelByConsumer.current = openscadKernel;
    renderControls();

    expect(screen.getAllByText('OpenSCAD').length).toBeGreaterThan(0);
  });
});
