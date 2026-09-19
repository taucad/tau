/**
 * The turn seeded from the homepage composer is dispatched, not swallowed.
 *
 * Reported 2026-09-19: a project created from the homepage showed the user
 * message and nothing else — no assistant text, no notice, no revision row. The
 * durable record held `chat.json` with the startup request already consumed and
 * no `events.jsonl` at all: the seeded turn never reached a host. Typing a
 * *second* prompt into the same chat dispatched at once, and a reload discarded
 * the seeded prompt entirely, because the startup request is one-shot.
 *
 * The drop is an ordering race in `chat-session-store.ts`. The loader consumes
 * the seed as soon as the chat row loads; the chat's owner (`stateActorRef`) is
 * bound by an effect in `project-live-sessions.tsx` once the project session
 * exists. A chat acquired during the route's first render consumed its seed
 * first, and `session.stateActorRef?.send({ type: 'requestTurn', … })` threw the
 * gesture away on the optional chain. `#bindSessionOwner` replays only a *live*
 * run (`adoptRun`), never a pending gesture, so nothing ever recovered it.
 *
 * `first-turn-admission.spec.ts` stays green through all of it: it types into
 * the in-project composer after `/projects/new`, where the owner is long bound.
 * Only the homepage seed takes this path.
 *
 * The assertion is what a person can see: `Rev 1` on the Revisions chip, which
 * only a dispatched turn's lease mints inside this window (the idle mint is five
 * minutes). Signed out the run is then refused downstream — on
 * `UNAUTHENTICATED` when the API at :4000 answers this origin, on missing model
 * metadata when nothing does — and which card that is depends on the machine,
 * so it is not pinned here. Before the fix the chip stayed "You are on main."
 * and no card rendered at all.
 */

import { test } from 'vitest';
import { page as selectors } from 'vitest/browser';
import * as target from '#support/external-target.js';

const composer = '[aria-label="Ask Tau to build anything..."]';
const cookieValue = (value: string): string => encodeURIComponent(JSON.stringify(value));

test('dispatches the turn seeded by the homepage composer (W5)', async () => {
  await target.setViewport({ width: 1440, height: 900 });
  await target.addCookies([
    { domain: 'localhost', name: 'tau-cad-kernel', path: '/', value: cookieValue('openscad') },
    { domain: 'localhost', name: 'tau-cookie-consent', path: '/', value: cookieValue('declined') },
  ]);

  await target.navigate('/');
  await target.expectVisible(composer, 60_000);

  await target.type(selectors.getByCss(composer).first(), 'Make a 20 mm cube.');
  await target.click(selectors.getByCss('button:has(svg.lucide-arrow-up)').last());

  // Home → project remounts the whole shell: the chat's session is acquired
  // under a project session the route has not registered yet (V3a).
  await target.expectUrl(/\/w\/[^/]+\/[^/?]+\?(?:.*&)?chat=/u, 120_000);

  /* The chip's ordinal is a graph read, and the seeded turn lands on a page
   * that is still booting its kernel, so the window is wide: the pin is that
   * this ever happens, which before the fix it did not. */
  await target.expectVisible(selectors.getByLabelText(/Open Revisions\. You are on main, Rev 1\./u), 120_000);
});
