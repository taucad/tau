// @vitest-environment jsdom
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { CardBrandIcon, PaymentMethod, cardBrandLabel, formatCardSummary } from '#components/payment-method.js';

describe('cardBrandLabel', () => {
  it('should name known brands in their own casing whatever the wire casing', () => {
    expect(cardBrandLabel('visa')).toBe('Visa');
    expect(cardBrandLabel('VISA')).toBe('Visa');
    expect(cardBrandLabel('diners')).toBe('Diners Club');
    expect(cardBrandLabel('unionpay')).toBe('UnionPay');
  });

  it('should read "Card" for an unknown brand instead of printing the wire id', () => {
    expect(cardBrandLabel('cartes_bancaires')).toBe('Card');
    expect(cardBrandLabel('toString')).toBe('Card');
  });
});

describe('formatCardSummary', () => {
  it('should print the brand name, a mask and the last four digits', () => {
    expect(formatCardSummary({ brand: 'visa', last4: '8252' })).toBe('Visa •••• 8252');
  });
});

describe('PaymentMethod', () => {
  it('should show the brand name and last four digits as one readable phrase', () => {
    render(<PaymentMethod method={{ brand: 'visa', last4: '8252' }} />);

    expect(screen.getByText('Visa •••• 8252')).toBeInTheDocument();
    expect(screen.queryByText(/visa •••• 8252/u)).not.toBeInTheDocument();
  });

  it('should fall back to a generic card for a brand without a mark', () => {
    render(<PaymentMethod method={{ brand: 'cartes_bancaires', last4: '0005' }} />);

    expect(screen.getByText('Card •••• 0005')).toBeInTheDocument();
  });
});

describe('CardBrandIcon', () => {
  it('should name the brand mark for assistive technology when it stands alone', () => {
    render(<CardBrandIcon brand='mastercard' />);

    expect(screen.getByRole('img', { name: 'Mastercard' })).toBeInTheDocument();
  });

  it('should name an unknown brand "Card"', () => {
    render(<CardBrandIcon brand='unknown-brand' />);

    expect(screen.getByRole('img', { name: 'Card' })).toBeInTheDocument();
  });
});
