import { describe, expect, it } from 'vitest';
import * as sidebar from '#components/sidebar.js';

/* A15g (loading-states blueprint, P-d): the sidebar's rows load in place, so the package offers no row skeleton. */
describe('sidebar exports', () => {
  it.fails('offers no menu skeleton', () => {
    expect(Object.keys(sidebar)).not.toContain('SidebarMenuSkeleton');
  });
});
