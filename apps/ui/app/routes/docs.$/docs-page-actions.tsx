import { Button } from '#components/ui/button.js';
import { CopyButton } from '#components/copy-button.js';
import { SvgIcon } from '#components/icons/svg-icon.js';
import { Github } from '#components/icons/github.js';
import { useLoaderData } from 'react-router';
import type { loader } from './route.js';
import { ENV, metaConfig } from '#config.js';

export function DocsPageActions(): React.JSX.Element {
  const { rawMarkdownContent, path } = useLoaderData<typeof loader>();
  
  const encodedUrl = encodeURIComponent(`https://${ENV.TAU_FRONTEND_URL}/docs/${path}`);
  const chatGPTUrl = `https://chatgpt.com/?hints=search&q=Read+${encodedUrl}`;
  const claudeUrl = `https://claude.ai/new?q=Read+${encodedUrl}`;
  const githubUrl = `${metaConfig.githubUrl}/edit/main/${metaConfig.docsDir}/${path}`;

  const getMarkdownContent = (): string => rawMarkdownContent;

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

      {githubUrl && (
        <Button asChild variant="ghost" size="sm" className="flex items-center justify-start gap-2 w-full text-left px-3 py-1 text-sm text-muted-foreground hover:text-foreground rounded-md transition-colors h-auto">
          <a href={githubUrl} target="_blank" rel="noopener noreferrer">
            <Github className="size-4" />
            <span className="flex items-center gap-1">
              Edit page on GitHub
              <span className="text-xs">↗</span>
            </span>
          </a>
        </Button>
      )}

      <Button
        variant="ghost"
        size="sm"
        className="flex items-center justify-start gap-2 w-full text-left px-3 py-1 text-sm text-muted-foreground hover:text-foreground rounded-md transition-colors h-auto"
        asChild
      >
        <a href={chatGPTUrl} target="_blank" rel="noopener noreferrer">
          <SvgIcon id="openai" className="size-4" />
          <span className="flex items-center gap-1">
            Open in ChatGPT
            <span className="text-xs">↗</span>
          </span>
        </a>
      </Button>

      <Button
        variant="ghost"
        size="sm"
        className="flex items-center justify-start gap-2 w-full text-left px-3 py-1 text-sm text-muted-foreground hover:text-foreground rounded-md transition-colors h-auto"
        asChild
      >
        <a href={claudeUrl} target="_blank" rel="noopener noreferrer">
          <SvgIcon id="claude" className="size-4" />
          <span className="flex items-center gap-1 [&>svg]:text-white">
            Open in Claude
            <span className="text-xs">↗</span>
          </span>
        </a>
      </Button>
    </div>
  );
}
