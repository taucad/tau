// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { cookieName } from '@taucad/ui-core/constants/cookie.constants';

vi.mock('#flags/use-feature.js', () => ({ useFeature: () => true }));

vi.mock('#hooks/use-project-manager.js', () => ({ useProjectManager: () => ({ connectWorkspace: vi.fn() }) }));

const { default: WelcomeRoute } = await import('#routes/welcome/route.js');
const { personRecordStores, deviceRecordStore } = await import('#preferences/person-record.store.js');

describe('setup when the device refuses the write', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('continues, applies the answer for the session and says so in a status region', async () => {
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new DOMException('Quota exceeded', 'QuotaExceededError');
    });
    const user = userEvent.setup();
    const router = createMemoryRouter([{ path: '/welcome', element: <WelcomeRoute /> }], {
      initialEntries: ['/welcome'],
    });
    render(<RouterProvider router={router} />);
    await user.click(screen.getByRole('checkbox', { name: /Mechanical parts/ }));
    const status = screen.getByTestId('setup-storage-status');
    expect(status).toHaveAttribute('role', 'status');
    expect(status).toHaveTextContent('Tau could not save this on this device. Your choices apply until you close Tau.');
    expect(screen.getByRole('checkbox', { name: /Mechanical parts/ })).toBeChecked();
    expect(personRecordStores.profile.read().goals).toEqual(['mechanical']);
    await user.click(screen.getByRole('button', { name: 'Continue' }));
    expect(screen.getByRole('heading', { level: 1, name: 'Where are you coming from?' })).toBeInTheDocument();
    expect(screen.getByTestId('setup-storage-status')).toHaveTextContent('Tau could not save this on this device.');
  });

  it('keeps the warning for a refused answer when a later answer in another section is saved', async () => {
    const { setItem } = Storage.prototype;
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(function setItemExceptProfile(
      this: Storage,
      key: string,
      value: string,
    ) {
      if (key.endsWith(cookieName.personProfile)) {
        throw new DOMException('Quota exceeded', 'QuotaExceededError');
      }
      setItem.call(this, key, value);
    });
    const user = userEvent.setup();
    const router = createMemoryRouter([{ path: '/welcome', element: <WelcomeRoute /> }], {
      initialEntries: ['/welcome?step=viewer'],
    });
    render(<RouterProvider router={router} />);
    await user.click(screen.getByRole('button', { name: 'Back' }));
    await user.click(screen.getByRole('radio', { name: 'SolidWorks' }));
    expect(screen.getByTestId('setup-storage-status')).toHaveTextContent('Tau could not save this on this device.');
    await user.click(screen.getByRole('button', { name: 'Continue' }));
    await user.click(screen.getByRole('switch', { name: /trackpad/i }));
    expect(deviceRecordStore.read().inputDevice).toBe('trackpad');
    expect(screen.getByTestId('setup-storage-status')).toHaveTextContent('Tau could not save this on this device.');
  });
});
