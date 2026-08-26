// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { LiveDemoSection } from '#routes/_index/live-demo-section.js';

vi.mock('#routes/_index/demo/gear-demo.js', () => ({
  GearDemo: () => <div data-testid='gear-demo' />,
}));

vi.mock('#routes/_index/demo/qr-demo.js', () => ({
  QrDemo: () => <div data-testid='qr-demo' />,
}));

describe('LiveDemoSection', () => {
  it('should render the gear demo by default and not load the QR demo', () => {
    render(<LiveDemoSection />);

    expect(screen.getByTestId('gear-demo')).toBeInTheDocument();
    expect(screen.queryByTestId('qr-demo')).not.toBeInTheDocument();
  });

  it('should load the QR demo only after its tab is selected', async () => {
    render(<LiveDemoSection />);

    await userEvent.click(screen.getByRole('tab', { name: 'QR code' }));

    await waitFor(() => {
      expect(screen.getByTestId('qr-demo')).toBeInTheDocument();
    });
  });
});
