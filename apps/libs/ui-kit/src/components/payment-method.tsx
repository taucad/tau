import { CreditCard } from 'lucide-react';
import { cn } from '@taucad/ui/utils/cn';
import { SvgIcon } from '#icons/svg-icon.js';
import type { IconId } from '#icons/svg-icon.js';

/** A saved or charged card as the billing wire describes it. */
export type CardSummary = { readonly brand: string; readonly last4: string };

/*
 * The one table of card brands: the wire's lower-case brand id, the name a
 * customer reads and the sprite icon. Every surface that shows a card reads
 * it through `PaymentMethod` or `formatCardSummary`, so a brand is never
 * printed raw.
 */
const cardBrands: ReadonlyMap<string, { readonly label: string; readonly iconId: IconId }> = new Map([
  ['visa', { label: 'Visa', iconId: 'visa' }],
  ['mastercard', { label: 'Mastercard', iconId: 'mastercard' }],
  ['amex', { label: 'Amex', iconId: 'amex' }],
  ['discover', { label: 'Discover', iconId: 'discover' }],
  ['diners', { label: 'Diners Club', iconId: 'diners-club' }],
  ['jcb', { label: 'JCB', iconId: 'jcb' }],
  ['unionpay', { label: 'UnionPay', iconId: 'unionpay' }],
]);

/** The brand name to show for a wire brand id; an unknown brand reads `Card`. */
export const cardBrandLabel = (brand: string): string => cardBrands.get(brand.toLowerCase())?.label ?? 'Card';

/** A card as one phrase, for sentences and accessible names: `Visa •••• 8252`. */
export const formatCardSummary = (card: CardSummary): string => `${cardBrandLabel(card.brand)} •••• ${card.last4}`;

/** The brand mark for a card, or a generic card glyph for a brand Tau has no mark for. */
export function CardBrandIcon({
  brand,
  className,
}: {
  readonly brand: string;
  readonly className?: string;
}): React.JSX.Element {
  const known = cardBrands.get(brand.toLowerCase());
  return known === undefined ? (
    <CreditCard className={className} role='img' aria-label='Card' />
  ) : (
    <SvgIcon id={known.iconId} className={className} role='img' aria-label={known.label} />
  );
}

/**
 * A card as Tau shows it everywhere: brand mark, brand name and last four
 * digits. The mark is decorative here because the name is printed beside it.
 */
export function PaymentMethod({
  method,
  className,
}: {
  readonly method: CardSummary;
  readonly className?: string;
}): React.JSX.Element {
  const known = cardBrands.get(method.brand.toLowerCase());
  return (
    <span data-slot='payment-method' className={cn('inline-flex items-center gap-2 align-middle', className)}>
      {known === undefined ? (
        <CreditCard className='size-5 shrink-0 text-muted-foreground' aria-hidden='true' />
      ) : (
        <SvgIcon id={known.iconId} className='size-8 shrink-0' aria-hidden='true' />
      )}
      <span className='tabular-nums'>{formatCardSummary(method)}</span>
    </span>
  );
}
