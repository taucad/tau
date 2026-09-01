import { Link } from 'react-router';
import privacyPolicy from '#routes/legal.privacy/privacy-policy.txt?raw';
import { Button } from '@taucad/ui/components/button';
import { markdownHeaderAnchorComponents } from '#components/markdown/markdown-header-anchor.js';
import { MarkdownViewer } from '#components/markdown/markdown-viewer.js';
import type { Handle } from '#types/matches.types.js';

export const handle: Handle = {
  breadcrumb() {
    return (
      <Button asChild variant='ghost'>
        <Link to='/legal/privacy'>Privacy Policy</Link>
      </Button>
    );
  },
};

export default function Privacy(): React.JSX.Element {
  return <MarkdownViewer components={markdownHeaderAnchorComponents}>{privacyPolicy}</MarkdownViewer>;
}
