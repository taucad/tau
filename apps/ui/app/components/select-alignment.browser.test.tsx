import '#styles/global.css';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { getCoreRowModel, useReactTable } from '@tanstack/react-table';
import { afterEach, expect, it, vi } from 'vitest';
import { page, userEvent } from 'vitest/browser';
import { TooltipProvider } from '@taucad/ui/components/tooltip';

// Only host/network authorities are fixtures; shipping controls and layout render unchanged.
vi.mock('#environment.config.js', () => ({
  // eslint-disable-next-line @typescript-eslint/naming-convention -- Match the existing environment module's exported names.
  ENV: { TAU_API_URL: 'http://localhost:4000', TAU_FRONTEND_URL: 'http://localhost:3000' },
}));
vi.mock('#hooks/use-file-manager.js', () => ({ useFileManager: () => ({}) }));
vi.mock('#hooks/use-project-manager.js', () => ({ useProjectManager: () => ({}) }));
vi.mock('#utils/workspace-telemetry.utils.js', () => ({ useWorkspaceTelemetry: () => ({}) }));
vi.mock('#hooks/use-analytics.js', () => ({ useAnalytics: () => ({}) }));
vi.mock('#filesystem/handle-store.js', () => ({
  listWorkspaces: async () => [
    { workspaceId: 'first', name: 'Workshop' },
    { workspaceId: 'last', name: 'A workspace name that is much longer than the available trigger' },
  ],
  getWorkspace: vi.fn(),
  requestHandlePermission: vi.fn(),
}));

const { RevisionCollaborators } = await import('#routes/w.$workspace.$project/revision-collaborators.js');
const { WorkspaceUnavailableRecovery } =
  await import('#routes/w.$workspace.$project/workspace-unavailable-recovery.js');
const { PublicationAccessPanel } = await import('#components/publish/publication-access-panel.js');
const { AdditionalField } = await import('#components/auth/additional-field.js');
const { DataTablePagination } = await import('#components/ui/data-table.js');

function Pagination(): React.JSX.Element {
  const table = useReactTable({
    data: [{ id: 'one' }],
    columns: [{ accessorKey: 'id' }],
    getCoreRowModel: getCoreRowModel(),
  });
  return <DataTablePagination table={table} pageSizeOptions={[10, 20, 100]} />;
}

const rect = (element: Element) => {
  const { x, y, width, height } = element.getBoundingClientRect();
  return { x, y, width, height };
};

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  document.documentElement.classList.remove('dark');
});

const sites = [
  'Invitation role',
  'Role for teammate@example.test',
  'General access',
  'Account choice',
  'Workspace recovery',
  'Items per page',
];

it.each(
  sites.flatMap((site) => [
    { site, width: 560, theme: 'light' },
    { site, width: 320, theme: 'dark' },
  ]),
)('should align the shipping $site select at $width px in $theme', async ({ site, width, theme }) => {
  await page.viewport(width === 320 ? 390 : 900, 1400);
  document.documentElement.classList.toggle('dark', theme === 'dark');
  vi.stubGlobal(
    'fetch',
    vi.fn(async () =>
      Response.json([
        { email: 'teammate@example.test', role: 'read', status: 'accepted', expiresAt: '2026-10-02T00:00:00.000Z' },
      ]),
    ),
  );
  const narrow = width === 320;
  const child =
    site === 'Invitation role' || site === 'Role for teammate@example.test' ? (
      <RevisionCollaborators projectId='fixture' />
    ) : site === 'General access' ? (
      <PublicationAccessPanel
        apiBaseUrl='http://localhost:4000'
        publicationId='fixture'
        shareUrl='https://tau.new/fixture'
        visibility={narrow ? 'public' : 'private'}
        grants={[]}
        onVisibilityChange={vi.fn()}
        onGrantsChanged={vi.fn()}
      />
    ) : site === 'Account choice' ? (
      <AdditionalField
        name='account-choice'
        field={{
          name: 'account-choice',
          type: 'string',
          inputType: 'select',
          label: 'Account choice',
          defaultValue: narrow ? 'last' : 'first',
          options: [
            { value: 'first', label: 'First' },
            { value: 'last', label: 'A much longer account choice than the available space' },
          ],
        }}
      />
    ) : site === 'Workspace recovery' ? (
      <WorkspaceUnavailableRecovery
        reason='disconnected'
        workspaceId={narrow ? 'last' : 'first'}
        workspaceName='Workshop'
      />
    ) : (
      <Pagination />
    );
  render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <TooltipProvider>
        <div style={{ position: 'relative', width, minHeight: 600, margin: '220px 24px' }}>{child}</div>
      </TooltipProvider>
    </QueryClientProvider>,
  );
  const trigger =
    site === 'Workspace recovery'
      ? await screen.findByRole('combobox')
      : await screen.findByRole('combobox', { name: site });
  const current =
    site === 'Invitation role'
      ? 'Can edit'
      : site === 'Role for teammate@example.test'
        ? 'Can view'
        : site === 'General access'
          ? narrow
            ? 'Public'
            : 'Private'
          : site === 'Account choice'
            ? narrow
              ? 'A much longer account choice than the available space'
              : 'First'
            : site === 'Workspace recovery'
              ? narrow
                ? 'A workspace name that is much longer than the available trigger'
                : 'Workshop'
              : '10';
  await waitFor(() => {
    expect(trigger.textContent).toContain(current);
  });
  // The invitation's flex row depends on the adjacent button's font metrics.
  await document.fonts.ready;
  trigger.scrollIntoView({ block: 'center' });
  const before = rect(trigger);
  const frame = trigger.closest('div');
  const frameBefore = frame ? rect(frame) : undefined;
  trigger.focus();
  await userEvent.keyboard('{ArrowDown}');
  const selected = await screen.findByRole('option', { name: current, selected: true });
  const row = rect(selected);
  expect(row.width).toBe(before.width);
  expect(row.height).toBe(before.height);
  expect(getComputedStyle(selected).borderRadius).toBe(getComputedStyle(trigger).borderRadius);
  if (site === 'Items per page') {
    // Popper opens above the trigger rather than replacing its selected row.
    expect(row.y + row.height).toBeLessThan(before.y);
  } else {
    expect(row).toEqual(before);
  }
  expect(rect(trigger)).toEqual(before);
  if (frame && frameBefore) {
    expect(rect(frame)).toEqual(frameBefore);
  }
  await page.screenshot({
    path: `../../../../out/research/select-trigger-alignment/sites/${site.replaceAll(/[^\dA-Za-z]/g, '-')}-${theme}.png`,
  });
  await userEvent.keyboard('{Escape}');
  expect(rect(trigger)).toEqual(before);
  expect(document.activeElement).toBe(trigger);
});
