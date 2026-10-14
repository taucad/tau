import '#styles/global.css';
import axe from 'axe-core';
import { MemoryRouter, Route, Routes } from 'react-router';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { page } from 'vitest/browser';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { TooltipProvider } from '@taucad/ui/components/tooltip';
import type { MachineClient } from '@taucad/runtime/machine';
import type { RuntimeTransportFacet } from '@taucad/runtime/transport';
import { createFixture, entry } from '#routes/w.$workspace.$project/chat-print.fixture.js';

let enabled = true;
vi.doMock('#flags/use-feature.js', () => ({ useFeature: () => enabled }));
let machines: RuntimeTransportFacet<MachineClient>;
vi.doMock('#hooks/use-machines.js', async (original) => ({
  ...(await original<Record<string, unknown>>()),
  useMachinesFacet: () => machines,
}));
it.each(['/machines', '/machines/host/mill'])('blocks a saved route %s without observing machines', (route) => {
  enabled = false;
  const fixture = createFixture();
  const list = vi.spyOn(fixture.client, 'list');
  machines = { available: true, ...fixture.client };
  try {
    mount(route);
    expect(screen.getByText('Machines are not available in this release.')).toBeVisible();
    expect(screen.getByRole('link', { name: 'Open projects' })).toHaveAttribute('href', '/projects');
    expect(list).not.toHaveBeenCalled();
  } finally {
    enabled = true;
  }
});
const { default: MachinesRoute } = await import('#routes/machines._index/route.js');
const { default: MachineRoute } = await import('#routes/machines.$hostId.$machineId/route.js');
const mount = (route = '/machines') =>
  render(
    <MemoryRouter initialEntries={[route]}>
      <TooltipProvider>
        <Routes>
          <Route path='/machines' element={<MachinesRoute />} />
          <Route path='/machines/:hostId/:machineId' element={<MachineRoute />} />
        </Routes>
      </TooltipProvider>
    </MemoryRouter>,
  );
afterEach(() => {
  cleanup();
  document.documentElement.classList.remove('dark');
});

describe('production Machines navigation and layout', () => {
  it.each([
    { width: 1280, theme: 'light' },
    { width: 1280, theme: 'dark' },
    { width: 320, theme: 'light' },
    { width: 320, theme: 'dark' },
  ])('keeps directory and workbench actionable at $width in $theme', async ({ width, theme }) => {
    await page.viewport(width, 900);
    document.documentElement.classList.toggle('dark', theme === 'dark');
    const fixture = createFixture({
      entries: Array.from({ length: 64 }, (_, index) =>
        entry({ machineId: `machine-${index}`, name: `Workshop ${String(index).padStart(2, '0')}` }),
      ),
    });
    machines = { available: true, ...fixture.client };
    const capture = vi.spyOn(fixture.client, 'captureStill');
    const { container } = mount();
    const list = await screen.findByRole('list', { name: 'Machines' });
    expect(within(list).getAllByRole('link')).toHaveLength(20);
    expect(capture).not.toHaveBeenCalled();
    expect(container.scrollWidth).toBeLessThanOrEqual(width);
    const audit = await axe.run(container, { rules: { region: { enabled: false } } });
    expect(audit.violations).toEqual([]);
    await page.screenshot({
      path: `../../../../../out/research/global-machines/implementation/browser/directory-${width}-${theme}.png`,
    });
    fireEvent.change(screen.getByRole('searchbox', { name: 'Search machines' }), { target: { value: 'Workshop 42' } });
    const machine = await screen.findByRole('link', { name: /Workshop 42/u });
    fireEvent.click(machine);
    await screen.findByRole('heading', { name: 'Workshop 42' });
    expect(screen.getByRole('region', { name: 'Monitor' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'tau://machines/host-1/machine-42' })).toHaveAttribute(
      'href',
      'tau://machines/host-1/machine-42',
    );
    expect(capture).not.toHaveBeenCalled();
    expect(container.scrollWidth).toBeLessThanOrEqual(width);
    const detailAudit = await axe.run(container, { rules: { region: { enabled: false } } });
    expect(detailAudit.violations).toEqual([]);
    await page.screenshot({
      path: `../../../../../out/research/global-machines/implementation/browser/detail-${width}-${theme}.png`,
    });
  });
  it.each([
    { route: '/machines/other/machine-1', title: 'This machine belongs to another host' },
    { route: '/machines/host-1/removed', title: 'Machine is no longer connected' },
  ])('provides a recovery link for $title', async ({ route, title }) => {
    machines = { available: true, ...createFixture().client };
    mount(route);
    await screen.findByText(title);
    expect(screen.getByRole('link', { name: 'View connected machines' })).toHaveAttribute('href', '/machines');
  });
  it('offers a native link when the browser lacks machine access', async () => {
    machines = { available: false, reason: 'not-granted' };
    mount();
    expect(await screen.findByRole('link', { name: 'Open Tau desktop' })).toHaveAttribute('href', 'tau://machines');
  });
});
