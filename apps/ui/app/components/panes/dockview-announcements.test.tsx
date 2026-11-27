// @vitest-environment jsdom
/*
 * What a Tau dock says to assistive technology, over the real Dockview through Tau's wrapper: never a raw panel id, and
 * nothing for a change the app makes itself; the person's own opens keep Dockview's words.
 */
import { act, render } from '@testing-library/react';
import type { DockviewApi } from 'dockview-react';
import { afterEach, describe, expect, it } from 'vitest';
import { Dockview } from '#components/panes/dockview.js';
import { changeQuietly } from '#components/panes/dockview-announcements.js';

const stops: Array<() => void> = [];
afterEach(() => {
  for (const stop of stops.splice(0)) {
    stop();
  }
});

function mountDock(): { api: DockviewApi; spoken: () => string } {
  let api: DockviewApi | undefined;
  const rendered = render(
    <Dockview
      components={{ viewer: () => <div>Model</div> }}
      onReady={(event) => {
        api = event.api;
      }}
    />,
  );
  stops.push(() => {
    rendered.unmount();
  });
  api!.layout(900, 600);
  const spoken = (): string =>
    [...rendered.container.querySelectorAll('[aria-live]')].map((region) => region.textContent).join('|');
  return { api: api!, spoken };
}

describe('Tau dock announcements', () => {
  it('should never speak a panel by its raw id', () => {
    const { api, spoken } = mountDock();
    act(() => {
      api.addPanel({ id: 'v-1a2b3c4d', component: 'viewer' });
    });
    expect(spoken()).not.toContain('v-1a2b3c4d');
    expect(spoken()).toBe('|');
  });

  it("should say nothing for the app's own arrangement, and keep the person's opens", () => {
    const { api, spoken } = mountDock();
    act(() => {
      changeQuietly(api, () => {
        api.addPanel({ id: 'launcher', component: 'viewer', title: 'New tab' });
      });
    });
    expect(spoken()).toBe('|');
    act(() => {
      api.addPanel({ id: 'part', component: 'viewer', title: 'part.ts' });
    });
    expect(spoken()).toContain('part.ts');
  });
});
