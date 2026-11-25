import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { createHeaderAnchor, slugify } from '#components/markdown/markdown-header-anchor.js';

describe('slugify', () => {
  it('converts text to lowercase', () => {
    expect(slugify('Hello World')).toBe('hello-world');
  });

  it('replaces spaces with hyphens', () => {
    expect(slugify('hello world')).toBe('hello-world');
  });

  it('replaces multiple spaces with single hyphen', () => {
    expect(slugify('hello   world')).toBe('hello-world');
  });

  it('trims whitespace', () => {
    expect(slugify('  hello world  ')).toBe('hello-world');
  });

  it('removes special characters except dots and hyphens', () => {
    expect(slugify('Hello! @World#')).toBe('hello-world');
  });

  it('preserves dots between numbers', () => {
    expect(slugify('3.1 Personal Data')).toBe('3.1-personal-data');
    expect(slugify('9.2.1 AI Service Improvement')).toBe('9.2.1-ai-service-improvement');
  });

  it('removes dots before hyphens', () => {
    expect(slugify('3. Information We Collect')).toBe('3-information-we-collect');
  });

  it('removes dots after hyphens', () => {
    // Edge case: ".-" after spaces become hyphens results in "--" which is kept
    expect(slugify('Test-. Value')).toBe('test-value');
  });

  it('handles complex section numbers', () => {
    expect(slugify('12.3.4 Complex Section')).toBe('12.3.4-complex-section');
  });

  it('handles titles without numbers', () => {
    expect(slugify('Privacy Policy')).toBe('privacy-policy');
  });

  it('handles underscores', () => {
    expect(slugify('hello_world')).toBe('hello_world');
  });

  it('handles empty string', () => {
    expect(slugify('')).toBe('');
  });

  it('handles string with only spaces', () => {
    expect(slugify('   ')).toBe('');
  });
});

describe('createHeaderAnchor', () => {
  it('creates an h1 component', () => {
    const H1 = createHeaderAnchor('h1', 'text-3xl font-bold');
    render(<H1>Test Heading</H1>);

    const heading = screen.getByRole('heading', { level: 1 });
    expect(heading).toBeInTheDocument();
    expect(heading).toHaveTextContent('Test Heading');
  });

  it('creates an h2 component', () => {
    const H2 = createHeaderAnchor('h2', 'text-2xl font-semibold');
    render(<H2>Test Heading</H2>);

    const heading = screen.getByRole('heading', { level: 2 });
    expect(heading).toBeInTheDocument();
  });

  it('creates an h3 component', () => {
    const H3 = createHeaderAnchor('h3', 'text-xl font-semibold');
    render(<H3>Test Heading</H3>);

    const heading = screen.getByRole('heading', { level: 3 });
    expect(heading).toBeInTheDocument();
  });

  it('sets the id attribute from slugified text', () => {
    const H1 = createHeaderAnchor('h1', 'text-3xl');
    render(<H1>3.1 Personal Data</H1>);

    const heading = screen.getByRole('heading', { level: 1 });
    expect(heading).toHaveAttribute('id', '3.1-personal-data');
  });

  it('includes anchor link with correct href', () => {
    const H1 = createHeaderAnchor('h1', 'text-3xl');
    render(<H1>Test Heading</H1>);

    const link = screen.getByRole('link', { name: 'Link to this section' });
    expect(link).toHaveAttribute('href', '#test-heading');
  });

  it('applies heading className', () => {
    const H1 = createHeaderAnchor('h1', 'text-3xl font-bold');
    render(<H1>Test Heading</H1>);

    const heading = screen.getByRole('heading', { level: 1 });
    expect(heading).toHaveClass('text-3xl', 'font-bold');
  });

  it('applies additional className from props', () => {
    const H1 = createHeaderAnchor('h1', 'text-3xl');
    render(<H1 className='custom-class'>Test Heading</H1>);

    const heading = screen.getByRole('heading', { level: 1 });
    expect(heading).toHaveClass('custom-class');
  });

  it('includes group class for hover behavior', () => {
    const H1 = createHeaderAnchor('h1', 'text-3xl');
    render(<H1>Test Heading</H1>);

    const heading = screen.getByRole('heading', { level: 1 });
    expect(heading).toHaveClass('group');
  });

  it('includes scroll margin class', () => {
    const H1 = createHeaderAnchor('h1', 'text-3xl');
    render(<H1>Test Heading</H1>);

    const heading = screen.getByRole('heading', { level: 1 });
    expect(heading).toHaveClass('scroll-mt-(--header-height)');
  });

  it('renders link icon inside anchor', () => {
    const H1 = createHeaderAnchor('h1', 'text-3xl');
    render(<H1>Test Heading</H1>);

    const link = screen.getByRole('link', { name: 'Link to this section' });
    const svg = link.querySelector('svg');
    expect(svg).toBeInTheDocument();
    expect(svg).toHaveAttribute('aria-hidden', 'true');
  });

  it('sets tabIndex to -1 on anchor link', () => {
    const H1 = createHeaderAnchor('h1', 'text-3xl');
    render(<H1>Test Heading</H1>);

    const link = screen.getByRole('link', { name: 'Link to this section' });
    expect(link).toHaveAttribute('tabIndex', '-1');
  });
});
