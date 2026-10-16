import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { GithubRepositoryWriteSettings } from '#components/github/github-repository-write-settings.js';
const fixture = vi.hoisted(() => ({ access: vi.fn(), setWrite: vi.fn() }));
vi.mock('#lib/github-connections.js', () => ({
  githubConnections: fixture,
  githubErrorMessage: (error: Error) => error.message,
}));
const access = {
  repositoryId: 9,
  ownerId: 7,
  fullName: 'studio/bracket',
  canRead: true,
  canWrite: true,
  writeEnabled: false,
};
const show = (push = vi.fn(async () => undefined), pushUnavailable?: string) => {
  render(
    <QueryClientProvider
      client={new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })}
    >
      <GithubRepositoryWriteSettings
        connectionId='connection'
        repositoryId={9}
        onPush={push}
        pushUnavailable={pushUnavailable}
      />
    </QueryClientProvider>,
  );
  return push;
};
beforeEach(() => {
  vi.resetAllMocks();
  fixture.access.mockResolvedValue(access);
  fixture.setWrite.mockImplementation(async (_connection, input: { enabled: boolean }) => {
    fixture.access.mockResolvedValue({ ...access, writeEnabled: input.enabled });
    return { writeEnabled: input.enabled };
  });
});
describe('repository write approval and first push', () => {
  it('should require approval and then a separate push gesture', async () => {
    const push = show();
    await userEvent.click(await screen.findByRole('button', { name: 'Enable writes' }));
    expect(screen.getByRole('alertdialog')).toHaveTextContent('Nothing is pushed now');
    expect(push).not.toHaveBeenCalled();
    await userEvent.click(screen.getByRole('button', { name: 'Enable repository writes' }));
    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Push to GitHub' })).toBeEnabled();
    });
    expect(fixture.setWrite).toHaveBeenCalledWith('connection', { repositoryId: 9, enabled: true });
    expect(push).not.toHaveBeenCalled();
    await userEvent.click(screen.getByRole('button', { name: 'Push to GitHub' }));
    expect(await screen.findByRole('status')).toHaveTextContent('Push completed');
    expect(push).toHaveBeenCalledOnce();
  });
  it('should cancel enablement without changing permissions or pushing', async () => {
    const push = show();
    await userEvent.click(await screen.findByRole('button', { name: 'Enable writes' }));
    await userEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(fixture.setWrite).not.toHaveBeenCalled();
    expect(push).not.toHaveBeenCalled();
    expect(screen.getByRole('button', { name: 'Push to GitHub' })).toBeDisabled();
  });
  it('should disable writes while retaining reads', async () => {
    fixture.access.mockResolvedValue({ ...access, writeEnabled: true });
    const push = show();
    await userEvent.click(await screen.findByRole('button', { name: 'Disable writes' }));
    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Push to GitHub' })).toBeDisabled();
    });
    expect(screen.getByText('Read files and history; import branch designs.')).toBeVisible();
    expect(push).not.toHaveBeenCalled();
  });
  it('should explain denied provider writes without enabling them', async () => {
    fixture.access.mockResolvedValue({ ...access, canWrite: false });
    show();
    expect(await screen.findByRole('button', { name: 'Enable writes' })).toBeDisabled();
    expect(screen.getByText(/GitHub has not granted write access/u)).toBeVisible();
  });
  it('should show an approval failure inside the open confirmation', async () => {
    fixture.setWrite.mockRejectedValue(new Error('Repository access changed. Refresh and try again.'));
    const push = show();
    await userEvent.click(await screen.findByRole('button', { name: 'Enable writes' }));
    await userEvent.click(screen.getByRole('button', { name: 'Enable repository writes' }));
    const dialog = screen.getByRole('alertdialog');
    expect(await within(dialog).findByRole('alert')).toHaveTextContent('Repository access changed');
    expect(push).not.toHaveBeenCalled();
  });
  it('should not offer a push while the revision scheduler is fetching', async () => {
    fixture.access.mockResolvedValue({ ...access, writeEnabled: true });
    const push = show(undefined, 'Finish fetching before pushing.');
    expect(await screen.findByRole('button', { name: 'Push to GitHub' })).toBeDisabled();
    expect(screen.getByText('Finish fetching before pushing.')).toBeVisible();
    expect(push).not.toHaveBeenCalled();
  });
});
