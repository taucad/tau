/**
 * A test oracle for Tau's runtime alert rules and dashboard panels (package.md T13): a small PromQL evaluator and a
 * Grafana alert state machine, so `src/runtime-rule-evaluation.test.ts` can run the checked-in expressions against
 * synthetic series and assert numbers and state transitions offline.
 *
 * No PromQL engine is in the dependency tree and `promtool` is not pinned by any repository mechanism, so this module
 * implements only the expression shapes `infra/grafana` uses, and refuses anything else at parse time:
 *
 * - Selectors with `=`, `!=`, `=~` and `!~` (fully anchored RE2-style regexes), a 5-minute lookback for instant
 *   selectors, left-open `(t - range, t]` range windows and `[range:step]` subqueries aligned to absolute multiples
 *   of the step, as Prometheus 3 evaluates them.
 * - `rate` and `increase` with Prometheus' counter-reset correction and extrapolation (`extrapolatedRate` in
 *   `promql/functions.go`), `avg_over_time`, `absent_over_time`, `histogram_quantile` (classic buckets, with
 *   `bucketQuantile`'s monotonicity fix and `+Inf` handling), `vector`, `clamp_max` and `resets`.
 * - `sum`, `max`, `min`, `avg`, `count` with a prefix `by (…)`, and `topk`.
 * - Arithmetic and filtering comparisons between scalars and vectors, one-to-one and `group_left` vector matching with
 *   `on`/`ignoring`, and the set operators `and`, `or` and `unless`, with Prometheus' precedence.
 *
 * Alert state follows Grafana 11's state manager for a rule whose condition is a single instant Prometheus query (Tau
 * Cloud's renderer forces `instant = true` on such queries): a non-zero value is firing; `for` holds an instance in
 * Pending until it has been firing that long; an empty result is NoData, which `noDataState: "OK"` maps to Normal for
 * every existing instance; and an instance missing from a non-empty result is resolved as stale (MissingSeries) once
 * it has been missing for two evaluation intervals.
 */

/** One series' labels, including `__name__`. */
export type Labels = Readonly<Record<string, string>>;

/** One sample: seconds since an arbitrary epoch, and the value. */
export type Sample = readonly [t: number, value: number];

/** One stored series; samples ascend by time. */
export type Series = Readonly<{ labels: Labels; samples: readonly Sample[] }>;

/** One instant-vector element. */
export type Element = Readonly<{ labels: Labels; value: number }>;

type RangeElement = Readonly<{ labels: Labels; samples: readonly Sample[] }>;

type Value =
  | Readonly<{ kind: 'scalar'; value: number }>
  | Readonly<{ kind: 'vector'; elements: readonly Element[] }>
  | Readonly<{ kind: 'matrix'; series: readonly RangeElement[] }>;

type Matcher = Readonly<{ label: string; op: '=' | '!=' | '=~' | '!~'; value: string }>;

type VectorMatching = Readonly<{
  on: boolean;
  labels: readonly string[];
  group: 'left' | 'right' | undefined;
  include: readonly string[];
}>;

type Node =
  | Readonly<{ type: 'number'; value: number }>
  | Readonly<{ type: 'selector'; matchers: readonly Matcher[] }>
  | Readonly<{ type: 'range'; inner: Node; range: number; step: number | undefined }>
  | Readonly<{ type: 'call'; name: string; args: readonly Node[] }>
  | Readonly<{
      type: 'aggregate';
      op: string;
      by: readonly string[] | undefined;
      parameter: Node | undefined;
      expr: Node;
    }>
  | Readonly<{
      type: 'binary';
      op: string;
      lhs: Node;
      rhs: Node;
      returnBool: boolean;
      matching: VectorMatching | undefined;
    }>
  | Readonly<{ type: 'negate'; expr: Node }>;

/** Prometheus' default instant-selector lookback. */
const lookbackSeconds = 300;

const aggregations = new Set(['sum', 'max', 'min', 'avg', 'count', 'topk']);
const functions = new Set([
  'rate',
  'increase',
  'avg_over_time',
  'absent_over_time',
  'histogram_quantile',
  'vector',
  'clamp_max',
  'resets',
]);
const comparisons = new Set(['==', '!=', '>', '<', '>=', '<=']);
const setOperators = new Set(['and', 'or', 'unless']);
const durationUnits: Readonly<Record<string, number>> = { s: 1, m: 60, h: 3600, d: 86_400, w: 604_800 };

/**
 * Parse a duration such as `15m` or `7d`.
 *
 * @param text - The duration literal.
 * @returns Seconds.
 */
export const parseDuration = (text: string): number => {
  let total = 0;
  let rest = text;
  while (rest.length > 0) {
    const match = /^(?<count>\d+)(?<unit>[smhdw])/u.exec(rest);
    if (!match?.groups) {
      throw new Error(`unsupported duration ${text}`);
    }
    total += Number(match.groups['count']) * durationUnits[match.groups['unit']!]!;
    rest = rest.slice(match[0].length);
  }
  return total;
};

// --- Tokenizer ---

type Token = Readonly<{ kind: 'number' | 'string' | 'ident' | 'duration' | 'op'; text: string }>;

const tokenPatterns: ReadonlyArray<readonly [Token['kind'] | 'space', RegExp]> = [
  ['space', /^\s+/u],
  ['string', /^"(?:[^"\\]|\\.)*"/u],
  ['duration', /^(?:\d+[smhdw])+(?![\w.])/u],
  ['number', /^(?:\d+(?:\.\d*)?|\.\d+)(?:e[+-]?\d+)?/iu],
  ['ident', /^[A-Za-z_][\w:]*/u],
  ['op', /^(?:=~|!~|!=|==|>=|<=|[=><+\-*/%^(){}[\],:])/u],
];

const nextToken = (rest: string): readonly [Token['kind'] | 'space', string] => {
  for (const [kind, pattern] of tokenPatterns) {
    const text = pattern.exec(rest)?.[0];
    if (text) {
      return [kind, text];
    }
  }
  throw new Error(`cannot tokenize at ${JSON.stringify(rest.slice(0, 20))}`);
};

const tokenize = (expression: string): Token[] => {
  const tokens: Token[] = [];
  let rest = expression;
  while (rest.length > 0) {
    const [kind, text] = nextToken(rest);
    if (kind !== 'space') {
      tokens.push({ kind, text });
    }
    rest = rest.slice(text.length);
  }
  return tokens;
};

// --- Parser ---

class Parser {
  private index = 0;
  // oxlint-disable-next-line @typescript-eslint/parameter-properties -- erasableSyntaxOnly forbids parameter properties
  private readonly tokens: readonly Token[];

  public constructor(tokens: readonly Token[]) {
    this.tokens = tokens;
  }

  public parse(): Node {
    const node = this.parseOr();
    if (this.index !== this.tokens.length) {
      throw new Error(`unexpected ${this.peek()?.text ?? 'end'}`);
    }
    return node;
  }

  private peek(offset = 0): Token | undefined {
    return this.tokens[this.index + offset];
  }

  private next(): Token {
    const token = this.tokens[this.index++];
    if (!token) {
      throw new Error('unexpected end of expression');
    }
    return token;
  }

  private expect(text: string): void {
    const token = this.next();
    if (token.text !== text) {
      throw new Error(`expected ${text}, found ${token.text}`);
    }
  }

  private accept(text: string): boolean {
    if (this.peek()?.text === text) {
      this.index++;
      return true;
    }
    return false;
  }

  private labelList(): string[] {
    this.expect('(');
    const labels: string[] = [];
    while (!this.accept(')')) {
      labels.push(this.next().text);
      this.accept(',');
    }
    return labels;
  }

  private binaryLevel(operators: ReadonlySet<string>, operand: () => Node): Node {
    let lhs = operand();
    while (operators.has(this.peek()?.text ?? '')) {
      const op = this.next().text;
      const returnBool = this.accept('bool');
      let matching: VectorMatching | undefined;
      if (this.peek()?.text === 'on' || this.peek()?.text === 'ignoring') {
        const on = this.next().text === 'on';
        const labels = this.labelList();
        let group: VectorMatching['group'];
        let include: string[] = [];
        if (this.peek()?.text === 'group_left' || this.peek()?.text === 'group_right') {
          group = this.next().text === 'group_left' ? 'left' : 'right';
          include = this.peek()?.text === '(' ? this.labelList() : [];
        }
        matching = { on, labels, group, include };
      }
      lhs = { type: 'binary', op, lhs, rhs: operand(), returnBool, matching };
    }
    return lhs;
  }

  private parseOr(): Node {
    return this.binaryLevel(new Set(['or']), () => this.parseAnd());
  }

  private parseAnd(): Node {
    return this.binaryLevel(new Set(['and', 'unless']), () => this.parseComparison());
  }

  private parseComparison(): Node {
    return this.binaryLevel(comparisons, () => this.parseAdditive());
  }

  private parseAdditive(): Node {
    return this.binaryLevel(new Set(['+', '-']), () => this.parseMultiplicative());
  }

  private parseMultiplicative(): Node {
    return this.binaryLevel(new Set(['*', '/', '%']), () => this.parseUnary());
  }

  private parseUnary(): Node {
    if (this.accept('-')) {
      return { type: 'negate', expr: this.parseUnary() };
    }
    return this.parsePostfix();
  }

  private parsePostfix(): Node {
    const inner = this.parsePrimary();
    if (!this.accept('[')) {
      return inner;
    }
    const range = parseDuration(this.next().text);
    let step: number | undefined;
    if (this.accept(':')) {
      step = parseDuration(this.next().text);
    } else if (inner.type !== 'selector') {
      throw new Error('a range needs a selector; write [range:step] for a subquery');
    }
    this.expect(']');
    return { type: 'range', inner, range, step };
  }

  private parseMatchers(name: string | undefined): Matcher[] {
    const matchers: Matcher[] = name === undefined ? [] : [{ label: '__name__', op: '=', value: name }];
    this.expect('{');
    while (!this.accept('}')) {
      const label = this.next().text;
      const op = this.next().text;
      if (op !== '=' && op !== '!=' && op !== '=~' && op !== '!~') {
        throw new Error(`unsupported matcher operator ${op}`);
      }
      const value = this.next();
      if (value.kind !== 'string') {
        throw new Error(`matcher ${label} needs a string`);
      }
      matchers.push({ label, op, value: JSON.parse(value.text) as string });
      this.accept(',');
    }
    return matchers;
  }

  private parseAggregation(op: string): Node {
    const by = this.accept('by') ? this.labelList() : undefined;
    if (this.peek()?.text === 'without') {
      throw new Error('without (…) is not supported');
    }
    this.expect('(');
    const parameter = op === 'topk' ? this.parseOr() : undefined;
    if (parameter) {
      this.expect(',');
    }
    const expr = this.parseOr();
    this.expect(')');
    if (this.peek()?.text === 'by' || this.peek()?.text === 'without') {
      throw new Error('postfix by/without is not supported');
    }
    return { type: 'aggregate', op, by, parameter, expr };
  }

  private parsePrimary(): Node {
    const token = this.next();
    if (token.kind === 'number') {
      return { type: 'number', value: Number(token.text) };
    }
    if (token.text === '(') {
      const inner = this.parseOr();
      this.expect(')');
      return inner;
    }
    if (token.text === '{') {
      this.index--;
      return { type: 'selector', matchers: this.parseMatchers(undefined) };
    }
    if (token.kind !== 'ident') {
      throw new Error(`unexpected ${token.text}`);
    }
    if (aggregations.has(token.text)) {
      return this.parseAggregation(token.text);
    }
    if (this.peek()?.text === '(') {
      if (!functions.has(token.text)) {
        throw new Error(`unsupported function ${token.text}`);
      }
      this.expect('(');
      const args: Node[] = [];
      while (!this.accept(')')) {
        args.push(this.parseOr());
        this.accept(',');
      }
      return { type: 'call', name: token.text, args };
    }
    if (this.peek()?.text === '{') {
      return { type: 'selector', matchers: this.parseMatchers(token.text) };
    }
    return { type: 'selector', matchers: [{ label: '__name__', op: '=', value: token.text }] };
  }
}

/**
 * Parse a PromQL expression of the supported shapes.
 *
 * @param expression - The PromQL text, with dashboard variables already substituted.
 * @returns The syntax tree.
 */
const parse = (expression: string): Node => new Parser(tokenize(expression)).parse();

// --- Evaluation ---

const labelKey = (labels: Labels): string =>
  JSON.stringify(Object.entries(labels).toSorted(([left], [right]) => left.localeCompare(right)));

const withoutName = (labels: Labels): Labels => {
  const { __name__: _name, ...rest } = labels;
  return rest;
};

/**
 * The samples with `after < t <= until`, by binary search over ascending samples.
 */
const between = (samples: readonly Sample[], after: number, until: number): readonly Sample[] => {
  const bound = (time: number): number => {
    let low = 0;
    let high = samples.length;
    while (low < high) {
      const middle = Math.floor((low + high) / 2);
      if (samples[middle]![0] <= time) {
        low = middle + 1;
      } else {
        high = middle;
      }
    }
    return low;
  };
  return samples.slice(bound(after), bound(until));
};

const matches = (labels: Labels, { label, op, value }: Matcher): boolean => {
  const actual = labels[label] ?? '';
  switch (op) {
    case '=': {
      return actual === value;
    }
    case '!=': {
      return actual !== value;
    }
    case '=~': {
      return new RegExp(`^(?:${value})$`, 'u').test(actual);
    }
    case '!~': {
      return !new RegExp(`^(?:${value})$`, 'u').test(actual);
    }
  }
};

/** Prometheus' `extrapolatedRate` for counters (Prometheus 3), before `rate` divides by the range. */
const extrapolatedIncrease = (samples: readonly Sample[], start: number, end: number): number | undefined => {
  if (samples.length < 2) {
    return undefined;
  }
  const [firstT, firstV] = samples[0]!;
  const [lastT, lastV] = samples.at(-1)!;
  let result = lastV - firstV;
  for (let index = 1; index < samples.length; index++) {
    if (samples[index]![1] < samples[index - 1]![1]) {
      result += samples[index - 1]![1];
    }
  }
  const sampled = lastT - firstT;
  const average = sampled / (samples.length - 1);
  const threshold = average * 1.1;
  let toStart = firstT - start;
  let toEnd = end - lastT;
  if (toStart >= threshold) {
    toStart = average / 2;
  }
  if (result > 0 && firstV >= 0) {
    toStart = Math.min(toStart, sampled * (firstV / result));
  }
  if (toEnd >= threshold) {
    toEnd = average / 2;
  }
  return (result * (sampled + toStart + toEnd)) / sampled;
};

/** Prometheus' `bucketQuantile` over classic buckets. */
const bucketQuantile = (quantile: number, buckets: Array<readonly [upper: number, count: number]>): number => {
  if (Number.isNaN(quantile) || quantile < 0) {
    return Number.NEGATIVE_INFINITY;
  }
  if (quantile > 1) {
    return Number.POSITIVE_INFINITY;
  }
  buckets.sort(([left], [right]) => left - right);
  if (buckets.length < 2 || buckets.at(-1)![0] !== Number.POSITIVE_INFINITY) {
    return Number.NaN;
  }
  for (let index = 1; index < buckets.length; index++) {
    if (buckets[index]![1] < buckets[index - 1]![1]) {
      buckets[index] = [buckets[index]![0], buckets[index - 1]![1]];
    }
  }
  const total = buckets.at(-1)![1];
  if (total === 0) {
    return Number.NaN;
  }
  const rank = quantile * total;
  const bucket = buckets.findIndex(([, count]) => count >= rank);
  if (bucket === buckets.length - 1) {
    return buckets.at(-2)![0];
  }
  if (bucket === 0 && buckets[0]![0] <= 0) {
    return buckets[0]![0];
  }
  const [upper, count] = buckets[bucket]!;
  const [lower, below] = bucket === 0 ? [0, 0] : buckets[bucket - 1]!;
  return lower + (upper - lower) * ((rank - below) / (count - below));
};

const compare = (op: string, left: number, right: number): boolean => {
  switch (op) {
    case '==': {
      return left === right;
    }
    case '!=': {
      return left !== right;
    }
    case '>': {
      return left > right;
    }
    case '<': {
      return left < right;
    }
    case '>=': {
      return left >= right;
    }
    case '<=': {
      return left <= right;
    }
    default: {
      throw new Error(`not a comparison: ${op}`);
    }
  }
};

const arithmetic = (op: string, left: number, right: number): number => {
  switch (op) {
    case '+': {
      return left + right;
    }
    case '-': {
      return left - right;
    }
    case '*': {
      return left * right;
    }
    case '/': {
      return left / right;
    }
    case '%': {
      return left % right;
    }
    default: {
      throw new Error(`not arithmetic: ${op}`);
    }
  }
};

/** A store of synthetic series that evaluates PromQL at an instant. */
export class SeriesStore {
  private readonly series: Series[];

  /**
   * @param series - The stored series; their samples must ascend by time.
   */
  public constructor(series: readonly Series[]) {
    this.series = [...series];
  }

  /**
   * Evaluate an expression at one instant, as an instant query.
   *
   * @param expression - The PromQL text.
   * @param time - The evaluation time, in seconds.
   * @returns The instant vector (a scalar result becomes one label-less element).
   */
  public query(expression: string, time: number): Element[] {
    const value = this.evaluate(parse(expression), time);
    if (value.kind === 'matrix') {
      throw new Error('an instant query cannot return a range vector');
    }
    return value.kind === 'scalar' ? [{ labels: {}, value: value.value }] : [...value.elements];
  }

  private select(matchers: readonly Matcher[]): Series[] {
    return this.series.filter((series) => matchers.every((matcher) => matches(series.labels, matcher)));
  }

  private evaluate(node: Node, time: number): Value {
    switch (node.type) {
      case 'number': {
        return { kind: 'scalar', value: node.value };
      }
      case 'negate': {
        const inner = this.evaluate(node.expr, time);
        if (inner.kind === 'scalar') {
          return { kind: 'scalar', value: -inner.value };
        }
        return {
          kind: 'vector',
          elements: this.vector(inner).map(({ labels, value }) => ({ labels: withoutName(labels), value: -value })),
        };
      }
      case 'selector': {
        return {
          kind: 'vector',
          elements: this.select(node.matchers).flatMap(({ labels, samples }) => {
            const latest = between(samples, time - lookbackSeconds, time).at(-1);
            return latest ? [{ labels, value: latest[1] }] : [];
          }),
        };
      }
      case 'range': {
        return { kind: 'matrix', series: this.range(node, time) };
      }
      case 'call': {
        return this.call(node, time);
      }
      case 'aggregate': {
        return this.aggregate(node, time);
      }
      case 'binary': {
        return this.binary(node, time);
      }
    }
  }

  private range(node: Extract<Node, { type: 'range' }>, time: number): RangeElement[] {
    if (node.step === undefined) {
      if (node.inner.type !== 'selector') {
        throw new Error('a range needs a selector');
      }
      return this.select(node.inner.matchers)
        .map(({ labels, samples }) => ({
          labels,
          samples: between(samples, time - node.range, time),
        }))
        .filter(({ samples }) => samples.length > 0);
    }
    const grouped = new Map<string, { labels: Labels; samples: Sample[] }>();
    const first = Math.floor((time - node.range) / node.step) * node.step + node.step;
    for (let step = first; step <= time; step += node.step) {
      for (const { labels, value } of this.vector(this.evaluate(node.inner, step))) {
        const key = labelKey(labels);
        const entry = grouped.get(key) ?? { labels, samples: [] };
        entry.samples.push([step, value]);
        grouped.set(key, entry);
      }
    }
    return [...grouped.values()];
  }

  private vector(value: Value): readonly Element[] {
    if (value.kind !== 'vector') {
      throw new Error(`expected an instant vector, got a ${value.kind}`);
    }
    return value.elements;
  }

  private matrix(value: Value): readonly RangeElement[] {
    if (value.kind !== 'matrix') {
      throw new Error(`expected a range vector, got a ${value.kind}`);
    }
    return value.series;
  }

  private scalar(value: Value): number {
    if (value.kind !== 'scalar') {
      throw new Error(`expected a scalar, got a ${value.kind}`);
    }
    return value.value;
  }

  private call(node: Extract<Node, { type: 'call' }>, time: number): Value {
    const [first, second] = node.args;
    const perSeries = (reduce: (samples: readonly Sample[], start: number) => number | undefined): Value => {
      if (first?.type !== 'range') {
        throw new Error(`${node.name} needs a range`);
      }
      return {
        kind: 'vector',
        elements: this.matrix(this.evaluate(first, time)).flatMap(({ labels, samples }) => {
          const value = reduce(samples, time - first.range);
          return value === undefined ? [] : [{ labels: withoutName(labels), value }];
        }),
      };
    };
    switch (node.name) {
      case 'rate':
      case 'increase': {
        return perSeries((samples, start) => {
          const increase = extrapolatedIncrease(samples, start, time);
          return increase === undefined || node.name === 'increase' ? increase : increase / (time - start);
        });
      }
      case 'resets': {
        return perSeries(
          (samples) => samples.filter(([, value], index) => index > 0 && value < samples[index - 1]![1]).length,
        );
      }
      case 'avg_over_time': {
        return perSeries((samples) => samples.reduce((total, [, value]) => total + value, 0) / samples.length);
      }
      case 'absent_over_time': {
        if (first?.type !== 'range' || first.inner.type !== 'selector') {
          throw new Error('absent_over_time needs a range selector');
        }
        if (this.matrix(this.evaluate(first, time)).length > 0) {
          return { kind: 'vector', elements: [] };
        }
        const labels = Object.fromEntries(
          first.inner.matchers
            .filter(({ label, op }) => op === '=' && label !== '__name__')
            .map(({ label, value }) => [label, value]),
        );
        return { kind: 'vector', elements: [{ labels, value: 1 }] };
      }
      case 'vector': {
        return { kind: 'vector', elements: [{ labels: {}, value: this.scalar(this.evaluate(first!, time)) }] };
      }
      case 'clamp_max': {
        const ceiling = this.scalar(this.evaluate(second!, time));
        return {
          kind: 'vector',
          elements: this.vector(this.evaluate(first!, time)).map(({ labels, value }) => ({
            labels: withoutName(labels),
            value: Math.min(value, ceiling),
          })),
        };
      }
      case 'histogram_quantile': {
        const quantile = this.scalar(this.evaluate(first!, time));
        const groups = new Map<string, { labels: Labels; buckets: Array<readonly [number, number]> }>();
        for (const { labels, value } of this.vector(this.evaluate(second!, time))) {
          const { le, ...rest } = withoutName(labels);
          if (le === undefined) {
            continue;
          }
          const key = labelKey(rest);
          const group = groups.get(key) ?? { labels: rest, buckets: [] };
          group.buckets.push([le === '+Inf' ? Number.POSITIVE_INFINITY : Number(le), value]);
          groups.set(key, group);
        }
        return {
          kind: 'vector',
          elements: [...groups.values()].map(({ labels, buckets }) => ({
            labels,
            value: bucketQuantile(quantile, buckets),
          })),
        };
      }
      default: {
        throw new Error(`unsupported function ${node.name}`);
      }
    }
  }

  private aggregate(node: Extract<Node, { type: 'aggregate' }>, time: number): Value {
    const elements = this.vector(this.evaluate(node.expr, time));
    const groups = new Map<string, { labels: Labels; members: Element[] }>();
    for (const element of elements) {
      const labels: Labels = Object.fromEntries(
        (node.by ?? []).flatMap((label) =>
          element.labels[label] === undefined ? [] : [[label, element.labels[label]]],
        ),
      );
      const key = labelKey(labels);
      const group = groups.get(key) ?? { labels, members: [] };
      group.members.push(element);
      groups.set(key, group);
    }
    if (node.op === 'topk') {
      const count = this.scalar(this.evaluate(node.parameter!, time));
      return {
        kind: 'vector',
        elements: [...groups.values()].flatMap(({ members }) =>
          members.toSorted((left, right) => right.value - left.value).slice(0, count),
        ),
      };
    }
    const reduce = (values: readonly number[]): number => {
      switch (node.op) {
        case 'sum': {
          return values.reduce((total, value) => total + value, 0);
        }
        case 'max': {
          return Math.max(...values);
        }
        case 'min': {
          return Math.min(...values);
        }
        case 'avg': {
          return values.reduce((total, value) => total + value, 0) / values.length;
        }
        default: {
          return values.length;
        }
      }
    };
    return {
      kind: 'vector',
      elements: [...groups.values()].map(({ labels, members }) => ({
        labels,
        value: reduce(members.map(({ value }) => value)),
      })),
    };
  }

  private binary(node: Extract<Node, { type: 'binary' }>, time: number): Value {
    const lhs = this.evaluate(node.lhs, time);
    const rhs = this.evaluate(node.rhs, time);
    const isComparison = comparisons.has(node.op);
    const apply = (left: number, right: number): number | undefined => {
      if (!isComparison) {
        return arithmetic(node.op, left, right);
      }
      const holds = compare(node.op, left, right);
      if (node.returnBool) {
        return holds ? 1 : 0;
      }
      return holds ? left : undefined;
    };
    if (lhs.kind === 'scalar' && rhs.kind === 'scalar') {
      return { kind: 'scalar', value: apply(lhs.value, rhs.value) ?? Number.NaN };
    }
    if (lhs.kind === 'scalar' || rhs.kind === 'scalar') {
      const vectorOnLeft = rhs.kind === 'scalar';
      const scalarValue = this.scalar(vectorOnLeft ? rhs : lhs);
      const elements = this.vector(vectorOnLeft ? lhs : rhs).flatMap(({ labels, value }) => {
        const result = vectorOnLeft ? apply(value, scalarValue) : apply(scalarValue, value);
        if (result === undefined) {
          return [];
        }
        // A filtering comparison keeps the vector's sample, whichever side it is on.
        const kept = isComparison && !node.returnBool ? value : result;
        return [{ labels: isComparison && !node.returnBool ? labels : withoutName(labels), value: kept }];
      });
      return { kind: 'vector', elements };
    }
    const left = this.vector(lhs);
    const right = this.vector(rhs);
    const signature = (labels: Labels): string => {
      const { matching } = node;
      const kept = Object.fromEntries(
        Object.entries(withoutName(labels)).filter(([label]) =>
          matching?.on ? matching.labels.includes(label) : !(matching?.labels ?? []).includes(label),
        ),
      );
      return labelKey(kept);
    };
    if (setOperators.has(node.op)) {
      const rightSignatures = new Set(right.map(({ labels }) => signature(labels)));
      if (node.op === 'and') {
        return { kind: 'vector', elements: left.filter(({ labels }) => rightSignatures.has(signature(labels))) };
      }
      if (node.op === 'unless') {
        return { kind: 'vector', elements: left.filter(({ labels }) => !rightSignatures.has(signature(labels))) };
      }
      const leftSignatures = new Set(left.map(({ labels }) => signature(labels)));
      return {
        kind: 'vector',
        elements: [...left, ...right.filter(({ labels }) => !leftSignatures.has(signature(labels)))],
      };
    }
    if (node.matching?.group === 'right') {
      throw new Error('group_right is not supported');
    }
    const oneSide = new Map<string, Element>();
    for (const element of right) {
      const key = signature(element.labels);
      if (oneSide.has(key)) {
        throw new Error(`many-to-many matching on the right-hand side for ${key}`);
      }
      oneSide.set(key, element);
    }
    const seen = new Set<string>();
    const elements = left.flatMap((element) => {
      const key = signature(element.labels);
      const match = oneSide.get(key);
      if (!match) {
        return [];
      }
      if (node.matching?.group !== 'left') {
        if (seen.has(key)) {
          throw new Error(`many-to-one matching needs group_left for ${key}`);
        }
        seen.add(key);
      }
      const result = apply(element.value, match.value);
      if (result === undefined) {
        return [];
      }
      let labels: Labels = isComparison && !node.returnBool ? element.labels : withoutName(element.labels);
      if (node.matching?.group === 'left') {
        labels = {
          ...labels,
          ...Object.fromEntries(
            node.matching.include.flatMap((label) =>
              match.labels[label] === undefined ? [] : [[label, match.labels[label]]],
            ),
          ),
        };
      } else if (node.matching) {
        const { on, labels: named } = node.matching;
        labels = Object.fromEntries(
          Object.entries(labels).filter(([label]) => (on ? named.includes(label) : !named.includes(label))),
        );
      }
      return [{ labels, value: result }];
    });
    return { kind: 'vector', elements };
  }
}

/**
 * Check that an expression parses with this oracle's supported shapes.
 *
 * @param expression - The PromQL text, with dashboard variables already substituted.
 */
export const assertSupported = (expression: string): void => {
  parse(expression);
};

// --- Grafana alert state ---

/** The parts of a checked-in Grafana rule the state machine reads. */
export type AlertRule = Readonly<{
  expr: string;
  forSeconds: number;
  noDataState: 'OK' | 'NoData' | 'Alerting' | 'KeepLast';
}>;

/** One state change of one alert instance. */
export type Transition = Readonly<{
  at: number;
  instance: string;
  from: 'Normal' | 'Pending' | 'Alerting';
  to: 'Normal' | 'Pending' | 'Alerting';
  reason?: 'NoData' | 'MissingSeries';
}>;

type Instance = { state: 'Pending' | 'Alerting'; activeAt: number; lastSeen: number };

/**
 * Evaluate a rule every `evaluationInterval` seconds over `[from, to]` and return each instance's state changes.
 *
 * @param store - The synthetic series.
 * @param rule - The rule's expression, `for` and `noDataState`.
 * @param window - The first and last evaluation times and the group interval, in seconds.
 * @returns The transitions in order; an instance is named by its labels' key.
 */
export const simulateAlert = (
  store: SeriesStore,
  rule: AlertRule,
  window: Readonly<{ from: number; to: number; evaluationInterval: number }>,
): Transition[] => {
  if (rule.noDataState !== 'OK') {
    throw new Error(`noDataState ${rule.noDataState} is not modelled`);
  }
  const instances = new Map<string, Instance>();
  const transitions: Transition[] = [];
  const resolve = (at: number, instance: string, reason?: Transition['reason']): void => {
    transitions.push({
      at,
      instance,
      from: instances.get(instance)!.state,
      to: 'Normal',
      ...(reason ? { reason } : {}),
    });
    instances.delete(instance);
  };
  for (let at = window.from; at <= window.to; at += window.evaluationInterval) {
    const result = store.query(rule.expr, at);
    if (result.length === 0) {
      for (const key of instances.keys()) {
        resolve(at, key, 'NoData');
      }
      continue;
    }
    const present = new Set<string>();
    for (const { labels, value } of result) {
      if (Number.isNaN(value)) {
        throw new TypeError(`rule condition produced NaN at ${at} for ${labelKey(labels)}`);
      }
      const key = labelKey(labels);
      present.add(key);
      const current = instances.get(key);
      if (value === 0) {
        if (current) {
          resolve(at, key);
        }
        continue;
      }
      if (!current) {
        const state = rule.forSeconds === 0 ? 'Alerting' : 'Pending';
        instances.set(key, { state, activeAt: at, lastSeen: at });
        transitions.push({ at, instance: key, from: 'Normal', to: state });
        continue;
      }
      current.lastSeen = at;
      if (current.state === 'Pending' && at - current.activeAt >= rule.forSeconds) {
        current.state = 'Alerting';
        transitions.push({ at, instance: key, from: 'Pending', to: 'Alerting' });
      }
    }
    for (const [key, instance] of instances) {
      if (!present.has(key) && instance.lastSeen + 2 * window.evaluationInterval <= at) {
        resolve(at, key, 'MissingSeries');
      }
    }
  }
  return transitions;
};
