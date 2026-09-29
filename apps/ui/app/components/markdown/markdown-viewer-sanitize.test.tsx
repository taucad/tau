// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { MemoryRouter } from 'react-router';
import { MarkdownViewer } from '#components/markdown/markdown-viewer.js';

vi.mock('#hooks/use-theme.js', () => ({ useTheme: () => ({ isHighContrast: false }) }));

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
});
