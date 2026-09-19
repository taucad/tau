// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { entitlementsFromTier } from '@taucad/billing';
import type { WireBalanceExplanation, WireModelEstimates } from '@taucad/billing';

const useCreditsMock = vi.hoisted(() => vi.fn());
const useModelEstimatesMock = vi.hoisted(() => vi.fn());
const useEntitlementsMock = vi.hoisted(() => vi.fn());
const openSettingsDialog = vi.hoisted(() => vi.fn());

vi.mock('@taucad/billing/hooks/use-credits', () => ({ useCredits: useCreditsMock }));
vi.mock('@taucad/billing/hooks/use-model-estimates', () => ({ useModelEstimates: useModelEstimatesMock }));
vi.mock('@taucad/billing/hooks/use-entitlements', () => ({ useEntitlements: useEntitlementsMock }));
vi.mock('#hooks/use-settings-dialog.js', () => ({
  useSettingsDialog: () => ({ isOpen: false, section: 'general', open: openSettingsDialog, close: vi.fn() }),
}));
vi.mock('#components/billing/topup-modal.js', () => ({
  TopupModal: (props: { readonly isOpen: boolean }) => <div data-testid='topup-modal' data-open={props.isOpen} />,
}));

const { CreditBalanceChip, modelTier, useCreditAffordance } = await import('#components/billing/credit-estimate.js');

/** Only the members these surfaces read; the wire schema owns the rest. */
const balanceWith = (available: string, held: readonly [string, string, string]): WireBalanceExplanation =>
  ({
    balance: {
      eligibleAvailableCreditAtoms: available,
      promoHeldCreditAtoms: held[0],
      planHeldCreditAtoms: held[1],
      purchasedHeldCreditAtoms: held[2],
    },
  }) as unknown as WireBalanceExplanation;

const estimates: WireModelEstimates = {
  environment: 'development',
  ownerId: 'owner',
  routes: [
    {
      routeId: 'openai-gpt-6-astra',
      modelId: 'gpt-6-astra',
      typicalHoldAtoms: '3084332',
      minimumHoldAtoms: '1133877',
      tier: 'base',
    },
    {
      routeId: 'openai-gpt-5.6-luna',
      modelId: 'gpt-5.6-luna',
      typicalHoldAtoms: '65947',
      minimumHoldAtoms: '26938',
      tier: 'base',
    },
    { routeId: 'free-route', modelId: 'free', typicalHoldAtoms: '0', minimumHoldAtoms: '0', tier: 'base' },
  ],
};

function Affordance({ modelId }: { readonly modelId: string }): React.JSX.Element {
  const affordanceFor = useCreditAffordance();
  return <div data-testid='affordance'>{JSON.stringify(affordanceFor(modelId) ?? null)}</div>;
}

type ProbeResult = { credits?: string; turns?: number } | undefined;

const readAffordance = (modelId: string): ProbeResult => {
  render(<Affordance modelId={modelId} />);
  return (JSON.parse(screen.getByTestId('affordance').textContent) as ProbeResult) ?? undefined;
};

describe('modelTier', () => {
  // The governing tier table: Luna/Haiku/Gemini Flash are Fast, Terra/Sonnet/
  // Gemini Pro are Balanced, Astra/Sol/Opus/Fable are Frontier.
  const cases: Array<[number, string]> = [
    [0, 'Fast'],
    [1.2, 'Fast'],
    [5, 'Fast'],
    [7.5, 'Fast'],
    [9, 'Balanced'],
    [12, 'Balanced'],
    [15, 'Balanced'],
    [15.01, 'Frontier'],
    [25, 'Frontier'],
    [50, 'Frontier'],
  ];
  it.each(cases)('names $%s output per 1M as %s', (cost, tier) => {
    expect(modelTier(cost)).toBe(tier);
  });
});

describe('useCreditAffordance', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useModelEstimatesMock.mockReturnValue(estimates);
    useCreditsMock.mockReturnValue(balanceWith('3000000', ['0', '0', '0']));
  });

  it('joins the published hold to the catalogue model id and counts whole turns', () => {
    // 3,000,000 available / 65,947 per turn = 45 whole turns.
    expect(readAffordance('openai-gpt-5.6-luna')).toEqual({ credits: '6.59', turns: 45 });
  });

  it('reports zero turns for a route the balance cannot cover once, without hiding it', () => {
    expect(readAffordance('openai-gpt-6-astra')).toEqual({ credits: '308.43', turns: 0 });
  });

  it('leaves turns unknown when the balance is unreadable rather than showing zero', () => {
    useCreditsMock.mockReturnValue(undefined);
    expect(readAffordance('openai-gpt-5.6-luna')).toEqual({ credits: '6.59' });
  });

  it('shows no estimate for a route the API does not publish', () => {
    expect(readAffordance('local-ollama-model')).toBeUndefined();
  });

  it('shows no estimate for a zero hold rather than dividing by it', () => {
    expect(readAffordance('free-route')).toBeUndefined();
  });

  it('shows no estimate while the endpoint is unavailable', () => {
    useModelEstimatesMock.mockReturnValue(undefined);
    expect(readAffordance('openai-gpt-6-astra')).toBeUndefined();
  });
});

describe('CreditBalanceChip', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useEntitlementsMock.mockReturnValue(entitlementsFromTier('free'));
    useCreditsMock.mockReturnValue(balanceWith('1234567', ['10000', '20000', '0']));
  });

  it('shows available credits and the amount reserved by work in flight', () => {
    render(<CreditBalanceChip />);

    const chip = screen.getByRole('button', { name: /credits: 123\.46 available, 3 reserved/i });
    expect(chip).toBeInTheDocument();
    expect(chip).toHaveTextContent('123.46');
    expect(chip).toHaveTextContent('3 held');
  });

  it('omits the reserved segment when nothing is held', () => {
    useCreditsMock.mockReturnValue(balanceWith('1234567', ['0', '0', '0']));
    render(<CreditBalanceChip />);

    expect(screen.getByRole('button', { name: /0 reserved/i })).not.toHaveTextContent('held');
  });

  it('renders nothing when the balance is unreadable, never a zero balance', () => {
    useCreditsMock.mockReturnValue(undefined);
    const { container } = render(<CreditBalanceChip />);

    expect(container).toBeEmptyDOMElement();
  });

  it('opens the existing top-up modal when a payment method is on file', async () => {
    useEntitlementsMock.mockReturnValue({ ...entitlementsFromTier('pro'), hasPaymentMethod: true });
    const user = userEvent.setup();
    render(<CreditBalanceChip />);

    expect(screen.queryByTestId('topup-modal')).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /credits:/i }));

    expect(screen.getByTestId('topup-modal')).toHaveAttribute('data-open', 'true');
    expect(openSettingsDialog).not.toHaveBeenCalled();
  });

  it('routes to Plans & Billing when no payment method exists', async () => {
    const user = userEvent.setup();
    render(<CreditBalanceChip />);

    await user.click(screen.getByRole('button', { name: /credits:/i }));

    expect(openSettingsDialog).toHaveBeenCalledWith('billing');
    expect(screen.queryByTestId('topup-modal')).not.toBeInTheDocument();
  });
});
