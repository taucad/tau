// Import type { SyntaxHighlighterProps } from 'react-syntax-highlighter';
// import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import { common, createStarryNight } from '@wooorm/starry-night';
import { toJsxRuntime } from 'hast-util-to-jsx-runtime';
import { Fragment, jsx, jsxs } from 'react/jsx-runtime';
import type { JSX } from 'react';
import type { LinkDescriptor } from 'react-router';
import { starryNightGutter } from '@/components/hast-util-starry-night-gutter.js';
import stylesUrl from '@/components/code-viewer.css?url';
import { cn } from '@/utils/ui.js';

export const codeViewerLinks: LinkDescriptor[] = [{ rel: 'stylesheet', href: stylesUrl }];

type Language = 'typescript' | 'kcl' | 'javascript';

const displayLanguageFromOriginalLanguage: Record<Language, Language> = {
  typescript: 'typescript',
  kcl: 'typescript',
  javascript: 'javascript',
} as const;

const starryNight = await createStarryNight(common);

type CodeViewerProps = {
  readonly text: string;
  readonly language: Language;
};

export function CodeViewer({ text, language }: CodeViewerProps): JSX.Element {
  const displayLanguage = displayLanguageFromOriginalLanguage[language];
  const scope = starryNight.flagToScope(displayLanguage);
  const tree = starryNight.highlight(text, scope!);
  const treeWithGutter = starryNightGutter(tree);
  const reactNode = toJsxRuntime(treeWithGutter, { Fragment, jsx, jsxs }) as JSX.Element;

  return (
    <div
      className={cn(
        'h-auto overflow-x-scroll p-2 font-mono whitespace-pre [&_.line]:block [&_.line]:h-4.5 [&_.line]:leading-normal',
        // Gutter
        '[&_.line]:relative [&_.line::before]:mr-4 [&_.line::before]:inline-block [&_.line::before]:w-6 [&_.line::before]:text-right [&_.line::before]:text-muted-foreground [&_.line::before]:content-[attr(data-line-number)] [&_.line::before]:select-none',
      )}
    >
      {reactNode}
    </div>
  );
}
