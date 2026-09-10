import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { TooltipProvider } from '@taucad/ui/components/tooltip';
import { MarkdownViewer } from '#components/markdown/markdown-viewer.js';

vi.mock('#hooks/use-theme.js', () => ({ useTheme: () => ({ isHighContrast: false, theme: 'light' }) }));

describe('MarkdownViewer syntax highlighting', () => {
  it('should highlight a fenced TypeScript block with the JavaScript Shiki engine', async () => {
    render(
      <TooltipProvider>
        <MarkdownViewer>{'```ts\nconst answer: number = 42;\n```'}</MarkdownViewer>
      </TooltipProvider>,
    );

    const code = await screen.findByText('const', { selector: 'span' });
    expect(code.getAttribute('style')).toMatch(/color:\s*#/u);
    expect(code.closest('[data-slot="codeblock"]')).not.toBeNull();
  });
});
