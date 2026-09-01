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
const mockExecutionByConsumer: { current: ChatComposerContextValue['execution']['execution'] } = {
  current: { kind: 'tau', model: 'm' },
};
const mockSessionByConsumer: { current: boolean } = { current: false };

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
      execution: { execution: mockExecutionByConsumer.current, setActiveExecution: vi.fn() },
      kernel: {
        kernelId: mockKernelByConsumer.current?.id,
        kernel: mockKernelByConsumer.current,
        setActiveKernel: vi.fn(),
      },
      status: 'ready',
      agentActivity: 'ready',
      stop: () => undefined,
      contextUsage: undefined,
      session: mockSessionByConsumer.current ? {} : undefined,
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
    <div data-testid='model-selector'>{children({})}</div>
  ),
}));

vi.mock('#components/chat/chat-execution-selector.js', () => ({
  formatChatAgentActivity: () => 'Approval needed',
  ChatExecutionSelector: ({
    children,
  }: {
    readonly children: (props: {
      readonly label: string;
      readonly kind: 'tau' | 'paseo';
      readonly activity: 'approval-required';
    }) => React.ReactNode;
  }) => <div>{children({ label: 'Claude Code', kind: 'paseo', activity: 'approval-required' })}</div>,
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

vi.mock('@taucad/ui/components/tooltip', () => ({
  Tooltip: ({ children }: { readonly children: React.ReactNode }) => <div>{children}</div>,
  TooltipTrigger: ({ children }: { readonly children: React.ReactNode }) => <div>{children}</div>,
  TooltipContent: ({ children }: { readonly children: React.ReactNode }) => (
    <div data-testid='tooltip-content'>{children}</div>
  ),
}));

vi.mock('@taucad/ui/components/button', () => ({
  Button: ({ children, ...properties }: React.ComponentProps<'button'>) => (
    <button type='button' {...properties}>
      {children}
    </button>
  ),
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

function renderControls(creationLocationControl?: React.ReactNode) {
  return render(
    <ChatTextareaLeftControls
      selectedModel={stubModel}
      enableKernelSelector
      selectedToolChoice='auto'
      focusEditor={noop}
      setDraftToolChoice={noop}
      fileInputReference={stubFileInput}
      handleFileChange={noop}
      creationLocationControl={creationLocationControl}
    />,
  );
}

describe('ChatTextareaLeftControls — chat-scoped kernel label', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockKernelByConsumer.current = manifoldKernel;
    mockExecutionByConsumer.current = { kind: 'tau', model: 'm' };
    mockSessionByConsumer.current = false;
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

  it('places the creation location control directly after the model selector', () => {
    renderControls(<button type='button'>Create in Home</button>);
    const location = screen.getByRole('button', { name: 'Create in Home' });
    expect(location.previousElementSibling).toHaveTextContent('Select model');
  });

  it('names the agent selector and hides the Tau model selector for a Paseo execution', () => {
    mockExecutionByConsumer.current = { kind: 'paseo', connectionId: 'connection-1', agentId: 'claude' };
    mockSessionByConsumer.current = true;

    renderControls();

    expect(screen.getByRole('button', { name: 'Select agent: Claude Code' })).toHaveAttribute(
      'aria-description',
      'Agent status: Approval needed',
    );
    expect(screen.queryByTestId('model-selector')).toBeNull();
  });
});
