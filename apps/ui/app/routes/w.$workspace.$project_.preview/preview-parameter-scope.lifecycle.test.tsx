// @vitest-environment jsdom
import { StrictMode } from 'react';
import { act, render, screen, waitFor } from '@testing-library/react';
import { expect, it, vi } from 'vitest';
import { mock } from 'vitest-mock-extended';
import type { ParameterSetService } from '#services/parameter-set-service.js';
import type { useFileManager } from '#hooks/use-file-manager.js';
import { PreviewParameterScope } from '#routes/w.$workspace.$project_.preview/preview-parameter-scope.js';

const fixture = vi.hoisted(() => ({
  manager: undefined as ReturnType<typeof useFileManager> | undefined,
  create: vi.fn(),
}));
vi.mock('#hooks/use-file-manager.js', () => ({
  useFileManager: () => fixture.manager,
  FileManagerProvider: ({ children }: { children: React.ReactNode }): React.JSX.Element => <div>{children}</div>,
}));
vi.mock('#services/parameter-set-service.js', () => ({ createParameterSetService: fixture.create }));

it('should drain the parameter service before unmounting its temporary filesystem', async () => {
  const closed = Promise.withResolvers<void>();
  const service = mock<ParameterSetService>();
  service.close.mockReturnValue(closed.promise);
  fixture.create.mockReturnValue(service);
  const manager = mock<ReturnType<typeof useFileManager>>();
  const workspace = mock<ReturnType<typeof useFileManager>['workspace']>();
  workspace.mount.mockResolvedValue(undefined);
  manager.workspace = workspace;
  manager.exists.mockResolvedValue(false);
  manager.writeFiles.mockResolvedValue(undefined);
  manager.whenServicesReady.mockResolvedValue(mock<Awaited<ReturnType<typeof manager.whenServicesReady>>>());
  fixture.manager = manager;
  const mounted = render(
    <StrictMode>
      <PreviewParameterScope>{() => <span>Preview ready</span>}</PreviewParameterScope>
    </StrictMode>,
  );
  await screen.findByText('Preview ready');
  expect(workspace.mount).toHaveBeenCalledOnce();
  expect(service.close).not.toHaveBeenCalled();
  mounted.unmount();
  await act(async () => {
    await Promise.resolve();
  });
  expect(service.discardDrafts).toHaveBeenCalledOnce();
  expect(service.close).toHaveBeenCalledOnce();
  expect(workspace.unmount).not.toHaveBeenCalled();
  await act(async () => {
    closed.resolve();
  });
  await waitFor(() => {
    expect(workspace.unmount).toHaveBeenCalledOnce();
  });
});
