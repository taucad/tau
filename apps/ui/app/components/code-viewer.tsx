import ShikiHighlighter from 'react-shiki';
import type { JSX } from 'react';
import type { ClassValue } from 'clsx';
import { Theme, useTheme } from 'remix-themes';
import { cn } from '@/utils/ui.js';

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

  return (
    <div className={cn('[&_pre]:my-0 [&_pre]:bg-transparent! [&_pre]:leading-[1.45]', className)}>
      <ShikiHighlighter
        showLanguage={false}
        delay={300}
        language={mappedLanguage}
        addDefaultStyles={false}
        theme={theme === Theme.DARK ? 'github-dark' : 'github-light'}
      >
        {text}
      </ShikiHighlighter>
    </div>
  );
}
