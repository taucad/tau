import '#styles/global.css';
import { createRef } from 'react';
import type { ComponentProps } from 'react';
import { act, cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { page } from 'vitest/browser';
import { TooltipProvider } from '@taucad/ui/components/tooltip';
import { Button } from '@taucad/ui/components/button';
import type { Ask } from '@taucad/chat';
import { kernelConfigurations } from '@taucad/types/constants';
import { storedRef } from '#utils/attachment.test-utils.js';

let dictationAvailable = false;
let transcription: ReturnType<typeof Promise.withResolvers<string>> | undefined;
let recordLevel: ((level: number) => void) | undefined;
let microphonePermission: ReturnType<typeof Promise.withResolvers<void>> | undefined;
vi.doMock('#components/dictation/dictation-client.js', () => ({
  fetchDictationStatus: async () => ({ available: dictationAvailable }),
  transcribeDictation: async () => transcription?.promise ?? 'Make the corners round.',
}));
vi.doMock('#components/dictation/dictation-capture.js', () => ({
  captureDictation: async ({ onLevel }: { onLevel: (level: number) => void }) => {
    await microphonePermission?.promise;
    recordLevel = onLevel;
    return { finish: async () => new Blob([], { type: 'audio/wav' }), cancel: () => undefined };
  },
}));

vi.doMock('#hooks/active-chat-provider.js', () => ({
  useActiveChatSession: () => undefined,
  useChatComposer: () => ({
    kernel: { kernel: kernelConfigurations.find((kernel) => kernel.id === 'manifold') },
    execution: { execution: { kind: 'tau', model: 'm' } },
    contextUsage: undefined,
  }),
}));
vi.doMock('@taucad/ui/components/keyboard', () => ({
  useKeybinding: () => ({ formattedKeyCombination: '⌘.' }),
}));
vi.doMock('#hooks/use-skills-catalog.js', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  useSkillsCatalog: () => [],
  useSkillsCatalogState: () => ({ commands: [], prompt: [], status: 'ready', retry: () => undefined }),
}));
vi.doMock('#hooks/use-cad-agent-config.js', () => ({
  useAgentHostPlacements: () => ({ targets: [], loading: false }),
}));
vi.doMock('#hooks/use-file-manager.js', () => ({
  useFileManager: () => undefined,
  useOptionalFileManager: () => undefined,
}));
vi.doMock('#components/chat/chat-agent-sheet.js', () => ({
  ghostPillClass: 'h-7 rounded-full px-2.5 font-normal text-muted-foreground hover:text-foreground',
  ChatAgentSheet: () => (
    <Button variant='ghost' size='sm' className='h-7 min-w-0 shrink'>
      <span data-slot='trigger-model' className='truncate'>
        Haiku 5.5
      </span>
    </Button>
  ),
}));
vi.doMock('#components/chat/chat-kernel-selector.js', () => ({
  ChatKernelSelector: ({
    children,
  }: {
    readonly children: (props: { selectedKernel: (typeof kernelConfigurations)[number] }) => React.ReactNode;
  }): React.ReactNode => children({ selectedKernel: kernelConfigurations.find((kernel) => kernel.id === 'manifold')! }),
}));
vi.doMock('#components/icons/svg-icon.js', () => ({ SvgIcon: () => <span className='size-4' /> }));
vi.doMock('#components/files/file-link.js', () => ({
  FileLink: ({ children }: { readonly children: React.ReactNode }) => <span>{children}</span>,
}));

const { ChatTextareaDesktop } = await import('#components/chat/chat-textarea-desktop.js');
const { QuestionCard } = await import('#components/chat/question-card.js');
const { ChatTextareaSkeleton } = await import('#components/chat/chat-textarea-skeleton.js');
type ComposerProps = ComponentProps<typeof ChatTextareaDesktop>;
const noop = (): void => undefined;
const asyncNoop = async (): Promise<void> => undefined;
const image = storedRef({ hash: '1'.repeat(64), mediaType: 'image/png' });
const pdf = storedRef({ hash: '2'.repeat(64), mediaType: 'application/pdf', filename: 'spec.pdf' });
const scenarios = [
  { name: 'empty', props: {} },
  { name: 'single line', props: { inputText: 'Build a bracket' } },
  { name: 'multiline', props: { inputText: 'Build a bracket\nWith two holes\nAnd rounded corners' } },
  { name: 'scrolling text', props: { inputText: 'Another line\n'.repeat(30) } },
  {
    name: 'context chip',
    props: {
      inputText: 'Use $imagegen',
      acpAgentId: 'codex',
      acpSessionData: {
        type: 'acp-session',
        id: 'session',
        agentId: 'codex',
        configOptions: [],
        commands: [{ name: '$imagegen', description: 'Generate images' }],
      },
    },
  },
  { name: 'image', props: { attachments: [image] } },
  { name: 'document', props: { attachments: [pdf] } },
  { name: 'mixed attachments', props: { attachments: [image, pdf], inputText: 'Use these references' } },
  { name: 'overflowing attachments', props: { attachments: Array.from({ length: 8 }, () => image) } },
  { name: 'blocked attachment', props: { attachments: [pdf], sendBlockReason: 'This model cannot read PDFs' } },
  { name: 'attaching', props: { isAttaching: true } },
  { name: 'unavailable', props: { isSubmitDisabled: true, attachmentInputSupported: false } },
  { name: 'submitting', props: { isSubmitting: true, status: 'submitted', inputText: 'Build a bracket' } },
  { name: 'streaming', props: { status: 'streaming' } },
  { name: 'resume', props: { canResume: true } },
  { name: 'image drag', props: { dragKind: 'image' } },
  { name: 'viewer drag', props: { dragKind: 'viewer' } },
  { name: 'reference drag', props: { dragKind: 'reference' } },
  { name: 'new project', props: { enableContextActions: false, enableKernelSelector: false } },
] satisfies Array<{ name: string; props: Partial<ComposerProps> }>;

const renderComposer = (props: Partial<ComposerProps>) => {
  const containerReference = createRef<HTMLDivElement>();
  const view = render(
    <TooltipProvider>
      <section aria-label='Composer' className='p-4'>
        <ChatTextareaDesktop
          enableAutoFocus={false}
          dragKind={undefined}
          isSubmitting={false}
          isAttaching={false}
          inputText=''
          attachments={[]}
          attachmentDirectory={undefined}
          sendBlockReason={undefined}
          attachmentAccept='image/png,application/pdf'
          attachmentInputSupported
          status='ready'
          formattedCancelKeyCombination='⌘.'
          treeService={undefined}
          chats={[]}
          setDraftText={noop}
          fileInputReference={createRef<HTMLInputElement>()}
          containerReference={containerReference}
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
          {...props}
        />
      </section>
    </TooltipProvider>,
  );
  return { ...view, containerReference };
};

afterEach(() => {
  cleanup();
  dictationAvailable = false;
  transcription = undefined;
  recordLevel = undefined;
  microphonePermission = undefined;
  globalThis.document.documentElement.classList.remove('light', 'dark', 'black', 'high-contrast');
});

for (const width of [320, 600]) {
  for (const mode of ['main', 'edit'] as const) {
    describe(`${width}px ${mode} composer`, () => {
      it.each(scenarios)('should preserve top padding and bottom inset with $name', async ({ name, props }) => {
        await page.viewport(width, 720);
        globalThis.document.documentElement.classList.toggle('dark', width === 600);
        const { containerReference } = renderComposer({ ...props, mode });
        const editor = await screen.findByRole('textbox');
        const container = containerReference.current!;
        const bounds = container.getBoundingClientRect();
        const style = getComputedStyle(container);
        const firstContent = screen.queryByLabelText('Attachments') ?? editor;
        const action = screen.getByRole('button', { name: /^(Send|Stop|Resume)$/u });
        const top = firstContent.getBoundingClientRect().top - bounds.top - Number.parseFloat(style.borderTopWidth);
        const bottom =
          bounds.bottom - action.getBoundingClientRect().bottom - Number.parseFloat(style.borderBottomWidth);

        expect(top).toBeCloseTo(12, 1);
        expect(bottom).toBeCloseTo(8, 1);
        if (mode === 'main' && action.getAttribute('aria-label') !== 'Resume') {
          const right = bounds.right - action.getBoundingClientRect().right - Number.parseFloat(style.borderRightWidth);
          expect(bottom).toBeCloseTo(right, 1);
        }
        expect(container.scrollWidth).toBe(container.clientWidth);
        if (mode === 'main' && ['empty', 'mixed attachments', 'blocked attachment', 'context chip'].includes(name)) {
          await page.screenshot({
            element: screen.getByRole('region', { name: 'Composer' }),
            path: `../../../../../out/test-results/composer/${width}-${name.replaceAll(' ', '-')}.png`,
          });
        }
      });

      it('should match the empty skeleton height and retain padding on focus', async () => {
        await page.viewport(width, 720);
        const { containerReference } = renderComposer({ mode });
        const editor = page.getByRole('textbox');
        await editor.click();
        const { height } = containerReference.current!.getBoundingClientRect();
        cleanup();
        const { container } = render(<ChatTextareaSkeleton />);
        expect(container.firstElementChild!.getBoundingClientRect().height).toBe(height);
      });
    });
  }
}

describe('composer bar resize geometry', () => {
  it('refits after an actual loading font completes', async () => {
    await page.viewport(800, 720);
    await document.fonts.ready;
    const font = new FontFace('ComposerLoadingFixture', 'url(/fonts/GeistMono-Variable.woff2?composer-loading)');
    document.fonts.add(font);
    const style = document.createElement('style');
    style.textContent = '[data-slot=trigger-model] { font-family: ComposerLoadingFixture, monospace; }';
    document.head.append(style);
    const scrollWidth = Object.getOwnPropertyDescriptor(Element.prototype, 'scrollWidth')?.get;
    if (!scrollWidth) {
      throw new Error('The browser native scrollWidth getter is unavailable.');
    }
    const fontReads: number[] = [];
    const measurement = vi.spyOn(Element.prototype, 'scrollWidth', 'get').mockImplementation(function (this: Element) {
      const width = Number(scrollWidth.call(this));
      if (
        this instanceof HTMLElement &&
        this.dataset['slot'] === 'trigger-model' &&
        new Error('Composer geometry read').stack?.includes('refitWhenFontsLoad')
      ) {
        fontReads.push(width);
      }
      return width;
    });
    try {
      const loaded = font.load();
      expect(document.fonts.status).toBe('loading');
      const { container } = renderComposer({ enableKernelSelector: true });
      await loaded;
      await document.fonts.ready;
      await Promise.resolve();
      expect(font.status).toBe('loaded');
      expect(fontReads.length).toBeGreaterThan(0);
      const model = container.querySelector<HTMLElement>('[data-slot=trigger-model]')!;
      expect(model.scrollWidth).toBeLessThanOrEqual(model.clientWidth);
    } finally {
      measurement.mockRestore();
      style.remove();
      document.fonts.delete(font);
    }
  });

  it('does not refit unchanged geometry for fonts already loaded before mounting', async () => {
    await page.viewport(800, 720);
    const warm = renderComposer({ enableKernelSelector: true });
    await document.fonts.ready;
    warm.unmount();
    await document.fonts.ready;
    expect(document.fonts.status).toBe('loaded');
    const scrollWidth = Object.getOwnPropertyDescriptor(Element.prototype, 'scrollWidth')?.get;
    if (!scrollWidth) {
      throw new Error('The browser native scrollWidth getter is unavailable.');
    }
    const reads: Array<{ stack: string; width: number; barWidth: number; text: string }> = [];
    const measurement = vi.spyOn(Element.prototype, 'scrollWidth', 'get').mockImplementation(function (this: Element) {
      const width = Number(scrollWidth.call(this));
      if (this instanceof HTMLElement && this.dataset['slot'] === 'trigger-model') {
        reads.push({
          stack: new Error('Composer geometry read').stack ?? '',
          width,
          barWidth: this.closest('[data-slot=composer-bar]')!.getBoundingClientRect().width,
          text: this.textContent,
        });
      }
      return width;
    });
    try {
      const { container } = renderComposer({ enableKernelSelector: true });
      const model = container.querySelector<HTMLElement>('[data-slot=trigger-model]')!;
      const bar = container.querySelector<HTMLElement>('[data-slot=composer-bar]')!;
      const initial = { text: model.textContent, width: bar.getBoundingClientRect().width };
      expect(reads.length).toBeGreaterThan(0);
      await document.fonts.ready;
      await Promise.resolve();
      expect(document.fonts.status).toBe('loaded');
      expect({ text: model.textContent, width: bar.getBoundingClientRect().width }).toEqual(initial);
      const fontReads = reads.filter((read) => read.stack.includes('refitWhenFontsLoad'));
      for (const read of fontReads) {
        expect({ text: read.text, width: read.barWidth }).toEqual(initial);
        expect(read.width).toBe(reads[0]!.width);
      }
      expect(fontReads).toHaveLength(0);
    } finally {
      measurement.mockRestore();
    }
  });

  it('restores kernel text when widened and refits changed model text at the same width', async () => {
    await page.viewport(320, 720);
    const { container } = renderComposer({ enableKernelSelector: true });
    const bar = container.querySelector<HTMLElement>('[data-slot=composer-bar]');
    const model = container.querySelector<HTMLElement>('[data-slot=trigger-model]');
    if (!bar || !model) {
      throw new Error('The rendered composer bar is missing.');
    }
    // This suite substitutes the model control; these are real CSS/layout assertions,
    // not acceptance of a product model/level selection gesture.
    model.textContent = 'A sufficiently long current model name';
    await expect.poll(() => Object.hasOwn(bar.dataset, 'hideKernel')).toBe(true);
    await page.viewport(800, 720);
    await expect.poll(() => Object.hasOwn(bar.dataset, 'hideKernel')).toBe(false);
    expect(Object.hasOwn(bar.dataset, 'hideMode')).toBe(false);
    expect(Object.hasOwn(bar.dataset, 'hideLevel')).toBe(false);
    expect(model.scrollWidth).toBeLessThanOrEqual(model.clientWidth);
    await page.viewport(320, 720);
    await expect.poll(() => Object.hasOwn(bar.dataset, 'hideKernel')).toBe(true);
    model.textContent = 'Short';
    await expect.poll(() => Object.hasOwn(bar.dataset, 'hideKernel')).toBe(false);
    expect(model.scrollWidth).toBeLessThanOrEqual(model.clientWidth);
  });
});

describe('dictation recording and transcription', () => {
  it.each([
    { width: 800, theme: 'light', status: 'streaming' },
    { width: 800, theme: 'dark', status: 'streaming' },
    { width: 320, theme: 'light', status: 'streaming' },
    { width: 800, theme: 'light', status: 'ready' },
  ] as const)(
    'should record and transcribe at $width in $theme mode while $status',
    async ({ width, theme, status }) => {
      await page.viewport(width, 480);
      document.documentElement.classList.toggle('dark', theme === 'dark');
      dictationAvailable = true;
      transcription = Promise.withResolvers<string>();
      const cancelChat = vi.fn();
      const submit = vi.fn().mockResolvedValue(undefined);
      const { containerReference } = renderComposer({
        status,
        inputText: 'Keep working on the bracket.',
        handleCancelClick: cancelChat,
        handleSubmit: submit,
      });
      await page.getByRole('button', { name: 'Dictate', exact: true }).click();
      await expect.element(page.getByRole('button', { name: 'Stop dictation', exact: true })).toBeVisible();
      act(() => {
        // Deterministic microphone samples; the real composer and dictation hook render them.
        for (let index = 0; index < 100; index++) {
          const peak = Math.max(0, Math.sin(index * 0.31) + Math.sin(index * 0.79) * 0.6 - 0.6);
          recordLevel?.(index > 45 ? peak * 0.12 : 0);
        }
      });
      const waveform = screen.getByRole('img', { name: 'Microphone waveform' });
      const cancelRecording = screen.getByRole('button', { name: 'Cancel dictation' });
      const stopRecording = screen.getByRole('button', { name: 'Stop dictation' });
      expect(waveform.getBoundingClientRect().width).toBeGreaterThan(width / 2);
      expect(waveform.getBoundingClientRect().left).toBeGreaterThan(cancelRecording.getBoundingClientRect().right);
      expect(waveform.getBoundingClientRect().right).toBeLessThan(stopRecording.getBoundingClientRect().left);
      expect(containerReference.current!.scrollWidth).toBe(containerReference.current!.clientWidth);
      await page.getByRole('textbox').click();
      await page.screenshot({
        element: screen.getByRole('region', { name: 'Composer' }),
        path: `../../../../../out/test-results/composer/dictation-${width}-${theme}-${status}.png`,
      });
      await page.getByRole('button', { name: 'Stop dictation', exact: true }).click();
      await expect.element(page.getByRole('status', { name: 'Transcribing', exact: true })).toBeVisible();
      expect(screen.queryByRole('img', { name: 'Microphone waveform' })).toBeNull();
      await expect.element(page.getByRole('button', { name: 'Cancel dictation' })).toBeEnabled();
      await expect
        .element(page.getByRole('button', { name: 'Transcribing', exact: true }))
        .toHaveAttribute('aria-busy', 'true');
      await page.getByRole('textbox').click();
      await page.screenshot({
        element: screen.getByRole('region', { name: 'Composer' }),
        path: `../../../../../out/test-results/composer/transcribing-${width}-${theme}-${status}.png`,
      });
      await act(async () => {
        transcription?.resolve('Make the corners round.');
      });
      await expect
        .element(page.getByRole('textbox'))
        .toHaveTextContent('Keep working on the bracket. Make the corners round.');
      expect(submit).not.toHaveBeenCalled();
      expect(cancelChat).not.toHaveBeenCalled();
      if (status === 'streaming') {
        await page.getByRole('button', { name: 'Stop', exact: true }).click();
        expect(cancelChat).toHaveBeenCalledOnce();
      }
    },
  );
});

describe('question dictation', () => {
  it.each(
    ['light', 'dark', 'black', 'high-contrast'].flatMap((theme) =>
      [320, 800].flatMap((width) =>
        ['text', 'options', 'tray', 'multiline'].map((variant) => ({
          theme,
          width,
          variant,
          sendWhileRecording: variant !== 'options',
        })),
      ),
    ),
  )(
    'should finish dictation at $width in $theme mode with $variant (send: $sendWhileRecording)',
    async ({ width, theme, variant, sendWhileRecording }) => {
      await page.viewport(width, 600);
      document.documentElement.classList.remove('light', 'dark', 'black', 'high-contrast');
      document.documentElement.classList.add(theme);
      document.documentElement.classList.toggle('dark', theme !== 'light');
      dictationAvailable = true;
      transcription = Promise.withResolvers<string>();
      microphonePermission = Promise.withResolvers<void>();
      const onAnswer = vi.fn();
      const onHold = vi.fn();
      const ask: Ask = {
        id: 'ask_material',
        callId: 'call_material',
        source: 'tau',
        askedAt: '2026-10-13T20:00:00.000Z',
        deadline: variant === 'options' ? '2026-10-13T20:02:00.000Z' : null,
        questions: [
          {
            id: 'material',
            question: 'What material and finish should the bracket use?',
            allowsText: true,
            options: variant === 'options' ? [{ label: 'Aluminium' }, { label: 'Stainless steel' }] : [],
            ...(variant === 'options' ? { recommended: 0 } : {}),
          },
        ],
      };
      render(
        <TooltipProvider>
          <section aria-label='Question reply' className='p-4'>
            <QuestionCard
              isFlat={variant === 'tray'}
              ask={ask}
              answers={undefined}
              now={Date.parse(ask.askedAt)}
              onAnswer={onAnswer}
              onHold={onHold}
              onDecline={noop}
            />
          </section>
        </TooltipProvider>,
      );
      if (variant === 'options') {
        await page.getByRole('button', { name: 'C, Something else: answer in your own words' }).click();
      }
      const box = page.getByRole('textbox', { name: 'Your answer' });
      const region = screen.getByRole('region', { name: 'Question reply' });
      await expect.element(page.getByRole('button', { name: 'Dictate', exact: true })).toBeVisible();
      const draft =
        variant === 'multiline' ? 'Aluminium.\nRound the corners.\nLeave the mounting holes clear.' : 'Aluminium.';
      await box.fill(draft);
      const reply = screen.getByRole('group', { name: 'Answer input' });
      const idleHeight = reply.getBoundingClientRect().height;
      const expectAlignedActions = (label: string): void => {
        const action = screen.getByRole('button', { name: label }).getBoundingClientRect();
        const send = screen.getByRole('button', { name: 'Send answer' }).getBoundingClientRect();
        expect(action.top).toBe(send.top);
        expect(action.bottom).toBe(send.bottom);
        expect(action.right).toBeLessThanOrEqual(send.left);
      };
      const idleSend = screen.getByRole('button', { name: 'Send answer' }).getBoundingClientRect();
      expectAlignedActions('Dictate');
      if (variant !== 'multiline') {
        const bounds = reply.getBoundingClientRect();
        expect(idleSend.top + idleSend.height / 2).toBe(bounds.top + bounds.height / 2);
      }
      await page.screenshot({
        element: region,
        path: `../../../../../out/test-results/composer/question-idle-${width}-${theme}-${variant}.png`,
      });
      await page.getByRole('button', { name: 'Dictate', exact: true }).click();
      expect(onHold).toHaveBeenCalled();
      await expect.element(page.getByRole('status', { name: 'Requesting microphone…' })).toBeVisible();
      await expect.element(page.getByRole('button', { name: 'Send answer' })).toHaveAttribute('aria-disabled', 'true');
      expectAlignedActions('Requesting microphone…');
      const requesting = screen.getByRole('status', { name: 'Requesting microphone…' });
      expect(requesting.scrollHeight).toBeLessThanOrEqual(requesting.clientHeight);
      expect(reply.getBoundingClientRect().height).toBe(idleHeight);
      await page.screenshot({
        element: region,
        path: `../../../../../out/test-results/composer/question-requesting-${width}-${theme}-${variant}.png`,
      });
      await act(async () => {
        microphonePermission?.resolve();
      });
      await expect.element(page.getByRole('button', { name: 'Stop dictation' })).toBeVisible();
      act(() => {
        for (let index = 0; index < 100; index++) {
          recordLevel?.(Math.max(0, Math.sin(index * 0.31)) * 0.12);
        }
      });
      await expect.element(page.getByRole('button', { name: 'Send answer' })).toHaveAttribute('aria-disabled', 'false');
      expect(reply.getBoundingClientRect().height).toBe(idleHeight);
      const cancel = screen.getByRole('button', { name: 'Cancel dictation' }).getBoundingClientRect();
      const stop = screen.getByRole('button', { name: 'Stop dictation' }).getBoundingClientRect();
      const waveform = screen.getByRole('img', { name: 'Microphone waveform' }).getBoundingClientRect();
      const send = screen.getByRole('button', { name: 'Send answer' }).getBoundingClientRect();
      expect(cancel.top).toBe(stop.top);
      expect(send.top).toBe(stop.top);
      expect(send.left).toBeGreaterThanOrEqual(stop.right);
      expect(waveform.left).toBeGreaterThanOrEqual(cancel.right);
      expect(waveform.right).toBeLessThanOrEqual(stop.left);
      await page.screenshot({
        element: region,
        path: `../../../../../out/test-results/composer/question-recording-${width}-${theme}-${variant}.png`,
      });
      await page.getByRole('button', { name: sendWhileRecording ? 'Send answer' : 'Stop dictation' }).click();
      await expect.element(page.getByRole('status', { name: 'Transcribing', exact: true })).toBeVisible();
      expect(reply.getBoundingClientRect().height).toBe(idleHeight);
      await page.screenshot({
        element: region,
        path: `../../../../../out/test-results/composer/question-transcribing-${width}-${theme}-${variant}.png`,
      });
      expect(region.scrollWidth).toBe(region.clientWidth);
      await expect.element(page.getByRole('button', { name: 'Send answer' })).toHaveAttribute('aria-disabled', 'true');
      expect(onAnswer).not.toHaveBeenCalled();
      expectAlignedActions('Transcribing');
      const progress = screen.getByRole('status', { name: 'Transcribing' });
      const microphone = screen.getByRole('button', { name: 'Transcribing' });
      expect(progress.getBoundingClientRect().right).toBeLessThanOrEqual(microphone.getBoundingClientRect().left);
      await act(async () => {
        transcription?.resolve('Use a brushed finish.');
      });
      if (sendWhileRecording) {
        expect(onAnswer).toHaveBeenCalledExactlyOnceWith('material', { text: `${draft} Use a brushed finish.` });
        return;
      }
      await expect.element(box).toHaveValue(`${draft} Use a brushed finish.`);
      expect(onAnswer).not.toHaveBeenCalled();
      expectAlignedActions('Dictate');
      await box.fill('Aluminium. Use a brushed finish on both sides.');
      await page.getByRole('button', { name: 'Send answer' }).click();
      expect(onAnswer).toHaveBeenCalledExactlyOnceWith('material', {
        text: 'Aluminium. Use a brushed finish on both sides.',
      });
    },
  );
});
