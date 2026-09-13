/**
 * Publishes who is signed in, for the revision client that mints as them (S37).
 *
 * Headless, mounted once at the application root — the only place the session's
 * react-query provider is guaranteed — so nothing deeper has to grow a query
 * dependency to record a truthful author.
 */

import { useEffect } from 'react';
import type { ReactNode } from 'react';
import { useSession } from '@better-auth-ui/react';
import { authClient } from '#lib/auth-client.js';
import { setRevisionSessionUser } from '#lib/revision-actor.js';

/**
 * Mirror the session into the revision actor store.
 *
 * @returns Nothing rendered.
 */
export function RevisionActorIdentity(): ReactNode {
  const { data: session } = useSession(authClient);
  const user = session?.user;
  const id = user?.id;
  const name = user?.name;
  const email = user?.email;

  useEffect(() => {
    setRevisionSessionUser(
      id === undefined
        ? undefined
        : {
            id,
            ...(name === undefined || name === '' ? {} : { name }),
            ...(email === undefined || email === '' ? {} : { email }),
          },
    );
  }, [id, name, email]);

  return null;
}
