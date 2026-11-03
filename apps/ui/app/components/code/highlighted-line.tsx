import type { HighlightSegment } from '@taucad/grammars';

/** One highlighted line; token classes come from `tauHighlighter` and are coloured by `syntax-highlight.css`. */
export function HighlightedLine({ segments }: { readonly segments: readonly HighlightSegment[] }): React.JSX.Element[] {
  return segments.map((segment, index) =>
    segment.className === '' ? (
      // oxlint-disable-next-line react/no-array-index-key -- segments of a line are positional
      <span key={index}>{segment.text}</span>
    ) : (
      // oxlint-disable-next-line react/no-array-index-key -- segments of a line are positional
      <span key={index} className={segment.className}>
        {segment.text}
      </span>
    ),
  );
}
