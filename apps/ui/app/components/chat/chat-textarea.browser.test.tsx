import '#styles/global.css';
import { createRef, useRef, useState } from 'react';
import type { ComponentProps } from 'react';
import { act, cleanup, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { commands, page } from 'vitest/browser';
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

declare module 'vitest/internal/browser' {
  // oxlint-disable-next-line typescript/consistent-type-definitions -- Augments the installed browser command registry.
  interface BrowserCommands {
    composerPointer(coarse: boolean): Promise<void>;
  }
}

const { ChatTextareaDesktop } = await import('#components/chat/chat-textarea-desktop.js');
const { QuestionCard } = await import('#components/chat/question-card.js');
const { ChatTextareaSkeleton } = await import('#components/chat/chat-textarea-skeleton.js');
type ComposerProps = ComponentProps<typeof ChatTextareaDesktop>;
const noop = (): void => undefined;
const asyncNoop = async (): Promise<void> => undefined;
/** Lets the microphone's expansion into the stop pill finish, so geometry reads its resting place. */
const settleDictationEntrance = async (): Promise<void> => {
  await Promise.all(
    document
      .getAnimations()
      .filter((animation) => animation.effect?.getComputedTiming().endTime !== Number.POSITIVE_INFINITY)
      .map(async (animation) => animation.finished),
  );
};
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
          expect(right).toBeCloseTo(8, 1);
          expect(bottom).toBeCloseTo(right, 1);
        }
        const addBounds = screen.getByRole('button', { name: 'Add' }).getBoundingClientRect();
        const actionBounds = action.getBoundingClientRect();
        expect((addBounds.top + addBounds.bottom) / 2).toBeCloseTo((actionBounds.top + actionBounds.bottom) / 2);
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
      await settleDictationEntrance();
      act(() => {
        // Deterministic microphone samples; the real composer and dictation hook render them.
        for (let index = 0; index < 100; index++) {
          const peak = Math.max(0, Math.sin(index * 0.31) + Math.sin(index * 0.79) * 0.6 - 0.6);
          recordLevel?.(index > 45 ? Math.max(peak * 0.12, Math.abs(Math.sin(index * 0.9)) * 0.08) : 0);
        }
      });
      const waveform = screen.getByRole('img', { name: 'Microphone waveform' });
      const cancelRecording = screen.getByRole('button', { name: 'Cancel dictation' });
      const stopRecording = screen.getByRole('button', { name: 'Stop dictation' });
      // The microphone expands in place into the stop pill holding the waveform; cancel sits on its left, and
      // the bar's other controls stay where they were.
      expect(stopRecording).toContainElement(waveform);
      expect(cancelRecording.getBoundingClientRect().right).toBeLessThanOrEqual(
        stopRecording.getBoundingClientRect().left,
      );
      // Dictating offers Send even while a turn streams, so the pill's stop square is the only stop.
      expect(screen.queryByRole('button', { name: 'Stop' })).toBeNull();
      expect(stopRecording.getBoundingClientRect().right).toBeLessThanOrEqual(
        screen.getByRole('button', { name: 'Send' }).getBoundingClientRect().left,
      );
      expect(screen.getByRole('button', { name: 'Add' })).toBeVisible();
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

describe('dictation idle waveform', () => {
  /** Pauses the row's batch glide at `time` milliseconds and waits for that frame to paint. */
  const seekGlide = async (row: HTMLElement, time: number): Promise<CSSAnimation> => {
    const [glide] = row.getAnimations() as CSSAnimation[];
    expect(glide, 'the bar row should glide between batches').toBeDefined();
    glide!.pause();
    glide!.currentTime = time;
    await new Promise((resolve) => {
      requestAnimationFrame(resolve);
    });
    return glide!;
  };

  it.each(['light', 'dark'] as const)(
    'should scroll a flat dotted line while the microphone is silent in %s mode',
    async (theme) => {
      await page.viewport(800, 480);
      document.documentElement.classList.toggle('dark', theme === 'dark');
      dictationAvailable = true;
      transcription = Promise.withResolvers<string>();
      renderComposer({ status: 'ready', inputText: '' });
      await page.getByRole('button', { name: 'Dictate', exact: true }).click();
      await expect.element(page.getByRole('button', { name: 'Stop dictation', exact: true })).toBeVisible();
      await settleDictationEntrance();
      act(() => {
        // A silent microphone still delivers a zero-level batch every 100ms.
        for (let index = 0; index < 40; index++) {
          recordLevel?.(0);
        }
      });
      const waveform = screen.getByRole('img', { name: 'Microphone waveform' });
      // The waveform's one row of bars.
      const bars = [...waveform.firstElementChild!.children] as HTMLElement[];
      const row = bars[0]!.parentElement!;
      // Silence stays a flat line of equal dots: no invented amplitude.
      expect(new Set(bars.map((bar) => bar.getBoundingClientRect().height)).size).toBe(1);

      // Four moments within one batch: the line itself travels left, so every captured frame differs.
      const frames: string[] = [];
      const offsets: number[] = [];
      for (const [frame, time] of [0, 25, 50, 75].entries()) {
        // oxlint-disable-next-line no-await-in-loop -- Frames are captured one glide moment at a time.
        await seekGlide(row, time);
        offsets.push(bars.at(-1)!.getBoundingClientRect().left);
        // oxlint-disable-next-line no-await-in-loop -- Frames are captured one glide moment at a time.
        const { base64 } = await page.screenshot({
          element: waveform,
          base64: true,
          path: `../../../../../out/test-results/composer/dictation-idle-${theme}-frame-${frame}.png`,
        });
        frames.push(base64);
      }
      expect(offsets).toEqual(offsets.toSorted((left, right) => right - left));
      expect(new Set(offsets).size).toBe(offsets.length);
      expect(new Set(frames).size).toBe(frames.length);

      // The next batch shifts the levels one slot and restarts the glide, so the row continues seamlessly.
      const finished = await seekGlide(row, 100);
      const before = bars.at(-1)!.getBoundingClientRect().left;
      act(() => {
        recordLevel?.(0);
      });
      const restarted = await seekGlide(row, 0);
      expect(restarted.animationName).not.toBe(finished.animationName);
      expect(bars.at(-2)!.getBoundingClientRect().left).toBeCloseTo(before, 1);
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
      /** At phone width the expanded control may wrap below the draft; elsewhere the reply holds its height. */
      const expectActiveHeight = (): void => {
        const { height } = reply.getBoundingClientRect();
        if (width === 320) {
          expect(height).toBeGreaterThanOrEqual(idleHeight);
        } else {
          expect(height).toBe(idleHeight);
        }
      };
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
      await settleDictationEntrance();
      await expect.element(page.getByRole('button', { name: 'Send answer' })).toHaveAttribute('aria-disabled', 'true');
      expectAlignedActions('Requesting microphone…');
      expectActiveHeight();
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
          recordLevel?.(Math.abs(Math.sin(index * 0.9)) * 0.1);
        }
      });
      await expect.element(page.getByRole('button', { name: 'Send answer' })).toHaveAttribute('aria-disabled', 'false');
      expectActiveHeight();
      const cancel = screen.getByRole('button', { name: 'Cancel dictation' }).getBoundingClientRect();
      const stop = screen.getByRole('button', { name: 'Stop dictation' }).getBoundingClientRect();
      const waveform = screen.getByRole('img', { name: 'Microphone waveform' }).getBoundingClientRect();
      const send = screen.getByRole('button', { name: 'Send answer' }).getBoundingClientRect();
      expect(cancel.top).toBe(stop.top);
      expect(send.top).toBe(stop.top);
      expect(send.left).toBeGreaterThanOrEqual(stop.right);
      // The microphone expanded into the stop pill around the waveform, with cancel on its left.
      expect(cancel.right).toBeLessThanOrEqual(stop.left);
      expect(waveform.left).toBeGreaterThanOrEqual(stop.left);
      expect(waveform.right).toBeLessThanOrEqual(stop.right);
      await expect.element(box).toHaveValue(draft);
      await page.screenshot({
        element: region,
        path: `../../../../../out/test-results/composer/question-recording-${width}-${theme}-${variant}.png`,
      });
      await page.getByRole('button', { name: sendWhileRecording ? 'Send answer' : 'Stop dictation' }).click();
      await expect.element(page.getByRole('status', { name: 'Transcribing', exact: true })).toBeVisible();
      expectActiveHeight();
      await page.screenshot({
        element: region,
        path: `../../../../../out/test-results/composer/question-transcribing-${width}-${theme}-${variant}.png`,
      });
      expect(region.scrollWidth).toBe(region.clientWidth);
      await expect.element(page.getByRole('button', { name: 'Send answer' })).toHaveAttribute('aria-disabled', 'true');
      expect(onAnswer).not.toHaveBeenCalled();
      expectAlignedActions('Transcribing');
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

/** A phone's composer: focus, a streaming turn and Stop are real state, as `ChatTextarea` keeps them. */
function PhoneComposer(
  props: Partial<ComposerProps> & { readonly initialStatus?: string; readonly onStop?: () => void },
): React.JSX.Element {
  const { initialStatus = 'ready', onStop, ...rest } = props;
  const [isFocused, setIsFocused] = useState(false);
  const [status, setStatus] = useState(initialStatus);
  const containerReference = useRef<HTMLDivElement>(null);
  return (
    <TooltipProvider>
      <section aria-label='Composer' className='p-2'>
        <ChatTextareaDesktop
          enableAutoFocus={false}
          enableMobileCollapse
          isFocused={isFocused}
          dragKind={undefined}
          isSubmitting={false}
          isAttaching={false}
          inputText=''
          attachments={[]}
          attachmentDirectory={undefined}
          sendBlockReason={undefined}
          attachmentAccept='image/png,application/pdf'
          attachmentInputSupported
          status={status}
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
          handleCancelClick={() => {
            onStop?.();
            setStatus('ready');
          }}
          handleDragOver={noop}
          handleDragLeave={noop}
          handleDrop={asyncNoop}
          handlePaste={() => false}
          handleFileSelect={noop}
          handleFileChange={noop}
          handleAddImage={noop}
          onScreenshotAction={noop}
          handleTextareaFocus={() => {
            setIsFocused(true);
          }}
          handleTextareaBlur={() => {
            requestAnimationFrame(() => {
              setIsFocused(containerReference.current?.contains(document.activeElement) === true);
            });
          }}
          removeAttachment={noop}
          {...rest}
        />
      </section>
    </TooltipProvider>
  );
}

/** The bar's controls a person can see and reach right now, by name, left to right. */
const reachableControls = (): string[] =>
  [...document.querySelectorAll<HTMLButtonElement>('[data-slot=composer-bar] button')]
    .filter((button) => button.checkVisibility({ visibilityProperty: true, opacityProperty: true }))
    .map((button) => button.getAttribute('aria-label') ?? button.textContent.trim());

/**
 * Every reachable control's hit area reaches 6px beyond each edge — a 28px control is a
 * 40px target — and a tap just inside that ring belongs to it alone (I3).
 */
const expectTouchTargets = (): void => {
  const buttons = [...document.querySelectorAll<HTMLButtonElement>('[data-slot=composer-bar] button')].filter(
    (button) => button.checkVisibility({ visibilityProperty: true, opacityProperty: true }),
  );
  expect(buttons.length).toBeGreaterThan(1);
  for (const button of buttons) {
    const box = button.getBoundingClientRect();
    expect(box.height + 12).toBeGreaterThanOrEqual(40);
    expect(box.width + 12).toBeGreaterThanOrEqual(40);
    expect(getComputedStyle(button, '::after').inset).toBe('-6px');
    const middle = { x: box.left + box.width / 2, y: box.top + box.height / 2 };
    for (const [x, y] of [
      // Hit testing rounds to whole pixels, so probe 1px inside the ring's edge.
      [box.left - 5, middle.y],
      [box.right + 5, middle.y],
      [middle.x, box.top - 5],
      [middle.x, box.bottom + 5],
    ] as const) {
      expect(document.elementFromPoint(x, y)?.closest('button'), `${button.ariaLabel} at ${x},${y}`).toBe(button);
    }
  }
  const rows = Map.groupBy(buttons, (button) => Math.round(button.getBoundingClientRect().top / 8));
  for (const row of rows.values()) {
    const boxes = row.map((button) => button.getBoundingClientRect()).toSorted((a, b) => a.left - b.left);
    for (const [index, box] of boxes.slice(1).entries()) {
      expect(box.left - boxes[index]!.right).toBeGreaterThanOrEqual(12 - 0.5);
    }
  }
};

describe('phone composer (D14, D18)', () => {
  beforeEach(async () => {
    dictationAvailable = true;
    await page.viewport(390, 844);
    await commands.composerPointer(true);
    expect(matchMedia('(pointer: coarse)').matches).toBe(true);
  });
  afterEach(async () => {
    await commands.composerPointer(false);
  });

  it('rests as one row of Add, Dictate and Send, each a 40px target', async () => {
    render(<PhoneComposer />);
    await screen.findByRole('button', { name: 'Dictate' });

    await expect.poll(reachableControls).toEqual(['Add', 'Dictate', 'Send']);
    const composer = document.querySelector<HTMLElement>('[data-collapsed]')!;
    expect(composer.getBoundingClientRect().height).toBeLessThanOrEqual(48);
    expectTouchTargets();
    await page.screenshot({
      element: screen.getByRole('region', { name: 'Composer' }),
      path: '../../../../../out/test-results/composer/phone-idle.png',
    });
  });

  it('unfolds on focus to the model selector, then Dictate, then Send', async () => {
    render(<PhoneComposer />);
    await screen.findByRole('button', { name: 'Dictate' });

    await page.getByRole('textbox').click();
    await expect.poll(reachableControls).toEqual(['Add', 'Select kernel (Manifold)', 'Haiku 5.5', 'Dictate', 'Send']);
    expect(document.querySelector('[data-collapsed]')).toBeNull();
    const [model, dictate, send] = ['Haiku 5.5', 'Dictate', 'Send'].map((name) =>
      screen.getByRole('button', { name }).getBoundingClientRect(),
    );
    expect(model!.right).toBeLessThanOrEqual(dictate!.left);
    expect(dictate!.right).toBeLessThanOrEqual(send!.left);
    expectTouchTargets();
    await page.screenshot({
      element: screen.getByRole('region', { name: 'Composer' }),
      path: '../../../../../out/test-results/composer/phone-expanded.png',
    });
  });

  it('leaves a tap just inside the resting editor’s edges to the editor, clear of the touch rings', async () => {
    render(<PhoneComposer />);
    await screen.findByRole('button', { name: 'Dictate' });
    await expect.poll(reachableControls).toEqual(['Add', 'Dictate', 'Send']);
    // The row's padding eases in once dictation is offered; measure where it settles.
    await Promise.all(document.getAnimations().map(async (animation) => animation.finished));
    const editor = screen.getByRole('textbox');
    const box = editor.getBoundingClientRect();
    const y = box.top + box.height / 2;

    for (const x of [box.left + 2, box.right - 2]) {
      const hit = document.elementFromPoint(x, y);
      expect(hit?.closest('button'), `tap at ${x},${y}`).toBeNull();
      expect(hit?.closest('[data-slot=composer-bar]'), `tap at ${x},${y}`).toBeNull();
    }
    await page.getByRole('textbox').click({ position: { x: 2, y: box.height / 2 } });
    await expect.element(page.getByRole('textbox')).toHaveFocus();
    expect(screen.queryByRole('menu')).toBeNull();
    expect(screen.queryByRole('button', { name: 'Requesting microphone…' })).toBeNull();
  });

  it('opens attachments from + with a tap, no hover', async () => {
    render(<PhoneComposer />);
    await page.getByRole('button', { name: 'Add' }).click();

    await expect.element(page.getByRole('menuitem', { name: 'Attach image or PDF' })).toBeVisible();
  });

  it('swaps Send for Stop while a turn streams, and Stop ends the turn', async () => {
    const onStop = vi.fn();
    render(<PhoneComposer initialStatus='streaming' onStop={onStop} />);
    await screen.findByRole('button', { name: 'Dictate' });

    await expect.poll(reachableControls).toEqual(['Add', 'Dictate', 'Stop']);
    expectTouchTargets();
    await page.getByRole('button', { name: 'Stop' }).click();
    expect(onStop).toHaveBeenCalledOnce();
    await expect.element(page.getByRole('button', { name: 'Send' })).toBeVisible();
    expect(screen.queryByRole('button', { name: 'Stop' })).toBeNull();
  });

  it('hides keyboard hints from a touch screen, keeping the words its name uses (I6, I7)', async () => {
    render(<PhoneComposer inputText='A draft' />);
    const send = await screen.findByRole('button', { name: 'Send' });
    act(() => {
      send.focus();
    });
    const tooltip = await vi.waitFor(() => document.querySelector<HTMLElement>('[data-slot=tooltip-content]')!);
    const hint = [...tooltip.querySelectorAll('span')].find((span) => span.className.includes('tracking-'))!;
    expect(getComputedStyle(hint).display).toBe('none');
    // What remains to read is the control's name.
    expect(tooltip.textContent.replace(hint.textContent, '').trim()).toBe('Send');
  });
});

describe('desktop composer stays as it was', () => {
  it('keeps the full bar, 28px targets with no touch ring, and its keyboard hints', async () => {
    await commands.composerPointer(false);
    await page.viewport(1024, 720);
    const { containerReference } = renderComposer({ inputText: 'A draft', enableKernelSelector: true });
    const send = await screen.findByRole('button', { name: 'Send' });

    expect(containerReference.current).not.toHaveAttribute('data-collapsed');
    expect(send.getBoundingClientRect().height).toBe(28);
    expect(getComputedStyle(send, '::after').content).toBe('none');
    expect(getComputedStyle(document.querySelector('[data-slot=composer-right]')!).columnGap).toBe('4px');
    act(() => {
      send.focus();
    });
    const tooltip = await vi.waitFor(() => document.querySelector<HTMLElement>('[data-slot=tooltip-content]')!);
    const hint = [...tooltip.querySelectorAll('span')].find((span) => span.className.includes('tracking-'))!;
    expect(getComputedStyle(hint).display).not.toBe('none');
    expect(tooltip.textContent).toContain('Send');
  });
});
