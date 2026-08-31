import { test } from 'vitest';
import { page as selectors } from 'vitest/browser';
import * as target from '#support/external-target.js';

test('should hydrate the normal app route beyond the Home storage bootstrap shell', async () => {
  await target.navigate('/');

  await target.expectVisible(selectors.getByRole('main'), 30_000);
  await target.expectHidden(selectors.getByRole('status', { name: 'Opening Home' }));
});
