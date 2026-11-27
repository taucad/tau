import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ReactNode } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type * as AskDeadline from '#lib/ask-deadline.js';
import { BillingSessionProvider } from '@taucad/billing/hooks/billing-session';

/* One ask deadline is 5 s in the app; these rows run it at 50 ms. */
vi.mock('#lib/ask-deadline.js', async (importOriginal) => {
  const actual: typeof AskDeadline = await importOriginal();
  return {
    ...actual,
    createAskDeadlines: (timer?: AskDeadline.AskDeadlineTimer) => actual.createAskDeadlines(timer, 50),
  };
});
vi.mock('@taucad/billing-ui/db/billing-snapshot-store', () => ({
  recordBillingRevisionMinimum: async () => undefined,
}));

const { ProjectCreditsLine, ReceiptCreditsSummary, ReceiptCreditsText, formatReceiptTotal, receiptDeadlines } =
  await import('#routes/w.$workspace.$project/chat-receipt-credits.js');

const identity = { schemaVersion: 1, environment: 'development', ownerId: 'user', subjectId: 'account' };

const pendingReceipt = (operationId: string) => ({
  ...identity,
  state: 'pending',
  snapshotRevision: '9',
  asOf: '2026-09-12T00:00:00.000Z',
  operationId,
  admittedAt: '2026-09-12T00:00:00.000Z',
  dispatchState: 'accepted',
  authorizedMaxCreditAtoms: '50000',
});

const unavailableReceipt = (operationId: string) => ({
  ...identity,
  state: 'unavailable',
  snapshotRevision: '9',
  asOf: '2026-09-12T00:00:00.000Z',
  operationId,
});

type Answer = { readonly ok: boolean; readonly status: number; readonly json?: () => Promise<unknown> };

const ok = (body: unknown): Answer => ({ ok: true, status: 200, json: async () => body });
const refused: Answer = { ok: false, status: 503 };

/**
 * Answers receipt reads through `answer`, which a row may change: the batch route (`/v1/billing/operations?…`) fails
 * with the first refused answer and otherwise lists every receipt; `/v1/billing/operations/:id` answers one.
 */
const stubReceipts = (answer: (operationId: string) => Answer | Promise<Answer>): ReturnType<typeof vi.fn> => {
  const fetch = vi.fn(async (input: string): Promise<Answer> => {
    const url = new URL(input);
    if (url.pathname !== '/v1/billing/operations') {
      return answer(decodeURIComponent(url.pathname.split('/').at(-1) ?? ''));
    }
    const answers = await Promise.all(url.searchParams.getAll('operationIds').map(async (id) => answer(id)));
    const refusal = answers.find((one) => !one.ok);
    if (refusal !== undefined) {
      return refusal;
    }
    const receipts = await Promise.all(answers.map(async (one) => one.json?.()));
    return ok({ receipts });
  });
  vi.stubGlobal('fetch', fetch);
  return fetch;
};

const renderWithSession = (node: ReactNode, bound = true): void => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={client}>
      <BillingSessionProvider
        value={
          bound
            ? { apiBaseUrl: 'https://api.example', userId: 'user', environment: 'development' }
            : { apiBaseUrl: undefined, environment: undefined, userId: undefined }
        }
      >
        {node}
      </BillingSessionProvider>
    </QueryClientProvider>,
  );
};

afterEach(() => {
  cleanup();
  receiptDeadlines.cancel();
  vi.unstubAllGlobals();
});

describe('receipt credits honour I15 (W9 D2, R4)', () => {
  it('checks, then says it cannot check with a Retry when the read fails, never an open-ended Pending', async () => {
    stubReceipts(() => refused);
    renderWithSession(<ReceiptCreditsSummary operationIds={['op1']} />);

    expect(screen.getByLabelText('Tau credits: Checking')).toBeInTheDocument();
    await waitFor(() => {
      expect(screen.getByLabelText('Tau credits: Can’t check')).toBeInTheDocument();
    });
    expect(screen.getByRole('button', { name: 'Retry' })).toBeInTheDocument();
    expect(screen.queryByLabelText(/Pending/u)).not.toBeInTheDocument();
  });

  it('says it cannot check when no billing session is bound to ask with (an offline launch)', async () => {
    const fetch = stubReceipts(() => refused);
    renderWithSession(<ReceiptCreditsSummary operationIds={['op1']} />, false);

    await waitFor(() => {
      expect(screen.getByLabelText('Tau credits: Can’t check')).toBeInTheDocument();
    });
    expect(fetch).not.toHaveBeenCalled();
  });

  it('rereads on Retry and shows the answer', async () => {
    let answer: Answer = refused;
    stubReceipts(() => answer);
    renderWithSession(<ReceiptCreditsSummary operationIds={['op1']} />);
    await waitFor(() => {
      expect(screen.getByLabelText('Tau credits: Can’t check')).toBeInTheDocument();
    });

    answer = ok(pendingReceipt('op1'));
    await userEvent.click(screen.getByRole('button', { name: 'Retry' }));

    await waitFor(() => {
      expect(screen.getByLabelText('Tau credits: Pending')).toBeInTheDocument();
    });
    expect(screen.queryByRole('button', { name: 'Retry' })).not.toBeInTheDocument();
  });

  it('keeps Pending only for a receipt the API reports as pending, past the deadline', async () => {
    stubReceipts(() => ok(pendingReceipt('op1')));
    renderWithSession(<ReceiptCreditsSummary operationIds={['op1']} />);

    await waitFor(() => {
      expect(screen.getByLabelText('Tau credits: Pending')).toBeInTheDocument();
    });
    await new Promise((resolve) => {
      setTimeout(resolve, 120);
    });
    expect(screen.getByLabelText('Tau credits: Pending')).toBeInTheDocument();
  });

  it('reads a receipt the API cannot read as Can’t check at once', async () => {
    stubReceipts(() => ok(unavailableReceipt('op1')));
    renderWithSession(<ReceiptCreditsSummary operationIds={['op1']} />);

    await waitFor(() => {
      expect(screen.getByLabelText('Tau credits: Can’t check')).toBeInTheDocument();
    });
  });

  it('hands the per-turn card its Retry only while it cannot check', async () => {
    stubReceipts(() => refused);
    const seen: Array<[string, boolean]> = [];
    renderWithSession(
      <ReceiptCreditsText operationIds={['op1']}>
        {(summary, retry) => {
          seen.push([summary, retry !== undefined]);
          return summary;
        }}
      </ReceiptCreditsText>,
    );

    await waitFor(() => {
      expect(seen.at(-1)).toEqual(['Can’t check', true]);
    });
    expect(seen[0]).toEqual(['Checking', false]);
  });

  it('names what cannot be checked beside the project total, with Retry', async () => {
    stubReceipts(() => refused);
    renderWithSession(<ProjectCreditsLine operationIds={['op1', 'op2']} />);

    await waitFor(() => {
      expect(screen.getByText(/2 can’t check/u)).toBeInTheDocument();
    });
    expect(screen.getByRole('button', { name: 'Retry' })).toBeInTheDocument();
  });

  it.each([
    [{ creditAtoms: 0n, pending: 0, checking: 0, unavailable: 0 }, '0'],
    [{ creditAtoms: 0n, pending: 1, checking: 0, unavailable: 0 }, 'Pending'],
    [{ creditAtoms: 0n, pending: 1, checking: 1, unavailable: 0 }, 'Checking'],
    [{ creditAtoms: 0n, pending: 1, checking: 1, unavailable: 1 }, 'Can’t check'],
  ] as const)('labels %o as %s', (total, label) => {
    expect(formatReceiptTotal(total)).toBe(label);
  });
});
