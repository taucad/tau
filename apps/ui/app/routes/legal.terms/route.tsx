import { Link } from 'react-router';
import termsOfService from '#routes/legal.terms/terms-of-service.txt?raw';
import { Button } from '@taucad/ui/components/button';
import { markdownHeaderAnchorComponents } from '#components/markdown/markdown-header-anchor.js';
import { MarkdownViewer } from '#components/markdown/markdown-viewer.js';
import type { Handle } from '#types/matches.types.js';

export const handle: Handle = {
  breadcrumb() {
    return (
      <Button asChild variant='ghost'>
        <Link to='/legal/terms'>Terms of Service</Link>
      </Button>
    );
  },
};

export default function Terms(): React.JSX.Element {
  return <MarkdownViewer components={markdownHeaderAnchorComponents}>{termsOfService}</MarkdownViewer>;
}
