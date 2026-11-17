/**
 * `/invitations/:token` wherever no server answers it: the desktop shell, where
 * `tau://invitations/<token>` lands (R4), and the `tau serve` daemon's SPA
 * build (`apps/ui/serve/app/routes.ts`).
 *
 * The web module at this path is a server `loader` that moves the token out of
 * the address into a cookie and redirects (#2290); SPA mode admits no `loader`,
 * so the desktop manifest serves this module instead
 * (`apps/ui/desktop/app/routes.ts`). It does the same in the renderer: hold the
 * token in session storage and replace the address with `/invitations`, where
 * the accept lives. The shell never records a replay, but its pageviews and its
 * sign-in `redirectTo` would otherwise still carry the token.
 *
 * ponytail: no `clientLoader`. SPA mode permits `HydrateFallback` only on the
 * root route and this path is a cold `window.loadURL` from main, so a loader
 * would leave an empty shell; the effect runs on the first commit.
 */

import { useEffect } from 'react';
import { useNavigate, useParams } from 'react-router';
import { Loader } from '@taucad/ui/components/loader';
import { holdPendingInvitation, pendingInvitationPath } from '#lib/pending-invitation.lib.js';

/**
 * Hold the token, then open `/invitations` in place of this address.
 *
 * @returns A spinner for the frame before the replace.
 */
export default function HoldInvitation(): React.JSX.Element {
  const { token } = useParams();
  const navigate = useNavigate();

  useEffect(() => {
    if (token !== undefined) {
      holdPendingInvitation(token);
    }
    void navigate(pendingInvitationPath, { replace: true });
  }, [navigate, token]);

  return (
    <div role='status' aria-busy='true' className='flex items-center justify-center py-16'>
      <Loader className='size-6 text-muted-foreground' />
    </div>
  );
}
