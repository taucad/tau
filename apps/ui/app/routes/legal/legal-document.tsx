import { Link } from 'react-router';
import { Button } from '@taucad/ui/components/button';
import { PageHeader } from '#components/layout/page-header.js';
import { MarkdownViewer } from '#components/markdown/markdown-viewer.js';
import { markdownHeaderAnchorComponents, slugify } from '#components/markdown/markdown-header-anchor.js';

/** Legal sources start with one ATX title; retain its text and fragment target. */
export function LegalDocument({ children }: { readonly children: string }): React.JSX.Element {
  const titleEnd = children.indexOf('\n');
  const title = children.slice(2, titleEnd).trim();
  const body = children.slice(titleEnd + 1);

  return (
    <div className='space-y-6'>
      <PageHeader
        id={slugify(title)}
        title={title}
        action={
          <Button asChild variant='outline'>
            <Link to='/legal'>All legal documents</Link>
          </Button>
        }
      />
      <MarkdownViewer className='max-w-4xl' components={markdownHeaderAnchorComponents}>
        {body}
      </MarkdownViewer>
    </div>
  );
}
