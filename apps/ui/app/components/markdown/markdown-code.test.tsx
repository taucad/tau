import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { MarkdownCode } from '#components/markdown/markdown-code.js';
import { extractLanguageFromClassName } from '#lib/code-language-resolution.js';

// Mock the CollapsibleCodeBlock component
vi.mock('#components/ui/collapsible-code-block.js', () => ({
  CollapsibleCodeBlock: ({
    language,
    title,
    text,
    className,
  }: {
    readonly language: string;
    readonly title: string;
    readonly text: string;
    readonly className: string;
  }) => (
    <div
      data-testid='collapsible-code-block'
      data-language={language}
      data-title={title}
      data-text={text}
      className={className}
    >
      {text}
    </div>
  ),
}));

// Mock the InlineCode component
vi.mock('#components/code/code-block.js', () => ({
  InlineCode: ({
    children,
    className,
    ...rest
  }: {
    readonly children: React.ReactNode;
    readonly className?: string;
  }) => (
    <code data-testid='inline-code' className={className} {...rest}>
      {children}
    </code>
  ),
}));

describe('extractLanguageFromClassName', () => {
  it('extracts language from "language-typescript" class', () => {
    expect(extractLanguageFromClassName('language-typescript')).toBe('typescript');
  });

  it('extracts language from "language-javascript" class', () => {
    expect(extractLanguageFromClassName('language-javascript')).toBe('javascript');
  });

  it('extracts language from "language-python" class', () => {
    expect(extractLanguageFromClassName('language-python')).toBe('python');
  });

  it('extracts language from class with multiple classes', () => {
    expect(extractLanguageFromClassName('some-class language-rust another-class')).toBe('rust');
  });

  it('returns undefined for className without language prefix', () => {
    expect(extractLanguageFromClassName('some-other-class')).toBeUndefined();
  });

  it('returns undefined for undefined className', () => {
    expect(extractLanguageFromClassName(undefined)).toBeUndefined();
  });

  it('returns undefined for empty string', () => {
    expect(extractLanguageFromClassName('')).toBeUndefined();
  });

  it('handles language names with only letters', () => {
    expect(extractLanguageFromClassName('language-go')).toBe('go');
  });

  it('handles language names with numbers', () => {
    expect(extractLanguageFromClassName('language-c99')).toBe('c99');
  });

  it('handles language names with punctuation', () => {
    expect(extractLanguageFromClassName('language-c++')).toBe('c++');
    expect(extractLanguageFromClassName('language-shell-session')).toBe('shell-session');
    expect(extractLanguageFromClassName('language-objective-c')).toBe('objective-c');
  });
});

describe('MarkdownCode', () => {
  describe('code blocks (with language)', () => {
    it('renders CollapsibleCodeBlock when language class is present', () => {
      render(<MarkdownCode className='language-typescript'>const x = 1;</MarkdownCode>);

      expect(screen.getByTestId('collapsible-code-block')).toBeInTheDocument();
    });

    it('passes language to CollapsibleCodeBlock', () => {
      render(<MarkdownCode className='language-python'>print(&quot;hello&quot;)</MarkdownCode>);

      const codeBlock = screen.getByTestId('collapsible-code-block');
      expect(codeBlock).toHaveAttribute('data-language', 'python');
    });

    it('passes language as title to CollapsibleCodeBlock', () => {
      render(<MarkdownCode className='language-rust'>fn main() {}</MarkdownCode>);

      const codeBlock = screen.getByTestId('collapsible-code-block');
      expect(codeBlock).toHaveAttribute('data-title', 'rust');
    });

    it('passes text content to CollapsibleCodeBlock', () => {
      render(<MarkdownCode className='language-javascript'>console.log(&quot;test&quot;)</MarkdownCode>);

      const codeBlock = screen.getByTestId('collapsible-code-block');
      expect(codeBlock).toHaveAttribute('data-text', 'console.log("test")');
    });

    it('strips trailing newline from text', () => {
      render(<MarkdownCode className='language-javascript'>{'const x = 1;\n'}</MarkdownCode>);

      const codeBlock = screen.getByTestId('collapsible-code-block');
      expect(codeBlock).toHaveAttribute('data-text', 'const x = 1;');
    });

    it('passes className to CollapsibleCodeBlock', () => {
      render(<MarkdownCode className='language-go custom-class'>package main</MarkdownCode>);

      const codeBlock = screen.getByTestId('collapsible-code-block');
      expect(codeBlock).toHaveClass('language-go', 'custom-class');
    });
  });

  describe('inline code (without language)', () => {
    it('renders InlineCode when no language class is present', () => {
      render(<MarkdownCode>inline code</MarkdownCode>);

      expect(screen.getByTestId('inline-code')).toBeInTheDocument();
    });

    it('renders InlineCode with className that has no language prefix', () => {
      render(<MarkdownCode className='some-class'>inline code</MarkdownCode>);

      expect(screen.getByTestId('inline-code')).toBeInTheDocument();
    });

    it('renders children in InlineCode', () => {
      render(<MarkdownCode>my inline code</MarkdownCode>);

      expect(screen.getByText('my inline code')).toBeInTheDocument();
    });

    it('passes className to InlineCode', () => {
      render(<MarkdownCode className='custom-inline-class'>code</MarkdownCode>);

      const inlineCode = screen.getByTestId('inline-code');
      expect(inlineCode).toHaveClass('custom-inline-class');
    });

    it('passes additional props to InlineCode', () => {
      render(<MarkdownCode data-custom='value'>code</MarkdownCode>);

      const inlineCode = screen.getByTestId('inline-code');
      expect(inlineCode).toHaveAttribute('data-custom', 'value');
    });
  });
});
