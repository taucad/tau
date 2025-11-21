import type { ComponentProps } from 'react';
import { cva } from 'class-variance-authority';
import type { VariantProps } from 'class-variance-authority';
import type { CodeLanguage } from '@taucad/types';
import { CodeViewer } from '#components/code/code-viewer.js';
import { cn } from '#utils/ui.utils.js';

// Root CodeBlock container variants
const codeBlockVariants = cva(
  '@container/code group/codeblock overflow-hidden rounded-lg border font-sans not-prose text-sm bg-neutral/10',
  {
    variants: {
      variant: {
        standard: 'relative',
        floating: 'relative',
      },
    },
    defaultVariants: {
      variant: 'standard',
    },
  },
);

// Header variants
const codeBlockHeaderVariants = cva('flex flex-row items-center justify-between text-foreground/50', {
  variants: {
    variant: {
      standard: 'sticky top-0 border-b p-0.25 pl-3 bg-neutral/5',
      floating: 'absolute top-0.25 right-0.25 z-10 p-0',
    },
  },
  defaultVariants: {
    variant: 'standard',
  },
});

// Action container variants
const codeBlockActionVariants = cva('flex flex-row gap-1', {
  variants: {
    variant: {
      standard: '',
      floating: 'p-0.25',
    },
    visibility: {
      inivisibleUntilHover: 'md:opacity-0 md:group-hover/codeblock:opacity-100 md:transition-opacity',
      alwaysVisible: '',
    },
  },
  defaultVariants: {
    variant: 'standard',
    visibility: 'inivisibleUntilHover',
  },
});

// Title variants
const codeBlockTitleVariants = cva('text-xs', {
  variants: {
    variant: {
      standard: '',
      floating: 'hidden',
    },
  },
  defaultVariants: {
    variant: 'standard',
  },
});

type CodeBlockProps = ComponentProps<'div'> & VariantProps<typeof codeBlockVariants>;

type CodeBlockHeaderProps = ComponentProps<'div'> & VariantProps<typeof codeBlockHeaderVariants>;

type CodeBlockActionProps = ComponentProps<'div'> & VariantProps<typeof codeBlockActionVariants>;

type CodeBlockTitleProps = ComponentProps<'div'> & VariantProps<typeof codeBlockTitleVariants>;

/**
 * Root CodeBlock container component
 */
export function CodeBlock({ children, variant = 'standard', className, ...rest }: CodeBlockProps): React.JSX.Element {
  return (
    <div {...rest} data-slot="codeblock" className={cn(codeBlockVariants({ variant, className }))}>
      {children}
    </div>
  );
}

/**
 * CodeBlock header component - contains title and actions
 */
export function CodeBlockHeader({ variant, className, children, ...rest }: CodeBlockHeaderProps): React.JSX.Element {
  return (
    <div {...rest} data-slot="codeblock-header" className={cn(codeBlockHeaderVariants({ variant, className }))}>
      {children}
    </div>
  );
}

/**
 * CodeBlock title component - displays the code block title/filename
 */
export function CodeBlockTitle({ variant, className, children, ...rest }: CodeBlockTitleProps): React.JSX.Element {
  return (
    <div {...rest} data-slot="codeblock-title" className={cn(codeBlockTitleVariants({ variant, className }))}>
      {children}
    </div>
  );
}

/**
 * CodeBlock action container - houses action buttons like copy
 */
export function CodeBlockAction({
  variant,
  visibility,
  className,
  children,
  ...rest
}: CodeBlockActionProps): React.JSX.Element {
  return (
    <div
      {...rest}
      data-slot="codeblock-action"
      className={cn(codeBlockActionVariants({ variant, visibility, className }))}
    >
      {children}
    </div>
  );
}

/**
 * CodeBlock content wrapper
 */
export function CodeBlockContent({ children, className, ...rest }: ComponentProps<'div'>): React.JSX.Element {
  return (
    <div {...rest} data-slot="codeblock-content" className={cn('overflow-x-auto py-2', className)}>
      {children}
    </div>
  );
}

type PreProps = ComponentProps<'pre'> & {
  readonly language?: string;
};

export function Pre({ children, language, className, ...rest }: PreProps): React.JSX.Element {
  // eslint-disable-next-line @typescript-eslint/no-base-to-string -- Convert children to string
  const text = String(children).replace(/\n$/, '');

  // Render with syntax highlighting if language is detected
  if (language) {
    return <CodeViewer language={language as CodeLanguage} text={text} className={className} />;
  }

  // Fallback to regular pre element
  return (
    <pre {...rest} className={className}>
      {children}
    </pre>
  );
}

export function InlineCode({ children, className, ...rest }: ComponentProps<'code'>): React.JSX.Element {
  return (
    <code
      {...rest}
      data-slot="inline-code"
      className={cn(
        className,
        'rounded-sm border bg-neutral/10 px-1 py-0.5 font-normal text-foreground/80 before:content-none after:content-none',
      )}
    >
      {children}
    </code>
  );
}
