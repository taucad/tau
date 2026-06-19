import { useMemo, useState, useEffect } from 'react';
import { diffLines } from 'diff';
import type { ShikiTransformer } from 'shiki/types';
import { addClassToHast } from 'shiki/core';
import type { HighlighterCore } from 'shiki/core';
import { getHighlighter } from '#lib/shiki.lib.js';
import { cn } from '#utils/ui.utils.js';
import { useTheme } from '#hooks/use-theme.js';
import type { HighlightLanguageInput } from '#lib/code-language-resolution.js';
import { resolveHighlightLanguage } from '#lib/code-language-resolution.js';

/** Number of context lines to show above and below each change group. */
const contextLines = 1;

type DiffLine = {
  content: string;
  type: 'added' | 'removed' | 'context';
};

type DiffSegment = { type: 'code'; lines: DiffLine[] } | { type: 'hidden'; count: number };

/**
 * Process diff changes to only show context lines around changes.
 * Returns segments of code and hidden line counts.
 */
// oxlint-disable-next-line complexity -- diff processing has many branches by design
function processDiffWithContext(originalContent: string, modifiedContent: string): DiffSegment[] {
  const changes = diffLines(originalContent, modifiedContent);

  // First, flatten all changes into individual lines with their type
  const allLines: DiffLine[] = [];
  for (const change of changes) {
    const lines = change.value.split('\n').filter((line, index, array) => {
      // Filter out empty trailing line from split
      return !(index === array.length - 1 && line === '');
    });

    for (const line of lines) {
      if (change.added) {
        allLines.push({ content: line, type: 'added' });
      } else if (change.removed) {
        allLines.push({ content: line, type: 'removed' });
      } else {
        allLines.push({ content: line, type: 'context' });
      }
    }
  }

  // Find which context lines should be shown (within contextLines of a change)
  const showLine = Array.from<boolean>({ length: allLines.length }).fill(false);

  for (const [index, diffLine] of allLines.entries()) {
    if (diffLine.type !== 'context') {
      // This is a change - mark it and surrounding context lines
      showLine[index] = true;

      // Mark context lines before
      for (let offset = 1; offset <= contextLines && index - offset >= 0; offset++) {
        showLine[index - offset] = true;
      }

      // Mark context lines after
      for (let offset = 1; offset <= contextLines && index + offset < allLines.length; offset++) {
        showLine[index + offset] = true;
      }
    }
  }

  // Build segments - only add hidden separators BETWEEN code groups, not at start/end
  const segments: DiffSegment[] = [];
  let currentCodeLines: DiffLine[] = [];
  let hiddenCount = 0;
  let hasAddedFirstCodeSegment = false;

  for (const [index, diffLine] of allLines.entries()) {
    if (showLine[index]) {
      // Add hidden segment only if we have prior code and skipped lines between groups
      if (hiddenCount > 0 && hasAddedFirstCodeSegment) {
        if (currentCodeLines.length > 0) {
          segments.push({ type: 'code', lines: currentCodeLines });
          currentCodeLines = [];
        }

        segments.push({ type: 'hidden', count: hiddenCount });
      }

      hiddenCount = 0;
      currentCodeLines.push(diffLine);
      hasAddedFirstCodeSegment = true;
    } else {
      hiddenCount++;
    }
  }

  // Add remaining code lines (don't add trailing hidden segment)
  if (currentCodeLines.length > 0) {
    segments.push({ type: 'code', lines: currentCodeLines });
  }

  // Trim empty context lines from start and end of ALL code segments
  for (const segment of segments) {
    if (segment.type !== 'code') {
      continue;
    }

    // Trim leading empty context lines
    while (segment.lines.length > 0) {
      const firstLine = segment.lines[0];
      if (firstLine?.type === 'context' && firstLine.content.trim() === '') {
        segment.lines.shift();
      } else {
        break;
      }
    }

    // Trim trailing empty context lines
    while (segment.lines.length > 0) {
      const lastLine = segment.lines.at(-1);
      if (lastLine?.type === 'context' && lastLine.content.trim() === '') {
        segment.lines.pop();
      } else {
        break;
      }
    }
  }

  // Filter out empty code segments that may have been fully trimmed
  return segments.filter((segment) => segment.type === 'hidden' || segment.lines.length > 0);
}

/**
 * Calculate the number of visible lines in a diff (with context collapsing).
 * Useful for determining if a collapsible container should show the toggle.
 */
export function getDiffLineCount(originalContent: string, modifiedContent: string): number {
  const segments = processDiffWithContext(originalContent, modifiedContent);
  let count = 0;

  for (const segment of segments) {
    count += segment.type === 'code' ? segment.lines.length : 1;
  }

  return count;
}

/**
 * Get the line number of the first change in the modified content.
 * Useful for navigating to the first relevant change when opening a file.
 * Returns 1 if no changes are found.
 */
export function getFirstChangedLine(originalContent: string, modifiedContent: string): number {
  const changes = diffLines(originalContent, modifiedContent);
  let lineNumber = 1;

  for (const change of changes) {
    // Found a change - return the current line number
    if (change.added || change.removed) {
      return lineNumber;
    }

    // For unchanged content, count lines to track position in modified content
    const lineCount = change.value.split('\n').length - (change.value.endsWith('\n') ? 1 : 0);
    lineNumber += lineCount;
  }

  return 1;
}

/**
 * Adds `diff add` / `diff remove` classes to each Shiki line element based on
 * the diff metadata from {@link processDiffWithContext}.
 *
 * **Do not** use `transformerNotationDiff` with synthesized `// [!code ++]`
 * markers here: Shiki only strips those markers when the host grammar
 * tokenizes the prefix as a comment. Languages without `//` line comments
 * (USD, bash, JSON, STEP, STL, etc.) leave the marker visible in the output.
 *
 * @see `docs/research/diff-viewer-shiki-notation-leak.md`
 */
function buildDiffLineTransformer(lines: DiffLine[]): ShikiTransformer {
  return {
    name: 'tau:diff-line-classes',
    line(node, lineNumber) {
      const diffLine = lines[lineNumber - 1];
      if (diffLine === undefined) {
        return;
      }

      if (diffLine.type === 'added') {
        addClassToHast(node, 'diff add');
      } else if (diffLine.type === 'removed') {
        addClassToHast(node, 'diff remove');
      }
    },
  };
}

type HiddenLinesSeparatorProps = {
  readonly count: number;
};

function HiddenLinesSeparator({ count }: HiddenLinesSeparatorProps): React.JSX.Element {
  return (
    <div className='flex h-4 w-full items-center gap-1 bg-muted/10 px-1 text-[11px] text-muted-foreground'>
      <span className='w-4 border-t border-muted-foreground/20' />
      <span className='shrink-0 whitespace-nowrap'>
        {count} hidden line{count === 1 ? '' : 's'}
      </span>
      <span className='flex-1 border-t border-muted-foreground/20' />
    </div>
  );
}

type DiffViewerProps = {
  readonly originalContent: string;
  readonly modifiedContent: string;
  readonly language?: HighlightLanguageInput;
  readonly className?: string;
};

/**
 * Diff viewer with Shiki syntax highlighting.
 * Computes diff using the `diff` package, then applies per-line `diff` classes
 * via a Shiki `line` transformer (language-agnostic).
 * Shows only context lines around changes with hidden line indicators.
 */
export function DiffViewer({
  originalContent,
  modifiedContent,
  language,
  className,
}: DiffViewerProps): React.JSX.Element {
  const { theme } = useTheme();
  const [highlighter, setHighlighter] = useState<HighlighterCore | undefined>();

  useEffect(() => {
    const loadHighlighter = async () => {
      setHighlighter(await getHighlighter());
    };
    void loadHighlighter();
  }, []);

  const segments = useMemo(
    () => processDiffWithContext(originalContent, modifiedContent),
    [originalContent, modifiedContent],
  );
  const resolvedLanguage = useMemo(() => resolveHighlightLanguage(language), [language]);

  const renderedSegments = useMemo(() => {
    if (!highlighter) {
      return null;
    }

    return segments.map((segment, segmentIndex) => {
      if (segment.type === 'hidden') {
        // oxlint-disable-next-line react/no-array-index-key -- segments are stable during render
        return <HiddenLinesSeparator key={`hidden-${segmentIndex}`} count={segment.count} />;
      }

      const sourceText = segment.lines.map((line) => line.content).join('\n');
      const html = highlighter.codeToHtml(sourceText, {
        lang: resolvedLanguage.shikiLanguage,
        theme: `github-${theme}`,
        transformers: [buildDiffLineTransformer(segment.lines)],
      });

      return (
        <div
          // oxlint-disable-next-line react/no-array-index-key -- segments are stable during render
          key={`code-${segmentIndex}`}
          // oxlint-disable-next-line react/no-danger -- Shiki returns trusted HTML
          dangerouslySetInnerHTML={{ __html: html }}
          className={cn(
            // Pre element styles
            '[&_pre]:m-0 [&_pre]:bg-transparent! [&_pre]:p-0 [&_pre]:leading-[1.6]',
            // Code element - flex column, fills parent width
            '[&_pre_code]:flex [&_pre_code]:flex-col',
            // Line styles - w-full fills the parent container
            '[&_.line]:relative [&_.line]:block [&_.line]:w-full [&_.line]:px-3!',

            // Diff styles
            '[&_.line]:border-l-2 [&_.line]:border-transparent',
            // Diff add styles
            '[&_.diff.add]:bg-success/20',
            '[&_.diff.add]:border-l-success',
            "[&_.diff.add]:before:content-['']!",
            // Diff remove styles
            '[&_.diff.remove]:bg-destructive/20 [&_.diff.remove]:opacity-70',
            '[&_.diff.remove]:border-l-destructive',
            "[&_.diff.remove]:before:content-['']!",
          )}
        />
      );
    });
  }, [segments, resolvedLanguage.shikiLanguage, theme, highlighter]);

  // Outer container w-max min-w-full ensures all segments extend to longest line across all groups
  return (
    <div
      className={cn('w-max min-w-full text-xs', className)}
      data-shiki-state={highlighter === undefined ? 'loading' : 'ready'}
    >
      {renderedSegments}
    </div>
  );
}
