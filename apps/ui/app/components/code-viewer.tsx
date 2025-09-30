import { useShikiHighlighter } from 'react-shiki/core';
import type { ClassValue } from 'clsx';
import { useTheme } from 'remix-themes';
import { cn } from '#utils/ui.js';
import { highlighter } from '#lib/shiki.js';

export type CodeLanguage = 'typescript' | 'kcl' | 'javascript' | 'jsx' | 'tsx';

type CodeViewerProps = {
  readonly text: string;
  readonly language: CodeLanguage;
  readonly className?: ClassValue;
};

export function CodeViewer({ text, language, className }: CodeViewerProps): React.JSX.Element {
  const [theme] = useTheme();

  const highlightedCode = useShikiHighlighter(text, language, `github-${theme}`, { delay: 0, highlighter });

  return (
    <div className={cn('text-sm [&_pre]:my-0 [&_pre]:bg-transparent! [&_pre]:p-0 [&_pre]:leading-[1.45]', className)}>
      {highlightedCode}
    </div>
  );
}
