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

  /* D-UI-18: Tau's `code` component renders every fenced block, so Streamdown's
   * code and mermaid plugins are never reached and are not bundled. */
  it('should render a fenced mermaid block through the Tau code block', async () => {
    render(
      <TooltipProvider>
        <MarkdownViewer>{'```mermaid\ngraph TD; A-->B;\n```'}</MarkdownViewer>
      </TooltipProvider>,
    );

    expect(await screen.findByText('mermaid', { selector: '[data-slot="codeblock-title"]' })).toBeInTheDocument();
    expect(document.querySelector('[data-streamdown^="mermaid"]')).toBeNull();
  });
});
