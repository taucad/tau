import { Button } from '#components/ui/button.js';
import { CopyButton } from '#components/copy-button.js';
import { SvgIcon } from '#components/icons/svg-icon.js';
import { useLoaderData } from 'react-router';
import type { loader } from './route.js';
import { ENV, metaConfig } from '#config.js';
import type { SvgIcons } from '#components/icons/generated/svg-icons.js';

type ActionLink = {
  url: string;
  label: string;
  iconId: SvgIcons;
};

export function DocsPageActions(): React.JSX.Element {
  const { rawMarkdownContent, path } = useLoaderData<typeof loader>();

  const encodedUrl = encodeURIComponent(`https://${ENV.TAU_FRONTEND_URL}/docs/${path}`);
  const githubUrl = `${metaConfig.githubUrl}/edit/main/${metaConfig.docsDir}/${path}`;

  const getMarkdownContent = (): string => rawMarkdownContent;

  const actionLinks: ActionLink[] = [
    {
      url: githubUrl,
      label: 'Edit page on GitHub',
      iconId: 'github',
    },
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
  ];

  return (
    <div className="space-y-1 mt-5 -mr-4">
      <CopyButton
        getText={getMarkdownContent}
        variant="ghost"
        size="sm"
        tooltip="Copy page as markdown"
        readyToCopyText="Copy page as markdown"
        className="flex flex-row-reverse items-center justify-end gap-2 w-full text-left px-3 py-1 text-sm text-muted-foreground hover:text-foreground rounded-md transition-colors h-auto"
      />

      {actionLinks.map((link) => (
        <Button
          key={link.label}
          asChild
          variant="ghost"
          size="sm"
          className={'flex items-center justify-start gap-2 w-full text-left px-3 py-1 text-sm text-muted-foreground hover:text-foreground rounded-md transition-colors'}
        >
          <a href={link.url} target="_blank" rel="noopener noreferrer">
            <SvgIcon id={link.iconId!} className="size-4" />
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
