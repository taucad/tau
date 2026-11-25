// Four tests that each fail their first attempt and pass their retry: over a task's budget of three.
const attempts = new Map<string, number>();

const passOnRetry = (name: string): void => {
  const attempt = (attempts.get(name) ?? 0) + 1;
  attempts.set(name, attempt);
  expect(attempt).toBeGreaterThan(1);
};

describe('four retried passes', () => {
  for (const name of ['first', 'second', 'third', 'fourth']) {
    it(`${name} passes on the retry`, () => {
      passOnRetry(name);
    });
  }
});
