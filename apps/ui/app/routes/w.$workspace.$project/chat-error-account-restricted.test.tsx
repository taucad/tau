import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ChatErrorAccountRestricted } from '#routes/w.$workspace.$project/chat-error-account-restricted.js';

const debug = vi.hoisted(() => ({ enabled: false }));

vi.mock('#flags/use-feature.js', () => ({
  useFeature: () => debug.enabled,
}));

vi.mock('#components/code/code-viewer.js', () => ({
  CodeViewer: ({ text }: { readonly text: string }) => <pre data-testid='code-viewer'>{text}</pre>,
}));

const raw = '{"code":"BILLING_ACCOUNT_RESTRICTED","message":"This Tau billing account is restricted."}';

describe('ChatErrorAccountRestricted', () => {
  beforeEach(() => {
    debug.enabled = false;
  });

  it('should state the hold in the page words and offer support as the only action', () => {
    const { container } = render(<ChatErrorAccountRestricted raw={raw} />);

    expect(screen.getByRole('alert')).toBeInTheDocument();
    expect([...container.querySelectorAll('p')].map((node) => node.textContent)).toEqual([
      'This account needs attention',
    ]);
    expect(
      screen.getByText(
        'Tau has paused spending on this account while we look at a billing issue. Contact support to continue.',
      ),
    ).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Contact support' })).toHaveAttribute('href', 'mailto:support@tau.new');
    expect(screen.queryAllByRole('button')).toEqual([]);
    expect(screen.queryByText(/restricted\./u)).not.toBeInTheDocument();
  });

  it('should disclose the raw refusal only when Tau Debug is enabled', async () => {
    debug.enabled = true;
    const user = userEvent.setup();
    render(<ChatErrorAccountRestricted raw={raw} />);

    expect(screen.queryByTestId('code-viewer')).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Debug details' }));

    expect(screen.getByTestId('code-viewer')).toHaveTextContent(raw);
  });
});
