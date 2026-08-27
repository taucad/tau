// @vitest-environment jsdom
import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ChatEditorBreadcrumbs } from '#routes/w.$workspace.$project/chat-editor-breadcrumbs.js';

const { send } = vi.hoisted(() => ({ send: vi.fn() }));

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

  it('should render nothing without a file path', () => {
    const { container } = render(<ChatEditorBreadcrumbs filePath='' />);

    expect(container).toBeEmptyDOMElement();
  });
});
