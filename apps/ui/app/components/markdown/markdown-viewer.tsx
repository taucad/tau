import 'katex/dist/katex.min.css';
import { defaultRehypePlugins, defaultRemarkPlugins as streamdownRemarkPlugins, Streamdown } from 'streamdown';
import type { ControlsConfig, StreamdownProps } from 'streamdown';
import remarkMath from 'remark-math';
import { memo, useMemo } from 'react';
import { cn } from '#utils/ui.utils.js';
import { MarkdownHyperlink } from '#components/markdown/markdown-hyperlink.js';
import { MarkdownCode } from '#components/markdown/markdown-code.js';
import { useTheme } from '#hooks/use-theme.js';

type MarkdownViewerProps = {
  readonly children: string;
  /**
   * Whether the content is currently streaming.
   * When true, uses streaming-optimized parsing.
   */
  readonly isStreaming?: boolean;
  /**
   * Additional className for the container.
   */
  readonly className?: string;
  /**
   * Additional className forwarded to the underlying Streamdown root,
   * which carries the `space-y-*` and `whitespace-*` defaults.
   * Use this to override Streamdown's hardcoded spacing.
   */
  readonly streamdownClassName?: string;
} & StreamdownProps;

export const defaultMarkdownComponents = {
  code: MarkdownCode,
  a: MarkdownHyperlink,
} as const satisfies MarkdownViewerProps['components'];

export const defaultMarkdownControls = {
  // Disable built-in copy button (we have our own in CollapsibleCodeBlock)
  code: false,
  table: false,
} as const satisfies ControlsConfig;

const tauRemarkPlugins: StreamdownProps['remarkPlugins'] = Object.values({
  ...streamdownRemarkPlugins,
  math: [remarkMath, { singleDollarTextMath: true }],
});

const { sanitize: _sanitize, ...unsanitizedRehypePlugins } = defaultRehypePlugins;
const tauRehypePlugins: StreamdownProps['rehypePlugins'] = Object.values(unsanitizedRehypePlugins);
const shikiThemes = {
  default: ['github-light', 'github-dark'],
  highContrast: ['github-light-high-contrast', 'github-dark-high-contrast'],
} satisfies Record<string, NonNullable<StreamdownProps['shikiTheme']>>;

export const MarkdownViewer = memo(function ({
  children,
  isStreaming = false,
  controls = defaultMarkdownControls,
  components,
  rehypePlugins: additionalRehypePlugins,
  className,
  streamdownClassName,
}: MarkdownViewerProps): React.JSX.Element {
  const { isHighContrast } = useTheme();
  const memoizedComponents = useMemo(
    () => ({
      ...defaultMarkdownComponents,
      ...components,
    }),
    [components],
  );

  const mergedRehypePlugins = useMemo(
    () => (additionalRehypePlugins ? [...tauRehypePlugins, ...additionalRehypePlugins] : tauRehypePlugins),
    [additionalRehypePlugins],
  );

  return (
    <div
      className={cn(
        //
        'w-full max-w-full text-sm text-foreground',
        'overflow-wrap-anywhere wrap-break-word hyphens-auto',
        className,
      )}
    >
      <Streamdown
        mode={isStreaming ? 'streaming' : 'static'}
        components={memoizedComponents}
        controls={controls}
        remarkPlugins={tauRemarkPlugins}
        rehypePlugins={mergedRehypePlugins}
        shikiTheme={isHighContrast ? shikiThemes.highContrast : shikiThemes.default}
        className={streamdownClassName}
      >
        {children}
      </Streamdown>
    </div>
  );
});
