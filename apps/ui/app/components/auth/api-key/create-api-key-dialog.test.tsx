// @vitest-environment jsdom

// oxlint-disable-next-line import/no-unassigned-import -- extends Vitest matchers for DOM assertions.
import '@testing-library/jest-dom/vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { CreateApiKeyDialog } from '#components/auth/api-key/create-api-key-dialog.js';

type CreateApiKeyMutation = (
  payload: { name: string },
  options: { onSuccess: (result: { key: string }) => void },
) => void;

const authMocks = vi.hoisted(() => ({
  createApiKey: vi.fn<CreateApiKeyMutation>(),
}));

vi.mock('@better-auth-ui/react', () => ({
  useAuth: () => ({
    authClient: {},
    localization: {
      settings: {
        cancel: 'Cancel',
        copyToClipboard: 'Copy to clipboard',
      },
    },
  }),
  useAuthPlugin: () => ({
    localization: {
      apiKey: 'API key',
      apiKeysDescription: 'Create an API key for programmatic access to your account.',
      createApiKey: 'Create API key',
      dismissNewKey: 'Done',
      name: 'Name',
      newApiKey: 'New API key',
      newApiKeyWarning: 'Copy this key now.',
    },
  }),
  useCreateApiKey: () => ({
    mutate: authMocks.createApiKey,
    isPending: false,
  }),
}));

const renderDialog = (): ReturnType<typeof render> => render(<CreateApiKeyDialog open onOpenChange={vi.fn()} />);

const getNameInput = (): HTMLInputElement => {
  const element = screen.getByLabelText('Name');
  if (!(element instanceof HTMLInputElement)) {
    throw new Error('Expected Name field to be an input');
  }

  return element;
};

const getSubmitButton = (): HTMLElement => screen.getByRole('button', { name: 'Create API key' });

describe('CreateApiKeyDialog', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders name as a required field with an entry placeholder', () => {
    renderDialog();

    const nameInput = getNameInput();

    expect(nameInput).toBeRequired();
    expect(nameInput).toHaveAttribute('placeholder', 'Enter name');
    expect(nameInput).not.toHaveAttribute('placeholder', 'Optional');
    expect(screen.queryByPlaceholderText('Optional')).not.toBeInTheDocument();
  });

  it('blocks an empty name before creating an API key', async () => {
    const user = userEvent.setup();
    renderDialog();

    await user.click(getSubmitButton());

    expect(authMocks.createApiKey).not.toHaveBeenCalled();
    expect(getNameInput()).toHaveAttribute('aria-invalid', 'true');
    expect(screen.getByRole('alert')).not.toBeEmptyDOMElement();
  });

  it('blocks a whitespace-only name before creating an API key', async () => {
    const user = userEvent.setup();
    renderDialog();

    await user.type(getNameInput(), '   ');
    await user.click(getSubmitButton());

    expect(authMocks.createApiKey).not.toHaveBeenCalled();
    expect(getNameInput()).toHaveAttribute('aria-invalid', 'true');
    expect(screen.getByRole('alert')).toHaveTextContent('API key name is required.');
  });

  it('trims a valid name before creating an API key', async () => {
    const user = userEvent.setup();
    renderDialog();

    await user.type(getNameInput(), '  Production key  ');
    await user.click(getSubmitButton());

    expect(authMocks.createApiKey).toHaveBeenCalledTimes(1);
    const firstCall = authMocks.createApiKey.mock.calls[0];
    expect(firstCall).toBeDefined();
    if (!firstCall) {
      throw new Error('Expected createApiKey to be called');
    }

    const [payload, options] = firstCall;
    expect(payload).toEqual({ name: 'Production key' });
    expect(options.onSuccess).toEqual(expect.any(Function));
  });
});
