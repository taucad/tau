import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { ViewerStatusPill } from '#shell/viewer-status.jsx';

describe('ViewerStatusPill', () => {
  it('should announce the running work with an ellipsis and its whole percentage', () => {
    render(<ViewerStatusPill label='Loading gear.glb' progress={0.426} />);

    expect(screen.getByRole('status')).toHaveTextContent('Loading gear.glb…43%');
  });

  it('should leave out the percentage while progress is unknown', () => {
    render(<ViewerStatusPill label='evaluating' />);

    expect(screen.getByRole('status')).toHaveTextContent(/^evaluating…$/u);
  });

  it('should keep the percentage between 0 and 100', () => {
    render(<ViewerStatusPill label='Loading' progress={1.7} />);

    expect(screen.getByRole('status')).toHaveTextContent('100%');
  });
});
