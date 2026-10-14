import { MemoryRouter } from 'react-router';
import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { LegalDocument } from '#routes/legal/legal-document.js';

vi.mock('#components/markdown/markdown-viewer.js', () => ({
  MarkdownViewer: ({ children }: { readonly children: string }) => <article>{children}</article>,
}));

describe('LegalDocument', () => {
  it('should retain the source title, fragment target and complete body without a duplicate title', () => {
    render(
      <MemoryRouter>
        <LegalDocument>
          {'# Privacy Policy - TauCAD Limited\n\nLast updated: September 2026\n\n## 1. Scope\nThe original terms.'}
        </LegalDocument>
      </MemoryRouter>,
    );

    expect(screen.getByRole('link', { name: 'All legal documents' })).toHaveAttribute('href', '/legal');
    expect(screen.getAllByRole('heading', { level: 1 })).toHaveLength(1);
    expect(screen.getByRole('heading', { level: 1 })).toMatchTextContent('Privacy Policy - TauCAD Limited');
    expect(document.querySelector('#privacy-policy-taucad-limited')).toContainElement(
      screen.getByRole('heading', { level: 1 }),
    );
    expect(screen.getByRole('article').textContent).toBe(
      '\nLast updated: September 2026\n\n## 1. Scope\nThe original terms.',
    );
  });
});
