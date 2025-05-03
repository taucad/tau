import { createRoutesStub } from 'react-router';
import { render, screen, waitFor } from '@testing-library/react';
import Index from '../../app/routes/_index/route.js';

test('renders loader data', async () => {
  const RemixStub = createRoutesStub([
    {
      path: '/',
      Component: Index,
    },
  ]);

  render(<RemixStub />);

  await waitFor(async () => screen.findByText('Hello there,'));
});
