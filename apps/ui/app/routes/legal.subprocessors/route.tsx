import { Link } from 'react-router';
import subprocessors from '#routes/legal.subprocessors/subprocessors.txt?raw';
import { Button } from '@taucad/ui/components/button';
import { markdownHeaderAnchorComponents } from '#components/markdown/markdown-header-anchor.js';
import { MarkdownViewer } from '#components/markdown/markdown-viewer.js';
import type { Handle } from '#types/matches.types.js';

export const handle: Handle = {
  breadcrumb() {
    return (
      <Button asChild variant='ghost'>
        <Link to='/legal/subprocessors'>Sub-processors</Link>
      </Button>
    );
  },
};

export default function Subprocessors(): React.JSX.Element {
  return <MarkdownViewer components={markdownHeaderAnchorComponents}>{subprocessors}</MarkdownViewer>;
}
