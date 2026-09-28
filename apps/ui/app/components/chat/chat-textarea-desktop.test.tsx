// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { AcpSessionData } from '@taucad/chat';
import { kernelConfigurations } from '@taucad/types/constants';
import { TooltipProvider } from '@taucad/ui/components/tooltip';
import type { ChatComposerContextValue } from '#hooks/active-chat-provider.js';
import type { AgentHostPlacementTarget } from '#lib/agent-host-placement.js';

const manifoldKernel = kernelConfigurations.find((k) => k.id === 'manifold')!;
const execution: { current: ChatComposerContextValue['execution']['execution'] } = {
  current: { kind: 'tau', model: 'm' },
};
const setActiveExecution = vi.fn();
const placements: { current: readonly AgentHostPlacementTarget[] } = { current: [] };

vi.mock('#hooks/active-chat-provider.js', () => ({
  useChatComposer: () => ({
    kernel: { kernelId: manifoldKernel.id, kernel: manifoldKernel, setActiveKernel: vi.fn() },
    execution: { execution: execution.current, setActiveExecution },
    contextUsage: undefined,
  }),
}));

const keybindings = vi.hoisted(() => new Map<string, { callback: () => void; enabled: () => boolean }>());
vi.mock('#hooks/use-keyboard.js', () => ({
  useKeybinding: (
    combination: { key: string },
    callback: () => void,
    options?: { enabled?: boolean | (() => boolean) },
  ) => {
    const enabled = options?.enabled ?? true;
    keybindings.set(combination.key, {
      callback,
      enabled: () => (typeof enabled === 'function' ? enabled() : enabled),
    });
    return { formattedKeyCombination: '⌘.' };
  },
}));

/* The sheet has its own suite; here it only has to sit beside Send. */
vi.mock('#components/chat/chat-agent-sheet.js', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  ChatAgentSheet: ({
    agentConfig,
  }: {
    readonly agentConfig: import('#components/chat/use-agent-config.js').AgentConfig;
  }) => (
    <button
      type='button'
      data-slot='agent-trigger'
      data-reasoning={agentConfig.options.find((option) => option.category === 'thought_level')?.currentValue}
    >
      Agent and model
    </button>
  ),
}));

vi.mock('#components/chat/chat-kernel-selector.js', () => ({
  ChatKernelSelector: ({
    children,
  }: {
    readonly children: (props: { selectedKernel: typeof manifoldKernel }) => React.ReactNode;
  }) => <div>{children({ selectedKernel: manifoldKernel })}</div>,
}));

vi.mock('#components/icons/svg-icon.js', () => ({
  SvgIcon: ({ id }: { readonly id?: string }) => <span data-testid='svg-icon' data-icon={id} />,
}));

vi.mock('#hooks/use-skills-catalog.js', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  useSkillsCatalog: () => [],
}));

vi.mock('#hooks/use-cad-agent-config.js', () => ({
  useAgentHostPlacements: () => ({ targets: placements.current, loading: false }),
}));

const { ChatTextareaBar, ChatTextareaDesktop, acpCommandToSlashCommand } =
  await import('#components/chat/chat-textarea-desktop.js');

const noop = (): void => undefined;
const asyncNoop = async (): Promise<void> => undefined;

const codexSession: AcpSessionData = {
  type: 'acp-session',
  id: 'state',
  agentId: 'codex',
  commands: [],
  configOptions: [
    {
      type: 'select',
      id: 'mode',
      name: 'Approval',
      category: 'mode',
      currentValue: 'read-only',
      options: [
        { value: 'read-only', name: 'Ask for approval' },
        { value: 'agent', name: 'Approve for me' },
      ],
    },
  ],
};

const renderBar = (
  options: {
    readonly acpSessionData?: AcpSessionData;
    readonly enableContextActions?: boolean;
    readonly attachmentInputSupported?: boolean;
    readonly sendRefusal?: string;
    readonly handleFileSelect?: () => void;
    readonly handleAtButtonClick?: () => void;
  } = {},
) =>
  render(
    <TooltipProvider>
      <ChatTextareaBar
        composerMode='main'
        containerReference={{ current: null }}
        enableContextActions={options.enableContextActions ?? true}
        enableKernelSelector
        acpSessionData={options.acpSessionData}
        status='ready'
        focusEditor={noop}
        handleAtButtonClick={options.handleAtButtonClick ?? noop}
        handleFileSelect={options.handleFileSelect ?? noop}
        attachmentInputSupported={options.attachmentInputSupported ?? true}
        fileInputReference={{ current: null }}
        attachmentAccept='image/png,application/pdf'
        handleFileChange={noop}
        isSubmitting={false}
        sendRefusal={options.sendRefusal}
        describedBy={undefined}
        formattedCancelKeyCombination='⇧⌘⌫'
        handleSubmit={asyncNoop}
        handleCancelClick={noop}
      />
    </TooltipProvider>,
  );

describe('ChatTextareaBar', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    keybindings.clear();
    execution.current = { kind: 'tau', model: 'm' };
    placements.current = [];
  });

  it('lays out +, the kernel, the agent trigger and Send — no branch, balance or Tau mode (D6, Q11, Q16)', () => {
    const { container } = renderBar();

    const left = container.querySelector('[data-slot=composer-left]')!;
    const right = container.querySelector('[data-slot=composer-right]')!;
    expect([...left.querySelectorAll('button')].map((button) => button.getAttribute('aria-label'))).toEqual([
      'Add',
      'Select kernel (Manifold)',
    ]);
    expect([...right.querySelectorAll('button')].map((button) => button.textContent || button.ariaLabel)).toEqual([
      'Agent and model',
      'Send',
    ]);
    expect(screen.queryByRole('button', { name: /branch/iu })).toBeNull();
    expect(screen.queryByRole('button', { name: /credits/iu })).toBeNull();
    expect(screen.queryByRole('button', { name: /^Mode/u })).toBeNull();
  });

  it('lets the kernel label leave first when the bar needs the room', () => {
    renderBar();

    const kernel = screen.getByRole('button', { name: 'Select kernel (Manifold)' });
    expect(kernel.querySelector('span:not([data-testid])')!.className).toContain('group-data-[hide-kernel]/bar:hidden');
  });

  it('offers attaching and adding context from one + (F10)', async () => {
    const handleFileSelect = vi.fn();
    const handleAtButtonClick = vi.fn();
    renderBar({ handleFileSelect, handleAtButtonClick });

    await userEvent.click(screen.getByRole('button', { name: 'Add' }));
    expect(screen.getAllByRole('menuitem').map((item) => item.textContent)).toEqual([
      'Attach image or PDF',
      'Add context@',
    ]);
    await userEvent.click(screen.getByRole('menuitem', { name: /Add context/u }));
    expect(handleAtButtonClick).toHaveBeenCalledOnce();
  });

  it('keeps the attach item, disabled with its reason, for a model that cannot read files (F14)', async () => {
    renderBar({ attachmentInputSupported: false, enableContextActions: false });

    await userEvent.click(screen.getByRole('button', { name: 'Add' }));
    const attach = screen.getByRole('menuitem', { name: /Attach image or PDF/u });
    expect(attach).toHaveAttribute('aria-disabled', 'true');
    expect(attach).toHaveTextContent("This model can't read images or PDFs");
    expect(screen.queryByRole('menuitem', { name: /Add context/u })).toBeNull();
  });

  it('gives Send its refusal while staying focusable (F14)', () => {
    renderBar({ sendRefusal: 'Write a message first' });

    expect(screen.getByRole('button', { name: 'Send' })).toHaveAttribute('aria-disabled', 'true');
  });

  it('shows an external agent’s permission mode, named, and steps it with ⌘. (C5)', () => {
    execution.current = { kind: 'acp', hostId: 'desktop', agentId: 'codex' };
    renderBar({ acpSessionData: codexSession });

    expect(screen.getByRole('button', { name: 'Mode: Ask for approval' })).toBeInTheDocument();
    act(() => {
      const binding = keybindings.get('.');
      if (binding?.enabled()) {
        binding.callback();
      }
    });
    expect(setActiveExecution).toHaveBeenLastCalledWith({
      kind: 'acp',
      hostId: 'desktop',
      agentId: 'codex',
      config: { mode: 'agent' },
    });
  });

  it('passes the host-discovered reasoning option to the pre-project agent control', () => {
    execution.current = { kind: 'acp', hostId: 'desktop', agentId: 'codex', model: 'gpt-6-astra' };
    placements.current = [
      {
        hostId: 'desktop',
        rung: 'in-process',
        label: 'This Mac',
        workspaceRoot: '',
        online: true,
        externalAgents: [
          {
            id: 'codex',
            displayName: 'Codex',
            defaultModel: 'gpt-6-sol',
            models: [
              { id: 'gpt-6-sol', name: 'Sol' },
              {
                id: 'gpt-6-astra',
                name: 'Astra',
                thoughtLevel: {
                  type: 'select',
                  id: 'reasoning_effort',
                  name: 'Reasoning effort',
                  category: 'thought_level',
                  currentValue: 'medium',
                  options: [
                    { value: 'medium', name: 'Medium' },
                    { value: 'high', name: 'High' },
                  ],
                },
              },
            ],
          },
        ],
      },
    ];
    renderBar();
    expect(screen.getByRole('button', { name: 'Agent and model' })).toHaveAttribute('data-reasoning', 'medium');
  });

  it('leaves ⌘. and ⌘/ to an edit box that has focus (F6)', () => {
    execution.current = { kind: 'acp', hostId: 'desktop', agentId: 'codex' };
    renderBar({ acpSessionData: codexSession });
    const edit = document.createElement('div');
    edit.dataset['chatComposer'] = 'edit';
    const input = document.createElement('input');
    edit.append(input);
    document.body.append(edit);
    input.focus();

    expect(keybindings.get('.')?.enabled()).toBe(false);
    edit.remove();
  });
});

describe('ACP slash commands', () => {
  it('preserves dollar-prefixed skills and adds the native slash only to ordinary commands', () => {
    expect(acpCommandToSlashCommand({ name: '$brep-design', description: 'BRep' }, 'codex')).toMatchObject({
      id: '$brep-design',
      label: '$brep-design',
      group: 'Commands',
      source: 'codex',
    });
    expect(acpCommandToSlashCommand({ name: 'compact', description: 'Compact' }, 'codex')).toMatchObject({
      id: '/compact',
      label: '/compact',
    });
  });
});

describe('ChatTextareaDesktop draft rehydration', () => {
  const renderComposer = (inputText: string, acpSessionData: AcpSessionData) => {
    const element = (session: AcpSessionData): React.JSX.Element => (
      <TooltipProvider>
        <ChatTextareaDesktop
          enableAutoFocus={false}
          dragKind={undefined}
          isSubmitting={false}
          isAttaching={false}
          inputText={inputText}
          attachments={[]}
          attachmentDirectory={undefined}
          sendBlockReason={undefined}
          attachmentAccept='image/png'
          attachmentInputSupported
          status='ready'
          formattedCancelKeyCombination='⇧⌘⌫'
          treeService={undefined}
          chats={[]}
          setDraftText={noop}
          acpAgentId='codex'
          acpSessionData={session}
          fileInputReference={{ current: null }}
          containerReference={{ current: null }}
          focusEditorRef={{ current: undefined }}
          addContextChipsRef={{ current: undefined }}
          addContextReferencesRef={{ current: undefined }}
          handleSubmit={asyncNoop}
          handleCancelClick={noop}
          handleDragOver={noop}
          handleDragLeave={noop}
          handleDrop={asyncNoop}
          handlePaste={() => false}
          handleFileSelect={noop}
          handleFileChange={noop}
          handleAddImage={noop}
          onScreenshotAction={noop}
          handleTextareaBlur={noop}
          removeAttachment={noop}
        />
      </TooltipProvider>
    );
    const view = render(element(acpSessionData));
    return {
      ...view,
      rerenderWith: (session: AcpSessionData): void => {
        view.rerender(element(session));
      },
    };
  };

  it('keeps one editor scroll region above controls that take layout space', () => {
    const view = renderComposer('', codexSession);
    const editorContent = view.container.querySelector('.tiptap')?.parentElement;
    const editorScroller = editorContent?.parentElement;
    const bar = view.container.querySelector('[data-slot=composer-bar]');

    expect(editorScroller).toHaveClass('overflow-y-auto', 'max-h-[min(12rem,30cqh)]');
    expect(editorContent).not.toHaveClass('overflow-y-auto');
    expect(bar?.parentElement).toBe(editorScroller?.parentElement);
    expect(bar).not.toHaveClass('absolute');
  });

  it('chips a restored $skill once the agent advertises it, without changing the draft text', async () => {
    execution.current = { kind: 'acp', hostId: 'desktop', agentId: 'codex' };
    const view = renderComposer('Make a render of this using $imagegen', codexSession);

    await vi.waitFor(() => {
      expect(view.container.querySelector('.ProseMirror')).toHaveTextContent('Make a render of this using $imagegen');
    });
    /* A chip is the only thing in the editor that draws an icon. */
    expect(view.container.querySelector('.ProseMirror svg')).toBeNull();

    view.rerenderWith({ ...codexSession, commands: [{ name: '$imagegen', description: 'Generate images' }] });

    await vi.waitFor(() => {
      expect(view.container.querySelector('.ProseMirror svg')).not.toBeNull();
    });
    expect(view.container.querySelector('.ProseMirror')).toHaveTextContent('Make a render of this using $imagegen');
  });
});
