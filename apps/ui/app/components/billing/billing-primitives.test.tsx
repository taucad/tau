import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import {
  BillingInlineError,
  BillingNotice,
  BillingStatusBadge,
  IconLine,
  SummaryList,
  SummaryRow,
} from '#components/billing/billing-primitives.js';

describe('IconLine', () => {
  it('should centre the icon on the first line of its text, not on the block or its top edge', () => {
    render(<IconLine icon={<svg data-testid='icon' />}>A sentence long enough to wrap onto a second line.</IconLine>);

    const iconBox = screen.getByTestId('icon').parentElement;

    // One line tall (`1lh`) with the icon centred inside it; the row itself aligns to the top.
    expect(iconBox).toHaveClass('h-lh', 'items-center', 'shrink-0');
    expect(iconBox?.parentElement).toHaveClass('items-start');
    expect(iconBox?.parentElement).not.toHaveClass('items-center');
  });
});

describe('BillingStatusBadge', () => {
  it.each([
    ['neutral', 'outline'],
    ['positive', 'secondary'],
    ['warning', 'outline'],
  ] as const)('should draw a %s state with the design system’s own %s badge', (tone, variant) => {
    render(<BillingStatusBadge tone={tone}>State</BillingStatusBadge>);

    const badge = screen.getByText('State');

    expect(badge).toHaveAttribute('data-slot', 'badge');
    expect(badge).toHaveAttribute('data-tone', tone);
    if (variant === 'secondary') {
      expect(badge).toHaveClass('bg-secondary', 'border-transparent');
    } else {
      expect(badge).toHaveClass('text-foreground');
    }
    // No tinted or coloured border: the border is the badge variant's own.
    expect(badge.className).not.toMatch(/border-(warning|success|primary)/u);
  });

  it('should mark a warning with a glyph instead of a coloured border', () => {
    render(<BillingStatusBadge tone='warning'>Paused</BillingStatusBadge>);

    expect(screen.getByText('Paused').querySelector('svg')).toHaveClass('text-warning');
  });
});

describe('BillingNotice', () => {
  it('should carry its sentence and the button that acts on it', () => {
    render(
      <BillingNotice tone='warning' role='alert' action={<button type='button'>Add credits</button>}>
        You’ve used 35 credits more than you had.
      </BillingNotice>,
    );

    const notice = screen.getByRole('alert');

    expect(notice).toHaveTextContent('You’ve used 35 credits more than you had.');
    expect(notice).toHaveAttribute('data-tone', 'warning');
    expect(notice).toHaveClass('border-warning');
    expect(screen.getByRole('button', { name: 'Add credits' })).toBeInTheDocument();
  });

  it('should stay quiet for information', () => {
    render(<BillingNotice>Your Pro plan ends on December 8, 2026.</BillingNotice>);

    expect(
      screen.getByText('Your Pro plan ends on December 8, 2026.').closest('[data-slot=billing-notice]'),
    ).toHaveAttribute('data-tone', 'info');
  });
});

describe('BillingInlineError', () => {
  it('should announce what happened and what to do', () => {
    render(<BillingInlineError>Couldn’t open the subscription page. Try again.</BillingInlineError>);

    expect(screen.getByRole('alert')).toHaveTextContent('Couldn’t open the subscription page. Try again.');
  });
});

describe('SummaryList', () => {
  it('should pair each label with its value and set the total apart', () => {
    render(
      <SummaryList aria-label='Purchase'>
        <SummaryRow label='1,000 credits'>$10.00</SummaryRow>
        <SummaryRow label='Tax' emphasis='muted'>
          Calculated on the payment page
        </SummaryRow>
        <SummaryRow label='Total' emphasis='total'>
          $10.00 USD
        </SummaryRow>
      </SummaryList>,
    );

    expect(screen.getByText('1,000 credits').nextElementSibling).toHaveTextContent('$10.00');
    expect(screen.getByText('Tax').parentElement).toHaveClass('text-muted-foreground');
    expect(screen.getByText('Total').parentElement).toHaveClass('border-t', 'font-medium');
  });
});
