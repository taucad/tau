import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { TooltipProvider } from '@taucad/ui/components/tooltip';
import { MarkdownViewer } from '#components/markdown/markdown-viewer.js';

describe('MarkdownViewer syntax highlighting', () => {
  it('should highlight a fenced TypeScript block with the TypeScript Lezer grammar', async () => {
    render(
      <TooltipProvider>
        <MarkdownViewer>{'```ts\nconst answer: number = 42;\n```'}</MarkdownViewer>
      </TooltipProvider>,
    );

    const code = await screen.findByText('const', { selector: 'span.tok-keyword' });
    expect(code.getAttribute('style')).toBeNull();
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
