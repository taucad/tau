import type { ClassValue } from 'clsx';
import { cn } from '@taucad/ui/utils/cn';
import { HighlightedLine } from '#components/code/highlighted-line.js';
import { useHighlightedLines } from '#components/code/use-highlighted-lines.js';
import type { HighlightLanguageInput } from '#lib/code-language-resolution.js';
import { resolveHighlightLanguage } from '#lib/code-language-resolution.js';

type CodeViewerProps = {
  readonly text: string;
  readonly language?: HighlightLanguageInput;
  readonly className?: ClassValue;
};

const codeViewerClassName =
  'not-fumadocs-codeblock text-sm [&_pre]:m-0 [&_pre]:my-0 [&_pre]:bg-transparent! [&_pre]:p-0 [&_pre]:leading-[1.45]';

/** Read-only code with the editor's Lezer highlighting; plain until the language's parser has loaded. */
export function CodeViewer({ text, language, className }: CodeViewerProps): React.JSX.Element {
  const resolved = resolveHighlightLanguage(language);
  const { lines, isHighlighted } = useHighlightedLines(text, resolved.language);

  return (
    <div
      className={cn(codeViewerClassName, className)}
      data-language={resolved.language}
      data-highlight-state={isHighlighted ? 'ready' : 'plain'}
    >
      <pre className='m-0 bg-transparent p-0 leading-[1.45]'>
        <code>
          {lines.map((segments, index) => (
            // oxlint-disable-next-line react/no-array-index-key -- lines are positional
            <span key={index} className='line'>
              <HighlightedLine segments={segments} />
              {index < lines.length - 1 ? '\n' : null}
            </span>
          ))}
        </code>
      </pre>
    </div>
  );
}
