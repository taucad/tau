import { page as selectors } from 'vitest/browser';
import { expectTargetCount, expectTargetVisible, navigateTarget } from './external-target.js';

type PublicRuntimeExampleOptions = {
  readonly navigate?: boolean;
  readonly successMessage: string;
};

export const expectPublicRuntimeExample = async ({
  navigate = true,
  successMessage,
}: PublicRuntimeExampleOptions): Promise<void> => {
  if (navigate) {
    await navigateTarget('/');
  }
  await expectTargetVisible(selectors.getByRole('heading', { name: 'Tau Runtime Example' }));
  await expectTargetVisible(selectors.getByText(successMessage));
  await expectTargetCount('canvas', 1);
};
