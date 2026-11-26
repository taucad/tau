// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { MemoryRouter } from 'react-router';
import { MarkdownViewer } from '#components/markdown/markdown-viewer.js';
import { MarkdownImage, remoteImageHost } from '#components/markdown/markdown-image.js';

afterEach(cleanup);

const renderMarkdown = (markdown: string) =>
  render(
    <MemoryRouter>
      <MarkdownViewer>{markdown}</MarkdownViewer>
    </MemoryRouter>,
  );

/** Every URL the rendered DOM would load on its own: image sources, source sets and style URLs. */
const loadedUrls = (container: HTMLElement): string[] => [
  ...[...container.querySelectorAll('img')].map((image) => image.getAttribute('src') ?? ''),
  ...[...container.querySelectorAll('[srcset]')].map((element) => element.getAttribute('srcset') ?? ''),
  ...[...container.querySelectorAll('[style]')].map((element) => element.getAttribute('style') ?? ''),
];

describe('MarkdownImage', () => {
  it('should load no image from another host on render, however the text asks for one', async () => {
    const { container } = renderMarkdown(
      [
        'Done. ![](https://elsewhere.example/a?d=c2VjcmV0)',
        '<img src="https://elsewhere.example/b?d=1">',
        '<picture><source srcset="https://elsewhere.example/c?d=2"><img src="https://elsewhere.example/d?d=3"></picture>',
        '<span style="background:url(https://elsewhere.example/e?d=4)">x</span>',
        '<img src="//elsewhere.example/f?d=5">',
      ].join('\n\n'),
    );
    await screen.findByText(/Done\./u);

    expect(loadedUrls(container).filter((url) => url.includes('elsewhere.example'))).toEqual([]);
    expect(screen.getAllByRole('button', { name: /from elsewhere\.example: load/u }).length).toBeGreaterThan(0);
  });

  it('should load a remote image once the person asks, with no referrer', async () => {
    const { container } = renderMarkdown('![diagram](https://elsewhere.example/diagram.png)');

    fireEvent.click(await screen.findByRole('button', { name: 'diagram from elsewhere.example: load' }));

    const image = container.querySelector('img');
    expect(image).toHaveAttribute('src', 'https://elsewhere.example/diagram.png');
    expect(image).toHaveAttribute('referrerpolicy', 'no-referrer');
  });

  it('should load a linked image without following its link', async () => {
    const { container } = renderMarkdown('[![build](https://badges.example/ci.svg)](https://ci.example/runs)');
    const button = await screen.findByRole('button', { name: 'build from badges.example: load' });
    expect(button.closest('a')).toHaveAttribute('href', 'https://ci.example/runs');

    /* `fireEvent` answers false when a handler cancelled the click, which is what keeps the link from opening. */
    expect(fireEvent.click(button)).toBe(false);
    expect(container.querySelector('img')).toHaveAttribute('src', 'https://badges.example/ci.svg');
  });

  it('should ask again when the same image takes another remote source', () => {
    const { container, rerender } = render(<MarkdownImage src='https://elsewhere.example/a.png' alt='plot' />);
    fireEvent.click(screen.getByRole('button', { name: 'plot from elsewhere.example: load' }));
    expect(container.querySelector('img')).toHaveAttribute('src', 'https://elsewhere.example/a.png');

    rerender(<MarkdownImage src='https://elsewhere.example/a.png' alt='plot' />);
    expect(container.querySelector('img')).toHaveAttribute('src', 'https://elsewhere.example/a.png');

    rerender(<MarkdownImage src='https://other.example/b.png?d=secret' alt='plot' />);
    expect(container.querySelector('img')).toBeNull();
    expect(screen.getByRole('button', { name: 'plot from other.example: load' })).toBeInTheDocument();
  });

  it('should load an image from this origin at once', async () => {
    const { container } = renderMarkdown('![part](/assets/part.png)');
    await screen.findByRole('img', { name: 'part' });

    expect(container.querySelector('img')).toHaveAttribute('src', '/assets/part.png');
  });

  it('should still render math, which the math plugin draws after sanitizing', async () => {
    const { container } = renderMarkdown('Area is $x^2$.');
    await screen.findByText(/Area is/u);

    expect(container.querySelector('.katex')).not.toBeNull();
  });
});

describe('MarkdownImage on the server', () => {
  /* The server and the render that hydrates it must agree, whatever origin the page turns out to have. */
  it('should render an absolute image as the load button on the server, as the hydrating render does', async () => {
    const { renderToString } = await import('react-dom/server');
    const html = renderToString(<MarkdownImage src={`${globalThis.location.origin}/logo.png`} alt='logo' />);

    expect(html).toContain('<button');
    expect(html).not.toContain('<img');
  });
});

describe('remoteImageHost', () => {
  it.each([
    ['https://elsewhere.example/x', 'elsewhere.example'],
    ['//elsewhere.example/x', 'elsewhere.example'],
    ['http://app.example/x', 'app.example'],
    ['/local.png', undefined],
    ['local.png', undefined],
    ['https://app.example/x', undefined],
  ])('should place %s on %s', (source, host) => {
    expect(remoteImageHost(source, 'https://app.example/w/p')).toBe(host);
  });
});
