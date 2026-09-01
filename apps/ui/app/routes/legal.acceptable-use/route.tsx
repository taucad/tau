import { Link } from 'react-router';
import acceptableUsePolicy from '#routes/legal.acceptable-use/acceptable-use-policy.txt?raw';
import { Button } from '@taucad/ui/components/button';
import { markdownHeaderAnchorComponents } from '#components/markdown/markdown-header-anchor.js';
import { MarkdownViewer } from '#components/markdown/markdown-viewer.js';
import type { Handle } from '#types/matches.types.js';

export const handle: Handle = {
  breadcrumb() {
    return (
      <Button asChild variant='ghost'>
        <Link to='/legal/acceptable-use'>Acceptable Use Policy</Link>
      </Button>
    );
  },
};

export default function AcceptableUse(): React.JSX.Element {
  return <MarkdownViewer components={markdownHeaderAnchorComponents}>{acceptableUsePolicy}</MarkdownViewer>;
}
