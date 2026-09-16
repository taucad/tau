import { StrictMode } from 'react';
import { render } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { describe, expect, it, vi } from 'vitest';
import type { Root } from 'hast';
import { TooltipProvider } from '@taucad/ui/components/tooltip';
import { MarkdownViewerChat } from '#components/markdown/markdown-viewer-chat.js';
import { createChatStreamingFadePlugin, getStreamingArrivalStart } from '#components/markdown/chat-streaming-fade.js';

vi.mock('#hooks/use-theme.js', () => ({ useTheme: () => ({ isHighContrast: false, theme: 'light' }) }));

const fadingText = (container: HTMLElement): string[] =>
  [...container.querySelectorAll<HTMLElement>('[data-chat-streaming-fade]')].map((node) => node.textContent);

describe('chat streaming fade', () => {
  it('should find the newly arrived suffix for append-only and rolling streams', () => {
    expect(getStreamingArrivalStart('Alpha', 'Alpha Beta')).toBe(5);
    expect(getStreamingArrivalStart('prefix stable tail', 'stable tail new')).toBe('stable tail'.length);
    expect(getStreamingArrivalStart('same', 'same')).toBe(4);
    expect(getStreamingArrivalStart('old', 'new')).toBe(0);
  });

  it('should fade only the newest prose and bound the animated DOM', () => {
    const initial = `${'settled '.repeat(5000)}end`;
    const view = render(
      <MarkdownViewerChat isStreaming isStreamingFade>
        {initial}
      </MarkdownViewerChat>,
    );

    expect(fadingText(view.container)).toEqual([]);

    view.rerender(
      <MarkdownViewerChat isStreaming isStreamingFade>
        {`${initial} first`}
      </MarkdownViewerChat>,
    );
    expect(fadingText(view.container)).toEqual([' first']);

    view.rerender(
      <MarkdownViewerChat isStreaming isStreamingFade>
        {`${initial} first second`}
      </MarkdownViewerChat>,
    );
    expect(fadingText(view.container)).toEqual([' second']);

    view.rerender(
      <MarkdownViewerChat isStreaming={false} isStreamingFade={false}>
        {`${initial} first second`}
      </MarkdownViewerChat>,
    );
    expect(fadingText(view.container)).toEqual([]);
    expect(view.container).toHaveTextContent(`${initial} first second`);
  });

  it('should support rolling reasoning windows without replaying retained text', () => {
    const view = render(
      <MarkdownViewerChat isStreaming isStreamingFade>
        prefix stable tail
      </MarkdownViewerChat>,
    );

    view.rerender(
      <MarkdownViewerChat isStreaming isStreamingFade>
        stable tail new
      </MarkdownViewerChat>,
    );

    expect(fadingText(view.container)).toEqual([' new']);
    expect(view.container).toHaveTextContent('stable tail new');
  });

  it('should fade only new text after an equal-length rolling replacement', () => {
    const view = render(
      <MarkdownViewerChat isStreaming isStreamingFade>
        Alpha Beta Gamma
      </MarkdownViewerChat>,
    );

    view.rerender(
      <MarkdownViewerChat isStreaming isStreamingFade>
        Beta Gamma Delta
      </MarkdownViewerChat>,
    );

    expect(fadingText(view.container)).toEqual([' Delta']);
    expect(view.container).toHaveTextContent('Beta Gamma Delta');
  });

  it('should preserve repeated and partial words while fading only their continuation', () => {
    const view = render(
      <MarkdownViewerChat isStreaming isStreamingFade>
        echo echo wor
      </MarkdownViewerChat>,
    );

    view.rerender(
      <MarkdownViewerChat isStreaming isStreamingFade>
        echo echo word
      </MarkdownViewerChat>,
    );
    expect(fadingText(view.container)).toEqual(['d']);

    view.rerender(
      <MarkdownViewerChat isStreaming isStreamingFade>
        echo echo word echo
      </MarkdownViewerChat>,
    );
    expect(fadingText(view.container)).toEqual([' echo']);
  });

  it('should keep emoji and combining graphemes intact when a chunk completes them', () => {
    const view = render(
      <MarkdownViewerChat isStreaming isStreamingFade>
        Ready 👩
      </MarkdownViewerChat>,
    );

    view.rerender(
      <MarkdownViewerChat isStreaming isStreamingFade>
        Ready 👩‍💻 é 好
      </MarkdownViewerChat>,
    );

    expect(fadingText(view.container)).toEqual(['👩‍💻 é 好']);
    expect(view.container).toHaveTextContent('Ready 👩‍💻 é 好');
  });

  it('should leave code tokens stable while adjacent prose fades', () => {
    const view = render(
      <TooltipProvider>
        <MarkdownViewerChat isStreaming isStreamingFade>
          {'Before\n\n```ts\nconst answer = 4'}
        </MarkdownViewerChat>
      </TooltipProvider>,
    );

    view.rerender(
      <TooltipProvider>
        <MarkdownViewerChat isStreaming isStreamingFade>
          {'Before\n\n```ts\nconst answer = 42;\n```\n\nAfter'}
        </MarkdownViewerChat>
      </TooltipProvider>,
    );

    expect(view.container.querySelector('code [data-chat-streaming-fade]')).toBeNull();
    expect(fadingText(view.container)).toEqual(['After']);
  });

  it('should preserve math and inline code while fading adjacent prose', () => {
    const initial = 'Math $x^2$ and `code`';
    const view = render(
      <TooltipProvider>
        <MarkdownViewerChat isStreaming isStreamingFade>
          {initial}
        </MarkdownViewerChat>
      </TooltipProvider>,
    );

    view.rerender(
      <TooltipProvider>
        <MarkdownViewerChat isStreaming isStreamingFade>
          {`${initial} done`}
        </MarkdownViewerChat>
      </TooltipProvider>,
    );

    expect(view.container.querySelector('.katex')).not.toBeNull();
    expect(view.container.querySelector('code [data-chat-streaming-fade]')).toBeNull();
    expect(view.container.querySelector('.katex [data-chat-streaming-fade]')).toBeNull();
    expect(fadingText(view.container)).toEqual([' done']);
  });

  it('should leave chat chips stable while adjacent prose fades', () => {
    const tree: Root = {
      type: 'root',
      children: [
        {
          type: 'element',
          tagName: 'p',
          properties: {},
          children: [
            { type: 'text', value: 'Before ' },
            { type: 'element', tagName: 'mark', properties: {}, children: [{ type: 'text', value: '@main.ts' }] },
            { type: 'text', value: ' after' },
          ],
        },
      ],
    };
    createChatStreamingFadePlugin({ committed: 'Before ' }, () => true)()(tree);

    expect(tree).toMatchObject({
      children: [
        {
          children: [
            { value: 'Before ' },
            { tagName: 'mark', children: [{ value: '@main.ts' }] },
            {
              tagName: 'span',
              properties: { 'data-chat-streaming-fade': '' },
              children: [{ value: ' after' }],
            },
          ],
        },
      ],
    });
  });

  it('should preserve rich Markdown semantics through StrictMode updates', () => {
    const initial = '**Bold**';
    const current = `${initial} and [link](https://example.com)\n\n- one\n- two`;
    const view = render(
      <StrictMode>
        <MemoryRouter>
          <MarkdownViewerChat isStreaming isStreamingFade>
            {initial}
          </MarkdownViewerChat>
        </MemoryRouter>
      </StrictMode>,
    );

    view.rerender(
      <StrictMode>
        <MemoryRouter>
          <MarkdownViewerChat isStreaming isStreamingFade>
            {current}
          </MarkdownViewerChat>
        </MemoryRouter>
      </StrictMode>,
    );

    expect(view.container.querySelector('[data-streamdown="strong"]')).toHaveTextContent('Bold');
    expect(view.container.querySelector('a')).toHaveAttribute('href', 'https://example.com/');
    expect(view.container.querySelectorAll('li')).toHaveLength(2);
    expect(fadingText(view.container).join('')).not.toContain('Bold');
    expect(view.container).toHaveTextContent('Bold and link');
  });
});
