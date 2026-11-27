import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { CloudSurface } from '#cloud/cloud-surface.js';

/* The W2 facade stubs mount a surface with no loader: its snapshot must be stable (adaptive app deployment mode I8). */
describe('CloudSurface without a loader', () => {
  it('should render the fallback once, without re-rendering forever', () => {
    const { container } = render(<CloudSurface enabled fallback='self-host' render={() => 'cloud'} />);
    expect(container.textContent).toBe('self-host');
  });
});
