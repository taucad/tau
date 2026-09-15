import 'katex/dist/katex.min.css';
import { cjk } from '@streamdown/cjk';
import { code } from '@streamdown/code';
import { createMathPlugin } from '@streamdown/math';
import { mermaid } from '@streamdown/mermaid';
import { defaultRehypePlugins, defaultRemarkPlugins as streamdownRemarkPlugins, Streamdown } from 'streamdown';
import type { Components, ControlsConfig, PluginConfig, StreamdownProps } from 'streamdown';
import { memo, useMemo } from 'react';
import { cn } from '@taucad/ui/utils/cn';
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

// oxlint-disable-next-line typescript/consistent-type-assertions -- Streamdown v2's string index signature conflicts with React Three Fiber's global JSX elements.
export const defaultMarkdownComponents = {
  code: MarkdownCode,
  a: MarkdownHyperlink,
} as Components;

export const defaultMarkdownControls = {
  // Disable built-in copy button (we have our own in CollapsibleCodeBlock)
  code: false,
  table: false,
} as const satisfies ControlsConfig;

const tauRemarkPlugins: StreamdownProps['remarkPlugins'] = Object.values({
  ...streamdownRemarkPlugins,
});

const { sanitize: _sanitize, ...unsanitizedRehypePlugins } = defaultRehypePlugins;
const tauRehypePlugins: StreamdownProps['rehypePlugins'] = Object.values(unsanitizedRehypePlugins);
const shikiThemes = {
  default: ['github-light', 'github-dark'],
  highContrast: ['github-light-high-contrast', 'github-dark-high-contrast'],
} satisfies Record<string, NonNullable<StreamdownProps['shikiTheme']>>;

const streamdownPlugins = {
  cjk,
  code,
  math: createMathPlugin({ singleDollarTextMath: true }),
  mermaid,
} satisfies PluginConfig;

export const MarkdownViewer = memo(function ({
  children,
  isStreaming = false,
  controls = defaultMarkdownControls,
  components,
  rehypePlugins: additionalRehypePlugins,
  className,
  streamdownClassName,
  plugins = streamdownPlugins,
  ...streamdownProperties
}: MarkdownViewerProps): React.JSX.Element {
  const { isHighContrast } = useTheme();
  const memoizedComponents = useMemo<Components>(
    () =>
      // oxlint-disable-next-line typescript/consistent-type-assertions -- Streamdown v2's string index signature conflicts with React Three Fiber's global JSX elements.
      ({
        ...defaultMarkdownComponents,
        ...components,
      }) as Components,
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
        {...streamdownProperties}
        mode={isStreaming ? 'streaming' : 'static'}
        components={memoizedComponents}
        controls={controls}
        remarkPlugins={tauRemarkPlugins}
        rehypePlugins={mergedRehypePlugins}
        shikiTheme={isHighContrast ? shikiThemes.highContrast : shikiThemes.default}
        plugins={plugins}
        className={streamdownClassName}
      >
        {children}
      </Streamdown>
    </div>
  );
});
