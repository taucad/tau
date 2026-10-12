import '#styles/global.css';
import { createRef } from 'react';
import type { ComponentProps } from 'react';
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { page } from 'vitest/browser';
import { TooltipProvider } from '@taucad/ui/components/tooltip';
import { Button } from '@taucad/ui/components/button';
import { kernelConfigurations } from '@taucad/types/constants';
import { storedRef } from '#utils/attachment.test-utils.js';

vi.doMock('#hooks/active-chat-provider.js', () => ({
  useActiveChatSession: () => undefined,
  useChatComposer: () => ({
    kernel: { kernel: kernelConfigurations.find((kernel) => kernel.id === 'manifold') },
    execution: { execution: { kind: 'tau', model: 'm' } },
    contextUsage: undefined,
  }),
}));
vi.doMock('#hooks/use-keyboard.js', () => ({
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
  globalThis.document.documentElement.classList.remove('dark');
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
