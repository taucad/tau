// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { captureDictation } from '#components/chat/dictation-capture.js';
import type { transcribeDictation } from '#components/chat/dictation-client.js';
import type { AcpSessionData } from '@taucad/chat';
import { kernelConfigurations } from '@taucad/types/constants';
import { TooltipProvider } from '@taucad/ui/components/tooltip';
import type { ChatComposerContextValue } from '#hooks/active-chat-provider.js';
import type { AgentHostPlacementTarget } from '#lib/agent-host-placement.js';
import type { AgentConfig } from '#components/chat/use-agent-config.js';

const dictationDependencies = vi.hoisted(() => ({
  available: false,
  capture: vi.fn<typeof captureDictation>(),
  transcribe: vi.fn<typeof transcribeDictation>(),
}));
vi.mock('#components/chat/dictation-capture.js', () => ({ captureDictation: dictationDependencies.capture }));
vi.mock('#components/chat/dictation-client.js', () => ({
  fetchDictationStatus: async () => ({ available: dictationDependencies.available }),
  transcribeDictation: dictationDependencies.transcribe,
}));

afterEach(() => {
  vi.restoreAllMocks();
});

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
  ChatAgentSheet: ({ agentConfig }: { readonly agentConfig: AgentConfig }) => (
    <button
      type='button'
      data-slot='agent-trigger'
      data-reasoning={agentConfig.options.find((option) => option.category === 'thought_level')?.currentValue}
    >
      <span data-slot='trigger-model'>Agent and model</span>
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

const catalogHealth = vi.hoisted(() => ({ status: 'ready' as 'ready' | 'closed', retry: vi.fn() }));
vi.mock('#hooks/use-skills-catalog.js', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  useSkillsCatalog: () => [],
  useSkillsCatalogState: () => ({ commands: [], prompt: [], status: catalogHealth.status, retry: catalogHealth.retry }),
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
  beforeEach(() => {
    dictationDependencies.available = false;
    catalogHealth.status = 'ready';
    catalogHealth.retry.mockClear();
  });
  const renderComposer = (
    inputText: string,
    acpSessionData: AcpSessionData,
    options: { canResume?: boolean; handleSubmit?: (text?: string) => Promise<void>; useTauSkills?: boolean } = {},
  ) => {
    const { canResume = false, handleSubmit = asyncNoop } = options;
    const element = (session: AcpSessionData): React.JSX.Element => (
      <TooltipProvider>
        <ChatTextareaDesktop
          enableAutoFocus={false}
          dragKind={undefined}
          isSubmitting={false}
          isAttaching={false}
          canResume={canResume}
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
          acpAgentId={options.useTauSkills ? undefined : 'codex'}
          acpSessionData={session}
          fileInputReference={{ current: null }}
          containerReference={{ current: null }}
          focusEditorRef={{ current: undefined }}
          addContextChipsRef={{ current: undefined }}
          addContextReferencesRef={{ current: undefined }}
          handleSubmit={handleSubmit}
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

  it('should show skill recovery in the functional composer after catalog closure', async () => {
    catalogHealth.status = 'closed';
    renderComposer('Keep this draft', codexSession, { useTauSkills: true });
    expect(screen.getByText('Skill updates unavailable')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Retry skill updates' }));
    expect(catalogHealth.retry).toHaveBeenCalledOnce();
    expect(screen.getByRole('textbox')).toHaveTextContent('Keep this draft');
  });

  it('should offer Resume through the full composer without the empty-message refusal', () => {
    renderComposer('', codexSession, { canResume: true });

    const resume = screen.getByRole('button', { name: 'Resume' });
    expect(resume).toHaveTextContent('Resume');
    expect(resume).toHaveAttribute('aria-disabled', 'false');
  });

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
  it('should place the microphone beside Send and send the final transcript exactly once after recording', async () => {
    const createRange = document.createRange.bind(document);
    vi.spyOn(document, 'createRange').mockImplementation(() =>
      Object.assign(createRange(), {
        getClientRects: () => [],
        getBoundingClientRect: () => new DOMRect(),
      }),
    );
    const microphone = Promise.withResolvers<{ finish: () => Promise<Blob>; cancel: () => void }>();
    const transcription = Promise.withResolvers<string>();
    let preview: ((text: string) => void) | undefined;
    dictationDependencies.available = true;
    dictationDependencies.capture.mockReturnValue(microphone.promise);
    dictationDependencies.transcribe.mockImplementation(async (_wav, options) => {
      preview = options.onPreview;
      return transcription.promise;
    });
    const submit = vi.fn().mockResolvedValue(undefined);
    const view = renderComposer('Existing draft.', codexSession, { handleSubmit: submit });
    const dictate = await screen.findByRole('button', { name: 'Dictate' });
    expect(
      [...view.container.querySelectorAll('[data-slot=composer-right] button')]
        .slice(-2)
        .map((button) => button.ariaLabel),
    ).toEqual(['Dictate', 'Send']);
    await userEvent.click(dictate);
    await screen.findByRole('button', { name: 'Requesting microphone…' });
    await userEvent.click(screen.getByRole('button', { name: 'Send' }));
    act(() => {
      screen.getByRole('textbox').focus();
    });
    await userEvent.keyboard('{Enter}');
    expect(submit).not.toHaveBeenCalled();
    await act(async () => {
      microphone.resolve({ finish: async () => new Blob([], { type: 'audio/wav' }), cancel: noop });
      await microphone.promise;
    });
    await screen.findByRole('button', { name: 'Stop dictation' });
    await userEvent.click(screen.getByRole('button', { name: 'Send' }));
    await waitFor(() => {
      expect(preview).toBeDefined();
    });
    act(() => {
      preview?.('Build a');
    });
    expect(view.container.querySelector('[data-slot=dictation-transcript]')).toHaveTextContent('Build a');
    expect(submit).not.toHaveBeenCalled();
    expect(screen.getByRole('button', { name: 'Send' })).toHaveAttribute('aria-disabled', 'true');
    await act(async () => {
      transcription.resolve('Build a bracket.');
    });
    await waitFor(() => {
      expect(submit).toHaveBeenCalledExactlyOnceWith('Existing draft. Build a bracket.');
    });
  });
});

describe('composer bar measurement lifecycle', () => {
  const observers = new Map<Element, { callback: ResizeObserverCallback; observer: ResizeObserver }>();
  let width = 200;
  let height = 40;
  let requiredWidth = 260;
  let reads: string[] = [];
  let fonts: ReturnType<typeof Promise.withResolvers<FontFaceSet>>;
  let originalFonts: PropertyDescriptor | undefined;

  beforeEach(() => {
    width = 200;
    height = 40;
    requiredWidth = 260;
    reads = [];
    observers.clear();
    originalFonts = Object.getOwnPropertyDescriptor(document, 'fonts');
    fonts = Promise.withResolvers<FontFaceSet>();
    Object.defineProperty(document, 'fonts', { configurable: true, value: { ready: fonts.promise } });
    vi.stubGlobal(
      'ResizeObserver',
      class implements ResizeObserver {
        readonly #callback: ResizeObserverCallback;
        public constructor(callback: ResizeObserverCallback) {
          this.#callback = callback;
        }
        public observe(target: Element): void {
          observers.set(target, { callback: this.#callback, observer: this });
        }
        public unobserve(target: Element): void {
          observers.delete(target);
        }
        public disconnect(): void {
          for (const [target, entry] of observers) {
            if (entry.observer === this) {
              observers.delete(target);
            }
          }
        }
      },
    );
    vi.spyOn(HTMLElement.prototype, 'scrollWidth', 'get').mockImplementation(function (this: HTMLElement) {
      if (this.dataset['slot'] !== 'trigger-model') {
        return 0;
      }
      const bar = this.closest('[data-slot=composer-bar]')!;
      reads.push(['kernel', 'mode', 'level'].filter((label) => bar.hasAttribute(`data-hide-${label}`)).join(','));
      return requiredWidth;
    });
    vi.spyOn(HTMLElement.prototype, 'clientWidth', 'get').mockImplementation(function (this: HTMLElement) {
      if (this.dataset['slot'] !== 'trigger-model') {
        return 0;
      }
      const bar = this.closest('[data-slot=composer-bar]')!;
      return width + ['kernel', 'mode', 'level'].filter((label) => bar.hasAttribute(`data-hide-${label}`)).length * 30;
    });
  });

  afterEach(() => {
    if (originalFonts) {
      Object.defineProperty(document, 'fonts', originalFonts);
    }
    vi.unstubAllGlobals();
  });

  const notify = (bar: Element): void => {
    const current = observers.get(bar);
    if (!current) {
      throw new Error('The actual composer observer is missing.');
    }
    current.callback(
      [
        {
          target: bar,
          contentRect: new DOMRectReadOnly(0, 0, width, height),
          borderBoxSize: [],
          contentBoxSize: [],
          devicePixelContentBoxSize: [],
        },
      ],
      current.observer,
    );
  };

  it('should fit labels in order and restore them when widened', () => {
    const { container } = renderBar();
    const bar = container.querySelector<HTMLElement>('[data-slot=composer-bar]')!;
    expect(reads.slice(0, 3)).toEqual(['', 'kernel', 'kernel,mode']);
    act(() => {
      notify(bar);
    });
    width = 400;
    act(() => {
      notify(bar);
    });
    expect(Object.hasOwn(bar.dataset, 'hideKernel')).toBe(false);
    expect(Object.hasOwn(bar.dataset, 'hideMode')).toBe(false);
    expect(Object.hasOwn(bar.dataset, 'hideLevel')).toBe(false);
  });

  it('should refit genuine height and live font changes even when width is unchanged', async () => {
    const { container } = renderBar();
    const bar = container.querySelector<HTMLElement>('[data-slot=composer-bar]')!;
    act(() => {
      notify(bar);
    });
    reads = [];
    height = 60;
    act(() => {
      notify(bar);
    });
    expect(reads.length).toBeGreaterThan(0);
    reads = [];
    requiredWidth = 290;
    await act(async () => {
      fonts.resolve(document.fonts);
      await fonts.promise;
    });
    expect(reads).toEqual(['', 'kernel', 'kernel,mode', 'kernel,mode,level']);
    expect(Object.hasOwn(bar.dataset, 'hideLevel')).toBe(true);
  });

  it.each(['model', 'kernel', 'mode'])('should refit a changed %s label without a resize', async (label) => {
    execution.current = { kind: 'acp', hostId: 'desktop', agentId: 'codex' };
    const { container } = renderBar({ acpSessionData: codexSession });
    const bar = container.querySelector<HTMLElement>('[data-slot=composer-bar]')!;
    act(() => {
      notify(bar);
    });
    reads = [];
    requiredWidth = 290;
    const target =
      label === 'model'
        ? bar.querySelector('[data-slot=trigger-model]')
        : label === 'kernel'
          ? screen.getByRole('button', { name: 'Select kernel (Manifold)' })
          : screen.getByRole('button', { name: 'Mode: Ask for approval' });
    if (!target) {
      throw new Error('The actual composer label is missing.');
    }
    await act(async () => {
      target.append(document.createTextNode(' changed label'));
    });
    expect(reads.length).toBeGreaterThan(0);
    expect(Object.hasOwn(bar.dataset, 'hideLevel')).toBe(true);
  });

  it('should ignore late font completion after the actual bar unmounts', async () => {
    const { unmount } = renderBar();
    unmount();
    reads = [];
    await act(async () => {
      fonts.resolve(document.fonts);
      await fonts.promise;
    });
    expect(reads).toHaveLength(0);
  });
});
