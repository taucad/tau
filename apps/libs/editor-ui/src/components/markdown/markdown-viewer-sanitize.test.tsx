// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { MemoryRouter } from 'react-router';
import { MarkdownViewer } from '#components/markdown/markdown-viewer.js';

afterEach(cleanup);

describe('MarkdownViewer sanitizer', () => {
  it('keeps report markdown while refusing executable markup and links', async () => {
    const markdown =
      '# Review\n\n- **Ready** item\n\n[Report](https://example.com/report)\n\n[Bad](javascript:alert(1))\n\n<script>alert(2)</script>\n\n<img src="x" onerror="alert(3)">';
    const { container } = render(
      <MemoryRouter>
        <MarkdownViewer>{markdown}</MarkdownViewer>
      </MemoryRouter>,
    );
    expect(await screen.findByRole('heading', { name: 'Review' })).toBeVisible();
    expect(screen.getByText('Ready')).toBeVisible();
    expect(screen.getByRole('link', { name: 'Report' })).toHaveAttribute('href', 'https://example.com/report');
    expect(container.querySelector('script')).toBeNull();
    expect(container.querySelector('[onerror]')).toBeNull();
    expect(container.querySelector('[href^="javascript:"]')).toBeNull();
  });

  it('keeps no styling a reply could use to draw over the app or pass for one of its controls', async () => {
    const markdown = [
      'Reply.',
      '<a href="https://elsewhere.example/p"><span style="position:fixed;inset:0;z-index:2147483647">Session expired: sign in again</span></a>',
      '<svg style="position:fixed;inset:0"><path d="M0 0h10v10z"/></svg>',
      '<div class="fixed inset-0 z-50">Allow once</div>',
    ].join('\n\n');
    const { container } = render(
      <MemoryRouter>
        <MarkdownViewer>{markdown}</MarkdownViewer>
      </MemoryRouter>,
    );
    await screen.findByText('Reply.');

    expect(screen.getByText('Session expired: sign in again')).toBeVisible();
    expect(container.querySelector('[style]')).toBeNull();
    expect(container.querySelector('svg path[d="M0 0h10v10z"]')).toBeNull();
    expect(container.querySelector('.fixed')).toBeNull();
  });
});
