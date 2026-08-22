import { test } from 'vitest';
import { page as selectors } from 'vitest/browser';
import {
  editExternalElectronWorkspace,
  expectTargetInspection,
  expectTargetValue,
  expectTargetVisible,
} from '../support/external-target';
import { expectPublicRuntimeExample } from '../support/public-example-suite';

const exampleSuccessMessage = 'OpenSCAD rendered through @taucad/runtime in an Electron utility process.';

test('should render OpenSCAD through electron-vite 6 beta and Vite 8', async () => {
  expectTargetInspection();
  await expectPublicRuntimeExample({ navigate: false, successMessage: exampleSuccessMessage });
});

test('should re-render when an external writer edits the project file', async () => {
  await expectPublicRuntimeExample({ navigate: false, successMessage: exampleSuccessMessage });

  // The server command performs a raw node:fs write outside the app and registers restoration before writing.
  await editExternalElectronWorkspace();
  await expectTargetValue(selectors.getByLabelText('depth'), '7');
  await expectTargetVisible(selectors.getByText(exampleSuccessMessage));
});
