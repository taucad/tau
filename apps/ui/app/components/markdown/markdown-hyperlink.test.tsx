import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { MemoryRouter } from 'react-router';
import {
  isExternalLink,
  isResourceRouteHref,
  MarkdownHyperlink,
  resolveRelativeHref,
} from '#components/markdown/markdown-hyperlink.js';

describe('isExternalLink', () => {
  it('returns true for http:// URLs', () => {
    expect(isExternalLink('http://example.com')).toBe(true);
  });

  it('returns true for https:// URLs', () => {
    expect(isExternalLink('https://example.com')).toBe(true);
  });

  it('returns false for relative paths', () => {
    expect(isExternalLink('/legal/privacy')).toBe(false);
  });

  it('returns false for anchor links', () => {
    expect(isExternalLink('#section-1')).toBe(false);
  });

  it('returns false for relative paths with anchors', () => {
    expect(isExternalLink('/legal/cookies#preferences')).toBe(false);
  });

  it('returns false for undefined', () => {
    expect(isExternalLink(undefined)).toBe(false);
  });

  it('returns false for empty string', () => {
    expect(isExternalLink('')).toBe(false);
  });

  it('returns false for mailto: links', () => {
    expect(isExternalLink('mailto:test@example.com')).toBe(false);
  });

  it('returns false for tel: links', () => {
    expect(isExternalLink('tel:+1234567890')).toBe(false);
  });
});

describe('isResourceRouteHref', () => {
  it('returns true for .txt paths', () => {
    expect(isResourceRouteHref('/robots.txt')).toBe(true);
  });

  it('returns false for regular file extensions', () => {
    expect(isResourceRouteHref('/notes.mdx')).toBe(false);
  });

  it('returns true for .webmanifest paths', () => {
    expect(isResourceRouteHref('/manifest.webmanifest')).toBe(true);
  });

  it('returns false for HTML routes', () => {
    expect(isResourceRouteHref('/legal/privacy')).toBe(false);
  });

  it('returns false for hashed paths without an extension', () => {
    expect(isResourceRouteHref('/projects/example#details')).toBe(false);
  });

  it('returns true even when a query string is present', () => {
    expect(isResourceRouteHref('/robots.txt?foo=bar')).toBe(true);
  });
});

describe('resolveRelativeHref', () => {
  it('returns absolute paths unchanged', () => {
    expect(resolveRelativeHref('/legal/terms', '/guides/live-rendering')).toBe('/legal/terms');
  });

  it('returns anchor-only links unchanged', () => {
    expect(resolveRelativeHref('#section', '/guides/live-rendering')).toBe('#section');
  });

  it('returns scheme links unchanged', () => {
    expect(resolveRelativeHref('mailto:hello@example.com', '/guides/live-rendering')).toBe('mailto:hello@example.com');
    expect(resolveRelativeHref('https://example.com/foo', '/guides/live-rendering')).toBe('https://example.com/foo');
  });

  it('resolves ../ from a leaf URL via standard URL semantics (RFC 3986)', () => {
    // Regression: React Router's `relative='path'` would have produced
    // /guides/getting-started/quick-start (only popping `live-rendering`),
    // breaking every cross-directory MDX link.
    expect(resolveRelativeHref('../getting-started/quick-start', '/guides/live-rendering')).toBe(
      '/getting-started/quick-start',
    );
  });

  it('resolves ./sibling from a leaf URL', () => {
    expect(resolveRelativeHref('./embedding-in-a-host', '/guides/live-rendering')).toBe('/guides/embedding-in-a-host');
  });

  it('resolves a bare sibling path from a leaf URL', () => {
    expect(resolveRelativeHref('embedding-in-a-host', '/guides/live-rendering')).toBe('/guides/embedding-in-a-host');
  });

  it('preserves hash and search when resolving', () => {
    expect(resolveRelativeHref('../api/client#methods', '/guides/live-rendering')).toBe('/api/client#methods');
    expect(resolveRelativeHref('./error-handling?q=1#x', '/guides/live-rendering')).toBe(
      '/guides/error-handling?q=1#x',
    );
  });

  it('returns empty string unchanged', () => {
    expect(resolveRelativeHref('', '/guides/live-rendering')).toBe('');
  });
});

describe('MarkdownHyperlink', () => {
  describe('external links', () => {
    it('opens in new tab for https:// links', () => {
      render(
        <MemoryRouter>
          <MarkdownHyperlink href='https://example.com'>External Link</MarkdownHyperlink>
        </MemoryRouter>,
      );

      const link = screen.getByRole('link', { name: 'External Link' });
      expect(link).toHaveAttribute('target', '_blank');
    });

    it('opens in new tab for http:// links', () => {
      render(
        <MemoryRouter>
          <MarkdownHyperlink href='http://example.com'>External Link</MarkdownHyperlink>
        </MemoryRouter>,
      );

      const link = screen.getByRole('link', { name: 'External Link' });
      expect(link).toHaveAttribute('target', '_blank');
    });

    it('sets rel="noopener noreferrer" for external links', () => {
      render(
        <MemoryRouter>
          <MarkdownHyperlink href='https://example.com'>External Link</MarkdownHyperlink>
        </MemoryRouter>,
      );

      const link = screen.getByRole('link', { name: 'External Link' });
      expect(link).toHaveAttribute('rel', 'noopener noreferrer');
    });
  });

  describe('internal links', () => {
    it('opens in same tab for relative paths', () => {
      render(
        <MemoryRouter>
          <MarkdownHyperlink href='/legal/privacy'>Internal Link</MarkdownHyperlink>
        </MemoryRouter>,
      );

      const link = screen.getByRole('link', { name: 'Internal Link' });
      expect(link).not.toHaveAttribute('target');
    });

    it('opens in same tab for anchor links', () => {
      render(
        <MemoryRouter>
          <MarkdownHyperlink href='#section-1'>Anchor Link</MarkdownHyperlink>
        </MemoryRouter>,
      );

      const link = screen.getByRole('link', { name: 'Anchor Link' });
      expect(link).not.toHaveAttribute('target');
    });

    it('does not set rel for internal links', () => {
      render(
        <MemoryRouter>
          <MarkdownHyperlink href='/legal/privacy'>Internal Link</MarkdownHyperlink>
        </MemoryRouter>,
      );

      const link = screen.getByRole('link', { name: 'Internal Link' });
      expect(link).not.toHaveAttribute('rel');
    });
  });

  describe('styling', () => {
    it('applies underline class', () => {
      render(
        <MemoryRouter>
          <MarkdownHyperlink href='/test'>Link</MarkdownHyperlink>
        </MemoryRouter>,
      );

      const link = screen.getByRole('link', { name: 'Link' });
      expect(link).toHaveClass('underline');
    });

    it('applies underline-offset-3 class', () => {
      render(
        <MemoryRouter>
          <MarkdownHyperlink href='/test'>Link</MarkdownHyperlink>
        </MemoryRouter>,
      );

      const link = screen.getByRole('link', { name: 'Link' });
      expect(link).toHaveClass('underline-offset-3');
    });

    it('applies transition classes', () => {
      render(
        <MemoryRouter>
          <MarkdownHyperlink href='/test'>Link</MarkdownHyperlink>
        </MemoryRouter>,
      );

      const link = screen.getByRole('link', { name: 'Link' });
      expect(link).toHaveClass('transition-all', 'duration-200');
    });

    it('applies additional className from props', () => {
      render(
        <MemoryRouter>
          <MarkdownHyperlink href='/test' className='custom-class'>
            Link
          </MarkdownHyperlink>
        </MemoryRouter>,
      );

      const link = screen.getByRole('link', { name: 'Link' });
      expect(link).toHaveClass('custom-class');
    });
  });

  describe('attributes', () => {
    it('sets href attribute', () => {
      render(
        <MemoryRouter>
          <MarkdownHyperlink href='/legal/privacy'>Link</MarkdownHyperlink>
        </MemoryRouter>,
      );

      const link = screen.getByRole('link', { name: 'Link' });
      expect(link).toHaveAttribute('href', '/legal/privacy');
    });

    it('rewrites a relative ../ href into an absolute URL relative to the current pathname', () => {
      render(
        <MemoryRouter initialEntries={['/guides/live-rendering']}>
          <MarkdownHyperlink href='../getting-started/quick-start'>Quick Start</MarkdownHyperlink>
        </MemoryRouter>,
      );

      const link = screen.getByRole('link', { name: 'Quick Start' });
      expect(link).toHaveAttribute('href', '/getting-started/quick-start');
    });

    it('rewrites a ./sibling href into an absolute URL within the current directory', () => {
      render(
        <MemoryRouter initialEntries={['/guides/live-rendering']}>
          <MarkdownHyperlink href='./embedding-in-a-host'>Embedding</MarkdownHyperlink>
        </MemoryRouter>,
      );

      const link = screen.getByRole('link', { name: 'Embedding' });
      expect(link).toHaveAttribute('href', '/guides/embedding-in-a-host');
    });

    it('renders children', () => {
      render(
        <MemoryRouter>
          <MarkdownHyperlink href='/test'>Click me</MarkdownHyperlink>
        </MemoryRouter>,
      );

      expect(screen.getByText('Click me')).toBeInTheDocument();
    });

    it('renders resource-route hrefs as plain anchors so the browser can do a full document load', () => {
      render(
        <MemoryRouter>
          <MarkdownHyperlink href='/robots.txt'>robots.txt</MarkdownHyperlink>
        </MemoryRouter>,
      );

      const link = screen.getByRole('link', { name: 'robots.txt' });
      expect(link).toHaveAttribute('href', '/robots.txt');
    });

    it('passes through additional props', () => {
      render(
        <MemoryRouter>
          <MarkdownHyperlink href='/test' data-testid='custom-link'>
            Link
          </MarkdownHyperlink>
        </MemoryRouter>,
      );

      expect(screen.getByTestId('custom-link')).toBeInTheDocument();
    });
  });
});
