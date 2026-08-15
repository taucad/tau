import { expect } from '@playwright/test';
import type { Page } from '@playwright/test';

type PublicRuntimeExampleOptions = {
  readonly navigate?: boolean;
  readonly successMessage: string;
};

export const expectPublicRuntimeExample = async (
  page: Page,
  { navigate = true, successMessage }: PublicRuntimeExampleOptions,
): Promise<void> => {
  if (navigate) {
    await page.goto('/');
  }
  await expect(page.getByRole('heading', { name: 'Tau Runtime Example' })).toBeVisible();
  await expect(page.getByText(successMessage)).toBeVisible({ timeout: 120_000 });
  await expect(page.locator('canvas')).toHaveCount(1);
};
