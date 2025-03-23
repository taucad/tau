import Markdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import remarkMath from 'remark-math';
import rehypeKatex from 'rehype-katex';
import { cn } from '@/utils/ui';
import { CopyButton } from '@/components/copy-button';
import { CodeViewer } from '@/components/code-viewer';

import katexUrl from 'katex/dist/katex.min.css?url';
import type { LinkDescriptor } from '@remix-run/node';
import { Button } from './ui/button';
import { Play } from 'lucide-react';
import { Tooltip, TooltipContent, TooltipTrigger } from './ui/tooltip';

export const markdownViewerLinks: LinkDescriptor[] = [{ rel: 'stylesheet', href: katexUrl }];

export const MarkdownViewer = ({
  children,
  onCodeApply,
}: {
  children: string;
  onCodeApply?: (code: string) => void;
}) => {
  return (
    <Markdown
      className={cn(
        'text-sm prose text-foreground w-full max-w-full',
        '[--tw-prose-headings:text-foreground]',
        '[--tw-prose-bullets:text-foreground]',
        '[--tw-prose-bold:text-foreground]',
        '[--tw-prose-counters:text-foreground]',
        '[--tw-prose-lead:text-foreground]',
        '[--tw-prose-quotes:text-foreground]',
        '[--tw-prose-quote-borders:text-foreground]',
        '[--tw-prose-kbd:text-foreground]',
        '[--tw-prose-links:text-foreground]',
        /* <pre> */
        'prose-pre:p-0 prose-pre:ps-0 prose-pre:pe-0 prose-pre:bg-neutral/10',
      )}
      remarkPlugins={[remarkGfm, remarkMath]}
      rehypePlugins={[rehypeKatex]}
      components={{
        a: (properties) => {
          const { children, ...rest } = properties;
          return (
            <a {...rest} target="_blank" rel="noopener noreferrer">
              {children}
            </a>
          );
        },
        code: (properties) => {
          const { children, className, ref, node, style, ...rest } = properties;
          const match = /language-(\w+)/.exec(className || '');
          const language = match ? match[1] : 'text';

          const text = String(children).replace(/\n$/, '');

          return match ? (
            <div className="@container/code border border-neutral-200 rounded-md font-sans overflow-hidden">
              <div className="flex flex-row justify-between items-center pl-3 pr-1 py-1 text-foreground/50 sticky top-0 border-b border-neutral/20">
                <div className="text-xs">{language}</div>
                <div className="flex flex-row gap-1">
                  <CopyButton
                    size="xs"
                    className="[&_[data-slot=label]]:hidden @xs/code:[&_[data-slot=label]]:flex"
                    text={text}
                  />
                  {onCodeApply && (
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Button size="xs" variant="ghost" className="flex" onClick={() => onCodeApply(text)}>
                          <span className="hidden @xs/code:block">Apply</span>
                          <Play />
                        </Button>
                      </TooltipTrigger>
                      <TooltipContent>Apply code</TooltipContent>
                    </Tooltip>
                  )}
                </div>
              </div>
              {/* <div className={cn('relative max-h-64', isExpanded ? 'max-h-none' : 'overflow-y-auto')}> */}
              <div>
                <CodeViewer {...rest} children={text} language={language} />

                {/* FIXME: ensure the code viewer doesn't auto-collapse during scrolling */}
                {/* <Button
                  variant="ghost"
                  size="xs"
                  className="h-4 text-foreground/50 sticky bottom-0 w-full text-center rounded-none hover:bg-neutral/20"
                  onClick={() => setIsExpanded((previous) => !previous)}
                >
                  <ChevronDown className={cn('transition-transform', isExpanded ? 'rotate-x-180' : '')} />
                </Button> */}
              </div>
            </div>
          ) : (
            <code
              {...rest}
              className={cn(
                className,
                'bg-neutral/20 text-foreground/80 px-1 py-0.5 font-normal rounded-sm after:content-none before:content-none',
              )}
            >
              {children}
            </code>
          );
        },
      }}
    >
      {children}
    </Markdown>
  );
};
