import { render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { MemoryRouter, useLocation } from 'react-router';
import { ProjectFilesRouteIntent } from '#routes/w.$workspace.$project/project-files-route-intent.js';

const openPanel = vi.fn();
vi.mock('#routes/w.$workspace.$project/project-workspace-context.js', () => ({
  useProjectWorkspace: () => ({ openPanel }),
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
  it('should open files and consume the request without losing the chat or fragment', async () => {
    render(
      <MemoryRouter initialEntries={['/w/home/one?chat=chat_1&workbench=files#detail']}>
        <ProjectFilesRouteIntent />
        <Location />
      </MemoryRouter>,
    );
    await waitFor(() => {
      expect(screen.getByRole('status')).toHaveTextContent('/w/home/one?chat=chat_1#detail');
    });
    expect(openPanel).toHaveBeenCalledWith('files');
  });
});
