/* eslint-disable @typescript-eslint/naming-convention -- TAU_DEBUG mirrors the environment contract. */
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const getEnvironment = vi.fn();
const useParams = vi.fn();
const useProjectIdBySlugs = vi.fn();

vi.mock('#environment.config.js', () => ({ getEnvironment }));
vi.mock('react-router', () => ({ useParams }));
vi.mock('#hooks/use-project-slug-route.js', () => ({ useProjectIdBySlugs }));
vi.mock('#components/ui/loader.js', () => ({ Loader: () => <div data-testid='loader' /> }));
vi.mock('#routes/w.$workspace.$project/project-not-found.js', () => ({
  ProjectNotFound: () => <div data-testid='not-found' />,
}));
vi.mock('#routes/w.$workspace.$project_.preview/preview-route.js', () => ({
  PreviewSession: ({ children, projectId }: { readonly children?: React.ReactNode; readonly projectId: string }) => (
    <div data-project-id={projectId}>{children}</div>
  ),
}));
vi.mock('#routes/[__spike].fov-transition.$workspace.$project/fov-transition-spike.js', () => ({
  default: () => <div />,
}));

const { handle, loader, RouteProvider } = await import('#routes/[__spike].fov-transition.$workspace.$project/route.js');

describe('FOV transition spike route', () => {
  beforeEach(() => {
    getEnvironment.mockReset();
    getEnvironment.mockResolvedValue({ TAU_DEBUG: true });
    useParams.mockReturnValue({ workspace: 'tau-workspace', project: 'racing-drone' });
    useProjectIdBySlugs.mockReset();
  });

  afterEach(cleanup);

  it('renders without the production page chrome', () => {
    expect(handle.enablePageWrapper).toBe(false);
  });

  it('is absent outside debug builds', async () => {
    getEnvironment.mockResolvedValue({ TAU_DEBUG: false });
    await expect(loader()).rejects.toMatchObject({ status: 404 });
  });

  it('shows the resolver loading state', () => {
    useProjectIdBySlugs.mockReturnValue({ status: 'resolving' });
    render(<RouteProvider />);
    expect(screen.getByTestId('loader')).toBeInTheDocument();
    expect(useProjectIdBySlugs).toHaveBeenCalledWith('tau-workspace', 'racing-drone');
  });

  it('shows not found when the slugs do not resolve', () => {
    useProjectIdBySlugs.mockReturnValue({ status: 'not-found' });
    render(<RouteProvider />);
    expect(screen.getByTestId('not-found')).toBeInTheDocument();
  });

  it('passes the resolved project id into the production preview session', () => {
    useProjectIdBySlugs.mockReturnValue({ status: 'resolved', value: 'proj_racing_drone' });
    render(
      <RouteProvider>
        <span>spike</span>
      </RouteProvider>,
    );
    expect(screen.getByText('spike').parentElement).toHaveAttribute('data-project-id', 'proj_racing_drone');
  });
});
