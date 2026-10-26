import { describe, expect, it, vi } from 'vitest';
import { handle } from '#routes/w.$workspace.$project_.preview/route.js';

vi.mock('#routes/w.$workspace.$project_.preview/preview-route.js', () => ({
  default: () => null,
  PreviewSession: () => null,
}));

describe('owned Preview shell', () => {
  it('leaves identity to the compact workbench instead of reserving a self-link breadcrumb row', () => {
    expect(handle.breadcrumb).toBeUndefined();
    expect(handle.providers).toBeDefined();
  });

  it('draws its own top bar, so the shell reserves no second header strip above it on phones (HDR-12)', () => {
    expect(handle.enablePageHeader).toBe(false);
  });
});
