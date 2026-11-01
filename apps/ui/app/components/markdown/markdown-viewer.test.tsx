import { render } from '@testing-library/react';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { MarkdownViewer } from '#components/markdown/markdown-viewer.js';

const streamdownPropsMock = vi.hoisted(() => vi.fn());

vi.mock('streamdown', () => ({
  defaultRehypePlugins: { sanitize: vi.fn() },
  defaultRemarkPlugins: {},
  Streamdown: ({ children, ...properties }: { children: ReactNode }) => {
    streamdownPropsMock(properties);
    return <div data-testid='streamdown'>{children}</div>;
  },
}));

describe('MarkdownViewer', () => {
  beforeEach(() => {
    streamdownPropsMock.mockClear();
  });

  it('should leave code highlighting to Tau and pass Streamdown no Shiki theme', () => {
    render(<MarkdownViewer>content</MarkdownViewer>);
    expect(streamdownPropsMock.mock.lastCall?.[0]).not.toHaveProperty('shikiTheme');
  });

  it('should forward the latest Streamdown options and install only the plugins it renders through (D-UI-18)', () => {
    render(
      <MarkdownViewer caret='circle' lineNumbers={false} normalizeHtmlIndentation>
        content
      </MarkdownViewer>,
    );

    /* oxlint-disable typescript/no-unsafe-assignment -- Vitest asymmetric matchers intentionally use any. */
    expect(streamdownPropsMock).toHaveBeenLastCalledWith(
      expect.objectContaining({
        caret: 'circle',
        lineNumbers: false,
        normalizeHtmlIndentation: true,
        plugins: {
          cjk: expect.anything(),
          math: expect.anything(),
        },
      }),
    );
    /* oxlint-enable typescript/no-unsafe-assignment */
  });
});
