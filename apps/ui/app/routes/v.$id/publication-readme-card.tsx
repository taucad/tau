import { useEffect, useState } from 'react';
import { MarkdownViewer } from '#components/markdown/markdown-viewer.js';
import { publicationRehypeSanitize } from '#components/markdown/markdown-sanitize.js';
import { publicationFileFetchInit } from '#routes/v.$id/parsed-publication.js';
import type { ParsedPublication } from '#routes/v.$id/parsed-publication.js';
import { cn } from '#utils/ui.utils.js';

type PublicationReadmeCardProps = {
  readonly files: Record<string, string>;
  readonly visibility: ParsedPublication['visibility'];
  readonly className?: string;
};

const findReadmePath = (files: Record<string, string>): string | undefined => {
  for (const path of Object.keys(files)) {
    if (path.toLowerCase() === 'readme.md') {
      return path;
    }
  }

  return undefined;
};

export const PublicationReadmeCard = ({
  files,
  visibility,
  className,
}: PublicationReadmeCardProps): React.ReactNode => {
  const [content, setContent] = useState<string | undefined>();
  const readmePath = findReadmePath(files);
  const readmeUrl = readmePath === undefined ? undefined : files[readmePath];

  useEffect(() => {
    if (readmeUrl === undefined) {
      setContent(undefined);
      return;
    }

    let cancelled = false;
    const load = async (): Promise<void> => {
      try {
        const response = await fetch(readmeUrl, publicationFileFetchInit(visibility));
        if (!response.ok) {
          return;
        }

        const text = await response.text();
        if (!cancelled) {
          setContent(text);
        }
      } catch {
        // Network failures intentionally suppressed — README is non-essential.
      }
    };
    // async-iife: bootstrap
    void load();

    return () => {
      cancelled = true;
    };
  }, [readmeUrl, visibility]);

  if (readmePath === undefined) {
    return null;
  }

  return (
    <section
      role='region'
      aria-label='Readme'
      data-slot='publication-readme-card'
      className={cn('mx-auto w-full max-w-5xl px-6 py-12', className)}
    >
      <h2 className='mb-4 text-base font-medium text-muted-foreground'>README</h2>
      {content === undefined ? (
        <p className='text-xs text-muted-foreground'>Loading readme…</p>
      ) : (
        <MarkdownViewer rehypePlugins={publicationRehypeSanitize}>{content}</MarkdownViewer>
      )}
    </section>
  );
};
