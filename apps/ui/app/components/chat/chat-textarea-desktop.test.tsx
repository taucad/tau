// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { AcpSessionData } from '@taucad/chat';
import { kernelConfigurations } from '@taucad/types/constants';
import { TooltipProvider } from '@taucad/ui/components/tooltip';
import type { ChatComposerContextValue } from '#hooks/active-chat-provider.js';

const manifoldKernel = kernelConfigurations.find((k) => k.id === 'manifold')!;
const execution: { current: ChatComposerContextValue['execution']['execution'] } = {
  current: { kind: 'tau', model: 'm' },
};
const setActiveExecution = vi.fn();

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
  ChatAgentSheet: () => (
    <button type='button' data-slot='agent-trigger'>
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

const { ChatTextareaBar, acpCommandToSlashCommand } = await import('#components/chat/chat-textarea-desktop.js');

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
