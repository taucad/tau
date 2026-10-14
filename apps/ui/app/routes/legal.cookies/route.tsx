import { useLocation, useNavigate } from 'react-router';
import cookiePolicy from '#routes/legal.cookies/cookie-policy.txt?raw';
import { LegalDocument } from '#routes/legal/legal-document.js';
import type { MetaFunction } from 'react-router';
import { CookiePreferencesDialog } from '#components/cookie-consent.js';

export const meta: MetaFunction = () => [{ title: 'Cookie Policy · Tau' }];

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
      <LegalDocument>{cookiePolicy}</LegalDocument>
      <CookiePreferencesDialog isOpen={isPreferencesOpen} onOpenChange={handleOpenChange} />
    </>
  );
}
