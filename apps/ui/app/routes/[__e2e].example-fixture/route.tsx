import * as React from 'react';
import { useLocation, useNavigate } from 'react-router';
import { findTestFixture } from '@taucad/tau-examples/test-fixtures';
import { Loader } from '#components/ui/loader.js';
import { getEnvironment } from '#environment.config.js';
import { useProjectManager } from '#hooks/use-project-manager.js';
import { homeProjectCreationLocation } from '#types/project-creation-location.types.js';
import { projectUrl } from '#utils/project-url.utils.js';

export const loader = async (): Promise<Response> => {
  const environment = await getEnvironment();
  if (!environment.TAU_DEBUG) {
    // oxlint-disable-next-line typescript/only-throw-error -- React Router route control-flow.
    throw new Response('Not found', { status: 404 });
  }
  return Response.json({ ok: true });
};

const ExampleFixtureDebugRoute = (): React.JSX.Element => {
  const { createProject, isLoading } = useProjectManager();
  const navigate = useNavigate();
  const { search } = useLocation();
  const started = React.useRef(false);
  const [error, setError] = React.useState<string>();

  React.useEffect(() => {
    if (isLoading || started.current) {
      return;
    }
    started.current = true;
    const parameters = new URLSearchParams(search);
    const locator = parameters.get('locator');
    const fixture = locator ? findTestFixture(locator) : undefined;
    parameters.delete('locator');

    const seed = async (): Promise<void> => {
      try {
        if (!fixture) {
          throw new Error(`Unknown example fixture: ${locator ?? ''}`);
        }
        const files = Object.fromEntries(
          await Promise.all(
            fixture.assets
              .filter(({ path }) => path !== 'tau.json' && path !== fixture.manifest.assets.main.thumbnail)
              .map(async ({ path, load }) => [path, { content: await load() }] as const),
          ),
        );
        const project = await createProject({
          project: {
            name: fixture.manifest.name,
            description: fixture.manifest.description,
            tags: fixture.manifest.tags,
            assets: { main: { entryPath: fixture.manifest.assets.main.entryPath } },
          },
          activeKernel: fixture.kernel === 'jscad' ? 'jscad' : 'replicad',
          location: homeProjectCreationLocation,
          files,
        });
        const query = parameters.size === 0 ? '' : `?${parameters.toString()}`;
        void navigate(`${projectUrl(project.slugs)}${query}`);
      } catch (seedError) {
        setError(seedError instanceof Error ? seedError.message : String(seedError));
      }
    };
    void seed();
  }, [createProject, isLoading, navigate, search]);

  return error ? <main role='alert'>{error}</main> : <Loader />;
};

export default ExampleFixtureDebugRoute;
