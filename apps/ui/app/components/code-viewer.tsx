import { useShikiHighlighter } from 'react-shiki';
import type { JSX } from 'react';
import type { ClassValue } from 'clsx';
import { useTheme } from 'remix-themes';
import { cn } from '~/utils/ui.js';

type Language = 'typescript' | 'kcl' | 'javascript' | 'jsx' | 'tsx';

const mapLanguage: Partial<Record<Language, string>> = {
  kcl: 'typescript',
} as const;

type CodeViewerProps = {
  readonly text: string;
  readonly language: string;
  readonly className?: ClassValue;
};

export function CodeViewer({ text, language, className }: CodeViewerProps): JSX.Element {
  const mappedLanguage = mapLanguage[language as Language] ?? language;
  const [theme] = useTheme();

  const highlightedCode = useShikiHighlighter(text, mappedLanguage, `github-${theme}`, { delay: 300 });

  return (
    <div className={cn('text-sm [&_pre]:my-0 [&_pre]:bg-transparent! [&_pre]:p-0 [&_pre]:leading-[1.45]', className)}>
      {highlightedCode}
    </div>
  );
}
