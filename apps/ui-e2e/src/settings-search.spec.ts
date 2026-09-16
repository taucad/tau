import { expect, test } from 'vitest';
import { page as selectors } from 'vitest/browser';
import * as target from '#support/external-target.js';

const dialog = selectors.getByRole('dialog', { name: 'Settings' });
const searchbox = selectors.getByRole('searchbox', { name: 'Search settings' });

test('searches grouped settings and returns to the underlying route', async () => {
  await target.setViewport({ width: 1440, height: 900 });
  await target.navigate('/?view=projects&settings=general');

  await target.expectVisible(dialog);
  await target.fill(searchbox, 'theme');
  await target.expectVisible(dialog.getByRole('group', { name: 'General' }));

  await target.click(dialog.getByRole('button', { name: 'Theme' }));

  await target.expectUrl(/[?&]settings=general(?:&|$)/u);
  await target.expectValue(searchbox, 'theme');
  await target.expectFocused(dialog.getByRole('region', { name: 'Theme' }));
  await target.screenshot(dialog, 'settings-search-theme.png');

  await target.click(dialog.getByRole('button', { name: 'Back to app' }));

  await target.expectHidden(dialog);
  const returnedUrl = new URL(await target.currentUrl());
  expect(returnedUrl.pathname).toBe('/');
  expect(returnedUrl.searchParams.get('view')).toBe('projects');
  expect(returnedUrl.searchParams.has('settings')).toBe(false);
});

test('finds security settings and clears search before closing with Escape', async () => {
  await target.navigate('/?settings=general');
  await target.fill(searchbox, 'password');

  await target.expectVisible(dialog.getByRole('group', { name: 'Security' }));
  await target.click(dialog.getByRole('button', { name: 'Password' }));
  await target.expectUrl(/[?&]settings=security(?:&|$)/u);
  await target.expectValue(searchbox, 'password');

  await target.keyboardPress('Escape');
  await target.expectValue(searchbox, '');
  await target.expectVisible(dialog);

  await target.fill(searchbox, 'no such setting');
  await target.expectVisible(dialog.getByText('No settings found', { exact: true }));
  await target.click(dialog.getByRole('button', { name: 'Clear search' }));
  await target.expectValue(searchbox, '');
  await target.expectHidden(dialog.getByText('No settings found', { exact: true }));

  await target.keyboardPress('Escape');
  await target.expectHidden(dialog);
});

test('supports keyboard search selection in the mobile dialog', async () => {
  await target.setViewport({ width: 390, height: 844 });
  await target.navigate('/?settings=general');

  await target.focus(searchbox);
  await target.type(searchbox, 'theme');
  await target.press(searchbox, 'Enter');

  await target.expectUrl(/[?&]settings=general(?:&|$)/u);
  await target.expectFocused(dialog.getByRole('region', { name: 'Theme' }));
  await target.screenshot(dialog, 'settings-search-mobile.png');
});
