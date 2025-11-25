import { useLoaderData } from 'react-router';
import type { loader } from '#routes/docs.$/route.js';
import { Button } from '#components/ui/button.js';
import { CopyButton } from '#components/copy-button.js';
import { SvgIcon } from '#components/icons/svg-icon.js';
import { ENV } from '#config.js';
import { metaConfig } from '#constants/meta.constants.js';
import type { SvgIcons } from '#components/icons/generated/svg-icons.js';
import { MarkdownIcon } from '#components/icons/markdown-icon.js';

type ActionLink = {
  url: string;
  label: string;
  iconId: SvgIcons;
};

export function DocsPageActions(): React.JSX.Element {
  const { rawMarkdownContent, path, url } = useLoaderData<typeof loader>();

  const markdownUrl = `${ENV.TAU_FRONTEND_URL}${url}.mdx`;
  const encodedUrl = encodeURIComponent(markdownUrl);
  const githubUrl = `${metaConfig.githubUrl}/edit/main/${metaConfig.docsDir}/${path}`;

  const getMarkdownContent = (): string => rawMarkdownContent;

  const actionLinks: ActionLink[] = [
    {
      url: `https://chatgpt.com/?hints=search&q=Read+${encodedUrl}`,
      label: 'Open in ChatGPT',
      iconId: 'openai',
    },
    {
      url: `https://claude.ai/new?q=Read+${encodedUrl}`,
      label: 'Open in Claude',
      iconId: 'claude-mono',
    },
    {
      url: `https://cursor.com/link/prompt?text=Read+${encodedUrl}`,
      label: 'Open in Cursor',
      iconId: 'cursor',
    },
    {
      url: githubUrl,
      label: 'Edit page on GitHub',
      iconId: 'github',
    },
  ];

  return (
    <div className="mt-5 -mr-4 space-y-1">
      <CopyButton
        getText={getMarkdownContent}
        variant="ghost"
        size="sm"
        tooltip="Copy page as markdown"
        readyToCopyText="Copy page as markdown"
        className="flex h-auto w-full flex-row-reverse items-center justify-end gap-2 rounded-md px-3 py-1 text-left text-sm text-muted-foreground transition-colors hover:text-foreground"
      />

      <Button
        asChild
        variant="ghost"
        size="sm"
        className="flex w-full items-center justify-start gap-2 rounded-md px-3 py-1 text-left text-sm text-muted-foreground transition-colors hover:text-foreground"
      >
        <a href={markdownUrl} target="_blank" rel="noopener noreferrer">
          <MarkdownIcon className="size-4" />
          <span className="flex items-center gap-1">
            View as Markdown
            <span className="text-xs">↗</span>
          </span>
        </a>
      </Button>

      {actionLinks.map((link) => (
        <Button
          key={link.label}
          asChild
          variant="ghost"
          size="sm"
          className="flex w-full items-center justify-start gap-2 rounded-md px-3 py-1 text-left text-sm text-muted-foreground transition-colors hover:text-foreground"
        >
          <a href={link.url} target="_blank" rel="noopener noreferrer">
            <SvgIcon id={link.iconId} className="size-4" />
            <span className="flex items-center gap-1">
              {link.label}
              <span className="text-xs">↗</span>
            </span>
          </a>
        </Button>
      ))}
    </div>
  );
}
