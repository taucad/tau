// @vitest-environment jsdom
import { render, waitFor } from '@testing-library/react';
import { renderToString } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';

const registered = vi.hoisted(() => ({ count: 0 }));

vi.mock('#components/nav/example-command-items.js', () => ({
  ExampleCommandPaletteItems: () => {
    registered.count += 1;
    return undefined;
  },
}));

const { DeferredExampleCommandPaletteItems } = await import('#components/nav/deferred-example-command-items.js');

describe('DeferredExampleCommandPaletteItems', () => {
  it('should render nothing on the server, chunk loaded or not, so no document carries its boundary', async () => {
    // A lazy chunk not yet loaded leaves a pending boundary (`<!--$?-->`) in a streamed document and a loaded one an
    // empty one (`<!--$--><!--/$-->`): a static shell's bytes would depend on which the build process met first.
    expect(renderToString(<DeferredExampleCommandPaletteItems />)).toBe('');
    await import('#components/nav/example-command-items.js');
    expect(renderToString(<DeferredExampleCommandPaletteItems />)).toBe('');
    expect(registered.count).toBe(0);
  });

  it('should register the example items once the page has hydrated', async () => {
    render(<DeferredExampleCommandPaletteItems />);
    await waitFor(() => {
      expect(registered.count).toBeGreaterThan(0);
    });
  });
});
