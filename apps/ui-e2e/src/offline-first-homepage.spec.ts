import { test } from 'vitest';
import { page as selectors } from 'vitest/browser';
import * as target from '#support/external-target.js';

const projectName = 'Offline Homepage Project';

const createHomeProject = async (): Promise<void> => {
  await target.navigate('/projects/new');
  await target.expectVisible(selectors.getByRole('button', { name: 'Create in Home' }), 60_000);
  await target.fill(selectors.getByLabelText('Project Name *'), projectName);
  await target.click(selectors.getByRole('button', { name: /Create Project/u }));
  await target.expectUrl(/\/w\/home\/[^/]+$/u, 60_000);
};

test('keeps local projects available when the session API is unreachable', async () => {
  await target.addInitScript(() => {
    localStorage.setItem('tau:flags', JSON.stringify({ marketingLanding: true }));
  });
  await createHomeProject();

  await target.addInitScript(() => {
    const fetchFromNetwork = globalThis.fetch.bind(globalThis);
    globalThis.fetch = async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
      const requestUrl = input instanceof Request ? input.url : input.toString();
      if (new URL(requestUrl, location.href).pathname === '/v1/auth/get-session') {
        throw new TypeError('Session API is unreachable');
      }
      return fetchFromNetwork(input, init);
    };
  });

  await target.navigate('/');

  await target.expectVisible(selectors.getByText(projectName, { exact: true }).first(), 60_000);
  await target.expectVisible(selectors.getByCss('[data-slot="sidebar-wrapper"]'));
  await target.expectCount(selectors.getByRole('heading', { name: 'AI CAD you can trust.' }), 0);

  await target.click(selectors.getByRole('link', { name: projectName }).first());
  await target.expectUrl(/\/w\/home\/[^/]+$/u, 60_000);
});
