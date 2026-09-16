/**
 * The first turn of a fresh browser project is admitted, and a refusal is heard.
 *
 * The principal's V21 pass found this live and signed out: a brand-new project,
 * one prompt in the chat composer, and thirty seconds later
 * `REVISION_PREPARE_FAILED … it was never leased` in the console — no run, no
 * toast, no composer error, the text still sitting where it was typed.
 *
 * Two defects met there, and only a real browser sees either of them:
 *
 * 1. `isomorphic-git` reads the Node `Buffer` **global**, which a browser does
 *    not have, so the first object the port *wrote* — the turn's dirty-base
 *    mint (D17) — threw `Buffer is not defined`. Every jsdom and Node suite in
 *    the workspace is green on this path because both have Node's `Buffer`.
 * 2. A turn that ended before its lease settled no admission, so the caller
 *    waited out the whole 30 s bound and then heard a sentence naming nothing.
 *
 * The assertion is the one thing a person can see for both: the turn's base
 * revision. The idle window that would otherwise mint on its own is five
 * minutes (`checkoutIdleWindowMilliseconds`), so a revision inside ten seconds
 * of pressing send is the turn's own, and nothing else.
 */

import { test } from 'vitest';
import { page as selectors } from 'vitest/browser';
import * as target from '#support/external-target.js';

const composer = '[aria-label="Ask Tau to build anything..."]';
const cookieValue = (value: string): string => encodeURIComponent(JSON.stringify(value));

test('places the first turn of a fresh project on a revision (W19-b)', async () => {
  await target.setViewport({ width: 1440, height: 900 });
  await target.addCookies([
    { domain: 'localhost', name: 'tau-cad-kernel', path: '/', value: cookieValue('openscad') },
    { domain: 'localhost', name: 'tau-cookie-consent', path: '/', value: cookieValue('declined') },
  ]);

  await target.navigate('/projects/new');
  await target.expectVisible(selectors.getByLabelText('Project Name *'), 60_000);
  await target.fill(selectors.getByLabelText('Project Name *'), 'First turn admission');
  await target.click(selectors.getByRole('button', { name: /Create Project/u }));
  await target.expectUrl(/\/w\/home\/[^/?]+\?chat=[^&]+$/u, 60_000);
  await target.expectVisible(composer, 60_000);

  /* Signed out, with no API and no model: the turn is refused downstream of the
   * workspace, which is fine — the workspace is what this pin is about, and it
   * is asked for before any body is composed. */
  await target.type(composer, 'Make a cube.');
  await target.click(selectors.getByCss('button:has(svg.lucide-arrow-up)').last());

  /*
   * `Rev 1` on the Revisions chip: the base the turn's lease was written onto.
   *
   * The window is generous because the chip's ordinal comes from a graph read
   * rather than the projection, and a cold page is still booting its kernel
   * when the turn is placed — the pin is "this ever happens", which before the
   * fix it did not, at any length of wait.
   */
  await target.expectVisible(selectors.getByLabelText(/Open Revisions\. You are on main, Rev 1\./u), 60_000);
});
