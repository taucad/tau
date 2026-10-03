// @vitest-environment jsdom
import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { FileProvenance } from '@taucad/types';
import { TooltipProvider } from '@taucad/ui/components/tooltip';
import { ChatEditorBreadcrumbs } from '#routes/w.$workspace.$project/chat-editor-breadcrumbs.js';

const { send, useFileTreeEntry } = vi.hoisted(() => ({
  send: vi.fn(),
  useFileTreeEntry: vi.fn<() => { provenance: FileProvenance } | undefined>(),
}));

vi.mock('#hooks/use-file-tree.js', () => ({ useFileTreeEntry }));

vi.mock('#hooks/use-project.js', () => ({
  useProject: () => ({ editorRef: { send } }),
}));

vi.mock('#components/files/file-selector.js', () => ({
  FileSelector: ({
    children,
    initialPath,
    onSelect,
  }: {
    readonly children: React.ReactNode;
    readonly initialPath?: string;
    readonly onSelect: (path: string) => void;
  }) => (
    <span
      data-testid={`selector-${initialPath}`}
      onClick={() => {
        onSelect('replacement.ts');
      }}
    >
      {children}
    </span>
  ),
}));

describe('ChatEditorBreadcrumbs', () => {
  beforeEach(() => {
    send.mockClear();
    useFileTreeEntry.mockReset();
  });

  it('should scroll breadcrumbs from vertical wheel input while preserving selection and child actions', () => {
    render(
      <ChatEditorBreadcrumbs filePath='src/components/part.ts'>
        <button type='button'>Editor action</button>
      </ChatEditorBreadcrumbs>,
    );
    expect(screen.getByText('src')).toBeInTheDocument();
    expect(screen.getByText('components')).toBeInTheDocument();
    expect(screen.getByText('part.ts')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Editor action' })).toBeInTheDocument();

    const scroller = document.querySelector<HTMLElement>('[data-slot="omni-scroller"]');
    if (!scroller) {
      throw new Error('Editor breadcrumb scroller was missing.');
    }
    Object.defineProperties(scroller, {
      clientWidth: { configurable: true, value: 100 },
      scrollLeft: { configurable: true, value: 20, writable: true },
      scrollWidth: { configurable: true, value: 400 },
    });
    const event = new WheelEvent('wheel', { bubbles: true, cancelable: true, deltaY: 60 });
    screen.getByText('components').dispatchEvent(event);

    expect(scroller.scrollLeft).toBe(80);
    expect(event.defaultPrevented).toBe(true);

    fireEvent.click(screen.getByTestId('selector-src/components'));
    expect(send).toHaveBeenCalledWith({ type: 'openFile', path: 'replacement.ts', source: 'user' });
  });

  it('should reveal the new filename on navigation without resetting an unrelated rerender', () => {
    const observers: Array<{ observe: ReturnType<typeof vi.fn>; disconnect: ReturnType<typeof vi.fn> }> = [];
    vi.stubGlobal(
      'ResizeObserver',
      class {
        public readonly observe = vi.fn();
        public readonly disconnect = vi.fn();
        public constructor() {
          observers.push(this);
        }
      },
    );
    vi.spyOn(Element.prototype, 'scrollWidth', 'get').mockReturnValue(400);
    let unmount: (() => void) | undefined;
    try {
      const rendered = render(<ChatEditorBreadcrumbs filePath='src/first.ts' />);
      unmount = rendered.unmount;
      const first = document.querySelector<HTMLElement>('[data-slot="omni-scroller"]');
      if (!first) {
        throw new Error('Editor breadcrumb scroller was missing.');
      }
      expect(first.scrollLeft).toBe(400);
      expect(observers).toHaveLength(1);
      first.scrollLeft = 37;

      rendered.rerender(
        <ChatEditorBreadcrumbs filePath='src/first.ts'>
          <button type='button'>Action</button>
        </ChatEditorBreadcrumbs>,
      );
      expect(first.scrollLeft).toBe(37);
      expect(observers).toHaveLength(1);
      expect(observers[0]?.disconnect).not.toHaveBeenCalled();

      rendered.rerender(<ChatEditorBreadcrumbs filePath='src/second.ts' />);
      const second = document.querySelector<HTMLElement>('[data-slot="omni-scroller"]');
      if (!second) {
        throw new Error('Navigated breadcrumb scroller was missing.');
      }
      expect(second.scrollLeft).toBe(400);
      expect(observers).toHaveLength(2);
      expect(observers[0]?.disconnect).toHaveBeenCalledOnce();
      expect(observers[1]?.observe).toHaveBeenCalledWith(second);
      rendered.unmount();
      unmount = undefined;
      expect(observers[1]?.disconnect).toHaveBeenCalledOnce();
    } finally {
      unmount?.();
      vi.restoreAllMocks();
      vi.unstubAllGlobals();
    }
  });

  it('should render nothing without a file path', () => {
    const { container } = render(<ChatEditorBreadcrumbs filePath='' />);

    expect(container).toBeEmptyDOMElement();
  });

  it('should explain artifacts beside the current file with unique descriptions for each pane', async () => {
    useFileTreeEntry.mockReturnValue({
      provenance: {
        source: 'project',
        versioned: false,
        agentAccess: 'read-only',
      },
    });
    render(
      <TooltipProvider>
        <ChatEditorBreadcrumbs filePath='.tau/chats/one/events.jsonl' />
        <ChatEditorBreadcrumbs filePath='.tau/chats/two/events.jsonl' />
      </TooltipProvider>,
    );
    const badges = screen.getAllByRole('button', { name: 'Artifact' });
    const description = 'Supporting data used by Tau. Not included in revisions.';
    expect(badges).toHaveLength(2);
    expect(badges[0]).toHaveAccessibleDescription(description);
    expect(badges[1]).toHaveAccessibleDescription(description);
    expect(badges[0]?.getAttribute('aria-describedby')).not.toBe(badges[1]?.getAttribute('aria-describedby'));
    expect(screen.getAllByRole('navigation', { name: 'File breadcrumbs' })[0]).toContainElement(badges[0]!);
    expect(screen.getAllByRole('button', { current: 'page' })[0]).toHaveTextContent('events.jsonl');

    fireEvent.click(badges[0]!);
    expect(await screen.findByRole('dialog', { name: 'Artifact' })).toHaveTextContent(description);
    fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Escape' });
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it.each([
    ['.tau/parameters/part.cs.json', true],
    ['.tau/cache/preview.png', false],
    ['.tau/tsconfig.generated.json', false],
  ])('should not badge %s as an artifact', (filePath, versioned) => {
    useFileTreeEntry.mockReturnValue({
      provenance: { source: 'project', versioned, agentAccess: 'read-write' },
    });
    render(<ChatEditorBreadcrumbs filePath={filePath} />);
    expect(screen.queryByRole('button', { name: 'Artifact' })).not.toBeInTheDocument();
  });
});
