import { Link, useLocation, useNavigate } from 'react-router';
import cookiePolicy from '#routes/legal.cookies/cookie-policy.txt?raw';
import { Button } from '@taucad/ui/components/button';
import { markdownHeaderAnchorComponents } from '#components/markdown/markdown-header-anchor.js';
import { MarkdownViewer } from '#components/markdown/markdown-viewer.js';
import { CookiePreferencesDialog } from '#components/cookie-consent.js';
import type { Handle } from '#types/matches.types.js';

export const handle: Handle = {
  breadcrumb() {
    return (
      <Button asChild variant='ghost'>
        <Link to='/legal/cookies'>Cookie Policy</Link>
      </Button>
    );
  },
};

export default function Cookies(): React.JSX.Element {
  const location = useLocation();
  const navigate = useNavigate();

  const isPreferencesOpen = location.hash === '#preferences';

  const handleOpenChange = (open: boolean): void => {
    if (!open) {
      // Clear the hash when dialog closes
      void navigate('/legal/cookies', { replace: true });
    }
  };

  return (
    <>
      <MarkdownViewer components={markdownHeaderAnchorComponents}>{cookiePolicy}</MarkdownViewer>
      <CookiePreferencesDialog isOpen={isPreferencesOpen} onOpenChange={handleOpenChange} />
    </>
  );
}
