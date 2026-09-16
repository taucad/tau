import { expect, test } from 'vitest';
import { page as selectors } from 'vitest/browser';
import type { Locator } from 'vitest/browser';
import * as target from '#support/external-target.js';

const fieldUnit = async (input: Locator): Promise<string> =>
  target.evaluateLocator(input, (element) => {
    const adornment = element
      .closest<HTMLElement>('[data-slot="slider-input"]')
      ?.querySelector<HTMLElement>('[data-slot="slider-input-adornment"]');
    return adornment?.textContent.trim() ?? '';
  });

const fieldValue = async (input: Locator): Promise<string | undefined> => {
  const field = await target.read(input);
  return field.value;
};

test('should hydrate the normal app route beyond the Home storage bootstrap shell', async () => {
  await target.navigate('/');

  await target.expectVisible(selectors.getByRole('main'), 30_000);
  await target.expectHidden(selectors.getByRole('status', { name: 'Opening Home' }));
});

test('renders inferred units from the homepage gear runtime manifest', async () => {
  await target.addInitScript(() => {
    localStorage.setItem('tau:flags', JSON.stringify({ marketingLanding: true }));
    const fetchFromNetwork = globalThis.fetch.bind(globalThis);
    globalThis.fetch = async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
      const requestUrl = input instanceof Request ? input.url : input.toString();
      if (new URL(requestUrl, location.href).pathname === '/v1/auth/get-session') {
        return Response.json(null);
      }
      return fetchFromNetwork(input, init);
    };
  });
  await target.navigate('/');

  await target.scrollIntoView(selectors.getByRole('region', { name: 'Live CAD demo' }));
  const liveDemo = selectors.getByRole('heading', { name: 'See it in action' });
  await target.expectVisible(liveDemo, 30_000);
  await target.scrollIntoView(liveDemo);
  const thickness = selectors.getByLabelText('Input for Thickness').first();
  const pressureAngle = selectors.getByLabelText('Input for Pressure angle').first();
  await target.expectVisible(thickness, 60_000);
  expect(await fieldUnit(thickness)).toBe('mm');
  expect(await fieldUnit(pressureAngle)).toBe('°');
  await target.expectVisible(selectors.getByRole('button', { name: 'Inferred unit for Thickness' }).first());
  await target.expectVisible(selectors.getByRole('button', { name: 'Inferred unit for Pressure angle' }).first());

  const teeth = selectors.getByLabelText('Input for Number Teeth').first();
  await target.fill(teeth, '2');
  await target.press(teeth, 'Enter');
  await target.expectVisible(selectors.getByText('Value must be at least 3.').first());
  expect(await fieldValue(teeth)).toBe('2');
  await target.press(teeth, 'Escape');
  await target.fill(teeth, '13');
  await target.press(teeth, 'Enter');
  await expect.poll(async () => fieldValue(teeth)).toBe('13');
});
