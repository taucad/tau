/* eslint-disable @typescript-eslint/naming-convention -- TAU_DEBUG mirrors the environment contract. */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { RouterContextProvider } from 'react-router';

const getEnvironment = vi.fn();
vi.mock('#environment.config.js', () => ({ ENV: { TAU_API_URL: 'https://api.test' }, getEnvironment }));
vi.mock('@taucad/files-ui/filesystem/handle-store', () => ({ createWorkspace: vi.fn() }));
vi.mock('#hooks/use-file-manager.js', () => ({ useFileManager: vi.fn() }));

const { loader } = await import('#routes/[__e2e].project-creation-location/route.js');

const load = async (fixture: string): ReturnType<typeof loader> => {
  const request = new Request(`https://tau.test/__e2e/project-creation-location?fixture=${fixture}`);
  return loader({
    request,
    url: new URL(request.url),
    pattern: '/__e2e/project-creation-location',
    params: {},
    context: new RouterContextProvider(),
  });
};

describe('project-creation-location debug loader', () => {
  beforeEach(() => {
    getEnvironment.mockReset();
    getEnvironment.mockResolvedValue({ TAU_DEBUG: true });
  });

  it('returns a validated fixture in debug builds', async () => {
    await expect(load('browser-workspace-1')).resolves.toEqual({ fixture: 'browser-workspace-1' });
  });

  it('rejects unsafe fixture names', async () => {
    await expect(load('../outside')).rejects.toMatchObject({ status: 400 });
  });

  it('is absent outside debug builds', async () => {
    getEnvironment.mockResolvedValue({ TAU_DEBUG: false });
    await expect(load('health-check')).rejects.toMatchObject({ status: 404 });
  });
});
