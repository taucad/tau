import '#styles/global.css';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { page, userEvent } from 'vitest/browser';
import { TooltipProvider } from '@taucad/ui/components/tooltip';
import type { ShareMethod } from '@taucad/publish-ui/components/publish/project-share-panel';

/*
 * The Share pane scrolls as one, at phone and desktop sizes, with Collaborators present: the reported failure was
 * a cloud link and Collaborators on a phone, where three scrollers and a pinned header left almost nothing to
 * scroll. Only host and network authorities are fixtures; the pane, its sections and the shipped styles are real.
 */
vi.mock('#environment.config.js', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  // eslint-disable-next-line @typescript-eslint/naming-convention -- Match the existing environment module's exported names.
  ENV: { TAU_API_URL: 'http://localhost:4000', TAU_FRONTEND_URL: 'http://localhost:3000' },
}));
vi.mock('#hooks/use-revision-status.js', () => {
  const commands = {
    publishProject: () => undefined,
    confirmPublish: () => undefined,
    resetPublish: () => undefined,
  };
  const status = {
    publish: { phase: 'idle', tags: [], publicationId: undefined, shareUrl: undefined, error: undefined },
    remote: { kind: 'tau', phase: 'connected' },
    /* The link shows the head of `main`, so the published state offers Copy link alone. */
    line: { kind: 'branch', name: 'main' },
    headRevisionId: 'rev_v2',
    branches: [],
  };
  return {
    useRevisionStatus: () => status,
    useRevisionCommands: () => commands,
    useProjectRole: () => 'owner',
  };
});
vi.mock('#lib/share-providers.js', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  getGithubGistConnectionStatus: async () => 'not-connected',
}));

const { ProjectSharePanel } = await import('#components/publish/project-share-panel.js');
const { ProjectPeopleWithAccess } = await import('#routes/w.$workspace.$project/revision-collaborators.js');

const people = Array.from({ length: 7 }, (_unused, index) => ({
  email: `a-much-longer-collaborator-address-${String(index)}@example.test`,
  role: index % 2 === 0 ? 'write' : 'read',
  status: index === 0 ? 'pending' : 'accepted',
  expiresAt: '2026-10-02T00:00:00.000Z',
}));

const grants = Array.from({ length: 12 }, (_unused, index) => ({
  id: `sga_${String(index)}`,
  recipientEmail: `invited-person-with-a-long-address-${String(index)}@example.test`,
  status: 'active',
  createdAt: '2026-01-03T00:00:00.000Z',
  revokedAt: null,
  notDelivered: index === 1,
}));

const publishedEnvelope = {
  project: { id: 'proj_ui', name: 'Demo', description: 'a model' },
  share: {
    id: 'shr_ui',
    url: 'https://tau.example/s/tau~shr_ui',
    visibility: 'private',
    status: 'active',
    stoppedAt: null,
    publishedAt: '2026-01-02T00:00:00.000Z',
    currentVersion: { publicationId: 'pub_ui', tag: 'v2', revisionId: 'rev_v2' },
    access: { grants },
  },
};
const unpublishedEnvelope = {
  project: { id: 'proj_ui', name: 'Demo', description: null },
  share: null,
};

type State = Readonly<{
  name: string;
  method: ShareMethod;
  envelope: { status: number; body?: unknown };
  /** What is on screen once the state has settled. */
  ready: () => Promise<unknown>;
}>;

const states: readonly State[] = [
  {
    name: 'direct link',
    method: 'direct',
    envelope: { status: 200, body: unpublishedEnvelope },
    ready: async () => screen.findByRole('button', { name: 'Copy link' }),
  },
  {
    name: 'GitHub Gist',
    method: 'github-gist',
    envelope: { status: 200, body: unpublishedEnvelope },
    ready: async () => screen.findByRole('button', { name: 'Connect GitHub' }),
  },
  {
    name: 'cloud link, not published',
    method: 'tau',
    envelope: { status: 200, body: unpublishedEnvelope },
    ready: async () => screen.findByRole('button', { name: 'Publish and copy link' }),
  },
  {
    name: 'cloud link, published, every invited person shown',
    method: 'tau',
    envelope: { status: 200, body: publishedEnvelope },
    ready: async () => {
      await userEvent.click(await screen.findByRole('button', { name: 'Show all 12' }));
      return screen.findByRole('button', { name: 'Show fewer' });
    },
  },
  {
    name: 'cloud link, signed out',
    method: 'tau',
    envelope: { status: 401 },
    ready: async () => screen.findByText('Sign in to create a cloud link'),
  },
];

const viewports = [
  { width: 320, height: 568 },
  { width: 390, height: 844 },
  { width: 1280, height: 800 },
];

/** A form control scrolls its own text; it is not a region of the pane. */
const isFormControl = (element: Element): boolean => element.matches('input, textarea, select');

const isShown = (element: Element): boolean => {
  const { width, height } = element.getBoundingClientRect();
  return width > 0 && height > 0 && getComputedStyle(element).visibility !== 'hidden';
};

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe('Share pane single scroller', () => {
  it.each(
    viewports.flatMap((viewport) =>
      states.map((state) => ({
        ...state,
        ...viewport,
        label: `${state.name} at ${viewport.width}×${viewport.height}`,
      })),
    ),
  )('should scroll as one region: $label', async ({ method, envelope, ready, width, height }) => {
    await page.viewport(width, height);
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string) => {
        if (url.endsWith('/collaborators')) {
          return Response.json(people);
        }
        if (url.endsWith('/share')) {
          return envelope.status === 200
            ? Response.json(envelope.body)
            : new Response('{}', { status: envelope.status });
        }
        return new Response('{}', { status: 404 });
      }),
    );
    render(
      <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
        <MemoryRouter>
          <TooltipProvider>
            {/* The host's box: a sized, non-scrolling slot, as the dock panel and the phone sheet give the pane. */}
            <div style={{ width: '100vw', height: '100vh', overflow: 'hidden' }}>
              <ProjectSharePanel
                projectId='proj_ui'
                projectName='Demo'
                entryPath='main.ts'
                initialMethod={method}
                collectSnapshot={async () => ({ entryPath: 'main.ts', files: [], warnings: [] })}
                extraSections={<ProjectPeopleWithAccess projectId='proj_ui' />}
              />
            </div>
          </TooltipProvider>
        </MemoryRouter>
      </QueryClientProvider>,
    );

    await ready();
    await userEvent.click(await screen.findByRole('button', { name: 'Show all 7' }));
    await document.fonts.ready;

    const region = screen.getByRole('region', { name: 'Share project' });
    const elements = [region, ...region.querySelectorAll('*')];
    const scrollers = elements.filter(
      (element) => !isFormControl(element) && ['auto', 'scroll'].includes(getComputedStyle(element).overflowY),
    );
    expect(scrollers.map((element) => (element as HTMLElement).dataset['slot'])).toEqual(['share-pane-scroll']);
    const [scroller] = scrollers as [HTMLElement];
    expect(elements.filter((element) => ['sticky', 'fixed'].includes(getComputedStyle(element).position))).toEqual([]);
    expect(scroller.scrollWidth).toBeLessThanOrEqual(scroller.clientWidth);

    scroller.scrollTop = scroller.scrollHeight;
    await waitFor(() => {
      const controls = [...scroller.querySelectorAll('button, a[href], input, [role=combobox]')].filter((control) =>
        isShown(control),
      );
      const last = controls.at(-1)!;
      const bounds = scroller.getBoundingClientRect();
      const box = last.getBoundingClientRect();
      expect(last).toHaveTextContent('Show fewer');
      expect(box.top).toBeGreaterThanOrEqual(bounds.top);
      expect(box.bottom).toBeLessThanOrEqual(bounds.bottom);
    });
  });
});
