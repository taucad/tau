// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import type { AcpSessionData } from '@taucad/chat';
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
const mockCanSelectExecutionByConsumer: { current: boolean } = { current: false };
const mockSetActiveExecution = vi.fn();

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
      execution: { execution: mockExecutionByConsumer.current, setActiveExecution: mockSetActiveExecution },
      kernel: {
        kernelId: mockKernelByConsumer.current?.id,
        kernel: mockKernelByConsumer.current,
        setActiveKernel: vi.fn(),
      },
      status: 'ready',
      agentActivity: 'ready',
      stop: () => undefined,
      contextUsage: undefined,
      session: undefined,
      canSelectExecution: mockCanSelectExecutionByConsumer.current,
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

// `planMode` is the only flag this row reads, so one switch covers it.
const mockPlanModeEnabled = { current: false };

vi.mock('#flags/use-feature.js', () => ({
  useFeature: () => mockPlanModeEnabled.current,
}));

vi.mock('#components/chat/chat-model-selector.js', () => ({
  openModelSelectorKeyCombination: { key: '/', modKey: true },
  ChatModelSelector: ({ children }: { readonly children: (props: unknown) => React.ReactNode }) => (
    <div data-testid='model-selector'>{children({})}</div>
  ),
}));

const mockAgentSelectorOffered = { current: true };

// The chip has its own suite; here it only has to appear for a Tau turn and
// stay away from an external agent's turns.
vi.mock('#components/billing/credit-estimate.js', () => ({
  CreditBalanceChip: () => <div data-testid='credit-balance-chip' />,
}));

vi.mock('#components/chat/chat-execution-selector.js', () => ({
  formatChatAgentActivity: () => 'Approval needed',
  useChatAgentSelection: () => ({ isOffered: mockAgentSelectorOffered.current, label: 'Claude Code' }),
  ChatExecutionSelector: ({
    children,
  }: {
    readonly children: (props: {
      readonly label: string;
      readonly kind: 'tau' | 'tau-host';
      readonly activity: 'approval-required';
    }) => React.ReactNode;
  }) => <div>{children({ label: 'Claude Code', kind: 'tau-host', activity: 'approval-required' })}</div>,
}));

const acpModel = { id: 'gpt-5.6-sol', name: 'GPT-5.6-Sol' };

vi.mock('#components/chat/chat-agent-model-selector.js', () => ({
  useChatAgentModel: () => ({ models: [acpModel], selectedModel: acpModel, isOffered: true, agentName: 'Codex' }),
  ChatAgentModelSelector: ({
    children,
  }: {
    readonly children: (props: { readonly selectedModel: typeof acpModel }) => React.ReactNode;
  }) => <div>{children({ selectedModel: acpModel })}</div>,
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

const modeConfig = {
  label: 'Agent',
  icon: () => <span data-testid='mode-icon' />,
  activeClass: '',
};

vi.mock('#components/chat/chat-mode-selector.js', () => ({
  ChatAgentSelector: ({
    children,
  }: {
    readonly children: (props: { readonly currentConfig: typeof modeConfig }) => React.ReactNode;
  }) => <div data-testid='mode-selector'>{children({ currentConfig: modeConfig })}</div>,
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

vi.mock('@taucad/ui/components/popover', () => ({
  Popover: ({ children }: { readonly children: React.ReactNode }) => <div>{children}</div>,
  PopoverTrigger: ({ children }: { readonly children: React.ReactNode }) => <div>{children}</div>,
  PopoverContent: ({ children }: { readonly children: React.ReactNode }) => <div>{children}</div>,
}));

const { ChatTextareaLeftControls, acpCommandToSlashCommand } =
  await import('#components/chat/chat-textarea-desktop.js');

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

function renderControls(creationLocationControl?: React.ReactNode, acpSessionData?: AcpSessionData) {
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
      acpSessionData={acpSessionData}
    />,
  );
}

describe('ChatTextareaLeftControls — chat-scoped kernel label', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockKernelByConsumer.current = manifoldKernel;
    mockExecutionByConsumer.current = { kind: 'tau', model: 'm' };
    mockCanSelectExecutionByConsumer.current = false;
    mockAgentSelectorOffered.current = true;
    mockPlanModeEnabled.current = false;
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

  it('names the agent selector and hides the Tau model selector for an external execution', () => {
    mockExecutionByConsumer.current = { kind: 'acp', hostId: 'origin', agentId: 'claude' };
    mockCanSelectExecutionByConsumer.current = true;

    renderControls();

    expect(screen.getByRole('button', { name: 'Select agent: Claude Code' })).toHaveAttribute(
      'aria-description',
      'Agent status: Approval needed',
    );
    expect(screen.queryByTestId('model-selector')).toBeNull();
    // Tau credits do not fund an external agent's turns.
    expect(screen.queryByTestId('credit-balance-chip')).toBeNull();
  });

  it('shows the credit balance chip alongside the Tau model selector', () => {
    renderControls();

    expect(screen.getByTestId('credit-balance-chip')).toBeInTheDocument();
  });

  /* Q12.2 + Q12.5: the readiness dot is gone from the trigger and readiness
   * reads out of the tooltip, in the model selector's style. */
  it('names the selected agent and its readiness in the agent tooltip', () => {
    mockCanSelectExecutionByConsumer.current = true;

    renderControls();

    expect(screen.getAllByTestId('tooltip-content').map((node) => node.textContent)).toContain(
      'Select agent (Claude Code) · Approval needed',
    );
  });

  /* Q12.6: one agent is not a choice. */
  it('does not render the agent selector when Tau is the only agent', () => {
    mockCanSelectExecutionByConsumer.current = true;
    mockAgentSelectorOffered.current = false;

    renderControls();

    expect(screen.queryByRole('button', { name: /^Select agent: /u })).toBeNull();
  });

  /* Q12 fold 1: the ACP model trigger collapses like its Tau sibling, so its
   * label is hidden below the container breakpoint and the name moves to the
   * trigger's accessible name. */
  it('collapses the ACP model label below the container breakpoint and keeps its accessible name', () => {
    mockExecutionByConsumer.current = { kind: 'acp', hostId: 'origin', agentId: 'codex' };
    mockCanSelectExecutionByConsumer.current = true;

    renderControls();

    const trigger = screen.getByRole('button', { name: 'Select model (GPT-5.6-Sol)' });
    const label = trigger.querySelector('span')!;
    expect(label).toHaveTextContent('GPT-5.6-Sol');
    expect(label.className).toContain('hidden');
    expect(label.className).toContain('@[22rem]:block');
    expect(trigger.className).toContain('@max-[22rem]:w-7');
  });

  it('renders offered ACP config separately and stores the exact selected value', () => {
    mockExecutionByConsumer.current = { kind: 'acp', hostId: 'origin', agentId: 'codex' };
    renderControls(undefined, {
      type: 'acp-session',
      id: 'state-1',
      agentId: 'codex',
      commands: [],
      configOptions: [
        {
          type: 'select',
          id: 'model',
          name: 'Model',
          category: 'model',
          currentValue: 'gpt-5.6-sol',
          options: [{ value: 'gpt-5.6-sol', name: 'GPT-5.6-Sol' }],
        },
        {
          type: 'select',
          id: 'thought_level',
          name: 'Thinking',
          category: 'thought_level',
          currentValue: 'medium',
          options: [
            { value: 'medium', name: 'Medium' },
            { value: 'high', name: 'High' },
          ],
        },
      ],
    });

    expect(screen.getByRole('button', { name: 'Agent settings' })).toBeInTheDocument();
    expect(screen.queryByRole('combobox', { name: 'Model' })).toBeNull();
    fireEvent.change(screen.getByRole('combobox', { name: 'Thinking' }), { target: { value: 'high' } });
    expect(mockSetActiveExecution).toHaveBeenCalledWith({
      kind: 'acp',
      hostId: 'origin',
      agentId: 'codex',
      config: { thought_level: 'high' },
    });
  });

  /* C3-review M2: at the 280 px pane every trigger label is `display:none`, so
   * the kernel and mode triggers are only reachable by their `aria-label`. */
  it('names the kernel and mode triggers when their labels are collapsed', () => {
    mockKernelByConsumer.current = openscadKernel;
    mockPlanModeEnabled.current = true;

    renderControls();

    expect(screen.getByRole('button', { name: 'Select kernel (OpenSCAD)' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Select mode (Agent)' })).toBeInTheDocument();
  });

  /* C3-review M1: the agent trigger collapses to 28 px like its four siblings. */
  it('collapses the agent trigger below the container breakpoint', () => {
    mockCanSelectExecutionByConsumer.current = true;

    renderControls();

    expect(screen.getByRole('button', { name: 'Select agent: Claude Code' }).className).toContain('@max-[22rem]:w-7');
  });

  /* Q12.7: no chevron on any trigger in the row. */
  it('renders no chevron on any trigger', () => {
    mockCanSelectExecutionByConsumer.current = true;

    const { container } = renderControls();

    expect(container.querySelectorAll('svg.lucide-chevron-down')).toHaveLength(0);
  });
});

describe('ACP slash commands', () => {
  it('preserves dollar-prefixed skills and adds the native slash only to ordinary commands', () => {
    expect(acpCommandToSlashCommand({ name: '$brep-design', description: 'BRep' }, 'codex')).toMatchObject({
      id: '$brep-design',
      label: '$brep-design',
      group: 'Commands',
      commandText: '$brep-design ',
      source: 'codex',
    });
    expect(acpCommandToSlashCommand({ name: 'compact', description: 'Compact' }, 'codex')).toMatchObject({
      id: '/compact',
      label: '/compact',
      commandText: '/compact ',
    });
  });
});
