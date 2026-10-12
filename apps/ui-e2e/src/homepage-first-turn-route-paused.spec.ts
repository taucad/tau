/**
 * A first turn on an operator-paused model route (W6, T-E1).
 *
 * The homepage seed reaches the browser host, whose first provider call meets
 * the gateway's `MODEL_ROUTE_PAUSED` refusal. The card is the page's own: it
 * names the pause in its own words, offers *Switch model* and *Try again*, and
 * neither promises the turn nor offers *Resume*, which would re-send to the
 * paused route. The gateway's sentence never renders (IS3).
 *
 * Recovery is the person's: switch model on the card, try again, and the turn
 * runs on another route. The fixture cannot refuse one route and answer
 * another, so the row lifts the pause before trying again and proves the
 * recovery went elsewhere from the model each captured request named.
 */

import { expect, test } from 'vitest';
import { page as selectors } from 'vitest/browser';
import * as target from '#support/external-target.js';
import { dismissCookies, pdfModelName, selectModel } from '#support/chat-attachments.js';
import {
  gatewayRequestCount,
  gatewayRequestModels,
  pauseModelRoute,
  reply,
  resumeModelRoute,
  routePausedCard,
  routePausedGatewaySentence,
  switchModelAction,
  switchToAnotherGatewayModel,
} from '#support/chat-admission.js';

const composer = '[aria-label="Ask Tau to build anything..."]';

test('shows the paused-route card on a first turn and recovers on another model (T-E1)', async () => {
  const prompt = 'Make a 20 mm cube on a paused route.';
  const answer = 'The cube ran on another model.';
  await target.installAgentHostGatewayFixture([reply(answer)]);
  await target.setViewport({ width: 1440, height: 900 });
  await target.navigate('/');
  await dismissCookies();
  await target.expectVisible(selectors.getByCss(composer).first(), 60_000);
  await selectModel(pdfModelName);
  await pauseModelRoute();

  await target.type(selectors.getByCss(composer).first(), prompt);
  await target.click(selectors.getByCss('button:has(svg.lucide-arrow-up)').last());
  await target.expectUrl(/\/w\/[^/]+\/[^/?]+\?(?:.*&)?chat=/u, 120_000);

  await target.expectVisible(routePausedCard, 120_000);
  await expect.poll(gatewayRequestCount, { timeout: 30_000 }).toBe(1);
  await target.expectText(routePausedCard, /Switch to another model to continue\./u);
  expect(await target.isVisible(selectors.getByText(routePausedGatewaySentence))).toBe(false);
  expect(await target.isVisible(selectors.getByText('Everything up to here is saved.', { exact: false }))).toBe(false);
  expect(await target.isVisible(selectors.getByRole('button', { name: 'Resume', exact: true }))).toBe(false);
  expect(await target.isVisible(switchModelAction.last())).toBe(true);

  await resumeModelRoute();
  await switchToAnotherGatewayModel(pdfModelName);
  await target.click(selectors.getByRole('button', { name: 'Try again', exact: true }).last());

  await target.expectVisible(selectors.getByText(answer, { exact: true }).last(), 120_000);
  await expect.poll(gatewayRequestCount, { timeout: 30_000 }).toBe(2);
  const [paused, recovered] = await gatewayRequestModels();
  expect(paused).toEqual(expect.any(String));
  expect(recovered).toEqual(expect.any(String));
  expect(recovered).not.toBe(paused);
  expect(await target.isVisible(routePausedCard)).toBe(false);
});
