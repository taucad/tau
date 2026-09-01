import { useState } from 'react';
import { useLoaderData } from 'react-router';
import { getRawMarkdownBackingPath, siteOrigin } from '#lib/site.js';
import type { loader } from '#routes/$/route.js';

type CopyState = 'ready' | 'copied' | 'failed';

export function DocsPageActions(): React.JSX.Element {
  const { url } = useLoaderData<typeof loader>();
  const [copyState, setCopyState] = useState<CopyState>('ready');
  const publishedMarkdownUrl = `${siteOrigin}${url}.mdx`;

  // The same markdown is already prerendered as a static file, so fetching it on
  // click keeps it out of every page's loader payload.
  const copyMarkdown = async (): Promise<void> => {
    try {
      const response = await fetch(getRawMarkdownBackingPath(url));
      if (!response.ok) {
        throw new Error(`Markdown request failed with ${response.status}`);
      }
      await navigator.clipboard.writeText(await response.text());
      setCopyState('copied');
    } catch {
      setCopyState('failed');
    }
  };

  const copyLabel = copyState === 'copied' ? 'Copied' : copyState === 'failed' ? 'Copy failed' : 'Copy markdown';

  return (
    <div className='mt-5 space-y-1 border-t border-border pt-3 text-sm'>
      <button
        type='button'
        className='flex min-h-9 w-full items-center rounded-md px-2 text-left text-muted-foreground hover:bg-accent hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring'
        onClick={() => {
          void copyMarkdown();
        }}
      >
        <span aria-live='polite'>{copyLabel}</span>
      </button>
      <a
        className='flex min-h-9 items-center rounded-md px-2 text-muted-foreground hover:bg-accent hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring'
        href={`${url}.mdx`}
      >
        View as markdown
      </a>
      <a
        className='flex min-h-9 items-center rounded-md px-2 text-muted-foreground hover:bg-accent hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring'
        href={`https://chatgpt.com/?hints=search&q=${encodeURIComponent(`Read ${publishedMarkdownUrl}`)}`}
      >
        Open in ChatGPT
      </a>
    </div>
  );
}
