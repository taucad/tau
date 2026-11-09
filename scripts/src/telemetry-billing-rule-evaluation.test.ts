/* eslint-disable @typescript-eslint/naming-convention -- keys are Prometheus label names */
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

/* The same offline oracle as `telemetry-runtime-rule-evaluation.test.ts`; it documents the PromQL subset it implements. */
const oracle = await import('./telemetry-promql-oracle.mts');
type Oracle = typeof oracle;
const { assertSupported, parseDuration, SeriesStore, simulateAlert } = oracle;
type AlertRule = Parameters<Oracle['simulateAlert']>[1];
type Transition = ReturnType<Oracle['simulateAlert']>[number];
type Series = ConstructorParameters<Oracle['SeriesStore']>[0][number];
type Sample = Series['samples'][number];

/**
 * Financial-case alert tiers (billing collection gate blueprint §4.5, W4): U pages on any unattributed case at once,
 * T1 pages on a named spend-blocking case after 15 minutes, T2 warns on an owed customer after 2 h and pages after
 * 24 h, T3 sends a daily digest of Tau's bookkeeping cases older than 24 h. The rules read the hourly
 * `tau.billing.open_financial_cases` gauge and its oldest-age sibling, both labelled `kind` and `attributed`, and are
 * evaluated here against synthetic series, offline, as Tau Cloud renders them for one app.
 */
const grafanaRoot = path.resolve(import.meta.dirname, '../../infra/grafana');

type RuleJson = Readonly<{
  uid: string;
  title: string;
  condition: string;
  for: string;
  noDataState: AlertRule['noDataState'];
  execErrState: string;
  labels: Readonly<Record<string, string>>;
  annotations: Readonly<Record<string, string>>;
  data: ReadonlyArray<Readonly<{ refId: string; datasourceUid: string; model: Readonly<{ expr?: string }> }>>;
}>;

type GroupJson = Readonly<{
  title: string;
  // oxlint-disable-next-line tau-lint/no-bare-time-identifier -- Grafana's rule-group key, in seconds
  interval: number;
  rules: readonly RuleJson[];
}>;

const groups: readonly GroupJson[] = ['tau-critical.json', 'tau-warning.json'].map(
  (file) => JSON.parse(readFileSync(path.join(grafanaRoot, 'alerts', file), 'utf8')) as GroupJson,
);

/** The production app this suite binds to, and the staging app whose series must never leak in. */
const boundApp = 'tau-api';
const otherApp = 'tau-api-staging';

const spendBlockingKinds =
  'dispute_unresolved|orphan_local_receipt|invalid_grant_cause|entitlement_source_disagreement|journal_.+';
const owedKinds = 'missing_local_payment|paid_unfulfilled_recovery|unfulfilled_purchase_obligation';
const bookkeepingKinds =
  'gross_fee_net_mismatch|refund_unresolved|dispute_balance_transaction|tax_registration_review|supplier_.+';
/**
 * Kinds that never name an account (Tau's own tax registration and supplier cases). Coordinator ruling refining D5:
 * they would keep U firing for ever, so they are left to T3 (and `billing-supplier-invoice-mismatch`).
 */
const neverAttributedKinds = 'tax_registration_review|supplier_.+';
const cases = 'tau_billing_open_financial_cases';
const age = 'tau_billing_open_financial_case_age_seconds';

/** The tiers exactly as blueprint §4.5 writes them, before hosted provisioning binds `app`. */
const tiers = {
  'billing-case-unattributed': {
    group: 'tau-critical',
    severity: 'critical',
    for: '0s',
    runbook: 'docs/handbooks/cloud/operate/refunds-and-financial-cases.md',
    expr: `max by (app, kind) (${cases}{app=~".*",service_name="tau-api",attributed="false",kind!~"${neverAttributedKinds}"}) > 0`,
  },
  'billing-account-spend-blocked': {
    group: 'tau-critical',
    severity: 'critical',
    for: '15m',
    runbook: 'docs/handbooks/cloud/playbooks/ledger-drift.md',
    expr: `max by (app, kind) (${cases}{app=~".*",service_name="tau-api",attributed="true",kind=~"${spendBlockingKinds}"}) > 0`,
  },
  'billing-owed-stale-2h': {
    group: 'tau-warning',
    severity: 'warning',
    for: '0s',
    runbook: 'docs/handbooks/cloud/playbooks/paid-not-credited.md',
    expr: `max by (app, kind) (${age}{app=~".*",service_name="tau-api",attributed="true",kind=~"${owedKinds}"}) > 7200`,
  },
  'billing-owed-overdue-24h': {
    group: 'tau-critical',
    severity: 'critical',
    for: '0s',
    runbook: 'docs/handbooks/cloud/playbooks/paid-not-credited.md',
    expr: `max by (app, kind) (${age}{app=~".*",service_name="tau-api",attributed="true",kind=~"${owedKinds}"}) > 86400`,
  },
  'billing-books-overdue-24h': {
    group: 'tau-warning',
    severity: 'warning',
    for: '0s',
    runbook: 'docs/handbooks/cloud/operate/refunds-and-financial-cases.md',
    expr: `max by (app, kind) (${age}{app=~".*",service_name="tau-api",kind=~"${bookkeepingKinds}"}) > 86400`,
  },
} as const;
type TierUid = keyof typeof tiers;
const tierUids = Object.keys(tiers) as TierUid[];

const located = (uid: string): Readonly<{ group: GroupJson; rule: RuleJson }> => {
  for (const group of groups) {
    const rule = group.rules.find((candidate) => candidate.uid === uid);
    if (rule) {
      return { group, rule };
    }
  }
  throw new Error(`no alert rule ${uid}`);
};

const conditionOf = (rule: RuleJson): string => rule.data.find(({ refId }) => refId === rule.condition)!.model.expr!;

/**
 * The rule as Tau Cloud renders it: `modules/grafana-content/main.tf` replaces the exact `app=~".*"` matcher with
 * one app and evaluates the condition as an instant query, which is how the oracle evaluates it.
 */
const ruleOf = (uid: TierUid): AlertRule => {
  const { rule } = located(uid);
  return {
    expr: conditionOf(rule).replaceAll('app=~".*"', `app="${boundApp}"`),
    forSeconds: parseDuration(rule.for),
    noDataState: rule.noDataState,
  };
};

const minute = 60;
const hour = 3600;
/** The first evaluation, an hour into the series so every lookback has samples. */
const start = hour;
const end = start + 2 * hour;
/** When a case appears on the gauge. */
const opened = start + 10 * minute;

/**
 * One `(kind, attributed)` series of a financial-case gauge, exported every minute as the OTLP exporter sends the
 * hourly recorded value. The gauge writes 0 for every known pair (invariant I6), so the series reads `value` in `[from, to)` and 0 elsewhere.
 */
const gauge = (
  name: string,
  labels: Readonly<{ kind: string; attributed: 'true' | 'false'; app?: string; instance?: string }>,
  { value, from = opened, to = Number.POSITIVE_INFINITY }: Readonly<{ value: number; from?: number; to?: number }>,
): Series => {
  const samples: Sample[] = [];
  for (let t = 0; t <= end; t += minute) {
    samples.push([t, t >= from && t < to ? value : 0]);
  }
  const { app = boundApp, instance = 'machine-1', ...attributes } = labels;
  return { labels: { __name__: name, app, instance, service_name: 'tau-api', ...attributes }, samples };
};

const simulate = (uid: TierUid, series: readonly Series[]): Transition[] =>
  simulateAlert(new SeriesStore(series), ruleOf(uid), {
    from: start,
    to: end,
    evaluationInterval: located(uid).group.interval,
  });

/** The alert instance one case kind raises: the rules group by `(app, kind)` only. */
const instanceOf = (kind: string): string =>
  JSON.stringify([
    ['app', boundApp],
    ['kind', kind],
  ]);

const changes = (transitions: readonly Transition[]): string[] =>
  transitions.map(({ at, instance, from, to }) => `${at - opened}s ${instance} ${from}→${to}`);

describe('Billing financial-case rule definitions (W4 A4.6, A4.7)', () => {
  it('should define each tier with its exact expression, group, severity, for and runbook', () => {
    const actual = Object.fromEntries(
      tierUids.map((uid) => {
        const { group, rule } = located(uid);
        return [
          uid,
          {
            group: group.title,
            severity: rule.labels['severity'],
            for: rule.for,
            runbook: rule.annotations['runbook_url'],
            expr: conditionOf(rule),
          },
        ];
      }),
    );

    expect(actual).toEqual(tiers);
  });

  it('should route each tier like the other billing rules and stay OK on missing or failing data', () => {
    for (const uid of tierUids) {
      const { rule } = located(uid);

      expect(rule.labels, uid).toEqual(
        expect.objectContaining({ severity: tiers[uid].severity, service: 'tau-api', component: 'billing' }),
      );
      expect({ noDataState: rule.noDataState, execErrState: rule.execErrState }, uid).toEqual({
        noDataState: 'OK',
        execErrState: 'OK',
      });
      expect(
        rule.data.map(({ datasourceUid }) => datasourceUid),
        uid,
      ).toEqual(['prometheus']);
      // The summary names the operator's first command.
      expect(rule.annotations['summary'], uid).toContain('list-cases');
    }
  });

  it('should send the bookkeeping tier as a daily digest and leave the other tiers on the default repeat', () => {
    expect(
      Object.fromEntries(tierUids.map((uid) => [uid, located(uid).rule.labels['repeat_interval'] ?? 'default'])),
    ).toEqual({
      'billing-case-unattributed': 'default',
      'billing-account-spend-blocked': 'default',
      'billing-owed-stale-2h': 'default',
      'billing-owed-overdue-24h': 'default',
      'billing-books-overdue-24h': '24h',
    });
  });

  it('should keep each tier UID distinct within the 20 characters hosted provisioning keeps', () => {
    expect(tierUids.map((uid) => uid.slice(0, 20))).toEqual([
      'billing-case-unattri',
      'billing-account-spen',
      'billing-owed-stale-2',
      'billing-owed-overdue',
      'billing-books-overdu',
    ]);
  });

  it('should parse every rule that reads the financial-case gauges in the offline oracle', () => {
    const readers = groups
      .flatMap(({ rules }) => rules)
      .filter((rule) => rule.data.some(({ model }) => model.expr?.includes('tau_billing_open_financial_case')))
      .map((rule) => rule.uid)
      .toSorted();

    expect(readers).toEqual([...tierUids, 'billing-supplier-invoice-mismatch'].toSorted());
    for (const uid of readers) {
      expect(() => {
        assertSupported(conditionOf(located(uid).rule));
      }, uid).not.toThrow();
    }
  });
});

describe('U billing-case-unattributed evaluated on synthetic series (W4 A4.1)', () => {
  it('should alert at the first evaluation that sees an unattributed case, without Pending', () => {
    const transitions = simulate('billing-case-unattributed', [
      gauge(cases, { kind: 'missing_local_payment', attributed: 'false' }, { value: 1 }),
    ]);

    expect(changes(transitions)).toEqual([`0s ${instanceOf('missing_local_payment')} Normal→Alerting`]);
  });

  it('should alert for an unattributed case of any kind that can name an account, one instance per kind', () => {
    const transitions = simulate('billing-case-unattributed', [
      gauge(cases, { kind: 'refund_unresolved', attributed: 'false' }, { value: 1 }),
      gauge(cases, { kind: 'dispute_unresolved', attributed: 'false' }, { value: 2 }),
    ]);

    expect(changes(transitions).toSorted()).toEqual(
      [
        `0s ${instanceOf('refund_unresolved')} Normal→Alerting`,
        `0s ${instanceOf('dispute_unresolved')} Normal→Alerting`,
      ].toSorted(),
    );
  });

  it('should leave the kinds that never name an account to the bookkeeping tier and still page foreign cash', () => {
    const transitions = simulate('billing-case-unattributed', [
      gauge(cases, { kind: 'tax_registration_review', attributed: 'false' }, { value: 1 }),
      gauge(cases, { kind: 'supplier_invoice_total_mismatch', attributed: 'false' }, { value: 1 }),
      gauge(cases, { kind: 'missing_local_payment', attributed: 'false' }, { value: 1 }),
    ]);

    expect(changes(transitions)).toEqual([`0s ${instanceOf('missing_local_payment')} Normal→Alerting`]);
  });

  it('should stay Normal on a zero unattributed count beside attributed cases', () => {
    const transitions = simulate('billing-case-unattributed', [
      gauge(cases, { kind: 'missing_local_payment', attributed: 'false' }, { value: 0 }),
      gauge(cases, { kind: 'missing_local_payment', attributed: 'true' }, { value: 5 }),
    ]);

    expect(transitions).toEqual([]);
  });

  it("should ignore another environment's unattributed case", () => {
    const transitions = simulate('billing-case-unattributed', [
      gauge(cases, { kind: 'missing_local_payment', attributed: 'false', app: otherApp }, { value: 1 }),
    ]);

    expect(transitions).toEqual([]);
  });

  it('should resolve once the case is closed and the gauge reads zero again', () => {
    const transitions = simulate('billing-case-unattributed', [
      gauge(cases, { kind: 'missing_local_payment', attributed: 'false' }, { value: 1, to: opened + hour }),
    ]);

    expect(changes(transitions)).toEqual([
      `0s ${instanceOf('missing_local_payment')} Normal→Alerting`,
      `3600s ${instanceOf('missing_local_payment')} Alerting→Normal`,
    ]);
  });
});

describe('T1 billing-account-spend-blocked evaluated on synthetic series (W4 A4.2)', () => {
  it('should page 15 minutes after a named spend-blocking case opens', () => {
    const transitions = simulate('billing-account-spend-blocked', [
      gauge(cases, { kind: 'dispute_unresolved', attributed: 'true' }, { value: 1 }),
    ]);

    expect(changes(transitions)).toEqual([
      `0s ${instanceOf('dispute_unresolved')} Normal→Pending`,
      `900s ${instanceOf('dispute_unresolved')} Pending→Alerting`,
    ]);
  });

  it('should match the journal kinds by prefix', () => {
    const transitions = simulate('billing-account-spend-blocked', [
      gauge(cases, { kind: 'journal_unbalanced', attributed: 'true' }, { value: 1 }),
    ]);

    expect(transitions.map(({ to }) => to)).toEqual(['Pending', 'Alerting']);
  });

  it('should never page for a named case resolved within 10 minutes', () => {
    const transitions = simulate('billing-account-spend-blocked', [
      gauge(cases, { kind: 'dispute_unresolved', attributed: 'true' }, { value: 1, to: opened + 10 * minute }),
    ]);

    expect(changes(transitions)).toEqual([
      `0s ${instanceOf('dispute_unresolved')} Normal→Pending`,
      `600s ${instanceOf('dispute_unresolved')} Pending→Normal`,
    ]);
  });

  it('should leave an unattributed spend-blocking case to the unattributed tier', () => {
    const transitions = simulate('billing-account-spend-blocked', [
      gauge(cases, { kind: 'dispute_unresolved', attributed: 'false' }, { value: 1 }),
    ]);

    expect(transitions).toEqual([]);
  });

  it('should ignore a named case of a kind that never blocks spending', () => {
    const transitions = simulate('billing-account-spend-blocked', [
      gauge(cases, { kind: 'missing_local_payment', attributed: 'true' }, { value: 1 }),
    ]);

    expect(transitions).toEqual([]);
  });
});

describe('T2 owed-customer age rules evaluated on synthetic series (W4 A4.3, A4.4)', () => {
  it('should warn once a named owed case is older than 2 h', () => {
    const transitions = simulate('billing-owed-stale-2h', [
      gauge(age, { kind: 'paid_unfulfilled_recovery', attributed: 'true' }, { value: 7260 }),
    ]);

    expect(changes(transitions)).toEqual([`0s ${instanceOf('paid_unfulfilled_recovery')} Normal→Alerting`]);
  });

  it('should not warn for an owed case younger than 2 h or a bookkeeping case of any age', () => {
    const transitions = simulate('billing-owed-stale-2h', [
      gauge(age, { kind: 'missing_local_payment', attributed: 'true' }, { value: 7140 }),
      gauge(age, { kind: 'gross_fee_net_mismatch', attributed: 'true' }, { value: 90_000 }),
    ]);

    expect(transitions).toEqual([]);
  });

  it('should leave an unattributed owed case to the unattributed tier', () => {
    const transitions = simulate('billing-owed-stale-2h', [
      gauge(age, { kind: 'missing_local_payment', attributed: 'false' }, { value: 90_000 }),
    ]);

    expect(transitions).toEqual([]);
  });

  it('should page once a named owed case is older than 24 h', () => {
    const transitions = simulate('billing-owed-overdue-24h', [
      gauge(age, { kind: 'unfulfilled_purchase_obligation', attributed: 'true' }, { value: 86_460 }),
    ]);

    expect(changes(transitions)).toEqual([`0s ${instanceOf('unfulfilled_purchase_obligation')} Normal→Alerting`]);
  });

  it('should not page for a named owed case just under 24 h', () => {
    const transitions = simulate('billing-owed-overdue-24h', [
      gauge(age, { kind: 'missing_local_payment', attributed: 'true' }, { value: 86_340 }),
    ]);

    expect(transitions).toEqual([]);
  });
});

describe('T3 billing-books-overdue-24h evaluated on synthetic series (W4 A4.5)', () => {
  it('should warn for a bookkeeping case older than 24 h whatever its attribution', () => {
    const transitions = simulate('billing-books-overdue-24h', [
      gauge(age, { kind: 'tax_registration_review', attributed: 'false' }, { value: 90_000 }),
      gauge(age, { kind: 'supplier_invoice_total_mismatch', attributed: 'true' }, { value: 90_000 }),
    ]);

    expect(changes(transitions).toSorted()).toEqual(
      [
        `0s ${instanceOf('tax_registration_review')} Normal→Alerting`,
        `0s ${instanceOf('supplier_invoice_total_mismatch')} Normal→Alerting`,
      ].toSorted(),
    );
  });

  it('should not warn for a young bookkeeping case or an old owed case', () => {
    const transitions = simulate('billing-books-overdue-24h', [
      gauge(age, { kind: 'tax_registration_review', attributed: 'false' }, { value: 3600 }),
      gauge(age, { kind: 'missing_local_payment', attributed: 'false' }, { value: 90_000 }),
    ]);

    expect(transitions).toEqual([]);
  });
});

type Panel = Readonly<{ title?: string; targets?: ReadonlyArray<Readonly<{ expr?: string }>> }>;
const billingPanels = (
  JSON.parse(readFileSync(path.join(grafanaRoot, 'dashboards/billing.json'), 'utf8')) as { panels: Panel[] }
).panels;

/** The single query of a panel, as checked in. */
const panelExpr = (title: string): string => {
  const found = billingPanels.filter((panel) => panel.title === title);
  expect(found, title).toHaveLength(1);
  const exprs = (found[0]!.targets ?? []).map(({ expr }) => expr ?? '');
  expect(exprs, title).toHaveLength(1);
  return exprs[0]!;
};

describe('Billing dashboard financial-case panels evaluated on synthetic series (W4 A4.8)', () => {
  const caseTitles = ['Open Financial Cases', 'Open Financial Cases by Kind', 'Unattributed Open Cases by Kind'];
  /** Two Machines export the same hourly figure, so each pair is read once, then the two attribution values add. */
  const store = new SeriesStore(
    ['machine-1', 'machine-2'].flatMap((instance) => [
      gauge(cases, { kind: 'missing_local_payment', attributed: 'false', instance }, { value: 3 }),
      gauge(cases, { kind: 'missing_local_payment', attributed: 'true', instance }, { value: 2 }),
      gauge(cases, { kind: 'dispute_unresolved', attributed: 'true', instance }, { value: 1 }),
      gauge(cases, { kind: 'tax_registration_review', attributed: 'false', instance }, { value: 0 }),
      gauge(cases, { kind: 'missing_local_payment', attributed: 'false', app: otherApp, instance }, { value: 7 }),
    ]),
  );
  const at = opened + 30 * minute;
  const query = (title: string) =>
    store
      .query(panelExpr(title).replaceAll('$app', boundApp), at)
      .toSorted((left, right) => (left.labels['kind'] ?? '').localeCompare(right.labels['kind'] ?? ''));

  it('should keep every financial-case panel bound to the app variable and the API service', () => {
    for (const title of caseTitles) {
      expect(panelExpr(title), title).toContain('{app=~"$app",service_name="tau-api"');
      expect(() => {
        assertSupported(panelExpr(title).replaceAll('$app', boundApp));
      }, title).not.toThrow();
    }
  });

  it('should count open cases of both attribution values once each in the total', () => {
    expect(query('Open Financial Cases')).toEqual([{ labels: {}, value: 6 }]);
  });

  it('should count open cases per kind across both attribution values', () => {
    expect(query('Open Financial Cases by Kind')).toEqual([
      { labels: { kind: 'dispute_unresolved' }, value: 1 },
      { labels: { kind: 'missing_local_payment' }, value: 5 },
      { labels: { kind: 'tax_registration_review' }, value: 0 },
    ]);
  });

  it('should show only the unattributed cases per kind', () => {
    expect(query('Unattributed Open Cases by Kind')).toEqual([
      { labels: { kind: 'missing_local_payment' }, value: 3 },
      { labels: { kind: 'tax_registration_review' }, value: 0 },
    ]);
  });
});
