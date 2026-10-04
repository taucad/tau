import { Link } from 'react-router';
import openSourceNotices from '#routes/legal.open-source/open-source-notices.txt?raw';
import { Button } from '@taucad/ui/components/button';
import { markdownHeaderAnchorComponents } from '#components/markdown/markdown-header-anchor.js';
import { MarkdownViewer } from '#components/markdown/markdown-viewer.js';
import type { Handle } from '#types/matches.types.js';

export const handle: Handle = {
  breadcrumb() {
    return (
      <Button asChild variant='ghost'>
        <Link to='/legal/open-source'>Open-Source Notices</Link>
      </Button>
    );
  },
};

export default function OpenSourceNotices(): React.JSX.Element {
  return <MarkdownViewer components={markdownHeaderAnchorComponents}>{openSourceNotices}</MarkdownViewer>;
}
