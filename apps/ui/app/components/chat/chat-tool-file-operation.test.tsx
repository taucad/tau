// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, render, screen, within } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { CollapsibleFileOperation } from '#components/chat/chat-tool-file-operation.js';
import { TooltipProvider } from '@taucad/ui/components/tooltip';

type ViewportRef = {
  // oxlint-disable-next-line @typescript-eslint/no-restricted-types -- mirrors React `RefObject` shape produced by `useRef<HTMLDivElement>(null)`
  current: HTMLElement | null | undefined;
};

// ── Resize observer harness ───────────────────────────────────────────────
//
// `FourLineViewport` measures its own `scrollHeight` against `clientHeight`
// inside a `useResizeObserver` callback. jsdom does not lay out content, so we
// replace the hook with a controllable harness that:
//   1. captures the latest `onResize` callback and the observed ref
//   2. lets each test stub `scrollHeight` / `clientHeight` on the viewport
//   3. lets each test fire `onResize` to drive the overflow state
//
// The overall shape mirrors the pattern in
// `chat-message-reasoning.test.tsx` for the chat-history scroller.

type ResizeObserverHarness = {
  onResize: (() => void) | undefined;
  ref: ViewportRef | undefined;
};

const resizeHarness: ResizeObserverHarness = {
  onResize: undefined,
  ref: undefined,
};

vi.mock('#hooks/use-resize-observer.js', () => ({
  useResizeObserver(options: { readonly ref: ViewportRef; readonly onResize?: () => void }) {
    resizeHarness.ref = options.ref;
    resizeHarness.onResize = options.onResize;
    return { width: undefined, height: undefined };
  },
}));

const previewPreference = vi.hoisted(() => ({ enabled: true }));
vi.mock('#hooks/use-cookie.js', () => ({
  useCookie: (name: string, defaultValue: boolean) => [
    name === 'chat-tool-code-preview' ? previewPreference.enabled : defaultValue,
    vi.fn(),
    vi.fn(),
  ],
}));

// Stub Shiki-backed viewers so tests stay fast and avoid highlighter init.
vi.mock('#components/code/code-viewer.js', () => ({
  CodeViewer({
    text,
    language,
    className,
  }: {
    readonly text: string;
    readonly language: string;
    readonly className?: string;
  }): React.JSX.Element {
    return (
      <div
        data-testid='code-viewer'
        data-language={language}
        className={typeof className === 'string' ? className : ''}
      >
        {text}
      </div>
    );
  },
}));

vi.mock('#components/code/diff-viewer.js', () => ({
  DiffViewer({
    originalContent,
    modifiedContent,
    language,
  }: {
    readonly originalContent: string;
    readonly modifiedContent: string;
    readonly language: string;
  }): React.JSX.Element {
    return (
      <div
        data-testid='diff-viewer'
        data-language={language}
        data-original={originalContent}
        data-modified={modifiedContent}
      />
    );
  },
  // Real implementation: returns first changed line in the modified content.
  // Inlined so tests do not depend on the diff package and so we keep the
  // file-line-1 exception observable through `FileLink`.
  getFirstChangedLine(originalContent: string, modifiedContent: string): number {
    if (originalContent === modifiedContent) {
      return 1;
    }

    const originalLines = originalContent.split('\n');
    const modifiedLines = modifiedContent.split('\n');
    const limit = Math.min(originalLines.length, modifiedLines.length);

    for (let index = 0; index < limit; index += 1) {
      if (originalLines[index] !== modifiedLines[index]) {
        return index + 1;
      }
    }

    return limit + 1;
  },
}));

vi.mock('#components/files/file-link.js', () => ({
  FileLink({
    children,
    path,
    lineNumber,
  }: {
    readonly children: React.ReactNode;
    readonly path: string;
    readonly lineNumber?: number;
    readonly asChild?: boolean;
    readonly className?: string;
  }): React.JSX.Element {
    return (
      <a
        data-testid='file-link'
        data-path={path}
        data-line-number={lineNumber === undefined ? '' : String(lineNumber)}
        href={`#${path}`}
      >
        {children}
      </a>
    );
  },
}));

vi.mock('#components/icons/file-extension-icon.js', () => ({
  FileExtensionIcon(): React.JSX.Element {
    return <span data-testid='file-extension-icon' />;
  },
}));

const projectSend = vi.hoisted(() => vi.fn());

vi.mock('#hooks/use-project.js', () => ({
  useProject: () => ({
    projectRef: { send: projectSend },
  }),
}));

const stubViewportMetrics = (element: HTMLElement, scrollHeight: number, clientHeight: number): void => {
  Object.defineProperty(element, 'scrollHeight', {
    configurable: true,
    get: () => scrollHeight,
  });
  Object.defineProperty(element, 'clientHeight', {
    configurable: true,
    get: () => clientHeight,
  });
};

const triggerResize = (): void => {
  if (!resizeHarness.onResize) {
    throw new Error('useResizeObserver onResize callback not registered');
  }

  act(() => {
    resizeHarness.onResize?.();
  });
};

const getViewportElement = (): HTMLElement => {
  const node = resizeHarness.ref?.current;
  if (!(node instanceof HTMLElement)) {
    throw new Error('FourLineViewport ref not attached');
  }

  return node;
};

const renderDiff = (overrides?: { originalContent?: string; modifiedContent?: string; targetFile?: string }) => {
  const originalContent = overrides?.originalContent ?? 'a\nb\nc';
  const modifiedContent = overrides?.modifiedContent ?? 'a\nx\ny\nz\nc';
  const targetFile = overrides?.targetFile ?? 'main.scad';

  return render(
    <TooltipProvider>
      <CollapsibleFileOperation
        operation='edit'
        enableFileLink
        targetFile={targetFile}
        toolStatus='output-available'
        content={modifiedContent}
        diffStats={{
          linesAdded: 3,
          linesRemoved: 1,
          originalContent,
          modifiedContent,
        }}
      />
    </TooltipProvider>,
  );
};

beforeEach(() => {
  previewPreference.enabled = true;
  resizeHarness.onResize = undefined;
  resizeHarness.ref = undefined;
  projectSend.mockReset();
});

afterEach(() => {
  cleanup();
});

describe('FourLineViewport (via CollapsibleFileOperation)', () => {
  describe('collapsed (default) state', () => {
    it('should render the inner preview clipped to a 4-line max-height with no scrolling', () => {
      renderDiff();

      const viewport = getViewportElement();

      expect(viewport.className).toContain('max-h-[5rem]');
      expect(viewport.className).toContain('overflow-hidden');
      expect(viewport.className).not.toContain('overflow-auto');
    });

    it('should NOT apply scroll-shadow-bottom while content fits within the 4-line window', () => {
      renderDiff();

      const viewport = getViewportElement();
      stubViewportMetrics(viewport, 60, 80);
      triggerResize();

      expect(getViewportElement().className).not.toContain('scroll-shadow-bottom');
    });

    it('should apply scroll-shadow-bottom when content overflows the 4-line window', () => {
      renderDiff();

      const viewport = getViewportElement();
      stubViewportMetrics(viewport, 200, 80);
      triggerResize();

      expect(getViewportElement().className).toContain('scroll-shadow-bottom');
    });

    it('should NOT render the chevron when the content fits in 4 lines', () => {
      renderDiff();

      const viewport = getViewportElement();
      stubViewportMetrics(viewport, 60, 80);
      triggerResize();

      expect(screen.queryByRole('button', { name: /expand code preview/i })).toBeNull();
      expect(screen.queryByRole('button', { name: /collapse code preview/i })).toBeNull();
    });
  });

  describe('chevron — full-width overlay hit-area contract', () => {
    it('should render a chrome-free full-width hit-area overlaid on the viewport bottom edge, with a circular chevron badge fading in on outer-card hover or keyboard focus', () => {
      renderDiff();

      const viewport = getViewportElement();
      stubViewportMetrics(viewport, 200, 80);
      triggerResize();

      const chevron = screen.getByRole('button', { name: /expand code preview/i });

      // Full-width bar overlaid on the viewport's bottom edge so it never
      // adds vertical layout — the last line of code dims under the bar
      // (via scroll-shadow-bottom) instead of being pushed down.
      expect(chevron.className).toContain('w-full');
      expect(chevron.className).toContain('absolute');
      expect(chevron.className).toContain('inset-x-0');
      expect(chevron.className).toContain('bottom-0');

      // The hit-area itself has zero chrome: no background, no border, no
      // opacity, no hover bg. All visual presence lives on the inner badge.
      expect(chevron.className).not.toMatch(/\bbg-/);
      expect(chevron.className).not.toMatch(/\bborder/);
      expect(chevron.className).not.toMatch(/\bopacity-\d/);
      expect(chevron.className).not.toMatch(/\bhover:bg-/);

      // Inner badge is a small filled circle that wraps the chevron, fading
      // in on outer-card hover or keyboard focus (group-focus-visible on
      // the trigger). The chevron itself only carries size + rotate.
      const badge = chevron.querySelector('span');
      const badgeClass = badge?.getAttribute('class') ?? '';
      expect(badgeClass).toContain('rounded-full');
      expect(badgeClass).toContain('border');
      expect(badgeClass).toContain('bg-background');
      expect(badgeClass).toContain('opacity-0');
      expect(badgeClass).toContain('group-hover/file-op:opacity-100');
      expect(badgeClass).toContain('group-focus-visible/chevron-trigger:opacity-100');

      expect(chevron.getAttribute('aria-expanded')).toBe('false');
    });
  });

  describe('expand / collapse transitions', () => {
    it('should switch to the natural-height scroll viewport when the chevron is clicked', async () => {
      const user = userEvent.setup();
      renderDiff();

      const viewport = getViewportElement();
      stubViewportMetrics(viewport, 200, 80);
      triggerResize();

      await user.click(screen.getByRole('button', { name: /expand code preview/i }));

      const expandedViewport = getViewportElement();
      expect(expandedViewport.className).toContain('overflow-auto');
      expect(expandedViewport.className).not.toContain('max-h-[5rem]');
      expect(expandedViewport.className).not.toContain('overflow-hidden');
      expect(expandedViewport.className).not.toContain('scroll-shadow-bottom');

      const collapse = screen.getByRole('button', { name: /collapse code preview/i });
      expect(collapse.getAttribute('aria-expanded')).toBe('true');
      // Down-chevron flipped 180° = pointing up (collapse affordance).
      const collapseIcon = collapse.querySelector('svg');
      expect(collapseIcon?.getAttribute('class') ?? '').toContain('rotate-180');
    });

    it('should restore the 4-line clipped viewport when the collapse chevron is clicked', async () => {
      const user = userEvent.setup();
      renderDiff();

      const viewport = getViewportElement();
      stubViewportMetrics(viewport, 200, 80);
      triggerResize();

      await user.click(screen.getByRole('button', { name: /expand code preview/i }));
      // After expansion, scroll metrics no longer overflow because the
      // viewport now sizes to content. Re-stub for the collapse tick so the
      // fade re-applies on the way back down.
      stubViewportMetrics(getViewportElement(), 200, 80);
      await user.click(screen.getByRole('button', { name: /collapse code preview/i }));

      const collapsedViewport = getViewportElement();
      expect(collapsedViewport.className).toContain('max-h-[5rem]');
      expect(collapsedViewport.className).toContain('overflow-hidden');
      expect(collapsedViewport.className).toContain('scroll-shadow-bottom');
      expect(screen.getByRole('button', { name: /expand code preview/i })).toBeInTheDocument();
    });
  });

  describe('header actions', () => {
    it('should render Open before optional actions when enableFileLink is set', () => {
      renderDiff({
        targetFile: 'parts/fuselage.ts',
      });

      expect(screen.getByRole('button', { name: 'Open in viewer' })).toBeInTheDocument();
    });

    it('should not render Open for ignored entry suffixes such as geospec.ts', () => {
      renderDiff({
        targetFile: 'mainWing.geospec.ts',
      });

      expect(screen.queryByRole('button', { name: 'Open in viewer' })).toBeNull();
    });

    it('should not render Open while streaming', () => {
      render(
        <TooltipProvider>
          <CollapsibleFileOperation
            operation='edit'
            enableFileLink
            targetFile='main.scad'
            toolStatus='input-streaming'
            content={'line1\nline2\nline3\nline4'}
          />
        </TooltipProvider>,
      );

      expect(screen.queryByRole('button', { name: 'Open in viewer' })).toBeNull();
    });
  });

  describe('first-changed-line wiring', () => {
    it('should pass the first changed line into FileLink so the diff viewport opens on the change', () => {
      // First diverging modified line is line 2 ("x" replaces "b").
      renderDiff({ originalContent: 'a\nb\nc', modifiedContent: 'a\nx\nc' });

      const fileLink = screen.getByTestId('file-link');
      expect(fileLink.dataset['lineNumber']).toBe('2');
    });

    it('should surface line 1 to FileLink when the change is at the top of the file (documented exception)', () => {
      // First diverging modified line is line 1 — no padding, no contrived
      // shift to row 2; consumer just opens at line 1.
      renderDiff({ originalContent: 'a\nb\nc', modifiedContent: 'z\nb\nc' });

      const fileLink = screen.getByTestId('file-link');
      expect(fileLink.dataset['lineNumber']).toBe('1');
    });
  });

  describe('streaming branch', () => {
    it('should render the streaming preview without a chevron and without a fade', () => {
      render(
        <CollapsibleFileOperation
          operation='edit'
          targetFile='main.scad'
          toolStatus='input-streaming'
          content={'line1\nline2\nline3\nline4\nline5'}
        />,
      );

      // Streaming uses its own fixed-height box (not the FourLineViewport),
      // so the resize harness is never wired up.
      expect(resizeHarness.onResize).toBeUndefined();
      expect(screen.queryByRole('button', { name: /expand code preview/i })).toBeNull();
      expect(screen.queryByRole('button', { name: /collapse code preview/i })).toBeNull();

      // Renders the trimmed last-4-lines through CodeViewer.
      const codeViewer = screen.getByTestId('code-viewer');
      expect(codeViewer.textContent).toBe('line2\nline3\nline4\nline5');
    });

    it('should resolve markdown files to the markdown highlighter', () => {
      render(
        <TooltipProvider>
          <CollapsibleFileOperation
            operation='edit'
            targetFile='docs/README.md'
            toolStatus='input-streaming'
            content={'# One\n\nbody\n\nmore'}
          />
        </TooltipProvider>,
      );

      expect(screen.getByTestId('code-viewer')).toHaveAttribute('data-language', 'markdown');
    });

    it('should fall back unknown file extensions to plaintext', () => {
      render(
        <CollapsibleFileOperation
          operation='edit'
          targetFile='notes.unknown'
          toolStatus='input-streaming'
          content={'line1\nline2\nline3\nline4'}
        />,
      );

      expect(screen.getByTestId('code-viewer')).toHaveAttribute('data-language', 'plaintext');
    });
  });

  describe('language resolution', () => {
    it('should resolve markdown diffs to the markdown highlighter', () => {
      renderDiff({ targetFile: 'README.markdown' });

      expect(screen.getByTestId('diff-viewer')).toHaveAttribute('data-language', 'markdown');
    });
  });
});

describe('File mutation disclosure', () => {
  it('should hide the entire card until the mutation row is opened and keep actions outside the trigger', async () => {
    previewPreference.enabled = false;
    const user = userEvent.setup();
    renderDiff();
    const trigger = screen.getByRole('button', { name: 'Edited main.scad +3 -1' });
    expect(trigger).toHaveAttribute('aria-expanded', 'false');
    expect(screen.queryByRole('region', { name: 'Edited main.scad' })).not.toBeInTheDocument();
    trigger.focus();
    await user.keyboard('{Enter}');
    const card = screen.getByRole('region', { name: 'Edited main.scad' });
    expect(screen.getByRole('button', { name: 'Edited file' })).toHaveAttribute('aria-expanded', 'true');
    const open = within(card).getByRole('button', { name: 'Open in viewer' });
    await user.click(open);
    expect(projectSend).toHaveBeenCalled();
    expect(card).toBeVisible();
    screen.getByRole('button', { name: 'Edited file' }).focus();
    await user.keyboard(' ');
    expect(screen.queryByRole('region', { name: 'Edited main.scad' })).not.toBeInTheDocument();
  });

  it.each([true, false])(
    'should preserve a manual collapse across streamed content and completion with preview=%s',
    async (enabled) => {
      previewPreference.enabled = enabled;
      const user = userEvent.setup();
      const { rerender } = render(
        <CollapsibleFileOperation operation='edit' targetFile='main.scad' toolStatus='input-streaming' content='old' />,
      );
      const trigger = screen.getByRole('button', { name: 'Editing main.scad' });
      if (!enabled) {
        await user.click(trigger);
      }
      await user.click(trigger);
      rerender(
        <CollapsibleFileOperation
          operation='edit'
          targetFile='main.scad'
          toolStatus='input-streaming'
          content='new partial'
        />,
      );
      expect(screen.queryByRole('region')).not.toBeInTheDocument();
      rerender(
        <CollapsibleFileOperation
          operation='edit'
          targetFile='main.scad'
          toolStatus='output-available'
          content=''
          diffStats={{ linesAdded: 0, linesRemoved: 1, originalContent: 'old', modifiedContent: '' }}
        />,
      );
      expect(trigger).toBe(screen.getByRole('button', { name: 'Edited main.scad -1' }));
      expect(trigger).toHaveAttribute('aria-expanded', 'false');
      expect(screen.queryByRole('region')).not.toBeInTheDocument();
      await user.click(trigger);
      expect(screen.getByRole('region', { name: 'Edited main.scad' })).toBeVisible();
    },
  );

  it.each([true, false])(
    'should respect automatic preview=%s when streaming completes with empty modified content',
    (enabled) => {
      previewPreference.enabled = enabled;
      const { rerender } = render(
        <CollapsibleFileOperation operation='edit' targetFile='' toolStatus='input-streaming' />,
      );
      expect(screen.getByRole('button', { name: 'Editing file…' })).toHaveAttribute('aria-expanded', 'false');
      rerender(
        <CollapsibleFileOperation
          operation='edit'
          targetFile='main.scad'
          toolStatus='output-available'
          content=''
          diffStats={{ linesAdded: 0, linesRemoved: 1, originalContent: 'old', modifiedContent: '' }}
        />,
      );
      const card = screen.queryByRole('region', { name: 'Edited main.scad' });
      if (enabled) {
        expect(card).toBeVisible();
      } else {
        expect(card).not.toBeInTheDocument();
      }
    },
  );
});
