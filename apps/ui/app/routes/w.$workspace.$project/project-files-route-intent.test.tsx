import { act, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { MemoryRouter, useLocation } from 'react-router';
import { ProjectFilesRouteIntent } from '#routes/w.$workspace.$project/project-files-route-intent.js';

const openPanel = vi.fn();
let layoutReady = true;
const listeners = new Set<() => void>();
const layoutController = {
  ready: () => layoutReady,
  subscribe: (listener: () => void) => {
    listeners.add(listener);
    return () => listeners.delete(listener);
  },
};
vi.mock('#routes/w.$workspace.$project/project-workspace-context.js', () => ({
  useProjectWorkspace: () => ({ openPanel, layoutController }),
}));

function Location(): React.JSX.Element {
  const location = useLocation();
  return (
    <output>
      {location.pathname}
      {location.search}
      {location.hash}
    </output>
  );
}

describe('project files navigation', () => {
  beforeEach(() => {
    layoutReady = true;
    openPanel.mockClear();
  });
  it('should open files and consume the request without losing the chat or fragment', async () => {
    render(
      <MemoryRouter initialEntries={['/w/home/one?chat=chat_1&workbench=files#detail']}>
        <ProjectFilesRouteIntent />
        <Location />
      </MemoryRouter>,
    );
    expect(screen.getByRole('status')).toHaveTextContent('/w/home/one?chat=chat_1&workbench=files#detail');
    expect(openPanel).toHaveBeenCalledWith('files', expect.any(Function));
    const onOpened = openPanel.mock.calls[0]?.[1] as () => void;
    await act(async () => {
      onOpened();
    });
    await waitFor(() => {
      expect(screen.getByRole('status')).toHaveTextContent('/w/home/one?chat=chat_1#detail');
    });
  });
  it('should retain the request until the saved arrangement has loaded', async () => {
    layoutReady = false;
    render(
      <MemoryRouter initialEntries={['/w/home/one?workbench=files']}>
        <ProjectFilesRouteIntent />
        <Location />
      </MemoryRouter>,
    );
    expect(openPanel).not.toHaveBeenCalled();
    expect(screen.getByRole('status')).toHaveTextContent('workbench=files');
    await act(async () => {
      layoutReady = true;
      for (const listener of listeners) {
        listener();
      }
    });
    expect(openPanel).toHaveBeenCalledWith('files', expect.any(Function));
  });
});
