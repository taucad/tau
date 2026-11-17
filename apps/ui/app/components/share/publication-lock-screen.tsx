import { PublicationLockScreen as PublicationLockScreenView } from '@taucad/publish-ui/components/share/publication-lock-screen';
import type { PublicationLockScreenVariant } from '@taucad/publish-ui/components/share/publication-lock-screen';
import { useAuthLinks } from '#hooks/use-auth-links.js';

/** The publish-ui lock screen with the app's auth links, which return to the page it is shown on. */
export function PublicationLockScreen({
  variant,
  isInline,
}: {
  readonly variant: PublicationLockScreenVariant;
  readonly isInline?: boolean;
}): React.JSX.Element {
  const authLinks = useAuthLinks();

  return <PublicationLockScreenView variant={variant} authLinks={authLinks} isInline={isInline} />;
}
