import { createStarryNight } from '@wooorm/starry-night';
import { toJsxRuntime } from 'hast-util-to-jsx-runtime';
import { Fragment, jsx, jsxs } from 'react/jsx-runtime';
import type { JSX } from 'react';
import type { LinkDescriptor } from 'react-router';
import type { ClassValue } from 'clsx';
import sourceJavascript from '@wooorm/starry-night/source.js';
import sourceTsx from '@wooorm/starry-night/source.tsx';
import sourceTypescript from '@wooorm/starry-night/source.ts';
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

const starryNight = await createStarryNight([sourceJavascript, sourceTsx, sourceTypescript]);

type CodeViewerProps = {
  readonly text: string;
  readonly language: Language;
  readonly className?: ClassValue;
};

export function CodeViewer({ text, language, className }: CodeViewerProps): JSX.Element {
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
        className,
      )}
    >
      {reactNode}
    </div>
  );
}
