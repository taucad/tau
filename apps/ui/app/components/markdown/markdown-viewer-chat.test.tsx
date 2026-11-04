import { render } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { MarkdownViewerChat } from '#components/markdown/markdown-viewer-chat.js';

vi.mock('#hooks/use-theme.js', () => ({
  useTheme: () => ({ isHighContrast: false, theme: 'light' }),
}));

const rows = Array.from({ length: 30 }, (_, index) => `| Row ${index} | Value ${index} |`).join('\n');
const tableMarkdown = `| Function | Parts |\n| --- | --- |\n${rows}\n`;

const tableScroller = (container: HTMLElement): HTMLElement => {
  const table = container.querySelector<HTMLElement>('[data-streamdown="table"]');
  if (!table?.parentElement) {
    throw new Error('Expected a rendered markdown table');
  }

  return table.parentElement;
};

describe('MarkdownViewerChat', () => {
  it.each([false, true])('should render tables at full height (streaming fade: %s)', (isStreamingFade) => {
    const view = render(<MarkdownViewerChat isStreamingFade={isStreamingFade}>{tableMarkdown}</MarkdownViewerChat>);

    expect(view.container.querySelectorAll('[data-streamdown="table"] tbody tr')).toHaveLength(30);
    expect(tableScroller(view.container).style.maxHeight).toBe('');
  });
});
