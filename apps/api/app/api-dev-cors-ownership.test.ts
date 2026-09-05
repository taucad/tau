import { expect, it } from 'vitest';
// oxlint-disable-next-line no-restricted-imports -- This regression test intentionally verifies the API's outer Vite host boundary.
import apiViteConfig from '../vite.config.js';

it('leaves API CORS handling to the Nest application', () => {
  const config = apiViteConfig({
    command: 'serve',
    isPreview: false,
    isSsrBuild: false,
    mode: 'development',
  });

  expect(config.server?.cors).toBe(false);
});
